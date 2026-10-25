<?php
/**
 * Base class for unit tests.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Tests\Unit;

use Brain\Monkey;
use Yoast\PHPUnitPolyfills\TestCases\TestCase as PolyfillTestCase;

/**
 * Sets up Brain Monkey and stubs the translation and escaping functions.
 */
abstract class TestCase extends PolyfillTestCase {

	protected function set_up(): void {
		parent::set_up();
		Monkey\setUp();
		Monkey\Functions\stubTranslationFunctions();
		Monkey\Functions\stubEscapeFunctions();
	}

	protected function tear_down(): void {
		Monkey\tearDown();
		parent::tear_down();
	}
}
