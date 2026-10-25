<?php
/**
 * Uninstall: removes plugin data only when the owner opted in
 * (Settings › Advanced › Delete data on uninstall). Order item meta and
 * order print files are kept, because they belong to orders.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

require_once __DIR__ . '/vendor/autoload.php';

$bps_settings = \Blumoon\ProductStudio\Infrastructure\Settings::sanitize( (array) get_option( 'bps_settings', array() ) );
if ( ! $bps_settings['advanced']['deleteDataOnUninstall'] ) {
	return;
}

( new \Blumoon\ProductStudio\Migration\Tables() )->drop();
delete_option( 'bps_settings' );
