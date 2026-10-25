import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{ ignores: ['*.config.js', 'assets/dist/', 'dist/', 'vendor/', 'reference/', 'node_modules/', 'test-results/', 'playwright-report/'] },
	js.configs.recommended,
	...tseslint.configs.strictTypeChecked,
	{
		languageOptions: {
			globals: { ...globals.browser },
			parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
		},
		rules: {
			'@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
		},
	},
	{
		files: ['packages/admin/**/*.tsx'],
		plugins: { 'react-hooks': reactHooks },
		rules: reactHooks.configs.recommended.rules,
	},
	{
		files: ['tools/**', '*.config.{js,ts}', 'tests/**', '**/*.test.ts'],
		languageOptions: { globals: { ...globals.node } },
	},
	{
		// Tests index into fixtures they define; the non-null assertions are deliberate.
		files: ['**/*.test.ts'],
		rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
	},
);
