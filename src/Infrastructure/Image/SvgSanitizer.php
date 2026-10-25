<?php
/**
 * SVG cleaning for shopper uploads and the clipart library.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Infrastructure\Image;

use enshrined\svgSanitize\Sanitizer;

/**
 * Removes scripts, event handlers, foreignObject and external references
 * (enshrined/svg-sanitize), and reads the drawing's size.
 */
final class SvgSanitizer {

	/**
	 * Return sanitised SVG markup, or null when it isn't a usable SVG.
	 *
	 * @param string $svg Raw SVG.
	 */
	public function sanitize( string $svg ): ?string {
		// Entities are a classic XXE / billion-laughs vector and never needed in artwork.
		if ( 1 === preg_match( '/<!DOCTYPE|<!ENTITY/i', $svg ) ) {
			return null;
		}
		$sanitizer = new Sanitizer();
		$sanitizer->removeRemoteReferences( true );
		$sanitizer->removeXMLTag( true );
		$clean = $sanitizer->sanitize( $svg );
		if ( false === $clean || 1 !== preg_match( '/^\s*<svg[\s>]/i', $clean ) ) {
			return null;
		}
		return $clean;
	}

	/**
	 * Width and height in user units from width/height, falling back to viewBox.
	 *
	 * @param string $svg Sanitised SVG.
	 * @return array{0: int, 1: int}
	 */
	public function size( string $svg ): array {
		$previous = libxml_use_internal_errors( true );
		$xml      = simplexml_load_string( $svg, \SimpleXMLElement::class, LIBXML_NONET );
		libxml_use_internal_errors( $previous );
		if ( false === $xml ) {
			return array( 1000, 1000 );
		}
		$attrs  = $xml->attributes();
		$width  = $this->length( (string) ( $attrs['width'] ?? '' ) );
		$height = $this->length( (string) ( $attrs['height'] ?? '' ) );
		if ( ( null === $width || null === $height ) && isset( $attrs['viewBox'] ) ) {
			$box = preg_split( '/[\s,]+/', trim( (string) $attrs['viewBox'] ) );
			if ( is_array( $box ) && 4 === count( $box ) ) {
				$width  = (float) $box[2];
				$height = (float) $box[3];
			}
		}
		if ( null === $width || null === $height || $width <= 0 || $height <= 0 ) {
			return array( 1000, 1000 );
		}
		return array( max( 1, (int) round( $width ) ), max( 1, (int) round( $height ) ) );
	}

	/**
	 * Parse an SVG length like "120", "120px" or "50mm" into a number; null for %/empty.
	 *
	 * @param string $value Attribute value.
	 */
	private function length( string $value ): ?float {
		if ( 1 !== preg_match( '/^\s*([0-9.]+)\s*(px|pt|mm|cm|in)?\s*$/i', $value, $m ) ) {
			return null;
		}
		$factor = array(
			''   => 1.0,
			'px' => 1.0,
			'pt' => 96 / 72,
			'mm' => 96 / 25.4,
			'cm' => 96 / 2.54,
			'in' => 96.0,
		);
		return (float) $m[1] * $factor[ strtolower( $m[2] ?? '' ) ];
	}
}
