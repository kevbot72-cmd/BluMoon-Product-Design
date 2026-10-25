<?php
/**
 * Minimal service container.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio;

use LogicException;

/**
 * Lazily builds shared services from registered factories.
 */
final class Container {

	/**
	 * Factories keyed by service id.
	 *
	 * @var array<string, callable(Container): object>
	 */
	private array $factories = array();

	/**
	 * Built services keyed by service id.
	 *
	 * @var array<string, object>
	 */
	private array $instances = array();

	/**
	 * Register a factory. The service is built once, on first get().
	 *
	 * @param string                     $id      Service id, usually a class name.
	 * @param callable(Container):object $factory Builds the service.
	 * @throws LogicException When the service was already built.
	 */
	public function set( string $id, callable $factory ): void {
		if ( isset( $this->instances[ $id ] ) ) {
			throw new LogicException( "Service {$id} is already built and cannot be replaced." );
		}
		$this->factories[ $id ] = $factory;
	}

	/**
	 * Whether a service is registered.
	 *
	 * @param string $id Service id.
	 */
	public function has( string $id ): bool {
		return isset( $this->factories[ $id ] ) || isset( $this->instances[ $id ] );
	}

	/**
	 * Get a service, building it on first use.
	 *
	 * @template T of object
	 * @param class-string<T> $id Service id.
	 * @return T
	 * @throws LogicException When the service is unknown or the factory returns the wrong type.
	 */
	public function get( string $id ): object {
		if ( ! isset( $this->instances[ $id ] ) ) {
			if ( ! isset( $this->factories[ $id ] ) ) {
				throw new LogicException( "Service {$id} is not registered." );
			}
			$service = ( $this->factories[ $id ] )( $this );
			if ( ! $service instanceof $id ) {
				throw new LogicException( "Factory for {$id} returned " . get_class( $service ) . '.' );
			}
			$this->instances[ $id ] = $service;
		}
		/** @var T */
		return $this->instances[ $id ];
	}
}
