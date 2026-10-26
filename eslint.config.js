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
			// noUncheckedIndexedAccess already forces every index access to be acknowledged; `!` is that acknowledgement.
			'@typescript-eslint/no-non-null-assertion': 'off',
			// `onClick={() => select(id)}` is the normal JSX handler idiom.
			// `const { a: _a, ...rest } = x` is how we drop keys.
			'@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
			'@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
		},
	},
	{
		files: ['packages/admin/**/*.tsx'],
		plugins: { 'react-hooks': reactHooks },
		rules: reactHooks.configs.recommended.rules,
	},
	{
		// The compiler-oriented rules treat signal writes (`model.x.value = …`) as prop mutation.
		files: ['packages/editor-ui/**/*.tsx'],
		plugins: { 'react-hooks': reactHooks },
		rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
	},
	{
		files: ['tools/**', '*.config.{js,ts}', 'tests/**', '**/*.test.ts'],
		languageOptions: { globals: { ...globals.node } },
	},
);
