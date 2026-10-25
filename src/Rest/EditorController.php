<?php
/**
 * GET /bps/v1/editor/bootstrap — data the shopper editor opens with.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Rest;

use Blumoon\ProductStudio\Domain\Editor\EditorBootstrap;
use Blumoon\ProductStudio\Domain\Editor\EditorUnavailable;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * Public route: anyone who can see the product can open its editor.
 */
final class EditorController extends Controller {

	/**
	 * Constructor.
	 *
	 * @param EditorBootstrap $bootstrap Payload builder.
	 */
	public function __construct( private readonly EditorBootstrap $bootstrap ) {}

	/**
	 * {@inheritDoc}
	 */
	public function registerRoutes(): void {
		register_rest_route(
			self::NAMESPACE,
			'/editor/bootstrap',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'show' ),
				// Public by design: visibility is checked per product in show().
				'permission_callback' => '__return_true',
				'args'                => array(
					'product'   => array(
						'type'     => 'integer',
						'minimum'  => 1,
						'required' => true,
					),
					'variation' => array(
						'type'    => 'integer',
						'minimum' => 0,
						'default' => 0,
					),
				),
			)
		);
	}

	/**
	 * Build the bootstrap payload.
	 *
	 * @param WP_REST_Request<array<string, mixed>> $request Request.
	 */
	public function show( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		try {
			$data = $this->bootstrap->build( (int) $request['product'], (int) $request['variation'] );
		} catch ( EditorUnavailable $e ) {
			return new WP_Error( 'bps_' . $e->errorCode, $e->getMessage(), array( 'status' => $e->status ) );
		}
		$response = new WP_REST_Response( $data );
		// Per product, no user data: let browsers and proxies keep it briefly.
		$response->header( 'Cache-Control', 'public, max-age=60' );
		return $response;
	}
}
