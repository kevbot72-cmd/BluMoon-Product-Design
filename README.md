# Blumoon Product Studio

A WooCommerce product designer with a live 3D preview. Shoppers personalise products with text, photos, shapes, QR codes and clipart, either on an admin-built blueprint (Template mode) or directly on the product photo (Gallery Mockup mode).

**Status:** Phase 2 of the plan in [`docs/PLAN.md`](docs/PLAN.md). The shopper editor works in Template mode with text (including arc, bridge and oblique effects), photos, shapes, clipart, QR codes and drawing, plus undo/redo and autosave. Carts and orders arrive in Phase 6.

## Requirements

PHP 8.2+, WordPress 6.6+, WooCommerce 9.0+. Imagick is recommended (HEIC uploads, CMYK, PDF features).

## Install

Download `blumoon-product-studio.zip` from the latest CI run (artifact **blumoon-product-studio**) and upload it under *Plugins › Add New › Upload*. After activation, open **Product Studio** in wp-admin and check that the system health report is green.

Until the visual print-area editor arrives (Phase 4), make a product customisable with WP-CLI:

```bash
wp bps blueprint-import tests/fixtures/blueprint-mug.json --title="Mug" --porcelain   # prints the blueprint id
wp bps product-enable <product-id> --blueprint=<blueprint-id>
```

The product page then shows a **Customize** button.

## Develop

```bash
composer install
npm ci
npm run build            # assets/dist (Vite)
npm run env:start        # wp-env: WordPress + WooCommerce on http://localhost:8888 (tests site :8889)
```

Set `define( 'BPS_VITE_DEV_SERVER', 'http://localhost:5173' );` in `wp-config.php` and run `npm run dev` to load assets from the Vite dev server with hot reload.

| Task | Command |
|---|---|
| PHP lint / static analysis | `composer lint` · `composer analyse` |
| PHP unit tests (no WordPress) | `composer test:unit` |
| PHP integration tests (real WP + Woo) | see [`tests/php/README.md`](tests/php/README.md) |
| TypeScript / ESLint / Stylelint | `npm run typecheck` · `npm run lint` |
| JS unit tests | `npm test` |
| Regenerate JSON Schema from Zod | `npm run schema` |
| E2E (Playwright, against wp-env; seeds a demo mug) | `npm run test:e2e` |
| Release zip | `npm run release` → `dist/blumoon-product-studio.zip` |

## Layout

```
blumoon-product-studio.php   bootstrap (requirement checks, autoload)
src/                         PHP, PSR-4 Blumoon\ProductStudio\
packages/editor-core/        design document schema (Zod), store, commands, undo/redo (headless)
packages/editor-canvas/      Fabric stage: element views, text effects, snapping, viewport
packages/editor-ui/          Preact shopper editor and product-page launcher
packages/admin/              wp-admin React app
schema/json/                 JSON Schema generated from Zod, validated in PHP
tools/                       Vite WordPress-externals plugin, release script
tests/php, tests/e2e         PHPUnit (unit + integration), Playwright
docs/                        architecture, plan, decisions, schema, hooks
```

`reference/` (the discontinued Lumise and Fancy Product Designer plugins, studied for behaviour only) is git-ignored and never shipped. See `docs/ARCHITECTURE.md` §12.

## Licence

GPL-2.0-or-later.
