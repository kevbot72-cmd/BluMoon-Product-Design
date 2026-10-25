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
	 * Create a new, unguessable directory for one upload: u/YYYY/MM/<random>.
	 *
	 * @throws \RuntimeException When it can't be created.
	 */
	public function newUploadDir(): string {
		$dir = $this->root() . '/u/' . gmdate( 'Y/m' ) . '/' . bin2hex( random_bytes( 12 ) );
		if ( ! wp_mkdir_p( $dir ) ) {
			throw new \RuntimeException( 'Cannot create upload directory.' );
		}
		return $dir;
	}

	/**
	 * Path relative to the private root, for storing in the database.
	 *
	 * @param string $absolute Absolute path inside the root.
	 */
	public function relative( string $absolute ): string {
		return ltrim( substr( $absolute, strlen( $this->root() ) ), '/' );
	}

	/**
	 * Absolute path for a stored relative path; null if it escapes the root.
	 *
	 * @param string $relative Path from the database.
	 */
	public function absolute( string $relative ): ?string {
		if ( '' === $relative || str_contains( $relative, '..' ) || str_contains( $relative, "\0" ) ) {
			return null;
		}
		$path = $this->root() . '/' . ltrim( $relative, '/' );
		return is_file( $path ) ? $path : null;
	}

	/**
	 * Remove a directory created by newUploadDir() and its files.
	 *
	 * @param string $dir Absolute directory path.
	 */
	public function removeDir( string $dir ): void {
		if ( ! str_starts_with( $dir, $this->root() . '/u/' ) || ! is_dir( $dir ) ) {
			return;
		}
		foreach ( (array) glob( $dir . '/*' ) as $file ) {
			wp_delete_file( (string) $file );
		}
		rmdir( $dir ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- our own private directory.
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
