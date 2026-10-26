import { filters, FabricImage } from 'fabric';
import { parseHex, type ImageFilter } from '@bps/editor-core';

type Filter = InstanceType<(typeof filters)['BaseFilter']>;

const LUMA = [0.2126, 0.7152, 0.0722] as const;

/** Duotone: luminance mapped from the dark colour (black) to the light one (white). */
function duotone(dark: string, light: string): Filter {
	const d = parseHex(dark) ?? { r: 0, g: 0, b: 0 };
	const l = parseHex(light) ?? { r: 255, g: 255, b: 255 };
	const row = (from: number, to: number): number[] => [...LUMA.map((k) => ((to - from) / 255) * k), 0, from / 255];
	return new filters.ColorMatrix({ matrix: [...row(d.r, l.r), ...row(d.g, l.g), ...row(d.b, l.b), 0, 0, 0, 1, 0], colorsOnly: true });
}

/** Warmer (positive) or cooler (negative): shifts red against blue. */
function temperature(value: number): Filter {
	const k = value * 0.12;
	return new filters.ColorMatrix({ matrix: [1, 0, 0, 0, k, 0, 1, 0, 0, k * 0.2, 0, 0, 1, 0, -k, 0, 0, 0, 1, 0], colorsOnly: true });
}

/** A design filter as Fabric filters (the print renderer applies the same maths). */
export function fabricFilter(f: ImageFilter): Filter | null {
	switch (f.name) {
		case 'brightness':
			return new filters.Brightness({ brightness: f.value * 0.5 });
		case 'contrast':
			return new filters.Contrast({ contrast: f.value * 0.6 });
		case 'saturation':
			return new filters.Saturation({ saturation: f.value });
		case 'hue':
			return new filters.HueRotation({ rotation: f.value });
		case 'temperature':
			return temperature(f.value);
		case 'blur':
			return f.value > 0 ? new filters.Blur({ blur: f.value * 0.5 }) : null;
		case 'sharpen': {
			const v = Math.max(0, f.value);
			return v > 0 ? new filters.Convolute({ matrix: [0, -v, 0, -v, 1 + 4 * v, -v, 0, -v, 0] }) : null;
		}
		case 'grayscale':
			return new filters.Grayscale();
		case 'sepia':
			return new filters.Sepia();
		case 'invert':
			return new filters.Invert();
		case 'duotone':
			return duotone(f.dark, f.light);
	}
}

/** Set an image's filter chain and redraw its pixels. */
export function applyFilters(img: FabricImage, chain: readonly ImageFilter[]): void {
	img.filters = chain.map(fabricFilter).filter((f): f is Filter => f !== null);
	img.applyFilters();
}

/** A small preview of an image with a filter chain, for the looks picker. */
export function filterThumbnail(source: HTMLImageElement, chain: readonly ImageFilter[], size = 72): string {
	const scale = size / Math.max(source.naturalWidth, source.naturalHeight);
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
	canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
	canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
	const img = new FabricImage(canvas);
	applyFilters(img, chain);
	return img.toDataURL({ format: 'jpeg', quality: 0.8 });
}
