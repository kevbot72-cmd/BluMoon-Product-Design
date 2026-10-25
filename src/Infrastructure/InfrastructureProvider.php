<?php
/**
 * Infrastructure services.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Infrastructure;

use Blumoon\ProductStudio\Container;
use Blumoon\ProductStudio\Infrastructure\Image\ImagePipeline;
use Blumoon\ProductStudio\Infrastructure\Image\SvgSanitizer;
use Blumoon\ProductStudio\Infrastructure\Repository\UploadRepository;
use Blumoon\ProductStudio\Migration\Tables;
use Blumoon\ProductStudio\ServiceProvider;

/**
 * Settings, storage, guest identity, assets and table upgrades.
 */
final class InfrastructureProvider implements ServiceProvider {

	/**
	 * {@inheritDoc}
	 *
	 * @param Container $container Service container.
	 */
	public function register( Container $container ): void {
		$container->set( Settings::class, static fn (): Settings => new Settings() );
		$container->set( Storage::class, static fn (): Storage => new Storage() );
		$container->set( Tables::class, static fn (): Tables => new Tables() );
		$container->set( SvgSanitizer::class, static fn (): SvgSanitizer => new SvgSanitizer() );
		$container->set(
			ImagePipeline::class,
			static fn ( Container $c ): ImagePipeline => new ImagePipeline(
				(int) $c->get( Settings::class )->get( 'uploads.maxMb' ) * MB_IN_BYTES,
				(int) $c->get( Settings::class )->get( 'uploads.maxPx' ),
				(array) $c->get( Settings::class )->get( 'uploads.formats' ),
				$c->get( SvgSanitizer::class )
			)
		);
		$container->set( UploadRepository::class, static fn (): UploadRepository => new UploadRepository() );
		$container->set( RateLimiter::class, static fn (): RateLimiter => new RateLimiter() );
		// A key derived from the site's auth salt, separate from WordPress's own uses of it.
		$container->set( SignedUrls::class, static fn (): SignedUrls => new SignedUrls( hash_hmac( 'sha256', 'bps-signed-files', wp_salt( 'auth' ) ) ) );
		$container->set(
			GuestToken::class,
			static fn ( Container $c ): GuestToken => new GuestToken(
				$_COOKIE, // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- validated by GuestToken::isValid().
				(int) $c->get( Settings::class )->get( 'privacy.retentionDays' ) * DAY_IN_SECONDS
			)
		);
		$container->set(
			AssetLoader::class,
			static fn (): AssetLoader => new AssetLoader(
				plugin_dir_path( BPS_FILE ) . 'assets/dist',
				plugin_dir_url( BPS_FILE ) . 'assets/dist',
				defined( 'BPS_VITE_DEV_SERVER' ) ? (string) constant( 'BPS_VITE_DEV_SERVER' ) : null
			)
		);
	}

	/**
	 * {@inheritDoc}
	 *
	 * @param Container $container Service container.
	 */
	public function boot( Container $container ): void {
		$container->get( Tables::class )->maybeUpgrade();
	}
}
