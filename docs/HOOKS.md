# Hooks

Public extension points. PHP hooks use the `bps/` prefix. JavaScript extension points are listed under *JavaScript*. Each entry states the version it was added in. Hooks listed in BUILD_PROMPT §15 that are not here yet are added in the phase that implements their feature.

## PHP actions

### `bps/loaded`

Fires once after Product Studio has booted (on `plugins_loaded`, priority 20), and only if the WordPress and WooCommerce requirements are met.

| Parameter | Type | Description |
|---|---|---|
| `$container` | `Blumoon\ProductStudio\Container` | The plugin's service container. Use `get()` to reach a service, for example `Settings::class`. |

```php
add_action( 'bps/loaded', function ( \Blumoon\ProductStudio\Container $container ) {
	$settings = $container->get( \Blumoon\ProductStudio\Infrastructure\Settings::class );
	// ...
} );
```

Since 0.1.0.

## PHP filters

### `bps/product/config`

Filters a product's Product Studio configuration (validated against `product-config.v1`) each time it is read.

| Parameter | Type | Description |
|---|---|---|
| `$config` | `array<string, mixed>` | `enabled`, `blueprintId` and the other product settings. |
| `$productId` | `int` | The product id. |

Return a non-array to treat the product as not customisable. Since 0.2.0.

### `bps/editor/bootstrap_data`

Filters the data the shopper editor boots with (`GET /editor/bootstrap`). It contains the product, the currency, the mode, the sides with image URLs and print areas in mm, the product colours and the editor settings.

| Parameter | Type | Description |
|---|---|---|
| `$data` | `array<string, mixed>` | The bootstrap payload. |
| `$productId` | `int` | The product id. |
| `$variationId` | `int` | The variation id, or 0. |

Since 0.2.0.

## REST API

All routes live under `/wp-json/bps/v1`.

| Route | Method | Permission | Since |
|---|---|---|---|
| `/health` | GET | `manage_woocommerce` (401 logged out, 403 without the capability) | 0.1.0 |
| `/editor/bootstrap?product=&variation=` | GET | Public, but only for products with Product Studio enabled (404 otherwise) | 0.2.0 |
| `/uploads` | POST | Logged-in users, or guests sending the `X-BPS-Request: 1` header. Rate-limited | 0.2.0 |
| `/uploads` | GET | The requester's own uploads (user, or guest token cookie) | 0.2.0 |
| `/uploads/{id}/file?size=&exp=&sig=` | GET | Signed, expiring URL (403 for a bad or expired signature) | 0.2.0 |
| `/assets/clipart?search=&category=&page=&per_page=&include=` | GET | Public | 0.2.0 |
| `/assets/clipart-categories` | GET | Public | 0.2.0 |

## JavaScript

### `window.bps.editor`

While the editor is open, `window.bps.editor` is its model (`EditorModel` in `packages/editor-ui/src/model.ts`). Useful members:
- `session`: the document, the command store with undo/redo, `select(ids)` and typed events.
- `elements()`, `selected()` and `selection` (a signal).

It is removed when the editor closes. Treat it as experimental until 1.0. Since 0.2.0.

## WP-CLI

| Command | Effect |
|---|---|
| `wp bps blueprint-import <file> --title=<title> [--id=<id>] [--porcelain]` | Create or update a blueprint from a `blueprint.v1` JSON file. |
| `wp bps blueprint-list` | List blueprints. |
| `wp bps product-enable <product> --blueprint=<id>` | Make a product customisable with a blueprint. |
| `wp bps product-disable <product>` | Turn customisation off for a product. |

## Constants

| Constant | Where | Effect |
|---|---|---|
| `BPS_VITE_DEV_SERVER` | `wp-config.php` | Load scripts from the Vite dev server (e.g. `'http://localhost:5173'`) instead of `assets/dist`. Development only. |
