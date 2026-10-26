<?php
/**
 * Upload routes, signed file access and the clipart library.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Tests\Integration;

use Blumoon\ProductStudio\Assets\AssetLibrary;
use Blumoon\ProductStudio\Infrastructure\GuestToken;
use Blumoon\ProductStudio\Infrastructure\Repository\UploadRepository;
use Blumoon\ProductStudio\Infrastructure\Requester;
use Blumoon\ProductStudio\Infrastructure\Settings;
use Blumoon\ProductStudio\Infrastructure\Storage;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;
use WP_UnitTestCase;

final class UploadsTest extends WP_UnitTestCase {

	private WP_REST_Server $server;

	public function set_up(): void {
		parent::set_up();
		global $wp_rest_server;
		$wp_rest_server = new WP_REST_Server(); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		$this->server   = $wp_rest_server;
		do_action( 'rest_api_init', $this->server );
		wp_set_current_user( 0 );
	}

	public function tear_down(): void {
		global $wp_rest_server;
		$wp_rest_server = null; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		bps_test_container()->get( Settings::class )->update( array( 'advanced' => array( 'uploadsPerHour' => 60 ) ) );
		parent::tear_down();
	}

	private function jpegFile(): string {
		$path = get_temp_dir() . 'bps-' . wp_generate_password( 6, false ) . '.jpg';
		$gd   = imagecreatetruecolor( 1200, 800 );
		imagejpeg( $gd, $path );
		return $path;
	}

	/** @param array<string, string> $headers */
	private function upload( string $path, array $headers = array( 'X-BPS-Request' => '1' ) ): WP_REST_Response {
		$request = new WP_REST_Request( 'POST', '/bps/v1/uploads' );
		foreach ( $headers as $name => $value ) {
			$request->set_header( $name, $value );
		}
		$request->set_file_params(
			array(
				'file' => array(
					'name'     => basename( $path ),
					'type'     => 'image/jpeg',
					'tmp_name' => $path,
					'error'    => UPLOAD_ERR_OK,
					'size'     => filesize( $path ),
				),
			)
		);
		return $this->server->dispatch( $request );
	}

	private function fetch( string $url ): WP_REST_Response {
		$parts = wp_parse_url( $url );
		parse_str( $parts['query'] ?? '', $query );
		// Plain permalinks put the route in ?rest_route=, pretty ones in the path.
		$route = (string) ( $query['rest_route'] ?? substr( $parts['path'] ?? '', (int) strpos( $parts['path'] ?? '', '/bps/v1/' ) ) );
		unset( $query['rest_route'] );
		$request = new WP_REST_Request( 'GET', $route );
		$request->set_query_params( $query );
		return $this->server->dispatch( $request );
	}

	public function test_guest_without_csrf_header_is_refused(): void {
		$this->assertSame( 403, $this->upload( $this->jpegFile(), array() )->get_status() );
	}

	public function test_guest_upload_is_stored_privately_and_served_by_signed_url(): void {
		$response = $this->upload( $this->jpegFile() );
		$this->assertSame( 201, $response->get_status() );
		$data = $response->get_data();
		$this->assertMatchesRegularExpression( '/^u_[a-f0-9]{24}$/', $data['id'] );
		$this->assertSame( array( 1200, 800 ), array( $data['width'], $data['height'] ) );

		$row = bps_test_container()->get( UploadRepository::class )->find( $data['id'] );
		$this->assertSame( 0, (int) $row['user_id'] );
		$this->assertMatchesRegularExpression( '/^[a-f0-9]{64}$/', (string) $row['guest_hash'] );
		$this->assertStringStartsWith( 'u/', (string) $row['original_path'] );

		$file = $this->fetch( $data['previewUrl'] );
		$this->assertSame( 200, $file->get_status() );
		$this->assertSame( 'image/webp', $file->get_data()['mime'] );
		$this->assertFileExists( $file->get_data()['__bps_file'] );
		$this->assertStringStartsWith( bps_test_container()->get( Storage::class )->root(), $file->get_data()['__bps_file'] );
	}

	public function test_tampered_or_expired_links_are_refused(): void {
		$url = $this->upload( $this->jpegFile() )->get_data()['previewUrl'];
		$this->assertSame( 403, $this->fetch( str_replace( 'variant=preview', 'variant=original', $url ) )->get_status() );
		$this->assertSame( 403, $this->fetch( (string) preg_replace( '/exp=(\d+)/', 'exp=' . ( time() - 10 ), $url ) )->get_status() );
		$this->assertSame( 400, $this->fetch( (string) preg_replace( '/sig=[a-f0-9]+/', 'sig=nothex', $url ) )->get_status() );
	}

	public function test_rejected_file_leaves_nothing_behind(): void {
		$path = get_temp_dir() . 'bps-evil.jpg';
		file_put_contents( $path, "<?php echo 'x';" );
		$before   = count( (array) glob( bps_test_container()->get( Storage::class )->root() . '/u/*/*/*' ) );
		$response = $this->upload( $path );
		$this->assertSame( 422, $response->get_status() );
		$this->assertSame( 'bps_upload_unsupported_type', $response->get_data()['code'] );
		$this->assertCount( $before, (array) glob( bps_test_container()->get( Storage::class )->root() . '/u/*/*/*' ) );
	}

	public function test_logged_in_uploads_are_listed_only_for_their_owner(): void {
		$alice = self::factory()->user->create( array( 'role' => 'customer' ) );
		$bob   = self::factory()->user->create( array( 'role' => 'customer' ) );
		wp_set_current_user( $alice );
		$id = $this->upload( $this->jpegFile(), array() )->get_data()['id'];

		$mine = $this->server->dispatch( new WP_REST_Request( 'GET', '/bps/v1/uploads' ) )->get_data();
		$this->assertContains( $id, array_column( $mine, 'id' ) );

		wp_set_current_user( $bob );
		$theirs = $this->server->dispatch( new WP_REST_Request( 'GET', '/bps/v1/uploads' ) )->get_data();
		$this->assertNotContains( $id, array_column( $theirs, 'id' ) );
	}

	public function test_another_guest_does_not_own_the_upload(): void {
		$id    = $this->upload( $this->jpegFile() )->get_data()['id'];
		$row   = bps_test_container()->get( UploadRepository::class )->find( $id );
		$other = Requester::current( new GuestToken( array( GuestToken::COOKIE => str_repeat( 'b', 32 ) ), 60 ), false );
		$this->assertNotNull( $other );
		$this->assertFalse( $other->owns( (int) $row['user_id'], $row['guest_hash'] ) );
	}

	public function test_uploads_are_rate_limited(): void {
		bps_test_container()->get( Settings::class )->update( array( 'advanced' => array( 'uploadsPerHour' => 1 ) ) );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'customer' ) ) );
		$this->assertSame( 201, $this->upload( $this->jpegFile(), array() )->get_status() );
		$this->assertSame( 429, $this->upload( $this->jpegFile(), array() )->get_status() );
	}

	public function test_clipart_lists_only_flagged_attachments(): void {
		$path    = $this->jpegFile();
		$flagged = self::factory()->attachment->create_upload_object( $path );
		$plain   = self::factory()->attachment->create_upload_object( $this->jpegFile() );
		// PNG and SVG are the clipart formats; flag a PNG copy.
		wp_update_post(
			array(
				'ID'             => $flagged,
				'post_mime_type' => 'image/png',
				'post_title'     => 'Balloon',
			)
		);
		update_post_meta( $flagged, AssetLibrary::META_TYPE, 'clipart' );

		$items = $this->server->dispatch( new WP_REST_Request( 'GET', '/bps/v1/assets/clipart' ) )->get_data();

		$this->assertSame( array( $flagged ), array_column( $items, 'id' ) );
		$this->assertSame( 'Balloon', $items[0]['title'] );
		$this->assertNotContains( $plain, array_column( $items, 'id' ) );

		$request = new WP_REST_Request( 'GET', '/bps/v1/assets/clipart' );
		$request->set_query_params( array( 'include' => array( $plain ) ) );
		$this->assertSame( array(), $this->server->dispatch( $request )->get_data(), 'include still requires the clipart flag' );
	}

	public function test_media_library_svg_is_sanitised_on_upload(): void {
		$path = get_temp_dir() . 'bps-clip.svg';
		file_put_contents( $path, '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><circle r="5"/></svg>' );
		$file = bps_test_container()->get( AssetLibrary::class )->sanitizeSvgUpload(
			array(
				'name'     => 'clip.svg',
				'tmp_name' => $path,
			)
		);
		$this->assertArrayNotHasKey( 'error', $file );
		$clean = (string) file_get_contents( $path );
		$this->assertStringContainsString( '<circle', $clean );
		$this->assertStringNotContainsString( 'script', $clean );
		$this->assertStringNotContainsString( 'onload', $clean );
	}

	public function test_svg_uploads_allowed_only_for_store_managers(): void {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );
		$this->assertArrayNotHasKey( 'svg', get_allowed_mime_types() );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'shop_manager' ) ) );
		$this->assertArrayHasKey( 'svg', get_allowed_mime_types() );
	}
}
