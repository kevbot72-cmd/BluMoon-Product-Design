import { describe, expect, it, vi } from 'vitest';

// The real module is a WordPress global at runtime; only its type matters here.
vi.mock('@wordpress/api-fetch', () => ({ default: vi.fn() }));

const { formatBytes, sortChecks } = await import('./health.ts');

describe('sortChecks', () => {
	it('puts errors first, then warnings, then passes, keeping order within a status', () => {
		const sorted = sortChecks([
			{ id: 'a', label: 'A', status: 'ok', message: '' },
			{ id: 'b', label: 'B', status: 'warning', message: '' },
			{ id: 'c', label: 'C', status: 'error', message: '' },
			{ id: 'd', label: 'D', status: 'warning', message: '' },
		]);
		expect(sorted.map((c) => c.id)).toEqual(['c', 'b', 'd', 'a']);
	});
});

describe('formatBytes', () => {
	it('formats MB and GB', () => {
		expect(formatBytes(64 * 1024 ** 2)).toBe('64 MB');
		expect(formatBytes(2.5 * 1024 ** 3)).toBe('2.5 GB');
	});
});
