<?php
/**
 * GET /bps/v1/health permissions and payload.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Tests\Integration;

use WP_REST_Request;
use WP_REST_Server;
use WP_UnitTestCase;

final class HealthRouteTest extends WP_UnitTestCase {

	private WP_REST_Server $server;

	public function set_up(): void {
		parent::set_up();
		global $wp_rest_server;
		$wp_rest_server = new WP_REST_Server(); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		$this->server   = $wp_rest_server;
		do_action( 'rest_api_init', $this->server );
	}

	public function tear_down(): void {
		global $wp_rest_server;
		$wp_rest_server = null; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		parent::tear_down();
	}

	public function test_route_is_registered_in_namespace(): void {
		$this->assertArrayHasKey( '/bps/v1/health', $this->server->get_routes( 'bps/v1' ) );
	}

	public function test_logged_out_gets_401(): void {
		wp_set_current_user( 0 );
		$response = $this->server->dispatch( new WP_REST_Request( 'GET', '/bps/v1/health' ) );
		$this->assertSame( 401, $response->get_status() );
		$this->assertSame( 'bps_forbidden', $response->get_data()['code'] );
	}

	public function test_customer_gets_403(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'customer' ) ) );
		$response = $this->server->dispatch( new WP_REST_Request( 'GET', '/bps/v1/health' ) );
		$this->assertSame( 403, $response->get_status() );
	}

	public function test_shop_manager_gets_200_with_report(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'shop_manager' ) ) );
		$response = $this->server->dispatch( new WP_REST_Request( 'GET', '/bps/v1/health' ) );

		$this->assertSame( 200, $response->get_status(), (string) wp_json_encode( $response->get_data() ) );
		$data = $response->get_data();
		$this->assertSame( BPS_VERSION, $data['versions']['plugin'] );
		$this->assertSame( WC_VERSION, $data['versions']['wc'] );
		$checks = array_column( $data['checks'], 'status', 'id' );
		$this->assertSame( 'ok', $checks['tables'] );
		$this->assertSame( 'ok', $checks['storage'] );
		$this->assertSame( 'ok', $data['status'] );
	}

	public function test_route_rejects_writes(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		$response = $this->server->dispatch( new WP_REST_Request( 'POST', '/bps/v1/health' ) );
		$this->assertSame( 404, $response->get_status() );
	}
}
