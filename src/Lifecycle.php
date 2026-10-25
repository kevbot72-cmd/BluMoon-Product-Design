<?php
/**
 * Activation handling.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio;

use Blumoon\ProductStudio\Infrastructure\Storage;
use Blumoon\ProductStudio\Migration\Tables;

/**
 * Runs on plugin activation. Every step is idempotent.
 */
final class Lifecycle {

	/**
	 * Create tables and private storage directories.
	 */
	public static function activate(): void {
		( new Tables() )->install();
		( new Storage() )->ensureDirectories();
	}
}
