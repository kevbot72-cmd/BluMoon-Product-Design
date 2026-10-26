import type { ShapeElement } from '@bps/editor-core';

const n = (v: number): string => String(Math.round(v * 1000) / 1000);

/**
 * SVG path data for a built-in shape filling a w × h box (origin top-left).
 * Shapes are rebuilt at their real size rather than scaled, so strokes and
 * corner radii stay true in mm.
 */
export function shapePath(shape: ShapeElement['shape'], w: number, h: number, radius = 0): string {
	switch (shape) {
		case 'rect': {
			const r = Math.min(radius, w / 2, h / 2);
			if (r <= 0) {
				return `M0 0H${n(w)}V${n(h)}H0Z`;
			}
			return `M${n(r)} 0H${n(w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(w)} ${n(r)}V${n(h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(w - r)} ${n(h)}H${n(r)}A${n(r)} ${n(r)} 0 0 1 0 ${n(h - r)}V${n(r)}A${n(r)} ${n(r)} 0 0 1 ${n(r)} 0Z`;
		}
		case 'ellipse': {
			const rx = w / 2;
			const ry = h / 2;
			return `M0 ${n(ry)}A${n(rx)} ${n(ry)} 0 1 1 ${n(w)} ${n(ry)}A${n(rx)} ${n(ry)} 0 1 1 0 ${n(ry)}Z`;
		}
		case 'triangle':
			return `M${n(w / 2)} 0L${n(w)} ${n(h)}H0Z`;
		case 'star':
			return polygon(10, w, h, (i) => (i % 2 === 0 ? 1 : 0.4), -Math.PI / 2);
		case 'hexagon':
			return polygon(6, w, h, () => 1, 0);
		case 'heart':
			return [
				`M${n(w / 2)} ${n(h * 0.28)}`,
				`C${n(w * 0.5)} ${n(h * 0.1)} ${n(w * 0.2)} 0 ${n(w * 0.08)} ${n(h * 0.12)}`,
				`C${n(-w * 0.04)} ${n(h * 0.24)} 0 ${n(h * 0.5)} ${n(w * 0.15)} ${n(h * 0.65)}`,
				`L${n(w / 2)} ${n(h)}`,
				`L${n(w * 0.85)} ${n(h * 0.65)}`,
				`C${n(w)} ${n(h * 0.5)} ${n(w * 1.04)} ${n(h * 0.24)} ${n(w * 0.92)} ${n(h * 0.12)}`,
				`C${n(w * 0.8)} 0 ${n(w * 0.5)} ${n(h * 0.1)} ${n(w / 2)} ${n(h * 0.28)}Z`,
			].join('');
		case 'line':
			return `M0 ${n(h / 2)}H${n(w)}`;
		case 'arrow': {
			const head = Math.min(w * 0.3, h * 1.2);
			return `M0 ${n(h / 2)}H${n(w)}M${n(w - head)} 0L${n(w)} ${n(h / 2)}L${n(w - head)} ${n(h)}`;
		}
	}
}

/** Regular polygon (or star), stretched so its points touch all four sides of the box. */
function polygon(points: number, w: number, h: number, radius: (i: number) => number, start: number): string {
	const raw = Array.from({ length: points }, (_, i) => {
		const a = start + (i * 2 * Math.PI) / points;
		return { x: Math.cos(a) * radius(i), y: Math.sin(a) * radius(i) };
	});
	const minX = Math.min(...raw.map((p) => p.x));
	const maxX = Math.max(...raw.map((p) => p.x));
	const minY = Math.min(...raw.map((p) => p.y));
	const maxY = Math.max(...raw.map((p) => p.y));
	return (
		raw.map((p, i) => `${i === 0 ? 'M' : 'L'}${n(((p.x - minX) / (maxX - minX)) * w)} ${n(((p.y - minY) / (maxY - minY)) * h)}`).join('') + 'Z'
	);
}

/** Shapes that are open strokes (no fill). */
export const isStrokeShape = (shape: ShapeElement['shape']): boolean => shape === 'line' || shape === 'arrow';
