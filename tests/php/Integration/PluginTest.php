<?php
/**
 * The plugin boots on real WordPress + WooCommerce.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Tests\Integration;

use Automattic\WooCommerce\Utilities\FeaturesUtil;
use Automattic\WooCommerce\Utilities\OrderUtil;
use Blumoon\ProductStudio\Admin\AdminPage;
use Blumoon\ProductStudio\Infrastructure\Storage;
use Blumoon\ProductStudio\Migration\Tables;
use WP_UnitTestCase;

final class PluginTest extends WP_UnitTestCase {

	public function test_plugin_booted_after_woocommerce(): void {
		$this->assertSame( 1, did_action( 'bps/loaded' ) );
		$this->assertTrue( defined( 'WC_VERSION' ) );
	}

	public function test_tables_are_created_with_current_version(): void {
		$this->assertTrue( ( new Tables() )->exist() );
		$this->assertSame( Tables::VERSION, (int) get_option( Tables::OPTION ) );
	}

	public function test_install_is_idempotent(): void {
		( new Tables() )->install();
		( new Tables() )->install();
		$this->assertTrue( ( new Tables() )->exist() );
	}

	public function test_designs_table_has_expected_columns(): void {
		global $wpdb;
		$columns = $wpdb->get_col( "DESCRIBE {$wpdb->prefix}bps_designs" ); // phpcs:ignore WordPress.DB
		foreach ( array( 'uuid', 'guest_hash', 'document', 'document_hash', 'status', 'expires_at' ) as $column ) {
			$this->assertContains( $column, $columns );
		}
	}

	public function test_private_storage_is_created_and_denied(): void {
		$storage = new Storage();
		$this->assertTrue( $storage->isWritable() );
		$this->assertFileExists( $storage->root() . '/.htaccess' );
		$this->assertStringContainsString( 'Require all denied', (string) file_get_contents( $storage->root() . '/.htaccess' ) );
		foreach ( Storage::SUBDIRS as $sub ) {
			$this->assertFileExists( $storage->root() . "/{$sub}/index.php" );
		}
	}

	public function test_declares_hpos_and_blocks_compatibility(): void {
		$features = FeaturesUtil::get_compatible_features_for_plugin( plugin_basename( BPS_FILE ) );
		$this->assertContains( 'custom_order_tables', $features['compatible'] );
		$this->assertContains( 'cart_checkout_blocks', $features['compatible'] );
		$this->assertSame( array(), $features['incompatible'] );
	}

	public function test_runs_in_requested_order_storage_mode(): void {
		$mode = getenv( 'BPS_TEST_HPOS' );
		if ( false === $mode ) {
			$this->markTestSkipped( 'BPS_TEST_HPOS not set; CI runs this with on and off.' );
		}
		$this->assertSame( 'on' === $mode, OrderUtil::custom_orders_table_usage_is_enabled() );
	}

	public function test_admin_menu_requires_manage_woocommerce(): void {
		global $menu;
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		$menu = array(); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited

		bps_test_container()->get( AdminPage::class )->addMenu();

		$entries = array_values( array_filter( $menu, static fn ( $item ): bool => 'bps' === ( $item[2] ?? '' ) ) );
		$this->assertCount( 1, $entries );
		$this->assertSame( 'manage_woocommerce', $entries[0][1] );
	}
}
