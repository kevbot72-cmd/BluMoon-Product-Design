import { current, type Draft } from 'immer';
import { alignOffset, distributeOffsets, rotatedBounds, unionBounds, type AlignMode, type Box } from './geometry.ts';
import { newId } from './ids.ts';
import type { AreaRef, ElementRef, TextMeasurer } from './elements.ts';
import type { Command } from './store.ts';
import type { DesignDocument, Element, TextElement } from './schema/design-document.ts';

/** Element fields a command may change (never id or type). */
export type ElementPatch<T extends Element = Element> = Partial<Omit<T, 'id' | 'type'>>;

function elementsOf(draft: Draft<DesignDocument>, ref: AreaRef): Draft<Element>[] {
	const area = draft.sides[ref.side]?.printAreas[ref.area];
	if (!area) {
		throw new Error(`Unknown print area ${ref.side}/${ref.area}.`);
	}
	return area.elements;
}

export function addElement(ref: AreaRef, element: Element, label = 'Add element'): Command {
	return {
		label,
		recipe: (draft) => {
			elementsOf(draft, ref).push(element);
		},
	};
}

export function updateElement<T extends Element>(ref: ElementRef, patch: ElementPatch<T>, label = 'Edit', coalesceKey?: string): Command {
	return {
		label,
		...(coalesceKey === undefined ? {} : { coalesceKey }),
		recipe: (draft) => {
			const el = elementsOf(draft, ref).find((e) => e.id === ref.id);
			if (el) {
				Object.assign(el, patch);
			}
		},
	};
}

/**
 * Change text content or style and re-measure its box, keeping the box centre
 * where it was (and its rotation), so the text grows evenly in both directions.
 */
export function updateText(ref: ElementRef, patch: ElementPatch<TextElement>, measure: TextMeasurer, label = 'Edit text', coalesceKey?: string): Command {
	return {
		label,
		...(coalesceKey === undefined ? {} : { coalesceKey }),
		recipe: (draft) => {
			const el = elementsOf(draft, ref).find((e) => e.id === ref.id);
			if (el?.type !== 'text') {
				return;
			}
			Object.assign(el, patch);
			const size = measure(el);
			const cx = el.x + el.w / 2;
			const cy = el.y + el.h / 2;
			el.w = size.w;
			el.h = size.h;
			el.x = cx - size.w / 2;
			el.y = cy - size.h / 2;
		},
	};
}

export function removeElements(ref: AreaRef, ids: readonly string[], label = 'Delete'): Command {
	const remove = new Set(ids);
	return {
		label,
		recipe: (draft) => {
			const list = elementsOf(draft, ref);
			for (let i = list.length - 1; i >= 0; i--) {
				if (remove.has(list[i]!.id)) {
					list.splice(i, 1);
				}
			}
		},
	};
}

/** Duplicate elements, offset by `offsetMm`, each placed directly above its original. Returns the new ids. */
export function duplicateElements(ref: AreaRef, ids: readonly string[], offsetMm = 5): { command: Command; ids: string[] } {
	const newIds = ids.map(() => newId());
	return {
		ids: newIds,
		command: {
			label: 'Duplicate',
			recipe: (draft) => {
				const list = elementsOf(draft, ref);
				ids.forEach((id, i) => {
					const index = list.findIndex((e) => e.id === id);
					if (index === -1) {
						return;
					}
					const copy = structuredClone(current(list[index]!)) as Draft<Element>;
					copy.id = newIds[i]!;
					copy.x += offsetMm;
					copy.y += offsetMm;
					delete copy.permissions;
					list.splice(index + 1, 0, copy);
				});
			},
		},
	};
}

export type ReorderTarget = 'front' | 'back' | 'forward' | 'backward' | number;

export function reorderElement(ref: ElementRef, to: ReorderTarget, label = 'Reorder'): Command {
	return {
		label,
		recipe: (draft) => {
			const list = elementsOf(draft, ref);
			const from = list.findIndex((e) => e.id === ref.id);
			if (from === -1) {
				return;
			}
			const last = list.length - 1;
			const target =
				to === 'front' ? last : to === 'back' ? 0 : to === 'forward' ? Math.min(last, from + 1) : to === 'backward' ? Math.max(0, from - 1) : Math.max(0, Math.min(last, to));
			if (target === from) {
				return;
			}
			const [el] = list.splice(from, 1);
			list.splice(target, 0, el!);
		},
	};
}

export function moveElements(ref: AreaRef, ids: readonly string[], dx: number, dy: number, label = 'Move', coalesceKey?: string): Command {
	const move = new Set(ids);
	return {
		label,
		...(coalesceKey === undefined ? {} : { coalesceKey }),
		recipe: (draft) => {
			for (const el of elementsOf(draft, ref)) {
				if (move.has(el.id)) {
					el.x += dx;
					el.y += dy;
				}
			}
		},
	};
}

/**
 * Align elements to the print area, or (with two or more and relativeTo
 * 'selection') to their combined bounds.
 */
export function alignElements(ref: AreaRef, ids: readonly string[], mode: AlignMode, relativeTo: 'area' | 'selection', area: { w: number; h: number }): Command {
	return {
		label: 'Align',
		recipe: (draft) => {
			const selected = elementsOf(draft, ref).filter((e) => ids.includes(e.id));
			const target: Box | null = relativeTo === 'selection' && selected.length > 1 ? unionBounds(selected.map(rotatedBounds)) : { x: 0, y: 0, w: area.w, h: area.h };
			if (!target) {
				return;
			}
			for (const el of selected) {
				const { dx, dy } = alignOffset(el, mode, target);
				el.x += dx;
				el.y += dy;
			}
		},
	};
}

export function distributeElements(ref: AreaRef, ids: readonly string[], axis: 'x' | 'y'): Command {
	return {
		label: 'Distribute',
		recipe: (draft) => {
			const selected = elementsOf(draft, ref).filter((e) => ids.includes(e.id));
			distributeOffsets(selected, axis).forEach(({ dx, dy }, i) => {
				selected[i]!.x += dx;
				selected[i]!.y += dy;
			});
		},
	};
}

/** Replace a side's elements wholesale (clear, apply template). */
export function replaceAreaElements(ref: AreaRef, elements: readonly Element[], label: string): Command {
	return {
		label,
		recipe: (draft) => {
			const area = draft.sides[ref.side]?.printAreas[ref.area];
			if (area) {
				area.elements = elements as Draft<Element>[];
			}
		},
	};
}

export function setProductColor(color: string | null): Command {
	return {
		label: 'Product colour',
		recipe: (draft) => {
			draft.options.productColor = color;
		},
	};
}
