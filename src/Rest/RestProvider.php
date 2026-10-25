<?php
/**
 * REST API routes.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Rest;

use Blumoon\ProductStudio\Assets\AssetLibrary;
use Blumoon\ProductStudio\Container;
use Blumoon\ProductStudio\Domain\Editor\EditorBootstrap;
use Blumoon\ProductStudio\Infrastructure\GuestToken;
use Blumoon\ProductStudio\Infrastructure\Image\ImagePipeline;
use Blumoon\ProductStudio\Infrastructure\RateLimiter;
use Blumoon\ProductStudio\Infrastructure\Repository\UploadRepository;
use Blumoon\ProductStudio\Infrastructure\Settings;
use Blumoon\ProductStudio\Infrastructure\SignedUrls;
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
		EditorController::class,
		UploadsController::class,
		AssetsController::class,
	);

	/**
	 * {@inheritDoc}
	 *
	 * @param Container $container Service container.
	 */
	public function register( Container $container ): void {
		$container->set( AssetsController::class, static fn ( Container $c ): AssetsController => new AssetsController( $c->get( AssetLibrary::class ) ) );
		$container->set(
			UploadsController::class,
			static fn ( Container $c ): UploadsController => new UploadsController(
				$c->get( ImagePipeline::class ),
				$c->get( UploadRepository::class ),
				$c->get( Storage::class ),
				$c->get( SignedUrls::class ),
				$c->get( GuestToken::class ),
				$c->get( RateLimiter::class ),
				$c->get( Settings::class )
			)
		);
		$container->set( EditorController::class, static fn ( Container $c ): EditorController => new EditorController( $c->get( EditorBootstrap::class ) ) );
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
		add_filter(
			'rest_pre_serve_request',
			static fn ( bool $served, \WP_HTTP_Response $result ): bool => $container->get( UploadsController::class )->serve( $served, $result ),
			10,
			2
		);
	}
}
