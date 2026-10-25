<?php
/**
 * Custom table creation and upgrades.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Migration;

/**
 * Creates and upgrades the designs and uploads tables with dbDelta.
 *
 * Bump VERSION whenever a CREATE statement changes; dbDelta adds the
 * missing columns and indexes on the next load.
 */
final class Tables {

	public const VERSION = 1;
	public const OPTION  = 'bps_db_version';

	/**
	 * Table names without the WordPress prefix.
	 */
	public const DESIGNS = 'bps_designs';
	public const UPLOADS = 'bps_uploads';

	/**
	 * Upgrade on load when the stored version is behind (covers updates
	 * that don't go through activation, e.g. a manual file copy).
	 */
	public function maybeUpgrade(): void {
		if ( (int) get_option( self::OPTION, 0 ) < self::VERSION ) {
			$this->install();
		}
	}

	/**
	 * Create or upgrade both tables.
	 */
	public function install(): void {
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		dbDelta( $this->schema() );
		update_option( self::OPTION, self::VERSION, true );
	}

	/**
	 * Whether every table exists.
	 */
	public function exist(): bool {
		global $wpdb;
		foreach ( array( self::DESIGNS, self::UPLOADS ) as $table ) {
			$name = $wpdb->prefix . $table;
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- schema check, must not be cached.
			if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wpdb->esc_like( $name ) ) ) !== $name ) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Drop both tables. Only called from uninstall when the owner opted in.
	 */
	public function drop(): void {
		global $wpdb;
		foreach ( array( self::DESIGNS, self::UPLOADS ) as $table ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table names are constants.
			$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}{$table}" );
		}
		delete_option( self::OPTION );
	}

	/**
	 * CREATE statements in dbDelta's format (two spaces after PRIMARY KEY, one column per line).
	 */
	public function schema(): string {
		global $wpdb;
		$charset = $wpdb->get_charset_collate();
		$designs = $wpdb->prefix . self::DESIGNS;
		$uploads = $wpdb->prefix . self::UPLOADS;

		return "CREATE TABLE {$designs} (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  uuid char(36) NOT NULL,
  user_id bigint(20) unsigned NOT NULL DEFAULT 0,
  guest_hash char(64) DEFAULT NULL,
  product_id bigint(20) unsigned NOT NULL,
  variation_id bigint(20) unsigned NOT NULL DEFAULT 0,
  mode varchar(16) NOT NULL,
  name varchar(190) NOT NULL DEFAULT '',
  schema_version smallint(5) unsigned NOT NULL,
  document longtext NOT NULL,
  document_hash char(64) NOT NULL,
  price_snapshot text DEFAULT NULL,
  previews text DEFAULT NULL,
  status varchar(16) NOT NULL,
  parent_uuid char(36) DEFAULT NULL,
  order_id bigint(20) unsigned DEFAULT NULL,
  order_item_id bigint(20) unsigned DEFAULT NULL,
  created_at datetime NOT NULL,
  updated_at datetime NOT NULL,
  expires_at datetime DEFAULT NULL,
  PRIMARY KEY  (id),
  UNIQUE KEY uuid (uuid),
  KEY owner (user_id,status),
  KEY guest (guest_hash),
  KEY product (product_id),
  KEY expires (status,expires_at)
) {$charset};
CREATE TABLE {$uploads} (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  public_id varchar(48) NOT NULL,
  user_id bigint(20) unsigned NOT NULL DEFAULT 0,
  guest_hash char(64) DEFAULT NULL,
  kind varchar(16) NOT NULL,
  original_path varchar(255) NOT NULL,
  preview_path varchar(255) DEFAULT NULL,
  mime varchar(64) NOT NULL,
  width int(10) unsigned DEFAULT NULL,
  height int(10) unsigned DEFAULT NULL,
  bytes bigint(20) unsigned NOT NULL,
  sha256 char(64) NOT NULL,
  design_uuid char(36) DEFAULT NULL,
  created_at datetime NOT NULL,
  expires_at datetime DEFAULT NULL,
  PRIMARY KEY  (id),
  UNIQUE KEY public_id (public_id),
  KEY owner (user_id),
  KEY guest (guest_hash),
  KEY design (design_uuid),
  KEY expires (expires_at)
) {$charset};";
	}
}
