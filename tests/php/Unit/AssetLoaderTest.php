<?php
/**
 * Asset loader tests.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Tests\Unit;

use Blumoon\ProductStudio\Infrastructure\AssetLoader;
use Brain\Monkey\Functions;

final class AssetLoaderTest extends TestCase {

	private string $dist;

	/**
	 * Calls to wp_register_script / wp_register_style.
	 *
	 * @var array<string, list<array<int, mixed>>>
	 */
	private array $calls = array(
		'script' => array(),
		'style'  => array(),
	);

	protected function set_up(): void {
		parent::set_up();
		$this->dist = sys_get_temp_dir() . '/bps-dist-' . bin2hex( random_bytes( 4 ) );
		mkdir( $this->dist . '/.vite', 0777, true );
		file_put_contents(
			$this->dist . '/.vite/manifest.json',
			json_encode(
				array(
					'packages/admin/src/main.tsx' => array(
						'file'    => 'assets/admin-AbC123.js',
						'isEntry' => true,
						'css'     => array( 'assets/admin-Def456.css' ),
						'imports' => array( '_shared-Xyz.js' ),
					),
					'_shared-Xyz.js'              => array(
						'file'    => 'assets/shared-Xyz.js',
						'css'     => array( 'assets/shared-Q1.css' ),
						'imports' => array( 'packages/admin/src/main.tsx' ),
					),
				)
			)
		);
		file_put_contents( $this->dist . '/wp-deps.json', json_encode( array( 'packages/admin/src/main.tsx' => array( 'wp-element', 'wp-i18n' ) ) ) );

		Functions\when( 'trailingslashit' )->alias( static fn ( string $s ): string => rtrim( $s, '/' ) . '/' );
		Functions\when( 'untrailingslashit' )->alias( static fn ( string $s ): string => rtrim( $s, '/' ) );
		Functions\when( 'add_filter' )->justReturn( true );
		Functions\when( 'wp_script_is' )->justReturn( false );
		Functions\when( 'wp_set_script_translations' )->justReturn( true );
		Functions\when( 'wp_register_script' )->alias(
			function ( ...$args ): bool {
				$this->calls['script'][] = $args;
				return true;
			}
		);
		Functions\when( 'wp_register_style' )->alias(
			function ( ...$args ): bool {
				$this->calls['style'][] = $args;
				return true;
			}
		);
	}

	protected function tear_down(): void {
		array_map( 'unlink', array( $this->dist . '/.vite/manifest.json', $this->dist . '/wp-deps.json' ) );
		rmdir( $this->dist . '/.vite' );
		rmdir( $this->dist );
		parent::tear_down();
	}

	public function test_registers_entry_with_wp_deps_css_and_no_version(): void {
		$loader = new AssetLoader( $this->dist, 'https://shop.test/wp-content/plugins/bps/assets/dist' );

		$this->assertTrue( $loader->register( 'bps-admin', 'packages/admin/src/main.tsx', array( 'wp-api-fetch' ) ) );

		$script = $this->calls['script'][0];
		$this->assertSame( 'bps-admin', $script[0] );
		$this->assertSame( 'https://shop.test/wp-content/plugins/bps/assets/dist/assets/admin-AbC123.js', $script[1] );
		$this->assertSame( array( 'wp-api-fetch', 'wp-element', 'wp-i18n' ), $script[2] );
		$this->assertNull( $script[3] );

		$styles = array_column( $this->calls['style'], 1, 0 );
		$this->assertSame( 'https://shop.test/wp-content/plugins/bps/assets/dist/assets/admin-Def456.css', $styles['bps-admin-0'] );
		$this->assertSame( 'https://shop.test/wp-content/plugins/bps/assets/dist/assets/shared-Q1.css', $styles['bps-admin-1'] );
		$this->assertFalse( $styles['bps-admin'] );
	}

	public function test_missing_entry_returns_false(): void {
		$loader = new AssetLoader( $this->dist, 'https://shop.test/dist' );
		$this->assertFalse( $loader->register( 'bps-x', 'packages/nope/src/main.ts' ) );
		$this->assertSame( array(), $this->calls['script'] );
	}

	public function test_missing_build_returns_false(): void {
		$loader = new AssetLoader( '/does/not/exist', 'https://shop.test/dist' );
		$this->assertFalse( $loader->register( 'bps-admin', 'packages/admin/src/main.tsx' ) );
	}

	public function test_tag_becomes_module_with_preloads(): void {
		$loader = new AssetLoader( $this->dist, 'https://shop.test/dist' );
		$loader->register( 'bps-admin', 'packages/admin/src/main.tsx' );

		$tag = $loader->filterTag( "<script type='text/javascript' src=\"https://shop.test/dist/assets/admin-AbC123.js\" id=\"bps-admin-js\"></script>\n", 'bps-admin' );

		$this->assertStringContainsString( '<link rel="modulepreload" href="https://shop.test/dist/assets/shared-Xyz.js">', $tag );
		$this->assertStringContainsString( '<script type="module" src="https://shop.test/dist/assets/admin-AbC123.js" id="bps-admin-js">', $tag );
		$this->assertStringNotContainsString( 'text/javascript', $tag );
	}

	public function test_translation_inline_script_is_not_made_a_module(): void {
		$loader = new AssetLoader( $this->dist, 'https://shop.test/dist' );
		$loader->register( 'bps-admin', 'packages/admin/src/main.tsx' );

		$tag = $loader->filterTag( '<script id="bps-admin-js-translations">x</script><script src="a.js" id="bps-admin-js"></script>', 'bps-admin' );

		$this->assertStringContainsString( '<script id="bps-admin-js-translations">', $tag );
		$this->assertStringContainsString( '<script type="module" src="a.js" id="bps-admin-js">', $tag );
	}

	public function test_translations_use_the_stable_entry_path(): void {
		$loader = new AssetLoader( $this->dist, 'https://shop.test/dist' );
		$loader->register( 'bps-admin', 'packages/admin/src/main.tsx' );

		$this->assertSame( 'packages/admin/src/main.tsx', $loader->filterTranslationPath( 'assets/dist/js/admin-AbC123.js', 'https://shop.test/dist/assets/admin-AbC123.js' ) );
		$this->assertSame( 'wp-includes/js/x.js', $loader->filterTranslationPath( 'wp-includes/js/x.js', 'https://shop.test/wp-includes/js/x.js' ) );
	}

	public function test_other_handles_are_untouched(): void {
		$loader = new AssetLoader( $this->dist, 'https://shop.test/dist' );
		$tag    = '<script src="x.js" id="jquery-js"></script>';
		$this->assertSame( $tag, $loader->filterTag( $tag, 'jquery' ) );
	}

	public function test_dev_server_mode_loads_from_vite(): void {
		$loader = new AssetLoader( $this->dist, 'https://shop.test/dist', 'http://localhost:5173/' );
		$loader->register( 'bps-admin', 'packages/admin/src/main.tsx' );

		$this->assertSame( 'http://localhost:5173/@vite/client', $this->calls['script'][0][1] );
		$this->assertSame( 'http://localhost:5173/packages/admin/src/main.tsx', $this->calls['script'][1][1] );
		$this->assertContains( 'bps-vite-client', $this->calls['script'][1][2] );
	}
}
