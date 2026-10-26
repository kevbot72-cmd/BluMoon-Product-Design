/** @type {import('stylelint').Config} */
export default {
	extends: ['stylelint-config-standard'],
	rules: {
		// BEM block__element--modifier class names.
		// Compares selectors across unrelated components (e.g. a toast's icon button vs. the generic hover state).
		'no-descending-specificity': null,
		'selector-class-pattern': ['^[a-z][a-z0-9-]*(__[a-z0-9-]+)?(--[a-z0-9-]+)?$', { message: 'Use BEM: block__element--modifier' }],
	},
};
