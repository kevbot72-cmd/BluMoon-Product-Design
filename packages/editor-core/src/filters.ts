import type { ImageElement, ImageFilter } from './schema/design-document.ts';

export type FilterName = ImageFilter['name'];
export type AdjustName = Extract<ImageFilter, { value: number }>['name'];

/** A named look: a filter chain applied before the shopper's own adjustments. */
export interface FilterPreset {
	id: string;
	label: string;
	filters: readonly ImageFilter[];
}

/**
 * The looks offered in the editor. Ids are stored in designs, so never
 * rename one; print output applies the same chains.
 */
export const FILTER_PRESETS: readonly FilterPreset[] = [
	{ id: 'vivid', label: 'Vivid', filters: [{ name: 'saturation', value: 0.3 }, { name: 'contrast', value: 0.1 }] },
	{ id: 'punch', label: 'Punch', filters: [{ name: 'contrast', value: 0.25 }, { name: 'saturation', value: 0.15 }, { name: 'sharpen', value: 0.3 }] },
	{ id: 'warm', label: 'Warm', filters: [{ name: 'temperature', value: 0.5 }, { name: 'saturation', value: 0.05 }] },
	{ id: 'cool', label: 'Cool', filters: [{ name: 'temperature', value: -0.5 }] },
	{ id: 'fade', label: 'Fade', filters: [{ name: 'contrast', value: -0.25 }, { name: 'brightness', value: 0.08 }, { name: 'saturation', value: -0.2 }] },
	{ id: 'soft', label: 'Soft', filters: [{ name: 'contrast', value: -0.08 }, { name: 'blur', value: 0.03 }] },
	{ id: 'dramatic', label: 'Dramatic', filters: [{ name: 'contrast', value: 0.35 }, { name: 'saturation', value: -0.25 }, { name: 'brightness', value: -0.05 }] },
	{ id: 'vintage', label: 'Vintage', filters: [{ name: 'sepia' }, { name: 'contrast', value: -0.1 }, { name: 'brightness', value: 0.05 }] },
	{ id: 'mono', label: 'Mono', filters: [{ name: 'grayscale' }] },
	{ id: 'noir', label: 'Noir', filters: [{ name: 'grayscale' }, { name: 'contrast', value: 0.35 }] },
	{ id: 'violet', label: 'Violet', filters: [{ name: 'duotone', dark: '#2a1a5e', light: '#f3c4e0' }] },
	{ id: 'sunset', label: 'Sunset', filters: [{ name: 'duotone', dark: '#5a1638', light: '#ffd27a' }] },
];

/** Adjustment sliders, in the order they are applied. */
export const ADJUSTMENTS: readonly { name: AdjustName; label: string; min: number; max: number }[] = [
	{ name: 'brightness', label: 'Brightness', min: -1, max: 1 },
	{ name: 'contrast', label: 'Contrast', min: -1, max: 1 },
	{ name: 'saturation', label: 'Saturation', min: -1, max: 1 },
	{ name: 'temperature', label: 'Warmth', min: -1, max: 1 },
	{ name: 'hue', label: 'Hue', min: -1, max: 1 },
	{ name: 'sharpen', label: 'Sharpen', min: 0, max: 1 },
	{ name: 'blur', label: 'Blur', min: 0, max: 1 },
];

const ORDER: readonly FilterName[] = ['brightness', 'contrast', 'saturation', 'temperature', 'hue', 'sharpen', 'blur', 'grayscale', 'sepia', 'invert', 'duotone'];

export const presetById = (id: string | null): FilterPreset | undefined => FILTER_PRESETS.find((p) => p.id === id);

/** The chain an image is drawn with: its preset's filters, then its own. Unknown presets are ignored. */
export function effectiveFilters(el: Pick<ImageElement, 'preset' | 'filters'>): ImageFilter[] {
	return [...(presetById(el.preset)?.filters ?? []), ...el.filters];
}

/**
 * Set or remove one filter (by name) in a shopper's chain, keeping a fixed
 * order so the same settings always draw the same. A zero adjustment is removed.
 */
export function withFilter(filters: readonly ImageFilter[], name: FilterName, next: ImageFilter | null): ImageFilter[] {
	const kept = filters.filter((f) => f.name !== name);
	if (next && !('value' in next && next.value === 0)) {
		kept.push(next);
	}
	return kept.sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name));
}

/** An adjustment's value in a chain (0 when absent). */
export function adjustment(filters: readonly ImageFilter[], name: AdjustName): number {
	const found = filters.find((f) => f.name === name);
	return found && 'value' in found ? found.value : 0;
}
