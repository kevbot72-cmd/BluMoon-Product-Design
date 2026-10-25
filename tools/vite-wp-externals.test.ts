import { describe, expect, it } from 'vitest';
import { rewriteImport, wpExternal } from './vite-wp-externals.ts';

describe('wpExternal', () => {
	it('maps WordPress packages to wp.* globals and handles', () => {
		expect(wpExternal('@wordpress/element')).toEqual({ global: 'wp.element', handle: 'wp-element' });
		expect(wpExternal('@wordpress/api-fetch')).toEqual({ global: 'wp.apiFetch', handle: 'wp-api-fetch' });
		expect(wpExternal('@wordpress/block-editor')).toEqual({ global: 'wp.blockEditor', handle: 'wp-block-editor' });
	});

	it('maps React to the globals WordPress registers', () => {
		expect(wpExternal('react')).toEqual({ global: 'React', handle: 'react' });
		expect(wpExternal('react/jsx-runtime')).toEqual({ global: 'ReactJSXRuntime', handle: 'react-jsx-runtime' });
	});

	it('bundles packages WordPress does not ship and everything else', () => {
		expect(wpExternal('@wordpress/icons')).toBeNull();
		expect(wpExternal('@wordpress/dataviews')).toBeNull();
		expect(wpExternal('@wordpress/components/build-style/style.css')).toBeNull();
		expect(wpExternal('zod')).toBeNull();
	});
});

describe('rewriteImport', () => {
	it('rewrites named imports, including aliases', () => {
		expect(rewriteImport("import { Card, Notice as N } from '@wordpress/components';", 'wp.components')).toBe(
			'const { Card, Notice: N } = window.wp.components;',
		);
	});

	it('rewrites default + named imports', () => {
		expect(rewriteImport("import apiFetch, { createNonceMiddleware } from '@wordpress/api-fetch'", 'wp.apiFetch')).toBe(
			'const { createNonceMiddleware } = window.wp.apiFetch; const apiFetch = window.wp.apiFetch;',
		);
	});

	it('rewrites namespace imports', () => {
		expect(rewriteImport('import * as i18n from "@wordpress/i18n";', 'wp.i18n')).toBe('const i18n = window.wp.i18n;');
	});

	it('drops side-effect imports', () => {
		expect(rewriteImport("import '@wordpress/components';", 'wp.components')).toBe('');
	});

	it('handles multi-line imports', () => {
		expect(rewriteImport("import {\n\tjsx as _jsx,\n\tjsxs,\n} from 'react/jsx-runtime';", 'ReactJSXRuntime')).toBe(
			'const { jsx: _jsx, jsxs } = window.ReactJSXRuntime;',
		);
	});
});
