import { batch, signal } from '@preact/signals';
import { __, sprintf } from '@wordpress/i18n';
import {
	addElement,
	alignElements,
	areaElements,
	createClipart,
	createImage,
	createQr,
	createShape,
	createText,
	distributeElements,
	duplicateElements,
	effectiveDpi,
	EditorSession,
	elementLabel,
	isDeletable,
	isMovable,
	moveElements,
	newId,
	qualityFor,
	removeElements,
	reorderElement,
	rotatedBounds,
	setProductColor,
	updateElement,
	updateText,
	type AlignMode,
	type AreaLayout,
	type AreaRef,
	type DesignDocument,
	type Element,
	type ElementPatch,
	type ImageElement,
	type QrPayload,
	type Quality,
	type ReorderTarget,
	type ShapeElement,
	type TextElement,
	type TextPreset,
} from '@bps/editor-core';
import { FontRegistry, ImageCache, type AssetResolver, type DrawingOptions, type SideRuntime, type Stage } from '@bps/editor-canvas';
import { Api, ApiError, type Clipart, type Upload } from './api.ts';
import { Autosave, type Saved } from './autosave.ts';
import type { Bootstrap } from './bootstrap.ts';
import { BUNDLED_FONTS } from './fonts.ts';

export type PanelId = 'text' | 'uploads' | 'shapes' | 'qr' | 'draw' | 'layers';

export interface Toast {
	id: string;
	message: string;
	action?: { label: string; run: () => void };
	tone?: 'info' | 'error';
}

export interface UploadJob {
	id: string;
	name: string;
	progress: number;
	abort: AbortController;
}

/**
 * State and actions for one open editor. Components read signals and call
 * actions; every document change goes through a command on the session.
 */
export class EditorModel {
	readonly session: EditorSession;
	readonly fonts = new FontRegistry(BUNDLED_FONTS);
	readonly images = new ImageCache();
	readonly autosave: Autosave;
	stage: Stage | null = null;

	readonly version = signal(0);
	readonly selection = signal<readonly string[]>([]);
	readonly active = signal<AreaRef>({ side: '', area: '' });
	readonly canUndo = signal(false);
	readonly canRedo = signal(false);
	readonly zoom = signal(1);
	readonly panel = signal<PanelId | null>('text');
	readonly toolbarBox = signal<{ x: number; y: number; w: number; h: number } | null>(null);
	readonly toasts = signal<Toast[]>([]);
	readonly announcement = signal('');
	readonly uploads = signal<Upload[]>([]);
	readonly uploading = signal<UploadJob[]>([]);
	readonly clipart = signal<Clipart[]>([]);
	readonly drawing = signal<DrawingOptions>({ enabled: false, color: '#1a1a1a', widthMm: 1.5, erase: false });
	readonly restoreOffer = signal<Saved | null>(null);
	readonly textEditRequest = signal<string | null>(null);
	readonly shortcutsOpen = signal(false);
	/** The image being cropped and its locked ratio (width ÷ height in mm). */
	readonly cropping = signal<{ id: string; ratio: number | null } | null>(null);

	readonly #uploadUrls = new Map<string, string>();
	readonly #clipartById = new Map<number, Clipart>();
	#clipboard: Element[] = [];

	constructor(
		readonly bootstrap: Bootstrap,
		readonly sides: readonly SideRuntime[],
		readonly api: Api,
		doc: DesignDocument,
	) {
		const first = sides[0]!;
		this.session = new EditorSession(doc, { side: first.id, area: first.layout.areas[0]!.id });
		this.active.value = this.session.active;
		this.autosave = new Autosave(Autosave.key(bootstrap.product.id, bootstrap.mode));

		const { events } = this.session;
		events.on('design:changed', (change) => {
			this.version.value++;
			if (change.phase === 'commit' && this.bootstrap.settings.autosave) {
				this.autosave.schedule(this.session.doc);
			}
			if (change.phase === 'commit' && change.source !== 'load' && change.label) {
				this.announce(change.source === 'undo' ? sprintf(__('Undid %s', 'blumoon-product-studio'), change.label) : change.source === 'redo' ? sprintf(__('Redid %s', 'blumoon-product-studio'), change.label) : change.label);
			}
		});
		events.on('selection:changed', ({ ids }) => {
			this.selection.value = ids;
		});
		events.on('side:changed', ({ side, area }) => {
			this.active.value = { side, area };
		});
		events.on('history:changed', ({ canUndo, canRedo }) => {
			this.canUndo.value = canUndo;
			this.canRedo.value = canRedo;
		});
	}

	/** Resolves upload and library images for the canvas. */
	readonly assets: AssetResolver = {
		uploadUrl: (id) => this.#uploadUrls.get(id),
		clipart: (id) => {
			const c = this.#clipartById.get(id);
			return c ? { url: c.url, mime: c.mime } : undefined;
		},
	};

	attachStage(stage: Stage): void {
		this.stage = stage;
		stage.events.on('viewport:changed', ({ zoom }) => {
			this.zoom.value = zoom;
		});
		stage.events.on('selection:box', ({ box }) => {
			this.toolbarBox.value = box;
		});
		stage.events.on('text:edit', ({ id }) => {
			this.textEditRequest.value = id;
		});
		stage.events.on('crop:changed', ({ id, ratio }) => {
			this.cropping.value = id ? { id, ratio } : null;
			if (id) this.announce(__('Cropping. Drag the handles, then press Enter to apply or Esc to cancel.', 'blumoon-product-studio'));
		});
		stage.events.on('snap', () => {
			// Not in Safari, whatever the DOM types say.
			if ('vibrate' in navigator) navigator.vibrate(8);
		});
		stage.setProductColor(this.session.doc.options.productColor);
	}

	/* ------------------------------------------------------------ Reads */

	get area(): AreaLayout {
		const side = this.sides.find((s) => s.id === this.active.value.side) ?? this.sides[0]!;
		return side.layout.areas.find((a) => a.id === this.active.value.area) ?? side.layout.areas[0]!;
	}

	/** Read the document version so the calling component or computed re-runs on edits. */
	track(): number {
		return this.version.value;
	}

	elements(): readonly Element[] {
		this.track();
		return areaElements(this.session.doc, this.active.value);
	}

	selected(): Element[] {
		const ids = new Set(this.selection.value);
		return this.elements().filter((el) => ids.has(el.id));
	}

	quality(el: ImageElement): { dpi: number; band: Quality } {
		const dpi = effectiveDpi(el.naturalPx, { w: el.w, h: el.h }, el.crop);
		return { dpi: Math.round(dpi), band: qualityFor(dpi, this.area.dpi, this.bootstrap.settings.warnDpi) };
	}

	/** Worst image quality on every side (for the status bar). */
	worstQuality(): Quality | null {
		this.track();
		let worst: Quality | null = null;
		const rank: Record<Quality, number> = { good: 0, fair: 1, poor: 2 };
		for (const side of this.sides) {
			for (const area of side.layout.areas) {
				for (const el of areaElements(this.session.doc, { side: side.id, area: area.id })) {
					if (el.type === 'image' && !el.hidden) {
						const band = qualityFor(effectiveDpi(el.naturalPx, el, el.crop), area.dpi, this.bootstrap.settings.warnDpi);
						if (worst === null || rank[band] > rank[worst]) worst = band;
					}
				}
			}
		}
		return worst;
	}

	/** Visible elements that cross the safe-zone line on the active side. */
	outsideSafeZone(): Element[] {
		const area = this.area;
		const m = area.safeMm;
		return this.elements().filter((el) => {
			if (el.hidden || el.type === 'drawing') return false;
			const b = rotatedBounds(el);
			return b.x < m - 0.01 || b.y < m - 0.01 || b.x + b.w > area.w - m + 0.01 || b.y + b.h > area.h - m + 0.01;
		});
	}

	sideHasDesign(sideId: string): boolean {
		this.track();
		const side = this.session.doc.sides[sideId];
		return side ? Object.values(side.printAreas).some((a) => a.elements.length > 0) : false;
	}

	/* ------------------------------------------------------------ Feedback */

	announce(message: string): void {
		// Re-setting the same text must still be read out.
		this.announcement.value = '';
		queueMicrotask(() => {
			this.announcement.value = message;
		});
	}

	toast(toast: Omit<Toast, 'id'>, ms = 5000): void {
		const id = newId('t');
		this.toasts.value = [...this.toasts.value, { ...toast, id }];
		setTimeout(() => {
			this.dismissToast(id);
		}, ms);
	}

	dismissToast(id: string): void {
		this.toasts.value = this.toasts.value.filter((t) => t.id !== id);
	}

	/* ------------------------------------------------------------ Adding */

	#add(el: Element, label: string): void {
		this.session.dispatch(addElement(this.session.active, el, label));
		this.session.select([el.id]);
	}

	readonly measure = (text: Parameters<NonNullable<Stage['measure']>>[0]): { w: number; h: number } =>
		this.stage ? this.stage.measure(text) : { w: text.text.length * text.font.sizePt * 0.2, h: text.font.sizePt * 0.42 };

	async addText(preset: TextPreset): Promise<void> {
		await this.fonts.load(preset.family, preset.weight);
		this.#add(createText(this.area, this.measure, preset), __('Text added', 'blumoon-product-studio'));
	}

	addShape(shape: ShapeElement['shape']): void {
		this.#add(createShape(this.area, shape), __('Shape added', 'blumoon-product-studio'));
	}

	addClipart(item: Clipart): void {
		this.#clipartById.set(item.id, item);
		this.#add(createClipart(this.area, item.id, item.width / item.height), __('Clipart added', 'blumoon-product-studio'));
	}

	addQr(payload: QrPayload, fg: string, bg: string | null): void {
		this.#add(createQr(this.area, payload, fg, bg), __('QR code added', 'blumoon-product-studio'));
	}

	addUpload(upload: Upload): void {
		this.#uploadUrls.set(upload.id, upload.previewUrl);
		const el = createImage(this.area, { kind: 'upload', uploadId: upload.id }, { w: upload.width, h: upload.height });
		this.#add(el, __('Photo added', 'blumoon-product-studio'));
		const { band, dpi } = this.quality(el);
		if (band === 'poor') {
			this.toast({ message: sprintf(__('This photo is only %d dpi at this size and may print blurry. Make it smaller or use a larger photo.', 'blumoon-product-studio'), dpi), tone: 'error' }, 8000);
		}
	}

	/** Upload files (picker, drop or paste), then add each to the design. */
	async uploadFiles(files: readonly File[]): Promise<void> {
		const maxBytes = this.bootstrap.settings.uploads.maxMb * 1048576;
		for (const file of files) {
			if (file.size > maxBytes) {
				this.toast({ message: sprintf(__('%1$s is too large. The limit is %2$d MB.', 'blumoon-product-studio'), file.name, this.bootstrap.settings.uploads.maxMb), tone: 'error' });
				continue;
			}
			const job: UploadJob = { id: newId('j'), name: file.name, progress: 0, abort: new AbortController() };
			this.uploading.value = [...this.uploading.value, job];
			try {
				const upload = await this.api.upload(
					file,
					(progress) => {
						this.uploading.value = this.uploading.value.map((j) => (j.id === job.id ? { ...j, progress } : j));
					},
					job.abort.signal,
				);
				this.uploads.value = [upload, ...this.uploads.value];
				this.addUpload(upload);
			} catch (error) {
				if (!(error instanceof ApiError && error.code === 'aborted')) {
					this.toast({ message: error instanceof Error ? error.message : String(error), tone: 'error' }, 8000);
				}
			} finally {
				this.uploading.value = this.uploading.value.filter((j) => j.id !== job.id);
			}
		}
	}

	/** Shopper's earlier uploads, and signed URLs for any the design uses. */
	async loadUploads(): Promise<void> {
		try {
			const { data } = await this.api.get<Upload[]>('uploads');
			for (const upload of data) {
				this.#uploadUrls.set(upload.id, upload.previewUrl);
			}
			this.uploads.value = data;
		} catch {
			// The panel shows the empty state.
		}
	}

	/** Library items referenced by the design (needed before the canvas draws them). */
	async loadClipart(ids: readonly number[]): Promise<void> {
		const missing = ids.filter((id) => !this.#clipartById.has(id));
		if (missing.length === 0) return;
		try {
			const { data } = await this.api.get<Clipart[]>('assets/clipart', { include: missing.join(','), per_page: 60 });
			data.forEach((c) => this.#clipartById.set(c.id, c));
		} catch {
			// Missing clipart shows as a placeholder.
		}
	}

	rememberClipart(items: readonly Clipart[]): void {
		items.forEach((c) => this.#clipartById.set(c.id, c));
	}

	/* ------------------------------------------------------------ Editing */

	update<T extends Element>(id: string, patch: ElementPatch<T>, label: string, coalesceKey?: string): void {
		this.session.dispatch(updateElement<T>({ ...this.session.active, id }, patch, label, coalesceKey), coalesceKey ? 'live' : 'commit');
	}

	/** Text changes that affect its size (content, font, effect) re-measure the box. */
	async updateText(id: string, patch: ElementPatch<TextElement>, label: string, coalesceKey?: string): Promise<void> {
		const current = this.selected().find((el) => el.id === id) ?? this.elements().find((el) => el.id === id);
		if (current?.type !== 'text') return;
		const next = { ...current, ...patch, font: { ...current.font, ...patch.font } };
		try {
			await this.fonts.load(next.font.family, next.font.weight, next.font.style);
			if (next.effect.kind !== 'none') {
				await this.fonts.outlines(next.font.family, next.font.weight, next.font.style);
			}
			this.session.dispatch(updateText({ ...this.session.active, id }, patch, this.measure, label, coalesceKey), coalesceKey ? 'live' : 'commit');
		} catch (error) {
			console.error('[bps] text update failed', error);
			this.toast({ message: __('That change could not be applied. Please try again.', 'blumoon-product-studio'), tone: 'error' });
		}
	}

	/** Close a coalesced edit (slider released, field blurred). */
	commit(coalesceKey: string): void {
		this.session.store.commit(coalesceKey);
	}

	remove(ids: readonly string[] = this.selection.value): void {
		const removable = this.elements().filter((el) => ids.includes(el.id) && isDeletable(el));
		if (removable.length === 0) return;
		this.session.dispatch(removeElements(this.session.active, removable.map((el) => el.id), removable.length === 1 ? sprintf(__('Delete %s', 'blumoon-product-studio'), elementLabel(removable[0]!)) : __('Delete', 'blumoon-product-studio')));
		this.toast({
			message: removable.length === 1 ? __('Deleted.', 'blumoon-product-studio') : sprintf(__('%d items deleted.', 'blumoon-product-studio'), removable.length),
			action: { label: __('Undo', 'blumoon-product-studio'), run: () => this.undo() },
		});
	}

	duplicate(ids: readonly string[] = this.selection.value): void {
		if (ids.length === 0) return;
		const { command, ids: copies } = duplicateElements(this.session.active, ids);
		this.session.dispatch(command);
		this.session.select(copies);
	}

	reorder(id: string, to: ReorderTarget): void {
		this.session.dispatch(reorderElement({ ...this.session.active, id }, to, __('Arrange', 'blumoon-product-studio')));
	}

	align(mode: AlignMode): void {
		const ids = this.selection.value;
		if (ids.length === 0) return;
		this.session.dispatch(alignElements(this.session.active, ids, mode, ids.length > 1 ? 'selection' : 'area', this.area));
	}

	distribute(axis: 'x' | 'y'): void {
		this.session.dispatch(distributeElements(this.session.active, this.selection.value, axis));
	}

	nudge(dx: number, dy: number): void {
		const ids = this.selected().filter(isMovable).map((el) => el.id);
		if (ids.length > 0) {
			// Consecutive arrow presses become one history step.
			this.session.dispatch(moveElements(this.session.active, ids, dx, dy, __('Move', 'blumoon-product-studio'), `nudge-${ids.join()}`), 'live');
		}
	}

	endNudge(): void {
		this.session.store.commit(`nudge-${this.selection.value.join()}`);
	}

	selectAll(): void {
		this.session.select(this.elements().filter((el) => !el.hidden && !el.locks.all).map((el) => el.id));
	}

	copy(): void {
		this.#clipboard = this.selected().map((el) => structuredClone(el));
	}

	paste(): void {
		if (this.#clipboard.length === 0) return;
		// Template permissions don't travel with a copy.
		const pasted = this.#clipboard.map((el): Element => {
			const { permissions: _p, ...rest } = structuredClone(el);
			return { ...rest, id: newId(), x: el.x + 5, y: el.y + 5 };
		});
		batch(() => {
			for (const el of pasted) {
				this.session.dispatch(addElement(this.session.active, el, __('Paste', 'blumoon-product-studio')));
			}
			this.session.select(pasted.map((el) => el.id));
		});
		this.#clipboard = pasted;
	}

	/* ------------------------------------------------------------ Crop */

	async startCrop(id: string = this.selection.value[0] ?? ''): Promise<void> {
		if (this.drawing.value.enabled) this.setDrawing({ enabled: false });
		if (!(await this.stage?.startCrop(id))) {
			this.toast({ message: __('This photo can’t be cropped.', 'blumoon-product-studio'), tone: 'error' });
		}
	}

	applyCrop(): void {
		this.stage?.applyCrop();
	}

	cancelCrop(): void {
		this.stage?.cancelCrop();
	}

	undo(): void {
		this.session.store.undo();
	}

	redo(): void {
		this.session.store.redo();
	}

	setSide(side: string): void {
		const runtime = this.sides.find((s) => s.id === side);
		if (runtime) {
			this.session.setActive({ side, area: runtime.layout.areas[0]!.id });
		}
	}

	setProductColor(hex: string | null): void {
		this.session.dispatch(setProductColor(hex));
		this.stage?.setProductColor(hex);
	}

	setDrawing(options: Partial<DrawingOptions>): void {
		this.drawing.value = { ...this.drawing.value, ...options };
		this.stage?.setDrawing(this.drawing.value);
	}

	/** Restore the autosaved design offered at startup. */
	async restore(saved: Saved): Promise<void> {
		await this.loadClipart(clipartIds(saved.doc));
		this.session.store.load(saved.doc, __('Restore design', 'blumoon-product-studio'));
		this.stage?.setProductColor(saved.doc.options.productColor);
		this.restoreOffer.value = null;
		this.announce(__('Your design was restored.', 'blumoon-product-studio'));
	}

	async discardRestore(): Promise<void> {
		this.restoreOffer.value = null;
		await this.autosave.clear();
	}

	startOver(): void {
		const empty = structuredClone(this.session.doc);
		for (const side of Object.values(empty.sides)) {
			for (const area of Object.values(side.printAreas)) {
				area.elements = [];
			}
		}
		this.session.store.load(empty, __('Start over', 'blumoon-product-studio'), true);
		this.toast({ message: __('Design cleared.', 'blumoon-product-studio') });
	}
}

/** Clipart attachment ids used anywhere in a document. */
export function clipartIds(doc: DesignDocument): number[] {
	const ids = new Set<number>();
	for (const side of Object.values(doc.sides)) {
		for (const area of Object.values(side.printAreas)) {
			for (const el of area.elements) {
				if (el.type === 'clipart') ids.add(el.attachmentId);
				if (el.type === 'image' && el.source.kind === 'asset') ids.add(el.source.attachmentId);
			}
		}
	}
	return [...ids];
}
