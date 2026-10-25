# Blumoon Product Studio — Architecture

Status: **approved 2026-10-25.** Name `Blumoon Product Studio`, slug `blumoon-product-studio`, prefix `bps`, namespace `Blumoon\ProductStudio`, accent `#6C4BE0`.

## 1. What we are building

A WooCommerce plugin with three parts:

1. **A shopper editor.** It opens as a full-screen overlay from the product page. The shopper designs on a product in **Template mode** (an admin blueprint), **Gallery Mockup mode** (the product photo as a locked base layer), or both (**Hybrid**).
2. **A live 3D preview.** It textures a GLB model's printable meshes from the design while the shopper edits.
3. **Commerce and production.** A server-priced add-to-cart, design snapshots on orders, and reproducible print files (PNG / SVG / PDF / job sheet / ZIP).

Lumise supplies the feature set and the commerce flow. FPD supplies only the 3D texturing idea. The two Blumoon add-ons are built in as native features. See `REFERENCE-NOTES.md` for what was learned from each.

## 2. Guiding decisions

| # | Decision | Why | ADR |
|---|---|---|---|
| 1 | **The design document is the single source of truth.** Fabric is a view of it. | Lumise persisted raw Fabric JSON in screen space. That ties designs to a screen size and a Fabric version. | 0002 |
| 2 | **Millimetres relative to the print area** for every element. | Survives base-image swaps, variation changes, mode switches, any screen, and any export DPI. | 0003 |
| 3 | **Zod is the schema author.** JSON Schema is generated from it and validated in PHP with opis. | One definition, no drift between client and server. | 0004 |
| 4 | **Commands + immer patches** for undo/redo, with drags coalesced. | Small memory, precise history, and the same commands serve the API. | 0005 |
| 5 | **Preact + signals** for the shopper UI. React (`@wordpress/components`) for wp-admin. The editor mounts inside admin through `mountEditor()`. | Keeps the shell under the 150 KB gz budget. Admin looks native. | 0001 |
| 6 | **The same TS renderer** draws the canvas, proofs, 3D textures and print files. | Pixel-for-pixel parity (BUILD_PROMPT §12). | 0009 |
| 7 | **Woo products are the source of truth.** Use CPTs for definitions and custom tables only for designs and uploads. | No parallel product or order tables like Lumise has. | 0007 |
| 8 | **The pricing function exists in TS and PHP**, kept in step by a shared fixture file. PHP is authoritative. | Live preview price, with no way to tamper with it. | 0008 |

## 3. System overview

```
 Product page (classic or block theme)
   │  [Customize] button (hook / block / shortcode) ── loads ~3 KB launcher only
   ▼
 Launcher ── history.pushState(#customize) ── lazy import()
   ▼
 ┌───────────────────────── Shopper editor (Preact) ─────────────────────────┐
 │ editor-ui      shell, rail, panels, sheets, toolbar, inspector, a11y      │
 │   │ reads signals / dispatches commands                                   │
 │ editor-core    DesignDocument, Store, Commands, Units, Pricing, Preflight │
 │   │ events: design:changed, side:changed, selection:changed …             │
 │ editor-canvas  Fabric 7 adapter: Viewport, Stage, element views,          │
 │                CurvedText/Warp/QR/Placeholder, crop mode, snapping,       │
 │                DocumentRenderer (StaticCanvas) for proofs, textures, print│
 │ preview-3d     three.js (lazy chunk): ModelLoader, TextureBridge,         │
 │                OnDemandRenderer, Controls, Raycast side-link, Snapshot    │
 └──────────────┬─────────────────────────────────────────────────────────────┘
                │ REST /wp-json/bps/v1 (nonce + guest token cookie)
 ┌──────────────▼─────────────────────── PHP (Blumoon\ProductStudio) ───────┐
 │ Rest/      controllers (editor bootstrap, uploads, designs, cart, print) │
 │ Domain/    ProductConfig, Blueprint, DesignDocument, Pricing, Preflight  │
 │ Woo/       product tab, cart (classic + Store API), order, emails, My acct│
 │ Infrastructure/ repositories ($wpdb), storage, image pipeline, signing   │
 │ Jobs/      Action Scheduler: print manifest, PDF/ZIP assembly, cleanup   │
 │ Admin/     React app bootstrap, settings, health                         │
 │ Migration/ table migrations, schema migrations, importers                │
 └──────────────────────────────────────────────────────────────────────────┘
```

## 4. Front-end packages (`packages/`)

One npm workspace, one Vite build with multiple entries and code splitting.

| Package | Contents | Depends on | Budget |
|---|---|---|---|
| `shared` | design tokens (CSS vars), Lucide icons (tree-shaken inline SVG), i18n (`@wordpress/i18n`), REST client, event bus, hooks wrapper | — | small |
| `editor-core` | Zod schemas, `DesignDocument` types, migrations, `Store`, command set, `Units` (mm ↔ px ↔ in), DPI calc, `pricing.ts`, `preflight.ts`, autosave (idb-keyval) | shared, zod, immer | ≤ 45 KB gz |
| `editor-canvas` | Fabric adapter (§6), custom objects, controls, crop mode, snapping, `DocumentRenderer` | editor-core, fabric | Fabric as its own chunk |
| `editor-ui` | Preact shell, panels, contextual toolbar, inspector, bottom sheets, preflight dialog, toasts, live region | editor-core, editor-canvas, preact, @preact/signals, @floating-ui/dom | shell ≤ 150 KB gz (with core) |
| `preview-3d` | three.js runtime | editor-core, three | lazy, only when a model is mapped |
| `admin` | React wp-admin app (DataViews lists, blueprint editor, print-area editor, model mapper, settings) and the product-tab app | `@wordpress/*` (as WP globals), editor-ui (admin mode) | admin only |

Entry points: `launcher` (product page), `editor` (lazy), `preview3d` (lazy), `admin`, `product-tab`, `cart-blocks` (Store API front-end filter), `print-worker` (Web Worker).

**Build**: Vite 8 in library mode emits hashed assets plus `manifest.json`. PHP `AssetLoader` reads the manifest and registers scripts with `wp_register_script_module` / `wp_register_script`, translations and dependencies. `@wordpress/*` imports in the admin entries are externalised to `wp.*` globals by a small Vite plugin, which also writes the WP dependency list (the same job `@wordpress/dependency-extraction-webpack-plugin` does). That keeps one bundler (ADR-0010).

## 5. The design document and the store

```
DesignDocument (schemaVersion 1)
 ├─ productId, variationId, mode ('template'|'gallery'), blueprintId?, units:'mm'
 ├─ sides: { [sideId]: { printAreas: { [areaId]: { elements: Element[] } } } }
 ├─ options: { productColor?, … }
 └─ meta: { createdWith, templateId?, … }
Element = Text | Image | Shape | Clipart | QR | Path(drawing) | Placeholder | Group
 common: id, type, x, y, w, h (mm, print-area top-left), rotation°, flipX/Y,
         opacity, locks{}, hidden, name, permissions?, meta{}
```

Full schema: `DATA-SCHEMA.md`.

**Store** (`editor-core/store.ts`): holds `{doc, ui}`. `doc` changes only through `dispatch(command)`. A command is `{type, apply(draft), label, coalesceKey?}`. Execution uses immer `produceWithPatches`. The history stack stores `{patches, inversePatches, label}`, capped at 100. Commands with the same `coalesceKey` within one gesture (drag, slider scrub) merge into one entry. The base layer and other non-document state (zoom, selection) never enter history.

**Events**: a typed bus emits `design:changed {sideId, areaId, elementIds, phase:'live'|'commit'}`, `side:changed`, `element:added|updated|removed`, `selection:changed`, `mode:changed`, `price:changed`. Public JS extension points go through `@wordpress/hooks` (`bps.editor.tools`, …) and `window.bps.editor` (BUILD_PROMPT §15).

## 6. Canvas adapter (Fabric 7)

**World space = side millimetres.** Each side has a *stage rectangle* in mm:
- **Template mode**: the base image's size in mm, derived from its print-area calibration (print-area px on the image + mm size → px/mm for the image).
- **Gallery mode**: the photo's size in mm, derived the same way from the admin's print-area rectangle and its calibrated mm size.

Print areas sit at mm offsets inside the stage. An element's world position = `area.offset + element.(x, y)`.

**Viewport** (one per side): `screenPx = (worldMm × pxPerMm × zoom + pan) × dpr`. It maps to Fabric's `viewportTransform` and is the only place that knows screen pixels. Fit-to-screen, zoom-to-selection, pinch and wheel all change only the Viewport.

**Layer stack per side** (bottom → top):
1. `productColor` tint (if the blueprint has colours), drawn as a mask-clipped fill so only the product silhouette tints, not a rectangle
2. *N* template layers kept below the base (`baseLayersBelow`)
3. base image (template blank or gallery photo), locked (§7)
4. design elements, in a Fabric `Group`-free flat list, clipped per area with `clipPath` (absolutePositioned rect/ellipse/path)
5. overlay image (shading) with `globalCompositeOperation: multiply` or `screen`
6. guides: print area, bleed, safe zone, snapping lines, grid (a separate top layer, never exported)

**Element views**: `ElementView` classes map document element ↔ Fabric object in both directions (`toFabric(el, viewport)` and `fromFabric(obj) → Partial<Element>`). Fabric `object:moving / scaling / rotating` dispatch `live` commands with a coalesce key. `object:modified` dispatches the `commit`. Custom Fabric subclasses: `CurvedText` (text on an arc, both directions), `WarpText` (bridge/oblique as vector path warps, no raster), `QrCode` (vector paths from `qrcode`), `ImagePlaceholder` (frame + inner image with its own pan/zoom), `CroppableImage` (normalised crop rect + mask + filter chain).

**Image controls** (owner add-on): all 8 handles, `lockUniScaling` off by default with a toolbar toggle, `centeredScaling: false` (Alt = centred), Shift snaps rotation to 15°. **Crop mode**: the image shows full-bleed, faded, with a crop box that has its own 8 opposite-edge handles. Presets are free, 1:1, 4:3, 16:9 and area ratio. The toolbar is hidden, with Apply / Cancel / Reset. The result is stored as `crop: {x, y, w, h}` in 0–1 of the source image.

**DocumentRenderer**: builds a Fabric `StaticCanvas` from the document for any `{side, area, region, pxPerMm, include: {base, overlay, dimmed, guides:false}}`. It serves the 2D proof, cart thumbnails, 3D textures and print PNGs. It runs on the main thread, or in a Worker with OffscreenCanvas where Fabric supports it (ADR-0009).

## 7. Customisation modes

**Mode resolver** (PHP `ProductConfigResolver`, mirrored in TS): product `_bps_config` → per-variation override → filters `bps/product/config` and `bps/gallery_mode/config` → the editor bootstrap payload. Fallback chain for the gallery base image: `first_gallery_image → featured_image → variation_image → attachment` (BUILD_PROMPT §5.2), starting from the configured source.

**Base layer** (Gallery mode) is **not a document element**. It is stage state (`side.base`), rendered as a Fabric image with `selectable:false, evented:false, excludeFromExport:true` (proof and print use the renderer's `include.base` flag instead), and is skipped by select-all, history and z-order commands. In the Layers panel it is a fixed, greyed "Product photo" row with a lock icon. Template layers can sit under it (`baseLayersBelow`), and dimmed template layers get `templateOpacity` (all, or only `dimOnlyLayerTitles`), which applies to proof, 3D and, by flag, print.

**Mode switch (hybrid)**: a dialog offers "Keep my text and images" / "Start fresh". Carry-over re-anchors each element by its centre's **relative** position in the old area (0–1) to the new area and scales it to fit if it overflows. This is the same function used for variation swaps and base-image changes (`reanchor.ts`, unit-tested).

## 8. 3D preview (lazy chunk)

```
design:changed ─► TextureScheduler ─(live: ≤512 px, ≥100 ms apart)──┐
                                   ─(commit/idle: full res ≤2048)───┤
                                                                    ▼
             DocumentRenderer.renderInto(offscreenCanvas[mapping]) ─► CanvasTexture.needsUpdate=true
                                                                    ▼
                                         OnDemandRenderer.invalidate() ─► one frame
```

- **ModelLoader**: GLTFLoader + DRACO + KTX2 + Meshopt (decoders served from the plugin, never a CDN), and FBXLoader only for legacy FPD imports. URLs are versioned by attachment hash, so the browser cache works.
- **TextureBridge**: one offscreen canvas and one `CanvasTexture` **per mapping** (`mesh ← side/area/uvRect`), with `colorSpace = SRGB`, max anisotropy and mipmaps. `flipY` and a 0/90/180/270 rotation per mapping. The same texture is reused for the session and disposed on teardown. A texture-version counter is exposed for the e2e test.
- **OnDemandRenderer**: renders only when invalidated (controls change, damping, texture update, auto-rotate, resize). Pauses through IntersectionObserver and `visibilitychange`. Handles `webglcontextlost/restored` by rebuilding GPU resources from the retained canvases.
- **Controls**: OrbitControls with damping, polar/distance limits from the model config, pan off. Double-click/tap resets. Buttons: reset, auto-rotate, expand/fullscreen, side presets. Side change animates the camera (instant under `prefers-reduced-motion`). A raycast click on a printable mesh switches the 2D side.
- **Colour link**: product colour or variation attribute → `color-linked` meshes' `material.color`.
- **Fallback**: no WebGL2, or a load error → the 3D card switches to the 2D proof with a quiet notice. The editor is unaffected.

## 9. PHP architecture

- `blumoon-product-studio.php`: header, requirement checks (PHP/WP/Woo versions; shows an admin notice and stops if unmet), Composer autoload, `Plugin::boot()`.
- `Plugin` + `Container`: a minimal PSR-11-style container. Service providers register hooks (`Admin`, `Rest`, `Woo`, `Jobs`, `Compat`, `Privacy`). There are no singletons except the bootstrap.
- **REST** (`/wp-json/bps/v1`): every route has a `permission_callback` and an argument schema. The front end sends `X-WP-Nonce`. Guests are identified by an HttpOnly `bps_guest` cookie (a random 128-bit token; only `sha256` is stored). Admin routes require `manage_woocommerce`. A rate limiter (transients, keyed by user or IP hash) protects uploads and design saves. Main routes:
  - `GET editor/bootstrap?product=&variation=&design=` → config, blueprint, fonts, price inputs, nonce
  - `POST uploads` (multipart) · `GET uploads/{id}/file?sig=&exp=` (signed, expiring)
  - `POST|PUT|GET|DELETE designs[/{uuid}]` · `POST designs/{uuid}/share`
  - `POST cart/items` (multipart: document + proofs) · `PUT cart/items/{key}`
  - `POST print/{orderItem}/files` (chunked, resumable) · `GET print/{orderItem}/zip`
  - `GET|POST admin/*` (blueprints, models, assets, fonts, print methods, settings, tools)
- **Woo**: HPOS and Cart/Checkout Blocks compatibility declared. Cart item data holds `bps_design_uuid`. The price is applied in `woocommerce_before_calculate_totals` from the **server-computed** design price. Store API `ExtendSchema` exposes the proof URL and edit link to the Blocks cart. Order line items get the uuid + document hash. The design becomes `ordered` (immutable).
- **Jobs** (Action Scheduler): `bps_prepare_print_manifest`, `bps_assemble_print_package`, `bps_cleanup_expired`, `bps_download_font`, `bps_import_batch`.
- **Image pipeline**: MIME allow-list with magic-byte sniffing, Imagick (or GD) re-encode, EXIF orientation fix and strip, web derivative (≤ 2048 px WebP) next to the original, SVG through `enshrined/svg-sanitize`, and HEIC only when Imagick reports support.

## 10. Print pipeline

1. On add-to-cart, the client uploads ≤ 1600 px proofs per side and an optional 3D snapshot.
2. After add-to-cart, in the background, the shopper's browser renders print PNGs per print area at target DPI (+ bleed) in the print Worker, plus SVG. It uploads them in chunks (resumable). The server checks pixel dimensions against `sizeMm × dpi` and the document hash.
3. When the order is placed (status configurable), Action Scheduler builds the manifest. If files are missing, order admin shows **Render print files**, which runs the same renderer in the admin's browser. The `bps/print/render_service` hook lets a headless Node renderer replace that step.
4. Assembly: a PDF at physical size with TrimBox/BleedBox and optional crop marks (TCPDF; Imagick for CMYK as best-effort), the job sheet PDF, the design JSON and the proof, packed into `ORDER-<no>-ITEM-<id>.zip` in `uploads/bps/orders/…`, which is served only through a signed admin route.

Acceptance check from §17: 300 × 205 mm at 300 DPI = round(300 / 25.4 × 300) × round(205 / 25.4 × 300) = **3543 × 2421 px** (unit-tested in `Units`).

## 11. Security model (summary)

Every request is hostile: capability + nonce + arg schema on every route; `$wpdb->prepare` everywhere; no `unserialize` of user data; upload sniffing and re-encoding; SVG sanitising; private directories with deny rules, served only through signed, expiring URLs; guest token hashed; share links HMAC-signed with optional expiry; the client never supplies a price; the document is validated against the schema, and upload ids must belong to the requester. Bootstrap data contains no secrets. The full checklist is written up in `SECURITY.md` in Phase 9.

## 12. Third-party libraries and licences

Versions checked on npm and Packagist on 2026-10-25. They are pinned at scaffold time (Phase 1).

| Library | Version | Licence | Use |
|---|---|---|---|
| fabric | 7.4.0 | MIT | 2D canvas |
| three | 0.186.1 | MIT | 3D preview |
| zod | 4.6.7 | MIT | schema, plus JSON Schema generation (`z.toJSONSchema`) |
| immer | 11.2.9 | MIT | patches for undo/redo |
| preact / @preact/signals | 11.0.2 / 2.11.3 | MIT | shopper UI |
| @floating-ui/dom | 1.8.0 | MIT | popovers |
| lucide | 1.61.0 | ISC | icons (inline SVG) |
| qrcode | 1.5.4 | MIT | QR matrix → vector |
| colord | 2.10.0 | MIT | colour maths, contrast |
| idb-keyval | 6.3.0 | Apache-2.0 | autosave |
| @zip.js/zip.js | 2.24.0 | BSD-3-Clause | optional client ZIP download |
| @wordpress/hooks, i18n, components, dataviews, scripts, env | 5.0 / – / 43.0 / 21.0 / 37.0 / 12.0 | GPL-2.0+ | admin, hooks, dev env |
| vite / typescript / vitest / @playwright/test | 8.3.5 / 7.0.2 / 5.0.5 / 1.64.1 | MIT / Apache-2.0 | build and tests |
| opis/json-schema | 2.6.0 | Apache-2.0 | server-side validation |
| enshrined/svg-sanitize | 1.1.1 | GPL-2.0+ | SVG sanitising |
| tecnickcom/tcpdf | 7.0.x | LGPL-3.0 | PDF assembly |
| phpstan 2.3 + phpstan-wordpress 2.0 + woocommerce-stubs 11.2, WPCS 3.4, PHPUnit + yoast/phpunit-polyfills 4.0 | — | MIT / BSD | QA |

Draco/KTX2/Basis decoders ship from the `three` package (MIT/Apache-2.0). There is no Google Fonts CDN at runtime: fonts are downloaded server-side and self-hosted.

**Clean-room statement**: no code, icon font, image, sample data or 3D model from Lumise or Fancy Product Designer is included. Those plugins were studied for behaviour only (`REFERENCE-NOTES.md`). The logic of the two Blumoon add-ons, owned by the site owner, is reused with permission.
