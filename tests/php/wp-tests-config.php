<?php
/**
 * WordPress test-suite configuration, read from the environment.
 * Used outside wp-env (wp-env provides its own). See tests/php/README.md.
 *
 * @package Blumoon\ProductStudio
 */

$bps_env = static fn ( string $name, string $fallback ): string => false !== getenv( $name ) ? (string) getenv( $name ) : $fallback;

define( 'ABSPATH', rtrim( $bps_env( 'WP_CORE_DIR', '/tmp/wordpress' ), '/' ) . '/' );
define( 'DB_NAME', $bps_env( 'WP_DB_NAME', 'wp_tests' ) );
define( 'DB_USER', $bps_env( 'WP_DB_USER', 'root' ) );
define( 'DB_PASSWORD', $bps_env( 'WP_DB_PASSWORD', 'root' ) );
define( 'DB_HOST', $bps_env( 'WP_DB_HOST', '127.0.0.1:3306' ) );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );
$table_prefix = 'wptests_'; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- required by the WP test suite.

define( 'WP_TESTS_DOMAIN', 'example.org' );
define( 'WP_TESTS_EMAIL', 'admin@example.org' );
define( 'WP_TESTS_TITLE', 'Product Studio Tests' );
define( 'WP_PHP_BINARY', 'php' );
define( 'WPLANG', '' );
define( 'WP_DEBUG', true );
