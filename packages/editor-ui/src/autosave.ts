import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import { parseDocument, type DesignDocument } from '@bps/editor-core';

export interface Saved {
	savedAt: number;
	doc: DesignDocument;
}

/**
 * Local autosave in IndexedDB, one slot per product and mode. Storage can be
 * unavailable (private windows, blocked site data); every call fails soft.
 */
export class Autosave {
	readonly #store: UseStore | null;
	#timer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		private readonly key: string,
		private readonly delayMs = 800,
	) {
		let store: UseStore | null;
		try {
			store = createStore('bps-editor', 'autosave');
		} catch {
			store = null;
		}
		this.#store = store;
	}

	static key(productId: number, mode: string): string {
		return `v1:${productId}:${mode}`;
	}

	/** Save after a short pause in editing. */
	schedule(doc: DesignDocument): void {
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => {
			void this.saveNow(doc);
		}, this.delayMs);
	}

	async saveNow(doc: DesignDocument): Promise<void> {
		if (!this.#store) return;
		try {
			await set(this.key, { savedAt: Date.now(), doc } satisfies Saved, this.#store);
		} catch {
			// Quota or blocked storage: autosave is a convenience.
		}
	}

	/** The saved design, if it is still a valid document. */
	async load(): Promise<Saved | null> {
		if (!this.#store) return null;
		try {
			const saved = await get<{ savedAt?: unknown; doc?: unknown }>(this.key, this.#store);
			const doc = saved ? parseDocument(saved.doc) : null;
			return doc && typeof saved?.savedAt === 'number' ? { savedAt: saved.savedAt, doc } : null;
		} catch {
			return null;
		}
	}

	async clear(): Promise<void> {
		clearTimeout(this.#timer);
		if (!this.#store) return;
		try {
			await del(this.key, this.#store);
		} catch {
			// Ignore.
		}
	}
}
