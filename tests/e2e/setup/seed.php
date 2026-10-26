<?php
/**
 * E2E fixture data, run with `wp eval-file seed.php <blueprint-json-out>`.
 *
 * Creates a mug blank drawn with GD (no third-party images), a simple ZAR
 * product, three SVG clipart items, and writes the blueprint JSON for
 * `wp bps blueprint-import`. Prints "product=<id>". Idempotent: reuses
 * what exists, by slug.
 *
 * @package Blumoon\ProductStudio
 */

// No strict_types: `wp eval-file` evals this file, where the declaration isn't allowed.

// phpcs:disable WordPress.WP.AlternativeFunctions -- test fixture generation.

require_once ABSPATH . 'wp-admin/includes/image.php';
require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/media.php';

$bps_out = (string) ( $args[0] ?? '' );
if ( '' === $bps_out ) {
	WP_CLI::error( 'Usage: wp eval-file seed.php <blueprint-json-out>' );
}

/**
 * Import a generated file as an attachment once (by title).
 *
 * @param string $title Attachment title.
 * @param string $name  File name.
 * @param string $bytes File contents.
 */
$bps_attach = static function ( string $title, string $name, string $bytes ): int {
	$existing = get_posts(
		array(
			'post_type'   => 'attachment',
			'title'       => $title,
			'post_status' => 'inherit',
			'numberposts' => 1,
			'fields'      => 'ids',
		)
	);
	if ( $existing ) {
		return (int) $existing[0];
	}
	$tmp = wp_tempnam( $name );
	file_put_contents( $tmp, $bytes );
	$id = media_handle_sideload(
		array(
			'name'     => $name,
			'tmp_name' => $tmp,
		),
		0,
		$title
	);
	if ( is_wp_error( $id ) ) {
		WP_CLI::error( $id->get_error_message() );
	}
	return (int) $id;
};

// A white mug, 1600 × 1000 on transparent: body, rim and handle with soft shading.
$bps_w  = 1600;
$bps_h  = 1000;
$bps_gd = imagecreatetruecolor( $bps_w, $bps_h );
imagesavealpha( $bps_gd, true );
imagealphablending( $bps_gd, false );
imagefill( $bps_gd, 0, 0, (int) imagecolorallocatealpha( $bps_gd, 0, 0, 0, 127 ) );
imagealphablending( $bps_gd, true );
for ( $bps_x = 360; $bps_x <= 1240; $bps_x++ ) {
	$bps_t    = ( $bps_x - 360 ) / 880;
	$bps_tone = (int) round( 205 + 50 * sin( $bps_t * M_PI ) );
	imageline( $bps_gd, $bps_x, 150, $bps_x, 880, (int) imagecolorallocate( $bps_gd, $bps_tone, $bps_tone, min( 255, $bps_tone + 3 ) ) );
}
imagefilledellipse( $bps_gd, 800, 150, 880, 70, (int) imagecolorallocate( $bps_gd, 236, 238, 241 ) );
imagesetthickness( $bps_gd, 46 );
imagearc( $bps_gd, 1240, 515, 330, 420, 270, 90, (int) imagecolorallocate( $bps_gd, 222, 224, 228 ) );
ob_start();
imagepng( $bps_gd );
$bps_image = $bps_attach( 'BPS E2E mug blank', 'bps-e2e-mug.png', (string) ob_get_clean() );

// Clipart: simple original SVGs, flagged for the library.
$bps_svgs = array(
	'Balloon' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140"><ellipse cx="50" cy="50" rx="40" ry="48" fill="#d64545"/><path d="M50 98 L44 108 H56 Z" fill="#a83232"/><path d="M50 108 C40 120 60 128 50 140" stroke="#555555" stroke-width="2" fill="none"/></svg>',
	'Star'    => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 4 62 38H98L69 59 80 94 50 72 20 94 31 59 2 38H38Z" fill="#f2c94c" stroke="#b8860b" stroke-width="3"/></svg>',
	'Leaf'    => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 90 C10 40 40 10 90 10 C90 60 60 90 10 90 Z" fill="#2f9e6b"/><path d="M10 90 L70 30" stroke="#1d6b47" stroke-width="3"/></svg>',
);
wp_set_current_user( 1 );
foreach ( $bps_svgs as $bps_title => $bps_svg ) {
	$bps_id = $bps_attach( $bps_title, strtolower( $bps_title ) . '.svg', $bps_svg );
	update_post_meta( $bps_id, '_bps_asset_type', 'clipart' );
}

// The product.
$bps_product_id = (int) wc_get_product_id_by_sku( 'BPS-E2E-MUG' );
$bps_product    = $bps_product_id ? wc_get_product( $bps_product_id ) : new WC_Product_Simple();
$bps_product->set_name( 'Classic Ceramic Mug' );
$bps_product->set_slug( 'classic-ceramic-mug' );
$bps_product->set_sku( 'BPS-E2E-MUG' );
$bps_product->set_regular_price( '149' );
$bps_product->set_status( 'publish' );
$bps_product->set_image_id( $bps_image );
$bps_product_id = $bps_product->save();

$bps_blueprint = (string) file_get_contents( __DIR__ . '/../../fixtures/blueprint-mug.json' );
file_put_contents( $bps_out, str_replace( '"attachmentId": 1', '"attachmentId": ' . $bps_image, $bps_blueprint ) );

WP_CLI::line( "product={$bps_product_id}" );
