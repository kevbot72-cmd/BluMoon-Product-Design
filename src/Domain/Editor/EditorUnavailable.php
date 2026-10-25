<?php
/**
 * The editor can't open for a product.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Domain\Editor;

use RuntimeException;

/**
 * Carries a machine code, a shopper-facing message and an HTTP status.
 */
final class EditorUnavailable extends RuntimeException {

	/**
	 * Constructor.
	 *
	 * @param string $errorCode Machine-readable code, e.g. "not_customizable".
	 * @param string $message   Translated message for the shopper.
	 * @param int    $status    HTTP status.
	 */
	public function __construct( public readonly string $errorCode, string $message, public readonly int $status ) {
		parent::__construct( $message );
	}
}
