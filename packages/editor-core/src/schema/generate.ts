import { writeFileSync, mkdirSync } from 'node:fs';
import { z } from 'zod';
import { DesignDocument } from './design-document.ts';
import { ProductConfig } from './product-config.ts';

// The JSON Schema files are generated from Zod so client (Zod) and server
// (opis/json-schema) validate against the same definition.
// Written to the repo-root schema/json/, which ships with the plugin and is read by PHP.
const out = new URL('../../../../schema/json/', import.meta.url);
mkdirSync(out, { recursive: true });
for (const [name, schema] of [
	['design-document.v1', DesignDocument],
	['product-config.v1', ProductConfig],
] as const) {
	const json = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input', reused: 'ref' });
	writeFileSync(new URL(`${name}.json`, out), JSON.stringify(json, null, '\t') + '\n');
	console.log(`wrote schema/json/${name}.json`);
}
