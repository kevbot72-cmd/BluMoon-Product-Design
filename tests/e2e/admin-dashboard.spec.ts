import { expect, test } from '@playwright/test';

test.describe('Product Studio admin', () => {
	test('dashboard loads the module bundle and shows system health', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('response', (response) => {
			// Some local servers don't route /favicon.ico through WordPress; it isn't ours.
			if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
				errors.push(`${response.status()} ${response.url()}`);
			}
		});

		await page.goto('/wp-admin/admin.php?page=bps');

		await expect(page.getByRole('heading', { name: 'Product Studio', level: 1 })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'System health' })).toBeVisible();
		const checks = page.getByRole('list', { name: 'Checks' });
		await expect(checks.getByRole('listitem').filter({ hasText: 'Database tables' })).toContainText('OK');
		await expect(checks.getByRole('listitem').filter({ hasText: 'Private upload folder is writable' })).toContainText('OK');

		// Vite output is loaded as an ES module with its hashed file name and CSS.
		await expect(page.locator('script#bps-admin-js[type="module"]')).toHaveAttribute('src', /assets\/dist\/js\/admin-[\w-]+\.js$/);
		await expect(page.locator('link#bps-admin-0-css')).toHaveAttribute('href', /assets\/dist\/assets\/admin-[\w-]+\.css$/);
		expect(errors).toEqual([]);
	});

	test('health route answers the logged-in admin through apiFetch (nonce)', async ({ page }) => {
		await page.goto('/wp-admin/admin.php?page=bps');
		const health = await page.evaluate(() => (window as unknown as { wp: { apiFetch: (o: { path: string }) => Promise<{ status: string }> } }).wp.apiFetch({ path: '/bps/v1/health' }));
		expect(health.status).toBe('ok');
	});
});

test.describe('anonymous visitors', () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test('health route returns 401', async ({ request }) => {
		const response = await request.get('/wp-json/bps/v1/health');
		expect(response.status()).toBe(401);
	});

	test('storefront loads none of our assets', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('script[src*="/blumoon-product-studio/assets/"], link[href*="/blumoon-product-studio/assets/"]')).toHaveCount(0);
	});
});
