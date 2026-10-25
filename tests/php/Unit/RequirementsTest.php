<?php
/**
 * Requirements tests.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Tests\Unit;

use Blumoon\ProductStudio\Requirements;

final class RequirementsTest extends TestCase {

	public function test_current_versions_pass(): void {
		$this->assertSame( array(), Requirements::check( '7.1.3', '11.2.1' ) );
		$this->assertSame( array(), Requirements::check( '6.6', '9.0' ) );
	}

	public function test_old_wordpress_fails(): void {
		$problems = Requirements::check( '6.5.5', '11.2.1' );
		$this->assertCount( 1, $problems );
		$this->assertStringContainsString( '6.6', $problems[0] );
	}

	public function test_missing_woocommerce_fails(): void {
		$problems = Requirements::check( '7.1.3', null );
		$this->assertCount( 1, $problems );
		$this->assertStringContainsString( 'WooCommerce', $problems[0] );
	}

	public function test_old_woocommerce_fails(): void {
		$this->assertCount( 1, Requirements::check( '7.1.3', '8.9.3' ) );
	}

	public function test_reports_every_problem(): void {
		$this->assertCount( 2, Requirements::check( '6.0', '8.0' ) );
	}
}
