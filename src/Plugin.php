<?php
/**
 * Plugin bootstrap.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio;

use Blumoon\ProductStudio\Admin\AdminProvider;
use Blumoon\ProductStudio\Domain\DomainProvider;
use Blumoon\ProductStudio\Infrastructure\InfrastructureProvider;
use Blumoon\ProductStudio\Rest\RestProvider;
use Blumoon\ProductStudio\Woo\Compat;
use Blumoon\ProductStudio\Woo\WooProvider;

/**
 * Wires providers together once WordPress and WooCommerce have loaded.
 */
final class Plugin {

	public const TEXT_DOMAIN = 'blumoon-product-studio';

	/**
	 * The booted plugin.
	 *
	 * @var self|null
	 */
	private static ?self $instance = null;

	/**
	 * Providers in boot order.
	 *
	 * @var list<ServiceProvider>
	 */
	private array $providers;

	/**
	 * Constructor.
	 *
	 * @param Container $container Service container.
	 */
	private function __construct( private readonly Container $container ) {
		$this->providers = array(
			new InfrastructureProvider(),
			new DomainProvider(),
			new RestProvider(),
			new AdminProvider(),
			new WooProvider(),
		);
	}

	/**
	 * Entry point, called once from the main plugin file.
	 */
	public static function boot(): void {
		if ( null !== self::$instance ) {
			return;
		}
		self::$instance = new self( new Container() );

		// WooCommerce reads compatibility declarations before plugins_loaded finishes.
		add_action( 'before_woocommerce_init', array( Compat::class, 'declare' ) );
		add_action( 'plugins_loaded', array( self::$instance, 'start' ), 20 );
	}

	/**
	 * Check requirements, then register and boot every provider.
	 */
	public function start(): void {
		$problems = Requirements::check(
			get_bloginfo( 'version' ),
			defined( 'WC_VERSION' ) ? (string) constant( 'WC_VERSION' ) : null
		);
		if ( array() !== $problems ) {
			Requirements::showNotices( $problems );
			return;
		}

		add_action( 'init', array( $this, 'loadTextDomain' ) );

		foreach ( $this->providers as $provider ) {
			$provider->register( $this->container );
		}
		foreach ( $this->providers as $provider ) {
			$provider->boot( $this->container );
		}

		/**
		 * Fires after Product Studio has booted.
		 *
		 * @param Container $container The plugin's service container.
		 */
		do_action( 'bps/loaded', $this->container );
	}

	/**
	 * Load translations for a plugin installed outside wordpress.org.
	 */
	public function loadTextDomain(): void {
		load_plugin_textdomain( self::TEXT_DOMAIN, false, dirname( plugin_basename( BPS_FILE ) ) . '/languages' );
	}
}
