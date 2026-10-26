import { z } from 'zod';
import { Color, Id, NormRect } from './common.ts';

/**
 * Design document, schema version 1.
 *
 * All lengths are millimetres. Positions are relative to the top-left of the
 * element's print area. (x, y) is the top-left of the element's unrotated box;
 * rotation is in degrees, clockwise, around the box centre.
 */

/** Restrictions a template author puts on an element. The shopper cannot change these. */
export const Permissions = z.object({
	lock: z.enum(['none', 'position', 'all']).default('none'),
	deletable: z.boolean().default(true),
	editableText: z.boolean().default(true),
	replaceableImage: z.boolean().default(true),
	maxChars: z.number().int().positive().optional(),
	allowedFonts: z.array(z.string()).optional(),
	allowedColors: z.array(Color).optional(),
	required: z.boolean().default(false),
	/** Dimmed template layer (owner's gallery add-on rule). */
	dimmed: z.boolean().default(false),
	/** Whether a dimmed layer is included in print files. */
	dimmedInPrint: z.boolean().default(false),
});

const ElementBase = z.object({
	id: Id,
	name: z.string().max(120).optional(),
	x: z.number(),
	y: z.number(),
	w: z.number().positive(),
	h: z.number().positive(),
	rotation: z.number().min(-360).max(360).default(0),
	flipX: z.boolean().default(false),
	flipY: z.boolean().default(false),
	opacity: z.number().min(0).max(1).default(1),
	hidden: z.boolean().default(false),
	/** Locks the shopper set on their own element. */
	locks: z.object({ position: z.boolean().optional(), all: z.boolean().optional() }).default({}),
	/** Present only on elements that came from a template. */
	permissions: Permissions.optional(),
	meta: z.record(z.string(), z.unknown()).default({}),
});

export const TextEffect = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('none') }),
	/** Text on a circular arc. radiusMm > 0; direction 'down' puts text on the inside of the arc. */
	z.object({ kind: z.literal('arc'), radiusMm: z.number().positive(), direction: z.enum(['up', 'down']).default('up') }),
	/** Vector envelope warp. curve -1..1: positive bulges the top edge down (Lumise "bridge"). */
	z.object({ kind: z.literal('bridge'), curve: z.number().min(-1).max(1), offset: z.number().min(0).max(1).default(0.5) }),
	/** Vector skew of the baseline, degrees. */
	z.object({ kind: z.literal('oblique'), angle: z.number().min(-60).max(60) }),
]);

export const TextElement = ElementBase.extend({
	type: z.literal('text'),
	text: z.string().max(5000),
	font: z.object({
		family: z.string().min(1),
		weight: z.number().int().min(100).max(900).default(400),
		style: z.enum(['normal', 'italic']).default('normal'),
		/** Font size in points (1 pt = 0.3528 mm). */
		sizePt: z.number().positive().max(2000),
	}),
	fill: Color,
	stroke: z.object({ color: Color, widthMm: z.number().min(0) }).nullable().default(null),
	shadow: z
		.object({ color: Color, blurMm: z.number().min(0), offsetXMm: z.number(), offsetYMm: z.number() })
		.nullable()
		.default(null),
	/** Tracking in 1/1000 em. */
	letterSpacing: z.number().min(-500).max(2000).default(0),
	lineHeight: z.number().min(0.5).max(4).default(1.2),
	align: z.enum(['left', 'center', 'right', 'justify']).default('left'),
	uppercase: z.boolean().default(false),
	effect: TextEffect.default({ kind: 'none' }),
});

/** Adjustments, -1..1 (blur and sharpen use 0..1). Temperature: negative is cooler, positive warmer. */
export const ImageFilter = z.discriminatedUnion('name', [
	z.object({ name: z.enum(['brightness', 'contrast', 'saturation', 'hue', 'temperature', 'blur', 'sharpen']), value: z.number().min(-1).max(1) }),
	z.object({ name: z.enum(['grayscale', 'sepia', 'invert']) }),
	z.object({ name: z.literal('duotone'), dark: Color, light: Color }),
]);

/** Image source: a shopper upload or a library asset (clipart raster, admin image). */
export const ImageSource = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('upload'), uploadId: z.string().regex(/^u_[A-Za-z0-9]{16,40}$/) }),
	z.object({ kind: z.literal('asset'), attachmentId: z.number().int().positive() }),
]);

export const Mask = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('builtin'), shape: z.enum(['circle', 'rounded', 'heart', 'star', 'hexagon']) }),
	z.object({ kind: z.literal('asset'), attachmentId: z.number().int().positive() }),
]);

export const ImageElement = ElementBase.extend({
	type: z.literal('image'),
	source: ImageSource,
	/** Pixel size of the original, used for effective-DPI checks. */
	naturalPx: z.object({ w: z.number().int().positive(), h: z.number().int().positive() }),
	/** Non-destructive crop, 0–1 of the source. Full image when omitted. */
	crop: NormRect.default({ x: 0, y: 0, w: 1, h: 1 }),
	mask: Mask.nullable().default(null),
	/** Named preset (e.g. "vivid"), applied before the manual filter chain. */
	preset: z.string().max(40).nullable().default(null),
	filters: z.array(ImageFilter).max(20).default([]),
	keepAspect: z.boolean().default(false),
});

export const SHAPES = ['rect', 'ellipse', 'triangle', 'star', 'heart', 'hexagon', 'line', 'arrow'] as const;

/** Built-in vector shape, drawn to fill its box. */
export const ShapeElement = ElementBase.extend({
	type: z.literal('shape'),
	shape: z.enum(SHAPES),
	fill: Color.nullable(),
	stroke: z.object({ color: Color, widthMm: z.number().min(0).max(100) }).nullable().default(null),
	cornerRadiusMm: z.number().min(0).max(1000).default(0),
	keepAspect: z.boolean().default(false),
});

/** Clipart from the store's library (SVG or PNG attachment). `colors` maps an original SVG colour to its replacement. */
export const ClipartElement = ElementBase.extend({
	type: z.literal('clipart'),
	attachmentId: z.number().int().positive(),
	colors: z.record(Color, Color).default({}),
	keepAspect: z.boolean().default(true),
});

export const QrPayload = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('url'), url: z.url().max(2000) }),
	z.object({ kind: z.literal('text'), text: z.string().min(1).max(2000) }),
	z.object({
		kind: z.literal('vcard'),
		name: z.string().max(200),
		org: z.string().max(200).optional(),
		phone: z.string().max(50).optional(),
		email: z.string().max(200).optional(),
		url: z.string().max(500).optional(),
	}),
	z.object({ kind: z.literal('wifi'), ssid: z.string().min(1).max(64), password: z.string().max(128), security: z.enum(['WPA', 'WEP', 'nopass']) }),
	z.object({ kind: z.literal('email'), to: z.string().max(200), subject: z.string().max(200).optional() }),
	z.object({ kind: z.literal('phone'), number: z.string().max(50) }),
]);

export const QrElement = ElementBase.extend({
	type: z.literal('qr'),
	payload: QrPayload,
	fg: Color,
	bg: Color.nullable(),
	ecc: z.enum(['L', 'M', 'Q', 'H']).default('M'),
	quietZone: z.number().int().min(0).max(10).default(4),
});

/** Free-hand drawing. Path data is in mm, relative to the element box. */
export const DrawingElement = ElementBase.extend({
	type: z.literal('drawing'),
	strokes: z
		.array(z.object({ d: z.string().max(200000), color: Color, widthMm: z.number().positive(), mode: z.enum(['draw', 'erase']) }))
		.max(500),
});

/** Template-defined frame that the shopper fills with a photo. */
export const PlaceholderElement = ElementBase.extend({
	type: z.literal('placeholder'),
	frame: Mask.nullable().default(null),
	fill: z
		.object({
			source: ImageSource,
			naturalPx: z.object({ w: z.number().int().positive(), h: z.number().int().positive() }),
			/** Image centre offset from frame centre, in mm, and scale relative to "cover". */
			offsetXMm: z.number(),
			offsetYMm: z.number(),
			scale: z.number().min(1).max(20),
		})
		.nullable()
		.default(null),
	hint: z.string().max(120).optional(),
});

const LeafElement = z.discriminatedUnion('type', [TextElement, ImageElement, ShapeElement, ClipartElement, QrElement, DrawingElement, PlaceholderElement]);

/** Group: children positions are relative to the print area, like top-level elements. */
export const GroupElement = ElementBase.extend({
	type: z.literal('group'),
	children: z.array(LeafElement).min(2).max(200),
});

export const Element = z.discriminatedUnion('type', [TextElement, ImageElement, ShapeElement, ClipartElement, QrElement, DrawingElement, PlaceholderElement, GroupElement]);

export const DesignDocument = z.object({
	schemaVersion: z.literal(1),
	productId: z.number().int().positive(),
	variationId: z.number().int().min(0).default(0),
	mode: z.enum(['template', 'gallery']),
	blueprintId: z.number().int().positive().nullable().default(null),
	units: z.literal('mm'),
	sides: z.record(
		Id,
		z.object({
			printAreas: z.record(Id, z.object({ elements: z.array(Element).max(300) })),
		}),
	),
	options: z
		.object({
			productColor: Color.nullable().default(null),
			printMethodId: z.number().int().positive().nullable().default(null),
		})
		.catchall(z.unknown())
		.default({ productColor: null, printMethodId: null }),
	meta: z
		.object({
			templateId: z.number().int().positive().nullable().default(null),
			createdWith: z.string().max(40).optional(),
		})
		.default({ templateId: null }),
});

export type DesignDocument = z.infer<typeof DesignDocument>;
export type Element = z.infer<typeof Element>;
export type ElementType = Element['type'];
export type TextElement = z.infer<typeof TextElement>;
export type ImageElement = z.infer<typeof ImageElement>;
export type ShapeElement = z.infer<typeof ShapeElement>;
export type ClipartElement = z.infer<typeof ClipartElement>;
export type QrElement = z.infer<typeof QrElement>;
export type DrawingElement = z.infer<typeof DrawingElement>;
export type PlaceholderElement = z.infer<typeof PlaceholderElement>;
export type GroupElement = z.infer<typeof GroupElement>;
export type TextEffect = z.infer<typeof TextEffect>;
export type QrPayload = z.infer<typeof QrPayload>;
export type ImageSource = z.infer<typeof ImageSource>;
export type ImageFilter = z.infer<typeof ImageFilter>;
export type Mask = z.infer<typeof Mask>;
