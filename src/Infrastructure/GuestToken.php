<?php
/**
 * Anonymous shopper identity.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Infrastructure;

use Closure;

/**
 * A random 128-bit token in an HttpOnly, SameSite=Lax cookie. Only its
 * SHA-256 hash is stored in the database.
 *
 * The cookie is set only when a guest first saves or uploads something,
 * never on page views, so full-page caches keep working.
 */
final class GuestToken {

	public const COOKIE = 'bps_guest';

	/**
	 * Sends the cookie: fn(string $name, string $value, array $options): bool.
	 *
	 * @var Closure(string, string, array<string, mixed>): bool
	 */
	private Closure $setCookie;

	/**
	 * Constructor.
	 *
	 * @param array<string, mixed>                                       $cookies   Request cookies, usually $_COOKIE.
	 * @param int                                                        $lifetime  Cookie lifetime in seconds.
	 * @param (Closure(string, string, array<string, mixed>): bool)|null $setCookie Cookie writer, replaceable in tests.
	 */
	public function __construct(
		private array $cookies,
		private readonly int $lifetime,
		?Closure $setCookie = null
	) {
		$this->setCookie = $setCookie ?? static fn ( string $name, string $value, array $options ): bool => setcookie( $name, $value, $options );
	}

	/**
	 * The current guest's token, or null when there is none or it is malformed.
	 */
	public function current(): ?string {
		$token = $this->cookies[ self::COOKIE ] ?? null;
		return is_string( $token ) && self::isValid( $token ) ? $token : null;
	}

	/**
	 * Hash of the current token, or null.
	 */
	public function currentHash(): ?string {
		$token = $this->current();
		return null === $token ? null : self::hash( $token );
	}

	/**
	 * Return the current token, issuing a new one if needed.
	 */
	public function ensure(): string {
		$token = $this->current();
		if ( null !== $token ) {
			return $token;
		}
		$token = bin2hex( random_bytes( 16 ) );
		( $this->setCookie )(
			self::COOKIE,
			$token,
			array(
				'expires'  => time() + $this->lifetime,
				'path'     => defined( 'COOKIEPATH' ) && COOKIEPATH ? COOKIEPATH : '/',
				'domain'   => defined( 'COOKIE_DOMAIN' ) && COOKIE_DOMAIN ? COOKIE_DOMAIN : '',
				'secure'   => is_ssl(),
				'httponly' => true,
				'samesite' => 'Lax',
			)
		);
		$this->cookies[ self::COOKIE ] = $token;
		return $token;
	}

	/**
	 * SHA-256 hash stored in place of the token.
	 *
	 * @param string $token Raw token.
	 */
	public static function hash( string $token ): string {
		return hash( 'sha256', $token );
	}

	/**
	 * Tokens are exactly 32 lowercase hex characters.
	 *
	 * @param string $token Candidate token.
	 */
	public static function isValid( string $token ): bool {
		return 1 === preg_match( '/^[0-9a-f]{32}$/', $token );
	}
}
