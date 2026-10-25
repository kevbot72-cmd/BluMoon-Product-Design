<?php
/**
 * Admin screens.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Admin;

use Blumoon\ProductStudio\Container;
use Blumoon\ProductStudio\Infrastructure\AssetLoader;
use Blumoon\ProductStudio\ServiceProvider;

/**
 * Adds the "Product Studio" menu and mounts the React admin app.
 */
final class AdminProvider implements ServiceProvider {

	public const SLUG   = 'bps';
	public const HANDLE = 'bps-admin';
	public const ENTRY  = 'packages/admin/src/main.tsx';

	/**
	 * {@inheritDoc}
	 *
	 * @param Container $container Service container.
	 */
	public function register( Container $container ): void {
		$container->set( AdminPage::class, static fn ( Container $c ): AdminPage => new AdminPage( $c->get( AssetLoader::class ) ) );
	}

	/**
	 * {@inheritDoc}
	 *
	 * @param Container $container Service container.
	 */
	public function boot( Container $container ): void {
		if ( ! is_admin() ) {
			return;
		}
		$page = $container->get( AdminPage::class );
		add_action( 'admin_menu', array( $page, 'addMenu' ) );
		add_action( 'admin_enqueue_scripts', array( $page, 'enqueue' ) );
	}
}
