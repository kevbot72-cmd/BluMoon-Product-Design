# PHP tests

## Unit (`tests/php/Unit`)

No WordPress needed. WordPress functions are stubbed with Brain Monkey.

```bash
composer test:unit
```

## Integration (`tests/php/Integration`)

These run against real WordPress + WooCommerce with the official WordPress test library (`wp-phpunit/wp-phpunit`, PHPUnit 9.6; see ADR-0014).

**With wp-env (recommended):**

```bash
npm run env:start
npx wp-env run tests-cli --env-cwd=wp-content/plugins/blumoon-product-design vendor/bin/phpunit -c phpunit-integration.xml.dist
```

**Without Docker** (what CI does), you need a MySQL/MariaDB server:

```bash
WP_DB_HOST=127.0.0.1:3306 WP_DB_PASSWORD=root tests/php/bin/install-wp.sh /tmp/wp          # latest WP + WooCommerce
WP_CORE_DIR=/tmp/wp/wordpress WP_DB_HOST=127.0.0.1:3306 WP_DB_PASSWORD=root composer test:integration
```

Environment variables: `WP_CORE_DIR`, `WP_DB_HOST`, `WP_DB_USER` (root), `WP_DB_PASSWORD` (root), `WP_DB_NAME` (wp_tests), and `BPS_TEST_HPOS=on|off` to force WooCommerce order storage. The database is emptied on every run.

## Restricted networks

Composer downloads GitHub-hosted packages as archives from `api.github.com`. Where those downloads are blocked but `git` works, install from source with a local override that is git-ignored:

1. Shallow-clone the one archive-only package: `git clone --depth 1 --branch <version> https://github.com/phpstan/phpstan.git /tmp/phpstan`
2. Write `composer.local.json` as a copy of `composer.json` plus `"repositories": [{"type": "path", "url": "/tmp/phpstan", "options": {"symlink": false, "versions": {"phpstan/phpstan": "<version>"}}}]`
3. `COMPOSER=composer.local.json composer update --prefer-source`

`composer.json` and `composer.lock` stay untouched, so CI installs normally.
