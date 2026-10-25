<?php
/**
 * Minimal WP-CLI signatures for static analysis. php-stubs/wp-cli-stubs does
 * not yet support the WordPress 7 stubs; replace this file when it does.
 *
 * @package Blumoon\ProductStudio
 */

// phpcs:ignoreFile -- signatures only.

namespace {

class WP_CLI {
	/**
	 * @param string          $name     Command name.
	 * @param callable|object $callable Handler.
	 * @param array<string, mixed> $args Registration args.
	 */
	public static function add_command( string $name, $callable, array $args = array() ): bool {}

	/** @return never */
	public static function error( string $message, bool|int $exit = true ): void {}

	public static function success( string $message ): void {}

	public static function line( string $message = '' ): void {}

	public static function warning( string $message ): void {}
}

}

namespace WP_CLI\Utils {

/**
 * @param string                           $format Output format.
 * @param array<int, array<string, mixed>> $items  Rows.
 * @param array<int, string>|string        $fields Columns.
 */
function format_items( string $format, array $items, array|string $fields ): void {}

}
