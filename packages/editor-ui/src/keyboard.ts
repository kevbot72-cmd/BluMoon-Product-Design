import type { EditorModel } from './model.ts';

/** Whether a key event is aimed at a form field or inline text editing. */
function typing(model: EditorModel, event: KeyboardEvent): boolean {
	const target = event.target as HTMLElement | null;
	if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) {
		return true;
	}
	return model.stage?.editingText ?? false;
}

/**
 * Editor shortcuts (listed in the Help dialog). Returns a function that
 * removes the listeners.
 */
export function bindShortcuts(model: EditorModel): () => void {
	const keydown = (event: KeyboardEvent): void => {
		if (typing(model, event)) {
			return;
		}
		const mod = event.ctrlKey || event.metaKey;
		const key = event.key.toLowerCase();
		let handled = true;
		// Cropping is modal: Enter applies, Esc cancels, zoom keys still work, everything else waits.
		if (model.cropping.value && !(!mod && ['+', '=', '-', '0'].includes(key))) {
			if (key === 'enter') model.applyCrop();
			else if (key === 'escape') model.cancelCrop();
			event.preventDefault();
			return;
		}
		if (mod && key === 'z' && !event.shiftKey) model.undo();
		else if (mod && ((key === 'z' && event.shiftKey) || key === 'y')) model.redo();
		else if (mod && key === 'c') model.copy();
		else if (mod && key === 'v') model.paste();
		else if (mod && key === 'd') model.duplicate();
		else if (mod && key === 'a') model.selectAll();
		else if (!mod && (key === 'delete' || key === 'backspace')) model.remove();
		else if (!mod && key.startsWith('arrow')) {
			const step = event.shiftKey ? 10 : 1;
			model.nudge(key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0, key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0);
		} else if (!mod && (key === '+' || key === '=')) model.stage?.zoomBy(1.25);
		else if (!mod && key === '-') model.stage?.zoomBy(1 / 1.25);
		else if (!mod && key === '0') model.stage?.fit();
		else if (!mod && key === '?') model.shortcutsOpen.value = true;
		else if (key === 'escape') {
			if (model.shortcutsOpen.value) model.shortcutsOpen.value = false;
			else if (model.drawing.value.enabled) model.setDrawing({ enabled: false });
			else if (model.selection.value.length > 0) model.session.select([]);
			else if (model.panel.value) model.panel.value = null;
			else handled = false;
		} else handled = false;
		if (handled) {
			event.preventDefault();
		}
	};
	const keyup = (event: KeyboardEvent): void => {
		if (event.key.startsWith('Arrow')) {
			model.endNudge();
		}
	};
	const paste = (event: ClipboardEvent): void => {
		const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
		if (files.length > 0 && !typing(model, event as unknown as KeyboardEvent)) {
			event.preventDefault();
			void model.uploadFiles(files);
		}
	};
	// On window, not the overlay: after inline text editing focus falls back to <body>.
	window.addEventListener('keydown', keydown);
	window.addEventListener('keyup', keyup);
	window.addEventListener('paste', paste);
	return () => {
		window.removeEventListener('keydown', keydown);
		window.removeEventListener('keyup', keyup);
		window.removeEventListener('paste', paste);
	};
}

/** Keep Tab focus inside the open editor dialog. */
export function trapFocus(root: HTMLElement): () => void {
	const keydown = (event: KeyboardEvent): void => {
		if (event.key !== 'Tab') return;
		const focusable = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (!first || !last) return;
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	};
	root.addEventListener('keydown', keydown);
	return () => root.removeEventListener('keydown', keydown);
}
