<?php
/**
 * Result of the image pipeline.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Infrastructure\Image;

/**
 * A cleaned original (for print) and an optional web preview (for the editor).
 */
final class ProcessedImage {

	/**
	 * Constructor.
	 *
	 * @param string      $kind         'image' or 'svg'.
	 * @param string      $mime         MIME type of the stored original.
	 * @param int         $width        Pixel width (SVG: from width/viewBox).
	 * @param int         $height       Pixel height.
	 * @param string      $originalPath Absolute path of the cleaned original.
	 * @param string|null $previewPath  Absolute path of the ≤2048 px WebP preview; null for SVG.
	 */
	public function __construct(
		public readonly string $kind,
		public readonly string $mime,
		public readonly int $width,
		public readonly int $height,
		public readonly string $originalPath,
		public readonly ?string $previewPath
	) {}
}
