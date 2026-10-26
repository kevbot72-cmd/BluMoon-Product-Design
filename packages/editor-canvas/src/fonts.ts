import { cache } from 'fabric';
import type { Font } from 'opentype.js';

export interface FontVariant {
	weight: number;
	style: 'normal' | 'italic';
	/** woff2 for the browser. */
	woff2: string;
	/** woff for glyph outlines (opentype.js can't read woff2). */
	woff: string;
}

export interface FontFamily {
	family: string;
	category: 'sans' | 'serif' | 'display' | 'script' | 'handwriting';
	variants: FontVariant[];
}

/**
 * Fonts the editor offers. Each variant is loaded on demand with the
 * FontFace API; glyph outlines (for vector text effects) are parsed lazily.
 */
export class FontRegistry {
	readonly #families = new Map<string, FontFamily>();
	readonly #loaded = new Map<string, Promise<void>>();
	readonly #outlines = new Map<string, Promise<Font>>();
	readonly #ready = new Map<string, Font>();

	constructor(families: readonly FontFamily[]) {
		for (const family of families) {
			this.#families.set(family.family, family);
		}
	}

	list(): FontFamily[] {
		return [...this.#families.values()];
	}

	has(family: string): boolean {
		return this.#families.has(family);
	}

	/** The variant closest to a weight and style. */
	variant(family: string, weight: number, style: 'normal' | 'italic' = 'normal'): FontVariant | null {
		const variants = this.#families.get(family)?.variants ?? [];
		const sameStyle = variants.filter((v) => v.style === style);
		const pool = sameStyle.length > 0 ? sameStyle : variants;
		return pool.reduce<FontVariant | null>((best, v) => (best === null || Math.abs(v.weight - weight) < Math.abs(best.weight - weight) ? v : best), null);
	}

	/** Load a font for rendering. Resolves when the browser can draw with it. */
	load(family: string, weight: number, style: 'normal' | 'italic' = 'normal'): Promise<void> {
		const variant = this.variant(family, weight, style);
		if (!variant) {
			return Promise.resolve();
		}
		const key = `${family}|${variant.weight}|${variant.style}`;
		let pending = this.#loaded.get(key);
		if (!pending) {
			const face = new FontFace(family, `url(${variant.woff2}) format('woff2')`, { weight: String(variant.weight), style: variant.style, display: 'swap' });
			pending = face.load().then((loaded) => {
				document.fonts.add(loaded);
				// Fabric caches glyph widths per family; measurements taken with a fallback font are wrong now.
				cache.clearFontCache(family);
			});
			this.#loaded.set(key, pending);
		}
		return pending;
	}

	/** Glyph outlines for vector effects; loads and parses the woff once. */
	outlines(family: string, weight: number, style: 'normal' | 'italic' = 'normal'): Promise<Font | null> {
		const variant = this.variant(family, weight, style);
		if (!variant) {
			return Promise.resolve(null);
		}
		const key = `${family}|${variant.weight}|${variant.style}`;
		let pending = this.#outlines.get(key);
		if (!pending) {
			// opentype.js is only needed for text effects, so it loads on first use.
			pending = Promise.all([fetch(variant.woff).then((r) => r.arrayBuffer()), import('opentype.js')])
				.then(([buffer, opentype]) => {
					const font = opentype.parse(buffer);
					this.#ready.set(key, font);
					return font;
				});
			this.#outlines.set(key, pending);
		}
		return pending;
	}

	/** Outlines if already parsed (synchronous rendering path). */
	outlinesNow(family: string, weight: number, style: 'normal' | 'italic' = 'normal'): Font | null {
		const variant = this.variant(family, weight, style);
		return variant ? (this.#ready.get(`${family}|${variant.weight}|${variant.style}`) ?? null) : null;
	}
}
