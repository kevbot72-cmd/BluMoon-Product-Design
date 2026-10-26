/** @jsxImportSource preact */
import { useEffect, useRef, useState } from 'preact/hooks';
import { __ } from '@wordpress/i18n';
import { Eraser, Eye, EyeOff, GripVertical, Lock, LockOpen, Pencil, Search, Upload as UploadIcon, X } from 'lucide';
import { SHAPES, elementLabel, qrScannable, type QrPayload } from '@bps/editor-core';
import { shapePath } from '@bps/editor-canvas';
import type { Clipart } from '../api.ts';
import type { EditorModel } from '../model.ts';
import { ColorField, Icon, IconButton, NumberField, Toggle } from './controls.tsx';

/* ------------------------------------------------------------ Text */

const PRESETS = [
	{ label: __('Add a heading', 'blumoon-product-studio'), text: __('Your heading', 'blumoon-product-studio'), family: 'Inter', weight: 700, sizePt: 48, className: 'bps-preset--heading' },
	{ label: __('Add a subheading', 'blumoon-product-studio'), text: __('Your subheading', 'blumoon-product-studio'), family: 'Inter', weight: 700, sizePt: 28, className: 'bps-preset--sub' },
	{ label: __('Add body text', 'blumoon-product-studio'), text: __('Your text', 'blumoon-product-studio'), family: 'Inter', weight: 400, sizePt: 16, className: 'bps-preset--body' },
];

const COMBOS = [
	{ text: __('Happy Birthday', 'blumoon-product-studio'), family: 'Playfair Display', weight: 700, sizePt: 40 },
	{ text: __('BEST DAD', 'blumoon-product-studio'), family: 'Bebas Neue', weight: 400, sizePt: 56 },
	{ text: __('Love you', 'blumoon-product-studio'), family: 'Pacifico', weight: 400, sizePt: 40 },
	{ text: __('Thank you', 'blumoon-product-studio'), family: 'Caveat', weight: 700, sizePt: 44 },
];

export function TextPanel({ model }: { model: EditorModel }) {
	// Show each combination in its own font.
	useEffect(() => {
		COMBOS.forEach((c) => void model.fonts.load(c.family, c.weight));
	}, [model]);
	return (
		<div class="bps-panel__body">
			{PRESETS.map((p) => (
				<button type="button" key={p.label} class={`bps-preset ${p.className}`} onClick={() => void model.addText(p)}>
					{p.label}
				</button>
			))}
			<h3 class="bps-section__title">{__('Combinations', 'blumoon-product-studio')}</h3>
			<div class="bps-grid bps-grid--2">
				{COMBOS.map((c) => (
					<button type="button" key={c.text} class="bps-tile bps-tile--text" style={{ fontFamily: `'${c.family}', sans-serif`, fontWeight: c.weight }} onClick={() => void model.addText(c)}>
						{c.text}
					</button>
				))}
			</div>
		</div>
	);
}

/* ------------------------------------------------------------ Uploads */

export function UploadsPanel({ model }: { model: EditorModel }) {
	const input = useRef<HTMLInputElement>(null);
	const [over, setOver] = useState(false);
	const accept = model.bootstrap.settings.uploads.formats
		.map((f) => ({ jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml', heic: 'image/heic,.heic' })[f] ?? '')
		.filter(Boolean)
		.join(',');
	return (
		<div class="bps-panel__body">
			<div
				class={`bps-drop${over ? ' is-over' : ''}`}
				onDragOver={(e) => {
					e.preventDefault();
					setOver(true);
				}}
				onDragLeave={() => setOver(false)}
				onDrop={(e) => {
					e.preventDefault();
					setOver(false);
					void model.uploadFiles([...(e.dataTransfer?.files ?? [])]);
				}}
			>
				<Icon icon={UploadIcon} size={28} />
				<strong>{__('Drop a photo here', 'blumoon-product-studio')}</strong>
				<span>{__('or paste it, or choose a file', 'blumoon-product-studio')}</span>
				<button type="button" class="bps-btn bps-btn--primary" onClick={() => input.current?.click()}>
					{__('Choose file', 'blumoon-product-studio')}
				</button>
				<span class="bps-muted">
					{model.bootstrap.settings.uploads.formats.map((f) => f.toUpperCase()).join(', ')} · {__('up to', 'blumoon-product-studio')} {model.bootstrap.settings.uploads.maxMb} MB
				</span>
				<input
					ref={input}
					type="file"
					accept={accept}
					multiple
					hidden
					onChange={(e) => {
						void model.uploadFiles([...(e.currentTarget.files ?? [])]);
						e.currentTarget.value = '';
					}}
				/>
			</div>
			{model.uploading.value.map((job) => (
				<div key={job.id} class="bps-progress" role="status">
					<span class="bps-progress__name">{job.name}</span>
					<progress max={1} value={job.progress} aria-label={__('Upload progress', 'blumoon-product-studio')} />
					<IconButton icon={X} label={__('Cancel upload', 'blumoon-product-studio')} onClick={() => job.abort.abort()} />
				</div>
			))}
			{model.uploads.value.length > 0 && <h3 class="bps-section__title">{__('My uploads', 'blumoon-product-studio')}</h3>}
			<div class="bps-grid bps-grid--3">
				{model.uploads.value.map((u) => (
					<button type="button" key={u.id} class="bps-tile bps-tile--image" aria-label={__('Add this photo', 'blumoon-product-studio')} onClick={() => model.addUpload(u)}>
						<img src={u.previewUrl} alt="" loading="lazy" />
					</button>
				))}
			</div>
		</div>
	);
}

/* ------------------------------------------------------------ Shapes and clipart */

export function ShapesPanel({ model }: { model: EditorModel }) {
	const [query, setQuery] = useState('');
	const [category, setCategory] = useState(0);
	const [page, setPage] = useState(1);
	const [pages, setPages] = useState(1);
	const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		model.api
			.get<{ id: number; name: string }[]>('assets/clipart-categories')
			.then(({ data }) => setCategories(data))
			.catch(() => setCategories([]));
	}, [model]);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		const timer = setTimeout(() => {
			model.api
				.get<Clipart[]>('assets/clipart', { search: query, category, page, per_page: 30 })
				.then(({ data, headers }) => {
					if (cancelled) return;
					model.rememberClipart(data);
					model.clipart.value = page === 1 ? data : [...model.clipart.value, ...data];
					setPages(Number(headers.get('X-WP-TotalPages') ?? '1') || 1);
				})
				.catch(() => {
					if (!cancelled && page === 1) model.clipart.value = [];
				})
				.finally(() => {
					if (!cancelled) setLoading(false);
				});
		}, 250);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [model, query, category, page]);

	return (
		<div class="bps-panel__body">
			<h3 class="bps-section__title">{__('Shapes', 'blumoon-product-studio')}</h3>
			<div class="bps-grid bps-grid--4">
				{SHAPES.map((shape) => (
					<button type="button" key={shape} class="bps-tile" aria-label={shape} title={shape} onClick={() => model.addShape(shape)}>
						<svg viewBox="-2 -2 36 36" width="32" height="32" aria-hidden="true">
							<path d={shapePath(shape, 32, shape === 'line' || shape === 'arrow' ? 16 : 32, 4)} transform={shape === 'line' || shape === 'arrow' ? 'translate(0 8)' : undefined} fill={shape === 'line' || shape === 'arrow' ? 'none' : 'currentColor'} stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
						</svg>
					</button>
				))}
			</div>
			<h3 class="bps-section__title">{__('Clipart', 'blumoon-product-studio')}</h3>
			<label class="bps-search">
				<Icon icon={Search} size={16} />
				<input
					type="search"
					placeholder={__('Search clipart', 'blumoon-product-studio')}
					aria-label={__('Search clipart', 'blumoon-product-studio')}
					value={query}
					onInput={(e) => {
						setQuery(e.currentTarget.value);
						setPage(1);
					}}
				/>
			</label>
			{categories.length > 0 && (
				<div class="bps-chips" role="group" aria-label={__('Categories', 'blumoon-product-studio')}>
					{[{ id: 0, name: __('All', 'blumoon-product-studio') }, ...categories].map((c) => (
						<button
							type="button"
							key={c.id}
							class="bps-chip"
							aria-pressed={category === c.id}
							onClick={() => {
								setCategory(c.id);
								setPage(1);
							}}
						>
							{c.name}
						</button>
					))}
				</div>
			)}
			<div class="bps-grid bps-grid--3">
				{model.clipart.value.map((c) => (
					<button type="button" key={c.id} class="bps-tile bps-tile--image" title={c.title} aria-label={c.title} onClick={() => model.addClipart(c)}>
						<img src={c.thumb} alt="" loading="lazy" />
					</button>
				))}
			</div>
			{!loading && model.clipart.value.length === 0 && <p class="bps-muted">{__('No clipart found.', 'blumoon-product-studio')}</p>}
			{page < pages && (
				<button type="button" class="bps-btn" disabled={loading} onClick={() => setPage(page + 1)}>
					{__('Load more', 'blumoon-product-studio')}
				</button>
			)}
		</div>
	);
}

/* ------------------------------------------------------------ QR */

type QrKind = QrPayload['kind'];

const QR_KINDS: { kind: QrKind; label: string }[] = [
	{ kind: 'url', label: __('Link', 'blumoon-product-studio') },
	{ kind: 'text', label: __('Text', 'blumoon-product-studio') },
	{ kind: 'vcard', label: __('Contact', 'blumoon-product-studio') },
	{ kind: 'wifi', label: __('Wi-Fi', 'blumoon-product-studio') },
	{ kind: 'email', label: __('Email', 'blumoon-product-studio') },
	{ kind: 'phone', label: __('Phone', 'blumoon-product-studio') },
];

/** Form for a QR payload; returns null while it is incomplete. */
export function QrForm({ initial, onChange }: { initial?: QrPayload; onChange: (payload: QrPayload | null) => void }) {
	const [kind, setKind] = useState<QrKind>(initial?.kind ?? 'url');
	const [fields, setFields] = useState<Record<string, string>>(() => (initial ? Object.fromEntries(Object.entries(initial).filter(([k]) => k !== 'kind')) : { url: 'https://' }));
	const set = (key: string, value: string): void => setFields({ ...fields, [key]: value });
	// Parents pass a fresh closure each render; only payload changes should notify.
	const notify = useRef(onChange);
	notify.current = onChange;
	useEffect(() => {
		notify.current(toPayload(kind, fields));
	}, [kind, fields]);
	const input = (key: string, label: string, type: 'text' | 'url' | 'tel' | 'email' = 'text') => (
		<label class="bps-field bps-field--wide" key={key}>
			<span class="bps-field__label">{label}</span>
			{/* Preact types <input> as a union keyed on `type`; tsc needs the narrowing, the lint rule misreads it. */}
			{/* eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion */}
			<input class="bps-field__input" type={type as 'text'} value={fields[key] ?? ''} onInput={(e) => set(key, e.currentTarget.value)} />
		</label>
	);
	return (
		<div class="bps-stack">
			<div class="bps-chips" role="group" aria-label={__('QR content', 'blumoon-product-studio')}>
				{QR_KINDS.map((k) => (
					<button type="button" key={k.kind} class="bps-chip" aria-pressed={kind === k.kind} onClick={() => setKind(k.kind)}>
						{k.label}
					</button>
				))}
			</div>
			{kind === 'url' && input('url', __('Link', 'blumoon-product-studio'), 'url')}
			{kind === 'text' && (
				<label class="bps-field bps-field--wide">
					<span class="bps-field__label">{__('Text', 'blumoon-product-studio')}</span>
					<textarea class="bps-field__input" rows={3} value={fields.text ?? ''} onInput={(e) => set('text', e.currentTarget.value)} />
				</label>
			)}
			{kind === 'vcard' && [input('name', __('Name', 'blumoon-product-studio')), input('org', __('Company', 'blumoon-product-studio')), input('phone', __('Phone', 'blumoon-product-studio'), 'tel'), input('email', __('Email', 'blumoon-product-studio'), 'email'), input('url', __('Website', 'blumoon-product-studio'), 'url')]}
			{kind === 'wifi' && [
				input('ssid', __('Network name', 'blumoon-product-studio')),
				input('password', __('Password', 'blumoon-product-studio')),
				<label class="bps-field bps-field--wide" key="security">
					<span class="bps-field__label">{__('Security', 'blumoon-product-studio')}</span>
					<select class="bps-field__input" value={fields.security ?? 'WPA'} onChange={(e) => set('security', e.currentTarget.value)}>
						<option value="WPA">WPA/WPA2</option>
						<option value="WEP">WEP</option>
						<option value="nopass">{__('None', 'blumoon-product-studio')}</option>
					</select>
				</label>,
			]}
			{kind === 'email' && [input('to', __('Email address', 'blumoon-product-studio'), 'email'), input('subject', __('Subject', 'blumoon-product-studio'))]}
			{kind === 'phone' && input('number', __('Phone number', 'blumoon-product-studio'), 'tel')}
		</div>
	);
}

function toPayload(kind: QrKind, f: Record<string, string>): QrPayload | null {
	const v = (k: string): string => (f[k] ?? '').trim();
	const opt = (k: string): { [key: string]: string } => (v(k) ? { [k]: v(k) } : {});
	switch (kind) {
		case 'url':
			return /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(v('url')) ? { kind, url: v('url') } : null;
		case 'text':
			return v('text') ? { kind, text: v('text') } : null;
		case 'vcard':
			return v('name') ? { kind, name: v('name'), ...opt('org'), ...opt('phone'), ...opt('email'), ...opt('url') } : null;
		case 'wifi':
			return v('ssid') ? { kind, ssid: v('ssid'), password: v('password'), security: (v('security') || 'WPA') as 'WPA' | 'WEP' | 'nopass' } : null;
		case 'email':
			return /.+@.+\..+/.test(v('to')) ? { kind, to: v('to'), ...opt('subject') } : null;
		case 'phone':
			return /\d{3,}/.test(v('number')) ? { kind, number: v('number') } : null;
	}
}

export function QrPanel({ model }: { model: EditorModel }) {
	const [payload, setPayload] = useState<QrPayload | null>(null);
	const [fg, setFg] = useState('#000000');
	const [bg, setBg] = useState<string | null>('#ffffff');
	const scannable = qrScannable(fg, bg, model.session.doc.options.productColor ?? '#ffffff');
	return (
		<div class="bps-panel__body">
			<QrForm onChange={setPayload} />
			<ColorField label={__('Code colour', 'blumoon-product-studio')} value={fg} onChange={(c) => setFg(c ?? '#000000')} />
			<ColorField label={__('Background', 'blumoon-product-studio')} value={bg} allowNone onChange={setBg} />
			<p class={`bps-note ${scannable ? 'bps-note--ok' : 'bps-note--warn'}`} role="status">
				{scannable ? __('Good contrast: this code will scan.', 'blumoon-product-studio') : __('Low contrast: phones may not scan this code. Use a dark code on a light background.', 'blumoon-product-studio')}
			</p>
			<button type="button" class="bps-btn bps-btn--primary" disabled={!payload} onClick={() => payload && model.addQr(payload, fg, bg)}>
				{__('Add QR code', 'blumoon-product-studio')}
			</button>
		</div>
	);
}

/* ------------------------------------------------------------ Draw */

export function DrawPanel({ model }: { model: EditorModel }) {
	const d = model.drawing.value;
	return (
		<div class="bps-panel__body">
			<div class="bps-chips" role="group" aria-label={__('Tool', 'blumoon-product-studio')}>
				<button type="button" class="bps-chip" aria-pressed={d.enabled && !d.erase} onClick={() => model.setDrawing({ enabled: true, erase: false })}>
					<Icon icon={Pencil} size={16} /> {__('Brush', 'blumoon-product-studio')}
				</button>
				<button type="button" class="bps-chip" aria-pressed={d.enabled && d.erase} onClick={() => model.setDrawing({ enabled: true, erase: true })}>
					<Icon icon={Eraser} size={16} /> {__('Eraser', 'blumoon-product-studio')}
				</button>
			</div>
			<NumberField label={__('Size', 'blumoon-product-studio')} unit="mm" value={d.widthMm} min={0.2} max={30} step={0.5} onChange={(v) => model.setDrawing({ widthMm: v })} />
			<ColorField label={__('Colour', 'blumoon-product-studio')} value={d.color} onChange={(c) => model.setDrawing({ color: c ?? '#1a1a1a' })} />
			<button type="button" class="bps-btn" onClick={() => model.setDrawing({ enabled: !d.enabled })}>
				{d.enabled ? __('Stop drawing', 'blumoon-product-studio') : __('Start drawing', 'blumoon-product-studio')}
			</button>
		</div>
	);
}

/* ------------------------------------------------------------ Layers */

export function LayersPanel({ model }: { model: EditorModel }) {
	const [renaming, setRenaming] = useState<string | null>(null);
	const [dragging, setDragging] = useState<string | null>(null);
	const elements = model.elements();
	const selection = new Set(model.selection.value);
	// Top of the stack first, as in every design tool.
	const rows = [...elements].reverse();
	if (rows.length === 0) {
		return (
			<div class="bps-panel__body">
				<p class="bps-muted">{__('Nothing here yet. Add text, a photo or a shape.', 'blumoon-product-studio')}</p>
			</div>
		);
	}
	return (
		<div class="bps-panel__body">
			<ul class="bps-layers" role="listbox" aria-label={__('Layers', 'blumoon-product-studio')} aria-multiselectable="true">
				{rows.map((el) => {
					const index = elements.indexOf(el);
					const thumb = model.stage?.thumbnail(el.id, 36) ?? null;
					return (
						<li
							key={el.id}
							role="option"
							aria-selected={selection.has(el.id)}
							tabIndex={0}
							class={`bps-layer${selection.has(el.id) ? ' is-selected' : ''}${el.hidden ? ' is-hidden' : ''}`}
							draggable
							onDragStart={() => setDragging(el.id)}
							onDragOver={(e) => e.preventDefault()}
							onDrop={() => {
								if (dragging && dragging !== el.id) model.reorder(dragging, index);
								setDragging(null);
							}}
							onClick={(e) => model.session.select(e.shiftKey ? [...model.selection.value, el.id] : [el.id])}
							onKeyDown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									model.session.select([el.id]);
								} else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
									e.preventDefault();
									model.reorder(el.id, e.key === 'ArrowUp' ? 'forward' : 'backward');
								}
							}}
						>
							<Icon icon={GripVertical} size={14} />
							<span class="bps-layer__thumb">{thumb ? <img src={thumb} alt="" /> : null}</span>
							{renaming === el.id ? (
								<input
									class="bps-layer__rename"
									aria-label={__('Layer name', 'blumoon-product-studio')}
									value={elementLabel(el)}
									ref={(node) => node?.focus()}
									onBlur={(e) => {
										model.update(el.id, { name: e.currentTarget.value.slice(0, 120) }, __('Rename', 'blumoon-product-studio'));
										setRenaming(null);
									}}
									onKeyDown={(e) => {
										if (e.key === 'Enter') e.currentTarget.blur();
										if (e.key === 'Escape') setRenaming(null);
										e.stopPropagation();
									}}
								/>
							) : (
								<span class="bps-layer__name" onDblClick={() => setRenaming(el.id)}>
									{elementLabel(el)}
								</span>
							)}
							<IconButton
								icon={el.locks.position ? Lock : LockOpen}
								label={el.locks.position ? __('Unlock', 'blumoon-product-studio') : __('Lock position', 'blumoon-product-studio')}
								pressed={el.locks.position === true}
								onClick={() => model.update(el.id, { locks: { ...el.locks, position: !el.locks.position } }, __('Lock', 'blumoon-product-studio'))}
							/>
							<IconButton
								icon={el.hidden ? EyeOff : Eye}
								label={el.hidden ? __('Show', 'blumoon-product-studio') : __('Hide', 'blumoon-product-studio')}
								pressed={el.hidden}
								onClick={() => model.update(el.id, { hidden: !el.hidden }, el.hidden ? __('Show', 'blumoon-product-studio') : __('Hide', 'blumoon-product-studio'))}
							/>
						</li>
					);
				})}
			</ul>
			<Toggle label={__('Show print guides', 'blumoon-product-studio')} checked={model.stage?.showGuides ?? true} onChange={(on) => {
				if (model.stage) {
					model.stage.showGuides = on;
					model.stage.canvas.requestRenderAll();
				}
			}} />
		</div>
	);
}
