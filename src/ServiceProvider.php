<?php
/**
 * Service provider contract.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio;

/**
 * Registers a feature's services, then hooks them into WordPress.
 */
interface ServiceProvider {

	/**
	 * Register factories. Must not touch WordPress hooks.
	 *
	 * @param Container $container Service container.
	 */
	public function register( Container $container ): void;

	/**
	 * Add WordPress hooks. Runs after every provider has registered.
	 *
	 * @param Container $container Service container.
	 */
	public function boot( Container $container ): void;
}
