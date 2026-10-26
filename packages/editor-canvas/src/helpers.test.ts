import { describe, expect, it } from 'vitest';
import { contrastRatio, normalizeHex, qrScannable } from '@bps/editor-core';
import { qrMatrix, qrText } from './qr.ts';
import { shapePath } from './shapes.ts';
import { snap, snapTargets } from './snapping.ts';
import { bridgeWarp, commandBounds, type PathCommand } from './textEffects.ts';
import { Viewport } from './viewport.ts';

describe('shapes', () => {
	it('fills the box exactly', () => {
		for (const shape of ['rect', 'triangle', 'star', 'hexagon'] as const) {
			const nums = shapePath(shape, 40, 20).match(/-?\d+(\.\d+)?/g)!.map(Number);
			const xs = nums.filter((_, i) => i % 2 === 0);
			const ys = nums.filter((_, i) => i % 2 === 1);
			expect(Math.min(...xs), shape).toBeCloseTo(0, 0);
			expect(Math.max(...xs), shape).toBeCloseTo(40, 0);
			expect(Math.min(...ys), shape).toBeCloseTo(0, 0);
			expect(Math.max(...ys), shape).toBeCloseTo(20, 0);
		}
	});

	it('rounds rectangle corners, clamped to half the short side', () => {
		expect(shapePath('rect', 40, 20, 5)).toContain('A5 5');
		expect(shapePath('rect', 40, 20, 50)).toContain('A10 10');
	});
});

describe('QR', () => {
	it('encodes payload kinds the way phone cameras expect', () => {
		expect(qrText({ kind: 'wifi', ssid: 'Cafe;1', password: 'p:w', security: 'WPA' })).toBe('WIFI:T:WPA;S:Cafe\\;1;P:p\\:w;;');
		expect(qrText({ kind: 'phone', number: '+27 (82) 555-0100' })).toBe('tel:+27825550100');
		expect(qrText({ kind: 'email', to: 'a@b.co', subject: 'Hi there' })).toBe('mailto:a@b.co?subject=Hi%20there');
		expect(qrText({ kind: 'vcard', name: 'Sam, Jr' })).toContain('FN:Sam\\, Jr');
	});

	it('produces a square matrix with quiet zone', () => {
		const m = qrMatrix({ payload: { kind: 'url', url: 'https://example.com' }, ecc: 'M', quietZone: 4 });
		expect(m.size).toBe(25 + 8); // version 2 is 25 modules
		expect(m.d.startsWith('M4 4')).toBe(true); // finder pattern corner
	});

	it('judges scannability by contrast and polarity', () => {
		expect(qrScannable('#000000', '#ffffff')).toBe(true);
		expect(qrScannable('#ffffff', '#000000')).toBe(false); // inverted
		expect(qrScannable('#777777', '#888888')).toBe(false); // low contrast
		expect(qrScannable('#1a1a1a', null, '#fafafa')).toBe(true);
		expect(contrastRatio('#000', '#fff')).toBeCloseTo(21);
		expect(normalizeHex('#ABC')).toBe('#aabbcc');
	});
});

describe('text effects', () => {
	it('bends the top of a bridge and keeps the baseline', () => {
		const square: PathCommand[] = [['M', 0, 0], ['L', 100, 0], ['L', 100, 20], ['L', 0, 20], ['L', 50, 0], ['Z']];
		const warped = bridgeWarp(square, 1);
		const top = warped.find((c) => c[1] === 50)!;
		expect(top[2]).toBeGreaterThan(5); // middle of top edge pushed down
		expect(warped[2]![2]).toBe(20); // baseline untouched
		expect(commandBounds(warped).maxY).toBe(20);
	});
});

describe('viewport', () => {
	it('fits, zooms around a point and converts both ways', () => {
		const vp = new Viewport({ w: 400, h: 250 }, { w: 1000, h: 500 });
		expect(vp.scale).toBeCloseTo(2 * Viewport.FIT_MARGIN);
		const anchor = { x: 300, y: 200 };
		const before = vp.toScene(anchor);
		vp.zoomTo(2, anchor);
		const after = vp.toScene(anchor);
		expect(after.x).toBeCloseTo(before.x);
		expect(after.y).toBeCloseTo(before.y);
		const p = vp.toScreen({ x: 10, y: 20 });
		expect(vp.toScene(p).x).toBeCloseTo(10);
		vp.zoomTo(100);
		expect(vp.zoom).toBe(Viewport.MAX_ZOOM);
	});
});

describe('snapping', () => {
	const area = { x: 100, y: 50, w: 200, h: 100 };

	it('snaps the nearest edge or centre within the threshold', () => {
		const targets = snapTargets(area, 5, [{ x: 150, y: 60, w: 20, h: 20 }]);
		// Box centre at 199 → snaps to the area centre (200).
		const r = snap({ x: 189, y: 70, w: 20, h: 10 }, targets, 2);
		expect(r.dx).toBeCloseTo(1);
		expect(r.guides.x).toContain(200);
	});

	it('leaves boxes alone outside the threshold', () => {
		const r = snap({ x: 130, y: 90, w: 7, h: 3 }, snapTargets(area, 0, []), 1);
		expect(r).toEqual({ dx: 0, dy: 0, guides: { x: [], y: [] } });
	});
});
