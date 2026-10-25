<?php
/**
 * Guest token tests.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Tests\Unit;

use Blumoon\ProductStudio\Infrastructure\GuestToken;
use Brain\Monkey\Functions;

final class GuestTokenTest extends TestCase {

	private const VALID = '0123456789abcdef0123456789abcdef';

	public function test_reads_valid_cookie(): void {
		$token = new GuestToken( array( GuestToken::COOKIE => self::VALID ), 3600 );
		$this->assertSame( self::VALID, $token->current() );
		$this->assertSame( hash( 'sha256', self::VALID ), $token->currentHash() );
	}

	/**
	 * @dataProvider malformed
	 */
	public function test_rejects_malformed_cookie( mixed $value ): void {
		$token = new GuestToken( array( GuestToken::COOKIE => $value ), 3600 );
		$this->assertNull( $token->current() );
		$this->assertNull( $token->currentHash() );
	}

	/**
	 * @return array<string, array{mixed}>
	 */
	public static function malformed(): array {
		return array(
			'too short'   => array( 'abc' ),
			'uppercase'   => array( strtoupper( self::VALID ) ),
			'sql'         => array( "' OR 1=1 --" ),
			'array'       => array( array( self::VALID ) ),
			'extra chars' => array( self::VALID . 'x' ),
		);
	}

	public function test_ensure_issues_secure_cookie_once(): void {
		Functions\when( 'is_ssl' )->justReturn( true );
		$sent  = array();
		$token = new GuestToken(
			array(),
			7 * 86400,
			static function ( string $name, string $value, array $options ) use ( &$sent ): bool {
				$sent[] = compact( 'name', 'value', 'options' );
				return true;
			}
		);

		$first  = $token->ensure();
		$second = $token->ensure();

		$this->assertTrue( GuestToken::isValid( $first ) );
		$this->assertSame( $first, $second );
		$this->assertCount( 1, $sent );
		$this->assertSame( GuestToken::COOKIE, $sent[0]['name'] );
		$this->assertTrue( $sent[0]['options']['httponly'] );
		$this->assertTrue( $sent[0]['options']['secure'] );
		$this->assertSame( 'Lax', $sent[0]['options']['samesite'] );
		$this->assertGreaterThan( time() + 6 * 86400, $sent[0]['options']['expires'] );
	}

	public function test_ensure_keeps_existing_token(): void {
		$token = new GuestToken(
			array( GuestToken::COOKIE => self::VALID ),
			3600,
			function (): bool {
				$this->fail( 'Must not set a cookie when one exists.' );
			}
		);
		$this->assertSame( self::VALID, $token->ensure() );
	}

	public function test_tokens_are_random(): void {
		Functions\when( 'is_ssl' )->justReturn( false );
		$noop = static fn (): bool => true;
		$this->assertNotSame( ( new GuestToken( array(), 1, $noop ) )->ensure(), ( new GuestToken( array(), 1, $noop ) )->ensure() );
	}
}
