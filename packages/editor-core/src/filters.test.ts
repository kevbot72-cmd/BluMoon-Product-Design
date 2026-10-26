import { describe, expect, it } from 'vitest';
import { adjustment, effectiveFilters, FILTER_PRESETS, withFilter } from './filters.ts';
import { ImageFilter } from './schema/design-document.ts';

describe('filters', () => {
	it('defines valid, uniquely named presets', () => {
		expect(new Set(FILTER_PRESETS.map((p) => p.id)).size).toBe(FILTER_PRESETS.length);
		for (const preset of FILTER_PRESETS) {
			for (const f of preset.filters) expect(ImageFilter.safeParse(f).success, `${preset.id} ${f.name}`).toBe(true);
		}
	});

	it('applies the preset before the shopper’s own adjustments', () => {
		expect(effectiveFilters({ preset: 'mono', filters: [{ name: 'brightness', value: 0.2 }] })).toEqual([{ name: 'grayscale' }, { name: 'brightness', value: 0.2 }]);
		expect(effectiveFilters({ preset: 'retired-look', filters: [] })).toEqual([]);
	});

	it('sets, replaces and removes filters in a fixed order', () => {
		let chain = withFilter([], 'sepia', { name: 'sepia' });
		chain = withFilter(chain, 'contrast', { name: 'contrast', value: 0.3 });
		chain = withFilter(chain, 'brightness', { name: 'brightness', value: -0.1 });
		expect(chain.map((f) => f.name)).toEqual(['brightness', 'contrast', 'sepia']);
		chain = withFilter(chain, 'contrast', { name: 'contrast', value: 0 });
		expect(chain.map((f) => f.name)).toEqual(['brightness', 'sepia']);
		expect(adjustment(chain, 'brightness')).toBe(-0.1);
		expect(adjustment(chain, 'blur')).toBe(0);
		expect(withFilter(chain, 'sepia', null).map((f) => f.name)).toEqual(['brightness']);
	});
});
