<?php
/**
 * Registers Vite build output with WordPress.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Infrastructure;

use Blumoon\ProductStudio\Plugin;

/**
 * Reads assets/dist/.vite/manifest.json (written by Vite) and
 * assets/dist/wp-deps.json (written by our externals plugin), and registers
 * each entry as an ES-module script with its CSS and WordPress dependencies.
 *
 * Define BPS_VITE_DEV_SERVER (e.g. 'http://localhost:5173') to load entries
 * from the Vite dev server instead.
 */
final class AssetLoader {

	/**
	 * Parsed manifest, or null until first read.
	 *
	 * @var array<string, array<string, mixed>>|null
	 */
	private ?array $manifest = null;

	/**
	 * WordPress script dependencies per entry.
	 *
	 * @var array<string, list<string>>|null
	 */
	private ?array $wpDeps = null;

	/**
	 * Handles that must print as type="module", mapped to chunk URLs to preload.
	 *
	 * @var array<string, list<string>>
	 */
	private array $modules = array();

	/**
	 * Entry source path keyed by built script URL, for translation lookups.
	 *
	 * @var array<string, string>
	 */
	private array $entryBySrc = array();

	/**
	 * Whether filterTag() is hooked.
	 *
	 * @var bool
	 */
	private bool $filterAdded = false;

	/**
	 * Constructor.
	 *
	 * @param string      $distDir   Absolute path of assets/dist.
	 * @param string      $distUrl   URL of assets/dist.
	 * @param string|null $devServer Vite dev server origin, or null for built assets.
	 */
	public function __construct(
		private readonly string $distDir,
		private readonly string $distUrl,
		private readonly ?string $devServer = null
	) {}

	/**
	 * Register an entry's script (and style, if it has CSS) under $handle.
	 *
	 * @param string       $handle Script and style handle.
	 * @param string       $entry  Entry source path as written in vite.config.ts, e.g. "packages/admin/src/main.tsx".
	 * @param list<string> $deps   Extra script dependencies.
	 * @return bool False when the entry isn't in the manifest (not built).
	 */
	public function register( string $handle, string $entry, array $deps = array() ): bool {
		$this->addModuleFilter();
		$deps = array_values( array_unique( array_merge( $deps, $this->wpDeps()[ $entry ] ?? array() ) ) );

		if ( null !== $this->devServer ) {
			$origin = untrailingslashit( $this->devServer );
			if ( ! wp_script_is( 'bps-vite-client', 'registered' ) ) {
				wp_register_script( 'bps-vite-client', "{$origin}/@vite/client", array(), null, true ); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion -- dev server.
				$this->modules['bps-vite-client'] = array();
			}
			wp_register_script( $handle, "{$origin}/{$entry}", array_merge( array( 'bps-vite-client' ), $deps ), null, true ); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion -- dev server.
			$this->modules[ $handle ] = array();
			$this->setTranslations( $handle, $deps );
			return true;
		}

		$manifest = $this->manifest();
		$chunk    = $manifest[ $entry ] ?? null;
		if ( ! is_array( $chunk ) || ! isset( $chunk['file'] ) ) {
			return false;
		}

		// Hashed file names carry the version, so no ?ver= query string.
		$src                      = $this->url( (string) $chunk['file'] );
		$this->entryBySrc[ $src ] = $entry;
		wp_register_script( $handle, $src, $deps, null, true ); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion -- hashed file name.

		[ $css, $preload ]        = $this->collect( $entry, $manifest );
		$this->modules[ $handle ] = array_map( array( $this, 'url' ), $preload );

		$styleDeps = array();
		foreach ( $css as $i => $file ) {
			$styleDeps[] = "{$handle}-{$i}";
			wp_register_style( "{$handle}-{$i}", $this->url( $file ), array(), null ); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion -- hashed file name.
		}
		if ( array() !== $styleDeps ) {
			wp_register_style( $handle, false, $styleDeps, BPS_VERSION );
		}

		$this->setTranslations( $handle, $deps );
		return true;
	}

	/**
	 * Enqueue a registered entry's script and style.
	 *
	 * @param string $handle Handle passed to register().
	 */
	public function enqueue( string $handle ): void {
		wp_enqueue_script( $handle );
		if ( wp_style_is( $handle, 'registered' ) ) {
			wp_enqueue_style( $handle );
		}
	}

	/**
	 * Print our handles as module scripts, preceded by modulepreload links for their chunks.
	 *
	 * @param string $tag    Script tag HTML.
	 * @param string $handle Script handle.
	 */
	public function filterTag( string $tag, string $handle ): string {
		if ( ! isset( $this->modules[ $handle ] ) ) {
			return $tag;
		}
		$id  = esc_attr( "{$handle}-js" );
		$tag = (string) preg_replace( '/<script\b([^>]*)\bid=([\'"])' . preg_quote( $id, '/' ) . '\2/', '<script type="module"$1id="' . $id . '"', $tag, 1 );
		$tag = (string) preg_replace( '/(<script type="module"[^>]*?)\s+type=([\'"])text\/javascript\2/', '$1', $tag, 1 );

		$links = '';
		foreach ( $this->modules[ $handle ] as $url ) {
			$links .= '<link rel="modulepreload" href="' . esc_url( $url ) . '">' . "\n";
		}
		return $links . $tag;
	}

	/**
	 * Report built scripts to WordPress under their stable entry path, so JSON
	 * translations (made with `wp i18n make-json --use-map assets/dist/i18n-map.json`)
	 * keep matching when the hashed file name changes.
	 *
	 * @param string|false $relative Path WordPress derived from the URL.
	 * @param string       $src      Script URL.
	 * @return string|false
	 */
	public function filterTranslationPath( string|false $relative, string $src ): string|false {
		return $this->entryBySrc[ $src ] ?? $relative;
	}

	/**
	 * CSS files and static JS imports reachable from an entry.
	 *
	 * @param string                              $key      Manifest key.
	 * @param array<string, array<string, mixed>> $manifest Parsed manifest.
	 * @param array<string, true>                 $seen     Visited keys.
	 * @return array{0: list<string>, 1: list<string>}
	 */
	private function collect( string $key, array $manifest, array &$seen = array() ): array {
		$css     = array();
		$preload = array();
		if ( isset( $seen[ $key ] ) || ! isset( $manifest[ $key ] ) ) {
			return array( $css, $preload );
		}
		$seen[ $key ] = true;
		$chunk        = $manifest[ $key ];
		foreach ( (array) ( $chunk['css'] ?? array() ) as $file ) {
			$css[] = (string) $file;
		}
		foreach ( (array) ( $chunk['imports'] ?? array() ) as $import ) {
			$import = (string) $import;
			if ( isset( $manifest[ $import ]['file'] ) ) {
				$preload[] = (string) $manifest[ $import ]['file'];
			}
			[ $moreCss, $morePreload ] = $this->collect( $import, $manifest, $seen );
			$css                       = array_merge( $css, $moreCss );
			$preload                   = array_merge( $preload, $morePreload );
		}
		return array( array_values( array_unique( $css ) ), array_values( array_unique( $preload ) ) );
	}

	/**
	 * Parsed Vite manifest; empty when the build is missing.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	private function manifest(): array {
		$this->manifest ??= $this->readJson( $this->distDir . '/.vite/manifest.json' );
		return $this->manifest;
	}

	/**
	 * WordPress dependencies per entry, written by the bps-wp-externals Vite plugin.
	 *
	 * @return array<string, list<string>>
	 */
	private function wpDeps(): array {
		if ( null === $this->wpDeps ) {
			$this->wpDeps = array();
			foreach ( $this->readJson( $this->distDir . '/wp-deps.json' ) as $entry => $deps ) {
				$this->wpDeps[ $entry ] = array_values( array_map( 'strval', (array) $deps ) );
			}
		}
		return $this->wpDeps;
	}

	/**
	 * Read a JSON object file.
	 *
	 * @param string $path Absolute path.
	 * @return array<string, mixed>
	 */
	private function readJson( string $path ): array {
		if ( ! is_readable( $path ) ) {
			return array();
		}
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local build file.
		$data = json_decode( (string) file_get_contents( $path ), true );
		return is_array( $data ) ? $data : array();
	}

	/**
	 * Public URL of a file in assets/dist.
	 *
	 * @param string $file Path relative to assets/dist.
	 */
	private function url( string $file ): string {
		return trailingslashit( $this->distUrl ) . ltrim( $file, '/' );
	}

	/**
	 * Load JSON translations when the entry uses wp-i18n.
	 *
	 * @param string       $handle Script handle.
	 * @param list<string> $deps   Script dependencies.
	 */
	private function setTranslations( string $handle, array $deps ): void {
		if ( in_array( 'wp-i18n', $deps, true ) ) {
			wp_set_script_translations( $handle, Plugin::TEXT_DOMAIN, dirname( $this->distDir, 2 ) . '/languages' );
		}
	}

	/**
	 * Hook the tag and translation filters once.
	 */
	private function addModuleFilter(): void {
		if ( ! $this->filterAdded ) {
			add_filter( 'script_loader_tag', array( $this, 'filterTag' ), 10, 2 );
			add_filter( 'load_script_textdomain_relative_path', array( $this, 'filterTranslationPath' ), 10, 2 );
			$this->filterAdded = true;
		}
	}
}
