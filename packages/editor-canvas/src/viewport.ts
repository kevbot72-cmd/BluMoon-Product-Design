import type { SizeMm } from '@bps/editor-core';

export type Transform = [number, number, number, number, number, number];

export interface Point {
	x: number;
	y: number;
}

/**
 * Maps stage millimetres to CSS pixels: screen = mm × scale + pan.
 * Zoom is relative to "fit" (1 = the whole stage fits the view).
 */
export class Viewport {
	#view: SizeMm = { w: 1, h: 1 };
	#stage: SizeMm;
	#zoom = 1;
	#pan: Point = { x: 0, y: 0 };

	static readonly MIN_ZOOM = 0.25;
	static readonly MAX_ZOOM = 8;
	/** Breathing room around the stage when fitted. */
	static readonly FIT_MARGIN = 0.92;

	constructor(stage: SizeMm, view: SizeMm) {
		this.#stage = stage;
		this.#view = view;
		this.fit();
	}

	get zoom(): number {
		return this.#zoom;
	}

	/** CSS pixels per millimetre at zoom 1. */
	get fitScale(): number {
		return Math.min(this.#view.w / this.#stage.w, this.#view.h / this.#stage.h) * Viewport.FIT_MARGIN;
	}

	/** CSS pixels per millimetre now. */
	get scale(): number {
		return this.fitScale * this.#zoom;
	}

	get transform(): Transform {
		const s = this.scale;
		return [s, 0, 0, s, this.#pan.x, this.#pan.y];
	}

	setStage(stage: SizeMm): void {
		this.#stage = stage;
		this.fit();
	}

	/** View resized: keep the same stage point in the centre. */
	resize(view: SizeMm): void {
		const centre = this.toScene({ x: this.#view.w / 2, y: this.#view.h / 2 });
		this.#view = view;
		this.#centreOn(centre);
	}

	/** Zoom 1, stage centred. */
	fit(): void {
		this.#zoom = 1;
		this.#centreOn({ x: this.#stage.w / 2, y: this.#stage.h / 2 });
	}

	/** Set the zoom, keeping the given screen point fixed (default: view centre). */
	zoomTo(zoom: number, anchor: Point = { x: this.#view.w / 2, y: this.#view.h / 2 }): void {
		const scene = this.toScene(anchor);
		this.#zoom = Math.min(Viewport.MAX_ZOOM, Math.max(Viewport.MIN_ZOOM, zoom));
		const s = this.scale;
		this.#pan = { x: anchor.x - scene.x * s, y: anchor.y - scene.y * s };
	}

	/** Fit a stage rectangle (e.g. the selection) into the view. */
	zoomToBox(box: { x: number; y: number; w: number; h: number }): void {
		const fitBox = Math.min(this.#view.w / box.w, this.#view.h / box.h) * Viewport.FIT_MARGIN * 0.8;
		this.#zoom = Math.min(Viewport.MAX_ZOOM, Math.max(Viewport.MIN_ZOOM, fitBox / this.fitScale));
		this.#centreOn({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
	}

	panBy(dx: number, dy: number): void {
		this.#pan = { x: this.#pan.x + dx, y: this.#pan.y + dy };
	}

	toScene(p: Point): Point {
		const s = this.scale;
		return { x: (p.x - this.#pan.x) / s, y: (p.y - this.#pan.y) / s };
	}

	toScreen(p: Point): Point {
		const s = this.scale;
		return { x: p.x * s + this.#pan.x, y: p.y * s + this.#pan.y };
	}

	#centreOn(scene: Point): void {
		const s = this.scale;
		this.#pan = { x: this.#view.w / 2 - scene.x * s, y: this.#view.h / 2 - scene.y * s };
	}
}
