# Reference study notes (Phase 0)

What the discontinued plugins in `reference/` *do* and what we keep or change. This is a description of behaviour only. No code from Lumise or FPD has been or will be copied (clean-room rule, BUILD_PROMPT §2.1). `reference/` is git-ignored and never shipped.

## Lumise 2.1.1

### Editor (`assets/js/app.js`, 21,277 lines, one `window.lumise` object)
Top-level modules and where they live:

| Module | Line | Role |
|---|---|---|
| `ops` | 57 | global mutable state bag |
| `objects` | 861 | Fabric event wiring, element factories (`text`, `curvedText`, `qrcode`, `lumise.*`), `clipto` hack |
| `design` | 2311 | panel events, layers, nav, text effects UI (~4,000 lines) |
| `templates` / `cliparts` | 6478 / 6767 | library browsing, drag-drop |
| `tools` | 7112 | set/export/import/clear/save, SVG colour editing |
| `stack` | 8831 | undo/redo (full JSON snapshots per stage) |
| `get` | 8960 | sizes, DPI, colour |
| `fn` | 9268 | ~80 helpers: image FX, crop, export, upload checks, `create_canvas`, cookies, price formatting |
| `render` | 14518 | product, fonts, stage nav, cart |
| `indexed` | 16415 | IndexedDB "my designs" and upload cache |
| `cart` | 17807 | cart and price |

**Stage composition** (`fn.create_canvas`, line 12048): one `fabric.Canvas` per side, sized to the DOM container. Contents, bottom to top: `productColor` rect (tints the blank) → product image (`selectable:false, evented:false`) → `limit_zone` rect (dashed, hidden until drag) → optional bleed + crop-mark rects. Overlay mode uses `canvas.setOverlayImage(product)`, so the image draws above the design.

**Fragile geometry, confirmed**: the edit zone is stored in pixels of the admin's preview and rescaled with `ez_ratio = displayedProductWidth / stage.product_width`, then offset with magic numbers (`canvas.height - 40`, `* 0.9`). Saved designs therefore store screen-space Fabric JSON plus `product_width`, `product_height` and `devicePixelRatio`, and every reload has to re-derive scale. **Our fix: mm relative to the print area (ADR-0003).**

**Text effects**: `i-text` (normal), `curvedText` (custom class, radius + direction), and `text-fx` (`bridge` with `oblique` flag: rasterised via `fn.bridgeText` to an image). Bridge/oblique being raster means it doesn't export as vector. **Our fix: vector path-based warp so SVG/PDF match.**

**Export format** (`fn.export`, 13147): `{stages:{<name>:{data, edit_zone, image, overlay, product_width, product_height, devicePixelRatio, screenshot}}, type, extra, updated, name, id, system_version}`. Screenshots are base64 PNG inside the JSON. The importer adapter (Phase 9) must undo `ez_ratio` per stage to recover mm.

### Pricing (`core/cart.php::printing_calc`, line 812)
A print method has `calculate = base64(urlencode(json))` with:
- `type`: `color | character | line | fixed | acreage | size`
- `multi`: whether each side has its own rule table (otherwise side 0's table applies to all)
- `values[side][qtyKey][option]`, where `qtyKey` is a tier like `"10"`, `"50"`, `">100"`, and `option` is e.g. `"2-color"`, `"full-color"`, `"12-character"`, `"ppu"` (price per unit fallback), `price`
- `cfgpricing`: use option-specific prices instead of `ppu`

Tier selection: the first tier key ≥ qty (with `">N"` meaning qty > N). The result is per unit, then multiplied by qty elsewhere. **We keep the concept, not the encoding.** The new rule format is a typed JSON table, validated, and shared with TS through fixtures (ADR-0008).

### Data
Parallel tables `lumise_products, _templates, _cliparts, _shapes, _fonts, _printings, _categories, _tags, _designs, _orders, _order_products, _sessions, _guests, _shares, _settings, _languages, _bugs`. Products (`stages`, `variations`, `attributes`, `printings` as JSON text) duplicate Woo. We replace them with Woo products, CPTs and two custom tables (DATA-SCHEMA.md).

## Fancy Product Designer 6.5.0 — 3D preview only

`inc/addons/class-3d-preview.php` (PHP, 2.8 KB) + `assets/js/3dpreview/3d-preview-all.min.js` (three.js r157 + ~4 KB of glue).

Behaviour:
- PHP scans `uploads/fpd_3d/*/config.json`. A view's `threeJsPreviewModel` option names the folder. Placement: `designer | before_fpd | after_fpd | before_single_product_summary | shortcode`.
- Each folder must contain `config.json`, `model.fbx` and `environment_map.hdr` (an HDR **per model**).
- Config keys used: `id, camera_z, base_material_metalness, base_material_roughness, ambient_Light_color, material_color, customMaterialLayers{meshName: normalMapFile}, print_padding, only_exportable`.
- Mesh named exactly `custom` → view 0; `custom_N` → view N, parsed with `substring(7,8)`, so **only single-digit N works** (view 10+ silently maps to 1).
- Printable meshes get `MeshStandardMaterial{color:white, metalness, roughness, envMap, envMapIntensity .9, transparent, side: DoubleSide}`. Other meshes get the same material with `material_color`. Optional normal map per mesh.
- Camera: perspective 45°, `z = camera_z`, OrbitControls with distance `camera_z ± 50` (hard-coded), white background, ambient light only.
- On `viewCanvasUpdate`: export the printing box ± `print_padding` as a PNG data URL → `new Image()` → `new Texture()` → swap `.map`. The old texture is never disposed.
- `elementFillChange` with `colorLink3DLayer` → set `.color` on meshes with that name.
- `loadModel` appends `?id=<random>` (defeats cache). The render loop runs continuously with `requestAnimationFrame`.
- Canvas is rendered at 2× CSS size by hand instead of using `devicePixelRatio`.

All weaknesses in BUILD_PROMPT §3.2 are confirmed, plus the two-digit view bug and the per-model HDR. The FPD importer (Phase 9) maps the config keys above.

## Owner add-ons (logic reusable)

### `fpd-gallery-base` v1.1.0
- Settings (`fpdgb_settings`): `fit` (contain|cover), `base_layers` (int ≥ 0), `template_opacity` (0–1, default 1), `template_titles` (newline/comma list), `debug`.
- Per product meta `_fpd_gallery_disable = yes|no`.
- Filter `fpdgb_config($config, $productId)` with keys `image, title, baseLayers, fit, templateOpacity, templateTitles, debug`.
- Behaviour: first gallery image at **full** size. It is fitted into the **printing box** (`Math.min` / `Math.max` of box/natural ratios), centred, then locked (`lockMovement*`, `lockRotation`, `lockScaling*`, `hasControls:false`, `selectable:false`, `evented:false`, plus FPD's `removable/draggable/rotatable/resizable/copyable/zChangeable:false`) and moved to z-index `baseLayers`.
- Dimming: every non-custom layer (or only the listed titles) gets `opacity = templateOpacity`.
- Implementation polls every 500 ms for `window.fancyProductDesigner` and re-checks with 250 ms intervals. **Ours is native and event-driven.**
- Note: the add-on fits the photo *into the print box*. In our Gallery mode the print area is drawn *on* the photo, so the photo defines the stage and `fit` controls how the stage fills the editor viewport (ADR-0006).

### `fpd-unlock-handles` v1.2.1
- On image select/add: `lockUniScaling:false`, `centeredScaling:false`, all 4 mid handles visible (`ml, mr, mt, mb`).
- Crop button inserted after Transform. It opens FPD's advanced image editor with a plain rectangle SVG mask. The mask gets `centeredScaling:false` and mid handles.
- CSS hides the element toolbar while the crop editor is open, and hides Crop for non-images.
- **Ours**: native crop mode with a normalised crop rect, 8 handles from the opposite edge, aspect presets, Apply/Cancel/Reset (BUILD_PROMPT §7).

## Owner's current setup (from the screenshot)
Lumise editor with a white mug, two sides labelled **Right / Left**, a dashed print area per side, and the starter text "Add a heading". Accent is a violet close to `#6C4BE0`. The mug looks like a natural first test product (open question Q4).
