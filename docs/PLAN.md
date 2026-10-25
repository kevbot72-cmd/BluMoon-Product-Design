# Build plan

Status: **Phase 1 complete (2026-10-25).** Answers are recorded in §5. Next: Phase 2, editor core.

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

## 5. Answers from the owner (2026-10-25)

| # | Question | Answer | Consequence |
|---|---|---|---|
| 1 | Name / prefix / accent | Keep "Blumoon Product Studio", `bps`, `Blumoon\ProductStudio`; accent `#6C4BE0` | Default theme token `--bps-accent: #6c4be0` |
| 2 | PHP version | Production runs the latest PHP | ADR-0012 accepted: **PHP 8.2 minimum**, TCPDF 7. CI tests 8.2 and the latest |
| 3 | Imagick | Installed | HEIC, PDF assembly and CMYK via Imagick are in scope. GD remains a fallback |
| 4 | 3D models | Existing FPD `.fbx` folders | FPD 3D importer is required (Phase 9 importer, FBX runtime loading in Phase 5) |
| 5 | Lumise data | Templates, clipart and fonts must be imported | Lumise importer covers these three first. A live DB export will be needed for testing |
| 6 | Currency | ZAR only | No multi-currency integration in v1; prices formatted through Woo |
| 7 | Guest saving | A setting the owner chooses | `Settings › General › Allow guest design saving` (on/off) + retention days |
| 8 | Print output | PDF with crop marks and bleed | PDF is the primary print file; crop marks on, bleed default 3 mm (per print area) |
| 9 | Source control | https://github.com/kevbot72-cmd/BluMoon-Product-Design | Pushing needs the Claude GitHub App installed on the repo |

## 6. Environment note (this cloud session)

`wordpress.org` is reachable as of Phase 1. Docker runs, but Docker Hub may rate-limit pulls; the WP integration suite can also run against a local MariaDB without Docker (see `tests/php/README.md`).
