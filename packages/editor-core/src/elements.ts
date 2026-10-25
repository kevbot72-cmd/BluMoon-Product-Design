import { newId } from './ids.ts';
import type {
	ClipartElement,
	DesignDocument,
	DrawingElement,
	Element,
	ImageElement,
	ImageSource,
	QrElement,
	QrPayload,
	ShapeElement,
	TextElement,
} from './schema/design-document.ts';
import type { SizeMm } from './units.ts';

/** Where an element lives in the document. */
export interface AreaRef {
	side: string;
	area: string;
}

export interface ElementRef extends AreaRef {
	id: string;
}

/**
 * Measures a text element's box in mm from its content and font.
 * The canvas provides the real one; tests use a fake.
 */
export type TextMeasurer = (text: Pick<TextElement, 'text' | 'font' | 'letterSpacing' | 'lineHeight' | 'uppercase' | 'effect' | 'stroke'>) => SizeMm;

const base = {
	rotation: 0,
	flipX: false,
	flipY: false,
	opacity: 1,
	hidden: false,
	locks: {},
	meta: {},
} as const;

/** Box of the given size centred in the area, shrunk to fit if needed. */
export function centeredBox(area: SizeMm, w: number, h: number): { x: number; y: number; w: number; h: number } {
	const scale = Math.min(1, (area.w * 0.9) / w, (area.h * 0.9) / h);
	const sw = w * scale;
	const sh = h * scale;
	return { x: (area.w - sw) / 2, y: (area.h - sh) / 2, w: sw, h: sh };
}

export interface TextPreset {
	text: string;
	family: string;
	weight: number;
	sizePt: number;
}

export function createText(area: SizeMm, measure: TextMeasurer, preset: TextPreset, fill = '#1a1a1a'): TextElement {
	const content = {
		text: preset.text,
		font: { family: preset.family, weight: preset.weight, style: 'normal' as const, sizePt: preset.sizePt },
		letterSpacing: 0,
		lineHeight: 1.2,
		uppercase: false,
		effect: { kind: 'none' as const },
		stroke: null,
	};
	const size = measure(content);
	return {
		...base,
		...content,
		...centeredBox(area, size.w, size.h),
		id: newId(),
		type: 'text',
		fill,
		shadow: null,
		align: 'center',
	};
}

export function createImage(area: SizeMm, source: ImageSource, naturalPx: { w: number; h: number }): ImageElement {
	// Start at 80 % of the area, keeping the photo's aspect ratio.
	const aspect = naturalPx.w / naturalPx.h;
	const w = Math.min(area.w * 0.8, area.h * 0.8 * aspect);
	return {
		...base,
		...centeredBox(area, w, w / aspect),
		id: newId(),
		type: 'image',
		source,
		naturalPx,
		crop: { x: 0, y: 0, w: 1, h: 1 },
		mask: null,
		preset: null,
		filters: [],
		keepAspect: false,
	};
}

export function createShape(area: SizeMm, shape: ShapeElement['shape'], fill = '#6c4be0'): ShapeElement {
	const side = Math.min(area.w, area.h) * 0.4;
	const isLine = shape === 'line' || shape === 'arrow';
	return {
		...base,
		...centeredBox(area, side, isLine ? side / 8 : side),
		id: newId(),
		type: 'shape',
		shape,
		fill: isLine ? null : fill,
		stroke: isLine ? { color: fill, widthMm: Math.max(0.5, side / 40) } : null,
		cornerRadiusMm: 0,
		keepAspect: false,
	};
}

export function createClipart(area: SizeMm, attachmentId: number, aspect: number): ClipartElement {
	const w = Math.min(area.w, area.h * aspect) * 0.5;
	return {
		...base,
		...centeredBox(area, w, w / aspect),
		id: newId(),
		type: 'clipart',
		attachmentId,
		colors: {},
		keepAspect: true,
	};
}

export function createQr(area: SizeMm, payload: QrPayload, fg = '#000000', bg: string | null = '#ffffff'): QrElement {
	// 30 mm scans reliably from about 30 cm; never larger than half the area.
	const size = Math.min(30, area.w / 2, area.h / 2);
	return {
		...base,
		...centeredBox(area, size, size),
		id: newId(),
		type: 'qr',
		payload,
		fg,
		bg,
		ecc: 'M',
		quietZone: 4,
	};
}

/** A drawing layer covering the whole print area; strokes are in its mm space. */
export function createDrawing(area: SizeMm): DrawingElement {
	return {
		...base,
		x: 0,
		y: 0,
		w: area.w,
		h: area.h,
		id: newId(),
		type: 'drawing',
		strokes: [],
	};
}

/** Human-readable default layer name. */
export function elementLabel(el: Element): string {
	if (el.name) {
		return el.name;
	}
	switch (el.type) {
		case 'text':
			return el.text.split('\n')[0]?.slice(0, 40) || 'Text';
		case 'image':
			return 'Photo';
		case 'shape':
			return el.shape.charAt(0).toUpperCase() + el.shape.slice(1);
		case 'clipart':
			return 'Clipart';
		case 'qr':
			return 'QR code';
		case 'drawing':
			return 'Drawing';
		case 'placeholder':
			return 'Photo frame';
		case 'group':
			return 'Group';
	}
}

/** Elements of one print area, bottom to top. */
export function areaElements(doc: DesignDocument, ref: AreaRef): readonly Element[] {
	return doc.sides[ref.side]?.printAreas[ref.area]?.elements ?? [];
}

export function findElement(doc: DesignDocument, ref: ElementRef): Element | undefined {
	return areaElements(doc, ref).find((el) => el.id === ref.id);
}

/** Whether the shopper may move/resize it (their own lock or a template lock). */
export function isMovable(el: Element): boolean {
	return !el.locks.position && !el.locks.all && (el.permissions?.lock ?? 'none') === 'none';
}

/** Whether the shopper may delete it. */
export function isDeletable(el: Element): boolean {
	return !el.locks.all && (el.permissions?.deletable ?? true) && el.permissions?.lock !== 'all';
}
