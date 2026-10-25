import { z } from 'zod';

/** Hex colour, #rgb / #rrggbb / #rrggbbaa. */
export const Color = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);

/** A short identifier used for sides, print areas and elements. */
export const Id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

/** Rectangle in 0–1 units, relative to an image or an element's source. */
export const NormRect = z.object({
	x: z.number().min(0).max(1),
	y: z.number().min(0).max(1),
	w: z.number().gt(0).max(1),
	h: z.number().gt(0).max(1),
});

/** Point in 0–1 units. */
export const NormPoint = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);

export const SizeMm = z.object({ w: z.number().positive().max(10000), h: z.number().positive().max(10000) });
