import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DesignDocument } from './design-document.ts';
import { Blueprint, ProductConfig } from './product-config.ts';

type ElementsFixture = { sides: { front: { printAreas: { pa1: { elements: Record<string, unknown>[] } } } } };

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8'));
const elementsFixture = (): ElementsFixture => fixture('design-document.gallery.json') as ElementsFixture;

describe('design document v1', () => {
	it('accepts the gallery example and applies defaults', () => {
		const doc = DesignDocument.parse(fixture('design-document.gallery.json'));
		const [text, image] = doc.sides.front!.printAreas.pa1!.elements;
		expect(text).toMatchObject({ type: 'text', rotation: 0, opacity: 1, letterSpacing: 0 });
		expect(image).toMatchObject({ type: 'image', keepAspect: false, mask: null });
	});

	it.each([{ w: -5 }, { fill: 'red' }, { type: 'script' }, { rotation: 720 }])('rejects %o', (patch) => {
		const doc = elementsFixture();
		Object.assign(doc.sides.front.printAreas.pa1.elements[0]!, patch);
		expect(DesignDocument.safeParse(doc).success).toBe(false);
	});

	it('rejects upload ids that are not opaque public ids', () => {
		const doc = elementsFixture();
		doc.sides.front.printAreas.pa1.elements[1]!.source = { kind: 'upload', uploadId: '../../wp-config.php' };
		expect(DesignDocument.safeParse(doc).success).toBe(false);
	});
});

describe('product config v1', () => {
	it('accepts the hybrid example and applies print-area defaults', () => {
		const config = ProductConfig.parse(fixture('product-config.hybrid.json'));
		expect(config.gallery?.sides[0]?.printAreas[0]).toMatchObject({ bleedMm: 3, dpi: 300, quad: null, clip: true });
	});
});

describe('generated JSON Schema', () => {
	it.each([
		['design-document.v1', DesignDocument],
		['product-config.v1', ProductConfig],
		['blueprint.v1', Blueprint],
	] as const)('%s.json matches the Zod definition (run `npm run schema` if stale)', (name, schema) => {
		const committed: unknown = JSON.parse(readFileSync(new URL(`../../../../schema/json/${name}.json`, import.meta.url), 'utf8'));
		expect(committed).toEqual(z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input', reused: 'ref' }));
	});
});
