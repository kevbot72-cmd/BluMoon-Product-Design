<?php
/**
 * Shopper uploads: POST /uploads, GET /uploads, GET /uploads/{id}/file.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Rest;

use Blumoon\ProductStudio\Infrastructure\GuestToken;
use Blumoon\ProductStudio\Infrastructure\Image\ImagePipeline;
use Blumoon\ProductStudio\Infrastructure\Image\UploadRejected;
use Blumoon\ProductStudio\Infrastructure\RateLimiter;
use Blumoon\ProductStudio\Infrastructure\Repository\UploadRepository;
use Blumoon\ProductStudio\Infrastructure\Requester;
use Blumoon\ProductStudio\Infrastructure\Settings;
use Blumoon\ProductStudio\Infrastructure\SignedUrls;
use Blumoon\ProductStudio\Infrastructure\Storage;
use WP_Error;
use WP_HTTP_Response;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * Guests may upload too: they are identified by their bps_guest cookie and
 * must send the X-BPS-Request header (a cross-site form cannot), which stops
 * cross-site request forgery. Logged-in shoppers use the REST nonce.
 */
final class UploadsController extends Controller {

	public const CSRF_HEADER  = 'X-BPS-Request';
	private const FILE_MARKER = '__bps_file';

	/**
	 * Constructor.
	 *
	 * @param ImagePipeline    $pipeline Image pipeline.
	 * @param UploadRepository $uploads  Upload rows.
	 * @param Storage          $storage  Private storage.
	 * @param SignedUrls       $urls     Signed URLs.
	 * @param GuestToken       $guests   Guest identity.
	 * @param RateLimiter      $limiter  Rate limiter.
	 * @param Settings         $settings Settings.
	 */
	public function __construct(
		private readonly ImagePipeline $pipeline,
		private readonly UploadRepository $uploads,
		private readonly Storage $storage,
		private readonly SignedUrls $urls,
		private readonly GuestToken $guests,
		private readonly RateLimiter $limiter,
		private readonly Settings $settings
	) {}

	/**
	 * {@inheritDoc}
	 */
	public function registerRoutes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/uploads',
			array(
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'create' ),
					'permission_callback' => array( $this, 'canWrite' ),
					'args'                => array(),
				),
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'index' ),
					'permission_callback' => '__return_true',
					'args'                => array(),
				),
			)
		);
		register_rest_route(
			self::NAMESPACE,
			'/uploads/(?P<id>u_[a-f0-9]{24})/file',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'file' ),
				// The signature in the URL is the authorisation, so <img> tags work without cookies.
				'permission_callback' => '__return_true',
				'args'                => array(
					'variant' => array(
						'type'     => 'string',
						'enum'     => array( 'preview', 'original' ),
						'required' => true,
					),
					'exp'     => array(
						'type'     => 'integer',
						'required' => true,
					),
					'sig'     => array(
						'type'     => 'string',
						'pattern'  => '^[a-f0-9]{64}$',
						'required' => true,
					),
				),
			)
		);
	}

	/**
	 * Mutating requests from guests must carry the CSRF header.
	 *
	 * @param WP_REST_Request<array<string, mixed>> $request Request.
	 */
	public function canWrite( WP_REST_Request $request ): bool|WP_Error {
		if ( is_user_logged_in() || '1' === $request->get_header( self::CSRF_HEADER ) ) {
			return true;
		}
		return new WP_Error( 'bps_forbidden', __( 'You are not allowed to do that.', 'blumoon-product-studio' ), array( 'status' => 403 ) );
	}

	/**
	 * Accept one file in the "file" multipart field.
	 *
	 * @param WP_REST_Request<array<string, mixed>> $request Request.
	 */
	public function create( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$files = $request->get_file_params();
		$file  = $files['file'] ?? null;
		if ( ! is_array( $file ) || UPLOAD_ERR_OK !== (int) ( $file['error'] ?? UPLOAD_ERR_NO_FILE ) || ! is_file( (string) ( $file['tmp_name'] ?? '' ) ) ) {
			return new WP_Error( 'bps_upload_missing', __( 'No file was received. Please try again.', 'blumoon-product-studio' ), array( 'status' => 400 ) );
		}

		$owner = Requester::current( $this->guests, true );
		if ( null === $owner || ! $this->limiter->hit( 'upload', $owner->key(), (int) $this->settings->get( 'advanced.uploadsPerHour' ) ) ) {
			return new WP_Error( 'bps_rate_limited', __( 'You have uploaded a lot of files in a short time. Please wait a little and try again.', 'blumoon-product-studio' ), array( 'status' => 429 ) );
		}

		$dir = $this->storage->newUploadDir();
		try {
			$image = $this->pipeline->process( (string) $file['tmp_name'], $dir );
		} catch ( UploadRejected $e ) {
			$this->storage->removeDir( $dir );
			return new WP_Error( 'bps_upload_' . $e->reason, $e->getMessage(), array( 'status' => 422 ) );
		}

		$publicId = $this->uploads->insert(
			$owner,
			array(
				'kind'          => $image->kind,
				'original_path' => $this->storage->relative( $image->originalPath ),
				'preview_path'  => null === $image->previewPath ? null : $this->storage->relative( $image->previewPath ),
				'mime'          => $image->mime,
				'width'         => $image->width,
				'height'        => $image->height,
				'bytes'         => (int) filesize( $image->originalPath ),
				'sha256'        => (string) hash_file( 'sha256', $image->originalPath ),
			),
			(int) $this->settings->get( 'privacy.retentionDays' )
		);

		$row = $this->uploads->find( $publicId );
		return new WP_REST_Response( null === $row ? array() : $this->present( $row ), 201 );
	}

	/**
	 * The requester's recent uploads ("My uploads").
	 *
	 * @param WP_REST_Request<array<string, mixed>> $request Request.
	 */
	public function index( WP_REST_Request $request ): WP_REST_Response { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.Found -- WP callback signature.
		$owner = Requester::current( $this->guests, false );
		$rows  = null === $owner ? array() : $this->uploads->forOwner( $owner );
		return new WP_REST_Response( array_map( array( $this, 'present' ), $rows ) );
	}

	/**
	 * Resolve a signed file request; the file is streamed by serve().
	 *
	 * @param WP_REST_Request<array<string, mixed>> $request Request.
	 */
	public function file( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$id      = (string) $request['id'];
		$variant = (string) $request['variant'];
		$expires = (int) $request['exp'];
		if ( ! $this->urls->verify( $id, $variant, $expires, (string) $request['sig'] ) ) {
			return new WP_Error( 'bps_bad_signature', __( 'This link has expired.', 'blumoon-product-studio' ), array( 'status' => 403 ) );
		}
		$row = $this->uploads->find( $id );
		if ( null === $row ) {
			return new WP_Error( 'bps_not_found', __( 'File not found.', 'blumoon-product-studio' ), array( 'status' => 404 ) );
		}
		$relative = 'preview' === $variant && null !== $row['preview_path'] ? (string) $row['preview_path'] : (string) $row['original_path'];
		$path     = $this->storage->absolute( $relative );
		if ( null === $path ) {
			return new WP_Error( 'bps_not_found', __( 'File not found.', 'blumoon-product-studio' ), array( 'status' => 404 ) );
		}
		$mime = 'preview' === $variant && null !== $row['preview_path'] ? 'image/webp' : (string) $row['mime'];
		return new WP_REST_Response(
			array(
				self::FILE_MARKER => $path,
				'mime'            => $mime,
				'maxAge'          => max( 0, $expires - time() ),
			)
		);
	}

	/**
	 * Stream a file resolved by file() instead of JSON. Hooked to rest_pre_serve_request.
	 *
	 * @param bool             $served  Whether the request was already served.
	 * @param WP_HTTP_Response $result  Response.
	 */
	public function serve( bool $served, WP_HTTP_Response $result ): bool {
		$data = $result->get_data();
		if ( $served || ! is_array( $data ) || ! isset( $data[ self::FILE_MARKER ] ) || 200 !== $result->get_status() ) {
			return $served;
		}
		$path = (string) $data[ self::FILE_MARKER ];
		header( 'Content-Type: ' . $data['mime'] );
		header( 'Content-Length: ' . (string) filesize( $path ) );
		header( 'Cache-Control: private, max-age=' . (int) $data['maxAge'] );
		header( 'X-Content-Type-Options: nosniff' );
		// SVGs are already sanitised; this stops any script if one slipped through.
		header( "Content-Security-Policy: default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox" );
		readfile( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile -- streaming a private file.
		return true;
	}

	/**
	 * Public shape of an upload.
	 *
	 * @param array<string, mixed> $row Database row.
	 * @return array<string, mixed>
	 */
	private function present( array $row ): array {
		$id = (string) $row['public_id'];
		return array(
			'id'         => $id,
			'kind'       => $row['kind'],
			'mime'       => $row['mime'],
			'width'      => (int) $row['width'],
			'height'     => (int) $row['height'],
			'bytes'      => (int) $row['bytes'],
			'previewUrl' => $this->urls->upload( $id, 'preview' ),
			'createdAt'  => mysql_to_rfc3339( (string) $row['created_at'] ),
		);
	}
}
