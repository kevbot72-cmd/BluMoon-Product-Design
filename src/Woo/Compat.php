<?php
/**
 * WooCommerce feature compatibility declarations.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Woo;

use Automattic\WooCommerce\Utilities\FeaturesUtil;

/**
 * Declares support for HPOS and the Cart & Checkout blocks.
 */
final class Compat {

	public const FEATURES = array( 'custom_order_tables', 'cart_checkout_blocks' );

	/**
	 * Hooked to before_woocommerce_init.
	 */
	public static function declare(): void {
		if ( ! class_exists( FeaturesUtil::class ) ) {
			return;
		}
		foreach ( self::FEATURES as $feature ) {
			FeaturesUtil::declare_compatibility( $feature, BPS_FILE, true );
		}
	}
}
