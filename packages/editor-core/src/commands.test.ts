import { describe, expect, it } from 'vitest';
import { addElement, alignElements, distributeElements, duplicateElements, removeElements, reorderElement, transformElements, updateText } from './commands.ts';
import { createDocument } from './document.ts';
import { createShape, createText, isDeletable, isMovable, type TextMeasurer } from './elements.ts';
import { DesignStore } from './store.ts';

const ref = { side: 'front', area: 'pa1' };
const areaSize = { w: 200, h: 100 };
const setup = () => new DesignStore(createDocument({ productId: 1, mode: 'template', sides: [{ id: 'front', printAreas: ['pa1'] }] }));
const ids = (store: DesignStore) => store.doc.sides.front!.printAreas.pa1!.elements.map((e) => e.id);
const els = (store: DesignStore) => store.doc.sides.front!.printAreas.pa1!.elements;
// 2 mm per character wide, 1.2 × size tall: enough to test re-centring.
const measure: TextMeasurer = (t) => ({ w: t.text.length * 2, h: t.font.sizePt * 0.3528 * 1.2 });

describe('commands', () => {
	it('re-measures text around its centre', () => {
		const store = setup();
		const text = createText(areaSize, measure, { text: 'Hi', family: 'Inter', weight: 700, sizePt: 24 });
		store.dispatch(addElement(ref, text));
		const cx = text.x + text.w / 2;
		store.dispatch(updateText({ ...ref, id: text.id }, { text: 'Hello world' }, measure));
		const updated = els(store)[0]!;
		expect(updated.w).toBe(22);
		expect(updated.x + updated.w / 2).toBeCloseTo(cx);
	});

	it('transforms: boxes resize, text scales its font around the new centre', () => {
		const store = setup();
		const shape = { ...createShape(areaSize, 'rect'), x: 0, y: 0, w: 20, h: 10 };
		const text = createText(areaSize, measure, { text: 'Hey', family: 'Inter', weight: 400, sizePt: 20 });
		store.dispatch(addElement(ref, shape));
		store.dispatch(addElement(ref, text));
		store.dispatch(
			transformElements(
				ref,
				[
					{ id: shape.id, cx: 50, cy: 50, w: 40, h: 30, rotation: 370 },
					{ id: text.id, cx: 100, cy: 20, sizePt: 40, rotation: -90 },
				],
				measure,
			),
		);
		const [s, t] = els(store);
		expect(s).toMatchObject({ w: 40, h: 30, x: 30, y: 35, rotation: 10 });
		expect(t!.type === 'text' && t!.font.sizePt).toBe(40);
		expect(t!.x + t!.w / 2).toBeCloseTo(100);
		expect(t!.rotation).toBe(-90);
		// The same absolute target again changes nothing (no compounding during a drag).
		expect(store.dispatch(transformElements(ref, [{ id: text.id, cx: 100, cy: 20, sizePt: 40, rotation: -90 }], measure))).toBe(false);
	});

	it('reorders: front, back, forward, backward, index', () => {
		const store = setup();
		const [a, b, c] = ['rect', 'star', 'heart'].map((s) => createShape(areaSize, s as 'rect'));
		for (const s of [a!, b!, c!]) store.dispatch(addElement(ref, s));
		store.dispatch(reorderElement({ ...ref, id: a!.id }, 'front'));
		expect(ids(store)).toEqual([b!.id, c!.id, a!.id]);
		store.dispatch(reorderElement({ ...ref, id: a!.id }, 'back'));
		expect(ids(store)).toEqual([a!.id, b!.id, c!.id]);
		store.dispatch(reorderElement({ ...ref, id: a!.id }, 'forward'));
		expect(ids(store)).toEqual([b!.id, a!.id, c!.id]);
		store.dispatch(reorderElement({ ...ref, id: a!.id }, 'backward'));
		expect(ids(store)).toEqual([a!.id, b!.id, c!.id]);
		store.dispatch(reorderElement({ ...ref, id: c!.id }, 0));
		expect(ids(store)).toEqual([c!.id, a!.id, b!.id]);
	});

	it('duplicates above the original with an offset and drops template permissions', () => {
		const store = setup();
		const s = { ...createShape(areaSize, 'rect'), permissions: { lock: 'none' as const, deletable: false, editableText: true, replaceableImage: true, required: false, dimmed: false, dimmedInPrint: false } };
		store.dispatch(addElement(ref, s));
		const { command, ids: newIds } = duplicateElements(ref, [s.id]);
		store.dispatch(command);
		expect(ids(store)).toEqual([s.id, newIds[0]]);
		expect(els(store)[1]!.x).toBe(s.x + 5);
		expect(els(store)[1]!.permissions).toBeUndefined();
	});

	it('removes', () => {
		const store = setup();
		const s = createShape(areaSize, 'rect');
		store.dispatch(addElement(ref, s));
		store.dispatch(removeElements(ref, [s.id]));
		expect(ids(store)).toEqual([]);
	});

	it('aligns to the area and to the selection', () => {
		const store = setup();
		const a = { ...createShape(areaSize, 'rect'), x: 10, y: 10, w: 20, h: 20 };
		const b = { ...createShape(areaSize, 'rect'), x: 50, y: 40, w: 10, h: 10 };
		store.dispatch(addElement(ref, a));
		store.dispatch(addElement(ref, b));
		store.dispatch(alignElements(ref, [a.id], 'right', 'area', areaSize));
		expect(els(store)[0]!.x).toBe(180);
		store.dispatch(alignElements(ref, [a.id, b.id], 'top', 'selection', areaSize));
		expect(els(store).map((e) => e.y)).toEqual([10, 10]);
	});

	it('distributes with equal gaps', () => {
		const store = setup();
		const make = (x: number) => ({ ...createShape(areaSize, 'rect'), x, y: 0, w: 10, h: 10 });
		const shapes = [make(0), make(15), make(90)];
		for (const s of shapes) store.dispatch(addElement(ref, s));
		store.dispatch(distributeElements(ref, shapes.map((s) => s.id), 'x'));
		expect(els(store).map((e) => e.x)).toEqual([0, 45, 90]);
	});

	it('respects locks and template permissions in helpers', () => {
		const s = createShape(areaSize, 'rect');
		expect(isMovable(s) && isDeletable(s)).toBe(true);
		expect(isMovable({ ...s, locks: { position: true } })).toBe(false);
		expect(isDeletable({ ...s, locks: { all: true } })).toBe(false);
	});
});
