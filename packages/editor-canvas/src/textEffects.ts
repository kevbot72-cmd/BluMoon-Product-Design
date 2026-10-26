/**
 * Geometry for vector text effects. Everything here produces path data, so
 * the canvas, SVG export and print output draw exactly the same outline.
 */

const n = (v: number): string => String(Math.round(v * 1000) / 1000);

/** A path command: [letter, ...numbers] with absolute coordinates. */
export type PathCommand = [string, ...number[]];

export interface PathBounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

/** Bounds of all on-curve and control points. */
export function commandBounds(commands: readonly PathCommand[]): PathBounds {
	const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
	for (const [, ...nums] of commands) {
		for (let i = 0; i + 1 < nums.length; i += 2) {
			b.minX = Math.min(b.minX, nums[i]!);
			b.maxX = Math.max(b.maxX, nums[i]!);
			b.minY = Math.min(b.minY, nums[i + 1]!);
			b.maxY = Math.max(b.maxY, nums[i + 1]!);
		}
	}
	return b;
}

/**
 * "Bridge" envelope warp (the Lumise effect): the top edge follows a curve
 * while the baseline stays straight. `curve` > 0 dips the top in the middle
 * (an arch), < 0 lifts it. `offset` 0–1 moves the deepest point of the curve.
 */
export function bridgeWarp(commands: readonly PathCommand[], curve: number, offset = 0.5): PathCommand[] {
	const b = commandBounds(commands);
	const width = b.maxX - b.minX || 1;
	const height = b.maxY - b.minY || 1;
	const peak = Math.min(0.95, Math.max(0.05, offset));
	const warpY = (x: number, y: number): number => {
		const t = (x - b.minX) / width;
		// A smooth hump whose maximum sits at `peak`.
		const hump = t <= peak ? Math.sin((t / peak) * (Math.PI / 2)) : Math.sin(((1 - t) / (1 - peak)) * (Math.PI / 2));
		const fromBottom = (b.maxY - y) / height;
		return y + curve * height * 0.6 * hump * fromBottom;
	};
	return commands.map(([cmd, ...nums]) => {
		const out: number[] = [];
		for (let i = 0; i + 1 < nums.length; i += 2) {
			out.push(nums[i]!, warpY(nums[i]!, nums[i + 1]!));
		}
		return [cmd, ...out] as PathCommand;
	});
}

/** Serialise commands to SVG path data. */
export function toPathData(commands: readonly PathCommand[]): string {
	return commands.map(([cmd, ...nums]) => cmd + nums.map(n).join(' ')).join('');
}
