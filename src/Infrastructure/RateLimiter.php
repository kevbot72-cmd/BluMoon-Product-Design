<?php
/**
 * Fixed-window request limits.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Infrastructure;

/**
 * Counts hits per bucket and key in an hourly window, using transients
 * (an object cache makes this shared across servers).
 */
final class RateLimiter {

	/**
	 * Record a hit; false when the limit is already reached.
	 *
	 * @param string $bucket What is limited, e.g. "upload".
	 * @param string $key    Who: a Requester key or an IP hash.
	 * @param int    $limit  Hits allowed per window.
	 * @param int    $window Window in seconds.
	 */
	public function hit( string $bucket, string $key, int $limit, int $window = HOUR_IN_SECONDS ): bool {
		$slot      = intdiv( time(), $window );
		$transient = 'bps_rl_' . md5( "{$bucket}|{$key}|{$slot}" );
		$count     = (int) get_transient( $transient );
		if ( $count >= $limit ) {
			return false;
		}
		set_transient( $transient, $count + 1, $window );
		return true;
	}
}
