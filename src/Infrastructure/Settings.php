<?php
/**
 * Plugin settings stored in one option.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Infrastructure;

/**
 * Typed, validated settings. Unknown keys are dropped; invalid values fall
 * back to the default, so a corrupt option can never break the editor.
 */
final class Settings {

	public const OPTION = 'bps_settings';

	/**
	 * Default values. Their PHP types define each setting's type.
	 */
	public const DEFAULTS = array(
		'general'    => array(
			'launchMode'   => 'overlay',
			'editorPageId' => 0,
			'guestSaving'  => false,
			'autosave'     => true,
		),
		'appearance' => array(
			'accent'    => '#6c4be0',
			'surface'   => '#ffffff',
			'radius'    => 12,
			'font'      => 'system',
			'darkTheme' => false,
		),
		'uploads'    => array(
			'formats' => array( 'jpg', 'png', 'webp', 'svg', 'heic' ),
			'maxMb'   => 25,
			'maxPx'   => 12000,
		),
		'quality'    => array(
			'defaultDpi' => 300,
			'warnDpi'    => 150,
		),
		'privacy'    => array(
			'retentionDays' => 30,
		),
		'emails'     => array(
			'attachProof' => true,
		),
		'print'      => array(
			'cropMarks'     => true,
			'bleedMm'       => 3.0,
			'prepareStatus' => 'processing',
		),
		'advanced'   => array(
			'debug'                 => false,
			'uploadsPerHour'        => 60,
			'savesPerHour'          => 120,
			'deleteDataOnUninstall' => false,
		),
	);

	/**
	 * Extra rules: [min, max] for numbers, list of allowed values for strings and lists,
	 * 'color' for hex colours.
	 */
	private const RULES = array(
		'general.launchMode'      => array( 'overlay', 'page' ),
		'general.editorPageId'    => array( 0, PHP_INT_MAX ),
		'appearance.accent'       => 'color',
		'appearance.surface'      => 'color',
		'appearance.radius'       => array( 0, 24 ),
		'appearance.font'         => array( 'system', 'inter' ),
		'uploads.formats'         => array( 'jpg', 'png', 'webp', 'svg', 'heic' ),
		'uploads.maxMb'           => array( 1, 200 ),
		'uploads.maxPx'           => array( 1000, 30000 ),
		'quality.defaultDpi'      => array( 72, 1200 ),
		'quality.warnDpi'         => array( 50, 600 ),
		'privacy.retentionDays'   => array( 1, 3650 ),
		'print.bleedMm'           => array( 0, 20 ),
		'print.prepareStatus'     => array( 'processing', 'completed', 'on-hold' ),
		'advanced.uploadsPerHour' => array( 1, 10000 ),
		'advanced.savesPerHour'   => array( 1, 10000 ),
	);

	/**
	 * Cached merged settings.
	 *
	 * @var array<string, array<string, mixed>>|null
	 */
	private ?array $cache = null;

	/**
	 * All settings, merged over defaults.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	public function all(): array {
		if ( null === $this->cache ) {
			$stored      = get_option( self::OPTION, array() );
			$this->cache = self::sanitize( is_array( $stored ) ? $stored : array() );
		}
		return $this->cache;
	}

	/**
	 * One setting by "group.key" path.
	 *
	 * @param string $path For example "privacy.retentionDays".
	 * @return mixed
	 * @throws \InvalidArgumentException When the setting doesn't exist.
	 */
	public function get( string $path ): mixed {
		[ $group, $key ] = array_pad( explode( '.', $path, 2 ), 2, '' );
		$all             = $this->all();
		if ( ! isset( $all[ $group ] ) || ! array_key_exists( $key, $all[ $group ] ) ) {
			throw new \InvalidArgumentException( "Unknown setting {$path}." );
		}
		return $all[ $group ][ $key ];
	}

	/**
	 * Merge a partial update into the stored settings.
	 *
	 * @param array<string, mixed> $changes Partial settings, same shape as DEFAULTS.
	 * @return array<string, array<string, mixed>> The saved settings.
	 */
	public function update( array $changes ): array {
		$merged = $this->all();
		foreach ( $changes as $group => $values ) {
			if ( isset( $merged[ $group ] ) && is_array( $values ) ) {
				$merged[ $group ] = array_merge( $merged[ $group ], $values );
			}
		}
		$clean = self::sanitize( $merged );
		update_option( self::OPTION, $clean, true );
		$this->cache = $clean;
		return $clean;
	}

	/**
	 * Clean an arbitrary array into the settings shape.
	 *
	 * @param array<mixed> $input Raw input.
	 * @return array<string, array<string, mixed>>
	 */
	public static function sanitize( array $input ): array {
		$out = array();
		foreach ( self::DEFAULTS as $group => $fallbacks ) {
			$values = isset( $input[ $group ] ) && is_array( $input[ $group ] ) ? $input[ $group ] : array();
			foreach ( $fallbacks as $key => $fallback ) {
				$out[ $group ][ $key ] = array_key_exists( $key, $values )
					? self::clean( $values[ $key ], $fallback, self::RULES[ "{$group}.{$key}" ] ?? null )
					: $fallback;
			}
		}
		return $out;
	}

	/**
	 * Coerce one value to its default's type and apply its rule.
	 *
	 * @param mixed                    $value   Raw value.
	 * @param mixed                    $fallback Default value (defines the type).
	 * @param string|array<mixed>|null $rule    Rule from RULES.
	 * @return mixed
	 */
	private static function clean( mixed $value, mixed $fallback, string|array|null $rule ): mixed {
		if ( is_bool( $fallback ) ) {
			$bool = filter_var( $value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE );
			return $bool ?? $fallback;
		}
		if ( is_int( $fallback ) || is_float( $fallback ) ) {
			if ( ! is_numeric( $value ) ) {
				return $fallback;
			}
			$number = is_int( $fallback ) ? (int) $value : (float) $value;
			if ( is_array( $rule ) && ( $number < $rule[0] || $number > $rule[1] ) ) {
				return $fallback;
			}
			return $number;
		}
		if ( is_array( $fallback ) ) {
			if ( ! is_array( $value ) ) {
				return $fallback;
			}
			$allowed = is_array( $rule ) ? $rule : $fallback;
			return array_values( array_intersect( $allowed, array_map( 'strval', $value ) ) );
		}
		if ( ! is_string( $value ) ) {
			return $fallback;
		}
		if ( 'color' === $rule ) {
			return preg_match( '/^#[0-9a-f]{6}$/i', $value ) ? strtolower( $value ) : $fallback;
		}
		if ( is_array( $rule ) ) {
			return in_array( $value, $rule, true ) ? $value : $fallback;
		}
		return sanitize_text_field( $value );
	}
}
