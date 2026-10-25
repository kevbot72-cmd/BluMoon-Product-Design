<?php
/**
 * Who is making a request: a logged-in user or a guest.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Infrastructure;

/**
 * Owner identity for uploads and designs. Logged-in users are identified by
 * id; guests by the hash of their bps_guest cookie token.
 */
final class Requester {

	/**
	 * Constructor.
	 *
	 * @param int         $userId    WordPress user id, or 0 for a guest.
	 * @param string|null $guestHash SHA-256 of the guest token, for guests.
	 */
	private function __construct( public readonly int $userId, public readonly ?string $guestHash ) {}

	/**
	 * The current requester, issuing a guest token when $create is true.
	 *
	 * @param GuestToken $guests Guest token service.
	 * @param bool       $create Set a guest cookie if there is none.
	 */
	public static function current( GuestToken $guests, bool $create ): ?self {
		$userId = get_current_user_id();
		if ( $userId > 0 ) {
			return new self( $userId, null );
		}
		$hash = $create ? GuestToken::hash( $guests->ensure() ) : $guests->currentHash();
		return null === $hash ? null : new self( 0, $hash );
	}

	/**
	 * Key for rate limiting and logging (never the raw token).
	 */
	public function key(): string {
		return $this->userId > 0 ? 'u' . $this->userId : 'g' . substr( (string) $this->guestHash, 0, 16 );
	}

	/**
	 * Whether a stored row belongs to this requester.
	 *
	 * @param int         $userId    Row owner user id.
	 * @param string|null $guestHash Row owner guest hash.
	 */
	public function owns( int $userId, ?string $guestHash ): bool {
		if ( $this->userId > 0 ) {
			return $userId === $this->userId;
		}
		return 0 === $userId && null !== $guestHash && null !== $this->guestHash && hash_equals( $guestHash, $this->guestHash );
	}
}
