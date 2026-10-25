<?php
/**
 * Rows in {prefix}bps_uploads.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Infrastructure\Repository;

use Blumoon\ProductStudio\Infrastructure\Requester;
use Blumoon\ProductStudio\Migration\Tables;

// phpcs:disable WordPress.DB.DirectDatabaseQuery -- custom table; rows are per user and not cached.

/**
 * Stores upload metadata. Files live in private storage (Storage).
 */
final class UploadRepository {

	/**
	 * Insert a row and return its public id.
	 *
	 * @param Requester            $owner    Owner.
	 * @param array<string, mixed> $row      kind, original_path, preview_path, mime, width, height, bytes, sha256.
	 * @param int                  $ttlDays  Days until an unused upload expires.
	 */
	public function insert( Requester $owner, array $row, int $ttlDays ): string {
		global $wpdb;
		$publicId = 'u_' . bin2hex( random_bytes( 12 ) );
		$now      = time();
		$wpdb->insert(
			$wpdb->prefix . Tables::UPLOADS,
			array(
				'public_id'     => $publicId,
				'user_id'       => $owner->userId,
				'guest_hash'    => $owner->guestHash,
				'kind'          => $row['kind'],
				'original_path' => $row['original_path'],
				'preview_path'  => $row['preview_path'],
				'mime'          => $row['mime'],
				'width'         => $row['width'],
				'height'        => $row['height'],
				'bytes'         => $row['bytes'],
				'sha256'        => $row['sha256'],
				'created_at'    => gmdate( 'Y-m-d H:i:s', $now ),
				'expires_at'    => gmdate( 'Y-m-d H:i:s', $now + $ttlDays * DAY_IN_SECONDS ),
			),
			array( '%s', '%d', '%s', '%s', '%s', '%s', '%s', '%d', '%d', '%d', '%s', '%s', '%s' )
		);
		return $publicId;
	}

	/**
	 * One upload by public id.
	 *
	 * @param string $publicId Public id.
	 * @return array<string, mixed>|null
	 */
	public function find( string $publicId ): ?array {
		global $wpdb;
		$row = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}bps_uploads WHERE public_id = %s", $publicId ),
			ARRAY_A
		);
		return is_array( $row ) ? $row : null;
	}

	/**
	 * The requester's most recent uploads.
	 *
	 * @param Requester $owner Owner.
	 * @param int       $limit Maximum rows.
	 * @return list<array<string, mixed>>
	 */
	public function forOwner( Requester $owner, int $limit = 60 ): array {
		global $wpdb;
		$sql  = $owner->userId > 0
			? $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}bps_uploads WHERE user_id = %d AND kind IN ('image','svg') ORDER BY id DESC LIMIT %d", $owner->userId, $limit )
			: $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}bps_uploads WHERE user_id = 0 AND guest_hash = %s AND kind IN ('image','svg') ORDER BY id DESC LIMIT %d", (string) $owner->guestHash, $limit );
		$rows = $wpdb->get_results( $sql, ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- prepared above.
		return is_array( $rows ) ? array_values( $rows ) : array();
	}
}
