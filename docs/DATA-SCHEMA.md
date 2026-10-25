# Data schema (v1)

**Source of truth: the Zod files in `schema/src/`** (they move to `packages/editor-core/src/schema/` in Phase 1). `npm run generate` writes the JSON Schema (draft 2020-12) to `schema/json/`. PHP validates against those files with opis/json-schema. `npm run check` validates the example fixtures in `schema/examples/`. A Phase 0 spike confirmed the round trip: the Zod-generated schema validates the examples in PHP and rejects a tampered document.

## 1. Units and geometry

| Concept | Unit | Notes |
|---|---|---|
| Element position/size | **mm**, relative to the print area's top-left | `(x, y)` is the unrotated box's top-left. Rotation is in degrees, clockwise, around the box centre. |
| Font size | pt (1 pt = 25.4/72 mm) | Printers think in pt. Converted through `Units`. |
| Crop rect | 0–1 of the source image | Survives replacing the upload with a different resolution. |
| Print area on a base image | 0–1 of the image (`rect`, `quad`) | **Change from the prompt's `rectPx`** (ADR-0011): pixels break when WordPress regenerates sizes or the admin swaps the photo. `ImageRef.widthPx/heightPx` records the size at configuration time, for display. |
| Physical size of an area | `sizeMm {w, h}` | Calibrates the side. `rect` aspect must match within 1 %. |
| Side stage size (derived) | mm | `stageMm.w = sizeMm.w / rect.w`, `stageMm.h = sizeMm.h / rect.h`, from the side's **first** print area. Other areas on that side take their mm size from the same scale (shown read-only in admin). |
| Effective DPI of an image | px/in | `min(naturalPx.w × crop.w / (w / 25.4), naturalPx.h × crop.h / (h / 25.4))`. Badge: green ≥ area dpi, amber ≥ 150, red below. |
| Print pixels | px | `round(sizeMm / 25.4 × dpi)` (+ 2 × bleed). 300 × 205 mm at 300 dpi → 3543 × 2421. |

**Re-anchoring** (variation swap, base-image change, mode switch): an element's centre is mapped as a 0–1 position inside the old area, then onto the new area. Its size is kept in mm, and it is scaled down to fit only if it now overflows the new area. One function (`reanchor`) handles all three cases.

## 2. Design document v1 (`schema/src/design-document.ts`)

```
DesignDocument
  schemaVersion: 1
  productId, variationId (0 = simple), mode: 'template'|'gallery', blueprintId|null
  units: 'mm'
  sides: { [sideId]: { printAreas: { [areaId]: { elements: Element[] (≤300) } } } }
  options: { productColor|null, printMethodId|null, …extensible }
  meta: { templateId|null, createdWith? }

Element (discriminated on `type`)
  common: id, name?, x, y, w, h, rotation, flipX, flipY, opacity, hidden,
          locks{position?, all?}            ← the shopper's own locks
          permissions?                       ← from a template; the shopper can't change
          meta{}
  text         text, font{family, weight, style, sizePt}, fill, stroke|null, shadow|null,
               letterSpacing (1/1000 em), lineHeight, align, uppercase,
               effect: none | arc{radiusMm, direction} | bridge{curve, offset} | oblique{angle}
  image        source: upload{uploadId} | asset{attachmentId}, naturalPx, crop (0–1),
               mask|null, preset|null, filters[], keepAspect (default false: owner's add-on)
  shape|clipart attachmentId, colors{original → replacement}, keepAspect
  qr           payload: url|text|vcard|wifi|email|phone, fg, bg|null, ecc, quietZone
  drawing      strokes[{d (mm path), color, widthMm, mode: draw|erase}]
  placeholder  frame|null, fill|null {source, naturalPx, offsetXMm, offsetYMm, scale ≥ 1}, hint
  group        children: leaf elements (no nested groups)

Permissions
  lock: none|position|all, deletable, editableText, replaceableImage, maxChars?,
  allowedFonts?, allowedColors?, required, dimmed, dimmedInPrint
```

Not in the document, on purpose: the Gallery base photo (stage state, resolved from product config), screen pixels, zoom, selection, Fabric internals, and image URLs (resolved from ids at render time through signed URLs).

**Migrations**: `migrations/vN-to-vN+1.ts` and `src/Migration/Document/VNToVN1.php`. Both run on load, before validation. Each migration has golden-fixture tests in TS and PHP.

**Server-side checks beyond the schema** (`bps/design/validate` filter): every `uploadId` belongs to the requester (user or guest hash), every `attachmentId` is a published BPS asset, fonts are in the allowed list, side/area ids exist in the resolved product config, and template permissions were respected (locked elements unchanged against the template, `maxChars`, `required`).

## 3. Product config v1 (`_bps_config` post meta; `schema/src/product-config.ts`)

```
ProductConfig
  schemaVersion: 1, enabled, modes[template|gallery], defaultMode, required (hide plain add-to-cart)
  blueprintId|null
  gallery|null
    source: first_gallery_image|featured_image|variation_image|attachment, attachmentId|null
    useGalleryAsSides, fit: contain|cover, baseLayersBelow, templateOpacity,
    dimOnlyLayerTitles[], dimmedInPreview3d, includeBaseInPrint, templateId|null
    sides: SideDefinition[]
  preview3d|null
    modelId, meshMap[{mesh, side, printArea, uvRect, rotation, flipY}],
    texture{source: design_only|design_over_base_crop|design_over_color, background, maxSize, includeBleed},
    colorLink{attribute, mesh}|null, camera{[side]: {azimuth, polar, distance}}
  pricing: basePerSide{}, perTextElement, perImage, printMethodId|null, templateFee
  variations: { [variationId]: { blueprintId?, productColor?, modelColor?, baseImages{side: ImageRef}? } }

SideDefinition (shared with blueprints)
  id, label, base: ImageRef|null, overlay: ImageRef+blend|null, mask: ImageRef|null,
  printAreas: PrintArea[1..8]

PrintArea
  id, label, shape: rect|roundedRect|ellipse|path, cornerRadiusMm, pathD|null (0–1 space),
  rect (0–1), quad|null (v1.x), sizeMm, bleedMm=3, safeMm=5, dpi=300, clip=true
```

## 4. WordPress entities

| Entity | Storage | Key fields |
|---|---|---|
| Blueprint | CPT `bps_blueprint` (not public) | meta `_bps_blueprint` = `{schemaVersion, sides: SideDefinition[], colors: [{name, hex, attributeTerm?}], starterTemplateId, allowedTemplateIds[]}` |
| Design template | CPT `bps_template` + taxonomy `bps_template_cat` | meta `_bps_document` (DesignDocument without productId; it targets a blueprint or "any"), `_bps_preview` (attachment id) |
| Clipart / shape / mask | attachment + meta `_bps_asset_type` (`clipart|shape|mask`), `_bps_recolorable`, `_bps_price`; taxonomy `bps_asset_cat`, `bps_asset_tag` | |
| Font | CPT `bps_font` | meta `_bps_font` = `{family, source: google|upload, variants: [{weight, style, woff2AttachmentId}], licence, categories}` |
| 3D model | CPT `bps_model` | meta `_bps_model` = `{fileAttachmentId, format: glb|gltf|fbx, meshes: [{name, role: printable|color-linked|static|hidden, material{…}}], cameraPresets{}, limits{minDistance, maxDistance, minPolar, maxPolar}, env{kind: room|hdr, attachmentId?, exposure}, background, shadow, autoRotate, report{triangles, bytes, textures[]}, importedFrom?}` |
| Print method | CPT `bps_print_method` | meta `_bps_rules` (§6) |
| Settings | option `bps_settings` (autoload) + `bps_settings_theme` | validated by its own Zod/JSON schema |

## 5. Custom tables

Created and upgraded by `Migration/Tables` with `dbDelta`. The version is stored in option `bps_db_version`.

```sql
CREATE TABLE {prefix}bps_designs (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid             CHAR(36)        NOT NULL,
  user_id          BIGINT UNSIGNED NOT NULL DEFAULT 0,
  guest_hash       CHAR(64)        NULL,          -- sha256 of guest token
  product_id       BIGINT UNSIGNED NOT NULL,
  variation_id     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  mode             VARCHAR(16)     NOT NULL,
  name             VARCHAR(190)    NOT NULL DEFAULT '',
  schema_version   SMALLINT UNSIGNED NOT NULL,
  document         LONGTEXT        NOT NULL,      -- validated JSON
  document_hash    CHAR(64)        NOT NULL,      -- sha256 of canonical JSON
  price_snapshot   TEXT            NULL,          -- server breakdown at last save
  previews         TEXT            NULL,          -- JSON {side: uploadId, '3d': uploadId}
  status           VARCHAR(16)     NOT NULL,      -- draft|cart|ordered|shared
  parent_uuid      CHAR(36)        NULL,          -- copy-on-edit of ordered designs
  order_id         BIGINT UNSIGNED NULL,
  order_item_id    BIGINT UNSIGNED NULL,
  created_at       DATETIME        NOT NULL,
  updated_at       DATETIME        NOT NULL,
  expires_at       DATETIME        NULL,          -- NULL once ordered
  PRIMARY KEY  (id),
  UNIQUE KEY uuid (uuid),
  KEY owner (user_id, status),
  KEY guest (guest_hash),
  KEY product (product_id),
  KEY expires (status, expires_at)
);

CREATE TABLE {prefix}bps_uploads (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id        VARCHAR(48)     NOT NULL,      -- 'u_' + 128-bit random, base62
  user_id          BIGINT UNSIGNED NOT NULL DEFAULT 0,
  guest_hash       CHAR(64)        NULL,
  kind             VARCHAR(16)     NOT NULL,      -- image|svg|proof|print|snapshot
  original_path    VARCHAR(255)    NOT NULL,      -- relative to uploads/bps
  preview_path     VARCHAR(255)    NULL,
  mime             VARCHAR(64)     NOT NULL,
  width            INT UNSIGNED    NULL,
  height           INT UNSIGNED    NULL,
  bytes            BIGINT UNSIGNED NOT NULL,
  sha256           CHAR(64)        NOT NULL,
  design_uuid      CHAR(36)        NULL,
  created_at       DATETIME        NOT NULL,
  expires_at       DATETIME        NULL,
  PRIMARY KEY  (id),
  UNIQUE KEY public_id (public_id),
  KEY owner (user_id),
  KEY guest (guest_hash),
  KEY design (design_uuid),
  KEY expires (expires_at)
);
```

When a guest logs in or registers, their designs and uploads are re-owned by matching `guest_hash`.

## 6. Print method rules (`_bps_rules`)

The Lumise concept (quantity tiers × charge type, per side or shared), stored as typed JSON:

```json
{
  "schemaVersion": 1,
  "type": "colors",                 // colors | characters | lines | fixed | area | size
  "perSide": true,                  // false = sides[0] table applies to every side
  "tiers": [ { "minQty": 1 }, { "minQty": 10 }, { "minQty": 50 }, { "minQty": 100 } ],
  "sides": {
    "front": [                      // one row per tier, same order as tiers
      { "unit": 12.00, "options": { "1": 8.00, "2": 10.00, "full": 15.00 } },
      …
    ]
  },
  "minQty": 1
}
```

Tier = the highest `minQty` ≤ qty (clearer than Lumise's "first key ≥ qty" rule; the importer converts between them). `options` keys depend on `type`: colours used (`"1"`, `"2"`, …, `"full"`), characters or lines (per-unit thresholds), sizes (Woo attribute term slugs). `unit` is the fallback per unit. Calculation is a pure function, `pricing.ts` / `Domain/Pricing/Calculator.php`, tested against the same `tests/fixtures/pricing/*.json` (input document + config + qty → expected breakdown).

## 7. Cart and order data

| Where | Key | Value |
|---|---|---|
| Cart item data | `bps` | `{designUuid, documentHash, mode, price: {total, breakdown[]}, previews: {side: url}}`. Price recomputed server-side on every cart load. |
| Order item meta | `_bps_design_uuid`, `_bps_document_hash`, `_bps_mode`, `_bps_price_breakdown`, `_bps_print_status` (`pending|client_rendering|ready|assembling|done|failed`), `_bps_print_zip` (relative path) | HPOS-safe item meta CRUD only |
| Order item meta (visible) | `Customised` | e.g. "Front, Back · Photo mode", plus a "View design" link |
