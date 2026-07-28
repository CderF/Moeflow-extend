import { test, expect, chromium } from '@playwright/test';
import path from 'path';

const extensionPath = path.resolve(process.cwd());

test.describe('Moetran Helper Extension - Meme Wiki (梗百科) Test', () => {
  let context;
  let page;

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });
    page = await context.newPage();
  });

  test.afterAll(async () => {
    if (context) await context.close();
  });

  test('Open floating capsule and click "梗百科" button', async () => {
    await page.goto('https://moetran.com', { waitUntil: 'domcontentloaded' });
    const triggerBtn = page.locator('#mt-floating-trigger-btn');
    await expect(triggerBtn).toBeVisible({ timeout: 10000 });

    await triggerBtn.click();
    const mwikiBtn = page.locator('#mt-action-mwiki');
    await expect(mwikiBtn).toBeVisible();
    await expect(mwikiBtn).toHaveText(/梗百科/);

    await mwikiBtn.click();

    const mwikiModal = page.locator('#mt-mwiki-modal-box');
    await expect(mwikiModal).toHaveClass(/mt-active/);

    const moegirlTab = page.locator('#mt-tab-moegirl');
    const pixivTab = page.locator('#mt-tab-pixiv');
    await expect(moegirlTab).toBeVisible();
    await expect(pixivTab).toBeVisible();
    await expect(moegirlTab).toHaveClass(/mt-active/);

    console.log('[Test Log] Meme Wiki modal opened successfully with Moegirl and Pixiv tabs!');
  });

  test('Switch tabs between Moegirl and Pixiv Dic', async () => {
    const moegirlTab = page.locator('#mt-tab-moegirl');
    const pixivTab = page.locator('#mt-tab-pixiv');

    await pixivTab.click();
    await expect(pixivTab).toHaveClass(/mt-active/);
    await expect(moegirlTab).not.toHaveClass(/mt-active/);

    await moegirlTab.click();
    await expect(moegirlTab).toHaveClass(/mt-active/);
    await expect(pixivTab).not.toHaveClass(/mt-active/);

    console.log('[Test Log] Tab switching between Moegirl and Pixiv Dic verified!');
  });

  test('Close Meme Wiki modal via close button', async () => {
    const closeBtn = page.locator('#mt-mwiki-close-btn');
    const mwikiModal = page.locator('#mt-mwiki-modal-box');
    await closeBtn.click();
    await expect(mwikiModal).not.toHaveClass(/mt-active/);

    console.log('[Test Log] Meme Wiki modal closed successfully!');
  });
});
