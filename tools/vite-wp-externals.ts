/**
 * Vite plugin: resolve @wordpress/* and React imports to the globals WordPress
 * already loads (wp.element, React, …) instead of bundling them, and write
 * assets/dist/wp-deps.json listing each entry's WordPress script handles.
 * PHP's AssetLoader adds those handles as script dependencies. Also writes
 * assets/dist/i18n-map.json for JavaScript translations.
 *
 * This does the job of @wordpress/dependency-extraction-webpack-plugin for
 * Vite (ADR-0010).
 */
import { init, parse } from 'es-module-lexer';
import { relative } from 'node:path';
import type { OutputBundle, OutputChunk } from 'rolldown';
import type { Plugin } from 'vite';

export interface WpExternal {
	/** Global expression, e.g. "wp.element". */
	global: string;
	/** WordPress script handle, e.g. "wp-element". */
	handle: string;
}

/** Packages WordPress does not register as scripts; they are bundled. */
const BUNDLED = new Set(['@wordpress/icons', '@wordpress/dataviews', '@wordpress/interface', '@wordpress/fields', '@wordpress/sync', '@wordpress/undo-manager']);

const VENDORS: Partial<Record<string, WpExternal>> = {
	react: { global: 'React', handle: 'react' },
	'react-dom': { global: 'ReactDOM', handle: 'react-dom' },
	'react/jsx-runtime': { global: 'ReactJSXRuntime', handle: 'react-jsx-runtime' },
};

const withoutQuery = (id: string): string => id.split('?', 1)[0] ?? id;

const camel = (s: string): string => s.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Map an import specifier to its WordPress global, or null to bundle it. */
export function wpExternal(specifier: string): WpExternal | null {
	const vendor = VENDORS[specifier];
	if (vendor) {
		return vendor;
	}
	const name = /^@wordpress\/([a-z0-9-]+)$/.exec(specifier)?.[1];
	if (name === undefined || BUNDLED.has(specifier)) {
		return null;
	}
	return { global: `wp.${camel(name)}`, handle: `wp-${name}` };
}

/**
 * Rewrite one static import statement into a destructuring of the global.
 * Supports default, named (with "as"), namespace and side-effect imports.
 */
export function rewriteImport(statement: string, global: string): string {
	const clause = /^import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]\s*;?$/.exec(statement.trim())?.[1];
	if (clause === undefined) {
		// `import '@wordpress/x';` – the global is loaded as a dependency; nothing to bind.
		return '';
	}
	const bindings: string[] = [];
	let rest = clause.trim();

	const namespace = /^\*\s+as\s+([\w$]+)$/.exec(rest);
	if (namespace) {
		return `const ${namespace[1]} = window.${global};`;
	}
	const named = /\{([\s\S]*)\}/.exec(rest);
	if (named?.[1] !== undefined) {
		const specifiers = named[1]
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s !== '' && !s.startsWith('type '))
			.map((s) => s.replace(/\s+as\s+/, ': '));
		if (specifiers.length > 0) {
			bindings.push(`const { ${specifiers.join(', ')} } = window.${global};`);
		}
		rest = rest.replace(named[0], '').replace(/,\s*$/, '').trim();
	}
	const defaultName = rest.replace(/,$/, '').trim();
	if (defaultName !== '') {
		bindings.push(`const ${defaultName} = window.${global};`);
	}
	return bindings.join(' ');
}

export default function wpExternals(options: { root: string }): Plugin {
	/** module id → WP handles it imports */
	const handlesByModule = new Map<string, Set<string>>();

	return {
		name: 'bps-wp-externals',
		enforce: 'post',

		async transform(code, id) {
			if (id.includes('/node_modules/') || !/\.[cm]?[jt]sx?$/.test(withoutQuery(id))) {
				return null;
			}
			await init();
			const [imports] = parse(code);
			let out = '';
			let last = 0;
			const handles = new Set<string>();
			for (const imp of imports) {
				// Static imports only; dynamic imports of WordPress packages are not supported.
				if (imp.type !== 'static' || imp.typeOnly) {
					continue;
				}
				const external = wpExternal(imp.specifier);
				if (!external) {
					continue;
				}
				handles.add(external.handle);
				out += code.slice(last, imp.importStart) + rewriteImport(code.slice(imp.importStart, imp.importEnd), external.global);
				last = imp.importEnd;
			}
			if (handles.size === 0) {
				return null;
			}
			handlesByModule.set(id, handles);
			return { code: out + code.slice(last), map: null };
		},

		generateBundle(_options, bundle: OutputBundle) {
			const chunks = new Map<string, OutputChunk>();
			for (const item of Object.values(bundle)) {
				if (item.type === 'chunk') {
					chunks.set(item.fileName, item);
				}
			}
			// A lazy chunk needs the same globals at runtime, so follow static and dynamic imports.
			const reachableModules = (start: OutputChunk): Set<string> => {
				const modules = new Set<string>();
				const queue = [start];
				const seen = new Set<string>();
				for (let chunk = queue.pop(); chunk; chunk = queue.pop()) {
					if (seen.has(chunk.fileName)) continue;
					seen.add(chunk.fileName);
					chunk.moduleIds.forEach((id) => modules.add(id));
					for (const file of [...chunk.imports, ...chunk.dynamicImports]) {
						const next = chunks.get(file);
						if (next) queue.push(next);
					}
				}
				return modules;
			};
			const rel = (id: string): string => relative(options.root, id).split('\\').join('/');

			const deps: Record<string, string[]> = {};
			// Source file → entries that include it, for `wp i18n make-json --use-map`.
			// PHP reports each entry's translations under its entry path (AssetLoader).
			const i18nMap: Record<string, string[]> = {};
			for (const chunk of chunks.values()) {
				if (!chunk.isEntry || !chunk.facadeModuleId) continue;
				const entry = rel(chunk.facadeModuleId);
				const handles = new Set<string>();
				for (const id of reachableModules(chunk)) {
					handlesByModule.get(id)?.forEach((h) => handles.add(h));
					if (!id.includes('/node_modules/') && !id.startsWith('\0')) {
						(i18nMap[rel(withoutQuery(id))] ??= []).push(entry);
					}
				}
				deps[entry] = [...handles].sort();
			}
			this.emitFile({ type: 'asset', fileName: 'wp-deps.json', source: JSON.stringify(deps, null, '\t') + '\n' });
			this.emitFile({ type: 'asset', fileName: 'i18n-map.json', source: JSON.stringify(i18nMap, null, '\t') + '\n' });
		},
	};
}
