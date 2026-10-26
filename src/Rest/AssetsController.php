<?php
/**
 * GET /bps/v1/assets/clipart, /assets/masks and /assets/clipart-categories.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Rest;

use Blumoon\ProductStudio\Assets\AssetLibrary;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * Public, read-only library listings for the editor.
 */
final class AssetsController extends Controller {

	/**
	 * Constructor.
	 *
	 * @param AssetLibrary $library Asset library.
	 */
	public function __construct( private readonly AssetLibrary $library ) {}

	/**
	 * {@inheritDoc}
	 */
	public function registerRoutes(): void {
		foreach ( array(
			'clipart' => 'clipart',
			'masks'   => 'mask',
		) as $route => $type ) {
			register_rest_route(
				self::NAMESPACE,
				'/assets/' . $route,
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => fn( WP_REST_Request $request ): WP_REST_Response => $this->items( $type, $request ),
					'permission_callback' => '__return_true',
					'args'                => self::listArgs(),
				)
			);
		}
		register_rest_route(
			self::NAMESPACE,
			'/assets/clipart-categories',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'categories' ),
				'permission_callback' => '__return_true',
				'args'                => array(),
			)
		);
	}

	/**
	 * Query arguments shared by the library listings.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	private static function listArgs(): array {
		return array(
			'search'   => array(
				'type'              => 'string',
				'default'           => '',
				'maxLength'         => 100,
				'sanitize_callback' => 'sanitize_text_field',
			),
			'category' => array(
				'type'    => 'integer',
				'minimum' => 0,
				'default' => 0,
			),
			'page'     => array(
				'type'    => 'integer',
				'minimum' => 1,
				'default' => 1,
			),
			'per_page' => array(
				'type'    => 'integer',
				'minimum' => 1,
				'maximum' => 60,
				'default' => 30,
			),
			// Specific items, e.g. those used in a restored design.
			'include'  => array(
				'type'     => 'array',
				'items'    => array(
					'type'    => 'integer',
					'minimum' => 1,
				),
				'maxItems' => 60,
				'default'  => array(),
			),
		);
	}

	/**
	 * Paged library items of one type.
	 *
	 * @param string                                $type    'clipart' or 'mask'.
	 * @param WP_REST_Request<array<string, mixed>> $request Request.
	 */
	public function items( string $type, WP_REST_Request $request ): WP_REST_Response {
		$result   = $this->library->items( $type, (string) $request['search'], (int) $request['category'], (int) $request['page'], (int) $request['per_page'], array_map( 'intval', (array) $request['include'] ) );
		$response = new WP_REST_Response( $result['items'] );
		$response->header( 'X-WP-Total', (string) $result['total'] );
		$response->header( 'X-WP-TotalPages', (string) $result['pages'] );
		$response->header( 'Cache-Control', 'public, max-age=300' );
		return $response;
	}

	/**
	 * Categories with clipart in them.
	 *
	 * @param WP_REST_Request<array<string, mixed>> $request Request.
	 */
	public function categories( WP_REST_Request $request ): WP_REST_Response { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.Found -- WP callback signature.
		$response = new WP_REST_Response( $this->library->categories() );
		$response->header( 'Cache-Control', 'public, max-age=300' );
		return $response;
	}
}
