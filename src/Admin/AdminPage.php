<?php
/**
 * The Product Studio admin page.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Admin;

use Blumoon\ProductStudio\Infrastructure\AssetLoader;

/**
 * Renders the mount point for the React admin app and loads its bundle.
 */
final class AdminPage {

	/**
	 * Hook suffix of our page, set when the menu is added.
	 *
	 * @var string
	 */
	private string $hook = '';

	/**
	 * Constructor.
	 *
	 * @param AssetLoader $assets Vite asset loader.
	 */
	public function __construct( private readonly AssetLoader $assets ) {}

	/**
	 * Add the top-level menu.
	 */
	public function addMenu(): void {
		$this->hook = (string) add_menu_page(
			__( 'Product Studio', 'blumoon-product-studio' ),
			__( 'Product Studio', 'blumoon-product-studio' ),
			'manage_woocommerce',
			AdminProvider::SLUG,
			array( $this, 'render' ),
			'dashicons-art',
			56
		);
	}

	/**
	 * Load the admin bundle on our page only.
	 *
	 * @param string $hookSuffix Current admin page hook.
	 */
	public function enqueue( string $hookSuffix ): void {
		if ( '' === $this->hook || $hookSuffix !== $this->hook ) {
			return;
		}
		if ( $this->assets->register( AdminProvider::HANDLE, AdminProvider::ENTRY, array( 'wp-api-fetch' ) ) ) {
			$this->assets->enqueue( AdminProvider::HANDLE );
			wp_enqueue_style( 'wp-components' );
		}
	}

	/**
	 * Page markup: a mount point, with a notice when the build is missing.
	 */
	public function render(): void {
		echo '<div class="wrap"><div id="bps-admin-root">';
		if ( ! wp_script_is( AdminProvider::HANDLE, 'enqueued' ) ) {
			echo '<div class="notice notice-error inline"><p>';
			echo esc_html__( 'The Product Studio admin app has not been built. Run "npm ci && npm run build", or install a release zip.', 'blumoon-product-studio' );
			echo '</p></div>';
		}
		echo '</div></div>';
	}
}
