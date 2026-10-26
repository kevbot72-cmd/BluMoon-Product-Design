import type { PrintArea } from './schema/product-config.ts';
import type { SizeMm } from './units.ts';

/** A print area placed on its side's stage, in stage millimetres. */
export interface AreaLayout {
	id: string;
	label: string;
	/** Top-left on the stage. */
	x: number;
	y: number;
	/** Physical size; elements use this as their coordinate space. */
	w: number;
	h: number;
	shape: PrintArea['shape'];
	cornerRadiusMm: number;
	pathD: string | null;
	bleedMm: number;
	safeMm: number;
	dpi: number;
	clip: boolean;
}

export interface SideLayout {
	/** The whole base image in mm. */
	stage: SizeMm;
	/** Millimetres per base-image pixel. */
	mmPerPx: number;
	areas: AreaLayout[];
}

/**
 * Place a side's print areas in millimetres. The first print area calibrates
 * the photo: its rectangle (0–1 of the image) is `sizeMm` wide, which gives
 * the scale for the whole image and every other area (DATA-SCHEMA §1).
 */
export function sideLayout(image: { widthPx: number; heightPx: number }, printAreas: readonly PrintArea[]): SideLayout {
	const first = printAreas[0];
	if (!first) {
		throw new Error('A side needs at least one print area.');
	}
	const mmPerPx = first.sizeMm.w / (first.rect.w * image.widthPx);
	const stage = { w: image.widthPx * mmPerPx, h: image.heightPx * mmPerPx };
	const areas = printAreas.map((area, index) => ({
		id: area.id,
		label: area.label,
		x: area.rect.x * stage.w,
		y: area.rect.y * stage.h,
		// The calibrating area keeps its exact physical size; others derive from the scale.
		w: index === 0 ? area.sizeMm.w : area.rect.w * stage.w,
		h: index === 0 ? area.sizeMm.h : area.rect.h * stage.h,
		shape: area.shape,
		cornerRadiusMm: area.cornerRadiusMm,
		pathD: area.pathD,
		bleedMm: area.bleedMm,
		safeMm: area.safeMm,
		dpi: area.dpi,
		clip: area.clip,
	}));
	return { stage, mmPerPx, areas };
}
