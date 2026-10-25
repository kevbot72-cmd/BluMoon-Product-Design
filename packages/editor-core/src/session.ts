import { Emitter } from './events.ts';
import { areaElements, type AreaRef } from './elements.ts';
import { DesignStore, type ChangeSource, type Command } from './store.ts';
import type { DesignDocument } from './schema/design-document.ts';

export interface EditorEvents extends Record<string, unknown> {
	/** The document changed. `sides` lists the sides that were touched. */
	'design:changed': { source: ChangeSource; label: string; phase: 'live' | 'commit'; sides: readonly string[] };
	'selection:changed': { ids: readonly string[] };
	'side:changed': { side: string; area: string };
	'history:changed': { canUndo: boolean; canRedo: boolean };
}

/**
 * Everything one open editor shares: the document store, which side and
 * print area is active, and the selection. UI state (zoom, panels) lives in
 * the UI layer.
 */
export class EditorSession {
	readonly store: DesignStore;
	readonly events = new Emitter<EditorEvents>();
	#active: AreaRef;
	#selection: readonly string[] = [];

	constructor(doc: DesignDocument, active: AreaRef) {
		this.store = new DesignStore(doc);
		this.#active = active;
		this.store.subscribe((change) => {
			const sides = new Set<string>();
			for (const patch of change.patches) {
				if (patch.path.length === 0) {
					Object.keys(this.store.doc.sides).forEach((side) => sides.add(side));
				} else if (patch.path[0] === 'sides' && typeof patch.path[1] === 'string') {
					sides.add(patch.path[1]);
				}
			}
			this.events.emit('design:changed', { source: change.source, label: change.label, phase: change.phase, sides: [...sides] });
			this.events.emit('history:changed', { canUndo: this.store.canUndo, canRedo: this.store.canRedo });
			this.#pruneSelection();
		});
	}

	get doc(): DesignDocument {
		return this.store.doc;
	}

	get active(): AreaRef {
		return this.#active;
	}

	get selection(): readonly string[] {
		return this.#selection;
	}

	dispatch(command: Command, phase: 'live' | 'commit' = 'commit'): boolean {
		return this.store.dispatch(command, phase);
	}

	setActive(active: AreaRef): void {
		if (active.side === this.#active.side && active.area === this.#active.area) {
			return;
		}
		this.#active = active;
		this.select([]);
		this.events.emit('side:changed', { side: active.side, area: active.area });
	}

	select(ids: readonly string[]): void {
		if (ids.length === this.#selection.length && ids.every((id, i) => id === this.#selection[i])) {
			return;
		}
		this.#selection = [...ids];
		this.events.emit('selection:changed', { ids: this.#selection });
	}

	/** Drop ids that no longer exist (after delete, undo of add, …). */
	#pruneSelection(): void {
		const present = new Set(areaElements(this.doc, this.#active).map((el) => el.id));
		const kept = this.#selection.filter((id) => present.has(id));
		if (kept.length !== this.#selection.length) {
			this.select(kept);
		}
	}
}
