import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests run against a WordPress site with WooCommerce and this plugin active:
 * the wp-env tests site by default (`npm run env:start`), or any site via WP_BASE_URL.
 */
const baseURL = process.env.WP_BASE_URL ?? 'http://localhost:8889';

/** Optional system Chromium, for machines where `playwright install` can't run. */
const executablePath = process.env.PW_CHROMIUM_PATH;
export const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
	testDir: 'tests/e2e',
	outputDir: 'test-results',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	globalSetup: './tests/e2e/setup/global-setup.ts',
	use: {
		baseURL,
		storageState: 'test-results/.auth/admin.json',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		launchOptions,
	},
	projects: [
		{ name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
	],
});
