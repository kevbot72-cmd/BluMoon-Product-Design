<?php
/**
 * Domain services.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Domain;

use Blumoon\ProductStudio\Cli\Commands;
use Blumoon\ProductStudio\Container;
use Blumoon\ProductStudio\Domain\Blueprint\BlueprintRepository;
use Blumoon\ProductStudio\Domain\Editor\EditorBootstrap;
use Blumoon\ProductStudio\Domain\Product\ProductConfigRepository;
use Blumoon\ProductStudio\Domain\Schema\SchemaValidator;
use Blumoon\ProductStudio\Infrastructure\Settings;
use Blumoon\ProductStudio\ServiceProvider;

/**
 * Schemas, blueprints, product configs, the editor bootstrap and WP-CLI.
 */
final class DomainProvider implements ServiceProvider {

	/**
	 * {@inheritDoc}
	 *
	 * @param Container $container Service container.
	 */
	public function register( Container $container ): void {
		$container->set( SchemaValidator::class, static fn (): SchemaValidator => new SchemaValidator( plugin_dir_path( BPS_FILE ) . 'schema/json' ) );
		$container->set( BlueprintRepository::class, static fn ( Container $c ): BlueprintRepository => new BlueprintRepository( $c->get( SchemaValidator::class ) ) );
		$container->set( ProductConfigRepository::class, static fn ( Container $c ): ProductConfigRepository => new ProductConfigRepository( $c->get( SchemaValidator::class ) ) );
		$container->set(
			EditorBootstrap::class,
			static fn ( Container $c ): EditorBootstrap => new EditorBootstrap(
				$c->get( ProductConfigRepository::class ),
				$c->get( BlueprintRepository::class ),
				$c->get( Settings::class )
			)
		);
		$container->set( Commands::class, static fn ( Container $c ): Commands => new Commands( $c->get( BlueprintRepository::class ), $c->get( ProductConfigRepository::class ) ) );
	}

	/**
	 * {@inheritDoc}
	 *
	 * @param Container $container Service container.
	 */
	public function boot( Container $container ): void {
		add_action( 'init', array( BlueprintRepository::class, 'registerPostType' ) );
		if ( defined( 'WP_CLI' ) && WP_CLI ) {
			\WP_CLI::add_command( 'bps', $container->get( Commands::class ) );
		}
	}
}
