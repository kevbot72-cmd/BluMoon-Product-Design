<?php
/**
 * Settings tests.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Tests\Unit;

use Blumoon\ProductStudio\Infrastructure\Settings;
use Brain\Monkey\Functions;
use InvalidArgumentException;

final class SettingsTest extends TestCase {

	protected function set_up(): void {
		parent::set_up();
		Functions\when( 'sanitize_text_field' )->alias( static fn ( string $s ): string => trim( strip_tags( $s ) ) );
	}

	public function test_empty_input_gives_defaults(): void {
		$this->assertSame( Settings::DEFAULTS, Settings::sanitize( array() ) );
	}

	public function test_guest_saving_is_off_by_default(): void {
		$this->assertFalse( Settings::DEFAULTS['general']['guestSaving'] );
	}

	public function test_valid_values_are_kept_and_coerced(): void {
		$clean = Settings::sanitize(
			array(
				'general'    => array(
					'guestSaving' => '1',
					'launchMode'  => 'page',
				),
				'appearance' => array(
					'accent' => '#ABCDEF',
					'radius' => '16',
				),
				'print'      => array( 'bleedMm' => '2.5' ),
			)
		);
		$this->assertTrue( $clean['general']['guestSaving'] );
		$this->assertSame( 'page', $clean['general']['launchMode'] );
		$this->assertSame( '#abcdef', $clean['appearance']['accent'] );
		$this->assertSame( 16, $clean['appearance']['radius'] );
		$this->assertSame( 2.5, $clean['print']['bleedMm'] );
	}

	public function test_invalid_values_fall_back_to_defaults(): void {
		$clean = Settings::sanitize(
			array(
				'general'    => array(
					'launchMode'  => 'popup',
					'guestSaving' => 'maybe',
				),
				'appearance' => array(
					'accent' => 'red; background:url(x)',
					'radius' => 99,
				),
				'privacy'    => array( 'retentionDays' => 'forever' ),
				'uploads'    => array( 'maxMb' => 0 ),
			)
		);
		$this->assertSame( 'overlay', $clean['general']['launchMode'] );
		$this->assertFalse( $clean['general']['guestSaving'] );
		$this->assertSame( '#6c4be0', $clean['appearance']['accent'] );
		$this->assertSame( 12, $clean['appearance']['radius'] );
		$this->assertSame( 30, $clean['privacy']['retentionDays'] );
		$this->assertSame( 25, $clean['uploads']['maxMb'] );
	}

	public function test_lists_keep_only_allowed_values(): void {
		$clean = Settings::sanitize( array( 'uploads' => array( 'formats' => array( 'png', 'exe', 'jpg', 'php' ) ) ) );
		$this->assertSame( array( 'jpg', 'png' ), $clean['uploads']['formats'] );
	}

	public function test_unknown_keys_are_dropped(): void {
		$clean = Settings::sanitize(
			array(
				'evil'    => array( 'x' => 1 ),
				'general' => array( 'nope' => true ),
			)
		);
		$this->assertArrayNotHasKey( 'evil', $clean );
		$this->assertArrayNotHasKey( 'nope', $clean['general'] );
	}

	public function test_get_reads_stored_option(): void {
		Functions\expect( 'get_option' )->once()->with( Settings::OPTION, array() )->andReturn( array( 'privacy' => array( 'retentionDays' => 90 ) ) );
		$settings = new Settings();
		$this->assertSame( 90, $settings->get( 'privacy.retentionDays' ) );
		$this->assertSame( 300, $settings->get( 'quality.defaultDpi' ) );
	}

	public function test_corrupt_option_is_ignored(): void {
		Functions\when( 'get_option' )->justReturn( 'not an array' );
		$this->assertSame( Settings::DEFAULTS, ( new Settings() )->all() );
	}

	public function test_unknown_path_throws(): void {
		Functions\when( 'get_option' )->justReturn( array() );
		$this->expectException( InvalidArgumentException::class );
		( new Settings() )->get( 'general.missing' );
	}

	public function test_update_merges_and_saves_clean_values(): void {
		Functions\when( 'get_option' )->justReturn( array( 'privacy' => array( 'retentionDays' => 90 ) ) );
		$saved = null;
		Functions\expect( 'update_option' )->once()->andReturnUsing(
			static function ( string $name, array $value ) use ( &$saved ): bool {
				$saved = $value;
				return true;
			}
		);

		$settings = new Settings();
		$settings->update(
			array(
				'general' => array(
					'guestSaving' => true,
					'launchMode'  => 'nonsense',
				),
			)
		);

		$this->assertTrue( $saved['general']['guestSaving'] );
		$this->assertSame( 'overlay', $saved['general']['launchMode'] );
		$this->assertSame( 90, $saved['privacy']['retentionDays'] );
		$this->assertTrue( $settings->get( 'general.guestSaving' ) );
	}
}
