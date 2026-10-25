# Build Prompt — "Blumoon Product Studio" (WooCommerce Product Designer with Live 3D Preview)

> **How to use this file**
> 1. Create an empty project folder and put this file in it as `BUILD_PROMPT.md`.
> 2. Extract the four reference plugins into `reference/` exactly like this:
>    ```
>    reference/lumise/                ← lumise_2.1.1.zip  (the inner "lumise" folder)
>    reference/fpd/                   ← fancy-product-designer-6.5.0.zip
>    reference/fpd-gallery-base/      ← fpd-gallery-base_image-plugin-for-designer.zip
>    reference/fpd-unlock-handles/    ← fpd-enhanced-controls.zip
>    ```
> 3. Open Claude Code in that folder and say: *"Read BUILD_PROMPT.md and follow it. Start with Phase 0."*
> 4. "Blumoon Product Studio", the `bps` prefix and the `Blumoon\ProductStudio` namespace are placeholders. Rename them before Phase 1 if you want something else.

---

## 1. Your role and mission

You are a senior WooCommerce plugin engineer who builds specialised product-personalisation software (web-to-print, print-on-demand, promotional goods). You write modern, secure and well-tested WordPress code and TypeScript front ends.

Build a **new, original WordPress/WooCommerce plugin**: a product designer that lets shoppers personalise a product with text, images, shapes, QR codes, clipart and drawings. A **live 3D preview** updates as they design, and they can rotate, tilt and zoom it.

The two plugins in `reference/` are **discontinued** (both vendors moved to SaaS). Use them as functional and UX inspiration only:

- **~80 % of the concept comes from Lumise**: its editor, tool set, interaction model, admin concepts, cart/order flow and print output. Re-architect and rewrite all of it to current standards.
- **~20 % comes from Fancy Product Designer (FPD)**: **only the 3D preview module**, meaning how a 3D model's printable meshes get textured live from the 2D design. Rewrite it properly.
- **Two small add-ons** written by the site owner show the behaviour they want: a locked "gallery base layer" and better image handles plus a crop tool. Build both in as first-class features.

The result must feel like a 2026 product: fast, clean, touch-friendly and accessible. The shopper should be able to use it without instructions.

---

## 2. Ground rules (read before writing any code)

1. **Clean-room rewrite. Do not copy code.** Lumise ("non-distributable rights") and FPD (commercial CodeCanyon licence) are proprietary. Read them to understand *behaviour, data flows, edge cases and UX*, then write original code. Do not copy:
   - functions or files,
   - bundled vendor builds,
   - icon fonts, images or sample data,
   - FPD's 3D models.

   Use open-source libraries (MIT/BSD/Apache/GPL-compatible) from npm/Composer instead. The two Blumoon add-ons belong to the site owner, so you may reuse their logic freely.
2. **Plan before building.** In Phase 0, write `docs/ARCHITECTURE.md` and `docs/PLAN.md` (milestones, file tree, data schemas, open questions) and **stop for my approval** before Phase 1.
3. **Work in milestones** (section 17). At the end of each one, run the full test suite and lint. Commit with a clear message, then give a short summary of what works, what's next and any decisions I need to make.
4. **No dead code, no TODO stubs passed off as features.** If something is out of scope for a milestone, say so in the summary.
5. **Ask when a decision is expensive to reverse** (data schema, coordinate system, licensing of a library). Otherwise make a sensible decision and record it in `docs/DECISIONS.md` (ADR style: context, decision, consequences).
6. **Use current library versions.** Check npm/Packagist for the latest stable versions when you scaffold. Do not rely on versions remembered from training.

---

## 3. Reference map: what to study, keep and fix

### 3.1 Lumise 2.1.1 (`reference/lumise/`) — editor and commerce inspiration

| Area | Where to look | What to learn | What's wrong / must improve |
|---|---|---|---|
| Editor core | `assets/js/app.js` (~21k lines, one global `window.lumise` object) | Module breakdown: `objects` (element factories: text, curvedText, image, svg, path, imagebox, qrcode), `design` (event wiring, layers, nav), `templates`, `cliparts`, `tools` (set/export/import/clear/save/svg colour editing), `stack` (undo/redo), `fn` (image FX, crop, export, process_files, check upload size/dimensions, DPI sizing), `render` (product, fonts, stage nav, cart), `indexed` (IndexedDB "my designs"), JS `add_filter`/`add_action` hooks | jQuery monolith. **Fabric.js 1.7.6** (2017). String-concatenated HTML, global mutable state, cookies, inline handlers, mobile hacks, no types, no tests. Rewrite as typed ES modules. |
| Stage / canvas setup | `app.js` → `fn.create_canvas` (~line 12048) | Each "stage" (side) = product base image + `productColor` rect (tints the blank product) + `limit_zone` (edit/print area) + optional overlay image (shading on top) + optional bleed / crop marks + auto-fit zoom + snap lines | Edit zone is stored in **screen pixels scaled by an `ez_ratio`**. That is fragile, so store geometry in physical units (see §6.1). Clipping is done with a custom `clipto` ctx hack; use Fabric `clipPath`. |
| Tools / UI | `core/includes/views.php`, `core/includes/tmpl.php` | Left nav components: `product, templates, cliparts, text, uploads, shapes, drawing, layers`. Top/contextual tools: `fill, font, spacing, text-align, text-effect (normal/curved/bridge/oblique), filters (~40 named presets), masks, transform, position, arrange, group/ungroup, svg colour editing, qrcode-text, advanced, print, share, designs, cart, languages, help` | Good *coverage*; dated *presentation*. Keep the feature set, redesign the UI (§9). |
| Image handling | `fn.process_files`, `fn.check_upload_size`, `fn.check_image_dimensions`, `fn.large_image_helper`, `fn.uncache_large_images`, `fn.crop`, `fn.image_fx` | Upload checks, swapping to low-res for editing and high-res for export, colour counting, crop, filters, masks | Move validation server-side as well; generate proper web previews; keep originals for print. |
| Sizing / DPI | `get.size`, `get.obj_size`, `get.design_size` | Converting between canvas px and print inches/cm | Replace with one unit system (§6.1) and a live quality (effective DPI) indicator. |
| Export | `fn.export`, `tools.export`, `fn.download_design`, `fn.export_svg`, `assets/js/pdfkit.js`, `core/includes/pdf.php`, TCPDF | Design JSON per stage, screenshots, SVG/PDF/PNG export at print resolution | Make the design JSON a **versioned schema**; make print output deterministic (§12). |
| Woo integration | `woo_connector.php` (identical duplicate: `includes/class-lumise-connector.php`), `core/cart.php` (`process_checkout`, `printing_calc`), `includes/class-lumise-frontend.php`, `includes/admin/class-lumise-admin-hooks.php` | Linking a designer "product" to a Woo product, add-to-cart with design data, cart thumbnails, re-edit, order item meta, printing-technique pricing by quantity/colours, My Account design links | Own parallel `lumise_*` tables for products/orders duplicate WooCommerce. Uses admin-ajax with few nonces, base64 blobs through POST, no HPOS or Cart/Checkout-Blocks support. Use Woo products as the source of truth (§11). |
| Admin | `core/admin/pages/*` (products, product (stages / variations / attributes), templates, cliparts, shapes, fonts, printings, orders, designs, settings, languages) | Admin information architecture: what a store owner needs to manage | Legacy server-rendered pages + jQuery. Rebuild as a React admin (§10). |
| Data | `core/includes/database.php`, `sample-data/database.sql` | Entities: products, templates, cliparts, shapes, fonts, printings, categories, tags, designs, orders, order_products, sessions, guests | Simplify (§6). |

### 3.2 Fancy Product Designer 6.5.0 (`reference/fpd/`) — 3D preview only

- `inc/addons/class-3d-preview.php` and `assets/js/3dpreview/3d-preview-all.min.js` (minified; **three.js r157**). Behaviour to understand:
  - Models live in `wp-content/uploads/fpd_3d/<model>/` with a `config.json` (`camera_z`, `base_material_metalness`, `base_material_roughness`, `ambient_Light_color`, `material_color`, `customMaterialLayers` → normal maps per mesh, `print_padding`, `only_exportable`) and a `model.fbx`.
  - Meshes whose name contains `custom` are printable surfaces. `custom` = view 0, `custom_1` = view 1, and so on. Each gets a `MeshStandardMaterial` (with env map, transparent, double-sided) whose `.map` is replaced with a texture.
  - On every `viewCanvasUpdate` event, the view's **printing box (+ padding)** is exported as a PNG data URL with only exportable elements and loaded into that view's mesh texture.
  - `elementFillChange` with `colorLink3DLayer` recolours a named mesh, so a colour swatch tints the product.
  - Has OrbitControls, a loading state, a touch hint and a fullscreen toggle. Placement options are: inside the designer, before/after the designer, before the product summary, or a shortcode.
- **Weaknesses to fix:**
  - FBX only (use glTF/GLB).
  - A new `Image` and `Texture` on every change, with no disposal (memory leak).
  - Base64 PNG round-trip on every change (slow).
  - Hard-coded naming convention and a fixed one view → one mesh mapping.
  - A random query string on the model URL defeats the browser cache.
  - Continuous render loop even when idle.
  - No WebGL fallback, no context-loss handling, no throttling during drag.
- Also skim `admin/react-app/js/product-builder.js` and `inc/api/class-view.php` only to see how FPD stores per-view `printingBox` and `threeJsPreviewModel`. Don't reuse the rest of FPD.

### 3.3 Blumoon add-ons (owner's code — reuse the logic freely)

- `reference/fpd-gallery-base/fpd-gallery-base.php` shows the **Gallery Mockup mode** the owner wants (§5.2):
  - Loads the product's **first gallery image** as the lowest layer, centred in the print area, with **contain/cover** fit.
  - Locks it completely (no move/scale/rotate/select/delete/copy/reorder).
  - Optional "N template layers kept below it".
  - Optional **template-layer opacity**, applied to all template layers or to named layers only. Applies to exports and the 3D preview too.
  - Per-product disable checkbox, global settings page, a filter (`fpdgb_config`) for per-product overrides, and debug logging.
  - It works by polling and patching FPD from outside. In the new plugin this becomes native, event-driven behaviour.
- `reference/fpd-unlock-handles/fpd-unlock-handles.php` shows the **image control behaviour** the owner wants:
  - All 8 resize handles visible on images.
  - Aspect ratio **unlocked** by default, with a toggle to lock.
  - Scaling **from the opposite edge** (not centred).
  - A **Crop** tool in the image toolbar, using a rectangle mask whose crop box also resizes from the opposite edge.
  - Toolbar hidden while cropping.

---

## 4. Problem statement: why a new designer

In both old plugins, clicking **Customize** loads an *admin-defined blank template* into the designer. The shopper never designs on the image they chose to buy: the featured mockup or the first gallery image that shows what the finished product looks like. That breaks the mental model ("I want *this*, with my name on it").

**This plugin's core idea is two customisation modes, available per product, with an optional hybrid:**

1. **Template mode** (full customisation, Lumise-style): an admin-built blueprint with one or more sides. Each side has a blank product image, a print area and an optional starter template. Best for apparel, mugs, and products with many sides or colours.
2. **Gallery Mockup mode** (new): the product's **featured gallery image** (the first gallery image) is loaded as a **locked base layer** that can't be moved or selected. The shopper adds text, images, shapes and QR codes on top, inside an admin-defined print area drawn over that photo. Best for signage, frames, plaques, canvases, phone cases, and anything where the photo already *is* the product.
3. **Hybrid**: the product offers both. The editor shows a clear segmented switch: **"Design on product photo"** / **"Full customisation"**. The admin sets the default.

In every mode, the **3D preview updates live** (debounced) as the design changes. The shopper can click or tap it to enlarge, then **rotate, tilt and zoom** it.

---

## 5. Customisation modes — detailed behaviour

### 5.1 Template mode

- A **Blueprint** (a reusable product definition, like Lumise "products") has one or more **Sides** (Front, Back, Left sleeve, Lid, and so on). Each side has:
  - `baseImage` (blank product photo/render), optional `overlayImage` (shadows/highlights drawn **above** the design with multiply/screen blending), optional `maskImage` (product silhouette).
  - **Print areas**: one or more per side. Each has a shape (rect, rounded rect, ellipse, or custom SVG path), **physical size in mm**, target DPI, bleed and safe-zone in mm, and optional "clip design to area" (default on).
  - Optional **colour tint layer** (Lumise `productColor`): the blank recolours when the shopper picks a product colour. It can map to a Woo attribute/variation.
  - Optional **starter template** (design JSON) and a list of **allowed templates**.
- A blueprint can be assigned to many Woo products. Per-product overrides are allowed (price, enabled sides, templates).
- **Variations**: a variation can map to a blueprint colour, a different base image per side, or a different blueprint. On variation change, keep the shopper's elements, re-anchored to the print area (§6.1).

### 5.2 Gallery Mockup mode

- **Base image source**, chosen per product (with a global default):
  1. Featured gallery image (first gallery image), which is the default and matches the owner's add-on.
  2. Product featured image.
  3. Selected variation's image (follows variation changes).
  4. A specific attachment chosen by the admin.

  Fall back down this list if an image is missing.
- **Multiple sides (opt-in)**: "Use gallery images 1…N as sides". Each selected gallery image becomes a side with its own print area. The side switcher shows thumbnails.
- **Base layer rules**:
  - Rendered at the bottom of the stack (or above *N* template layers).
  - **Not** selectable, evented, movable, scalable, rotatable, deletable, duplicable or reorderable.
  - Excluded from undo history and from "select all".
  - Shown in the Layers panel as a fixed, greyed row with a lock icon ("Product photo").
  - Fit is `contain` or `cover` relative to the stage, chosen per product.
  - Load at a size suited to the editor (a `large` / ~2048 px derivative), never a full-resolution original, unless needed for proof output.
- **Print area on the photo**: the admin draws a rectangle (or rounded rect/ellipse/custom path) directly over the gallery image in a visual editor on the product edit screen. Include a **"real-world size" calibration**: the admin enters the physical width/height in mm of that area. This drives DPI warnings and print-file scale.
- **Optional perspective**: for photos where the print surface is angled, the admin can set **4 corner points** (quad) instead of a rectangle. The shopper still designs on a flat, axis-aligned area, but the *on-photo preview* warps the design into the quad (projective transform, rendered with WebGL or a canvas mesh-warp). Ship the rectangle in v1; the quad is a v1.x milestone (see §17). Design the data model for it now.
- **Template layers** (from the owner's add-on): the admin may add template elements (frames, guide text, placeholders). Settings: `templateOpacity` (0–1), `dimOnlyLayerTitles[]`, and whether dimmed layers are included in print output and 3D.
- **What is printed vs. previewed**: the base photo is **never** part of the print file by default (it's a picture of the product, not artwork). It is part of the **proof image**, cart thumbnail and optionally the 3D texture (§8.4). Add a per-product override, "Include base image in print file", for products where the gallery image *is* printable artwork.
- **Per-product disable**: replaces the add-on checkbox. Keep a PHP filter `bps/gallery_mode/config` (the successor of `fpdgb_config`) so developers can override per product.

### 5.3 Hybrid

- Per-product setting: `modes: ['template', 'gallery']`, `defaultMode`.
- Switching modes asks whether to **carry elements across** ("Keep my text and images") or start fresh. Carried elements are re-anchored by print-area-relative position and scaled to fit.
- The cart and order store which mode was used.

---

## 6. Architecture and stack

### 6.1 Core technical decisions (non-negotiable unless you raise a strong reason in Phase 0)

- **One coordinate system: millimetres relative to the print area.** Every element in the design document stores position/size in **mm relative to its print area's top-left**, plus rotation, flip and skew. The editor converts mm ↔ canvas px through one `Viewport` transform per side (zoom, pan, device pixel ratio).

  This removes Lumise's fragile `ez_ratio` maths. It also makes designs survive base-image swaps, variation changes, mode switches, screen sizes and print export at any DPI.
- **Design document = single source of truth**, a versioned JSON schema (`schemaVersion`). Validate it with **Zod** on the client and **JSON Schema** (opis/json-schema) on the server, and ship migrations between versions. Fabric objects are a *view* of the document; never persist Fabric's raw `toJSON()` as the contract.
- **State management**: a small typed store (Zustand vanilla, or signals). Undo/redo works on the design document with **command objects / JSON patches** (immer patches), not full snapshots. Cap it at ~100 steps and coalesce drags into one step.
- **Events**: a typed event bus (`design:changed`, `side:changed`, `element:added|updated|removed`, `selection:changed`, `mode:changed`, `price:changed`). Expose public JS hooks through `@wordpress/hooks` (`bps.hooks.addFilter('bps.editor.tools', ...)`), the modern successor of Lumise's `add_filter`/`add_action`.

### 6.2 Stack

**PHP / WordPress**
- PHP **8.1+** (strict types, enums, readonly properties), WordPress **6.6+**, WooCommerce **9.x+** (test on latest).
- Composer, PSR-4 under `Blumoon\ProductStudio\`, with a small DI container or service-provider pattern. No globals, no singletons beyond the plugin bootstrap.
- **REST API** under `/wp-json/bps/v1/` for everything the front end needs. **No admin-ajax.** Every route has a `permission_callback`, nonce (`X-WP-Nonce`), arg schema, sanitisation and validation.
- **Action Scheduler** (bundled with Woo) for background jobs: print-file generation, cleanup of abandoned uploads/designs, font downloads.
- Declare **HPOS** (`custom_order_tables`) and **Cart & Checkout Blocks** compatibility.
- Quality: **PHPCS (WPCS)**, **PHPStan level 6+** with WordPress/WooCommerce stubs, **PHPUnit** with the WP test suite (wp-env).

**Front end (shopper editor)**
- **TypeScript** (strict), **Vite** (library mode, multiple entry points, code splitting, hashed assets, manifest read by PHP to enqueue).
- UI: **Preact + signals** (or React 18 via `@wordpress/element` if you can justify the size). Use CSS with **CSS custom properties** (design tokens) + CSS Modules or vanilla-extract. No jQuery, no Bootstrap, no icon fonts. Use **inline SVG icons** (Lucide, ISC).
- Canvas: **Fabric.js latest stable major** (v6+: ESM, `clipPath`, `controls` API, `toCanvasElement` with region/filter options).
- 3D: **three.js latest** + `GLTFLoader` (+ `DRACOLoader`, `KTX2Loader`, `MeshoptDecoder`) + `OrbitControls`, plus **`FBXLoader` only for importing legacy FPD models**. Lazy-load the whole 3D chunk only for products that have a model.
- Other libs: `qrcode` (SVG output), `@zip.js/zip.js` (optional download), `idb-keyval` (local autosave), `colord` (colour maths), `@floating-ui/dom` (popovers), `zod`.
- Tests: **Vitest** (unit) + **Playwright** (e2e on a wp-env site with WooCommerce and sample products, desktop + mobile emulation).

**Admin**
- React app using `@wordpress/scripts` / `@wordpress/components` / `@wordpress/data`, plus `DataViews` for list screens, so it looks native in wp-admin.
- The **template builder** and **print-area editor** reuse the shopper editor package in an `admin` capability mode, giving one codebase.

### 6.3 Repository layout (proposal; refine in Phase 0)

```
blumoon-product-studio/
  blumoon-product-studio.php        # bootstrap only
  composer.json  package.json  vite.config.ts  phpstan.neon  phpcs.xml  .wp-env.json
  src/                              # PHP (PSR-4)
    Plugin.php  Container.php
    Admin/  Rest/  Woo/  Domain/  Infrastructure/  Jobs/  Migration/  Compat/
  packages/
    editor-core/      # TS: document schema, store, commands, units, pricing preview
    editor-canvas/    # TS: Fabric adapter, custom objects (CurvedText, ImagePlaceholder, QR), controls
    editor-ui/        # TS/Preact: shell, panels, toolbars, sheets
    preview-3d/       # TS: three.js preview (lazy chunk)
    admin/            # React wp-admin app
    shared/           # tokens, icons, i18n helpers, API client
  assets/dist/        # build output (gitignored except release)
  languages/
  tests/ (php/, e2e/)
  docs/ (ARCHITECTURE.md, PLAN.md, DECISIONS.md, HOOKS.md, DATA-SCHEMA.md, 3D-MODELS.md, USER-GUIDE.md)
```

### 6.4 Data model

Use WordPress primitives where they fit; use custom tables only for high-volume rows.

| Entity | Storage |
|---|---|
| Blueprint (sides, print areas, colours) | CPT `bps_blueprint`, config as validated JSON in post meta |
| Product configuration | Woo product meta `_bps_config` (JSON): enabled, modes, default mode, blueprint id, gallery-mode config, 3D model id + mesh mapping, pricing overrides, per-variation overrides |
| Design templates | CPT `bps_template` (design JSON + preview), taxonomy `bps_template_cat` |
| Clipart / shapes / masks | Media Library attachments flagged `_bps_asset_type`, taxonomy `bps_asset_cat` + tags |
| Fonts | CPT `bps_font` (family, variants, self-hosted woff2 files, licence note). Google Fonts are **downloaded and self-hosted** (GDPR) |
| 3D models | CPT `bps_model` (GLB attachment, mesh list, materials, camera presets, env, UV regions) |
| Printing methods / pricing rules | CPT `bps_print_method` (quantity × colours price tables, like Lumise `printing_calc`) |
| Saved designs (cart, account, share, orders) | **Custom table** `{prefix}bps_designs` (id, uuid, user_id, guest_token_hash, product_id, variation_id, mode, document JSON (longtext), document_hash, preview attachment ids, status [draft/cart/ordered/shared], created/updated, expires_at) |
| Design uploads (shopper images) | Private dir `uploads/bps/u/<yyyy>/<mm>/<random>/` + **custom table** `{prefix}bps_uploads` (owner, original path, preview path, mime, width/height, bytes, sha256, created, linked design) |
| Order print files | Private dir `uploads/bps/orders/<order_id>/<item_id>/`, referenced from order-item meta |

Example product config (`_bps_config`):
```json
{
  "schemaVersion": 1,
  "enabled": true,
  "modes": ["gallery", "template"],
  "defaultMode": "gallery",
  "blueprintId": 123,
  "gallery": {
    "source": "first_gallery_image",
    "useGalleryAsSides": false,
    "fit": "contain",
    "baseLayersBelow": 0,
    "templateOpacity": 0.25,
    "dimOnlyLayerTitles": [],
    "includeBaseInPrint": false,
    "sides": [{
      "id": "front",
      "attachmentId": 456,
      "printAreas": [{
        "id": "pa1",
        "shape": "rect",
        "rectPx": { "x": 410, "y": 300, "w": 820, "h": 560 },
        "quadPx": null,
        "sizeMm": { "w": 300, "h": 205 },
        "bleedMm": 3, "safeMm": 5, "dpi": 300, "clip": true
      }]
    }]
  },
  "preview3d": {
    "modelId": 789,
    "meshMap": [{ "mesh": "Print_Front", "side": "front", "printArea": "pa1", "uvRect": [0, 0, 1, 1] }],
    "texture": { "source": "design_only", "background": "transparent", "maxSize": 2048 },
    "colorLink": { "attribute": "pa_color", "mesh": "Body" },
    "camera": { "front": { "azimuth": 0, "polar": 80, "distance": 2.2 } }
  },
  "pricing": { "basePerSide": { "front": 0, "back": 50 }, "perTextElement": 0, "perImage": 0, "printMethodId": null }
}
```

Example design document (abbreviated):
```json
{
  "schemaVersion": 1,
  "productId": 42, "variationId": 0, "mode": "gallery",
  "units": "mm",
  "sides": {
    "front": {
      "printAreas": {
        "pa1": {
          "elements": [
            { "id": "e1", "type": "text", "x": 20, "y": 30, "w": 120, "h": 18, "rotation": 0,
              "text": "Happy 30th, Sam", "font": { "family": "Inter", "weight": 700, "size": 14 },
              "fill": "#1A1A1A", "align": "center", "effect": { "kind": "arc", "radius": 140 },
              "locks": {}, "meta": {} },
            { "id": "e2", "type": "image", "uploadId": "u_8f3…", "x": 0, "y": 0, "w": 80, "h": 60,
              "crop": { "x": 0.1, "y": 0, "w": 0.8, "h": 1 }, "mask": null, "filters": ["vivid"], "opacity": 1 }
          ]
        }
      }
    }
  },
  "options": { "productColor": "#ffffff" }
}
```

---

## 7. Editor features (Lumise parity + improvements)

Build all of these. ⭐ marks an improvement over the reference.

**Elements**
- **Text**: add/edit inline (double-click or tap), font family/weight/style, size, colour, stroke, shadow, letter-spacing, line-height, alignment, uppercase toggle, opacity. **Effects**: normal, **curved/arc** (adjustable radius, both directions), bridge, oblique (custom Fabric subclasses, rendered identically in SVG/PDF export). ⭐ Character limits and allowed fonts/colours per template element. ⭐ Text presets (heading/subheading/body combos).
- **Images / uploads**: drag-drop, paste from clipboard, file picker, camera on mobile. Formats: JPG, PNG, WebP, SVG (sanitised), HEIC (converted server-side if Imagick supports it; otherwise a clear message). Server-side validation (MIME sniffing, size, pixel limits), EXIF orientation fix, EXIF stripping, web preview derivative, original kept for print. ⭐ **Live quality badge** (effective DPI at current size vs. print-area DPI: green ≥ target, amber ≥ 150, red below), with a warning before add-to-cart. ⭐ Upload history panel per shopper (my uploads), reusable across designs.
- **Image controls** (from the owner's add-on): all 8 handles, **aspect ratio unlocked by default** with a lock toggle, **scale from the opposite edge** (Alt/Option = from centre), rotation handle with 15° snapping on Shift, flip H/V.
- **Crop** (owner's add-on, done natively): non-destructive crop stored as a normalised rect. The crop box has its own 8 handles that also scale from the opposite edge. Aspect presets (free, 1:1, 4:3, 16:9, print-area ratio). Element toolbar hidden while cropping. Apply / Cancel / Reset.
- **Masks**: clip images to shapes (circle, rounded, heart, star, custom SVG masks managed in admin).
- **Filters**: Fabric filters (brightness, contrast, saturation, hue, blur, sharpen, grayscale, sepia, invert, duotone) plus **named preset looks** (Lumise had ~40; ship ~12 good ones, each built from filter chains), with live preview thumbnails.
- **Shapes & clipart**: SVG library with categories, search and infinite scroll. **Multi-colour SVG recolouring**: detect fills and recolour each (Lumise `svg.render_fills/replace`), restricted to the print method's palette if set.
- **QR codes**: vector QR (URL, text, vCard, Wi-Fi, email, phone). Foreground/background colour, error-correction level, quiet zone. Contrast warning if colours aren't scannable. Editable after creation.
- **Drawing**: free-hand brush (size, colour, smoothing), eraser for drawing layers.
- **Image placeholders** (Lumise "imagebox"): template-defined frames the shopper fills with a photo by tap/drag. The photo can be repositioned and zoomed inside the frame.

**Arrange & layout**
- Smart guides and snapping to print-area edges/centre, safe zone and other elements (with distance labels). Toggleable grid and rulers (mm/cm/in).
- Align (left/centre/right/top/middle/bottom) relative to the print area or selection. Distribute. Bring forward/back. Group/ungroup. Duplicate. Delete. Lock (position / everything). Hide.
- Keyboard: arrows nudge 1 mm (Shift = 10 mm), Ctrl/Cmd+Z/Shift+Z/Y, C/V/D, Delete/Backspace, Ctrl/Cmd+A (excludes the base layer), Esc deselects, `+`/`-`/`0` for zoom. Show the shortcut list in Help.
- **Layers panel**: drag to reorder, rename, lock, hide, thumbnail per layer. Base photo and locked template layers pinned with a lock icon.
- Zoom (fit, 100 %, pinch, Ctrl+wheel, zoom to selection), pan (Space+drag, two-finger, hand tool).
- Print-area visualisation: dashed area, bleed and safe-zone guides, content outside the area **ghosted** (semi-transparent) while dragging, clipped when not.

**Templates**
- Browse by category, search, preview, apply (replace or merge).
- Admin-defined **element permissions**: locked position, editable text only, replaceable image, max chars, allowed fonts/colours, required field (blocks add-to-cart until filled, with an inline message).

**Session & saving**
- Autosave to IndexedDB every change (debounced), restored on reopen ("Continue where you left off?").
- **Save to account** (logged-in) or "email me a link" for guests (a signed token, never an incrementing id).
- **My designs**: list, rename, duplicate, delete, open.
- **Share**: read-only share link with a preview image (OpenGraph tags) and an optional "make a copy" button.
- **Download proof**: PNG/PDF of the preview with a watermark (setting).

**Pricing**
- Live price in the header with a breakdown popover: base product, per-side, per-element, print method by quantity/colours, template fee. Calculated by the **same pure function** in TS (preview) and PHP (authoritative). Add a shared test fixture set so both produce identical results.

**Internationalisation & accessibility**
- All strings translatable (`wp_set_script_translations` + `.pot`), RTL layout, currency/number formatting from Woo.
- **WCAG 2.2 AA**: full keyboard operation of panels and toolbars, visible focus, ARIA roles/labels, live-region announcements ("Text added", "Image too small to print well"), colour contrast, `prefers-reduced-motion`, ≥ 44 px touch targets. Canvas elements must be reachable from the Layers panel by keyboard.

---

## 8. Live 3D preview (rewrite of the FPD concept)

### 8.1 Model pipeline (admin)
- Upload **GLB/glTF** (recommended) or import a legacy **FPD model folder** (`config.json` + `model.fbx`). Imported FBX is converted on import if feasible; otherwise it's loaded with FBXLoader and a "convert for best performance" note is shown. Mapping on import: `custom` → side 0, `custom_N` → side N, `customMaterialLayers` → normal maps, `material_color`/metalness/roughness → base material, `camera_z` → default distance, `print_padding` → texture padding.
- After upload, the admin sees the model in a viewer with a **mesh list**. For each mesh they set:
  - role: `printable`, `color-linked`, `static`, or `hidden`;
  - for printable meshes: which **side + print area** feeds it and a `uvRect` (sub-rectangle of the UV atlas, so several sides can share one atlas such as front/back of a shirt);
  - material overrides (base colour, metalness, roughness, normal map, clearcoat, transmission for glass);
  - optional **displacement/normal "fabric" map** so prints look embedded rather than stuck on.
- **UV test**: a button projects a numbered grid texture onto printable meshes so the admin can verify orientation and flip (`flipY`, rotation 0/90/180/270 per mapping).
- **Camera presets per side** (azimuth, polar, distance, target). The admin sets them by orbiting the model and clicking "Save as Front view". Also: min/max zoom distance, polar limits (tilt range), auto-rotate on/off, environment (neutral studio HDR/RoomEnvironment or uploaded HDR/EXR), exposure, background (transparent / colour), soft contact shadow.
- Show an optimisation report: triangle count, texture sizes, file size. Warn above budgets (e.g. > 150k triangles, > 8 MB).

### 8.2 Runtime (shopper)
- **Lazy-load** the 3D chunk and the model **after** the 2D editor is interactive. Show a skeleton with a progress bar.
- **Texture pipeline (no base64 round-trip):**
  - Each printable mapping owns one offscreen `<canvas>` and one `THREE.CanvasTexture` (`colorSpace = SRGBColorSpace`, anisotropy = renderer max, mipmaps on).
  - On `design:changed` for a side, render that side's print area (including bleed/padding if configured) from the design document into the offscreen canvas at texture resolution. Use Fabric `toCanvasElement` with region + object filter, or a dedicated `StaticCanvas` renderer fed from the document.
  - Then set `texture.needsUpdate = true`. **Never** create new textures per change. Dispose everything on teardown.
- **Throttling**: while dragging/scaling, update at low resolution (~512 px) at most every ~100 ms. On `object:modified` / idle, do a full-resolution update (configurable max, default 2048, capped by `renderer.capabilities.maxTextureSize`; 1024 on low-end mobile). Use `requestIdleCallback`/rAF scheduling.
- **Render on demand**: render only when controls move, a texture changes, damping is active, or auto-rotate is on. Pause when off-screen (IntersectionObserver) or the tab is hidden. Handle `webglcontextlost`/`restored`.
- **Interaction**: OrbitControls with damping. Drag = rotate, vertical drag = tilt (within polar limits), wheel/pinch = zoom (within limits), pan off by default. **Double-click/tap = reset view**. Buttons: reset, auto-rotate toggle, fullscreen/expand, view presets (Front/Back/…).
- **2D ↔ 3D linking**:
  - Switching side in the 2D editor animates the 3D camera to that side's preset (respecting reduced motion).
  - Clicking a printable mesh in 3D (raycast) switches the 2D editor to that side.
  - Changing a linked colour (product colour / variation attribute) recolours the `color-linked` mesh (FPD `colorLink3DLayer`, done properly).
- **Snapshot**: "Save 3D view" captures the current 3D render (`preserveDrawingBuffer` only during capture) and attaches it to the cart item as an extra preview image.
- **Fallbacks**: if WebGL2 isn't available or the model fails to load, hide the 3D panel and show the 2D proof preview instead, with a quiet notice. Don't break the editor.

### 8.3 Where the preview appears
- Inside the editor as a **docked preview card** (desktop: top of the right panel, resizable, expandable to a large modal/fullscreen; mobile: a floating "3D" pill that opens a full-height bottom sheet / toggles a 2D|3D segmented control).
- On the **product page** after a design exists: the main gallery image is replaced or augmented with the shopper's proof, plus a "View in 3D" button (shortcode/block also available: `[bps_3d_preview]` and a `bps/3d-preview` block).

### 8.4 Texture content per mode
- **Template mode**: design elements within the mapped print area. Optional product-colour background.
- **Gallery mode**, set per product with `preview3d.texture.source`:
  - `design_only` (default): design layers on transparent. The model's own material shows through.
  - `design_over_base_crop`: the base photo cropped to the print area, with the design on top. Use this for flat products where the photo is the artwork, e.g. a canvas print.
  - `design_over_color`: the design on top of a solid colour.
- Dimmed template layers follow the owner's add-on rule (their opacity also applies in 3D) unless configured otherwise.

---

## 9. UX / UI redesign (huge improvement over both references)

**Design direction**: calm, modern, product-first. The product and the 3D preview are the heroes; the chrome stays out of the way. Neutral surfaces, one brand accent (set in admin), 8 px spacing grid, 12–16 px radii, subtle elevation, crisp 1.5 px line icons, Inter or a system font stack for UI. Light theme by default and an optional dark theme. All of it is driven by CSS custom properties, so the store owner can theme it in admin (accent, surface, radius, font) and see a live preview.

**Launch**: the **Customize** button on the product page opens the editor as a **full-screen overlay** with no page reload. It uses a `?customize=1` / `#customize` deep link, the browser Back button closes it (History API), and focus is trapped while open. Add an admin option for a dedicated editor page instead. Show a skeleton immediately; the editor should be interactive in under 2 s on a mid-range phone over 4G (with assets cached on repeat visits).

**Desktop layout (≥ 1024 px)**
```
┌──────────────────────────────────────────────────────────────────────────┐
│ ←  Product name · Mode switch [Photo | Full]   ↶ ↷   100% ▾   R 349.00 ⓘ [Add to cart] │
├────┬───────────────┬────────────────────────────────────────┬────────────┤
│Rail│ Panel (slides)│                                        │ 3D preview │
│ T  │ Text presets  │        Canvas (product + print area)   │  (card)    │
│ ⬆  │ Uploads       │   floating contextual toolbar above    │────────────│
│ ◇  │ Shapes/Clipart│   the selected element                 │ Properties │
│ ▦  │ Templates     │                                        │ (inspector)│
│ QR │ QR            │                                        │            │
│ ✎  │ Draw          │                                        │            │
│ ☰  │ Layers        │                                        │            │
├────┴───────────────┴────────────────────────────────────────┴────────────┤
│  Sides: [Front ▣] [Back ▢] [Sleeve ▢]      Quality ●  Safe-zone ✓   Help ? │
└──────────────────────────────────────────────────────────────────────────┘
```
- **Left icon rail** with labels on hover. Clicking an item opens a **slide-out panel** (collapsible) with search and categories.
- **Contextual floating toolbar** (Canva-style) appears above the selection with the most-used actions for that element type (font, size, colour, effect / crop, filters, mask, replace / colours). A "More" overflow opens the full **Properties inspector** in the right column (position/size in mm, rotation, opacity, locks).
- **Right column**: 3D preview card on top (expand button), inspector below.
- **Bottom bar**: side switcher with live thumbnails, quality and safe-zone status, help.
- **Header**: product name, mode switch (hybrid only), undo/redo, zoom, live price with breakdown, primary **Add to cart** (or **Update cart item** when editing from cart). A secondary menu has Save, Share, Download proof, Start over.

**Tablet (768–1023 px)**: the rail stays, panels become overlays, and the 3D card collapses to a floating mini-preview (tap to expand).

**Mobile (< 768 px)**
- Full-bleed canvas with pinch-zoom and two-finger pan. **Bottom tab bar** (Text, Upload, Shapes, Templates, Layers, More).
- Tools open as **bottom sheets** (snap points: peek / half / full).
- The contextual toolbar becomes a **horizontally scrolling chip row** above the tab bar.
- Large touch handles (≥ 24 px visual, 44 px hit area). Long-press for a context menu.
- Header compresses to: close, undo/redo, price, Add-to-cart button. A **2D | 3D** segmented control floats top-centre.
- Haptic feedback (`navigator.vibrate`) on snap, where supported and allowed.

**Interaction quality**
- Empty-state guidance on first open: a ghost hint inside the print area ("Tap to add text or drop a photo"), plus an optional 3-step tour that's dismissible and remembered.
- Microcopy that explains *why* ("This photo will print blurry at this size — make it smaller or use a larger image").
- Non-blocking toasts with Undo for destructive actions (delete, clear, apply template).
- Pre-flight checks before Add to cart: low-DPI images, content outside the safe zone, empty required fields, unscannable QR. Show them as a checklist the shopper can fix or acknowledge.
- Optimistic UI everywhere. Uploads show progress and can be cancelled.
- Respect `prefers-color-scheme` (if dark theme enabled) and `prefers-reduced-motion`.

---

## 10. Admin experience

**Top-level menu "Product Studio"** (React app):
1. **Dashboard**: setup checklist (fonts, a blueprint, a model, a product enabled), recent designs, recent orders with print files, and a system health check (Imagick, memory limit, upload limits, writable dirs, WebGL note).
2. **Blueprints**: list + editor. Sides, base/overlay/mask images, print areas drawn visually (rect / rounded / ellipse / SVG path; mm size; DPI; bleed; safe zone), colours (swatches, linked to Woo attribute), starter templates.
3. **Templates**: a builder that reuses the editor in admin mode, with element permissions (§7), categories, and assignment to blueprints/products.
4. **Assets**: clipart, shapes, masks (upload SVG/PNG in bulk, categories, tags, recolourable flag), and **fonts** (Google Fonts picker that downloads and self-hosts; upload woff2/ttf/otf; variants; licence note; preview).
5. **3D Models**: upload/import, mesh mapping, materials, UV test, camera presets, environment, optimisation report (§8.1).
6. **Pricing & Print methods**: price tables by quantity and colours, per-side and per-element fees, minimum quantities.
7. **Designs**: all saved designs with filters (status, product, customer, date), preview, open in editor, delete, export JSON.
8. **Settings**: general (launch mode, editor page, guest saving, autosave), appearance (theme tokens + live preview), uploads (formats, max MB, max px, HEIC), quality (default DPI, warning thresholds), privacy (retention days for unordered designs/uploads), emails (attach proof), advanced (debug logging, which replaces the add-on's console debug; REST rate limits).
9. **Tools**: importers (§14), regenerate print files, clean up orphans, system report.

**Woo product edit screen**: a **"Product Studio" tab** in Product data:
- Enable; modes and default mode; blueprint picker.
- **Gallery mode panel** with a **visual print-area editor**: it shows the selected gallery image, and the admin drags/resizes the print area on it, then enters mm size, DPI, fit, base-layers-below, template opacity, include-base-in-print.
- **3D panel**: model picker, mesh → side mapping, texture source, colour-link attribute, a "Preview with sample design" button.
- **Pricing overrides** and **per-variation overrides** (in the variation panel: base image source, blueprint colour, model colour).
- Product list column + bulk action: "Enable Product Studio (gallery mode)" for selected products.

---

## 11. WooCommerce integration

- **Product page**:
  - Inject the **Customize** button (hook placement option + block + shortcode `[bps_customize_button]`). It must work with classic themes and block themes (single product template).
  - Respect variation selection (the button is disabled until required attributes are chosen, if configured).
  - Optional "Customisation required" setting: hide the plain Add to cart.
- **Add to cart** (REST): the client sends the design document (not images). The server:
  1. validates the schema and permissions;
  2. resolves upload ids against the shopper's own uploads;
  3. **recomputes price**;
  4. stores the design (`status=cart`);
  5. receives the preview images (2D proof per side + optional 3D snapshot, as WebP/JPEG blobs via multipart, not base64 in JSON);
  6. adds the cart item with `bps_design_uuid`.

  Quantity and variation come from the editor. Support adding the same design with different variations/sizes (bulk size/quantity matrix, as in Lumise's multi-attribute cart).
- **Cart / mini-cart / checkout (classic + Blocks)**:
  - Thumbnail = the design proof. Item data shows mode, sides customised and a "View design" lightbox.
  - **"Edit design"** reopens the editor with the design and updates the same cart item.
  - Price via `woocommerce_before_calculate_totals` (from server-computed design price).
  - For Blocks, register Store API extension data (`ExtendSchema`) and a small front-end filter so the block cart shows the proof thumbnail and the edit link.
- **Order**:
  - Persist the design uuid + snapshot (document hash) on `woocommerce_checkout_create_order_line_item` (and the Store API equivalent). Flip the design to `status=ordered` (immutable from then on; editing creates a copy).
  - HPOS-safe APIs only (`wc_get_order`, `$order->get_items()`, item meta CRUD).
  - **Order admin**: a meta box per item with side previews, 3D snapshot, design JSON download, **print-file status + download (ZIP)**, and "Regenerate".
  - **Emails**: proof thumbnail in customer/admin emails (setting).
  - **My Account**: a "My designs" endpoint (list, reopen, reorder) and design previews on order view.
- Compatibility: multi-currency plugins (convert via filters, never hard-code like Lumise's WOOCS snippet), WPML/Polylang string registration, caching plugins (the editor bootstraps data via REST with no per-user HTML cached), common page builders (shortcode/block).

---

## 12. Print-ready output

- **The source of truth is the design document + original uploads.** Print files are reproducible from them.
- **Generation flow**:
  1. **At add-to-cart**: the client renders lightweight proofs (≤ 1600 px).
  2. **When the order is placed** (status `processing` or configurable), an Action Scheduler job prepares the job manifest.
  3. **High-res rendering** must match the editor pixel-for-pixel, so it uses the same TS renderer:
     - **Default**: the shopper's browser renders the print files in a Web Worker / OffscreenCanvas where supported (otherwise chunked on the main thread with a progress indicator) **after add-to-cart, in the background**, and uploads them in chunks (resumable). The server verifies the dimensions and document hash.
     - **Fallback**: "Render print files" in order admin, which runs the same renderer in the admin's browser.
     - **Extension point**: a documented hook for an external headless renderer (Node + Fabric `StaticCanvas`), so a store can add a render service later.
- **Outputs per print area**:
  - PNG at target DPI (sRGB, transparent background unless configured), optionally with bleed.
  - **SVG** (vector text/shapes/QR; fonts embedded or text converted to outlines, configurable).
  - **PDF** (server-assembled from SVG/PNG with TCPDF or Imagick, at physical size in mm, bleed box/trim box set, optional crop marks).
  - A proof JPG (mockup composite incl. base photo).
  - The design JSON.
  - An order **job sheet PDF** (order no., item, variation, qty, print method, colours used, sizes, thumbnails).

  Package them as `ORDER-<no>-ITEM-<id>.zip`.
- The Gallery-mode base photo is excluded from print files unless `includeBaseInPrint` is set. Dimmed template layers follow their "include in print" flag.
- **Colour**: export sRGB by default. Optional CMYK PDF via Imagick profile conversion if available (clearly labelled best-effort).

---

## 13. Security, privacy and performance

**Security (treat every request as hostile)**
- REST: capability checks (`manage_woocommerce` for admin routes), nonces, strict arg schemas, sanitise in / escape out, `$wpdb->prepare` everywhere, no `eval`/`unserialize` on user data.
- Uploads: allow-list MIME + magic-byte sniffing, re-encode raster images (strips payloads), **sanitise SVG** (`enshrined/svg-sanitize`; drop scripts/foreignObject/external refs), size and pixel caps, per-user/IP rate limits, randomised non-guessable paths, `.htaccess`/nginx deny on private dirs, served through a signed, expiring REST URL.
- Guests: random 128-bit token in an HttpOnly, SameSite=Lax cookie; store only its hash; designs are accessible only with the token or a signed share link.
- Share links: signed + optional expiry; read-only.
- No secrets in front-end bootstrap data. CSP-friendly (no inline JS beyond a JSON bootstrap via `wp_add_inline_script` / `wp_interactivity`-style data).

**Privacy**
- Register WordPress **personal-data exporters and erasers** (designs, uploads).
- Retention: unordered designs/uploads auto-deleted after N days (setting). Ordered designs are kept with the order.
- Self-host Google Fonts (no third-party requests from the shopper's browser).

**Performance budgets**
- Enqueue nothing on pages without an enabled product.
- Editor shell JS ≤ ~150 KB gz (excluding Fabric), Fabric loaded as its own chunk, 3D chunk lazy (three.js + loaders) **only** when a model is assigned.
- Font files loaded on demand per family. Clipart lists paginated with thumbnails (WebP).
- Fabric: `objectCaching` on, `renderOnAddRemove` off during batch operations, `requestRenderAll`, `enableRetinaScaling` capped on low-end devices.
- Lighthouse on the product page: no regression > 5 points when the plugin is active but the editor is closed.

---

## 14. Migration / importers (Tools screen)

- **Lumise importer**: reads the existing Lumise tables if present (`{prefix}lumise_*`):
  - products/stages → blueprints (convert edit-zone pixels to print areas; ask for the mm size where unknown);
  - templates → design templates (convert Lumise stage JSON to the new schema via an adapter; flag unsupported effects);
  - cliparts/shapes → assets;
  - fonts → fonts;
  - printings → print methods.

  It's idempotent, has a dry-run report, and runs in batches via Action Scheduler.
- **FPD 3D importer**: scans `uploads/fpd_3d/*/config.json` and creates 3D models with mesh mapping (§8.1).
- **Gallery-base settings importer**: reads the `fpdgb_settings` option and the `_fpd_gallery_disable` product meta into the new gallery-mode config.
- Importers never modify the old plugins' data.

---

## 15. Extensibility

- PHP actions/filters with the `bps/` prefix, documented in `docs/HOOKS.md`. At minimum:
  - `bps/product/config`, `bps/gallery_mode/config`, `bps/editor/bootstrap_data`, `bps/price/calculate`,
  - `bps/design/validate`, `bps/design/saved`,
  - `bps/cart/item_data`, `bps/order/item_created`,
  - `bps/print/manifest`, `bps/print/render_service`,
  - `bps/upload/allowed_mimes`, `bps/3d/model_config`.
- JS hooks via `@wordpress/hooks`: `bps.editor.tools`, `bps.editor.panels`, `bps.element.defaults`, `bps.export.beforeRender`, `bps.preview3d.material`, `bps.price.breakdown`, plus a public `window.bps.editor` API (open, close, getDocument, loadDocument, on/off events).
- A sample add-on in `examples/` registering a custom panel and a custom element type, to prove the API.

---

## 16. Testing and quality gates

- **Unit (Vitest)**: unit conversions, schema validation/migrations, command/undo stack, pricing (shared fixtures with PHP), DPI calculation, SVG recolouring, crop maths, gallery fit (contain/cover), print-area re-anchoring on base swap.
- **PHP (PHPUnit)**: REST permissions and validation, price recomputation, cart/order meta (classic + Store API), HPOS on/off, upload sanitisation (malicious SVG/polyglot fixtures), importers (fixtures from `reference/lumise/sample-data/database.sql`), privacy erasers.
- **E2E (Playwright, wp-env with WooCommerce + seeded products)**: open editor → add text/image/shape/QR → crop image → move between sides → 3D preview updates (assert texture version counter increments) → rotate/zoom 3D → add to cart → edit from cart → checkout (classic and Blocks) → order admin shows previews and print ZIP. Run on desktop Chrome, mobile Safari/Chrome emulation, and with reduced motion.
- **Visual regression** for the editor shell (Playwright screenshots).
- **Accessibility**: axe-core in E2E; keyboard-only path through the whole flow.
- **Performance**: bundle-size check in CI (fail over budget); a 3D memory test (100 rapid design changes → no growth in `renderer.info.memory.textures`).
- CI: GitHub Actions running lint (PHPCS, ESLint, Stylelint, TypeScript), PHPStan, Vitest, PHPUnit, Playwright, and a build + zip of the release.

---

## 17. Milestones and acceptance criteria

**Phase 0 — Discovery & plan (stop for approval)**
Study `reference/` per §3. Produce `docs/ARCHITECTURE.md`, `docs/PLAN.md`, `docs/DATA-SCHEMA.md` (product config + design document v1 with Zod and JSON Schema), a UI wireframe description (or a static HTML prototype of the editor shell), and a list of open questions. Confirm library versions.

**Phase 1 — Foundation**
Plugin bootstrap, Composer/Vite setup, wp-env, CI, HPOS/Blocks compatibility declarations, settings storage, REST skeleton with auth, custom tables + migrations, asset enqueue from the Vite manifest, i18n setup.
*Accept when* the plugin activates cleanly on a fresh WP + Woo, CI is green, and REST health returns 200 with auth.

**Phase 2 — Editor core (Template mode, single side)**
Document schema + store + undo/redo, Fabric adapter, mm units, print area with clip/ghost, text (incl. curved), image upload pipeline (server + client), shapes/clipart with recolouring, QR, layers panel, snapping, keyboard shortcuts, desktop shell UI.
*Accept when* a shopper can create a design with all element types on one side, undo/redo 50 steps, and reload to restore from autosave.

**Phase 3 — Image controls, crop, masks, filters, templates**
The owner's handle behaviour, native crop, masks, filters/presets, image placeholders, template builder (admin mode) with element permissions.
*Accept when* crop/handles match §7 exactly and an admin can build a template with locked/editable elements that the shopper respects.

**Phase 4 — Gallery Mockup mode + hybrid**
Base-image sources and fallbacks, the locked base layer, fit, base-layers-below, template opacity, gallery-as-sides, the visual print-area editor on the product screen with mm calibration, mode switch with carry-over, variation image following.
*Accept when* on a product with a gallery, Customize opens with the first gallery image locked as the base, the shopper can't select/move/delete it, design elements stay inside the drawn print area, switching variation swaps the photo while keeping the elements, and the hybrid switch works.

**Phase 5 — 3D preview**
Model CPT + admin viewer, GLB upload, FPD folder import, mesh mapping, UV test, camera presets, materials/env. Runtime: lazy load, CanvasTexture pipeline, throttled updates, render on demand, orbit/tilt/zoom/reset/auto-rotate/fullscreen, 2D↔3D side linking, colour link, snapshot, fallback.
*Accept when* edits appear on the model within ~150 ms after release (≤ 100 ms low-res during drag on a mid-range laptop), there's no texture leak over 100 edits, and it works on iOS Safari and Android Chrome.

**Phase 6 — Commerce**
Pricing engine (TS + PHP parity), add to cart, cart/mini-cart/checkout classic + Blocks, edit from cart, order meta, order admin meta box, emails, My Account designs, save/share links, guest tokens.
*Accept when* E2E passes through Blocks checkout and the price can't be tampered with from the client.

**Phase 7 — Print output**
Client high-res render + chunked upload, job manifest, PDF/SVG/PNG assembly, job sheet, ZIP, regenerate, external-renderer hook.
*Accept when* a 300 × 205 mm area at 300 DPI produces a 3543 × 2421 px PNG and a PDF with the correct trim/bleed boxes, and the SVG text matches the editor.

**Phase 8 — UX polish, mobile, accessibility, theming**
Tablet/mobile layouts and bottom sheets, gestures, onboarding, pre-flight checklist, theming UI, dark theme, reduced motion, axe-clean, RTL.

**Phase 9 — Importers, privacy, performance, docs, release**
Lumise/FPD/gallery-base importers, GDPR exporters/erasers, retention jobs, performance budgets met, `docs/USER-GUIDE.md` (store owner), `docs/3D-MODELS.md` (how to prepare a GLB: mesh naming, UV layout, scale, triangle budget, Blender export settings), `docs/HOOKS.md`, `readme.txt`, release zip.

**Phase 10 (v1.x, after release)** — Perspective quad warp for Gallery mode (§5.2), optional background-removal integration (via hook/add-on), a 2.5D mockup preview for products without a 3D model (displacement + shading overlay), and an optional Node render service.

---

## 18. Definition of done (whole project)

- [ ] All §7 editor features work on desktop, tablet and mobile.
- [ ] Template, Gallery Mockup and Hybrid modes work as specified in §5.
- [ ] The 3D preview updates live and supports rotate/tilt/zoom/reset/fullscreen, with no memory growth.
- [ ] Classic and Blocks cart/checkout, HPOS on and off.
- [ ] Print files are correct in size, DPI and content, and reproducible.
- [ ] Security review checklist (§13) passed and documented.
- [ ] WCAG 2.2 AA (axe clean + manual keyboard pass).
- [ ] Performance budgets met.
- [ ] CI green: PHPCS, PHPStan, ESLint, TypeScript, Vitest, PHPUnit, Playwright.
- [ ] Docs complete; the release zip installs on a clean site.
- [ ] No code, assets or models copied from Lumise or FPD (state this in `docs/ARCHITECTURE.md` with the list of third-party libraries and licences).

---

## 19. Assumptions to confirm in Phase 0 (ask me)

1. Plugin name, slug, text domain and brand accent colour.
2. Minimum versions: PHP 8.1 / WP 6.6 / Woo 9.x. Is that OK for the hosting?
3. Is Imagick available on the production server (needed for HEIC, PDF assembly, CMYK)?
4. Which products come first (they decide which 3D models and blueprints to build for testing)? Do existing FPD 3D models need importing?
5. Do Lumise data (templates, cliparts, fonts) need importing from a live database?
6. Currency/locale (the store appears to be in South Africa, ZAR). Any multi-currency plugin in use?
7. Is guest design saving allowed, and how long should unordered designs be kept?
8. Preferred print-file formats from the print shop (PDF/X? PNG only? CMYK required?).
