<?php
/**
 * GET /bps/v1/health — system health for the admin dashboard.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Rest;

use Blumoon\ProductStudio\Infrastructure\Settings;
use Blumoon\ProductStudio\Infrastructure\Storage;
use Blumoon\ProductStudio\Migration\Tables;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * Reports what the plugin needs from the server: versions, tables,
 * writable storage, Imagick capabilities and limits.
 */
final class HealthController extends Controller {

	/**
	 * Constructor.
	 *
	 * @param Tables   $tables   Table manager.
	 * @param Storage  $storage  Private storage.
	 * @param Settings $settings Settings.
	 */
	public function __construct(
		private readonly Tables $tables,
		private readonly Storage $storage,
		private readonly Settings $settings
	) {}

	/**
	 * {@inheritDoc}
	 */
	public function registerRoutes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/health',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'show' ),
				'permission_callback' => array( $this, 'canManage' ),
				'args'                => array(),
				'schema'              => array( $this, 'schema' ),
			)
		);
	}

	/**
	 * Build the health report.
	 *
	 * @param WP_REST_Request<array<string, mixed>> $request Request.
	 */
	public function show( WP_REST_Request $request ): WP_REST_Response { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.Found -- WP callback signature.
		$imagick = $this->imagick();
		$checks  = array(
			$this->check( 'tables', __( 'Database tables', 'blumoon-product-studio' ), $this->tables->exist(), __( 'Deactivate and reactivate the plugin to create them.', 'blumoon-product-studio' ) ),
			$this->check( 'storage', __( 'Private upload folder is writable', 'blumoon-product-studio' ), $this->storage->isWritable(), __( 'Make wp-content/uploads/bps writable by the web server.', 'blumoon-product-studio' ) ),
			$this->check( 'imagick', __( 'Imagick image library', 'blumoon-product-studio' ), $imagick['available'], __( 'Without Imagick, HEIC photos, CMYK output and some PDF features are unavailable.', 'blumoon-product-studio' ), 'warning' ),
			$this->check( 'heic', __( 'HEIC photo support', 'blumoon-product-studio' ), $imagick['heic'], __( 'iPhone HEIC photos will be rejected with a message asking for JPG or PNG.', 'blumoon-product-studio' ), 'warning' ),
			$this->check( 'memory', __( 'PHP memory limit (256 MB or more)', 'blumoon-product-studio' ), wp_convert_hr_to_bytes( (string) ini_get( 'memory_limit' ) ) >= 256 * MB_IN_BYTES || '-1' === ini_get( 'memory_limit' ), __( 'Large photos and print files may fail. Raise memory_limit.', 'blumoon-product-studio' ), 'warning' ),
			$this->check( 'upload_size', __( 'Upload size limit fits the plugin setting', 'blumoon-product-studio' ), wp_max_upload_size() >= (int) $this->settings->get( 'uploads.maxMb' ) * MB_IN_BYTES, __( 'Raise upload_max_filesize and post_max_size, or lower the plugin upload limit.', 'blumoon-product-studio' ), 'warning' ),
		);

		return new WP_REST_Response(
			array(
				'status'   => in_array( 'error', array_column( $checks, 'status' ), true ) ? 'error' : 'ok',
				'versions' => array(
					'plugin' => BPS_VERSION,
					'php'    => PHP_VERSION,
					'wp'     => get_bloginfo( 'version' ),
					'wc'     => defined( 'WC_VERSION' ) ? (string) constant( 'WC_VERSION' ) : null,
					'db'     => (int) get_option( Tables::OPTION, 0 ),
				),
				'imagick'  => $imagick,
				'limits'   => array(
					'memory'    => (string) ini_get( 'memory_limit' ),
					'maxUpload' => wp_max_upload_size(),
				),
				'checks'   => $checks,
			)
		);
	}

	/**
	 * Response schema.
	 *
	 * @return array<string, mixed>
	 */
	public function schema(): array {
		$check = array(
			'type'       => 'object',
			'properties' => array(
				'id'      => array( 'type' => 'string' ),
				'label'   => array( 'type' => 'string' ),
				'status'  => array(
					'type' => 'string',
					'enum' => array( 'ok', 'warning', 'error' ),
				),
				'message' => array( 'type' => 'string' ),
			),
		);
		return array(
			'$schema'    => 'http://json-schema.org/draft-04/schema#',
			'title'      => 'bps-health',
			'type'       => 'object',
			'properties' => array(
				'status'   => array(
					'type' => 'string',
					'enum' => array( 'ok', 'error' ),
				),
				'versions' => array( 'type' => 'object' ),
				'imagick'  => array( 'type' => 'object' ),
				'limits'   => array( 'type' => 'object' ),
				'checks'   => array(
					'type'  => 'array',
					'items' => $check,
				),
			),
		);
	}

	/**
	 * Imagick availability and the formats we care about.
	 *
	 * @return array{available: bool, heic: bool, pdf: bool}
	 */
	private function imagick(): array {
		if ( ! extension_loaded( 'imagick' ) || ! class_exists( \Imagick::class ) ) {
			return array(
				'available' => false,
				'heic'      => false,
				'pdf'       => false,
			);
		}
		return array(
			'available' => true,
			'heic'      => array() !== \Imagick::queryFormats( 'HEIC' ),
			'pdf'       => array() !== \Imagick::queryFormats( 'PDF' ),
		);
	}

	/**
	 * One check row.
	 *
	 * @param string $id       Check id.
	 * @param string $label    What is checked.
	 * @param bool   $passed   Result.
	 * @param string $fix      Shown when the check fails.
	 * @param string $severity 'error' or 'warning' when failed.
	 * @return array{id: string, label: string, status: string, message: string}
	 */
	private function check( string $id, string $label, bool $passed, string $fix, string $severity = 'error' ): array {
		return array(
			'id'      => $id,
			'label'   => $label,
			'status'  => $passed ? 'ok' : $severity,
			'message' => $passed ? '' : $fix,
		);
	}
}
