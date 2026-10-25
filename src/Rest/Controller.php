<?php
/**
 * Base REST controller.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Rest;

use WP_Error;
use WP_REST_Request;

/**
 * Shared namespace and permission helpers. Every route must declare a
 * permission_callback and an args schema.
 */
abstract class Controller {

	public const NAMESPACE = 'bps/v1';

	/**
	 * Register this controller's routes. Called on rest_api_init.
	 */
	abstract public function registerRoutes(): void;

	/**
	 * Permission callback for store-management routes.
	 *
	 * Returns 401 for logged-out requests and 403 for logged-in users
	 * without the capability (rest_authorization_required_code()).
	 *
	 * @param WP_REST_Request<array<string, mixed>> $request Request.
	 */
	public function canManage( WP_REST_Request $request ): bool|WP_Error { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.Found -- WP callback signature.
		if ( current_user_can( 'manage_woocommerce' ) ) {
			return true;
		}
		return new WP_Error(
			'bps_forbidden',
			__( 'You are not allowed to do that.', 'blumoon-product-studio' ),
			array( 'status' => rest_authorization_required_code() )
		);
	}
}
