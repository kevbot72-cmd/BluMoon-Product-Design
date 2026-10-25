/** Minimal typed event emitter. */
export class Emitter<Events extends Record<string, unknown>> {
	readonly #handlers = new Map<keyof Events, Set<(payload: never) => void>>();

	on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): () => void {
		let set = this.#handlers.get(event);
		if (!set) {
			set = new Set();
			this.#handlers.set(event, set);
		}
		set.add(handler);
		return () => { this.off(event, handler); };
	}

	off<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): void {
		this.#handlers.get(event)?.delete(handler);
	}

	emit<K extends keyof Events>(event: K, payload: Events[K]): void {
		for (const handler of this.#handlers.get(event) ?? []) {
			(handler as (payload: Events[K]) => void)(payload);
		}
	}
}
