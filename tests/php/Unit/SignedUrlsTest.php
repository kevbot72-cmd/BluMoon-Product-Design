<?php
/**
 * Signed URL tests.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Tests\Unit;

use Blumoon\ProductStudio\Infrastructure\SignedUrls;
use Brain\Monkey\Functions;

final class SignedUrlsTest extends TestCase {

	private const ID = 'u_0123456789abcdef01234567';

	protected function set_up(): void {
		parent::set_up();
		if ( ! defined( 'HOUR_IN_SECONDS' ) ) {
			define( 'HOUR_IN_SECONDS', 3600 );
		}
		Functions\when( 'rest_url' )->alias( static fn ( string $path ): string => 'https://shop.test/wp-json/' . $path );
		Functions\when( 'add_query_arg' )->alias( static fn ( array $args, string $url ): string => $url . '?' . http_build_query( $args ) );
	}

	/** @return array{variant: string, exp: string, sig: string} */
	private function query( string $url ): array {
		parse_str( (string) parse_url( $url, PHP_URL_QUERY ), $query );
		return $query; // @phpstan-ignore return.type
	}

	public function test_url_verifies_until_expiry(): void {
		$urls  = new SignedUrls( 'secret', 6 );
		$now   = 1_800_000_000;
		$query = $this->query( $urls->upload( self::ID, 'preview', $now ) );

		$this->assertTrue( $urls->verify( self::ID, 'preview', (int) $query['exp'], $query['sig'], $now ) );
		$this->assertGreaterThanOrEqual( $now + 6 * 3600, (int) $query['exp'] );
		$this->assertFalse( $urls->verify( self::ID, 'preview', (int) $query['exp'], $query['sig'], (int) $query['exp'] + 1 ) );
	}

	public function test_same_url_within_the_hour(): void {
		$urls = new SignedUrls( 'secret' );
		$this->assertSame( $urls->upload( self::ID, 'preview', 1_800_000_000 ), $urls->upload( self::ID, 'preview', 1_800_000_000 + 60 ) );
	}

	public function test_tampering_fails(): void {
		$urls  = new SignedUrls( 'secret' );
		$now   = 1_800_000_000;
		$query = $this->query( $urls->upload( self::ID, 'preview', $now ) );

		$this->assertFalse( $urls->verify( self::ID, 'original', (int) $query['exp'], $query['sig'], $now ), 'variant swapped' );
		$this->assertFalse( $urls->verify( 'u_ffffffffffffffffffffffff', 'preview', (int) $query['exp'], $query['sig'], $now ), 'id swapped' );
		$this->assertFalse( $urls->verify( self::ID, 'preview', (int) $query['exp'] + 3600, $query['sig'], $now ), 'expiry extended' );
		$this->assertFalse( ( new SignedUrls( 'other' ) )->verify( self::ID, 'preview', (int) $query['exp'], $query['sig'], $now ), 'other key' );
	}
}
