# Build plan

Status: **Phase 0 complete, waiting for approval.** Nothing in Phase 1+ starts until you sign off on §4 (decisions) and answer §5 (questions).

Phase 0 deliverables:
- `docs/REFERENCE-NOTES.md`: what the four reference plugins do, with line references
- `docs/ARCHITECTURE.md`: system design, packages, rendering, 3D, PHP, print, security, library list and licences
- `docs/DATA-SCHEMA.md`: design document v1, product config v1, entities, tables, pricing rules
- `docs/DECISIONS.md`: ADR-0001 … 0012
- `schema/`: real Zod v1 schemas, generated JSON Schema, example fixtures, validated in Node and PHP
- `docs/prototype/editor-shell.html`: static, clickable prototype of the editor shell (desktop, tablet and mobile layouts)

## 1. Repository layout

```
blumoon-product-studio/
  blumoon-product-studio.php         bootstrap: header, requirement checks, autoload, Plugin::boot()
  uninstall.php                      opt-in data removal
  composer.json  package.json  vite.config.ts  tsconfig.base.json
  phpstan.neon  phpcs.xml  .wp-env.json  playwright.config.ts  .github/workflows/ci.yml
  src/                               PHP, PSR-4 Blumoon\ProductStudio\
    Plugin.php  Container.php  ServiceProvider.php
    Admin/        Menu, AdminApp, ProductTab, ProductListColumn, Health
    Rest/         Controller base, EditorBootstrap, Uploads, Designs, Cart, Print, Admin/*
    Woo/          ProductPage (button/block/shortcode), Cart, StoreApiExtension, Order,
                  OrderAdminMetaBox, Emails, MyAccount, Compat (HPOS/Blocks declarations)
    Domain/       ProductConfig/*, Blueprint/*, Design/*, Pricing/Calculator, Preflight,
                  Units, Schema/Validator (opis), Reanchor
    Infrastructure/ Repository/{Designs,Uploads}, Storage (private dirs, signed URLs),
                  Image/{Pipeline, SvgSanitizer, Heic}, GuestToken, RateLimiter, Settings, Logger
    Jobs/         PrintManifest, PrintPackage, Cleanup, FontDownload, ImportBatch
    Migration/    Tables, Document/V*, Importers/{Lumise, Fpd3d, GalleryBase}
    Privacy/      Exporter, Eraser
  packages/
    shared/         tokens.css, icons.ts, i18n.ts, api.ts, events.ts, hooks.ts
    editor-core/    schema/ (from /schema), store.ts, commands/, units.ts, dpi.ts, reanchor.ts,
                    pricing.ts, preflight.ts, autosave.ts, migrations/
    editor-canvas/  viewport.ts, stage.ts, views/*, objects/{CurvedText, WarpText, QrCode,
                    ImagePlaceholder, CroppableImage}, controls/, crop-mode.ts, snapping.ts,
                    renderer.ts, print-worker.ts
    editor-ui/      App.tsx, Header, Rail, panels/*, ContextToolbar, Inspector, BottomBar,
                    Sheet, Preflight, Toasts, LiveRegion, launcher.ts
    preview-3d/     loader.ts, texture-bridge.ts, scheduler.ts, renderer.ts, controls.ts,
                    picking.ts, snapshot.ts, admin-viewer.ts
    admin/          app/ (React screens), product-tab/, cart-blocks/
  schema/json/      generated JSON Schema (shipped, read by PHP)
  assets/dist/      build output (git-ignored; included in the release zip)
  languages/  examples/sample-addon/
  tests/
    php/          Unit/, Integration/ (WP test suite), fixtures/
    fixtures/     pricing/*.json, documents/*.json, svg-attacks/*, lumise-sample.sql
    e2e/          *.spec.ts (Playwright on wp-env)
  docs/
```

## 2. Milestones

Each milestone ends with lint + all tests green, a commit, and a short summary (what works, what's next, decisions needed).

| Phase | Scope | Accept when |
|---|---|---|
| **0** Discovery & plan | This set of documents, the schema spike and the prototype | You approve |
| **1** Foundation | Bootstrap + requirement checks, Container, Composer, npm workspaces, Vite multi-entry + manifest `AssetLoader`, WP externals plugin, wp-env (WP + Woo + sample products), CI workflow, HPOS/Blocks declarations, settings storage, REST skeleton (`/health` with auth), tables + migrations, guest token, i18n, PHPCS/PHPStan L6/ESLint/Stylelint/tsc, Vitest + PHPUnit + Playwright smoke | Activates cleanly on fresh WP + Woo, CI green, `GET /bps/v1/health` → 200 for admin, 401/403 otherwise |
| **2** Editor core (Template mode, one side) | Schema in editor-core, store + commands + history, Units/Viewport, Stage (base, tint, overlay, area clip + ghost, bleed/safe guides), Text (+ arc/bridge/oblique as vector), upload pipeline (server + client, DPI badge), shapes/clipart + SVG recolour, QR, drawing, layers panel, snapping + guides, keyboard map, desktop shell, autosave + restore | A shopper creates a design with every element type on one side, undoes/redoes 50 steps, and reloading restores it from autosave |
| **3** Image controls, crop, masks, filters, templates | Owner's handle behaviour, native crop mode, masks, filters + ~12 presets with thumbnails, placeholders, admin template builder (editor in admin mode) with permissions | Crop/handles match §7. An admin builds a template with locked/editable elements and the shopper can't break the rules |
| **4** Gallery Mockup + Hybrid | Source resolver + fallbacks, locked base layer, fit, layers below, dimming, gallery-as-sides, visual print-area editor on the product screen with mm calibration, mode switch with carry-over, variation image following | First gallery image locked as base, can't be selected/moved/deleted, elements stay in the drawn area, variation swap keeps elements, the hybrid switch works |
| **5** 3D preview | `bps_model` CPT, admin viewer + mesh mapper + UV test + camera presets + materials/env + optimisation report, FPD folder import. Runtime: lazy chunk, TextureBridge, scheduler, on-demand renderer, controls, side linking, colour link, snapshot, fallback | Updates ≤ ~150 ms after release (≤ 100 ms low-res during drag), no texture growth over 100 edits, works on iOS Safari + Android Chrome |
| **6** Commerce | Pricing (TS + PHP + fixtures), add-to-cart REST (multipart proofs), classic + Blocks cart/mini-cart/checkout, edit-from-cart, order meta, order admin box, emails, My Account designs, save/share links, guest tokens | E2E passes through Blocks checkout, and a tampered client price has no effect |
| **7** Print output | Print worker + chunked resumable upload, manifest, PNG/SVG/PDF (trim/bleed boxes, crop marks), job sheet, ZIP, regenerate, external renderer hook | 300 × 205 mm @ 300 dpi → 3543 × 2421 PNG, PDF boxes correct, SVG text matches the editor |
| **8** UX polish | Tablet/mobile layouts, bottom sheets, gestures, onboarding tour, preflight checklist, theming UI + dark theme, reduced motion, RTL, axe clean | axe clean, keyboard-only path through the full flow, visual regression baselines |
| **9** Importers, privacy, perf, docs, release | Lumise / FPD 3D / gallery-base importers (dry-run, idempotent, batched), GDPR exporters/erasers, retention jobs, bundle budgets in CI, USER-GUIDE, 3D-MODELS, HOOKS, SECURITY, readme.txt, release zip | Release zip installs on a clean site, and the §18 checklist is done |
| **10** v1.x | Perspective quad warp, background-removal hook, 2.5D mockup preview, Node render service | — |

**Suggested working order inside Phase 2**: units/schema/store (headless, fully unit-tested) → Viewport + Stage → Text → layers/selection/history → images + upload → vectors/QR/drawing → snapping/keyboard → shell UI → autosave. This keeps every slice demonstrable.

## 3. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Fabric 7 in a Worker with OffscreenCanvas (fonts, images) may be incomplete | Spike at the start of Phase 7. Fallback: chunked main-thread render with a progress bar (already allowed by the prompt) |
| Curved/bridge text must match exactly between canvas, SVG and PDF | Implement as glyph-path layout (Fabric text → path via font metrics) so all outputs share one path. Golden SVG tests |
| iOS Safari memory with large canvases + WebGL | Cap textures at 1024 on low-memory devices (`navigator.deviceMemory`, max texture size), proofs ≤ 1600 px, release offscreen canvases on side switch |
| HEIC depends on the host's Imagick build | Detect at upload, give a clear message, and convert client-side via a lazy optional decoder only if you want it (Q3) |
| WP + Woo test infrastructure needs network access to wordpress.org | See §6 |
| TypeScript 7 (native compiler) ecosystem maturity (typescript-eslint, Vite plugins) | Verify in Phase 1. Fall back to TS 6.x for type-aware lint if needed, and record it in DECISIONS |

## 4. Decisions to approve (⚠ expensive to reverse)

1. **ADR-0002/0003**: design document as the source of truth, in mm relative to the print area.
2. **ADR-0004**: Zod as the schema author, JSON Schema generated for PHP.
3. **ADR-0007**: Woo products + CPTs + two custom tables (`bps_designs`, `bps_uploads`).
4. **ADR-0011**: print-area geometry normalised to the image instead of the prompt's `rectPx`.
5. **ADR-0012**: PHP 8.2 minimum (the prompt says 8.1, which is now end-of-life).
6. **ADR-0006**: in Gallery mode the photo is the stage; `fit` controls how it fills the viewport.

The rest (Preact, a single Vite build, immer patches) is cheap to change. I'll proceed with them unless you object.

## 5. Open questions (BUILD_PROMPT §19 plus what I found)

1. **Name / slug / text domain / accent.** Keep "Blumoon Product Studio" / `blumoon-product-studio` / `bps`? Accent: your current editor uses violet ≈ `#6C4BE0`. Use that?
2. **Minimum versions.** PHP **8.2** (see ADR-0012), WP 6.6+, Woo 9.x+. What PHP version does production run?
3. **Imagick** on production? It's needed for HEIC, best PDF assembly and CMYK. If not, GD + TCPDF still works, without HEIC or CMYK.
4. **First products.** Your screenshot shows a mug with Right/Left sides. Is the mug the first test product? Which others (signage, frames, apparel)? Do you have GLB models, or only FPD `.fbx` folders to import?
5. **Lumise data**: do templates, cliparts or fonts need importing from a live database? Can you provide a DB export (or confirm the sample SQL is representative)?
6. **Currency / locale**: ZAR, `en_ZA`? Any multi-currency plugin (WOOCS, CURCY, Aelia)?
7. **Guest saving** allowed? Retention for unordered designs and uploads: 30 days?
8. **Print shop formats**: PDF/X required? PNG only? CMYK? Preferred bleed (3 mm?) and crop marks?
9. **Source control**: is there a GitHub repo to push to? Right now the project is a local git repo in this cloud session. **It will be lost when the session ends unless it's pushed somewhere** (or you download it).

## 6. Environment note (this cloud session)

This session's network policy **blocks `wordpress.org`** (`api.wordpress.org`, `downloads.wordpress.org`), so wp-env and the WP PHPUnit suite can't download WordPress or WooCommerce here. npm and Packagist work, and Docker is available. To run the integration and E2E tests from Phase 1 on, allow `wordpress.org` and `downloads.wordpress.org` (plus `github.com` if wp-env pulls from it) in the environment's network settings: [docs](https://code.claude.com/docs/en/cloud-environments#network-access). Until then I can build and unit-test everything that doesn't need a running WordPress, and I'll say clearly which tests didn't run.
