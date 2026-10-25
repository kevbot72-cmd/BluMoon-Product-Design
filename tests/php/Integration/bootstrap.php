<?php
/**
 * Integration test bootstrap: real WordPress + WooCommerce + this plugin.
 *
 * In wp-env, WP_TESTS_DIR points at the bundled test library. Elsewhere the
 * vendor/wp-phpunit copy is used with tests/php/wp-tests-config.php.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

$bps_root = dirname( __DIR__, 3 );
require $bps_root . '/vendor/autoload.php';

$bps_tests_dir = getenv( 'WP_TESTS_DIR' );
if ( false === $bps_tests_dir || '' === $bps_tests_dir ) {
	$bps_tests_dir = $bps_root . '/vendor/wp-phpunit/wp-phpunit';
	if ( false === getenv( 'WP_PHPUNIT__TESTS_CONFIG' ) ) {
		// wp-phpunit reads its config path from the environment.
		putenv( 'WP_PHPUNIT__TESTS_CONFIG=' . $bps_root . '/tests/php/wp-tests-config.php' ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.runtime_configuration_putenv -- test bootstrap only.
	}
}
define( 'WP_TESTS_PHPUNIT_POLYFILLS_PATH', $bps_root . '/vendor/yoast/phpunit-polyfills' );

require $bps_tests_dir . '/includes/functions.php';

tests_add_filter(
	'muplugins_loaded',
	static function () use ( $bps_root ): void {
		// Load through the plugins directory, as WordPress does, so plugin_basename() is right.
		// wp-env mounts the repository under its own folder name; install-wp.sh symlinks it.
		$plugin = $bps_root . '/blumoon-product-studio.php';
		foreach ( array( basename( $bps_root ), 'blumoon-product-studio' ) as $folder ) {
			$candidate = WP_PLUGIN_DIR . "/{$folder}/blumoon-product-studio.php";
			if ( file_exists( $candidate ) ) {
				$plugin = $candidate;
				if ( realpath( $candidate ) !== $candidate ) {
					wp_register_plugin_realpath( $candidate );
				}
				break;
			}
		}
		require WP_PLUGIN_DIR . '/woocommerce/woocommerce.php';
		require $plugin;
		update_option( 'active_plugins', array( 'woocommerce/woocommerce.php', plugin_basename( $plugin ) ) );
	}
);

/**
 * The plugin's container, captured when it boots, for tests that need a service.
 */
function bps_test_container(): \Blumoon\ProductStudio\Container {
	static $container = null;
	if ( func_num_args() > 0 ) {
		$container = func_get_arg( 0 );
	}
	return $container;
}
tests_add_filter( 'bps/loaded', 'bps_test_container' );
// Guests in tests: no real cookie can be sent once PHPUnit has printed output.
tests_add_filter(
	'bps/loaded',
	static function ( \Blumoon\ProductStudio\Container $container ): void {
		$container->set( \Blumoon\ProductStudio\Infrastructure\GuestToken::class, static fn () => new \Blumoon\ProductStudio\Infrastructure\GuestToken( array(), HOUR_IN_SECONDS, static fn (): bool => true ) );
	}
);

tests_add_filter(
	'setup_theme',
	static function (): void {
		WC_Install::install();
		// Reload roles so WooCommerce's new capabilities are seen on a fresh database
		// (as WooCommerce's own test bootstrap does; core ticket #28374).
		$GLOBALS['wp_roles'] = null; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		wp_roles();
		// CI runs the suite with HPOS on and off (BPS_TEST_HPOS=on|off).
		if ( false !== getenv( 'BPS_TEST_HPOS' ) ) {
			$hpos = 'on' === getenv( 'BPS_TEST_HPOS' );
			if ( $hpos ) {
				wc_get_container()->get( \Automattic\WooCommerce\Internal\DataStores\Orders\DataSynchronizer::class )->create_database_tables();
			}
			update_option( 'woocommerce_custom_orders_table_enabled', $hpos ? 'yes' : 'no' );
		}
		\Blumoon\ProductStudio\Lifecycle::activate();
	}
);

require $bps_tests_dir . '/includes/bootstrap.php';
