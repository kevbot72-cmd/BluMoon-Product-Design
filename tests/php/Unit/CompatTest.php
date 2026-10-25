<?php
/**
 * WooCommerce compatibility declaration tests.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Tests\Unit;

use Blumoon\ProductStudio\Woo\Compat;

final class CompatTest extends TestCase {

	public function test_declares_hpos_and_blocks(): void {
		$this->assertSame( array( 'custom_order_tables', 'cart_checkout_blocks' ), Compat::FEATURES );
	}
}
