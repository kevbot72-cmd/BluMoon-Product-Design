<?php
/**
 * Container tests.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Tests\Unit;

use ArrayObject;
use Blumoon\ProductStudio\Container;
use LogicException;
use stdClass;

final class ContainerTest extends TestCase {

	public function test_builds_service_once_and_shares_it(): void {
		$container = new Container();
		$calls     = 0;
		$container->set(
			ArrayObject::class,
			static function () use ( &$calls ): ArrayObject {
				++$calls;
				return new ArrayObject();
			}
		);

		$this->assertSame( $container->get( ArrayObject::class ), $container->get( ArrayObject::class ) );
		$this->assertSame( 1, $calls );
	}

	public function test_factory_receives_container(): void {
		$container = new Container();
		$container->set( stdClass::class, static fn (): stdClass => new stdClass() );
		$container->set( ArrayObject::class, static fn ( Container $c ): ArrayObject => new ArrayObject( array( $c->get( stdClass::class ) ) ) );

		$this->assertSame( $container->get( stdClass::class ), $container->get( ArrayObject::class )[0] );
	}

	public function test_unknown_service_throws(): void {
		$this->expectException( LogicException::class );
		( new Container() )->get( stdClass::class );
	}

	public function test_wrong_type_from_factory_throws(): void {
		$container = new Container();
		$container->set( ArrayObject::class, static fn (): stdClass => new stdClass() );
		$this->expectException( LogicException::class );
		$container->get( ArrayObject::class );
	}

	public function test_cannot_replace_built_service(): void {
		$container = new Container();
		$container->set( stdClass::class, static fn (): stdClass => new stdClass() );
		$container->get( stdClass::class );
		$this->expectException( LogicException::class );
		$container->set( stdClass::class, static fn (): stdClass => new stdClass() );
	}

	public function test_has(): void {
		$container = new Container();
		$this->assertFalse( $container->has( stdClass::class ) );
		$container->set( stdClass::class, static fn (): stdClass => new stdClass() );
		$this->assertTrue( $container->has( stdClass::class ) );
	}
}
