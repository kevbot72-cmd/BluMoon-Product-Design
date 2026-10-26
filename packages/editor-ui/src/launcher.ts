/**
 * Product page launcher (a few KB). Opens the editor as a full-screen overlay
 * when a Customize button is clicked or the URL ends in #customize; the
 * browser Back button closes it. The editor itself is a lazy chunk.
 */
import { __ } from '@wordpress/i18n';
import './launcher.css';

interface LauncherData {
	restRoot: string;
	nonce: string;
}

const data = (window as unknown as { bpsLauncher?: LauncherData }).bpsLauncher;
const HASH = '#customize';
let overlay: HTMLElement | null = null;
let teardown: (() => void) | null = null;
let opener: HTMLElement | null = null;

function variationId(button: HTMLElement): number {
	const form = button.closest('form');
	const input = form?.querySelector<HTMLInputElement>('input[name="variation_id"]');
	return input ? Number(input.value) || 0 : 0;
}

async function open(button: HTMLElement, pushHistory: boolean): Promise<void> {
	if (overlay || !data) return;
	opener = button;
	if (pushHistory) {
		history.pushState({ bpsEditor: true }, '', location.pathname + location.search + HASH);
	}
	// Closing while the chunk loads clears `overlay`; `host` tells us whether we're still current.
	const host = document.createElement('div');
	overlay = host;
	overlay.className = 'bps-overlay';
	overlay.innerHTML = `<div class="bps-overlay__loading" role="status"><span class="bps-overlay__spinner"></span>${__('Opening the designer…', 'blumoon-product-studio')}</div>`;
	document.body.appendChild(overlay);
	document.documentElement.classList.add('bps-editor-open');
	try {
		const { mountEditor } = await import('./editor.tsx');
		if (overlay !== host) return;
		host.innerHTML = '';
		teardown = await mountEditor(host, { ...data, productId: Number(button.dataset.bpsCustomize), variationId: variationId(button), onClose: requestClose });
	} catch (error) {
		console.error('[bps] the designer failed to open', error);
		const message = error instanceof Error ? error.message : __('The designer could not be opened.', 'blumoon-product-studio');
		if (overlay === host) {
			host.innerHTML = '';
			const box = document.createElement('div');
			box.className = 'bps-overlay__loading';
			box.setAttribute('role', 'alert');
			box.textContent = message;
			const back = document.createElement('button');
			back.type = 'button';
			back.textContent = __('Back to the product', 'blumoon-product-studio');
			back.addEventListener('click', requestClose);
			box.appendChild(back);
			host.appendChild(box);
		}
	}
}

/** Close via history so Back and the close button behave the same. */
function requestClose(): void {
	if (location.hash === HASH && (history.state as { bpsEditor?: boolean } | null)?.bpsEditor) {
		history.back();
	} else {
		if (location.hash === HASH) {
			history.replaceState(null, '', location.pathname + location.search);
		}
		close();
	}
}

function close(): void {
	teardown?.();
	teardown = null;
	overlay?.remove();
	overlay = null;
	document.documentElement.classList.remove('bps-editor-open');
	opener?.focus();
}

document.addEventListener('click', (event) => {
	const button = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-bps-customize]');
	if (button) {
		event.preventDefault();
		void open(button, true);
	}
});

window.addEventListener('popstate', () => {
	if (overlay && location.hash !== HASH) {
		close();
	}
});

// A "#customize" link on the page itself.
window.addEventListener('hashchange', () => {
	const button = document.querySelector<HTMLElement>('[data-bps-customize]');
	if (!overlay && location.hash === HASH && button) {
		void open(button, false);
	}
});

// Deep link: /product/x/#customize or ?customize=1 opens straight away.
if (location.hash === HASH || new URLSearchParams(location.search).get('customize') === '1') {
	const button = document.querySelector<HTMLElement>('[data-bps-customize]');
	if (button) {
		void open(button, false);
	}
}
