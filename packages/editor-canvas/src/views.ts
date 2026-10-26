import { FabricImage, FabricObject, FabricText, Group, IText, Path, Rect, Shadow, loadSVGFromString, util } from 'fabric';
import type { Font, PathCommand as OtCommand } from 'opentype.js';
import { isMovable, normalizeHex, ptToMm, type AreaLayout, type ClipartElement, type DrawingElement, type Element, type ImageElement, type QrElement, type ShapeElement, type TextElement } from '@bps/editor-core';
import type { FontRegistry } from './fonts.ts';
import type { ImageCache } from './images.ts';
import { isStrokeShape, shapePath } from './shapes.ts';
import { bridgeWarp, commandBounds, toPathData, type PathCommand } from './textEffects.ts';

/** Where uploads and library images come from (signed URLs are resolved by the UI). */
export interface AssetResolver {
	uploadUrl(uploadId: string): string | undefined;
	clipart(attachmentId: number): { url: string; mime: string } | undefined;
}

export interface ViewContext {
	fonts: FontRegistry;
	images: ImageCache;
	assets: AssetResolver;
	area: AreaLayout;
}

/** What the stage needs to know about an object it built. */
export interface ViewMeta {
	id: string;
	type: Element['type'];
	/** The scale the object was built with; gestures are measured against it. */
	base: { x: number; y: number };
	/** Element box centre minus object centre, in unscaled object units (only drawings differ). */
	offset: { x: number; y: number };
}

const metas = new WeakMap<FabricObject, ViewMeta>();
export const viewMeta = (obj: FabricObject): ViewMeta | undefined => metas.get(obj);

const svgCache = new Map<string, Promise<string>>();

/** Build the Fabric object for an element, loading fonts and images first. */
export async function buildObject(el: Element, ctx: ViewContext): Promise<FabricObject> {
	let built: { obj: FabricObject; base?: { x: number; y: number }; offset?: { x: number; y: number } };
	switch (el.type) {
		case 'text':
			await ctx.fonts.load(el.font.family, el.font.weight, el.font.style);
			if (el.effect.kind !== 'none') {
				await ctx.fonts.outlines(el.font.family, el.font.weight, el.font.style);
			}
			built = { obj: textObject(el, ctx.fonts) };
			break;
		case 'image':
			built = await imageObject(el, ctx);
			break;
		case 'shape':
			built = { obj: shapeObject(el) };
			break;
		case 'clipart':
			built = await clipartObject(el, ctx);
			break;
		case 'qr':
			built = await qrObject(el);
			break;
		case 'drawing':
			built = drawingObject(el);
			break;
		case 'placeholder':
		case 'group':
			// Template placeholders and groups arrive in Phase 3.
			built = { obj: missing(el) };
			break;
	}
	const meta: ViewMeta = { id: el.id, type: el.type, base: built.base ?? { x: 1, y: 1 }, offset: built.offset ?? { x: 0, y: 0 } };
	metas.set(built.obj, meta);
	place(built.obj, el, ctx.area, meta);
	return built.obj;
}

/** Position, rotation, visibility, locks and handles common to every element. */
function place(obj: FabricObject, el: Element, area: AreaLayout, meta: ViewMeta): void {
	const rad = (el.rotation * Math.PI) / 180;
	// The element box centre, minus the (rotated, scaled) offset of the object's own centre.
	const ox = meta.offset.x * meta.base.x;
	const oy = meta.offset.y * meta.base.y;
	const movable = isMovable(el);
	const locked = el.locks.all === true || el.permissions?.lock === 'all';
	obj.set({
		originX: 'center',
		originY: 'center',
		left: area.x + el.x + el.w / 2 - (ox * Math.cos(rad) - oy * Math.sin(rad)),
		top: area.y + el.y + el.h / 2 - (ox * Math.sin(rad) + oy * Math.cos(rad)),
		angle: el.rotation,
		flipX: el.flipX,
		flipY: el.flipY,
		opacity: el.opacity,
		visible: !el.hidden,
		selectable: !locked,
		evented: !locked,
		lockMovementX: !movable,
		lockMovementY: !movable,
		lockRotation: !movable,
		lockScalingX: !movable || el.type === 'drawing',
		lockScalingY: !movable || el.type === 'drawing',
		lockScalingFlip: true,
		hasControls: movable,
	});
	// Text, clipart and QR keep their proportions: corner handles only. Images and shapes get all 8 (owner's add-on).
	const sides = el.type === 'image' || el.type === 'shape';
	obj.setControlsVisibility({ ml: sides, mr: sides, mt: sides, mb: sides });
	if (el.type === 'drawing') {
		obj.setControlsVisibility({ tl: false, tr: false, bl: false, br: false });
	}
	obj.setCoords();
}

/* ---------------------------------------------------------------- Text */

function textStyle(el: TextElement) {
	return {
		fontFamily: el.font.family,
		fontWeight: el.font.weight,
		fontStyle: el.font.style,
		fontSize: ptToMm(el.font.sizePt),
		fill: el.fill,
		stroke: el.stroke?.color ?? null,
		strokeWidth: el.stroke?.widthMm ?? 0,
		paintFirst: 'stroke' as const,
		strokeLineJoin: 'round' as const,
		charSpacing: el.letterSpacing,
		lineHeight: el.lineHeight,
		textAlign: el.align,
		shadow: el.shadow ? new Shadow({ color: el.shadow.color, blur: el.shadow.blurMm, offsetX: el.shadow.offsetXMm, offsetY: el.shadow.offsetYMm }) : null,
	};
}

const displayText = (el: Pick<TextElement, 'text' | 'uppercase'>): string => (el.uppercase ? el.text.toUpperCase() : el.text);

/**
 * Plain text is an IText (edited inline, unless it is shown in capitals);
 * text with an effect is a vector path built from the font's glyph outlines.
 */
export function textObject(el: TextElement, fonts: FontRegistry): FabricObject {
	const style = textStyle(el);
	if (el.effect.kind !== 'none') {
		const font = fonts.outlinesNow(el.font.family, el.font.weight, el.font.style);
		if (font) {
			const { fontFamily: _f, fontWeight: _w, fontStyle: _s, fontSize: _z, charSpacing: _c, lineHeight: _l, textAlign: _a, ...paint } = style;
			try {
				return new Path(toPathData(effectCommands(el, font)), { ...paint, fillRule: 'nonzero' });
			} catch (error) {
				console.warn('[bps] text effect could not be drawn; showing plain text', error);
			}
		}
		// Outlines not loaded yet (or unusable): show plain text.
	}
	return el.uppercase || el.effect.kind !== 'none' ? new FabricText(displayText(el), style) : new IText(el.text, style);
}

/** Glyph outlines laid out on one line, with tracking and kerning, baseline at y = 0. */
function layoutGlyphs(el: TextElement, font: Font): { commands: PathCommand[][]; advances: { x: number; w: number }[]; width: number } {
	const size = ptToMm(el.font.sizePt);
	const scale = size / font.unitsPerEm;
	const tracking = (el.letterSpacing / 1000) * size;
	// One glyph per character: opentype.js's shaping (ligatures) fails on some fonts' GSUB tables,
	// and ligatures aren't wanted on curved or warped text anyway.
	const glyphs = Array.from(displayText(el).replace(/\s*\n\s*/g, ' '), (ch) => font.charToGlyph(ch));
	const commands: PathCommand[][] = [];
	const advances: { x: number; w: number }[] = [];
	let x = 0;
	glyphs.forEach((glyph, i) => {
		const path = glyph.getPath(0, 0, size);
		commands.push(path.commands.map(convert));
		const w = (glyph.advanceWidth ?? 0) * scale;
		advances.push({ x, w });
		const next = glyphs[i + 1];
		x += w + tracking + (next ? kerning(font, glyph, next) * scale : 0);
	});
	return { commands, advances, width: Math.max(0, x - tracking) };
}

/** Pair kerning; some fonts' kerning tables can't be read, which just means no kerning. */
function kerning(font: Font, left: Parameters<Font['getKerningValue']>[0], right: Parameters<Font['getKerningValue']>[1]): number {
	try {
		return font.getKerningValue(left, right);
	} catch {
		return 0;
	}
}

function convert(c: OtCommand): PathCommand {
	switch (c.type) {
		case 'M':
		case 'L':
			return [c.type, c.x, c.y];
		case 'C':
			return ['C', c.x1, c.y1, c.x2, c.y2, c.x, c.y];
		case 'Q':
			return ['Q', c.x1, c.y1, c.x, c.y];
		case 'Z':
			return ['Z'];
	}
}

/** Apply a transform to every point of a glyph. */
const mapPoints = (cmds: PathCommand[], f: (x: number, y: number) => [number, number]): PathCommand[] =>
	cmds.map(([cmd, ...nums]) => {
		const out: number[] = [];
		for (let i = 0; i + 1 < nums.length; i += 2) {
			out.push(...f(nums[i]!, nums[i + 1]!));
		}
		return [cmd, ...out] as PathCommand;
	});

/** Outline commands for arc, bridge and oblique text. */
export function effectCommands(el: TextElement, font: Font): PathCommand[] {
	const { commands, advances, width } = layoutGlyphs(el, font);
	const effect = el.effect;
	if (effect.kind === 'arc') {
		const r = effect.radiusMm;
		const up = effect.direction === 'up';
		return commands.flatMap((glyph, i) => {
			const { x, w } = advances[i]!;
			// Angle of the glyph's centre along the arc, with the middle of the text at the top (or bottom).
			const s = x + w / 2 - width / 2;
			const theta = up ? -Math.PI / 2 + s / r : Math.PI / 2 - s / r;
			const turn = up ? theta + Math.PI / 2 : theta - Math.PI / 2;
			const cos = Math.cos(turn);
			const sin = Math.sin(turn);
			const px = Math.cos(theta) * r;
			const py = Math.sin(theta) * r;
			return mapPoints(glyph, (gx, gy) => {
				const lx = gx - w / 2;
				return [px + lx * cos - gy * sin, py + lx * sin + gy * cos];
			});
		});
	}
	const placed = commands.flatMap((glyph, i) => mapPoints(glyph, (gx, gy) => [gx + advances[i]!.x, gy]));
	if (effect.kind === 'bridge') {
		return bridgeWarp(placed, effect.curve, effect.offset);
	}
	if (effect.kind === 'oblique') {
		// The baseline tilts; letters stay upright.
		const tan = Math.tan((effect.angle * Math.PI) / 180);
		const b = commandBounds(placed);
		const mid = (b.minX + b.maxX) / 2;
		return mapPoints(placed, (x, y) => [x, y - (x - mid) * tan]);
	}
	return placed;
}

/* ---------------------------------------------------------------- Images */

async function imageObject(el: ImageElement, ctx: ViewContext): Promise<{ obj: FabricObject; base: { x: number; y: number } }> {
	const url = el.source.kind === 'upload' ? ctx.assets.uploadUrl(el.source.uploadId) : ctx.assets.clipart(el.source.attachmentId)?.url;
	const img = url ? await ctx.images.load(url).catch(() => null) : null;
	if (!img) {
		return { obj: missing(el), base: { x: 1, y: 1 } };
	}
	const cw = el.crop.w * img.naturalWidth;
	const ch = el.crop.h * img.naturalHeight;
	const base = { x: el.w / cw, y: el.h / ch };
	const obj = new FabricImage(img, { cropX: el.crop.x * img.naturalWidth, cropY: el.crop.y * img.naturalHeight, width: cw, height: ch, scaleX: base.x, scaleY: base.y });
	return { obj, base };
}

/* ---------------------------------------------------------------- Shapes */

function shapeObject(el: ShapeElement): FabricObject {
	const path = new Path(shapePath(el.shape, el.w, el.h, el.cornerRadiusMm), {
		fill: isStrokeShape(el.shape) ? null : el.fill,
		stroke: el.stroke?.color ?? null,
		strokeWidth: el.stroke?.widthMm ?? 0,
		strokeLineJoin: 'round',
		strokeLineCap: 'round',
	});
	if (!isStrokeShape(el.shape)) {
		return path;
	}
	// A line has no height of its own; an invisible box keeps the element's size.
	return new Group([bounds(el.w, el.h), path]);
}

/* ---------------------------------------------------------------- Clipart */

async function clipartObject(el: ClipartElement, ctx: ViewContext): Promise<{ obj: FabricObject; base: { x: number; y: number } }> {
	const asset = ctx.assets.clipart(el.attachmentId);
	if (!asset) {
		return { obj: missing(el), base: { x: 1, y: 1 } };
	}
	let obj: FabricObject;
	if (asset.mime === 'image/svg+xml') {
		let text = svgCache.get(asset.url);
		if (!text) {
			text = fetch(asset.url).then((r) => r.text());
			svgCache.set(asset.url, text);
		}
		const { objects, options } = await loadSVGFromString(await text);
		obj = util.groupSVGElements(objects.filter((o): o is FabricObject => o !== null), options);
		recolor(obj, el.colors);
	} else {
		const img = await ctx.images.load(asset.url).catch(() => null);
		if (!img) {
			return { obj: missing(el), base: { x: 1, y: 1 } };
		}
		obj = new FabricImage(img);
	}
	const base = { x: el.w / (obj.width || 1), y: el.h / (obj.height || 1) };
	obj.set({ scaleX: base.x, scaleY: base.y });
	return { obj, base };
}

/** Every distinct fill/stroke colour in an SVG, for the recolour palette. */
export function svgColors(obj: FabricObject): string[] {
	const colors = new Set<string>();
	walk(obj, (o) => {
		for (const paint of [o.fill, o.stroke]) {
			const hex = typeof paint === 'string' ? normalizeHex(paint) : null;
			if (hex) colors.add(hex);
		}
	});
	return [...colors];
}

function recolor(obj: FabricObject, map: Record<string, string>): void {
	if (Object.keys(map).length === 0) {
		return;
	}
	walk(obj, (o) => {
		for (const key of ['fill', 'stroke'] as const) {
			const paint = o[key];
			const hex = typeof paint === 'string' ? normalizeHex(paint) : null;
			const replacement = hex ? map[hex] : undefined;
			if (replacement) o.set(key, replacement);
		}
	});
}

function walk(obj: FabricObject, visit: (o: FabricObject) => void): void {
	visit(obj);
	if (obj instanceof Group) {
		obj.getObjects().forEach((child) => {
			walk(child, visit);
		});
	}
}

/* ---------------------------------------------------------------- QR */

async function qrObject(el: QrElement): Promise<{ obj: FabricObject; base: { x: number; y: number } }> {
	// The QR encoder loads with the first QR code.
	const { qrMatrix } = await import('./qr.ts');
	let matrix;
	try {
		matrix = qrMatrix(el);
	} catch {
		// Too much data for a QR code; the inspector says so.
		return { obj: missing(el), base: { x: 1, y: 1 } };
	}
	const back = new Rect({ left: 0, top: 0, originX: 'left', originY: 'top', width: matrix.size, height: matrix.size, fill: el.bg ?? 'rgba(0,0,0,0)', strokeWidth: 0 });
	const modules = new Path(matrix.d, { fill: el.fg, strokeWidth: 0 });
	const group = new Group([back, modules]);
	const base = { x: el.w / matrix.size, y: el.h / matrix.size };
	group.set({ scaleX: base.x, scaleY: base.y });
	return { obj: group, base };
}

/* ---------------------------------------------------------------- Drawing */

function drawingObject(el: DrawingElement): { obj: FabricObject; offset: { x: number; y: number } } {
	const box = bounds(el.w, el.h);
	const strokes = el.strokes.map(
		(s) =>
			new Path(s.d, {
				fill: null,
				stroke: s.mode === 'erase' ? '#000000' : s.color,
				strokeWidth: s.widthMm,
				strokeLineCap: 'round',
				strokeLineJoin: 'round',
				// Erasing cuts through this drawing only: the group renders to its own cache first.
				globalCompositeOperation: s.mode === 'erase' ? 'destination-out' : 'source-over',
			}),
	);
	const group = new Group([box, ...strokes], { objectCaching: true, perPixelTargetFind: true });
	// Strokes can reach past the box, which moves the group's centre; remember by how much.
	const boxCentre = box.getRelativeCenterPoint();
	return { obj: group, offset: { x: boxCentre.x, y: boxCentre.y } };
}

/* ---------------------------------------------------------------- Helpers */

function bounds(w: number, h: number): Rect {
	return new Rect({ left: 0, top: 0, originX: 'left', originY: 'top', width: w, height: h, fill: 'rgba(0,0,0,0)', strokeWidth: 0 });
}

/** Grey hatched box for content that can't be shown (missing upload, bad QR data). */
function missing(el: Element): FabricObject {
	return new Rect({ width: el.w, height: el.h, fill: 'rgba(120,120,130,0.18)', stroke: '#9aa0aa', strokeWidth: Math.min(el.w, el.h) / 60, strokeDashArray: [2, 2] });
}
