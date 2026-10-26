import { describe, expect, it } from 'vitest';
import { sideLayout } from './layout.ts';
import { PrintArea } from './schema/product-config.ts';

const area = (input: unknown) => PrintArea.parse(input);

describe('sideLayout', () => {
	it('calibrates the photo from the first print area', () => {
		const layout = sideLayout({ widthPx: 1600, heightPx: 1000 }, [
			area({ id: 'pa1', rect: { x: 0.25, y: 0.2, w: 0.5, h: 0.55 }, sizeMm: { w: 200, h: 137.5 } }),
		]);
		// 800 px = 200 mm → 0.25 mm/px; the photo is 400 × 250 mm.
		expect(layout.mmPerPx).toBe(0.25);
		expect(layout.stage).toEqual({ w: 400, h: 250 });
		expect(layout.areas[0]).toMatchObject({ x: 100, y: 50, w: 200, h: 137.5, dpi: 300, bleedMm: 3, clip: true });
	});

	it('derives other areas from the same scale', () => {
		const layout = sideLayout({ widthPx: 1000, heightPx: 1000 }, [
			area({ id: 'front', rect: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, sizeMm: { w: 100, h: 100 } }),
			area({ id: 'pocket', rect: { x: 0.7, y: 0.1, w: 0.1, h: 0.1 }, sizeMm: { w: 1, h: 1 } }),
		]);
		expect(layout.areas[1]).toMatchObject({ x: 140, y: 20, w: 20, h: 20 });
	});

	it('requires a print area', () => {
		expect(() => sideLayout({ widthPx: 10, heightPx: 10 }, [])).toThrow();
	});
});
