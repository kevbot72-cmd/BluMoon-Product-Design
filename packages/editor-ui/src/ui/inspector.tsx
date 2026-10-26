/** @jsxImportSource preact */
import { useEffect, useRef, useState } from 'preact/hooks';
import { __, sprintf } from '@wordpress/i18n';
import {
	AlignCenterHorizontal,
	AlignCenterVertical,
	AlignEndHorizontal,
	AlignEndVertical,
	AlignHorizontalSpaceAround,
	AlignStartHorizontal,
	AlignStartVertical,
	AlignVerticalSpaceAround,
	ArrowDownToLine,
	ArrowUpToLine,
	Bold,
	CaseUpper,
	Crop,
	FlipHorizontal2,
	FlipVertical2,
	Link,
	Unlink,
} from 'lucide';
import { isMovable, normalizeHex, qrScannable, type ClipartElement, type DrawingElement, type Element, type ImageElement, type QrElement, type ShapeElement, type TextEffect, type TextElement } from '@bps/editor-core';
import type { EditorModel } from '../model.ts';
import { ColorField, Icon, IconButton, NumberField, Section, Toggle } from './controls.tsx';
import { QrForm } from './panels.tsx';

/** Right column: properties of the selection, in millimetres. */
export function Inspector({ model }: { model: EditorModel }) {
	model.track();
	const selected = model.selected();
	if (selected.length === 0) {
		return <ProductSection model={model} />;
	}
	if (selected.length > 1) {
		return <MultiSection model={model} count={selected.length} />;
	}
	const el = selected[0]!;
	return (
		<div class="bps-inspector" id="bps-inspector">
			{el.type === 'text' && <TextSection model={model} el={el} />}
			{el.type === 'image' && <ImageSection model={model} el={el} />}
			{el.type === 'shape' && <ShapeSection model={model} el={el} />}
			{el.type === 'clipart' && <ClipartSection model={model} el={el} />}
			{el.type === 'qr' && <QrSection model={model} el={el} />}
			{el.type === 'drawing' && <DrawingSection model={model} el={el} />}
			<PlacementSection model={model} el={el} />
		</div>
	);
}

function ProductSection({ model }: { model: EditorModel }) {
	const area = model.area;
	const colors = model.bootstrap.colors;
	return (
		<div class="bps-inspector" id="bps-inspector">
			<Section title={__('Print area', 'blumoon-product-studio')}>
				<p class="bps-muted">
					{sprintf(__('%1$s × %2$s mm at %3$d dpi', 'blumoon-product-studio'), area.w.toFixed(0), area.h.toFixed(0), area.dpi)}
				</p>
				<p class="bps-muted">{__('Select something on the canvas to change it.', 'blumoon-product-studio')}</p>
			</Section>
			{colors.length > 0 && (
				<Section title={__('Product colour', 'blumoon-product-studio')}>
					<div class="bps-color__row" role="group" aria-label={__('Product colour', 'blumoon-product-studio')}>
						{colors.map((c) => {
							const active = (model.session.doc.options.productColor ?? null) === c.hex;
							return <button type="button" key={c.id} class={`bps-swatch${active ? ' is-active' : ''}`} style={{ background: c.hex }} aria-label={c.name} title={c.name} aria-pressed={active} onClick={() => model.setProductColor(c.hex)} />;
						})}
					</div>
				</Section>
			)}
		</div>
	);
}

function MultiSection({ model, count }: { model: EditorModel; count: number }) {
	return (
		<div class="bps-inspector" id="bps-inspector">
			<Section title={sprintf(__('%d selected', 'blumoon-product-studio'), count)}>
				<AlignButtons model={model} />
				<div class="bps-row">
					<IconButton icon={AlignHorizontalSpaceAround} label={__('Distribute horizontally', 'blumoon-product-studio')} disabled={count < 3} onClick={() => model.distribute('x')} />
					<IconButton icon={AlignVerticalSpaceAround} label={__('Distribute vertically', 'blumoon-product-studio')} disabled={count < 3} onClick={() => model.distribute('y')} />
				</div>
			</Section>
		</div>
	);
}

function AlignButtons({ model }: { model: EditorModel }) {
	return (
		<div class="bps-row" role="group" aria-label={__('Align', 'blumoon-product-studio')}>
			<IconButton icon={AlignStartVertical} label={__('Align left', 'blumoon-product-studio')} onClick={() => model.align('left')} />
			<IconButton icon={AlignCenterVertical} label={__('Align centre', 'blumoon-product-studio')} onClick={() => model.align('center')} />
			<IconButton icon={AlignEndVertical} label={__('Align right', 'blumoon-product-studio')} onClick={() => model.align('right')} />
			<IconButton icon={AlignStartHorizontal} label={__('Align top', 'blumoon-product-studio')} onClick={() => model.align('top')} />
			<IconButton icon={AlignCenterHorizontal} label={__('Align middle', 'blumoon-product-studio')} onClick={() => model.align('middle')} />
			<IconButton icon={AlignEndHorizontal} label={__('Align bottom', 'blumoon-product-studio')} onClick={() => model.align('bottom')} />
		</div>
	);
}

/** Position, size, rotation, opacity, order and locks, for every element type. */
function PlacementSection({ model, el }: { model: EditorModel; el: Element }) {
	const key = `inspect-${el.id}`;
	const commit = (): void => model.commit(key);
	const sized = el.type !== 'text' && el.type !== 'drawing';
	const keepAspect = 'keepAspect' in el ? el.keepAspect : true;
	const resize = (w: number | null, h: number | null, live: boolean): void => {
		let nw = w ?? el.w;
		let nh = h ?? el.h;
		if (keepAspect || el.type === 'qr') {
			if (w !== null) nh = (el.h * nw) / el.w;
			else nw = (el.w * nh) / el.h;
		}
		// Resize around the centre.
		model.update(el.id, { w: nw, h: nh, x: el.x + (el.w - nw) / 2, y: el.y + (el.h - nh) / 2 }, __('Resize', 'blumoon-product-studio'), live ? key : undefined);
	};
	return (
		<Section title={__('Position', 'blumoon-product-studio')}>
			<AlignButtons model={model} />
			<div class="bps-fields">
				<NumberField label="X" unit="mm" value={el.x} onChange={(v, live) => model.update(el.id, { x: v }, __('Move', 'blumoon-product-studio'), live ? key : undefined)} onCommit={commit} />
				<NumberField label="Y" unit="mm" value={el.y} onChange={(v, live) => model.update(el.id, { y: v }, __('Move', 'blumoon-product-studio'), live ? key : undefined)} onCommit={commit} />
				{sized && <NumberField label="W" unit="mm" value={el.w} min={1} onChange={(v, live) => resize(v, null, live)} onCommit={commit} />}
				{sized && <NumberField label="H" unit="mm" value={el.h} min={1} onChange={(v, live) => resize(null, v, live)} onCommit={commit} />}
				<NumberField label="↻" unit="°" value={el.rotation} min={-180} max={180} precision={0} onChange={(v, live) => model.update(el.id, { rotation: v }, __('Rotate', 'blumoon-product-studio'), live ? key : undefined)} onCommit={commit} />
				<NumberField label="α" unit="%" value={el.opacity * 100} min={0} max={100} precision={0} step={5} onChange={(v, live) => model.update(el.id, { opacity: v / 100 }, __('Opacity', 'blumoon-product-studio'), live ? key : undefined)} onCommit={commit} />
			</div>
			<div class="bps-row">
				<IconButton icon={ArrowUpToLine} label={__('Bring to front', 'blumoon-product-studio')} onClick={() => model.reorder(el.id, 'front')} />
				<IconButton icon={ArrowDownToLine} label={__('Send to back', 'blumoon-product-studio')} onClick={() => model.reorder(el.id, 'back')} />
				{(el.type === 'image' || el.type === 'shape' || el.type === 'clipart') && (
					<IconButton
						icon={keepAspect ? Link : Unlink}
						label={keepAspect ? __('Unlock aspect ratio', 'blumoon-product-studio') : __('Lock aspect ratio', 'blumoon-product-studio')}
						pressed={keepAspect}
						onClick={() => model.update<ShapeElement>(el.id, { keepAspect: !keepAspect }, __('Aspect ratio', 'blumoon-product-studio'))}
					/>
				)}
				{el.type !== 'drawing' && (
					<>
						<IconButton icon={FlipHorizontal2} label={__('Flip horizontally', 'blumoon-product-studio')} pressed={el.flipX} onClick={() => model.update(el.id, { flipX: !el.flipX }, __('Flip', 'blumoon-product-studio'))} />
						<IconButton icon={FlipVertical2} label={__('Flip vertically', 'blumoon-product-studio')} pressed={el.flipY} onClick={() => model.update(el.id, { flipY: !el.flipY }, __('Flip', 'blumoon-product-studio'))} />
					</>
				)}
			</div>
			<Toggle label={__('Lock position', 'blumoon-product-studio')} checked={el.locks.position === true} onChange={(on) => model.update(el.id, { locks: { ...el.locks, position: on } }, __('Lock', 'blumoon-product-studio'))} />
		</Section>
	);
}

/* ------------------------------------------------------------ Text */

const EFFECTS: { kind: TextEffect['kind']; label: string }[] = [
	{ kind: 'none', label: __('Normal', 'blumoon-product-studio') },
	{ kind: 'arc', label: __('Curved', 'blumoon-product-studio') },
	{ kind: 'bridge', label: __('Bridge', 'blumoon-product-studio') },
	{ kind: 'oblique', label: __('Oblique', 'blumoon-product-studio') },
];

function TextSection({ model, el }: { model: EditorModel; el: TextElement }) {
	const key = `text-${el.id}`;
	const commit = (): void => model.commit(key);
	const textarea = useRef<HTMLTextAreaElement>(null);
	const [draft, setDraft] = useState(el.text);
	useEffect(() => setDraft(el.text), [el.id, el.text]);
	useEffect(() => {
		if (model.textEditRequest.value === el.id) {
			textarea.current?.focus();
			textarea.current?.select();
			model.textEditRequest.value = null;
		}
	}, [model.textEditRequest, model.textEditRequest.value, el.id]);
	const fonts = model.fonts.list();
	const family = fonts.find((f) => f.family === el.font.family);
	const hasBold = family?.variants.some((v) => v.weight >= 600) ?? false;
	const setEffect = (kind: TextEffect['kind']): void => {
		const effect: TextEffect =
			kind === 'arc' ? { kind, radiusMm: Math.max(20, el.w * 0.8), direction: 'up' } : kind === 'bridge' ? { kind, curve: 0.5, offset: 0.5 } : kind === 'oblique' ? { kind, angle: 12 } : { kind: 'none' };
		void model.updateText(el.id, { effect }, __('Text effect', 'blumoon-product-studio'));
	};
	return (
		<Section title={__('Text', 'blumoon-product-studio')}>
			<label class="bps-field bps-field--wide">
				<span class="bps-field__label">{__('Content', 'blumoon-product-studio')}</span>
				<textarea
					ref={textarea}
					id="bps-text-content"
					class="bps-field__input"
					rows={2}
					maxLength={el.permissions?.maxChars}
					value={draft}
					onInput={(e) => {
						setDraft(e.currentTarget.value);
						void model.updateText(el.id, { text: e.currentTarget.value }, __('Edit text', 'blumoon-product-studio'), key);
					}}
					onBlur={commit}
				/>
			</label>
			<label class="bps-field bps-field--wide">
				<span class="bps-field__label">{__('Font', 'blumoon-product-studio')}</span>
				<select
					class="bps-field__input"
					value={el.font.family}
					onChange={(e) => {
						const next = fonts.find((f) => f.family === e.currentTarget.value);
						const weight = next?.variants.some((v) => v.weight === el.font.weight) ? el.font.weight : (next?.variants[0]?.weight ?? 400);
						void model.updateText(el.id, { font: { ...el.font, family: e.currentTarget.value, weight } }, __('Font', 'blumoon-product-studio'));
					}}
				>
					{fonts.map((f) => (
						<option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
							{f.family}
						</option>
					))}
				</select>
			</label>
			<div class="bps-fields">
				<NumberField label={__('Size', 'blumoon-product-studio')} unit="pt" value={el.font.sizePt} min={4} max={1000} precision={0} onChange={(v, live) => void model.updateText(el.id, { font: { ...el.font, sizePt: v } }, __('Text size', 'blumoon-product-studio'), live ? key : undefined)} onCommit={commit} />
				<NumberField label={__('Spacing', 'blumoon-product-studio')} value={el.letterSpacing} step={10} min={-200} max={1000} precision={0} onChange={(v, live) => void model.updateText(el.id, { letterSpacing: v }, __('Letter spacing', 'blumoon-product-studio'), live ? key : undefined)} onCommit={commit} />
				<NumberField label={__('Lines', 'blumoon-product-studio')} value={el.lineHeight} step={0.05} min={0.6} max={3} precision={2} onChange={(v, live) => void model.updateText(el.id, { lineHeight: v }, __('Line height', 'blumoon-product-studio'), live ? key : undefined)} onCommit={commit} />
			</div>
			<div class="bps-row">
				<IconButton icon={Bold} label={__('Bold', 'blumoon-product-studio')} pressed={el.font.weight >= 600} disabled={!hasBold} onClick={() => void model.updateText(el.id, { font: { ...el.font, weight: el.font.weight >= 600 ? 400 : 700 } }, __('Bold', 'blumoon-product-studio'))} />
				<IconButton icon={CaseUpper} label={__('Capitals', 'blumoon-product-studio')} pressed={el.uppercase} onClick={() => void model.updateText(el.id, { uppercase: !el.uppercase }, __('Capitals', 'blumoon-product-studio'))} />
				<select class="bps-select" aria-label={__('Alignment', 'blumoon-product-studio')} value={el.align} onChange={(e) => model.update<TextElement>(el.id, { align: e.currentTarget.value as TextElement['align'] }, __('Align text', 'blumoon-product-studio'))}>
					<option value="left">{__('Left', 'blumoon-product-studio')}</option>
					<option value="center">{__('Centre', 'blumoon-product-studio')}</option>
					<option value="right">{__('Right', 'blumoon-product-studio')}</option>
				</select>
			</div>
			<ColorField label={__('Colour', 'blumoon-product-studio')} value={el.fill} onChange={(c) => model.update<TextElement>(el.id, { fill: c ?? '#1a1a1a' }, __('Text colour', 'blumoon-product-studio'))} />
			<ColorField
				label={__('Outline', 'blumoon-product-studio')}
				value={el.stroke?.color ?? null}
				allowNone
				onChange={(c) => void model.updateText(el.id, { stroke: c ? { color: c, widthMm: el.stroke?.widthMm ?? 0.4 } : null }, __('Outline', 'blumoon-product-studio'))}
			/>
			{el.stroke && <NumberField label={__('Outline width', 'blumoon-product-studio')} unit="mm" value={el.stroke.widthMm} min={0} max={10} step={0.1} precision={2} onChange={(v, live) => void model.updateText(el.id, { stroke: { color: el.stroke!.color, widthMm: v } }, __('Outline', 'blumoon-product-studio'), live ? key : undefined)} onCommit={commit} />}
			<Toggle
				label={__('Shadow', 'blumoon-product-studio')}
				checked={el.shadow !== null}
				onChange={(on) => model.update<TextElement>(el.id, { shadow: on ? { color: '#00000066', blurMm: 1, offsetXMm: 0.6, offsetYMm: 0.6 } : null }, __('Shadow', 'blumoon-product-studio'))}
			/>
			<fieldset class="bps-fieldset">
				<legend class="bps-field__label">{__('Effect', 'blumoon-product-studio')}</legend>
				<div class="bps-chips">
					{EFFECTS.map((e) => (
						<button type="button" key={e.kind} class="bps-chip" aria-pressed={el.effect.kind === e.kind} onClick={() => setEffect(e.kind)}>
							{e.label}
						</button>
					))}
				</div>
				{el.effect.kind === 'arc' && (
					<div class="bps-fields">
						<NumberField label={__('Radius', 'blumoon-product-studio')} unit="mm" value={el.effect.radiusMm} min={5} max={2000} step={5} precision={0} onChange={(v, live) => void model.updateText(el.id, { effect: { kind: 'arc', radiusMm: v, direction: (el.effect as { direction: 'up' | 'down' }).direction } }, __('Curve', 'blumoon-product-studio'), live ? key : undefined)} onCommit={commit} />
						<Toggle label={__('Curve downwards', 'blumoon-product-studio')} checked={el.effect.direction === 'down'} onChange={(down) => void model.updateText(el.id, { effect: { kind: 'arc', radiusMm: (el.effect as { radiusMm: number }).radiusMm, direction: down ? 'down' : 'up' } }, __('Curve', 'blumoon-product-studio'))} />
					</div>
				)}
				{el.effect.kind === 'bridge' && (
					<input type="range" class="bps-range" aria-label={__('Bend', 'blumoon-product-studio')} min={-1} max={1} step={0.05} value={el.effect.curve} onInput={(e) => void model.updateText(el.id, { effect: { kind: 'bridge', curve: Number(e.currentTarget.value), offset: 0.5 } }, __('Bend', 'blumoon-product-studio'), key)} onChange={commit} />
				)}
				{el.effect.kind === 'oblique' && (
					<input type="range" class="bps-range" aria-label={__('Slant', 'blumoon-product-studio')} min={-45} max={45} step={1} value={el.effect.angle} onInput={(e) => void model.updateText(el.id, { effect: { kind: 'oblique', angle: Number(e.currentTarget.value) } }, __('Slant', 'blumoon-product-studio'), key)} onChange={commit} />
				)}
			</fieldset>
		</Section>
	);
}

/* ------------------------------------------------------------ Image */

function ImageSection({ model, el }: { model: EditorModel; el: ImageElement }) {
	const { dpi, band } = model.quality(el);
	const message =
		band === 'good'
			? __('Sharp at this size.', 'blumoon-product-studio')
			: band === 'fair'
				? __('May look slightly soft. Make it smaller, or use a larger photo.', 'blumoon-product-studio')
				: __('Will print blurry at this size. Make it smaller or use a larger photo.', 'blumoon-product-studio');
	return (
		<Section title={__('Photo', 'blumoon-product-studio')}>
			<p class={`bps-quality bps-quality--${band}`} role="status">
				<span class="bps-quality__dot" aria-hidden="true" />
				<span>
					<strong>{sprintf(__('Print quality: %d dpi', 'blumoon-product-studio'), dpi)}</strong>
					<br />
					{message}
				</span>
			</p>
			<button type="button" class="bps-btn" disabled={!isMovable(el)} onClick={() => void model.startCrop(el.id)}>
				<Icon icon={Crop} size={18} /> {__('Crop photo', 'blumoon-product-studio')}
			</button>
		</Section>
	);
}

/* ------------------------------------------------------------ Shape */

function ShapeSection({ model, el }: { model: EditorModel; el: ShapeElement }) {
	const key = `shape-${el.id}`;
	const isLine = el.shape === 'line' || el.shape === 'arrow';
	return (
		<Section title={__('Shape', 'blumoon-product-studio')}>
			{!isLine && <ColorField label={__('Fill', 'blumoon-product-studio')} value={el.fill} allowNone onChange={(c) => model.update<ShapeElement>(el.id, { fill: c }, __('Fill', 'blumoon-product-studio'))} />}
			<ColorField
				label={isLine ? __('Colour', 'blumoon-product-studio') : __('Border', 'blumoon-product-studio')}
				value={el.stroke?.color ?? null}
				allowNone={!isLine}
				onChange={(c) => model.update<ShapeElement>(el.id, { stroke: c ? { color: c, widthMm: el.stroke?.widthMm ?? 1 } : null }, __('Border', 'blumoon-product-studio'))}
			/>
			<div class="bps-fields">
				{el.stroke && <NumberField label={__('Width', 'blumoon-product-studio')} unit="mm" value={el.stroke.widthMm} min={0} max={50} step={0.25} precision={2} onChange={(v, live) => model.update<ShapeElement>(el.id, { stroke: { color: el.stroke!.color, widthMm: v } }, __('Border width', 'blumoon-product-studio'), live ? key : undefined)} onCommit={() => model.commit(key)} />}
				{el.shape === 'rect' && <NumberField label={__('Corners', 'blumoon-product-studio')} unit="mm" value={el.cornerRadiusMm} min={0} max={500} precision={1} onChange={(v, live) => model.update<ShapeElement>(el.id, { cornerRadiusMm: v }, __('Corner radius', 'blumoon-product-studio'), live ? key : undefined)} onCommit={() => model.commit(key)} />}
			</div>
		</Section>
	);
}

/* ------------------------------------------------------------ Clipart */

function ClipartSection({ model, el }: { model: EditorModel; el: ClipartElement }) {
	const original = model.stage?.colorsOf(el.id) ?? [];
	// Colours as drawn now map back to the artwork's own colours.
	const sources = original.map((shown) => Object.entries(el.colors).find(([, to]) => normalizeHex(to) === shown)?.[0] ?? shown);
	const unique = [...new Set(sources)];
	if (unique.length === 0) {
		return null;
	}
	return (
		<Section title={__('Colours', 'blumoon-product-studio')}>
			{unique.slice(0, 8).map((from, i) => (
				<ColorField
					key={from}
					label={sprintf(__('Colour %d', 'blumoon-product-studio'), i + 1)}
					value={el.colors[from] ?? from}
					onChange={(to) => model.update<ClipartElement>(el.id, { colors: { ...el.colors, [from]: to ?? from } }, __('Recolour', 'blumoon-product-studio'))}
				/>
			))}
		</Section>
	);
}

/* ------------------------------------------------------------ QR */

function QrSection({ model, el }: { model: EditorModel; el: QrElement }) {
	const scannable = qrScannable(el.fg, el.bg, model.session.doc.options.productColor ?? '#ffffff');
	return (
		<Section title={__('QR code', 'blumoon-product-studio')}>
			<QrForm key={el.id} initial={el.payload} onChange={(payload) => payload && JSON.stringify(payload) !== JSON.stringify(el.payload) && model.update<QrElement>(el.id, { payload }, __('QR content', 'blumoon-product-studio'), `qr-${el.id}`)} />
			<ColorField label={__('Code colour', 'blumoon-product-studio')} value={el.fg} onChange={(c) => model.update<QrElement>(el.id, { fg: c ?? '#000000' }, __('QR colour', 'blumoon-product-studio'))} />
			<ColorField label={__('Background', 'blumoon-product-studio')} value={el.bg} allowNone onChange={(c) => model.update<QrElement>(el.id, { bg: c }, __('QR background', 'blumoon-product-studio'))} />
			<label class="bps-field bps-field--wide">
				<span class="bps-field__label">{__('Error correction', 'blumoon-product-studio')}</span>
				<select class="bps-field__input" value={el.ecc} onChange={(e) => model.update<QrElement>(el.id, { ecc: e.currentTarget.value as QrElement['ecc'] }, __('Error correction', 'blumoon-product-studio'))}>
					<option value="L">{__('Low (smallest code)', 'blumoon-product-studio')}</option>
					<option value="M">{__('Medium', 'blumoon-product-studio')}</option>
					<option value="Q">{__('High', 'blumoon-product-studio')}</option>
					<option value="H">{__('Highest (survives damage)', 'blumoon-product-studio')}</option>
				</select>
			</label>
			<p class={`bps-note ${scannable ? 'bps-note--ok' : 'bps-note--warn'}`} role="status">
				{scannable ? __('Good contrast: this code will scan.', 'blumoon-product-studio') : __('Low contrast: phones may not scan this code.', 'blumoon-product-studio')}
				{el.w < 15 && ` ${__('Codes smaller than 15 mm can be hard to scan.', 'blumoon-product-studio')}`}
			</p>
		</Section>
	);
}

/* ------------------------------------------------------------ Drawing */

function DrawingSection({ model, el }: { model: EditorModel; el: DrawingElement }) {
	return (
		<Section title={__('Drawing', 'blumoon-product-studio')}>
			<p class="bps-muted">{sprintf(__('%d strokes', 'blumoon-product-studio'), el.strokes.length)}</p>
			<button type="button" class="bps-btn" onClick={() => model.update<DrawingElement>(el.id, { strokes: [] }, __('Clear drawing', 'blumoon-product-studio'))}>
				{__('Clear drawing', 'blumoon-product-studio')}
			</button>
		</Section>
	);
}
