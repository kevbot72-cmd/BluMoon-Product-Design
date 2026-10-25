import { describe, expect, it } from 'vitest';
import { effectiveDpi, mmToPt, mmToPx, printPixels, ptToMm, pxToMm, qualityFor } from './units.ts';

describe('units', () => {
	it('converts mm and px both ways', () => {
		expect(mmToPx(25.4, 300)).toBe(300);
		expect(pxToMm(300, 300)).toBe(25.4);
		expect(pxToMm(mmToPx(123.45, 300), 300)).toBeCloseTo(123.45, 10);
	});

	it('converts points', () => {
		expect(ptToMm(72)).toBeCloseTo(25.4, 10);
		expect(mmToPt(ptToMm(14))).toBeCloseTo(14, 10);
	});

	it('sizes print files (BUILD_PROMPT §17 Phase 7 acceptance)', () => {
		expect(printPixels({ w: 300, h: 205 }, 300)).toEqual({ w: 3543, h: 2421 });
	});

	it('adds bleed on every edge', () => {
		// 306 × 211 mm at 300 dpi.
		expect(printPixels({ w: 300, h: 205 }, 300, 3)).toEqual({ w: 3614, h: 2492 });
	});

	it('computes effective dpi from the cropped, placed image', () => {
		expect(effectiveDpi({ w: 3000, h: 2000 }, { w: 254, h: 169.33 })).toBeCloseTo(300, 0);
		// Cropping to half the width halves the horizontal resolution.
		expect(effectiveDpi({ w: 3000, h: 2000 }, { w: 254, h: 169.33 }, { x: 0, y: 0, w: 0.5, h: 1 })).toBeCloseTo(150, 0);
	});

	it('bands quality like the editor badge', () => {
		expect(qualityFor(300, 300)).toBe('good');
		expect(qualityFor(182, 300)).toBe('fair');
		expect(qualityFor(149, 300)).toBe('poor');
	});
});
