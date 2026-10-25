import { readFileSync } from 'node:fs';
import { DesignDocument } from './design-document.ts';
import { ProductConfig } from './product-config.ts';

let failed = false;
for (const [file, schema] of [
	['design-document.gallery.json', DesignDocument],
	['product-config.hybrid.json', ProductConfig],
] as const) {
	const data = JSON.parse(readFileSync(new URL(`../examples/${file}`, import.meta.url), 'utf8'));
	const result = schema.safeParse(data);
	if (result.success) {
		console.log(`ok   ${file}`);
	} else {
		failed = true;
		console.log(`FAIL ${file}\n${JSON.stringify(result.error.issues, null, 2)}`);
	}
}
process.exit(failed ? 1 : 0);
