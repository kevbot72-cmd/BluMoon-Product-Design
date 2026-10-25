import { describe, expect, it } from 'vitest';
import { reanchor, rotatedBounds } from './geometry.ts';

describe('geometry', () => {
	it('computes rotated bounds', () => {
		const b = rotatedBounds({ x: 0, y: 0, w: 20, h: 10, rotation: 90 });
		expect(b.w).toBeCloseTo(10);
		expect(b.h).toBeCloseTo(20);
		expect(b.x).toBeCloseTo(5);
		expect(b.y).toBeCloseTo(-5);
	});

	it('re-anchors by relative centre and keeps mm size when it fits', () => {
		const el = { x: 40, y: 20, w: 20, h: 10 }; // centre (50, 25) in 100 × 50
		expect(reanchor(el, { w: 100, h: 50 }, { w: 200, h: 100 })).toEqual({ x: 90, y: 45, w: 20, h: 10 });
	});

	it('shrinks to fit a smaller area, keeping aspect', () => {
		const el = { x: 0, y: 0, w: 100, h: 50 };
		const out = reanchor(el, { w: 100, h: 50 }, { w: 50, h: 50 });
		expect(out.w).toBe(50);
		expect(out.h).toBe(25);
	});
});
