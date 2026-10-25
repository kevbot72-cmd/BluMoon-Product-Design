/**
 * Unit conversions. The design document stores millimetres (ADR-0003);
 * everything else is derived here.
 */

export const MM_PER_INCH = 25.4;
export const PT_PER_INCH = 72;

export interface SizeMm {
	w: number;
	h: number;
}

export interface SizePx {
	w: number;
	h: number;
}

/** Millimetres to pixels at a given resolution (unrounded). */
export const mmToPx = (mm: number, dpi: number): number => (mm / MM_PER_INCH) * dpi;

/** Pixels to millimetres at a given resolution. */
export const pxToMm = (px: number, dpi: number): number => (px / dpi) * MM_PER_INCH;

/** Typographic points to millimetres. */
export const ptToMm = (pt: number): number => (pt / PT_PER_INCH) * MM_PER_INCH;

/** Millimetres to typographic points. */
export const mmToPt = (mm: number): number => (mm / MM_PER_INCH) * PT_PER_INCH;

/**
 * Pixel size of a print file for an area, optionally with bleed on every edge.
 * 300 × 205 mm at 300 dpi → 3543 × 2421 px.
 */
export const printPixels = (size: SizeMm, dpi: number, bleedMm = 0): SizePx => ({
	w: Math.round(mmToPx(size.w + 2 * bleedMm, dpi)),
	h: Math.round(mmToPx(size.h + 2 * bleedMm, dpi)),
});

export interface CropRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * Effective resolution of an image placed at a physical size: the lower of
 * the horizontal and vertical pixels-per-inch of the visible (cropped) part.
 */
export const effectiveDpi = (naturalPx: SizePx, placed: SizeMm, crop: CropRect = { x: 0, y: 0, w: 1, h: 1 }): number =>
	Math.min((naturalPx.w * crop.w) / (placed.w / MM_PER_INCH), (naturalPx.h * crop.h) / (placed.h / MM_PER_INCH));

export type Quality = 'good' | 'fair' | 'poor';

/** Quality band for the live badge: good ≥ target dpi, fair ≥ warn dpi, poor below. */
export const qualityFor = (dpi: number, targetDpi: number, warnDpi = 150): Quality =>
	dpi >= targetDpi ? 'good' : dpi >= warnDpi ? 'fair' : 'poor';
