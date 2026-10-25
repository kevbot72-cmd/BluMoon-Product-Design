<?php
/**
 * Data rejected by schema validation.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Domain;

use InvalidArgumentException;

/**
 * Thrown when stored or submitted JSON does not match its schema.
 */
final class InvalidData extends InvalidArgumentException {

	/**
	 * Constructor.
	 *
	 * @param string       $what     What was being validated, e.g. "Blueprint".
	 * @param list<string> $problems Problems from SchemaValidator.
	 */
	public function __construct( string $what, public readonly array $problems ) {
		parent::__construct( $what . ' is invalid: ' . implode( '; ', $problems ) );
	}
}
