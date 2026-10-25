<?php
/**
 * Image pipeline tests (GD path; Imagick is covered in CI where installed).
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Tests\Unit;

use Blumoon\ProductStudio\Infrastructure\Image\ImagePipeline;
use Blumoon\ProductStudio\Infrastructure\Image\SvgSanitizer;
use Blumoon\ProductStudio\Infrastructure\Image\UploadRejected;

final class ImagePipelineTest extends TestCase {

	private string $dir;

	protected function set_up(): void {
		parent::set_up();
		$this->dir = sys_get_temp_dir() . '/bps-pipeline-' . bin2hex( random_bytes( 4 ) );
		mkdir( $this->dir . '/out', 0777, true );
	}

	protected function tear_down(): void {
		foreach ( array_merge( (array) glob( $this->dir . '/out/*' ), (array) glob( $this->dir . '/*.*' ) ) as $file ) {
			unlink( (string) $file );
		}
		rmdir( $this->dir . '/out' );
		rmdir( $this->dir );
		parent::tear_down();
	}

	private function pipeline( int $maxMb = 25, int $maxPx = 12000, array $formats = array( 'jpg', 'png', 'webp', 'svg', 'heic' ) ): ImagePipeline {
		return new ImagePipeline( $maxMb * 1048576, $maxPx, $formats, new SvgSanitizer(), false );
	}

	private function jpeg( int $w, int $h, string $name = 'photo.jpg' ): string {
		$gd = imagecreatetruecolor( $w, $h );
		imagefilledrectangle( $gd, 0, 0, (int) ( $w / 2 ), $h, (int) imagecolorallocate( $gd, 255, 0, 0 ) );
		$path = "{$this->dir}/{$name}";
		imagejpeg( $gd, $path, 90 );
		return $path;
	}

	/** Insert a minimal EXIF block with the given Orientation after the JPEG SOI marker. */
	private function withOrientation( string $path, int $orientation ): string {
		// TIFF header (big-endian), 1 IFD entry: tag 0x0112 Orientation, SHORT, count 1, value; then no next IFD.
		$tiff = "MM\x00\x2a\x00\x00\x00\x08\x00\x01\x01\x12\x00\x03\x00\x00\x00\x01" . pack( 'n', $orientation ) . "\x00\x00\x00\x00\x00\x00";
		$app1 = "Exif\x00\x00" . $tiff;
		$jpeg = (string) file_get_contents( $path );
		file_put_contents( $path, substr( $jpeg, 0, 2 ) . "\xFF\xE1" . pack( 'n', strlen( $app1 ) + 2 ) . $app1 . substr( $jpeg, 2 ) );
		return $path;
	}

	public function test_jpeg_is_reencoded_with_webp_preview(): void {
		$image = $this->pipeline()->process( $this->jpeg( 3000, 2000 ), $this->dir . '/out' );
		$this->assertSame( 'image', $image->kind );
		$this->assertSame( 'image/jpeg', $image->mime );
		$this->assertSame( array( 3000, 2000 ), array( $image->width, $image->height ) );
		$this->assertFileExists( $image->originalPath );
		$preview = getimagesize( (string) $image->previewPath );
		$this->assertSame( 'image/webp', $preview['mime'] );
		$this->assertSame( array( 2048, 1365 ), array( $preview[0], $preview[1] ) );
	}

	public function test_exif_orientation_is_applied_and_exif_stripped(): void {
		$source = $this->withOrientation( $this->jpeg( 400, 200 ), 6 );
		$this->assertSame( 6, exif_read_data( $source )['Orientation'] ?? null );

		$image = $this->pipeline()->process( $source, $this->dir . '/out' );

		// Rotated 90°: portrait now, and no EXIF left (no GPS can leak either).
		$this->assertSame( array( 200, 400 ), array( $image->width, $image->height ) );
		$this->assertArrayNotHasKey( 'Orientation', (array) @exif_read_data( $image->originalPath ) ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- no EXIF is the expected outcome.
	}

	public function test_payload_appended_to_a_jpeg_is_removed(): void {
		$path = $this->jpeg( 100, 100 );
		file_put_contents( $path, '<?php system($_GET["c"]); ?>', FILE_APPEND );

		$image = $this->pipeline()->process( $path, $this->dir . '/out' );

		$this->assertStringNotContainsString( '<?php', (string) file_get_contents( $image->originalPath ) );
	}

	public function test_php_file_disguised_as_jpeg_is_rejected(): void {
		$path = "{$this->dir}/photo.jpg";
		file_put_contents( $path, "<?php echo 'pwned';" );
		try {
			$this->pipeline()->process( $path, $this->dir . '/out' );
			$this->fail( 'Expected rejection.' );
		} catch ( UploadRejected $e ) {
			$this->assertSame( 'unsupported_type', $e->reason );
		}
	}

	public function test_disallowed_format_is_rejected(): void {
		$this->expectException( UploadRejected::class );
		$this->pipeline( 25, 12000, array( 'png' ) )->process( $this->jpeg( 10, 10 ), $this->dir . '/out' );
	}

	public function test_too_large_is_rejected(): void {
		$path = "{$this->dir}/big.jpg";
		file_put_contents( $path, str_repeat( 'x', 1048577 ) );
		try {
			$this->pipeline( 1 )->process( $path, $this->dir . '/out' );
			$this->fail( 'Expected rejection.' );
		} catch ( UploadRejected $e ) {
			$this->assertSame( 'too_large', $e->reason );
		}
	}

	public function test_too_many_pixels_is_rejected_before_decoding(): void {
		try {
			$this->pipeline( 25, 1000 )->process( $this->jpeg( 1200, 100 ), $this->dir . '/out' );
			$this->fail( 'Expected rejection.' );
		} catch ( UploadRejected $e ) {
			$this->assertSame( 'too_many_pixels', $e->reason );
		}
	}

	public function test_heic_without_support_gets_a_helpful_message(): void {
		$path = "{$this->dir}/IMG_0001.HEIC";
		file_put_contents( $path, "\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1heic" . str_repeat( "\x00", 64 ) );
		try {
			$this->pipeline()->process( $path, $this->dir . '/out' );
			$this->fail( 'Expected rejection.' );
		} catch ( UploadRejected $e ) {
			$this->assertSame( 'heic_unsupported', $e->reason );
			$this->assertStringContainsString( 'JPG', $e->getMessage() );
		}
	}

	public function test_png_keeps_transparency(): void {
		$gd = imagecreatetruecolor( 50, 50 );
		imagealphablending( $gd, false );
		imagefill( $gd, 0, 0, (int) imagecolorallocatealpha( $gd, 0, 0, 0, 127 ) );
		imagesavealpha( $gd, true );
		$path = "{$this->dir}/logo.png";
		imagepng( $gd, $path );

		$image = $this->pipeline()->process( $path, $this->dir . '/out' );
		$out   = imagecreatefrompng( $image->originalPath );
		$this->assertSame( 127, ( imagecolorat( $out, 10, 10 ) >> 24 ) & 0x7F );
	}

	public function test_svg_is_sanitised(): void {
		$path = "{$this->dir}/logo.svg";
		file_put_contents(
			$path,
			'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="120" height="60" onload="alert(1)">'
			. '<script>alert(2)</script><foreignObject><iframe src="https://evil.test"/></foreignObject>'
			. '<image xlink:href="https://evil.test/track.png"/><rect width="120" height="60" fill="#6c4be0"/></svg>'
		);

		$image = $this->pipeline()->process( $path, $this->dir . '/out' );
		$clean = (string) file_get_contents( $image->originalPath );

		$this->assertSame( array( 'svg', 120, 60 ), array( $image->kind, $image->width, $image->height ) );
		$this->assertNull( $image->previewPath );
		$this->assertStringContainsString( '<rect', $clean );
		foreach ( array( '<script', 'onload', 'foreignObject', 'evil.test' ) as $bad ) {
			$this->assertStringNotContainsStringIgnoringCase( $bad, $clean );
		}
	}

	public function test_svg_with_entities_is_rejected(): void {
		$path = "{$this->dir}/lol.svg";
		file_put_contents( $path, '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaa">]><svg xmlns="http://www.w3.org/2000/svg">&a;</svg>' );
		try {
			$this->pipeline()->process( $path, $this->dir . '/out' );
			$this->fail( 'Expected rejection.' );
		} catch ( UploadRejected $e ) {
			$this->assertSame( 'invalid_svg', $e->reason );
		}
	}

	public function test_svg_size_falls_back_to_viewbox_and_units(): void {
		$svg = new SvgSanitizer();
		$this->assertSame( array( 300, 150 ), $svg->size( '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 150"/>' ) );
		$this->assertSame( array( 96, 48 ), $svg->size( '<svg xmlns="http://www.w3.org/2000/svg" width="1in" height="0.5in"/>' ) );
		$this->assertSame( array( 1000, 1000 ), $svg->size( '<svg xmlns="http://www.w3.org/2000/svg" width="100%"/>' ) );
	}
}
