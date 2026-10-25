import { chromium, type FullConfig } from '@playwright/test';
import { launchOptions } from '../../../playwright.config.ts';

/** Log in once as the admin and save the session for every test. */
export default async function globalSetup(config: FullConfig): Promise<void> {
	const use = config.projects[0]?.use;
	if (!use || typeof use.storageState !== 'string') {
		throw new Error('playwright.config.ts must set a storageState file path.');
	}
	const browser = await chromium.launch(launchOptions);
	const page = await browser.newPage({ baseURL: use.baseURL ?? '' });
	await page.goto('/wp-login.php');
	await page.fill('#user_login', process.env.WP_ADMIN_USER ?? 'admin');
	await page.fill('#user_pass', process.env.WP_ADMIN_PASSWORD ?? 'password');
	await page.click('#wp-submit');
	await page.waitForURL(/wp-admin/);
	await page.context().storageState({ path: use.storageState });
	await browser.close();
}
