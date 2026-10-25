<?php
/**
 * REST API routes.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Rest;

use Blumoon\ProductStudio\Container;
use Blumoon\ProductStudio\Infrastructure\Settings;
use Blumoon\ProductStudio\Infrastructure\Storage;
use Blumoon\ProductStudio\Migration\Tables;
use Blumoon\ProductStudio\ServiceProvider;

/**
 * Registers every controller under /wp-json/bps/v1.
 */
final class RestProvider implements ServiceProvider {

	/**
	 * Controller classes, registered on rest_api_init.
	 *
	 * @var list<class-string<Controller>>
	 */
	private const CONTROLLERS = array(
		HealthController::class,
	);

	/**
	 * {@inheritDoc}
	 *
	 * @param Container $container Service container.
	 */
	public function register( Container $container ): void {
		$container->set(
			HealthController::class,
			static fn ( Container $c ): HealthController => new HealthController(
				$c->get( Tables::class ),
				$c->get( Storage::class ),
				$c->get( Settings::class )
			)
		);
	}

	/**
	 * {@inheritDoc}
	 *
	 * @param Container $container Service container.
	 */
	public function boot( Container $container ): void {
		add_action(
			'rest_api_init',
			static function () use ( $container ): void {
				foreach ( self::CONTROLLERS as $class ) {
					$container->get( $class )->registerRoutes();
				}
			}
		);
	}
}
