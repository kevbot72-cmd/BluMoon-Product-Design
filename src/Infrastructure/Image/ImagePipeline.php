<?php
/**
 * Validates, cleans and derives shopper uploads.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Infrastructure\Image;

use GdImage;
use Imagick;

/**
 * Every raster upload is decoded and re-encoded (which drops any payload
 * hidden in the file and all EXIF/GPS data) after its orientation is
 * applied. The cleaned original is kept for print; a ≤2048 px WebP preview
 * is made for the editor. SVGs are sanitised instead.
 */
final class ImagePipeline {

	public const PREVIEW_MAX = 2048;
	public const MAX_PIXELS  = 100_000_000;

	/**
	 * Sniffed MIME type → settings format key.
	 */
	private const FORMATS = array(
		'image/jpeg'    => 'jpg',
		'image/png'     => 'png',
		'image/webp'    => 'webp',
		'image/svg+xml' => 'svg',
		'image/heic'    => 'heic',
	);

	/**
	 * Constructor.
	 *
	 * @param int          $maxBytes Largest accepted file.
	 * @param int          $maxPx    Longest accepted side in pixels.
	 * @param list<string> $formats  Accepted format keys (jpg, png, webp, svg, heic).
	 * @param SvgSanitizer $svg      SVG sanitiser.
	 * @param bool|null    $imagick  Use Imagick; null = when the extension is loaded.
	 */
	public function __construct(
		private readonly int $maxBytes,
		private readonly int $maxPx,
		private readonly array $formats,
		private readonly SvgSanitizer $svg,
		private ?bool $imagick = null
	) {
		$this->imagick ??= extension_loaded( 'imagick' ) && class_exists( Imagick::class );
	}

	/**
	 * Process an uploaded file into $destDir (which must exist and be empty).
	 *
	 * @param string $tmpPath Uploaded file.
	 * @param string $destDir Directory for original.* and preview.webp.
	 * @throws UploadRejected When the file is refused.
	 */
	public function process( string $tmpPath, string $destDir ): ProcessedImage {
		$bytes = (int) filesize( $tmpPath );
		if ( $bytes <= 0 ) {
			throw new UploadRejected( 'empty', __( 'That file is empty.', 'blumoon-product-studio' ) );
		}
		if ( $bytes > $this->maxBytes ) {
			throw new UploadRejected(
				'too_large',
				/* translators: %d: maximum size in MB. */
				sprintf( __( 'That file is too large. The limit is %d MB.', 'blumoon-product-studio' ), (int) round( $this->maxBytes / 1048576 ) )
			);
		}

		$mime   = $this->sniff( $tmpPath );
		$format = self::FORMATS[ $mime ] ?? null;
		if ( null === $format || ! in_array( $format, $this->formats, true ) ) {
			throw new UploadRejected( 'unsupported_type', __( 'This file type is not supported. Please use a JPG, PNG or WebP image.', 'blumoon-product-studio' ) );
		}
		if ( 'svg' === $format ) {
			return $this->processSvg( $tmpPath, $destDir );
		}
		if ( 'heic' === $format && ! $this->supportsHeic() ) {
			throw new UploadRejected( 'heic_unsupported', __( 'iPhone HEIC photos cannot be read on this store. Please choose "Most Compatible" in your camera settings, or upload a JPG or PNG.', 'blumoon-product-studio' ) );
		}

		[ $width, $height ] = $this->dimensions( $tmpPath, $format );
		if ( max( $width, $height ) > $this->maxPx || $width * $height > self::MAX_PIXELS ) {
			throw new UploadRejected(
				'too_many_pixels',
				/* translators: %d: maximum side in pixels. */
				sprintf( __( 'That image is too big to process (more than %d pixels on its longest side). Please make it smaller and try again.', 'blumoon-product-studio' ), $this->maxPx )
			);
		}

		return $this->imagick
			? $this->rasterWithImagick( $tmpPath, $format, $destDir )
			: $this->rasterWithGd( $tmpPath, $format, $destDir );
	}

	/**
	 * MIME type from the file's bytes, never from its name or the browser.
	 *
	 * @param string $path File path.
	 */
	public function sniff( string $path ): string {
		$handle = fopen( $path, 'rb' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen -- reading an upload's header.
		$head   = false === $handle ? '' : (string) fread( $handle, 512 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
		if ( false !== $handle ) {
			fclose( $handle ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		}
		// HEIC/HEIF: ISO-BMFF "ftyp" box with an HEIF brand.
		if ( 1 === preg_match( '/^.{4}ftyp(heic|heix|hevc|heim|heis|mif1|msf1)/s', $head ) ) {
			return 'image/heic';
		}
		$finfo = new \finfo( FILEINFO_MIME_TYPE );
		$mime  = (string) $finfo->file( $path );
		if ( in_array( $mime, array( 'image/svg+xml', 'text/xml', 'application/xml', 'text/plain', 'text/html' ), true ) ) {
			return 1 === preg_match( '/<svg[\s>]/i', $head ) ? 'image/svg+xml' : $mime;
		}
		return $mime;
	}

	/**
	 * Whether HEIC can be decoded here.
	 */
	public function supportsHeic(): bool {
		return (bool) $this->imagick && array() !== Imagick::queryFormats( 'HEIC' );
	}

	/**
	 * Pixel size without decoding the whole image.
	 *
	 * @param string $path   File path.
	 * @param string $format Format key.
	 * @return array{0: int, 1: int}
	 * @throws UploadRejected When the image can't be read.
	 */
	private function dimensions( string $path, string $format ): array {
		if ( 'heic' === $format ) {
			$im = new Imagick();
			$im->pingImage( $path );
			$size = array( $im->getImageWidth(), $im->getImageHeight() );
			$im->clear();
			return $size;
		}
		$info = getimagesize( $path );
		if ( false === $info || $info[0] <= 0 || $info[1] <= 0 ) {
			throw new UploadRejected( 'unreadable', __( 'That image could not be read. It may be damaged.', 'blumoon-product-studio' ) );
		}
		return array( $info[0], $info[1] );
	}

	/**
	 * Clean and derive with Imagick.
	 *
	 * @param string $path    Source.
	 * @param string $format  Format key.
	 * @param string $destDir Destination directory.
	 * @throws UploadRejected When decoding fails.
	 */
	private function rasterWithImagick( string $path, string $format, string $destDir ): ProcessedImage {
		try {
			$im = new Imagick( $path );
			// Animated or multi-page files keep only their first frame.
			$im->setIteratorIndex( 0 );
			$im = $im->getImage();
			$im->autoOrient();
			if ( Imagick::COLORSPACE_CMYK === $im->getImageColorspace() ) {
				$im->transformImageColorspace( Imagick::COLORSPACE_SRGB );
			}
			$im->stripImage();

			$out    = 'heic' === $format ? 'jpg' : $format;
			$mime   = array_search( $out, self::FORMATS, true );
			$target = "{$destDir}/original.{$out}";
			$im->setImageFormat( 'jpg' === $out ? 'jpeg' : $out );
			$im->setImageCompressionQuality( 'png' === $out ? 90 : 92 );
			$im->writeImage( $target );

			$preview = clone $im;
			if ( max( $im->getImageWidth(), $im->getImageHeight() ) > self::PREVIEW_MAX ) {
				$preview->thumbnailImage( self::PREVIEW_MAX, self::PREVIEW_MAX, true );
			}
			$preview->setImageFormat( 'webp' );
			$preview->setImageCompressionQuality( 82 );
			$preview->writeImage( "{$destDir}/preview.webp" );

			$result = new ProcessedImage( 'image', (string) $mime, $im->getImageWidth(), $im->getImageHeight(), $target, "{$destDir}/preview.webp" );
			$preview->clear();
			$im->clear();
			return $result;
		} catch ( \ImagickException $e ) {
			throw new UploadRejected( 'unreadable', __( 'That image could not be read. It may be damaged.', 'blumoon-product-studio' ) );
		}//end try
	}

	/**
	 * Clean and derive with GD.
	 *
	 * @param string $path    Source.
	 * @param string $format  Format key (jpg, png or webp).
	 * @param string $destDir Destination directory.
	 * @throws UploadRejected When decoding fails.
	 */
	private function rasterWithGd( string $path, string $format, string $destDir ): ProcessedImage {
		$image = match ( $format ) {
			'jpg'   => @imagecreatefromjpeg( $path ), // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- damaged files are reported below.
			'png'   => @imagecreatefrompng( $path ), // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			'webp'  => @imagecreatefromwebp( $path ), // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			default => false,
		};
		if ( ! $image instanceof GdImage ) {
			throw new UploadRejected( 'unreadable', __( 'That image could not be read. It may be damaged.', 'blumoon-product-studio' ) );
		}
		if ( 'jpg' === $format ) {
			$image = $this->applyExifOrientation( $image, $path );
		}
		imagesavealpha( $image, true );

		$target = "{$destDir}/original.{$format}";
		match ( $format ) {
			'jpg'  => imagejpeg( $image, $target, 92 ),
			'png'  => imagepng( $image, $target, 6 ),
			'webp' => imagewebp( $image, $target, 92 ),
		};

		$width   = imagesx( $image );
		$height  = imagesy( $image );
		$scale   = min( 1, self::PREVIEW_MAX / max( $width, $height ) );
		$preview = $scale < 1 ? imagescale( $image, max( 1, (int) round( $width * $scale ) ), max( 1, (int) round( $height * $scale ) ), IMG_BICUBIC ) : $image;
		if ( $preview instanceof GdImage ) {
			imagesavealpha( $preview, true );
			imagewebp( $preview, "{$destDir}/preview.webp", 82 );
		}

		return new ProcessedImage( 'image', (string) array_search( $format, self::FORMATS, true ), $width, $height, $target, "{$destDir}/preview.webp" );
	}

	/**
	 * Rotate/flip a JPEG according to its EXIF Orientation tag.
	 *
	 * @param GdImage $image Decoded image.
	 * @param string  $path  Source file.
	 */
	private function applyExifOrientation( GdImage $image, string $path ): GdImage {
		if ( ! function_exists( 'exif_read_data' ) ) {
			return $image;
		}
		$exif        = @exif_read_data( $path ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- broken EXIF is common and harmless.
		$orientation = is_array( $exif ) ? (int) ( $exif['Orientation'] ?? 1 ) : 1;
		$rotated     = match ( $orientation ) {
			3, 4    => imagerotate( $image, 180, 0 ),
			5, 6    => imagerotate( $image, -90, 0 ),
			7, 8    => imagerotate( $image, 90, 0 ),
			default => $image,
		};
		if ( ! $rotated instanceof GdImage ) {
			return $image;
		}
		if ( in_array( $orientation, array( 2, 4, 5, 7 ), true ) ) {
			imageflip( $rotated, IMG_FLIP_HORIZONTAL );
		}
		return $rotated;
	}

	/**
	 * Sanitise and store an SVG.
	 *
	 * @param string $path    Source.
	 * @param string $destDir Destination directory.
	 * @throws UploadRejected When the SVG is unsafe or broken.
	 */
	private function processSvg( string $path, string $destDir ): ProcessedImage {
		$clean = $this->svg->sanitize( (string) file_get_contents( $path ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local upload.
		if ( null === $clean ) {
			throw new UploadRejected( 'invalid_svg', __( 'That SVG file could not be used. Please export it again or upload a PNG.', 'blumoon-product-studio' ) );
		}
		[ $width, $height ] = $this->svg->size( $clean );
		$target             = "{$destDir}/original.svg";
		file_put_contents( $target, $clean ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- private storage.
		return new ProcessedImage( 'svg', 'image/svg+xml', $width, $height, $target, null );
	}
}
