import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer';
import type { DesignDocument } from './schema/design-document.ts';

enablePatches();

/**
 * A change to the design document. Every mutation goes through a command
 * (ADR-0005), so history, autosave and the canvas all see the same thing.
 */
export interface Command {
	/** Shown in history and announced to screen readers, e.g. "Move text". */
	label: string;
	/**
	 * Commands with the same key merge into one history entry while the entry
	 * is open (a drag, a slider scrub). The entry closes on commit().
	 */
	coalesceKey?: string;
	recipe: (draft: Draft<DesignDocument>) => void;
}

export type ChangeSource = 'command' | 'undo' | 'redo' | 'load';

export interface StoreChange {
	source: ChangeSource;
	label: string;
	/** 'live' while a gesture is in progress, 'commit' when it is final. */
	phase: 'live' | 'commit';
	patches: readonly Patch[];
}

interface Entry {
	label: string;
	patches: Patch[];
	inverse: Patch[];
	key: string | undefined;
	open: boolean;
}

export class DesignStore {
	#doc: DesignDocument;
	#past: Entry[] = [];
	#future: Entry[] = [];
	readonly #listeners = new Set<(change: StoreChange) => void>();

	constructor(
		doc: DesignDocument,
		private readonly limit = 100,
	) {
		this.#doc = doc;
	}

	get doc(): DesignDocument {
		return this.#doc;
	}

	get canUndo(): boolean {
		return this.#past.length > 0;
	}

	get canRedo(): boolean {
		return this.#future.length > 0;
	}

	/** Labels of undoable entries, oldest first. */
	get history(): string[] {
		return this.#past.map((entry) => entry.label);
	}

	/**
	 * Apply a command. Returns false when it changed nothing.
	 * Pass phase 'live' for intermediate gesture steps; they stay coalesced
	 * until a 'commit' dispatch or commit() with the same key.
	 */
	dispatch(command: Command, phase: 'live' | 'commit' = 'commit'): boolean {
		const [next, patches, inverse] = produceWithPatches(this.#doc, command.recipe);
		const last = this.#past.at(-1);
		const merging = command.coalesceKey !== undefined && last?.open === true && last.key === command.coalesceKey;

		if (patches.length === 0) {
			if (phase === 'commit' && merging) {
				last.label = command.label;
				this.#close(last, command.label);
			}
			return false;
		}

		this.#doc = next;
		if (merging) {
			// The finished gesture's label wins ("Move" rather than the first live step's).
			last.label = command.label;
			last.patches.push(...patches);
			last.inverse = [...inverse, ...last.inverse];
			last.open = phase === 'live';
		} else {
			this.#closeOpen();
			this.#past.push({ label: command.label, patches, inverse, key: command.coalesceKey, open: phase === 'live' && command.coalesceKey !== undefined });
			if (this.#past.length > this.limit) {
				this.#past.shift();
			}
		}
		this.#future = [];
		this.#emit({ source: 'command', label: command.label, phase, patches });
		return true;
	}

	/** End the gesture with this key, so the next command starts a new history entry. */
	commit(key: string): void {
		const last = this.#past.at(-1);
		if (last?.open === true && last.key === key) {
			this.#close(last, last.label);
		}
	}

	undo(): boolean {
		this.#closeOpen();
		const entry = this.#past.pop();
		if (!entry) {
			return false;
		}
		this.#doc = applyPatches(this.#doc, entry.inverse);
		this.#future.push(entry);
		this.#emit({ source: 'undo', label: entry.label, phase: 'commit', patches: entry.inverse });
		return true;
	}

	redo(): boolean {
		const entry = this.#future.pop();
		if (!entry) {
			return false;
		}
		this.#doc = applyPatches(this.#doc, entry.patches);
		this.#past.push(entry);
		this.#emit({ source: 'redo', label: entry.label, phase: 'commit', patches: entry.patches });
		return true;
	}

	/** Replace the document (restore, template apply). Clears history unless told not to. */
	load(doc: DesignDocument, label = 'Load design', keepHistory = false): void {
		this.#doc = doc;
		if (!keepHistory) {
			this.#past = [];
			this.#future = [];
		}
		this.#emit({ source: 'load', label, phase: 'commit', patches: [{ op: 'replace', path: [], value: doc }] });
	}

	subscribe(listener: (change: StoreChange) => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	#closeOpen(): void {
		const last = this.#past.at(-1);
		if (last?.open === true) {
			this.#close(last, last.label);
		}
	}

	#close(entry: Entry, label: string): void {
		entry.open = false;
		this.#emit({ source: 'command', label, phase: 'commit', patches: [] });
	}

	#emit(change: StoreChange): void {
		for (const listener of this.#listeners) {
			listener(change);
		}
	}
}
