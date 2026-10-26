import { clamp } from './geometry.ts';
import type { ElementRef } from './elements.ts';
import type { Command } from './store.ts';
import type { ImageElement } from './schema/design-document.ts';

/** A crop rectangle, 0–1 of the source image. */
export interface NormCrop {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** The whole (uncropped) image as it sits in the print area: centre, size in mm, rotation and flips. */
export interface ImageFrame {
	cx: number;
	cy: number;
	w: number;
	h: number;
	rotation: number;
	flipX: boolean;
	flipY: boolean;
}

type CropSource = Pick<ImageElement, 'x' | 'y' | 'w' | 'h' | 'rotation' | 'flipX' | 'flipY' | 'crop'>;

/** Smallest crop, as a share of the source on each axis. */
export const MIN_CROP = 0.02;

/** Offset of a crop's centre from the image centre, in the element's on-screen axes (mm). */
function localOffset(frame: Pick<ImageFrame, 'w' | 'h' | 'flipX' | 'flipY'>, crop: NormCrop): { x: number; y: number } {
	const x = (crop.x + crop.w / 2 - 0.5) * frame.w;
	const y = (crop.y + crop.h / 2 - 0.5) * frame.h;
	return { x: frame.flipX ? -x : x, y: frame.flipY ? -y : y };
}

function rotate(p: { x: number; y: number }, degrees: number): { x: number; y: number } {
	const rad = (degrees * Math.PI) / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
}

/** Where the full source image lies, given an element showing part of it. */
export function imageFrame(el: CropSource): ImageFrame {
	const w = el.w / el.crop.w;
	const h = el.h / el.crop.h;
	const frame = { w, h, flipX: el.flipX, flipY: el.flipY };
	const off = rotate(localOffset(frame, el.crop), el.rotation);
	return { ...frame, cx: el.x + el.w / 2 - off.x, cy: el.y + el.h / 2 - off.y, rotation: el.rotation };
}

/** The element box that shows `crop` of a frame, at the same scale (mm per source pixel) and place. */
export function placeCrop(frame: ImageFrame, crop: NormCrop): { x: number; y: number; w: number; h: number } {
	const w = crop.w * frame.w;
	const h = crop.h * frame.h;
	const off = rotate(localOffset(frame, crop), frame.rotation);
	return { x: frame.cx + off.x - w / 2, y: frame.cy + off.y - h / 2, w, h };
}

/** The crop a box covers: `box` is a centre and size in print-area mm, aligned with the frame. */
export function cropOfBox(frame: ImageFrame, box: { cx: number; cy: number; w: number; h: number }): NormCrop {
	const local = rotate({ x: box.cx - frame.cx, y: box.cy - frame.cy }, -frame.rotation);
	const lx = frame.flipX ? -local.x : local.x;
	const ly = frame.flipY ? -local.y : local.y;
	const w = box.w / frame.w;
	const h = box.h / frame.h;
	return { x: lx / frame.w + 0.5 - w / 2, y: ly / frame.h + 0.5 - h / 2, w, h };
}

/**
 * Keep a crop inside the image. A moved crop slides back in; a resized one is
 * trimmed. With `ratio` (width ÷ height in mm) the trimmed crop shrinks to keep it.
 */
export function clampCrop(crop: NormCrop, mode: 'move' | 'resize', frame?: Pick<ImageFrame, 'w' | 'h'>, ratio?: number | null): NormCrop {
	let { x, y, w, h } = crop;
	if (mode === 'move') {
		w = clamp(w, MIN_CROP, 1);
		h = clamp(h, MIN_CROP, 1);
		return { x: clamp(x, 0, 1 - w), y: clamp(y, 0, 1 - h), w, h };
	}
	// The edge being dragged is trimmed; the opposite edge stays put.
	const right = Math.min(1, x + w);
	const bottom = Math.min(1, y + h);
	x = Math.max(0, x);
	y = Math.max(0, y);
	w = Math.max(MIN_CROP, right - x);
	h = Math.max(MIN_CROP, bottom - y);
	if (ratio && frame) {
		// Shrink the longer side so w·W ÷ h·H stays at the ratio.
		const current = (w * frame.w) / (h * frame.h);
		if (current > ratio) w = (h * frame.h * ratio) / frame.w;
		else h = (w * frame.w) / (ratio * frame.h);
	}
	return { x: clamp(x, 0, 1 - w), y: clamp(y, 0, 1 - h), w, h };
}

/** The largest crop with this mm aspect ratio inside the image, as near `around`'s centre as fits. */
export function fitCropToRatio(around: NormCrop, frame: Pick<ImageFrame, 'w' | 'h'>, ratio: number): NormCrop {
	// Height (0–1) a full-width crop would need at this ratio.
	let w = 1;
	let h = frame.w / (ratio * frame.h);
	if (h > 1) {
		w = (ratio * frame.h) / frame.w;
		h = 1;
	}
	const cx = around.x + around.w / 2;
	const cy = around.y + around.h / 2;
	return { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h };
}

/** Apply a new crop to an image, keeping its scale and the place of everything still visible. */
export function cropImage(ref: ElementRef, crop: NormCrop, label = 'Crop'): Command {
	return {
		label,
		recipe: (draft) => {
			const el = draft.sides[ref.side]?.printAreas[ref.area]?.elements.find((e) => e.id === ref.id);
			if (el?.type !== 'image') {
				return;
			}
			const next = clampCrop(crop, 'resize');
			Object.assign(el, placeCrop(imageFrame(el), next), { crop: next });
		},
	};
}
