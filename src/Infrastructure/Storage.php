<?php
/**
 * Private file storage under wp-content/uploads/bps.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Infrastructure;

/**
 * Owns the private directories for shopper uploads and order print files.
 *
 * Files are never linked directly; they are served through signed REST URLs.
 * Apache is blocked by .htaccess; nginx needs the rule in docs/USER-GUIDE.md.
 */
final class Storage {

	public const SUBDIRS = array( 'u', 'orders', 'tmp' );

	/**
	 * Absolute path of the private root, without trailing slash.
	 */
	public function root(): string {
		$uploads = wp_upload_dir( null, false );
		return untrailingslashit( $uploads['basedir'] ) . '/bps';
	}

	/**
	 * Create the root and sub-directories with deny rules. Safe to call repeatedly.
	 */
	public function ensureDirectories(): bool {
		$root = $this->root();
		$ok   = true;
		foreach ( array_merge( array( '' ), self::SUBDIRS ) as $sub ) {
			$dir = '' === $sub ? $root : "{$root}/{$sub}";
			if ( ! is_dir( $dir ) && ! wp_mkdir_p( $dir ) ) {
				$ok = false;
				continue;
			}
			$this->writeOnce( "{$dir}/index.php", "<?php\n// Silence is golden.\n" );
		}
		$this->writeOnce( "{$root}/.htaccess", "# Blumoon Product Studio: private files, served only through signed REST URLs.\nRequire all denied\n<IfModule !mod_authz_core.c>\n\tDeny from all\n</IfModule>\n" );
		return $ok;
	}

	/**
	 * Whether the root exists and is writable.
	 */
	public function isWritable(): bool {
		return wp_is_writable( $this->root() );
	}

	/**
	 * Write a file only if it doesn't exist yet.
	 *
	 * @param string $path     Absolute path.
	 * @param string $contents File contents.
	 */
	private function writeOnce( string $path, string $contents ): void {
		if ( ! file_exists( $path ) ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- runs on activation, before WP_Filesystem credentials are available.
			file_put_contents( $path, $contents );
		}
	}
}
