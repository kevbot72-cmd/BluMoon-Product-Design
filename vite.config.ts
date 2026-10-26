import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import wpExternals from './tools/vite-wp-externals.ts';

const root = import.meta.dirname;

/**
 * Every entry point PHP can register, keyed by its source path; the same key
 * appears in the manifest and in wp-deps.json (AssetLoader reads both).
 */
export const entries = ['packages/admin/src/main.tsx', 'packages/editor-ui/src/launcher.ts'];

/** packages/admin/src/main.tsx → "admin"; packages/editor-ui/src/launcher.ts → "editor-ui-launcher". */
const entryName = (entry: string): string => {
	const [, pkg = entry, , file = 'main'] = entry.split('/');
	const base = file.replace(/\.[jt]sx?$/, '');
	return base === 'main' ? pkg : `${pkg}-${base}`;
};

export default defineConfig({
	root,
	// Chunks and assets are loaded relative to the entry file, wherever the plugin is installed.
	base: './',
	plugins: [wpExternals({ root })],
	build: {
		outDir: 'assets/dist',
		emptyOutDir: true,
		manifest: true,
		target: 'es2022',
		sourcemap: true,
		rolldownOptions: {
			// packages/<name>/src/<file> → js/<name>-<file>-[hash].js
			input: Object.fromEntries(entries.map((entry) => [entryName(entry), resolve(root, entry)])),
			output: {
				// Fabric is large and changes rarely: its own long-cached chunk.
				codeSplitting: { groups: [{ name: 'fabric', test: /node_modules[\\/]fabric[\\/]/ }] },
				entryFileNames: 'js/[name]-[hash].js',
				chunkFileNames: 'js/[name]-[hash].js',
				assetFileNames: 'assets/[name]-[hash][extname]',
			},
		},
	},
	server: {
		// The WordPress site loads entries cross-origin from the dev server (BPS_VITE_DEV_SERVER).
		cors: true,
		origin: 'http://localhost:5173',
	},
});
