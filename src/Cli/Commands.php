<?php
/**
 * WP-CLI commands: `wp bps …`.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Cli;

use Blumoon\ProductStudio\Domain\Blueprint\BlueprintRepository;
use Blumoon\ProductStudio\Domain\InvalidData;
use Blumoon\ProductStudio\Domain\Product\ProductConfigRepository;
use WP_CLI;

/**
 * Manage Product Studio blueprints and product settings from the command line.
 */
final class Commands {

	/**
	 * Constructor.
	 *
	 * @param BlueprintRepository     $blueprints Blueprints.
	 * @param ProductConfigRepository $configs    Product configs.
	 */
	public function __construct(
		private readonly BlueprintRepository $blueprints,
		private readonly ProductConfigRepository $configs
	) {}

	/**
	 * Create or update a blueprint from a JSON file (schema blueprint.v1).
	 *
	 * ## OPTIONS
	 *
	 * <file>
	 * : Path to the blueprint JSON.
	 *
	 * --title=<title>
	 * : Blueprint name.
	 *
	 * [--id=<id>]
	 * : Update this blueprint instead of creating one.
	 *
	 * [--porcelain]
	 * : Output just the blueprint id.
	 *
	 * ## EXAMPLES
	 *
	 *     wp bps blueprint-import mug.json --title="White mug 330 ml"
	 *
	 * @subcommand blueprint-import
	 * @param list<string>          $args  Positional arguments.
	 * @param array<string, string> $assoc Named arguments.
	 */
	public function blueprintImport( array $args, array $assoc ): void {
		$json = $this->readFile( $args[0] ?? '' );
		try {
			$id = $this->blueprints->save( (string) $assoc['title'], $json, isset( $assoc['id'] ) ? (int) $assoc['id'] : null );
		} catch ( InvalidData $e ) {
			WP_CLI::error( "Blueprint is invalid:\n  " . implode( "\n  ", $e->problems ) );
		}
		if ( isset( $assoc['porcelain'] ) ) {
			WP_CLI::line( (string) $id );
			return;
		}
		WP_CLI::success( "Saved blueprint {$id}." );
	}

	/**
	 * List blueprints.
	 *
	 * @subcommand blueprint-list
	 */
	public function blueprintList(): void {
		$rows = array();
		foreach ( $this->blueprints->titles() as $id => $title ) {
			$rows[] = array(
				'id'    => $id,
				'title' => $title,
			);
		}
		WP_CLI\Utils\format_items( 'table', $rows, array( 'id', 'title' ) );
	}

	/**
	 * Enable Product Studio on a product with a blueprint (Template mode).
	 *
	 * ## OPTIONS
	 *
	 * <product>
	 * : Product id.
	 *
	 * --blueprint=<id>
	 * : Blueprint id.
	 *
	 * @subcommand product-enable
	 * @param list<string>          $args  Positional arguments.
	 * @param array<string, string> $assoc Named arguments.
	 */
	public function productEnable( array $args, array $assoc ): void {
		$productId   = (int) ( $args[0] ?? 0 );
		$blueprintId = (int) $assoc['blueprint'];
		if ( ! wc_get_product( $productId ) ) {
			WP_CLI::error( "Product {$productId} not found." );
		}
		if ( null === $this->blueprints->get( $blueprintId ) ) {
			WP_CLI::error( "Blueprint {$blueprintId} not found or invalid." );
		}
		$config                = $this->configs->get( $productId ) ?? array(
			'schemaVersion' => 1,
			'modes'         => array( 'template' ),
			'defaultMode'   => 'template',
		);
		$config['enabled']     = true;
		$config['blueprintId'] = $blueprintId;
		try {
			$this->configs->save( $productId, (string) wp_json_encode( $config ) );
		} catch ( InvalidData $e ) {
			WP_CLI::error( "Configuration is invalid:\n  " . implode( "\n  ", $e->problems ) );
		}
		WP_CLI::success( "Product Studio enabled on product {$productId} with blueprint {$blueprintId}." );
	}

	/**
	 * Disable Product Studio on a product (keeps its settings).
	 *
	 * ## OPTIONS
	 *
	 * <product>
	 * : Product id.
	 *
	 * @subcommand product-disable
	 * @param list<string> $args Positional arguments.
	 */
	public function productDisable( array $args ): void {
		$productId = (int) ( $args[0] ?? 0 );
		$config    = $this->configs->get( $productId );
		if ( null === $config ) {
			WP_CLI::error( "Product {$productId} has no Product Studio configuration." );
		}
		$config['enabled'] = false;
		$this->configs->save( $productId, (string) wp_json_encode( $config ) );
		WP_CLI::success( "Product Studio disabled on product {$productId}." );
	}

	/**
	 * Read a file or exit with an error.
	 *
	 * @param string $path File path.
	 */
	private function readFile( string $path ): string {
		if ( '' === $path || ! is_readable( $path ) ) {
			WP_CLI::error( "Cannot read {$path}." );
		}
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local file given on the command line.
		return (string) file_get_contents( $path );
	}
}
