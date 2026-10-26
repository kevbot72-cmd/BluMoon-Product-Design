import { describe, expect, it } from 'vitest';
import { clampCrop, cropImage, cropOfBox, fitCropToRatio, imageFrame, placeCrop } from './crop.ts';
import { createDocument } from './document.ts';
import { createImage } from './elements.ts';
import { DesignStore } from './store.ts';
import type { ImageElement } from './schema/design-document.ts';

const close = (a: object, b: object): void => {
	const actual = a as Record<string, number>;
	for (const [key, value] of Object.entries(b as Record<string, number>)) expect(actual[key], key).toBeCloseTo(value, 6);
};

const photo = (patch: Partial<ImageElement> = {}): ImageElement => ({
	...createImage({ w: 200, h: 200 }, { kind: 'upload', uploadId: 'u_0123456789abcdef0123' }, { w: 4000, h: 3000 }),
	x: 20,
	y: 30,
	w: 80,
	h: 60,
	...patch,
});

describe('crop geometry', () => {
	it('places an uncropped image frame on the element', () => {
		close(imageFrame(photo()), { cx: 60, cy: 60, w: 80, h: 60 });
	});

	it('finds the full image behind a cropped one and puts the crop back where it was', () => {
		const el = photo({ crop: { x: 0.25, y: 0, w: 0.5, h: 1 }, w: 40, x: 40 });
		const frame = imageFrame(el);
		close({ ...frame }, { cx: 60, cy: 60, w: 80, h: 60 });
		close(placeCrop(frame, el.crop), { x: 40, y: 30, w: 40, h: 60 });
	});

	it('keeps visible content in place when the crop changes on a rotated, flipped image', () => {
		const el = photo({ rotation: 30, flipX: true, crop: { x: 0.1, y: 0.2, w: 0.6, h: 0.5 }, w: 48, h: 30 });
		const frame = imageFrame(el);
		const placed = placeCrop(frame, { x: 0, y: 0, w: 1, h: 1 });
		// Uncropping again gives the same frame.
		close({ ...imageFrame({ ...el, ...placed, crop: { x: 0, y: 0, w: 1, h: 1 } }) }, { cx: frame.cx, cy: frame.cy, w: frame.w, h: frame.h });
		// A box drawn over the current element reads back as the current crop.
		close({ ...cropOfBox(frame, { cx: el.x + el.w / 2, cy: el.y + el.h / 2, w: el.w, h: el.h }) }, el.crop);
	});

	it('slides a moved crop back inside and trims a resized one', () => {
		close({ ...clampCrop({ x: 0.8, y: -0.1, w: 0.4, h: 0.5 }, 'move') }, { x: 0.6, y: 0, w: 0.4, h: 0.5 });
		close({ ...clampCrop({ x: 0.8, y: -0.1, w: 0.4, h: 0.5 }, 'resize') }, { x: 0.8, y: 0, w: 0.2, h: 0.4 });
	});

	it('keeps the opposite edge when a corner is dragged past the photo', () => {
		close(clampCrop({ x: -0.14, y: -0.21, w: 0.69, h: 1.21 }, 'resize'), { x: 0, y: 0, w: 0.55, h: 1 });
	});

	it('keeps a locked ratio when trimming', () => {
		const frame = { w: 80, h: 60 };
		const c = clampCrop({ x: 0.5, y: 0, w: 0.75, h: 1 }, 'resize', frame, 1);
		expect((c.w * frame.w) / (c.h * frame.h)).toBeCloseTo(1, 6);
		expect(c.x + c.w).toBeLessThanOrEqual(1 + 1e-9);
	});

	it('fits the largest crop of a ratio', () => {
		const square = fitCropToRatio({ x: 0, y: 0, w: 1, h: 1 }, { w: 80, h: 60 }, 1);
		close({ ...square }, { x: 0.125, y: 0, w: 0.75, h: 1 });
		const wide = fitCropToRatio({ x: 0, y: 0, w: 1, h: 1 }, { w: 80, h: 60 }, 16 / 9);
		close({ ...wide }, { w: 1, h: 80 / (16 / 9) / 60 });
	});
});

describe('cropImage command', () => {
	it('crops and undoes in one step', () => {
		const el = photo();
		const doc = createDocument({ productId: 1, mode: 'template', sides: [{ id: 'front', printAreas: ['pa1'] }] });
		doc.sides.front!.printAreas.pa1!.elements.push(el);
		const store = new DesignStore(doc);
		store.dispatch(cropImage({ side: 'front', area: 'pa1', id: el.id }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }));
		const cropped = store.doc.sides.front!.printAreas.pa1!.elements[0] as ImageElement;
		close({ ...cropped.crop }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
		close({ x: cropped.x, y: cropped.y, w: cropped.w, h: cropped.h }, { x: 60, y: 60, w: 40, h: 30 });
		store.undo();
		expect(store.doc.sides.front!.printAreas.pa1!.elements[0]).toEqual(el);
	});
});
