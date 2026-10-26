/** Smart-guide snapping in stage millimetres. */

export interface Bounds {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface SnapTargets {
	/** Vertical guide positions (x values). */
	x: number[];
	/** Horizontal guide positions (y values). */
	y: number[];
}

export interface SnapResult {
	dx: number;
	dy: number;
	/** Guides to draw: x positions of vertical lines, y positions of horizontal lines. */
	guides: { x: number[]; y: number[] };
}

/** Edges and centre of the print area and its safe zone, plus every other element. */
export function snapTargets(area: Bounds, safeMm: number, others: readonly Bounds[]): SnapTargets {
	const x = [area.x, area.x + area.w / 2, area.x + area.w];
	const y = [area.y, area.y + area.h / 2, area.y + area.h];
	if (safeMm > 0) {
		x.push(area.x + safeMm, area.x + area.w - safeMm);
		y.push(area.y + safeMm, area.y + area.h - safeMm);
	}
	for (const b of others) {
		x.push(b.x, b.x + b.w / 2, b.x + b.w);
		y.push(b.y, b.y + b.h / 2, b.y + b.h);
	}
	return { x, y };
}

/**
 * Snap a moving box's left/centre/right (and top/middle/bottom) to the
 * nearest target within `threshold` mm. Each axis snaps independently.
 */
export function snap(moving: Bounds, targets: SnapTargets, threshold: number): SnapResult {
	const axis = (start: number, size: number, candidates: number[]): { delta: number; guides: number[] } => {
		const edges = [start, start + size / 2, start + size];
		let best: number | null = null;
		for (const edge of edges) {
			for (const t of candidates) {
				const d = t - edge;
				if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) {
					best = d;
				}
			}
		}
		if (best === null) {
			return { delta: 0, guides: [] };
		}
		const delta = best;
		const snapped = edges.map((e) => e + delta);
		const guides = [...new Set(candidates.filter((t) => snapped.some((e) => Math.abs(e - t) < 1e-6)))];
		return { delta, guides };
	};
	const sx = axis(moving.x, moving.w, targets.x);
	const sy = axis(moving.y, moving.h, targets.y);
	return { dx: sx.delta, dy: sy.delta, guides: { x: sx.guides, y: sy.guides } };
}
