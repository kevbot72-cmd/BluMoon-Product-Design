<?php
/**
 * Plugin Name:       Blumoon Product Studio
 * Plugin URI:        https://github.com/kevbot72-cmd/BluMoon-Product-Design
 * Description:       Product designer for WooCommerce with a live 3D preview. Shoppers personalise products with text, images, shapes and QR codes.
 * Version:           0.2.0
 * Requires at least: 6.6
 * Requires PHP:      8.2
 * Requires Plugins:  woocommerce
 * Author:            Blumoon Design
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       blumoon-product-studio
 * Domain Path:       /languages
 * WC requires at least: 9.0
 * WC tested up to:   11.2
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

defined( 'ABSPATH' ) || exit;

const BPS_VERSION = '0.2.0';
const BPS_FILE    = __FILE__;

// Keep this check syntax-compatible with old PHP so it can report the problem instead of fataling.
if ( version_compare( PHP_VERSION, '8.2', '<' ) ) {
	add_action(
		'admin_notices',
		static function () {
			echo '<div class="notice notice-error"><p>';
			echo esc_html__( 'Blumoon Product Studio needs PHP 8.2 or newer. It is not running.', 'blumoon-product-studio' );
			echo '</p></div>';
		}
	);
	return;
}

if ( ! is_readable( __DIR__ . '/vendor/autoload.php' ) ) {
	add_action(
		'admin_notices',
		static function () {
			echo '<div class="notice notice-error"><p>';
			echo esc_html__( 'Blumoon Product Studio is missing its vendor files. Reinstall the plugin from a release zip, or run "composer install".', 'blumoon-product-studio' );
			echo '</p></div>';
		}
	);
	return;
}

require __DIR__ . '/vendor/autoload.php';

register_activation_hook( __FILE__, array( \Blumoon\ProductStudio\Lifecycle::class, 'activate' ) );

\Blumoon\ProductStudio\Plugin::boot();
