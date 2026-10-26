/** @jsxImportSource preact */
import { render } from 'preact';
import { __ } from '@wordpress/i18n';
import { createDocument, fitsShape } from '@bps/editor-core';
import { Api, type ApiConfig } from './api.ts';
import { sideRuntimes, type Bootstrap } from './bootstrap.ts';
import { bindShortcuts, trapFocus } from './keyboard.ts';
import { clipartIds, EditorModel } from './model.ts';
import { EditorShell } from './ui/shell.tsx';
import './editor.css';

export interface MountOptions extends ApiConfig {
	productId: number;
	variationId: number;
	onClose: () => void;
}

/**
 * Open the editor inside `root` (the full-screen overlay). Resolves with a
 * function that tears it down. The editor's model is exposed on
 * window.bps.editor for extensions and tests.
 */
export async function mountEditor(root: HTMLElement, options: MountOptions): Promise<() => void> {
	const api = new Api(options);
	const { data: bootstrap } = await api.get<Bootstrap>('editor/bootstrap', { product: options.productId, variation: options.variationId });
	const sides = sideRuntimes(bootstrap);
	const shape = {
		productId: bootstrap.product.id,
		variationId: bootstrap.product.variationId,
		mode: bootstrap.mode,
		blueprintId: bootstrap.blueprintId,
		sides: sides.map((s) => ({ id: s.id, printAreas: s.layout.areas.map((a) => a.id) })),
	};
	const doc = createDocument(shape);
	if (bootstrap.defaultColor) {
		doc.options.productColor = bootstrap.colors.find((c) => c.id === bootstrap.defaultColor)?.hex ?? null;
	}
	const model = new EditorModel(bootstrap, sides, api, doc);

	await model.loadUploads();
	if (bootstrap.settings.autosave) {
		const saved = await model.autosave.load();
		if (saved && fitsShape(saved.doc, shape) && Object.values(saved.doc.sides).some((s) => Object.values(s.printAreas).some((a) => a.elements.length > 0))) {
			await model.loadClipart(clipartIds(saved.doc));
			model.restoreOffer.value = saved;
		}
	}

	const close = (): void => {
		void model.autosave.saveNow(model.session.doc);
		options.onClose();
	};
	root.classList.add('bps-editor');
	root.setAttribute('role', 'dialog');
	root.setAttribute('aria-modal', 'true');
	root.setAttribute('aria-label', __('Product designer', 'blumoon-product-studio'));
	render(<EditorShell model={model} onClose={close} />, root);
	const unbindKeys = bindShortcuts(model);
	const untrap = trapFocus(root);
	root.querySelector<HTMLElement>('#bps-close')?.focus();

	const globals = window as unknown as { bps?: { editor?: unknown } };
	globals.bps = { ...globals.bps, editor: model };

	return () => {
		unbindKeys();
		untrap();
		render(null, root);
		if (globals.bps?.editor === model) {
			delete globals.bps.editor;
		}
	};
}
