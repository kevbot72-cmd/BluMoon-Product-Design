// Runs after `wp-env start`: pretty permalinks (REST at /wp-json) and a live ZAR store
// (new WooCommerce installs start in "coming soon" mode, hiding products from guests),
// on both the development and the tests site.
import { execFileSync } from 'node:child_process';

const commands = [
	['rewrite', 'structure', '/%postname%/', '--hard'],
	['option', 'update', 'woocommerce_currency', 'ZAR'],
	['option', 'update', 'woocommerce_default_country', 'ZA:GP'],
	['option', 'update', 'woocommerce_coming_soon', 'no'],
	['option', 'update', 'woocommerce_onboarding_profile', '{"skipped":true}', '--format=json'],
];
for (const env of ['cli', 'tests-cli']) {
	for (const args of commands) {
		execFileSync('npx', ['wp-env', 'run', env, 'wp', ...args], { stdio: 'inherit' });
	}
}

// Fixture product, blueprint and clipart for the editor tests (tests site only).
execFileSync('node', ['tests/e2e/setup/seed.ts'], { stdio: 'inherit' });
