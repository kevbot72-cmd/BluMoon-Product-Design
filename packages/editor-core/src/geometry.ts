/** Geometry in print-area millimetres. */
import type { SizeMm } from './units.ts';

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Placed extends Box {
	rotation: number;
}

/** Axis-aligned bounds of a box rotated around its centre. */
export function rotatedBounds(el: Placed): Box {
	const rad = (el.rotation * Math.PI) / 180;
	const cos = Math.abs(Math.cos(rad));
	const sin = Math.abs(Math.sin(rad));
	const w = el.w * cos + el.h * sin;
	const h = el.w * sin + el.h * cos;
	const cx = el.x + el.w / 2;
	const cy = el.y + el.h / 2;
	return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Union of boxes. */
export function unionBounds(boxes: readonly Box[]): Box | null {
	if (boxes.length === 0) {
		return null;
	}
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const b of boxes) {
		minX = Math.min(minX, b.x);
		minY = Math.min(minY, b.y);
		maxX = Math.max(maxX, b.x + b.w);
		maxY = Math.max(maxY, b.y + b.h);
	}
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/**
 * Offset (dx, dy) that aligns an element's rotated bounds to a target box.
 */
export function alignOffset(el: Placed, mode: AlignMode, target: Box): { dx: number; dy: number } {
	const b = rotatedBounds(el);
	switch (mode) {
		case 'left':
			return { dx: target.x - b.x, dy: 0 };
		case 'center':
			return { dx: target.x + target.w / 2 - (b.x + b.w / 2), dy: 0 };
		case 'right':
			return { dx: target.x + target.w - (b.x + b.w), dy: 0 };
		case 'top':
			return { dx: 0, dy: target.y - b.y };
		case 'middle':
			return { dx: 0, dy: target.y + target.h / 2 - (b.y + b.h / 2) };
		case 'bottom':
			return { dx: 0, dy: target.y + target.h - (b.y + b.h) };
	}
}

/**
 * Offsets that spread elements so the gaps between their rotated bounds are
 * equal, keeping the outermost two in place. Needs three or more elements.
 */
export function distributeOffsets(els: readonly Placed[], axis: 'x' | 'y'): { dx: number; dy: number }[] {
	const bounds = els.map(rotatedBounds);
	const offsets = els.map(() => ({ dx: 0, dy: 0 }));
	if (els.length < 3) {
		return offsets;
	}
	const pos = axis === 'x' ? 'x' : 'y';
	const size = axis === 'x' ? 'w' : 'h';
	const order = bounds.map((b, i) => ({ b, i })).sort((a, z) => a.b[pos] - z.b[pos]);
	const first = order[0]!.b;
	const last = order[order.length - 1]!.b;
	const totalSize = order.reduce((sum, { b }) => sum + b[size], 0);
	const gap = (last[pos] + last[size] - first[pos] - totalSize) / (order.length - 1);
	let cursor = first[pos] + first[size] + gap;
	for (const { b, i } of order.slice(1, -1)) {
		const delta = cursor - b[pos];
		offsets[i] = axis === 'x' ? { dx: delta, dy: 0 } : { dx: 0, dy: delta };
		cursor += b[size] + gap;
	}
	return offsets;
}

/**
 * Move an element from one print area to another (variation swap, base-image
 * change, mode switch): its centre keeps the same relative position; its size
 * stays in mm unless it no longer fits, then it shrinks to fit (keeping aspect).
 */
export function reanchor<T extends Box>(el: T, from: SizeMm, to: SizeMm): T {
	const scale = Math.min(1, to.w / el.w, to.h / el.h);
	const w = el.w * scale;
	const h = el.h * scale;
	const cx = ((el.x + el.w / 2) / from.w) * to.w;
	const cy = ((el.y + el.h / 2) / from.h) * to.h;
	return { ...el, x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Clamp a number to a range. */
export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
