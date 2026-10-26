/** @jsxImportSource preact */
import { h, type ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { IconNode } from 'lucide';

/** Inline Lucide icon. Decorative unless a label is given. */
export function Icon({ icon, size = 20, label }: { icon: IconNode; size?: number; label?: string }) {
	return (
		<svg
			class="bps-icon"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width={1.75}
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden={label ? undefined : 'true'}
			role={label ? 'img' : undefined}
			aria-label={label}
			focusable="false"
		>
			{icon.map(([tag, attrs], i) => h(tag, { key: i, ...attrs }))}
		</svg>
	);
}

export function IconButton({
	icon,
	label,
	onClick,
	disabled,
	pressed,
	variant = 'ghost',
	id,
}: {
	icon: IconNode;
	label: string;
	onClick: () => void;
	disabled?: boolean;
	pressed?: boolean;
	variant?: 'ghost' | 'solid';
	id?: string;
}) {
	return (
		<button type="button" id={id} class={`bps-icon-btn bps-icon-btn--${variant}`} aria-label={label} title={label} onClick={onClick} disabled={disabled} aria-pressed={pressed}>
			<Icon icon={icon} />
		</button>
	);
}

/**
 * Number field that edits on Enter/blur and steps with the arrow keys.
 * Live arrow-key steps share a coalesce key so they become one undo step.
 */
export function NumberField({
	label,
	value,
	unit,
	step = 1,
	min,
	max,
	precision = 1,
	onChange,
	onCommit,
}: {
	label: string;
	value: number;
	unit?: string;
	step?: number;
	min?: number;
	max?: number;
	precision?: number;
	onChange: (value: number, live: boolean) => void;
	onCommit?: () => void;
}) {
	const [text, setText] = useState(value.toFixed(precision));
	const focused = useRef(false);
	useEffect(() => {
		if (!focused.current) setText(value.toFixed(precision));
	}, [value, precision]);
	const clamp = (v: number): number => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
	const apply = (): void => {
		const parsed = Number.parseFloat(text.replace(',', '.'));
		if (Number.isFinite(parsed) && Math.abs(parsed - value) > 1e-9) {
			onChange(clamp(parsed), false);
		} else {
			setText(value.toFixed(precision));
		}
	};
	return (
		<label class="bps-field">
			<span class="bps-field__label">{label}</span>
			<input
				class="bps-field__input"
				inputMode="decimal"
				value={text}
				onFocus={() => {
					focused.current = true;
				}}
				onBlur={() => {
					focused.current = false;
					apply();
					onCommit?.();
				}}
				onInput={(e) => {
					setText(e.currentTarget.value);
				}}
				onKeyDown={(e) => {
					if (e.key === 'Enter') {
						apply();
						onCommit?.();
					} else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
						e.preventDefault();
						const next = clamp(value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1));
						setText(next.toFixed(precision));
						onChange(next, true);
					}
				}}
				onKeyUp={(e) => {
					if (e.key === 'ArrowUp' || e.key === 'ArrowDown') onCommit?.();
				}}
			/>
			{unit && <span class="bps-field__unit">{unit}</span>}
		</label>
	);
}

const SWATCHES = ['#1a1a1a', '#ffffff', '#6c4be0', '#d64545', '#e8833a', '#f2c94c', '#2f9e6b', '#2d7dd2', '#8a8f98', '#c2a878'];

/** Colour picker: preset swatches plus the system picker. */
export function ColorField({ label, value, onChange, allowNone }: { label: string; value: string | null; onChange: (value: string | null) => void; allowNone?: boolean }) {
	return (
		<fieldset class="bps-color">
			<legend class="bps-field__label">{label}</legend>
			<div class="bps-color__row">
				{allowNone && (
					<button type="button" class={`bps-swatch bps-swatch--none${value === null ? ' is-active' : ''}`} aria-label="None" aria-pressed={value === null} onClick={() => onChange(null)} />
				)}
				{SWATCHES.map((c) => (
					<button type="button" key={c} class={`bps-swatch${value?.toLowerCase() === c ? ' is-active' : ''}`} style={{ background: c }} aria-label={c} aria-pressed={value?.toLowerCase() === c} onClick={() => onChange(c)} />
				))}
				<input class="bps-color__custom" type="color" aria-label={`${label}: custom`} value={value ?? '#000000'} onChange={(e) => onChange(e.currentTarget.value)} />
			</div>
		</fieldset>
	);
}

export function Section({ title, children }: { title: string; children: ComponentChildren }) {
	return (
		<section class="bps-section">
			<h3 class="bps-section__title">{title}</h3>
			{children}
		</section>
	);
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
	return (
		<label class="bps-toggle">
			<input type="checkbox" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
			<span>{label}</span>
		</label>
	);
}
