import { z } from 'zod';
import { Color, Id, NormPoint, NormRect, SizeMm } from './common.ts';

/**
 * Print area on a side's base image.
 *
 * Geometry is stored normalised (0–1) to the base image, not in pixels, so it
 * survives regenerated thumbnails or a replacement image of another resolution.
 * The rect's aspect ratio must match sizeMm (±1 %); the admin editor enforces it.
 */
export const PrintArea = z.object({
	id: Id,
	label: z.string().max(60).default(''),
	shape: z.enum(['rect', 'roundedRect', 'ellipse', 'path']).default('rect'),
	cornerRadiusMm: z.number().min(0).default(0),
	/** SVG path in a 0–1 unit square, used when shape is 'path'. */
	pathD: z.string().max(20000).nullable().default(null),
	rect: NormRect,
	/** Perspective quad (TL, TR, BR, BL), normalised. Reserved for v1.x; null in v1. */
	quad: z.tuple([NormPoint, NormPoint, NormPoint, NormPoint]).nullable().default(null),
	sizeMm: SizeMm,
	bleedMm: z.number().min(0).max(50).default(3),
	safeMm: z.number().min(0).max(100).default(5),
	dpi: z.number().int().min(72).max(1200).default(300),
	clip: z.boolean().default(true),
});

/** Image reference with its pixel size at the time it was configured. */
export const ImageRef = z.object({
	attachmentId: z.number().int().positive(),
	widthPx: z.number().int().positive(),
	heightPx: z.number().int().positive(),
});

/** One side of a product, shared by blueprints (template mode) and gallery mode. */
export const SideDefinition = z.object({
	id: Id,
	label: z.string().max(60),
	/** Blank product (template mode) or gallery photo (gallery mode). Null = resolve from `source`. */
	base: ImageRef.nullable(),
	overlay: ImageRef.extend({ blend: z.enum(['multiply', 'screen', 'normal']).default('multiply') }).nullable().default(null),
	/** Silhouette used to clip the colour tint. */
	mask: ImageRef.nullable().default(null),
	printAreas: z.array(PrintArea).min(1).max(8),
});

/** Template-mode product definition (CPT bps_blueprint). */
export const Blueprint = z.object({
	schemaVersion: z.literal(1),
	sides: z.array(SideDefinition.extend({ base: ImageRef })).min(1).max(12),
	colors: z
		.array(z.object({ id: Id, name: z.string().min(1).max(60), hex: Color, attributeTerm: z.string().max(200).nullable().default(null) }))
		.max(60)
		.default([]),
	defaultColor: Id.nullable().default(null),
	starterTemplateId: z.number().int().positive().nullable().default(null),
	allowedTemplateIds: z.array(z.number().int().positive()).max(500).default([]),
});

export const GalleryConfig = z.object({
	source: z.enum(['first_gallery_image', 'featured_image', 'variation_image', 'attachment']).default('first_gallery_image'),
	attachmentId: z.number().int().positive().nullable().default(null),
	useGalleryAsSides: z.boolean().default(false),
	/** How the photo (stage) fits the editor viewport. */
	fit: z.enum(['contain', 'cover']).default('contain'),
	baseLayersBelow: z.number().int().min(0).max(50).default(0),
	templateOpacity: z.number().min(0).max(1).default(1),
	dimOnlyLayerTitles: z.array(z.string().max(120)).default([]),
	dimmedInPreview3d: z.boolean().default(true),
	includeBaseInPrint: z.boolean().default(false),
	templateId: z.number().int().positive().nullable().default(null),
	sides: z.array(SideDefinition).min(1).max(12),
});

export const MeshMapping = z.object({
	mesh: z.string().min(1).max(200),
	side: Id,
	printArea: Id,
	uvRect: z.tuple([z.number(), z.number(), z.number(), z.number()]).default([0, 0, 1, 1]),
	rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
	flipY: z.boolean().default(false),
});

export const Preview3dConfig = z.object({
	modelId: z.number().int().positive(),
	meshMap: z.array(MeshMapping).max(24),
	texture: z
		.object({
			source: z.enum(['design_only', 'design_over_base_crop', 'design_over_color']).default('design_only'),
			background: z.union([z.literal('transparent'), Color]).default('transparent'),
			maxSize: z.union([z.literal(512), z.literal(1024), z.literal(2048), z.literal(4096)]).default(2048),
			includeBleed: z.boolean().default(false),
		})
		.default({ source: 'design_only', background: 'transparent', maxSize: 2048, includeBleed: false }),
	colorLink: z.object({ attribute: z.string().max(100), mesh: z.string().max(200) }).nullable().default(null),
	/** Per-side camera presets override the model's defaults. */
	camera: z.record(Id, z.object({ azimuth: z.number(), polar: z.number(), distance: z.number().positive() })).default({}),
});

export const PricingConfig = z.object({
	/** Extra price per customised side, in store currency. */
	basePerSide: z.record(Id, z.number().min(0)).default({}),
	perTextElement: z.number().min(0).default(0),
	perImage: z.number().min(0).default(0),
	printMethodId: z.number().int().positive().nullable().default(null),
	templateFee: z.boolean().default(true),
});

export const ProductConfig = z.object({
	schemaVersion: z.literal(1),
	enabled: z.boolean(),
	modes: z.array(z.enum(['template', 'gallery'])).min(1).max(2),
	defaultMode: z.enum(['template', 'gallery']),
	required: z.boolean().default(false),
	blueprintId: z.number().int().positive().nullable().default(null),
	gallery: GalleryConfig.nullable().default(null),
	preview3d: Preview3dConfig.nullable().default(null),
	pricing: PricingConfig.default({ basePerSide: {}, perTextElement: 0, perImage: 0, printMethodId: null, templateFee: true }),
	/** Keyed by variation id. Only the listed fields can be overridden. */
	variations: z
		.record(
			z.string().regex(/^\d+$/),
			z.object({
				blueprintId: z.number().int().positive().optional(),
				productColor: Color.optional(),
				modelColor: Color.optional(),
				baseImages: z.record(Id, ImageRef).optional(),
			}),
		)
		.default({}),
});

export type ProductConfig = z.infer<typeof ProductConfig>;
export type SideDefinition = z.infer<typeof SideDefinition>;
export type PrintArea = z.infer<typeof PrintArea>;
export type Blueprint = z.infer<typeof Blueprint>;
export type ImageRef = z.infer<typeof ImageRef>;
