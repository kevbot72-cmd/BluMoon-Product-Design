import { ActiveSelection, Canvas, Ellipse, FabricImage, FabricObject, IText, Path, PencilBrush, Rect, util, type TPointerEventInfo } from 'fabric';
import {
	addElement,
	areaElements,
	clampCrop,
	createDrawing,
	cropImage,
	cropOfBox,
	fitCropToRatio,
	imageFrame,
	isMovable,
	placeCrop,
	Emitter,
	newId,
	transformElements,
	updateText,
	type AreaLayout,
	type Command,
	type EditorSession,
	type Element,
	type ElementTransform,
	type ImageElement,
	type ImageFrame,
	type NormCrop,
	type SideLayout,
	type TextElement,
	type TextMeasurer,
} from '@bps/editor-core';
import type { FontRegistry } from './fonts.ts';
import type { ImageCache } from './images.ts';
import { snap, snapTargets, type Bounds } from './snapping.ts';
import { Viewport } from './viewport.ts';
import { buildObject, imageUrl, svgColors, textObject, viewMeta, type AssetResolver, type ViewContext } from './views.ts';

export interface SideImage {
	url: string;
}

/** A side as the stage needs it: images plus the mm layout. */
export interface SideRuntime {
	id: string;
	label: string;
	base: SideImage;
	overlay: (SideImage & { blend: 'multiply' | 'screen' | 'normal' }) | null;
	mask: SideImage | null;
	layout: SideLayout;
}

export interface StageEvents extends Record<string, unknown> {
	'viewport:changed': { zoom: number };
	/** Selection bounds in CSS pixels relative to the canvas, for the floating toolbar. */
	'selection:box': { box: { x: number; y: number; w: number; h: number } | null };
	/** A text that can't be edited inline (capitals or an effect) was double-clicked. */
	'text:edit': { id: string };
	/** A drag snapped to a guide (for haptics). */
	snap: Record<string, never>;
	/** Crop mode started (id), changed ratio, or ended (null). */
	'crop:changed': { id: string | null; ratio: number | null };
}

/** An image being cropped: the whole photo dimmed, the kept part bright, and the crop box. */
interface CropSession {
	id: string;
	frame: ImageFrame;
	ratio: number | null;
	dim: FabricImage;
	bright: FabricImage;
	clip: Rect;
	box: Rect;
	/** Objects that were clickable before cropping. */
	evented: Map<FabricObject, boolean>;
}

export interface StageOptions {
	session: EditorSession;
	sides: readonly SideRuntime[];
	fonts: FontRegistry;
	images: ImageCache;
	assets: AssetResolver;
	accent: string;
}

export interface DrawingOptions {
	enabled: boolean;
	color: string;
	widthMm: number;
	erase: boolean;
}

const SNAP_PX = 6;

/**
 * The interactive canvas: draws the active side's product, design elements
 * and guides, and turns gestures into commands. Fabric works in stage
 * millimetres; the Viewport maps them to the screen.
 */
export class Stage {
	readonly events = new Emitter<StageEvents>();
	readonly viewport: Viewport;
	readonly #canvas: Canvas;
	readonly #opts: StageOptions;
	readonly #objects = new Map<string, FabricObject>();
	/** The element snapshot each object was built from. */
	readonly #built = new Map<string, Element>();
	#side: SideRuntime;
	#productColor: string | null = null;
	#gesture: string | null = null;
	/** Elements as they were when the current gesture began; live steps scale from these. */
	#gestureStart = new Map<string, Element>();
	#transforming = new Set<string>();
	#editing: string | null = null;
	#dragging = false;
	#guides: { x: number[]; y: number[] } = { x: [], y: [] };
	#syncing: Promise<void> = Promise.resolve();
	#selectingFromCanvas = false;
	#selectingFromSession = false;
	/** Objects are being swapped: canvas selection events are side effects, not user intent. */
	#rebuilding = false;
	#spaceDown = false;
	#panFrom: { x: number; y: number } | null = null;
	#drawing: DrawingOptions = { enabled: false, color: '#1a1a1a', widthMm: 1, erase: false };
	#crop: CropSession | null = null;
	readonly #unsubscribe: (() => void)[] = [];
	showGuides = true;

	constructor(element: HTMLCanvasElement, opts: StageOptions) {
		this.#opts = opts;
		const side = opts.sides.find((s) => s.id === opts.session.active.side) ?? opts.sides[0];
		if (!side) {
			throw new Error('The stage needs at least one side.');
		}
		this.#side = side;
		this.#canvas = new Canvas(element, {
			preserveObjectStacking: true,
			controlsAboveOverlay: true,
			uniformScaling: true,
			uniScaleKey: 'shiftKey',
			centeredKey: 'altKey',
			stopContextMenu: true,
			fireMiddleClick: true,
			targetFindTolerance: 4,
			selectionColor: 'rgba(108,75,224,0.08)',
			selectionBorderColor: opts.accent,
		});
		this.viewport = new Viewport(side.layout.stage, { w: element.clientWidth || 800, h: element.clientHeight || 600 });
		this.#bindCanvas();
		this.#bindSession();
	}

	/** Load the active side and draw the document. */
	async ready(): Promise<void> {
		await this.#loadSide();
	}

	get canvas(): Canvas {
		return this.#canvas;
	}

	/** Whether text is being typed inline on the canvas. */
	get editingText(): boolean {
		return this.#editing !== null;
	}

	/** The active print area in stage millimetres. */
	get area(): AreaLayout {
		const area = this.#side.layout.areas.find((a) => a.id === this.#opts.session.active.area) ?? this.#side.layout.areas[0];
		if (!area) {
			throw new Error('The side has no print area.');
		}
		return area;
	}

	/** Measures text exactly as it will be drawn; pass to text commands. */
	readonly measure: TextMeasurer = (text) => {
		const obj = textObject(text as TextElement, this.#opts.fonts);
		return { w: obj.width, h: obj.height };
	};

	resize(width: number, height: number): void {
		this.#canvas.setDimensions({ width, height });
		this.viewport.resize({ w: width, h: height });
		this.#applyViewport();
	}

	zoomTo(zoom: number, anchor?: { x: number; y: number }): void {
		this.viewport.zoomTo(zoom, anchor);
		this.#applyViewport();
	}

	zoomBy(factor: number, anchor?: { x: number; y: number }): void {
		this.zoomTo(this.viewport.zoom * factor, anchor);
	}

	fit(): void {
		this.viewport.fit();
		this.#applyViewport();
	}

	zoomToSelection(): void {
		const active = this.#canvas.getActiveObject();
		if (!active) {
			return;
		}
		const b = active.getBoundingRect();
		this.viewport.zoomToBox({ x: b.left, y: b.top, w: b.width, h: b.height });
		this.#applyViewport();
	}

	/** CSS pixel position (relative to the canvas) → print-area mm. */
	toArea(point: { x: number; y: number }): { x: number; y: number } {
		const scene = this.viewport.toScene(point);
		return { x: scene.x - this.area.x, y: scene.y - this.area.y };
	}

	setProductColor(color: string | null): void {
		if (color !== this.#productColor) {
			this.#productColor = color;
			void this.#loadBase();
		}
	}

	setDrawing(options: DrawingOptions): void {
		this.#drawing = options;
		this.#canvas.isDrawingMode = options.enabled;
		if (options.enabled) {
			this.#canvas.discardActiveObject();
			const brush = new PencilBrush(this.#canvas);
			brush.color = options.erase ? 'rgba(255,255,255,0.85)' : options.color;
			brush.width = options.widthMm;
			brush.decimate = 0.5 / this.viewport.scale;
			this.#canvas.freeDrawingBrush = brush;
		}
		this.#canvas.requestRenderAll();
	}

	/** Colours in a clipart SVG, for the recolour palette. */
	colorsOf(id: string): string[] {
		const obj = this.#objects.get(id);
		return obj ? svgColors(obj) : [];
	}

	/** A small PNG of one element for the layers panel. */
	thumbnail(id: string, sizePx = 40): string | null {
		const obj = this.#objects.get(id);
		if (!obj) {
			return null;
		}
		const b = obj.getBoundingRect();
		const multiplier = sizePx / Math.max(b.width, b.height, 1);
		const holder = clipHolder(obj);
		const clip = holder.clipPath;
		holder.clipPath = undefined;
		const url = obj.toDataURL({ multiplier, format: 'png' });
		holder.clipPath = clip;
		return url;
	}

	/* ------------------------------------------------------------ Crop */

	/** The image being cropped, if any. */
	get cropping(): string | null {
		return this.#crop?.id ?? null;
	}

	/**
	 * Crop an image in place: the crop box has 8 handles that resize from the
	 * opposite edge (Alt: from the centre) and stays inside the photo.
	 */
	async startCrop(id: string): Promise<boolean> {
		const el = this.#built.get(id);
		const obj = this.#objects.get(id);
		if (this.#crop || el?.type !== 'image' || !obj || !isMovable(el)) {
			return false;
		}
		const url = imageUrl(el, this.#opts.assets);
		const img = url ? await this.#opts.images.load(url).catch(() => null) : null;
		if (!img || this.#crop) {
			return false;
		}
		const area = this.area;
		const frame = imageFrame(el);
		const full = (opacity: number): FabricImage =>
			new FabricImage(img, {
				originX: 'center',
				originY: 'center',
				left: area.x + frame.cx,
				top: area.y + frame.cy,
				angle: frame.rotation,
				flipX: frame.flipX,
				flipY: frame.flipY,
				scaleX: frame.w / img.naturalWidth,
				scaleY: frame.h / img.naturalHeight,
				opacity,
				selectable: false,
				evented: false,
				objectCaching: false,
			});
		const boxProps = { originX: 'center' as const, originY: 'center' as const, angle: frame.rotation, strokeWidth: 0 };
		const clip = new Rect({ ...boxProps, absolutePositioned: true });
		const bright = full(el.opacity);
		bright.clipPath = clip;
		const box = new Rect({ ...boxProps, fill: 'rgba(0,0,0,0)', lockRotation: true, lockScalingFlip: true, hoverCursor: 'move' });
		this.#style(box, { ...area, clip: false });
		box.setControlsVisibility({ mtr: false });

		const evented = new Map<FabricObject, boolean>();
		for (const o of this.#objects.values()) {
			evented.set(o, o.evented);
			o.evented = false;
		}
		// Set first, so the canvas selection changes below don't reach the session.
		this.#crop = { id, frame, ratio: null, dim: full(0.35), bright, clip, box, evented };
		this.#canvas.discardActiveObject();
		obj.visible = false;
		this.#canvas.selection = false;
		this.#canvas.add(this.#crop.dim, bright, box);
		this.#setCropBox(el.crop);
		this.#setCropRatioControls();
		this.#canvas.setActiveObject(box);
		this.#canvas.requestRenderAll();
		this.#emitSelectionBox();
		this.events.emit('crop:changed', { id, ratio: null });
		return true;
	}

	/** Lock the crop to a width ÷ height ratio in mm (null: free). */
	setCropRatio(ratio: number | null): void {
		const crop = this.#crop;
		if (!crop) return;
		crop.ratio = ratio;
		if (ratio) {
			this.#setCropBox(fitCropToRatio(this.#cropOfBox(), crop.frame, ratio));
		}
		this.#setCropRatioControls();
		this.#canvas.requestRenderAll();
		this.events.emit('crop:changed', { id: crop.id, ratio });
	}

	/** Show the whole photo again (the ratio, if any, still applies). */
	resetCrop(): void {
		const crop = this.#crop;
		if (!crop) return;
		const all = { x: 0, y: 0, w: 1, h: 1 };
		this.#setCropBox(crop.ratio ? fitCropToRatio(all, crop.frame, crop.ratio) : all);
		this.#canvas.requestRenderAll();
	}

	applyCrop(): void {
		const crop = this.#crop;
		if (!crop) return;
		const next = clampCrop(this.#cropOfBox(), 'resize');
		this.#endCrop();
		this.#opts.session.dispatch(cropImage({ ...this.#opts.session.active, id: crop.id }, next));
	}

	cancelCrop(): void {
		this.#endCrop();
	}

	#cropOfBox(): NormCrop {
		const crop = this.#crop!;
		const area = this.area;
		const centre = crop.box.getCenterPoint();
		return cropOfBox(crop.frame, { cx: centre.x - area.x, cy: centre.y - area.y, w: crop.box.width * crop.box.scaleX, h: crop.box.height * crop.box.scaleY });
	}

	#setCropBox(next: NormCrop): void {
		const crop = this.#crop!;
		const area = this.area;
		const p = placeCrop(crop.frame, next);
		const props = { left: area.x + p.x + p.w / 2, top: area.y + p.y + p.h / 2, width: p.w, height: p.h, scaleX: 1, scaleY: 1 };
		crop.box.set(props);
		crop.box.setCoords();
		crop.clip.set(props);
		crop.bright.dirty = true;
	}

	/** Corner handles only (and proportional scaling) while a ratio is locked. */
	#setCropRatioControls(): void {
		const crop = this.#crop!;
		const free = crop.ratio === null;
		crop.box.setControlsVisibility({ ml: free, mr: free, mt: free, mb: free });
		this.#canvas.uniformScaling = !free;
	}

	#cropGesture(mode: 'move' | 'resize'): void {
		const crop = this.#crop!;
		this.#setCropBox(clampCrop(this.#cropOfBox(), mode, crop.frame, crop.ratio));
	}

	#endCrop(): void {
		const crop = this.#crop;
		if (!crop) return;
		this.#crop = null;
		this.#canvas.remove(crop.dim, crop.bright, crop.box);
		for (const [o, was] of crop.evented) {
			o.evented = was;
		}
		const obj = this.#objects.get(crop.id);
		const el = this.#built.get(crop.id);
		if (obj && el) {
			obj.visible = !el.hidden;
		}
		this.#canvas.selection = true;
		this.#updateScalingMode();
		this.#applySelection(this.#opts.session.selection);
		this.#emitSelectionBox();
		this.events.emit('crop:changed', { id: null, ratio: null });
	}

	destroy(): void {
		this.#unsubscribe.forEach((off) => {
			off();
		});
		void this.#canvas.dispose();
	}

	/* ------------------------------------------------------------ Side and sync */

	async #loadSide(): Promise<void> {
		const side = this.#opts.sides.find((s) => s.id === this.#opts.session.active.side);
		if (side) {
			this.#side = side;
		}
		this.viewport.setStage(this.#side.layout.stage);
		for (const obj of this.#objects.values()) {
			this.#canvas.remove(obj);
		}
		this.#objects.clear();
		this.#built.clear();
		await Promise.all([this.#loadBase(), this.#loadOverlay()]);
		this.#applyViewport();
		await this.#queueSync();
	}

	/** Base image, tinted with the product colour when one is chosen. */
	async #loadBase(): Promise<void> {
		const { images } = this.#opts;
		const base = await images.load(this.#side.base.url);
		let source: HTMLImageElement | HTMLCanvasElement = base;
		if (this.#productColor) {
			const mask = this.#side.mask ? await images.load(this.#side.mask.url) : base;
			source = tint(base, mask, this.#productColor);
		}
		const scale = this.#side.layout.stage.w / base.naturalWidth;
		this.#canvas.backgroundImage = new FabricImage(source, { left: 0, top: 0, originX: 'left', originY: 'top', scaleX: scale, scaleY: scale, selectable: false, evented: false });
		this.#canvas.requestRenderAll();
	}

	async #loadOverlay(): Promise<void> {
		const overlay = this.#side.overlay;
		if (!overlay) {
			this.#canvas.overlayImage = undefined;
			return;
		}
		const img = await this.#opts.images.load(overlay.url);
		const scale = this.#side.layout.stage.w / img.naturalWidth;
		this.#canvas.overlayImage = new FabricImage(img, {
			left: 0,
			top: 0,
			originX: 'left',
			originY: 'top',
			scaleX: scale,
			scaleY: scale,
			globalCompositeOperation: overlay.blend === 'normal' ? 'source-over' : overlay.blend,
		});
	}

	#queueSync(): Promise<void> {
		this.#syncing = this.#syncing.then(() => this.#sync()).catch((error: unknown) => {
			console.error('[bps] canvas sync failed', error);
		});
		return this.#syncing;
	}

	/** Make the canvas match the document: build, rebuild, remove and reorder objects. */
	async #sync(): Promise<void> {
		const area = this.area;
		const elements = areaElements(this.#opts.session.doc, this.#opts.session.active);
		// Undo, redo or a panel changed the image being cropped: crop from scratch.
		if (this.#crop && elements.find((el) => el.id === this.#crop?.id) !== this.#built.get(this.#crop.id)) {
			this.#endCrop();
		}
		const present = new Set(elements.map((el) => el.id));
		for (const [id, obj] of this.#objects) {
			if (!present.has(id)) {
				this.#canvas.remove(obj);
				this.#objects.delete(id);
				this.#built.delete(id);
			}
		}
		const ctx: ViewContext = { fonts: this.#opts.fonts, images: this.#opts.images, assets: this.#opts.assets, area };
		// Objects for selected elements may only exist now (just added, or rebuilt): select them.
		const wanted = new Set(this.#opts.session.selection);
		let reselect = false;
		for (const el of elements) {
			if (this.#built.get(el.id) === el) {
				continue;
			}
			// The object already shows this change (it is being dragged or typed into).
			if (this.#transforming.has(el.id) || this.#editing === el.id) {
				this.#built.set(el.id, el);
				continue;
			}
			const obj = await buildObject(el, ctx);
			this.#style(obj, area);
			const old = this.#objects.get(el.id);
			this.#rebuilding = true;
			if (old) {
				this.#canvas.remove(old);
			}
			this.#canvas.add(obj);
			this.#rebuilding = false;
			this.#objects.set(el.id, obj);
			this.#built.set(el.id, el);
			reselect ||= wanted.has(el.id);
		}
		elements.forEach((el, index) => {
			const obj = this.#objects.get(el.id);
			if (obj && this.#canvas.getObjects().indexOf(obj) !== index) {
				this.#canvas.moveObjectTo(obj, index);
			}
		});
		if (reselect) {
			this.#applySelection(this.#opts.session.selection);
		}
		this.#canvas.requestRenderAll();
		this.#emitSelectionBox();
	}

	/** Handles, clipping and cursor sizes in screen terms. */
	#style(obj: FabricObject, area: AreaLayout): void {
		obj.set({
			borderColor: this.#opts.accent,
			cornerColor: '#ffffff',
			cornerStrokeColor: this.#opts.accent,
			cornerStyle: 'circle',
			transparentCorners: false,
			cornerSize: 12,
			touchCornerSize: 44,
			borderScaleFactor: 1.5,
			padding: 0,
		});
		if (area.clip) {
			// A masked photo already has a clip path: the print area clips the mask.
			clipHolder(obj).clipPath = clipShape(area);
		}
		if (obj instanceof IText) {
			obj.set({ cursorWidth: 1.5 / this.viewport.scale, cursorColor: this.#opts.accent, editingBorderColor: this.#opts.accent });
		}
	}

	/* ------------------------------------------------------------ Session */

	#bindSession(): void {
		const { session } = this.#opts;
		this.#unsubscribe.push(
			session.events.on('design:changed', () => {
				void this.#queueSync();
			}),
			session.events.on('side:changed', () => {
				this.#endCrop();
				void this.#loadSide();
			}),
			session.events.on('selection:changed', ({ ids }) => {
				if (this.#crop && (ids.length !== 1 || ids[0] !== this.#crop.id)) {
					this.#endCrop();
				}
				if (!this.#selectingFromCanvas && !this.#crop) {
					this.#applySelection(ids);
				}
				this.#updateScalingMode();
				this.#emitSelectionBox();
			}),
		);
	}

	#applySelection(ids: readonly string[]): void {
		this.#selectingFromSession = true;
		const objs = ids.map((id) => this.#objects.get(id)).filter((o): o is FabricObject => o !== undefined && o.selectable);
		this.#canvas.discardActiveObject();
		if (objs.length === 1) {
			this.#canvas.setActiveObject(objs[0]!);
		} else if (objs.length > 1) {
			this.#canvas.setActiveObject(new ActiveSelection(objs, { canvas: this.#canvas }));
		}
		this.#selectingFromSession = false;
		this.#canvas.requestRenderAll();
	}

	/** Free aspect for images and shapes (owner's add-on); proportional for everything else. Shift flips it. */
	#updateScalingMode(): void {
		if (this.#crop) return;
		const objs = this.#canvas.getActiveObjects();
		const first = objs[0] ? this.#built.get(viewMeta(objs[0])?.id ?? '') : undefined;
		const free = objs.length === 1 && first !== undefined && (first.type === 'image' || first.type === 'shape') && !first.keepAspect;
		this.#canvas.uniformScaling = !free;
	}

	/* ------------------------------------------------------------ Canvas events */

	#bindCanvas(): void {
		const c = this.#canvas;
		const syncSelection = (): void => {
			if (this.#selectingFromSession || this.#rebuilding || this.#crop) {
				return;
			}
			this.#selectingFromCanvas = true;
			this.#opts.session.select(c.getActiveObjects().map((o) => viewMeta(o)?.id).filter((id): id is string => id !== undefined));
			this.#selectingFromCanvas = false;
		};
		c.on('selection:created', syncSelection);
		c.on('selection:updated', syncSelection);
		c.on('selection:cleared', syncSelection);

		c.on('object:moving', (e) => {
			if (this.#crop?.box === e.target) {
				this.#cropGesture('move');
				return;
			}
			this.#dragging = true;
			this.#snapMove(e.target);
			this.#live(e.target);
		});
		c.on('object:scaling', (e) => {
			if (this.#crop?.box === e.target) {
				this.#cropGesture('resize');
				return;
			}
			this.#live(e.target);
		});
		c.on('object:rotating', (e) => {
			if (e.e.shiftKey) {
				e.target.set('angle', Math.round(e.target.angle / 15) * 15);
			}
			this.#live(e.target);
		});
		c.on('object:modified', (e) => {
			if (this.#crop?.box === e.target) {
				return;
			}
			this.#commit(e.target);
		});

		c.on('text:editing:entered', (e) => {
			this.#editing = viewMeta(e.target)?.id ?? null;
		});
		c.on('text:changed', (e) => {
			const id = viewMeta(e.target)?.id;
			if (id && e.target instanceof IText) {
				this.#opts.session.dispatch(updateText({ ...this.#opts.session.active, id }, { text: e.target.text }, this.measure, 'Edit text', `edit-${id}`), 'live');
			}
		});
		c.on('text:editing:exited', (e) => {
			const id = viewMeta(e.target)?.id;
			this.#editing = null;
			if (id) {
				this.#opts.session.store.commit(`edit-${id}`);
				this.#built.delete(id);
				void this.#queueSync();
			}
		});
		c.on('mouse:dblclick', (e) => {
			const id = e.target ? viewMeta(e.target)?.id : undefined;
			const el = id ? this.#built.get(id) : undefined;
			if (id && el?.type === 'text' && !(e.target instanceof IText)) {
				this.events.emit('text:edit', { id });
			} else if (id && el?.type === 'image') {
				void this.startCrop(id);
			}
		});

		c.on('path:created', (e) => {
			c.remove(e.path);
			if (e.path instanceof Path) {
				this.#addStroke(e.path as Path);
			}
		});

		c.on('mouse:wheel', (e) => {
			this.#wheel(e);
		});
		c.on('mouse:down', (e) => {
			const native = e.e as MouseEvent;
			if (this.#spaceDown || native.button === 1) {
				this.#panFrom = { x: native.clientX, y: native.clientY };
				c.selection = false;
			}
		});
		c.on('mouse:move', (e) => {
			if (this.#panFrom) {
				const native = e.e as MouseEvent;
				this.viewport.panBy(native.clientX - this.#panFrom.x, native.clientY - this.#panFrom.y);
				this.#panFrom = { x: native.clientX, y: native.clientY };
				this.#applyViewport();
			}
		});
		c.on('mouse:up', () => {
			this.#panFrom = null;
			c.selection = true;
			this.#dragging = false;
			this.#guides = { x: [], y: [] };
		});

		c.on('after:render', ({ ctx }) => {
			this.#drawGhost(ctx);
			this.#drawGuides(ctx);
		});

		const onKey = (down: boolean) => (event: KeyboardEvent) => {
			if (event.code === 'Space' && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) && !this.#editing) {
				this.#spaceDown = down;
				c.defaultCursor = down ? 'grab' : 'default';
			}
		};
		const keydown = onKey(true);
		const keyup = onKey(false);
		window.addEventListener('keydown', keydown);
		window.addEventListener('keyup', keyup);
		this.#unsubscribe.push(() => {
			window.removeEventListener('keydown', keydown);
			window.removeEventListener('keyup', keyup);
		});
	}

	#wheel(e: TPointerEventInfo<WheelEvent>): void {
		const event = e.e;
		event.preventDefault();
		const rect = this.#canvas.getElement().getBoundingClientRect();
		const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
		if (event.ctrlKey || event.metaKey) {
			// Trackpad pinch arrives as ctrl+wheel with small deltas.
			this.zoomTo(this.viewport.zoom * Math.exp(-event.deltaY / 300), anchor);
		} else {
			this.viewport.panBy(-event.deltaX, -event.deltaY);
			this.#applyViewport();
		}
	}

	/* ------------------------------------------------------------ Gestures */

	#transformsOf(target: FabricObject): ElementTransform[] {
		const parent = target instanceof ActiveSelection ? target : null;
		const objs = parent ? parent.getObjects() : [target];
		const area = this.area;
		return objs.flatMap((obj) => {
			const meta = viewMeta(obj);
			const start = meta ? (this.#gestureStart.get(meta.id) ?? this.#built.get(meta.id)) : undefined;
			if (!meta || !start) {
				return [];
			}
			const angle = obj.angle + (parent?.angle ?? 0);
			const sx = obj.scaleX * (parent?.scaleX ?? 1);
			const sy = obj.scaleY * (parent?.scaleY ?? 1);
			const centre = obj.getCenterPoint();
			const rad = (angle * Math.PI) / 180;
			const ox = meta.offset.x * sx;
			const oy = meta.offset.y * sy;
			const fx = sx / meta.base.x;
			const fy = sy / meta.base.y;
			const t: ElementTransform = {
				id: meta.id,
				cx: centre.x + ox * Math.cos(rad) - oy * Math.sin(rad) - area.x,
				cy: centre.y + ox * Math.sin(rad) + oy * Math.cos(rad) - area.y,
				rotation: angle,
			};
			if (start.type === 'text') {
				t.sizePt = start.font.sizePt * fx;
			} else {
				t.w = start.w * fx;
				t.h = start.h * fy;
			}
			return [t];
		});
	}

	#live(target: FabricObject): void {
		if (!this.#gesture) {
			this.#gesture = newId('g');
			this.#gestureStart.clear();
			for (const obj of target instanceof ActiveSelection ? target.getObjects() : [target]) {
				const id = viewMeta(obj)?.id;
				const el = id ? this.#built.get(id) : undefined;
				if (id && el) this.#gestureStart.set(id, el);
			}
		}
		const transforms = this.#transformsOf(target);
		transforms.forEach((t) => this.#transforming.add(t.id));
		this.#opts.session.dispatch(transformElements(this.#opts.session.active, transforms, this.measure, 'Transform', this.#gesture), 'live');
		this.#emitSelectionBox();
	}

	#commit(target: FabricObject): void {
		const transforms = this.#transformsOf(target);
		const key = this.#gesture ?? newId('g');
		this.#gesture = null;
		this.#dragging = false;
		this.#guides = { x: [], y: [] };
		this.#opts.session.dispatch(transformElements(this.#opts.session.active, transforms, this.measure, labelFor(target), key), 'commit');
		this.#opts.session.store.commit(key);
		this.#transforming.clear();
		this.#gestureStart.clear();
		// Rebuild from the final document (text re-flows at its new size, shapes redraw at real size).
		transforms.forEach((t) => this.#built.delete(t.id));
		void this.#queueSync();
	}

	#snapMove(target: FabricObject): void {
		const area = this.area;
		const moving = target.getBoundingRect();
		const ids = new Set(this.#canvas.getActiveObjects().map((o) => viewMeta(o)?.id));
		const others: Bounds[] = [];
		for (const [id, obj] of this.#objects) {
			if (!ids.has(id) && obj.visible) {
				const b = obj.getBoundingRect();
				others.push({ x: b.left, y: b.top, w: b.width, h: b.height });
			}
		}
		const result = snap(
			{ x: moving.left, y: moving.top, w: moving.width, h: moving.height },
			snapTargets({ x: area.x, y: area.y, w: area.w, h: area.h }, area.safeMm, others),
			SNAP_PX / this.viewport.scale,
		);
		if (result.dx !== 0 || result.dy !== 0) {
			target.set({ left: target.left + result.dx, top: target.top + result.dy });
			target.setCoords();
		}
		const snapped = result.guides.x.length + result.guides.y.length > 0;
		const was = this.#guides.x.length + this.#guides.y.length > 0;
		this.#guides = result.guides;
		if (snapped && !was) {
			this.events.emit('snap', {});
		}
	}

	/* ------------------------------------------------------------ Drawing */

	#addStroke(path: Path): void {
		const { session } = this.#opts;
		const area = this.area;
		const elements = areaElements(session.doc, session.active);
		const existing = [...elements].reverse().find((el) => el.type === 'drawing');
		const drawing = existing ?? createDrawing({ w: area.w, h: area.h });
		const dx = area.x + drawing.x;
		const dy = area.y + drawing.y;
		const moved = path.path.map(([cmd, ...nums]) => [cmd, ...nums.map((v, i) => v - (i % 2 === 0 ? dx : dy))] as typeof path.path[number]);
		const stroke = {
			d: util.joinPath(moved, 3),
			color: this.#drawing.color,
			widthMm: this.#drawing.widthMm,
			mode: this.#drawing.erase ? ('erase' as const) : ('draw' as const),
		};
		const command: Command = existing
			? {
					label: this.#drawing.erase ? 'Erase' : 'Draw',
					recipe: (draft) => {
						const el = draft.sides[session.active.side]?.printAreas[session.active.area]?.elements.find((e) => e.id === existing.id);
						if (el?.type === 'drawing') {
							el.strokes.push(stroke);
						}
					},
				}
			: addElement(session.active, { ...drawing, strokes: [stroke] }, 'Draw');
		if (!existing && this.#drawing.erase) {
			// Nothing to erase yet.
			return;
		}
		session.dispatch(command);
	}

	/* ------------------------------------------------------------ Rendering */

	#applyViewport(): void {
		this.#canvas.setViewportTransform(this.viewport.transform);
		for (const obj of this.#objects.values()) {
			if (obj instanceof IText) {
				obj.set('cursorWidth', 1.5 / this.viewport.scale);
			}
			obj.setCoords();
		}
		if (this.#canvas.freeDrawingBrush) {
			this.#canvas.freeDrawingBrush.width = this.#drawing.widthMm;
		}
		this.#canvas.requestRenderAll();
		this.events.emit('viewport:changed', { zoom: this.viewport.zoom });
		this.#emitSelectionBox();
	}

	#emitSelectionBox(): void {
		const active = this.#canvas.getActiveObject();
		if (!active || this.#canvas.isDrawingMode || this.#crop) {
			this.events.emit('selection:box', { box: null });
			return;
		}
		const b = active.getBoundingRect();
		const tl = this.viewport.toScreen({ x: b.left, y: b.top });
		const br = this.viewport.toScreen({ x: b.left + b.width, y: b.top + b.height });
		this.events.emit('selection:box', { box: { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y } });
	}

	/** While dragging, show the part of the selection outside the print area faintly. */
	#drawGhost(ctx: CanvasRenderingContext2D): void {
		const area = this.area;
		const active = this.#canvas.getActiveObject();
		if (!this.#dragging || !active || !area.clip) {
			return;
		}
		const r = this.#canvas.getRetinaScaling();
		const [a, , , d, e, f] = this.viewport.transform;
		ctx.save();
		ctx.setTransform(a * r, 0, 0, d * r, e * r, f * r);
		const outside = new Path2D();
		outside.rect(-1e5, -1e5, 2e5, 2e5);
		outside.addPath(areaOutline(area));
		ctx.clip(outside, 'evenodd');
		const parent = active instanceof ActiveSelection ? active : null;
		if (parent) {
			ctx.transform(...parent.calcTransformMatrix());
		}
		for (const obj of parent ? parent.getObjects() : [active]) {
			const holder = clipHolder(obj);
			const clip = holder.clipPath;
			const opacity = obj.opacity;
			holder.clipPath = undefined;
			obj.opacity = opacity * 0.35;
			obj.dirty = true;
			obj.render(ctx);
			holder.clipPath = clip;
			obj.opacity = opacity;
			obj.dirty = true;
		}
		ctx.restore();
	}

	/** Print area, bleed and safe-zone outlines plus snap lines, in screen pixels. */
	#drawGuides(ctx: CanvasRenderingContext2D): void {
		if (!this.showGuides) {
			return;
		}
		const area = this.area;
		const r = this.#canvas.getRetinaScaling();
		const s = this.viewport.scale;
		const [, , , , e, f] = this.viewport.transform;
		ctx.save();
		ctx.setTransform(r, 0, 0, r, 0, 0);
		// Outlines are built in mm and mapped to screen pixels, so line widths stay 1.25 px at any zoom.
		const toScreen = new DOMMatrix([s, 0, 0, s, e, f]);
		const outline = (inset: number, color: string, dash: number[]): void => {
			const path = new Path2D();
			path.addPath(areaOutline({ ...area, x: area.x + inset, y: area.y + inset, w: area.w - 2 * inset, h: area.h - 2 * inset, cornerRadiusMm: Math.max(0, area.cornerRadiusMm - inset) }), toScreen);
			ctx.setLineDash(dash);
			ctx.strokeStyle = color;
			ctx.lineWidth = 1.25;
			ctx.stroke(path);
		};
		if (area.bleedMm > 0) outline(-area.bleedMm, 'rgba(196,49,43,0.55)', [2, 3]);
		outline(0, this.#opts.accent, [6, 4]);
		if (area.safeMm > 0) outline(area.safeMm, 'rgba(31,138,76,0.6)', [1, 3]);

		ctx.setLineDash([]);
		ctx.strokeStyle = '#e0418f';
		ctx.lineWidth = 1;
		for (const x of this.#guides.x) {
			const sx = Math.round(x * s + e) + 0.5;
			ctx.beginPath();
			ctx.moveTo(sx, area.y * s + f - 12);
			ctx.lineTo(sx, (area.y + area.h) * s + f + 12);
			ctx.stroke();
		}
		for (const y of this.#guides.y) {
			const sy = Math.round(y * s + f) + 0.5;
			ctx.beginPath();
			ctx.moveTo(area.x * s + e - 12, sy);
			ctx.lineTo((area.x + area.w) * s + e + 12, sy);
			ctx.stroke();
		}
		ctx.restore();
	}
}

/**
 * The object whose clip path is the print-area clip: the object itself, or
 * its mask when it has one (the mask is clipped by the print area).
 */
function clipHolder(obj: FabricObject): FabricObject {
	return obj.clipPath && !obj.clipPath.absolutePositioned ? obj.clipPath : obj;
}

/** History label for a finished gesture. */
function labelFor(target: FabricObject): string {
	const action = (target as FabricObject & { __corner?: string }).__corner;
	return action === 'mtr' ? 'Rotate' : action ? 'Resize' : 'Move';
}

/** An area's outline (rect, rounded rect, ellipse, or a custom 0–1 path) in stage mm. */
function areaOutline(area: Pick<AreaLayout, 'x' | 'y' | 'w' | 'h' | 'shape' | 'cornerRadiusMm' | 'pathD'>): Path2D {
	const path = new Path2D();
	if (area.shape === 'ellipse') {
		path.ellipse(area.x + area.w / 2, area.y + area.h / 2, area.w / 2, area.h / 2, 0, 0, Math.PI * 2);
	} else if (area.shape === 'path' && area.pathD) {
		path.addPath(new Path2D(area.pathD), new DOMMatrix([area.w, 0, 0, area.h, area.x, area.y]));
	} else if (area.shape === 'roundedRect' && area.cornerRadiusMm > 0) {
		path.roundRect(area.x, area.y, area.w, area.h, area.cornerRadiusMm);
	} else {
		path.rect(area.x, area.y, area.w, area.h);
	}
	return path;
}

/** Fabric clip object matching a print area. */
function clipShape(area: AreaLayout): FabricObject {
	const common = { absolutePositioned: true, originX: 'left' as const, originY: 'top' as const, left: area.x, top: area.y };
	if (area.shape === 'ellipse') {
		return new Ellipse({ ...common, rx: area.w / 2, ry: area.h / 2 });
	}
	if (area.shape === 'path' && area.pathD) {
		const path = new Path(area.pathD, { ...common });
		path.set({ scaleX: area.w / (path.width || 1), scaleY: area.h / (path.height || 1) });
		return path;
	}
	const radius = area.shape === 'roundedRect' ? area.cornerRadiusMm : 0;
	return new Rect({ ...common, width: area.w, height: area.h, rx: radius, ry: radius });
}

/** Multiply a colour into a blank product photo, keeping its shading and transparency. */
function tint(base: HTMLImageElement, mask: HTMLImageElement, color: string): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = base.naturalWidth;
	canvas.height = base.naturalHeight;
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		return canvas;
	}
	ctx.drawImage(base, 0, 0);
	ctx.globalCompositeOperation = 'multiply';
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	// Keep only the product's own pixels (or the silhouette mask's).
	ctx.globalCompositeOperation = 'destination-in';
	ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);
	return canvas;
}
