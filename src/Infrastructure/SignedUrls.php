<?php
/**
 * Signed, expiring URLs for private files.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Infrastructure;

/**
 * HMAC-signed links to /bps/v1/uploads/{id}/file. The expiry is rounded up to
 * the hour, so the same URL is reused within that hour and browsers can cache it.
 */
final class SignedUrls {

	/**
	 * Constructor.
	 *
	 * @param string $secret   Signing key (derived from the site's salts).
	 * @param int    $ttlHours Minimum lifetime of a link.
	 */
	public function __construct( private readonly string $secret, private readonly int $ttlHours = 6 ) {}

	/**
	 * Signed URL for an upload variant.
	 *
	 * @param string   $publicId Upload public id.
	 * @param string   $variant  'preview' or 'original'.
	 * @param int|null $now      Current time (tests).
	 */
	public function upload( string $publicId, string $variant, ?int $now = null ): string {
		$expires = ( intdiv( $now ?? time(), HOUR_IN_SECONDS ) + 1 + $this->ttlHours ) * HOUR_IN_SECONDS;
		return add_query_arg(
			array(
				'variant' => $variant,
				'exp'     => $expires,
				'sig'     => $this->signature( $publicId, $variant, $expires ),
			),
			rest_url( "bps/v1/uploads/{$publicId}/file" )
		);
	}

	/**
	 * Whether a signature is valid and unexpired.
	 *
	 * @param string   $publicId  Upload public id.
	 * @param string   $variant   Variant.
	 * @param int      $expires   Expiry timestamp from the URL.
	 * @param string   $signature Signature from the URL.
	 * @param int|null $now       Current time (tests).
	 */
	public function verify( string $publicId, string $variant, int $expires, string $signature, ?int $now = null ): bool {
		return $expires >= ( $now ?? time() ) && hash_equals( $this->signature( $publicId, $variant, $expires ), $signature );
	}

	/**
	 * HMAC over the id, variant and expiry.
	 *
	 * @param string $publicId Upload public id.
	 * @param string $variant  Variant.
	 * @param int    $expires  Expiry timestamp.
	 */
	private function signature( string $publicId, string $variant, int $expires ): string {
		return hash_hmac( 'sha256', "{$publicId}|{$variant}|{$expires}", $this->secret );
	}
}
