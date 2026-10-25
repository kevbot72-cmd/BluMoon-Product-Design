<?php
/**
 * Validates JSON against the schemas generated from the Zod definitions.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Domain\Schema;

use Opis\JsonSchema\Errors\ErrorFormatter;
use Opis\JsonSchema\Validator;

/**
 * Validates raw JSON (not decoded arrays: decoding to arrays loses the
 * difference between {} and [], which the schemas care about).
 */
final class SchemaValidator {

	public const DESIGN_DOCUMENT = 'design-document.v1';
	public const PRODUCT_CONFIG  = 'product-config.v1';
	public const BLUEPRINT       = 'blueprint.v1';

	/**
	 * Decoded schemas by name.
	 *
	 * @var array<string, object>
	 */
	private array $schemas = array();

	/**
	 * Constructor.
	 *
	 * @param string $schemaDir Directory holding <name>.json files (schema/json).
	 */
	public function __construct( private readonly string $schemaDir ) {}

	/**
	 * Validate a JSON string.
	 *
	 * @param string $schema One of the class constants.
	 * @param string $json   JSON text.
	 * @return list<string> Problems as "path: message"; empty when valid.
	 */
	public function validateJson( string $schema, string $json ): array {
		$data = json_decode( $json );
		if ( JSON_ERROR_NONE !== json_last_error() ) {
			return array( '/: ' . json_last_error_msg() );
		}
		return $this->validate( $schema, $data );
	}

	/**
	 * Validate already-decoded JSON (objects, not associative arrays).
	 *
	 * @param string $schema One of the class constants.
	 * @param mixed  $data   Result of json_decode() without $associative.
	 * @return list<string>
	 */
	public function validate( string $schema, mixed $data ): array {
		$validator = new Validator();
		$validator->setMaxErrors( 10 );
		$result = $validator->validate( $data, $this->schema( $schema ) );
		if ( $result->isValid() ) {
			return array();
		}
		$error = $result->error();
		if ( null === $error ) {
			return array( '/: invalid' );
		}
		$problems = array();
		foreach ( ( new ErrorFormatter() )->format( $error, true ) as $path => $messages ) {
			foreach ( (array) $messages as $message ) {
				$problems[] = ( '' === $path ? '/' : $path ) . ': ' . $message;
			}
		}
		return $problems;
	}

	/**
	 * Load and cache a schema file.
	 *
	 * @param string $name Schema name.
	 * @throws \InvalidArgumentException When the schema file is missing or broken.
	 */
	private function schema( string $name ): object {
		if ( ! isset( $this->schemas[ $name ] ) ) {
			$path = $this->schemaDir . '/' . basename( $name ) . '.json';
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local, shipped file.
			$schema = is_readable( $path ) ? json_decode( (string) file_get_contents( $path ) ) : null;
			if ( ! is_object( $schema ) ) {
				throw new \InvalidArgumentException( "Schema {$name} is missing or invalid." );
			}
			$this->schemas[ $name ] = $schema;
		}
		return $this->schemas[ $name ];
	}
}
