import { describe, expect, it, vi } from 'vitest';
import { addElement, moveElements, updateElement } from './commands.ts';
import { createDocument } from './document.ts';
import { createShape } from './elements.ts';
import { DesignStore } from './store.ts';

const area = { side: 'front', area: 'pa1' };
const doc = () => createDocument({ productId: 1, mode: 'template', sides: [{ id: 'front', printAreas: ['pa1'] }] });
const elements = (store: DesignStore) => store.doc.sides.front!.printAreas.pa1!.elements;

describe('DesignStore', () => {
	it('undoes and redoes 50 steps exactly (Phase 2 acceptance)', () => {
		const store = new DesignStore(doc());
		const shape = createShape({ w: 100, h: 100 }, 'rect');
		store.dispatch(addElement(area, shape));
		const snapshots = [store.doc];
		for (let i = 1; i <= 50; i++) {
			store.dispatch(updateElement({ ...area, id: shape.id }, { x: i, rotation: i % 360 }));
			snapshots.push(store.doc);
		}
		for (let i = 50; i > 0; i--) {
			expect(store.undo()).toBe(true);
			expect(store.doc).toEqual(snapshots[i - 1]);
		}
		for (let i = 1; i <= 50; i++) {
			expect(store.redo()).toBe(true);
			expect(store.doc).toEqual(snapshots[i]);
		}
		expect(store.canRedo).toBe(false);
	});

	it('caps history at the limit, dropping the oldest entries', () => {
		const store = new DesignStore(doc(), 100);
		const shape = createShape({ w: 100, h: 100 }, 'rect');
		store.dispatch(addElement(area, shape));
		for (let i = 0; i < 150; i++) {
			store.dispatch(updateElement({ ...area, id: shape.id }, { x: i + 1 }));
		}
		expect(store.history).toHaveLength(100);
		while (store.undo());
		// The add and the first 50 moves fell off; the shape is still there at x = 50.
		expect(elements(store)[0]!.x).toBe(50);
	});

	it('coalesces a drag into one history entry', () => {
		const store = new DesignStore(doc());
		const shape = createShape({ w: 100, h: 100 }, 'rect');
		store.dispatch(addElement(area, shape));
		const startX = shape.x;
		for (let i = 0; i < 20; i++) {
			store.dispatch(moveElements(area, [shape.id], 1, 0, 'Move', 'drag-1'), 'live');
		}
		store.commit('drag-1');
		store.dispatch(moveElements(area, [shape.id], 1, 0, 'Move', 'drag-2'), 'live');
		store.commit('drag-2');

		expect(store.history).toEqual(['Add element', 'Move', 'Move']);
		store.undo();
		expect(elements(store)[0]!.x).toBe(startX + 20);
		store.undo();
		expect(elements(store)[0]!.x).toBe(startX);
	});

	it('ignores commands that change nothing', () => {
		const store = new DesignStore(doc());
		expect(store.dispatch(moveElements(area, ['missing'], 1, 1))).toBe(false);
		expect(store.canUndo).toBe(false);
	});

	it('clears redo after a new command', () => {
		const store = new DesignStore(doc());
		store.dispatch(addElement(area, createShape({ w: 100, h: 100 }, 'rect')));
		store.undo();
		store.dispatch(addElement(area, createShape({ w: 100, h: 100 }, 'star')));
		expect(store.canRedo).toBe(false);
	});

	it('notifies listeners with phase and source', () => {
		const store = new DesignStore(doc());
		const listener = vi.fn();
		store.subscribe(listener);
		const shape = createShape({ w: 100, h: 100 }, 'rect');
		store.dispatch(addElement(area, shape));
		store.dispatch(moveElements(area, [shape.id], 1, 0, 'Move', 'k'), 'live');
		store.commit('k');
		store.undo();
		expect(listener.mock.calls.map((call) => { const c = call[0] as { source: string; phase: string }; return `${c.source}:${c.phase}`; })).toEqual([
			'command:commit',
			'command:live',
			'command:commit',
			'undo:commit',
		]);
	});

	it('produces immutable snapshots', () => {
		const store = new DesignStore(doc());
		store.dispatch(addElement(area, createShape({ w: 100, h: 100 }, 'rect')));
		expect(Object.isFrozen(store.doc)).toBe(true);
	});
});
