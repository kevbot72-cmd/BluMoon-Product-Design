<?php
/**
 * An upload that failed validation.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Infrastructure\Image;

use RuntimeException;

/**
 * Carries a machine code and a message the shopper can act on.
 */
final class UploadRejected extends RuntimeException {

	/**
	 * Constructor.
	 *
	 * @param string $reason  Machine code, e.g. "too_large".
	 * @param string $message Translated, actionable message.
	 */
	public function __construct( public readonly string $reason, string $message ) {
		parent::__construct( $message );
	}
}
