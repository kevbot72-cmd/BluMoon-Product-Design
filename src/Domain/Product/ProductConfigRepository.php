<?php
/**
 * Per-product Product Studio configuration.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Domain\Product;

use Blumoon\ProductStudio\Domain\InvalidData;
use Blumoon\ProductStudio\Domain\Schema\SchemaValidator;

/**
 * Reads and writes the _bps_config product meta (schema product-config.v1).
 */
final class ProductConfigRepository {

	public const META = '_bps_config';

	/**
	 * Constructor.
	 *
	 * @param SchemaValidator $validator Schema validator.
	 */
	public function __construct( private readonly SchemaValidator $validator ) {}

	/**
	 * The product's config, after the bps/product/config filter; null when
	 * not configured, invalid, or disabled.
	 *
	 * @param int $productId Product id (the parent, for variations).
	 * @return array<string, mixed>|null
	 */
	public function enabled( int $productId ): ?array {
		$config = $this->get( $productId );
		return null !== $config && true === ( $config['enabled'] ?? false ) ? $config : null;
	}

	/**
	 * The product's config, or null when absent or invalid.
	 *
	 * @param int $productId Product id.
	 * @return array<string, mixed>|null
	 */
	public function get( int $productId ): ?array {
		$json = (string) get_post_meta( $productId, self::META, true );
		if ( '' === $json || array() !== $this->validator->validateJson( SchemaValidator::PRODUCT_CONFIG, $json ) ) {
			return null;
		}
		$config = json_decode( $json, true );
		if ( ! is_array( $config ) ) {
			return null;
		}

		/**
		 * Filters a product's Product Studio configuration before use.
		 *
		 * @param array<string, mixed> $config    Validated config (product-config.v1).
		 * @param int                  $productId Product id.
		 */
		$filtered = apply_filters( 'bps/product/config', $config, $productId );
		return is_array( $filtered ) ? $filtered : null;
	}

	/**
	 * Save a product's config.
	 *
	 * @param int    $productId Product id.
	 * @param string $json      Config JSON.
	 * @throws InvalidData When the JSON doesn't match the schema.
	 */
	public function save( int $productId, string $json ): void {
		$problems = $this->validator->validateJson( SchemaValidator::PRODUCT_CONFIG, $json );
		if ( array() !== $problems ) {
			throw new InvalidData( 'Product configuration', $problems );
		}
		update_post_meta( $productId, self::META, wp_slash( $json ) );
	}
}
