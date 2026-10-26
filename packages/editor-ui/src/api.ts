/** Minimal client for /wp-json/bps/v1. */

export interface ApiConfig {
	restRoot: string;
	/** REST nonce for logged-in shoppers; empty for guests. */
	nonce: string;
}

export class ApiError extends Error {
	constructor(
		message: string,
		readonly code: string,
		readonly status: number,
	) {
		super(message);
	}
}

export interface Upload {
	id: string;
	kind: 'image' | 'svg';
	mime: string;
	width: number;
	height: number;
	bytes: number;
	previewUrl: string;
	createdAt: string;
}

export interface Clipart {
	id: number;
	title: string;
	mime: string;
	url: string;
	thumb: string;
	width: number;
	height: number;
}

export class Api {
	constructor(private readonly config: ApiConfig) {}

	url(path: string, query: Record<string, string | number> = {}): string {
		const route = 'bps/v1/' + path.replace(/^\//, '');
		// Sites without pretty permalinks have a root like "https://shop/?rest_route=/".
		const root = this.config.restRoot;
		const url = new URL(root.includes('rest_route=') ? root + route : root.replace(/\/?$/, '/') + route, window.location.href);
		for (const [key, value] of Object.entries(query)) {
			url.searchParams.set(key, String(value));
		}
		return url.toString();
	}

	headers(): Record<string, string> {
		// The custom header lets guests write (it can't be sent cross-site); the nonce authenticates users.
		return this.config.nonce ? { 'X-WP-Nonce': this.config.nonce, 'X-BPS-Request': '1' } : { 'X-BPS-Request': '1' };
	}

	// T documents the route's response shape; the server is the source of truth.
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
	async get<T>(path: string, query: Record<string, string | number> = {}): Promise<{ data: T; headers: Headers }> {
		const response = await fetch(this.url(path, query), { headers: this.headers(), credentials: 'same-origin' });
		return { data: await this.#parse<T>(response), headers: response.headers };
	}

	/** Upload a file with progress; abort with the signal. */
	upload(file: File, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<Upload> {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open('POST', this.url('uploads'));
			xhr.withCredentials = true;
			for (const [name, value] of Object.entries(this.headers())) {
				xhr.setRequestHeader(name, value);
			}
			xhr.upload.onprogress = (e) => {
				if (e.lengthComputable) onProgress(e.loaded / e.total);
			};
			xhr.onload = () => {
				let body: unknown = null;
				try {
					body = JSON.parse(xhr.responseText);
				} catch {
					// Not JSON: reported below.
				}
				if (xhr.status >= 200 && xhr.status < 300) {
					resolve(body as Upload);
				} else {
					const err = (body ?? {}) as { message?: string; code?: string };
					reject(new ApiError(err.message ?? `Upload failed (${xhr.status}).`, err.code ?? 'http_error', xhr.status));
				}
			};
			xhr.onerror = () => {
				reject(new ApiError('The upload could not reach the store. Check your connection and try again.', 'network', 0));
			};
			signal?.addEventListener('abort', () => {
				xhr.abort();
				reject(new ApiError('Upload cancelled.', 'aborted', 0));
			});
			const form = new FormData();
			form.append('file', file);
			xhr.send(form);
		});
	}

	async #parse<T>(response: Response): Promise<T> {
		const body = (await response.json().catch(() => null)) as unknown;
		if (!response.ok) {
			const err = (body ?? {}) as { message?: string; code?: string };
			throw new ApiError(err.message ?? `Request failed (${response.status}).`, err.code ?? 'http_error', response.status);
		}
		return body as T;
	}
}
