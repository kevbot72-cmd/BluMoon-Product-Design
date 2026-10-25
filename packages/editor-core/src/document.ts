import { DesignDocument } from './schema/design-document.ts';

export interface DocumentShape {
	productId: number;
	variationId?: number;
	mode: 'template' | 'gallery';
	blueprintId?: number | null;
	/** Side ids, each with its print-area ids. */
	sides: readonly { id: string; printAreas: readonly string[] }[];
}

/** An empty document with every side and print area present. */
export function createDocument(shape: DocumentShape): DesignDocument {
	const sides: DesignDocument['sides'] = {};
	for (const side of shape.sides) {
		const printAreas: DesignDocument['sides'][string]['printAreas'] = {};
		for (const area of side.printAreas) {
			printAreas[area] = { elements: [] };
		}
		sides[side.id] = { printAreas };
	}
	return {
		schemaVersion: 1,
		productId: shape.productId,
		variationId: shape.variationId ?? 0,
		mode: shape.mode,
		blueprintId: shape.blueprintId ?? null,
		units: 'mm',
		sides,
		options: { productColor: null, printMethodId: null },
		meta: { templateId: null, createdWith: 'bps-editor' },
	};
}

/**
 * Validate stored or restored JSON. Returns null when it isn't a valid v1
 * document; migrations from later schema versions are added here.
 */
export function parseDocument(json: unknown): DesignDocument | null {
	const result = DesignDocument.safeParse(json);
	return result.success ? result.data : null;
}

/** Whether a restored document still fits the product's current sides and areas. */
export function fitsShape(doc: DesignDocument, shape: DocumentShape): boolean {
	return (
		doc.productId === shape.productId &&
		doc.mode === shape.mode &&
		shape.sides.every((side) => side.printAreas.every((area) => doc.sides[side.id]?.printAreas[area] !== undefined))
	);
}

/** Total number of elements across all sides. */
export function countElements(doc: DesignDocument): number {
	let count = 0;
	for (const side of Object.values(doc.sides)) {
		for (const area of Object.values(side.printAreas)) {
			count += area.elements.length;
		}
	}
	return count;
}
