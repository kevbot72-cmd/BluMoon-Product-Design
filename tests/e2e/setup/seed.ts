/**
 * Seed the E2E site: mug blank, clipart, product, blueprint, enabled.
 *
 * Uses WP-CLI, so it works against wp-env (default) or any site:
 *   WP_CLI="php wp-cli.phar --path=/srv/site" SEED_DIR=/abs/tests/e2e/setup node tests/e2e/setup/seed.ts
 */
import { execFileSync } from 'node:child_process';

const wp = process.env.WP_CLI?.split(' ') ?? ['npx', 'wp-env', 'run', 'tests-cli', 'wp'];
// Where seed.php and the blueprint file live as seen by WP-CLI (inside the container for wp-env).
const dir = process.env.SEED_DIR ?? 'wp-content/plugins/blumoon-product-design/tests/e2e/setup';
// Inside the plugin folder: wp-env runs each command in a fresh container, so /tmp isn't shared.
const blueprintFile = process.env.SEED_TMP ?? `${dir}/.seed-blueprint.json`;

const run = (...args: string[]): string => execFileSync(wp[0]!, [...wp.slice(1), ...args], { encoding: 'utf8' }).trim();

const output = run('eval-file', `${dir}/seed.php`, blueprintFile);
const product = /product=(\d+)/.exec(output)?.[1];
if (!product) {
	throw new Error(`Seeding failed:\n${output}`);
}
const blueprint = run('bps', 'blueprint-import', blueprintFile, '--title=E2E Mug', '--porcelain').split('\n').pop()!;
run('bps', 'product-enable', product, `--blueprint=${blueprint}`);
console.log(`Seeded product ${product} with blueprint ${blueprint}.`);
