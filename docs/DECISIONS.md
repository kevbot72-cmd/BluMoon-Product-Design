# Architecture decision records

Format: context → decision → consequences. All ADRs below were approved on 2026-10-25 unless marked otherwise. Items marked ⚠ are expensive to reverse, and I'm asking for explicit sign-off on them (PLAN.md §4).

---

## ADR-0001 Preact + signals for the shopper UI; React only in wp-admin — Accepted
**Context.** The shell budget is ≤ 150 KB gz excluding Fabric. React 18/19 + ReactDOM alone is ~45 KB gz. `@wordpress/element` would also pull in WP's React on the storefront, where it isn't otherwise loaded.
**Decision.** The shopper editor uses Preact 11 + `@preact/signals` (~6 KB gz). The admin uses React through `@wordpress/components` and `@wordpress/dataviews` to look native. The admin template builder and print-area editor embed the shopper editor through a framework-neutral `mountEditor(el, {capability: 'admin'})`, rendered with Preact inside a React-owned DOM node.
**Consequences.** Two UI runtimes, but never on the same page for shoppers. Shared code (`editor-core`, `editor-canvas`) is framework-free TypeScript.

## ADR-0002 The design document is the single source of truth ⚠ — Accepted
**Context.** Lumise saved raw Fabric JSON in screen space with `product_width` and `devicePixelRatio`, tying designs to a screen and a Fabric version.
**Decision.** Persist only a versioned `DesignDocument` (DATA-SCHEMA.md). Fabric objects are derived from it, and edits flow back as commands. Fabric's `toJSON()` is never stored.
**Consequences.** We write two-way element mappers and keep them tested. Upgrading Fabric or rendering on the server needs no data migration.

## ADR-0003 Millimetres relative to the print area ⚠ — Accepted
**Decision.** Every element stores mm relative to its print area's top-left. One `Viewport` per side converts to screen pixels. Fonts are in pt and crop in 0–1.
**Consequences.** Designs survive base-image swaps, variation changes, mode switches, screen sizes and any export DPI. Print maths is trivial and unit-tested (300 × 205 mm at 300 dpi = 3543 × 2421 px).

## ADR-0004 Zod authors the schema; JSON Schema is generated for PHP ⚠ — Accepted
**Context.** The prompt asks for Zod on the client and JSON Schema (opis) on the server. Two hand-written schemas would drift.
**Decision.** Zod 4 is the only hand-written schema. `z.toJSONSchema(…, {target: 'draft-2020-12', io: 'input', reused: 'ref'})` generates `schema/json/*.json`, which is committed and shipped. CI fails if regenerating changes the files.
**Consequences.** Spike done: generated schemas validate the examples in opis 2.6 and reject tampering. Some Zod refinements (cross-field rules) can't be expressed in JSON Schema. Those live in a small `DocumentRules` checker with TS and PHP twins, covered by shared fixtures.

## ADR-0005 Commands + immer patches for undo/redo — Accepted
**Decision.** All document mutations are commands run through immer `produceWithPatches`. History stores patches and inverse patches, capped at 100. Live gesture updates share a `coalesceKey` and merge into one history entry on commit.
**Consequences.** Tiny history memory. The base layer, selection and zoom are never in history. Commands double as the public `window.bps.editor` mutation API.

## ADR-0006 Gallery mode: the photo is the stage — Accepted
**Context.** The owner's add-on fitted the gallery photo *into FPD's printing box* (contain/cover). In the new design, the admin draws the print area *on* the photo, so the photo defines the stage.
**Decision.** In Gallery mode, the photo is the side's stage and is never scaled relative to the print area. `fit: contain|cover` decides how the photo fills the editor viewport (contain = whole photo visible, the default; cover = fills the canvas, edges may be off-screen until the shopper pans).
**Consequences.** The add-on's visual result for "contain" is preserved. `cover` changes meaning slightly. The importer maps it 1:1 and notes this in the release notes.

## ADR-0007 Woo products as the source of truth; custom tables only for designs and uploads ⚠ — Accepted
**Decision.** Use CPTs for blueprints, templates, fonts, models and print methods; attachments for assets; `_bps_config` meta on products; and custom tables only for `bps_designs` and `bps_uploads` (high-volume, guest-owned, expiring).
**Consequences.** No Lumise-style shadow products or orders. Orders are standard HPOS orders with item meta.

## ADR-0008 Pricing: one pure function, two implementations, shared fixtures — Accepted
**Decision.** `pricing.ts` gives the live preview. `Calculator.php` is authoritative and recomputed at add-to-cart and every cart load. Both run `tests/fixtures/pricing/*.json` in CI.
**Consequences.** The client can't tamper with the price. The cost is keeping two small implementations in step, which the fixtures enforce.

## ADR-0009 One renderer for canvas, proofs, 3D textures and print — Accepted
**Decision.** `DocumentRenderer` (Fabric `StaticCanvas` built from the document) produces proofs, 3D textures (into persistent offscreen canvases) and print PNGs. Print renders run in the shopper's browser after add-to-cart, with the admin's browser as fallback and a hook for an external Node renderer.
**Consequences.** Pixel parity between editor, 3D and print. Print files depend on a browser having run. The order admin always shows status and a "Render now" action.

## ADR-0010 One bundler (Vite) for storefront and admin — Accepted
**Context.** The prompt suggests `@wordpress/scripts` (webpack) for admin and Vite for the editor. The admin embeds editor packages, so two bundlers would build the same source twice with different configs.
**Decision.** Vite 8 builds all entries. A small plugin externalises `@wordpress/*` to `wp.*` globals and records WP script dependencies in the manifest. `@wordpress/scripts` stays only for its lint configs if useful.
**Consequences.** One build, one manifest, one dev server. We maintain a ~60-line externals plugin.

## ADR-0011 Print-area geometry normalised to the image, not pixels ⚠ — Accepted
**Context.** The prompt's example stores `rectPx`. WordPress regenerates image sizes, and owners replace photos, which silently breaks pixel rectangles (the same class of bug as Lumise's `ez_ratio`).
**Decision.** Store `rect`/`quad` in 0–1 of the base image, plus `ImageRef.widthPx/heightPx` for reference. Lock the rect aspect to `sizeMm`.
**Consequences.** The importer converts Lumise/FPD pixel boxes using the image size at import time.

## ADR-0012 Minimum PHP version ⚠ — Accepted (PHP 8.2)
**Context.** The prompt says PHP 8.1+. PHP 8.1 reached end of security support on 31 Dec 2025. TCPDF 7.x (current) requires PHP ≥ 8.2. TCPDF 6.11 still supports 8.1.
**Decision.** PHP 8.2 minimum and TCPDF 7. Production runs the latest PHP; CI tests 8.2 and the latest.

## ADR-0013 TypeScript 6.0 instead of 7.0 — Accepted (Phase 1)
**Context.** TypeScript 7.0 (the native compiler) is the latest release, but typescript-eslint 8.72 supports TypeScript `>=4.8.4 <6.1.0`, and type-aware linting is part of the quality gate.
**Decision.** Pin TypeScript 6.0.3. Revisit when typescript-eslint supports 7.x.
**Consequences.** Slower type checks than TS 7. No code changes are expected when upgrading.

## ADR-0014 PHPUnit 9.6 for both PHP suites — Accepted (Phase 1)
**Context.** The WordPress test library (wordpress-develop, `wp-phpunit/wp-phpunit` 7.1) supports PHPUnit up to 9.x with the Yoast polyfills. PHPUnit 13 is current.
**Decision.** PHPUnit 9.6 + yoast/phpunit-polyfills 2 for unit and integration suites, so there is one test runner. Brain Monkey stubs WordPress in unit tests.
**Consequences.** Tests use `set_up()`/`tear_down()` (polyfill names). Upgrade when WordPress core moves to a newer PHPUnit.

## ADR-0015 ES-module entries loaded as classic script handles — Accepted (Phase 1)
**Context.** Vite emits ES modules with code splitting. WordPress's script-module API can't depend on classic scripts (`wp-element`, `wp-i18n`) or use `wp_set_script_translations()`.
**Decision.** Register each entry with `wp_register_script()` and print it as `type="module"` (plus `modulepreload` links for its chunks) via `script_loader_tag`. A Vite plugin maps `@wordpress/*` and React imports to the globals WordPress provides and records the handles in `wp-deps.json`. Translations are looked up under the stable entry path (`load_script_textdomain_relative_path`), and the build writes `i18n-map.json` for `wp i18n make-json --use-map`.
**Consequences.** Dependencies, translations and module loading all work with standard WordPress APIs. Module scripts are deferred, so they run after their classic dependencies.
