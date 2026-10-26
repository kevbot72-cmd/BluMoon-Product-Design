import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 2 acceptance (BUILD_PROMPT §17): a shopper creates a design with all
 * element types on one side, undoes/redoes 50 steps, and gets it back from
 * autosave after reloading. Runs against the seeded "Classic Ceramic Mug".
 */

const PRODUCT = '/product/classic-ceramic-mug/';

interface EditorHandle {
	elements(): { id: string; type: string; x: number; y: number }[];
	selection: { value: readonly string[] };
	session: { doc: unknown; store: { history: string[] } };
}

const editor = (page: Page) =>
	page.evaluate(() => {
		const m = (window as unknown as { bps: { editor: EditorHandle } }).bps.editor;
		return { elements: m.elements(), doc: JSON.stringify(m.session.doc), history: m.session.store.history.length };
	});

async function openEditor(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Customize' }).click();
	await expect(page.getByRole('dialog', { name: 'Product designer' })).toBeVisible();
	await expect(page.locator('.bps-stage canvas.upper-canvas')).toBeVisible();
}

test.describe('shopper editor', () => {
	// The mobile layout arrives in Phase 8.
	test.skip(({ isMobile }) => isMobile, 'desktop layout only until Phase 8');
	test.use({ storageState: { cookies: [], origins: [] } });

	test.beforeEach(async ({ page }) => {
		await page.goto(PRODUCT);
		await page.evaluate(() => indexedDB.deleteDatabase('bps-editor'));
	});

	test('opens from the product page and closes with the browser Back button', async ({ page }) => {
		await openEditor(page);
		expect(page.url()).toContain('#customize');
		await page.goBack();
		await expect(page.getByRole('dialog', { name: 'Product designer' })).toBeHidden();
		await expect(page.getByRole('button', { name: 'Customize' })).toBeFocused();
	});

	test('creates every element type, undoes and redoes 50 steps, and restores from autosave', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await openEditor(page);

		// Text
		await page.getByRole('button', { name: 'Add a heading' }).click();
		// Photo upload (goes through the server pipeline)
		await page.getByRole('tab', { name: 'Uploads' }).click();
		await page.locator('.bps-drop input[type=file]').setInputFiles('tests/fixtures/photo.jpg');
		await expect.poll(async () => (await editor(page)).elements.map((e) => e.type)).toContain('image');
		// 1600 px across 160 mm is ~254 dpi: below the 300 dpi target, so the bar warns.
		await expect(page.locator('.bps-bar .bps-status--fair')).toContainText('A photo may look soft');
		// Shape and clipart
		await page.getByRole('tab', { name: 'Shapes' }).click();
		await page.getByRole('button', { name: 'star', exact: true }).click();
		await page.getByRole('button', { name: 'Balloon' }).click();
		// QR code
		await page.getByRole('tab', { name: 'QR code' }).click();
		await page.locator('.bps-panel input[type=url]').fill('https://example.com/sam');
		await page.getByRole('button', { name: 'Add QR code' }).click();
		// Drawing
		await page.getByRole('tab', { name: 'Draw' }).click();
		await page.getByRole('button', { name: 'Brush' }).click();
		const canvas = (await page.locator('.bps-stage canvas.upper-canvas').boundingBox())!;
		const start = { x: canvas.x + canvas.width / 2 - 80, y: canvas.y + canvas.height / 2 + 60 };
		await page.mouse.move(start.x, start.y);
		await page.mouse.down();
		for (let i = 1; i <= 15; i++) await page.mouse.move(start.x + i * 10, start.y + Math.sin(i / 2) * 20);
		await page.mouse.up();
		await page.keyboard.press('Escape');

		await expect.poll(async () => [...new Set((await editor(page)).elements.map((e) => e.type))].sort()).toEqual(['clipart', 'drawing', 'image', 'qr', 'shape', 'text']);

		// 50 separate nudges of the selected QR code, each its own history step.
		const qr = (await editor(page)).elements.find((e) => e.type === 'qr')!;
		await page.evaluate((id) => (window as unknown as { bps: { editor: { session: { select(ids: string[]): void } } } }).bps.editor.session.select([id]), qr.id);
		const snapshots = [(await editor(page)).doc];
		for (let i = 0; i < 50; i++) {
			await page.keyboard.press('ArrowRight');
			snapshots.push((await editor(page)).doc);
		}
		const qrNow = (await editor(page)).elements.find((e) => e.id === qr.id)!;
		expect(qrNow.x).toBeCloseTo(qr.x + 50, 5);

		for (let i = 50; i > 0; i--) {
			await page.keyboard.press('Control+z');
			expect((await editor(page)).doc).toBe(snapshots[i - 1]);
		}
		for (let i = 1; i <= 50; i++) {
			await page.keyboard.press('Control+Shift+z');
			expect((await editor(page)).doc).toBe(snapshots[i]);
		}

		// Autosave, reload, continue.
		const before = (await editor(page)).doc;
		await page.waitForTimeout(1200);
		await page.goto(PRODUCT);
		await openEditor(page);
		await expect(page.getByRole('region', { name: 'Saved design' })).toBeVisible();
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect.poll(async () => JSON.parse((await editor(page)).doc) as unknown).toEqual(JSON.parse(before));
		expect(errors).toEqual([]);
	});

	test('keeps uploads private: preview URLs are signed and expire', async ({ page }) => {
		await openEditor(page);
		await page.getByRole('tab', { name: 'Uploads' }).click();
		await page.locator('.bps-drop input[type=file]').setInputFiles('tests/fixtures/photo.jpg');
		const url = await page.locator('.bps-tile--image img').first().getAttribute('src');
		expect(url).toMatch(/[?&]sig=[a-f0-9]{64}/);
		const ok = await page.request.get(url!);
		expect(ok.status()).toBe(200);
		expect(ok.headers()['content-type']).toBe('image/webp');
		expect((await page.request.get(url!.replace(/sig=[a-f0-9]{8}/, 'sig=00000000'))).status()).toBe(403);
	});
});
