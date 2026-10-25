<?php
/**
 * Blueprints, product configs and GET /bps/v1/editor/bootstrap.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Tests\Integration;

use Blumoon\ProductStudio\Domain\Blueprint\BlueprintRepository;
use Blumoon\ProductStudio\Domain\InvalidData;
use Blumoon\ProductStudio\Domain\Product\ProductConfigRepository;
use WC_Product_Simple;
use WP_REST_Request;
use WP_REST_Server;
use WP_UnitTestCase;

final class EditorBootstrapTest extends WP_UnitTestCase {

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

	/** A 1600 × 1000 PNG attachment. */
	private function image(): int {
		$file = get_temp_dir() . 'bps-mug-' . wp_generate_password( 6, false ) . '.png';
		$gd   = imagecreatetruecolor( 1600, 1000 );
		imagefill( $gd, 0, 0, (int) imagecolorallocate( $gd, 240, 240, 240 ) );
		imagepng( $gd, $file );
		return self::factory()->attachment->create_upload_object( $file );
	}

	private function blueprint( int $imageId ): int {
		$json = (string) file_get_contents( dirname( __DIR__, 3 ) . '/tests/fixtures/blueprint-mug.json' );
		$json = str_replace( '"attachmentId": 1', '"attachmentId": ' . $imageId, $json );
		return bps_test_container()->get( BlueprintRepository::class )->save( 'Mug', $json );
	}

	private function product( ?int $blueprintId ): int {
		$product = new WC_Product_Simple();
		$product->set_name( 'Classic Mug' );
		$product->set_regular_price( '149' );
		$product->set_status( 'publish' );
		$id = $product->save();
		if ( null !== $blueprintId ) {
			bps_test_container()->get( ProductConfigRepository::class )->save(
				$id,
				(string) wp_json_encode(
					array(
						'schemaVersion' => 1,
						'enabled'       => true,
						'modes'         => array( 'template' ),
						'defaultMode'   => 'template',
						'blueprintId'   => $blueprintId,
					)
				)
			);
		}
		return $id;
	}

	private function bootstrap( int $productId, int $variation = 0 ): \WP_REST_Response {
		$request = new WP_REST_Request( 'GET', '/bps/v1/editor/bootstrap' );
		$request->set_query_params(
			array(
				'product'   => $productId,
				'variation' => $variation,
			)
		);
		return $this->server->dispatch( $request );
	}

	public function test_invalid_blueprint_is_rejected(): void {
		$this->expectException( InvalidData::class );
		bps_test_container()->get( BlueprintRepository::class )->save( 'Broken', '{"schemaVersion":1,"sides":[]}' );
	}

	public function test_invalid_config_is_rejected(): void {
		$this->expectException( InvalidData::class );
		bps_test_container()->get( ProductConfigRepository::class )->save( 1, '{"enabled":"yes"}' );
	}

	public function test_bootstrap_for_enabled_product_is_public(): void {
		wp_set_current_user( 0 );
		$image    = $this->image();
		$product  = $this->product( $this->blueprint( $image ) );
		$response = $this->bootstrap( $product );

		$this->assertSame( 200, $response->get_status() );
		$data = $response->get_data();
		$this->assertSame( 'Classic Mug', $data['product']['name'] );
		$this->assertSame( 149.0, $data['product']['price'] );
		$this->assertSame( 'template', $data['mode'] );
		$this->assertSame( array( 'right', 'left' ), array_column( $data['sides'], 'id' ) );
		$this->assertSame( $image, $data['sides'][0]['base']['attachmentId'] );
		$this->assertSame( 1600, $data['sides'][0]['base']['widthPx'] );
		$this->assertStringContainsString( 'bps-mug', $data['sides'][0]['base']['url'] );
		$this->assertSame( 200, $data['sides'][0]['printAreas'][0]['sizeMm']['w'] );
		$this->assertSame( 300, $data['settings']['defaultDpi'] );
		$this->assertStringContainsString( 'public', $response->get_headers()['Cache-Control'] );
	}

	public function test_product_without_config_is_404(): void {
		$response = $this->bootstrap( $this->product( null ) );
		$this->assertSame( 404, $response->get_status() );
		$this->assertSame( 'bps_not_customizable', $response->get_data()['code'] );
	}

	public function test_disabled_product_is_404(): void {
		$product = $this->product( $this->blueprint( $this->image() ) );
		$repo    = bps_test_container()->get( ProductConfigRepository::class );
		$config  = $repo->get( $product );
		$this->assertIsArray( $config );
		$config['enabled'] = false;
		$repo->save( $product, (string) wp_json_encode( $config ) );
		$this->assertSame( 404, $this->bootstrap( $product )->get_status() );
	}

	public function test_draft_product_is_404(): void {
		$product = $this->product( $this->blueprint( $this->image() ) );
		wp_update_post(
			array(
				'ID'          => $product,
				'post_status' => 'draft',
			)
		);
		$this->assertSame( 'bps_product_not_found', $this->bootstrap( $product )->get_data()['code'] );
	}

	public function test_variation_of_another_product_is_rejected(): void {
		$product = $this->product( $this->blueprint( $this->image() ) );
		$other   = $this->product( null );
		$this->assertSame( 'bps_variation_not_found', $this->bootstrap( $product, $other )->get_data()['code'] );
	}

	public function test_missing_product_param_is_400(): void {
		$this->assertSame( 400, $this->server->dispatch( new WP_REST_Request( 'GET', '/bps/v1/editor/bootstrap' ) )->get_status() );
	}

	public function test_bootstrap_data_filter_applies(): void {
		$product = $this->product( $this->blueprint( $this->image() ) );
		add_filter(
			'bps/editor/bootstrap_data',
			static function ( array $data ): array {
				$data['extra'] = 'yes';
				return $data;
			}
		);
		$this->assertSame( 'yes', $this->bootstrap( $product )->get_data()['extra'] );
	}
}
