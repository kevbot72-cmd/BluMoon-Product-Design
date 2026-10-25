<?php
/**
 * Schema validator tests against the shipped JSON Schema files.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Tests\Unit;

use Blumoon\ProductStudio\Domain\Schema\SchemaValidator;

final class SchemaValidatorTest extends TestCase {

	private SchemaValidator $validator;

	protected function set_up(): void {
		parent::set_up();
		$this->validator = new SchemaValidator( dirname( __DIR__, 3 ) . '/schema/json' );
	}

	private function fixture( string $path ): string {
		return (string) file_get_contents( dirname( __DIR__, 3 ) . '/' . $path );
	}

	public function test_valid_blueprint_passes(): void {
		$this->assertSame( array(), $this->validator->validateJson( SchemaValidator::BLUEPRINT, $this->fixture( 'tests/fixtures/blueprint-mug.json' ) ) );
	}

	public function test_valid_design_document_passes(): void {
		$this->assertSame( array(), $this->validator->validateJson( SchemaValidator::DESIGN_DOCUMENT, $this->fixture( 'packages/editor-core/fixtures/design-document.gallery.json' ) ) );
	}

	public function test_blueprint_without_sides_fails_with_a_path(): void {
		$problems = $this->validator->validateJson( SchemaValidator::BLUEPRINT, '{"schemaVersion":1,"sides":[]}' );
		$this->assertNotEmpty( $problems );
		$this->assertStringStartsWith( '/sides', $problems[0] );
	}

	public function test_empty_object_and_empty_array_are_distinguished(): void {
		$base = '{"schemaVersion":1,"enabled":true,"modes":["template"],"defaultMode":"template","blueprintId":5,"variations":%s}';
		$this->assertSame( array(), $this->validator->validateJson( SchemaValidator::PRODUCT_CONFIG, sprintf( $base, '{}' ) ) );
		$this->assertNotEmpty( $this->validator->validateJson( SchemaValidator::PRODUCT_CONFIG, sprintf( $base, '[]' ) ) );
	}

	public function test_malformed_json_is_reported(): void {
		$this->assertNotEmpty( $this->validator->validateJson( SchemaValidator::BLUEPRINT, '{nope' ) );
	}

	public function test_script_in_upload_id_is_rejected(): void {
		$doc = json_decode( $this->fixture( 'packages/editor-core/fixtures/design-document.gallery.json' ) );
		$doc->sides->front->printAreas->pa1->elements[1]->source->uploadId = '<script>';
		$this->assertNotEmpty( $this->validator->validate( SchemaValidator::DESIGN_DOCUMENT, $doc ) );
	}
}
