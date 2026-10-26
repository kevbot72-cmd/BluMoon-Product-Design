/** Colour helpers (sRGB hex). */

/** Parse #rgb / #rrggbb / #rrggbbaa into 0–255 channels; null when invalid. */
export function parseHex(hex: string): { r: number; g: number; b: number; a: number } | null {
	const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
	if (!m) {
		return null;
	}
	let h = m[1]!;
	if (h.length === 3) {
		h = h.replace(/./g, '$&$&');
	}
	return {
		r: parseInt(h.slice(0, 2), 16),
		g: parseInt(h.slice(2, 4), 16),
		b: parseInt(h.slice(4, 6), 16),
		a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
	};
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
	const c = parseHex(hex);
	if (!c) {
		return 0;
	}
	const lin = (v: number): number => {
		const s = v / 255;
		return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** WCAG contrast ratio, 1–21. */
export function contrastRatio(a: string, b: string): number {
	const la = luminance(a);
	const lb = luminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Whether a QR code in these colours scans reliably: dark modules on a light
 * background with clear contrast. Inverted codes fail on many phone readers.
 * A transparent background is judged against the product colour.
 */
export function qrScannable(fg: string, bg: string | null, behind = '#ffffff'): boolean {
	const back = bg ?? behind;
	return luminance(fg) < luminance(back) && contrastRatio(fg, back) >= 4;
}

/** Normalise any 3/6/8-digit hex to lowercase #rrggbb (alpha dropped). */
export function normalizeHex(hex: string): string | null {
	const c = parseHex(hex);
	if (!c) {
		return null;
	}
	return '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('');
}
