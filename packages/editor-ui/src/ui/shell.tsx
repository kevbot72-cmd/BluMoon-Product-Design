/** @jsxImportSource preact */
import { useEffect, useRef } from 'preact/hooks';
import { __, sprintf } from '@wordpress/i18n';
import { ArrowDown, ArrowUp, Check, CircleHelp, Copy, Crop, Layers, Maximize, Minus, Pencil, Plus, QrCode, Redo2, RotateCcw, Shapes, ShieldCheck, Trash2, Type, Undo2, Upload, X, TriangleAlert } from 'lucide';
import { Stage } from '@bps/editor-canvas';
import { formatPrice } from '../bootstrap.ts';
import type { EditorModel, PanelId } from '../model.ts';
import { Icon, IconButton } from './controls.tsx';
import { Inspector } from './inspector.tsx';
import { DrawPanel, LayersPanel, QrPanel, ShapesPanel, TextPanel, UploadsPanel } from './panels.tsx';

const PANELS: { id: PanelId; label: string; icon: typeof Type }[] = [
	{ id: 'text', label: __('Text', 'blumoon-product-studio'), icon: Type },
	{ id: 'uploads', label: __('Uploads', 'blumoon-product-studio'), icon: Upload },
	{ id: 'shapes', label: __('Shapes', 'blumoon-product-studio'), icon: Shapes },
	{ id: 'qr', label: __('QR code', 'blumoon-product-studio'), icon: QrCode },
	{ id: 'draw', label: __('Draw', 'blumoon-product-studio'), icon: Pencil },
	{ id: 'layers', label: __('Layers', 'blumoon-product-studio'), icon: Layers },
];

export function EditorShell({ model, onClose }: { model: EditorModel; onClose: () => void }) {
	const panel = model.panel.value;
	return (
		<div class="bps-editor__frame">
			<Header model={model} onClose={onClose} />
			<div class="bps-editor__body" data-panel={panel ? 'open' : 'closed'}>
				<nav class="bps-rail" aria-label={__('Tools', 'blumoon-product-studio')}>
					<div role="tablist" aria-orientation="vertical" class="bps-rail__list">
						{PANELS.map((p) => (
							<button
								type="button"
								role="tab"
								key={p.id}
								id={`bps-tab-${p.id}`}
								aria-selected={panel === p.id}
								aria-controls="bps-panel"
								class="bps-rail__item"
								onClick={() => {
									model.panel.value = panel === p.id ? null : p.id;
									if (p.id !== 'draw' && model.drawing.value.enabled) model.setDrawing({ enabled: false });
								}}
							>
								<Icon icon={p.icon} />
								<span>{p.label}</span>
							</button>
						))}
					</div>
				</nav>
				{panel && (
					<section class="bps-panel" id="bps-panel" role="tabpanel" aria-labelledby={`bps-tab-${panel}`}>
						<div class="bps-panel__head">
							<h2>{PANELS.find((p) => p.id === panel)?.label}</h2>
							<IconButton icon={X} label={__('Close panel', 'blumoon-product-studio')} onClick={() => (model.panel.value = null)} />
						</div>
						{panel === 'text' && <TextPanel model={model} />}
						{panel === 'uploads' && <UploadsPanel model={model} />}
						{panel === 'shapes' && <ShapesPanel model={model} />}
						{panel === 'qr' && <QrPanel model={model} />}
						{panel === 'draw' && <DrawPanel model={model} />}
						{panel === 'layers' && <LayersPanel model={model} />}
					</section>
				)}
				<StageArea model={model} />
				<aside class="bps-side" aria-label={__('Properties', 'blumoon-product-studio')}>
					<Inspector model={model} />
				</aside>
			</div>
			<BottomBar model={model} />
			<Toasts model={model} />
			{model.shortcutsOpen.value && <Shortcuts model={model} />}
			<div class="bps-sr" role="status" aria-live="polite">
				{model.announcement.value}
			</div>
		</div>
	);
}

function Header({ model, onClose }: { model: EditorModel; onClose: () => void }) {
	const { product, currency } = model.bootstrap;
	return (
		<header class="bps-header">
			<IconButton id="bps-close" icon={X} label={__('Close the designer', 'blumoon-product-studio')} onClick={onClose} />
			<div class="bps-header__title">
				<strong>{product.name}</strong>
				<span class="bps-muted">{__('Changes are saved on this device as you go', 'blumoon-product-studio')}</span>
			</div>
			<div class="bps-spacer" />
			<IconButton icon={Undo2} label={__('Undo (Ctrl+Z)', 'blumoon-product-studio')} disabled={!model.canUndo.value} onClick={() => model.undo()} />
			<IconButton icon={Redo2} label={__('Redo (Ctrl+Shift+Z)', 'blumoon-product-studio')} disabled={!model.canRedo.value} onClick={() => model.redo()} />
			<span class="bps-sep" />
			<div class="bps-zoom" role="group" aria-label={__('Zoom', 'blumoon-product-studio')}>
				<IconButton icon={Minus} label={__('Zoom out', 'blumoon-product-studio')} onClick={() => model.stage?.zoomBy(1 / 1.25)} />
				<button type="button" class="bps-zoom__value" title={__('Fit to screen (0)', 'blumoon-product-studio')} onClick={() => model.stage?.fit()}>
					{Math.round(model.zoom.value * 100)}%
				</button>
				<IconButton icon={Plus} label={__('Zoom in', 'blumoon-product-studio')} onClick={() => model.stage?.zoomBy(1.25)} />
				<IconButton icon={Maximize} label={__('Zoom to selection', 'blumoon-product-studio')} disabled={model.selection.value.length === 0} onClick={() => model.stage?.zoomToSelection()} />
			</div>
			<span class="bps-sep" />
			<span class="bps-price" aria-label={__('Price', 'blumoon-product-studio')}>
				{formatPrice(product.price, currency)}
			</span>
			<button type="button" class="bps-btn" onClick={() => model.startOver()} disabled={!model.canUndo.value && !model.elements().length}>
				{__('Start over', 'blumoon-product-studio')}
			</button>
		</header>
	);
}

function StageArea({ model }: { model: EditorModel }) {
	const host = useRef<HTMLDivElement>(null);
	// Fabric wraps its canvas in its own elements, so it gets a node Preact never re-renders.
	const canvasHost = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!host.current || !canvasHost.current) return;
		const canvas = document.createElement('canvas');
		canvasHost.current.appendChild(canvas);
		const stage = new Stage(canvas, { session: model.session, sides: model.sides, fonts: model.fonts, images: model.images, assets: model.assets, accent: getComputedStyle(host.current).getPropertyValue('--bps-accent').trim() || '#6c4be0' });
		model.attachStage(stage);
		const resize = new ResizeObserver(([entry]) => {
			if (entry) stage.resize(Math.round(entry.contentRect.width), Math.round(entry.contentRect.height));
		});
		resize.observe(host.current);
		stage.resize(host.current.clientWidth, host.current.clientHeight);
		void stage.ready();
		return () => {
			resize.disconnect();
			stage.destroy();
			model.stage = null;
		};
	}, [model]);

	const box = model.toolbarBox.value;
	const empty = model.elements().length === 0;
	const restore = model.restoreOffer.value;

	return (
		<main
			class="bps-stage"
			ref={host}
			aria-label={sprintf(__('Design canvas, %s', 'blumoon-product-studio'), model.sides.find((s) => s.id === model.active.value.side)?.label ?? '')}
			onDragOver={(e) => e.preventDefault()}
			onDrop={(e) => {
				const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/') || /\.(heic|svg)$/i.test(f.name));
				if (files.length > 0) {
					e.preventDefault();
					void model.uploadFiles(files);
				}
			}}
		>
			<div class="bps-stage__canvas" ref={canvasHost} />
			{restore && (
				<div class="bps-banner" role="region" aria-label={__('Saved design', 'blumoon-product-studio')}>
					<span>{sprintf(__('Continue where you left off? Saved %s.', 'blumoon-product-studio'), relativeTime(restore.savedAt))}</span>
					<button type="button" class="bps-btn bps-btn--primary" onClick={() => void model.restore(restore)}>
						{__('Continue', 'blumoon-product-studio')}
					</button>
					<button type="button" class="bps-btn" onClick={() => void model.discardRestore()}>
						{__('Start fresh', 'blumoon-product-studio')}
					</button>
				</div>
			)}
			{empty && !restore && (
				<p class="bps-hint" aria-hidden="true">
					{__('Add text, a photo or a shape from the left — or drop a photo here.', 'blumoon-product-studio')}
				</p>
			)}
			{box && <ContextToolbar model={model} box={box} />}
			{model.cropping.value && <CropBar model={model} />}
		</main>
	);
}

function ContextToolbar({ model, box }: { model: EditorModel; box: { x: number; y: number; w: number; h: number } }) {
	const selected = model.selected();
	const first = selected[0];
	if (!first) return null;
	const top = Math.max(8, box.y - 56);
	const left = Math.max(8, box.x + box.w / 2);
	return (
		<div class="bps-ctx" role="toolbar" aria-label={__('Selection tools', 'blumoon-product-studio')} style={{ top: `${top}px`, left: `${left}px` }}>
			{selected.length === 1 && first.type === 'text' && (
				<button
					type="button"
					class="bps-ctx__btn"
					onClick={() => {
						model.textEditRequest.value = first.id;
					}}
				>
					<Icon icon={Type} size={18} /> {__('Edit text', 'blumoon-product-studio')}
				</button>
			)}
			{selected.length === 1 && first.type === 'image' && (
				<>
					<button type="button" class="bps-ctx__btn" onClick={() => void model.startCrop(first.id)}>
						<Icon icon={Crop} size={18} /> {__('Crop', 'blumoon-product-studio')}
					</button>
					<QualityChip model={model} />
				</>
			)}
			<IconButton icon={ArrowUp} label={__('Bring forward', 'blumoon-product-studio')} onClick={() => model.reorder(first.id, 'forward')} />
			<IconButton icon={ArrowDown} label={__('Send backward', 'blumoon-product-studio')} onClick={() => model.reorder(first.id, 'backward')} />
			<IconButton icon={Copy} label={__('Duplicate (Ctrl+D)', 'blumoon-product-studio')} onClick={() => model.duplicate()} />
			<IconButton icon={Trash2} label={__('Delete', 'blumoon-product-studio')} onClick={() => model.remove()} />
		</div>
	);
}

/** Crop mode replaces the selection toolbar: ratio presets, Reset, Cancel and Apply. */
function CropBar({ model }: { model: EditorModel }) {
	const crop = model.cropping.value;
	if (!crop) return null;
	const area = model.area;
	const ratios: { label: string; value: number | null }[] = [
		{ label: __('Free', 'blumoon-product-studio'), value: null },
		{ label: '1:1', value: 1 },
		{ label: '4:3', value: 4 / 3 },
		{ label: '16:9', value: 16 / 9 },
		{ label: __('Print area', 'blumoon-product-studio'), value: area.w / area.h },
	];
	return (
		<div class="bps-ctx bps-cropbar" role="toolbar" aria-label={__('Crop', 'blumoon-product-studio')}>
			<div class="bps-chips" role="group" aria-label={__('Aspect ratio', 'blumoon-product-studio')}>
				{ratios.map((r) => (
					<button type="button" key={r.label} class="bps-chip" aria-pressed={r.value === null ? crop.ratio === null : crop.ratio !== null && Math.abs(crop.ratio - r.value) < 1e-6} onClick={() => model.stage?.setCropRatio(r.value)}>
						{r.label}
					</button>
				))}
			</div>
			<span class="bps-sep" />
			<IconButton icon={RotateCcw} label={__('Reset crop', 'blumoon-product-studio')} onClick={() => model.stage?.resetCrop()} />
			<button type="button" class="bps-btn" onClick={() => model.cancelCrop()}>
				{__('Cancel', 'blumoon-product-studio')}
			</button>
			<button type="button" class="bps-btn bps-btn--primary" onClick={() => model.applyCrop()}>
				<Icon icon={Check} size={18} /> {__('Apply', 'blumoon-product-studio')}
			</button>
		</div>
	);
}

function QualityChip({ model }: { model: EditorModel }) {
	const el = model.selected()[0];
	if (el?.type !== 'image') return null;
	const { dpi, band } = model.quality(el);
	return (
		<span class={`bps-chip bps-chip--${band}`} title={__('Print quality at this size', 'blumoon-product-studio')}>
			<span class="bps-quality__dot" aria-hidden="true" /> {dpi} dpi
		</span>
	);
}

function BottomBar({ model }: { model: EditorModel }) {
	const worst = model.worstQuality();
	const outside = model.outsideSafeZone();
	return (
		<footer class="bps-bar">
			<div class="bps-sides" role="group" aria-label={__('Sides', 'blumoon-product-studio')}>
				{model.sides.map((side) => (
					<button type="button" key={side.id} class="bps-side-btn" aria-pressed={model.active.value.side === side.id} onClick={() => model.setSide(side.id)}>
						{side.label}
						{model.sideHasDesign(side.id) && <span class="bps-side-btn__dot" aria-label={__('has a design', 'blumoon-product-studio')} />}
					</button>
				))}
			</div>
			<div class="bps-spacer" />
			{worst && (
				<span class={`bps-status bps-status--${worst}`}>
					<span class="bps-quality__dot" aria-hidden="true" />
					{worst === 'good' ? __('Photos are sharp', 'blumoon-product-studio') : worst === 'fair' ? __('A photo may look soft', 'blumoon-product-studio') : __('A photo will print blurry', 'blumoon-product-studio')}
				</span>
			)}
			<span class={`bps-status ${outside.length ? 'bps-status--fair' : 'bps-status--good'}`}>
				<Icon icon={outside.length ? TriangleAlert : ShieldCheck} size={16} />
				{outside.length ? sprintf(__('%d near the edge', 'blumoon-product-studio'), outside.length) : __('Inside the safe zone', 'blumoon-product-studio')}
			</span>
			<IconButton icon={CircleHelp} label={__('Keyboard shortcuts (?)', 'blumoon-product-studio')} onClick={() => (model.shortcutsOpen.value = true)} />
		</footer>
	);
}

function Toasts({ model }: { model: EditorModel }) {
	return (
		<div class="bps-toasts" aria-live="polite">
			{model.toasts.value.map((t) => (
				<div key={t.id} class={`bps-toast${t.tone === 'error' ? ' bps-toast--error' : ''}`} role={t.tone === 'error' ? 'alert' : 'status'}>
					<span>{t.message}</span>
					{t.action && (
						<button
							type="button"
							onClick={() => {
								t.action!.run();
								model.dismissToast(t.id);
							}}
						>
							{t.action.label}
						</button>
					)}
					<IconButton icon={X} label={__('Dismiss', 'blumoon-product-studio')} onClick={() => model.dismissToast(t.id)} />
				</div>
			))}
		</div>
	);
}

const SHORTCUTS: [string, string][] = [
	['Ctrl/⌘ + Z', __('Undo', 'blumoon-product-studio')],
	['Ctrl/⌘ + Shift + Z, Ctrl + Y', __('Redo', 'blumoon-product-studio')],
	['Ctrl/⌘ + C / V', __('Copy / paste', 'blumoon-product-studio')],
	['Ctrl/⌘ + D', __('Duplicate', 'blumoon-product-studio')],
	['Ctrl/⌘ + A', __('Select all', 'blumoon-product-studio')],
	['Delete, Backspace', __('Delete', 'blumoon-product-studio')],
	['← ↑ → ↓', __('Move 1 mm (Shift: 10 mm)', 'blumoon-product-studio')],
	['+ / − / 0', __('Zoom in / out / fit', 'blumoon-product-studio')],
	['Space + drag', __('Pan', 'blumoon-product-studio')],
	['Shift while rotating', __('Snap to 15°', 'blumoon-product-studio')],
	['Shift while resizing', __('Keep or free the proportions', 'blumoon-product-studio')],
	['Alt while resizing', __('Resize from the centre', 'blumoon-product-studio')],
	[__('Double-click a photo', 'blumoon-product-studio'), __('Crop (Enter applies, Esc cancels)', 'blumoon-product-studio')],
	['Esc', __('Deselect, then close the panel', 'blumoon-product-studio')],
];

function Shortcuts({ model }: { model: EditorModel }) {
	const close = useRef<HTMLButtonElement>(null);
	useEffect(() => close.current?.focus(), []);
	return (
		<div class="bps-modal" role="dialog" aria-modal="true" aria-labelledby="bps-shortcuts-title" onKeyDown={(e) => e.key === 'Escape' && (model.shortcutsOpen.value = false)}>
			<div class="bps-modal__card">
				<div class="bps-panel__head">
					<h2 id="bps-shortcuts-title">{__('Keyboard shortcuts', 'blumoon-product-studio')}</h2>
					<button type="button" ref={close} class="bps-icon-btn bps-icon-btn--ghost" aria-label={__('Close', 'blumoon-product-studio')} onClick={() => (model.shortcutsOpen.value = false)}>
						<Icon icon={X} />
					</button>
				</div>
				<dl class="bps-shortcuts">
					{SHORTCUTS.map(([keys, action]) => (
						<>
							<dt key={keys}>
								<kbd>{keys}</kbd>
							</dt>
							<dd>{action}</dd>
						</>
					))}
				</dl>
			</div>
		</div>
	);
}

function relativeTime(at: number): string {
	const minutes = Math.round((Date.now() - at) / 60000);
	if (minutes < 1) return __('just now', 'blumoon-product-studio');
	if (minutes < 60) return sprintf(__('%d min ago', 'blumoon-product-studio'), minutes);
	const hours = Math.round(minutes / 60);
	if (hours < 48) return sprintf(__('%d h ago', 'blumoon-product-studio'), hours);
	return new Date(at).toLocaleDateString();
}
