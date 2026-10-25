<?php
/**
 * The Customize button on product pages.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Woo;

use Blumoon\ProductStudio\Domain\Product\ProductConfigRepository;
use Blumoon\ProductStudio\Infrastructure\AssetLoader;

/**
 * Loads the small launcher script on enabled products only and renders the
 * Customize button. The editor itself is a lazy chunk loaded on click.
 */
final class ProductPage {

	public const HANDLE = 'bps-launcher';
	public const ENTRY  = 'packages/editor-ui/src/launcher.ts';

	/**
	 * Product id the launcher was enqueued for, or 0.
	 *
	 * @var int
	 */
	private int $productId = 0;

	/**
	 * Constructor.
	 *
	 * @param ProductConfigRepository $configs Product configs.
	 * @param AssetLoader             $assets  Asset loader.
	 */
	public function __construct(
		private readonly ProductConfigRepository $configs,
		private readonly AssetLoader $assets
	) {}

	/**
	 * Hook into WordPress.
	 */
	public function register(): void {
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue' ) );
		add_action( 'woocommerce_after_add_to_cart_button', array( $this, 'printButton' ) );
		add_shortcode( 'bps_customize_button', array( $this, 'shortcode' ) );
	}

	/**
	 * Enqueue the launcher on single product pages with Product Studio enabled.
	 */
	public function enqueue(): void {
		if ( ! is_product() ) {
			return;
		}
		$this->load( get_queried_object_id() );
	}

	/**
	 * Print the button inside the add-to-cart form.
	 */
	public function printButton(): void {
		global $product;
		if ( $product instanceof \WC_Product && $product->get_id() === $this->productId ) {
			echo $this->button( $this->productId ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in button().
		}
	}

	/**
	 * [bps_customize_button id="123"] — defaults to the current product.
	 *
	 * @param array<string, string>|string $atts Shortcode attributes.
	 */
	public function shortcode( array|string $atts ): string {
		$atts = shortcode_atts( array( 'id' => (string) get_the_ID() ), is_array( $atts ) ? $atts : array(), 'bps_customize_button' );
		$id   = absint( $atts['id'] );
		return $this->load( $id ) ? $this->button( $id ) : '';
	}

	/**
	 * Register and enqueue the launcher with its bootstrap data, once.
	 *
	 * @param int $productId Product id.
	 * @return bool Whether the product can be customised.
	 */
	private function load( int $productId ): bool {
		if ( $productId <= 0 || null === $this->configs->enabled( $productId ) ) {
			return false;
		}
		if ( 0 === $this->productId && $this->assets->register( self::HANDLE, self::ENTRY ) ) {
			wp_add_inline_script(
				self::HANDLE,
				'window.bpsLauncher = ' . wp_json_encode(
					array(
						'restRoot' => esc_url_raw( rest_url() ),
						// Logged-in shoppers need a REST nonce; guests are identified by their own cookie.
						'nonce'    => is_user_logged_in() ? wp_create_nonce( 'wp_rest' ) : '',
					)
				) . ';',
				'before'
			);
			$this->assets->enqueue( self::HANDLE );
		}
		$this->productId = $productId;
		return true;
	}

	/**
	 * Button markup.
	 *
	 * @param int $productId Product id.
	 */
	private function button( int $productId ): string {
		return sprintf(
			'<button type="button" class="button alt bps-customize" data-bps-customize="%1$d">%2$s</button>',
			$productId,
			esc_html__( 'Customize', 'blumoon-product-studio' )
		);
	}
}
