import { describe, expect, it, vi } from 'vitest';
import { addElement, removeElements } from './commands.ts';
import { createDocument } from './document.ts';
import { createShape } from './elements.ts';
import { EditorSession } from './session.ts';

const shape = { productId: 1, mode: 'template' as const, sides: [{ id: 'front', printAreas: ['pa1'] }, { id: 'back', printAreas: ['pa1'] }] };

describe('EditorSession', () => {
	it('reports which sides changed', () => {
		const session = new EditorSession(createDocument(shape), { side: 'front', area: 'pa1' });
		const changed = vi.fn();
		session.events.on('design:changed', changed);
		session.dispatch(addElement({ side: 'back', area: 'pa1' }, createShape({ w: 50, h: 50 }, 'rect')));
		expect(changed).toHaveBeenCalledWith(expect.objectContaining({ sides: ['back'], phase: 'commit', source: 'command' }));
	});

	it('drops deleted elements from the selection', () => {
		const session = new EditorSession(createDocument(shape), { side: 'front', area: 'pa1' });
		const s = createShape({ w: 50, h: 50 }, 'rect');
		session.dispatch(addElement(session.active, s));
		session.select([s.id]);
		const selection = vi.fn();
		session.events.on('selection:changed', selection);
		session.dispatch(removeElements(session.active, [s.id]));
		expect(session.selection).toEqual([]);
		expect(selection).toHaveBeenCalledWith({ ids: [] });
	});

	it('clears selection when the side changes', () => {
		const session = new EditorSession(createDocument(shape), { side: 'front', area: 'pa1' });
		const s = createShape({ w: 50, h: 50 }, 'rect');
		session.dispatch(addElement(session.active, s));
		session.select([s.id]);
		session.setActive({ side: 'back', area: 'pa1' });
		expect(session.selection).toEqual([]);
	});
});
