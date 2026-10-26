/** Decoded images by URL, so rebuilding an element never re-downloads it. */
export class ImageCache {
	readonly #images = new Map<string, Promise<HTMLImageElement>>();
	readonly #ready = new Map<string, HTMLImageElement>();

	load(url: string): Promise<HTMLImageElement> {
		let pending = this.#images.get(url);
		if (!pending) {
			pending = new Promise<HTMLImageElement>((resolve, reject) => {
				const img = new Image();
				// Same-origin in practice; keeps the canvas exportable if a CDN serves media.
				img.crossOrigin = 'anonymous';
				img.decoding = 'async';
				img.onload = () => {
					this.#ready.set(url, img);
					resolve(img);
				};
				img.onerror = () => {
					this.#images.delete(url);
					reject(new Error(`Image failed to load: ${url}`));
				};
				img.src = url;
			});
			this.#images.set(url, pending);
		}
		return pending;
	}

	/** The image if it is already decoded. */
	get(url: string): HTMLImageElement | undefined {
		return this.#ready.get(url);
	}
}
