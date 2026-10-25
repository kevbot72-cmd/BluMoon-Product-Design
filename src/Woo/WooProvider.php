<?php
/**
 * WooCommerce storefront integration.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Woo;

use Blumoon\ProductStudio\Container;
use Blumoon\ProductStudio\Domain\Product\ProductConfigRepository;
use Blumoon\ProductStudio\Infrastructure\AssetLoader;
use Blumoon\ProductStudio\ServiceProvider;

/**
 * Product page button and launcher.
 */
final class WooProvider implements ServiceProvider {

	/**
	 * {@inheritDoc}
	 *
	 * @param Container $container Service container.
	 */
	public function register( Container $container ): void {
		$container->set( ProductPage::class, static fn ( Container $c ): ProductPage => new ProductPage( $c->get( ProductConfigRepository::class ), $c->get( AssetLoader::class ) ) );
	}

	/**
	 * {@inheritDoc}
	 *
	 * @param Container $container Service container.
	 */
	public function boot( Container $container ): void {
		$container->get( ProductPage::class )->register();
	}
}
