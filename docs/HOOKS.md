# Hooks

Public extension points. PHP hooks use the `bps/` prefix. JavaScript hooks (`@wordpress/hooks`, `bps.*`) arrive with the editor in Phase 2. Each entry states the version it was added in. Hooks listed in BUILD_PROMPT §15 that are not here yet are added in the phase that implements their feature.

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

## REST API

All routes live under `/wp-json/bps/v1`.

| Route | Method | Permission | Since |
|---|---|---|---|
| `/health` | GET | `manage_woocommerce` (401 logged out, 403 without the capability) | 0.1.0 |

## Constants

| Constant | Where | Effect |
|---|---|---|
| `BPS_VITE_DEV_SERVER` | `wp-config.php` | Load scripts from the Vite dev server (e.g. `'http://localhost:5173'`) instead of `assets/dist`. Development only. |
