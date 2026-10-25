<?php
/**
 * Data the shopper editor needs to open a product.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Domain\Editor;

use Blumoon\ProductStudio\Domain\Blueprint\BlueprintRepository;
use Blumoon\ProductStudio\Domain\Product\ProductConfigRepository;
use Blumoon\ProductStudio\Infrastructure\Settings;
use WC_Product;

/**
 * Builds the editor bootstrap payload for a product. Contains no per-user
 * data, so responses can be cached per product.
 */
final class EditorBootstrap {

	/**
	 * Image size used for base and overlay images in the editor.
	 */
	public const IMAGE_SIZE = '2048x2048';

	/**
	 * Constructor.
	 *
	 * @param ProductConfigRepository $configs    Product configs.
	 * @param BlueprintRepository     $blueprints Blueprints.
	 * @param Settings                $settings   Settings.
	 */
	public function __construct(
		private readonly ProductConfigRepository $configs,
		private readonly BlueprintRepository $blueprints,
		private readonly Settings $settings
	) {}

	/**
	 * Build the payload.
	 *
	 * @param int $productId   Product id.
	 * @param int $variationId Variation id, or 0.
	 * @return array<string, mixed>
	 * @throws EditorUnavailable When the product can't be customised.
	 */
	public function build( int $productId, int $variationId = 0 ): array {
		$product = wc_get_product( $productId );
		if ( ! $product instanceof WC_Product || 'publish' !== $product->get_status() || ! $product->is_visible() ) {
			throw new EditorUnavailable( 'product_not_found', __( 'This product is not available.', 'blumoon-product-studio' ), 404 );
		}
		$config = $this->configs->enabled( $productId );
		if ( null === $config ) {
			throw new EditorUnavailable( 'not_customizable', __( 'This product cannot be customised.', 'blumoon-product-studio' ), 404 );
		}

		$priced = $product;
		if ( $variationId > 0 ) {
			$variation = wc_get_product( $variationId );
			if ( ! $variation instanceof WC_Product || $variation->get_parent_id() !== $productId ) {
				throw new EditorUnavailable( 'variation_not_found', __( 'That product option is not available.', 'blumoon-product-studio' ), 404 );
			}
			$priced = $variation;
		}

		// Gallery Mockup mode arrives in Phase 4; until then only blueprints are served.
		if ( ! in_array( 'template', (array) $config['modes'], true ) || empty( $config['blueprintId'] ) ) {
			throw new EditorUnavailable( 'mode_unavailable', __( 'This product cannot be customised yet.', 'blumoon-product-studio' ), 404 );
		}
		$blueprint = $this->blueprints->get( (int) $config['blueprintId'] );
		if ( null === $blueprint ) {
			throw new EditorUnavailable( 'blueprint_missing', __( 'This product cannot be customised right now.', 'blumoon-product-studio' ), 404 );
		}

		$sides = array();
		foreach ( $blueprint['sides'] as $side ) {
			$resolved = $this->side( $side );
			if ( null !== $resolved ) {
				$sides[] = $resolved;
			}
		}
		if ( array() === $sides ) {
			throw new EditorUnavailable( 'images_missing', __( 'This product cannot be customised right now.', 'blumoon-product-studio' ), 404 );
		}

		$data = array(
			'product'      => array(
				'id'          => $productId,
				'variationId' => $variationId,
				'name'        => $priced->get_name(),
				'price'       => (float) wc_get_price_to_display( $priced ),
				'url'         => $product->get_permalink(),
			),
			'currency'     => array(
				'code'              => get_woocommerce_currency(),
				'symbol'            => html_entity_decode( get_woocommerce_currency_symbol(), ENT_QUOTES ),
				'decimals'          => wc_get_price_decimals(),
				'decimalSeparator'  => wc_get_price_decimal_separator(),
				'thousandSeparator' => wc_get_price_thousand_separator(),
				'position'          => (string) get_option( 'woocommerce_currency_pos', 'left' ),
			),
			'mode'         => 'template',
			'modes'        => array( 'template' ),
			'blueprintId'  => (int) $config['blueprintId'],
			'sides'        => $sides,
			'colors'       => $blueprint['colors'] ?? array(),
			'defaultColor' => $blueprint['defaultColor'] ?? null,
			'settings'     => array(
				'defaultDpi'  => (int) $this->settings->get( 'quality.defaultDpi' ),
				'warnDpi'     => (int) $this->settings->get( 'quality.warnDpi' ),
				'autosave'    => (bool) $this->settings->get( 'general.autosave' ),
				'guestSaving' => (bool) $this->settings->get( 'general.guestSaving' ),
				'uploads'     => array(
					'maxMb'   => (int) $this->settings->get( 'uploads.maxMb' ),
					'maxPx'   => (int) $this->settings->get( 'uploads.maxPx' ),
					'formats' => $this->settings->get( 'uploads.formats' ),
				),
			),
		);

		/**
		 * Filters the data the editor opens with.
		 *
		 * @param array<string, mixed> $data        Bootstrap payload.
		 * @param int                  $productId   Product id.
		 * @param int                  $variationId Variation id or 0.
		 */
		return (array) apply_filters( 'bps/editor/bootstrap_data', $data, $productId, $variationId );
	}

	/**
	 * Resolve a side's images to URLs; null when its base image is gone.
	 *
	 * @param array<string, mixed> $side Side definition.
	 * @return array<string, mixed>|null
	 */
	private function side( array $side ): ?array {
		$base = $this->image( $side['base'] ?? null );
		if ( null === $base ) {
			return null;
		}
		return array(
			'id'         => $side['id'],
			'label'      => $side['label'],
			'base'       => $base,
			'overlay'    => $this->image( $side['overlay'] ?? null, array( 'blend' => $side['overlay']['blend'] ?? 'multiply' ) ),
			'mask'       => $this->image( $side['mask'] ?? null ),
			'printAreas' => $side['printAreas'],
		);
	}

	/**
	 * An attachment's editor-sized URL and its original pixel size.
	 *
	 * @param mixed                $ref   ImageRef array or null.
	 * @param array<string, mixed> $extra Extra keys to merge in.
	 * @return array<string, mixed>|null
	 */
	private function image( mixed $ref, array $extra = array() ): ?array {
		if ( ! is_array( $ref ) || empty( $ref['attachmentId'] ) ) {
			return null;
		}
		$id  = (int) $ref['attachmentId'];
		$src = wp_get_attachment_image_src( $id, self::IMAGE_SIZE );
		if ( false === $src ) {
			return null;
		}
		$meta = wp_get_attachment_metadata( $id );
		return array_merge(
			array(
				'attachmentId' => $id,
				'url'          => $src[0],
				'widthPx'      => (int) ( is_array( $meta ) && isset( $meta['width'] ) ? $meta['width'] : $ref['widthPx'] ),
				'heightPx'     => (int) ( is_array( $meta ) && isset( $meta['height'] ) ? $meta['height'] : $ref['heightPx'] ),
			),
			$extra
		);
	}
}
