import { PrintArea, sideLayout } from '@bps/editor-core';
import type { SideRuntime } from '@bps/editor-canvas';

/** GET /bps/v1/editor/bootstrap (see EditorBootstrap.php). */
export interface Bootstrap {
	product: { id: number; variationId: number; name: string; price: number; url: string };
	currency: { code: string; symbol: string; decimals: number; decimalSeparator: string; thousandSeparator: string; position: string };
	mode: 'template' | 'gallery';
	modes: ('template' | 'gallery')[];
	blueprintId: number | null;
	sides: BootstrapSide[];
	colors: { id: string; name: string; hex: string }[];
	defaultColor: string | null;
	settings: {
		defaultDpi: number;
		warnDpi: number;
		autosave: boolean;
		guestSaving: boolean;
		uploads: { maxMb: number; maxPx: number; formats: string[] };
	};
}

interface BootstrapImage {
	attachmentId: number;
	url: string;
	widthPx: number;
	heightPx: number;
}

export interface BootstrapSide {
	id: string;
	label: string;
	base: BootstrapImage;
	overlay: (BootstrapImage & { blend: 'multiply' | 'screen' | 'normal' }) | null;
	mask: BootstrapImage | null;
	printAreas: unknown[];
}

/** Sides with print areas validated (defaults applied) and laid out in mm. */
export function sideRuntimes(bootstrap: Bootstrap): SideRuntime[] {
	return bootstrap.sides.map((side) => ({
		id: side.id,
		label: side.label,
		base: { url: side.base.url },
		overlay: side.overlay ? { url: side.overlay.url, blend: side.overlay.blend } : null,
		mask: side.mask ? { url: side.mask.url } : null,
		layout: sideLayout(side.base, side.printAreas.map((area) => PrintArea.parse(area))),
	}));
}

/** Price in the store's currency format. */
export function formatPrice(amount: number, currency: Bootstrap['currency']): string {
	const [whole = '0', fraction] = amount.toFixed(currency.decimals).split('.');
	const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, currency.thousandSeparator);
	const number = fraction ? `${grouped}${currency.decimalSeparator}${fraction}` : grouped;
	switch (currency.position) {
		case 'right':
			return `${number}${currency.symbol}`;
		case 'right_space':
			return `${number} ${currency.symbol}`;
		case 'left_space':
			return `${currency.symbol} ${number}`;
		default:
			return `${currency.symbol}${number}`;
	}
}
