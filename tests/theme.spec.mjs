import { test, expect, chromium } from '@playwright/test';
import path from 'path';

const extensionPath = path.resolve(process.cwd());

test.describe('Moetran Helper Extension - Level 2 Side-Popping Theme Menu Test', () => {
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

  test('Anti-FOUC preloader sets data-mt-theme on html at document_start', async () => {
    await page.goto('https://moetran.com', { waitUntil: 'domcontentloaded' });
    
    const themeAttr = await page.getAttribute('html', 'data-mt-theme');
    const modeAttr = await page.getAttribute('html', 'data-mt-mode');
    
    console.log(`[Test Log] Initial html data-mt-theme: "${themeAttr}", data-mt-mode: "${modeAttr}"`);
    expect(themeAttr).toBeTruthy();
    expect(['dark', 'light']).toContain(themeAttr);
    expect(modeAttr).toBe('system');
  });

  test('Level 1 Menu Pops Up on Trigger Click', async () => {
    const triggerBtn = page.locator('#mt-floating-trigger-btn');
    const triggerText = page.locator('#mt-floating-btn-text');
    await expect(triggerBtn).toBeVisible({ timeout: 10000 });
    await expect(triggerText).toHaveText('种植园尨译助手');
    
    await triggerBtn.click();
    await expect(triggerText).toHaveText('关闭');

    const subMenu = page.locator('#mt-sub-menu');
    await expect(subMenu).toHaveClass(/mt-open/);

    const themeL1Btn = page.locator('#mt-action-theme');
    await expect(themeL1Btn).toBeVisible();
    await expect(themeL1Btn).toHaveText(/切换主题/);
  });

  test('Click Level 1 "切换主题" Pops Up Level 2 Side Menu with Checkmarks', async () => {
    const themeL1Btn = page.locator('#mt-action-theme');
    await themeL1Btn.click();

    const level2Menu = page.locator('#mt-theme-level2-menu');
    await expect(level2Menu).toHaveClass(/mt-open/);

    const optSystem = page.locator('#mt-theme-opt-system');
    const optDark = page.locator('#mt-theme-opt-dark');
    const optLight = page.locator('#mt-theme-opt-light');

    await expect(optSystem).toBeVisible();
    await expect(optDark).toBeVisible();
    await expect(optLight).toBeVisible();

    // Default system option should have checkmark (mt-selected)
    await expect(optSystem).toHaveClass(/mt-selected/);
    console.log('[Test Log] Level 2 side menu popped up with default "跟随系统" selected!');
  });

  test('Selecting "强制深色" Updates Checkmark, Site Theme & Keeps Level 2 Open', async () => {
    const optDark = page.locator('#mt-theme-opt-dark');
    const optSystem = page.locator('#mt-theme-opt-system');
    const level2Menu = page.locator('#mt-theme-level2-menu');

    await optDark.click();

    // Checkmark moves to Dark option
    await expect(optDark).toHaveClass(/mt-selected/);
    await expect(optSystem).not.toHaveClass(/mt-selected/);

    // Site theme attribute updates
    await expect(page.locator('html')).toHaveAttribute('data-mt-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-mt-mode', 'dark');

    // Level 2 menu stays open for preview
    await expect(level2Menu).toHaveClass(/mt-open/);
    console.log('[Test Log] Selected "强制深色": Checkmark updated, theme changed to dark, menu kept open!');
  });

  test('Selecting "强制浅色" Updates Checkmark & Site Theme', async () => {
    const optLight = page.locator('#mt-theme-opt-light');
    const optDark = page.locator('#mt-theme-opt-dark');

    await optLight.click();

    // Checkmark moves to Light option
    await expect(optLight).toHaveClass(/mt-selected/);
    await expect(optDark).not.toHaveClass(/mt-selected/);

    // Site theme attribute updates
    await expect(page.locator('html')).toHaveAttribute('data-mt-theme', 'light');
    await expect(page.locator('html')).toHaveAttribute('data-mt-mode', 'light');
    console.log('[Test Log] Selected "强制浅色": Checkmark updated, theme changed to light!');
  });

  test('Clicking Outside Closes All Menus & Restores Main Capsule Label to "种植园尨译助手"', async () => {
    const triggerBtn = page.locator('#mt-floating-trigger-btn');
    const triggerText = page.locator('#mt-floating-btn-text');
    const subMenu = page.locator('#mt-sub-menu');
    const level2Menu = page.locator('#mt-theme-level2-menu');

    // Click outside on body (x:500, y:500) to close sub-menus
    const elemAtPoint = await page.evaluate(() => {
      const el = document.elementFromPoint(500, 500);
      return { id: el?.id, className: el?.className, tagName: el?.tagName };
    });
    console.log('[Test Log] Element at (500, 500):', elemAtPoint);
    await page.click('body', { position: { x: 500, y: 500 } });
    await expect(subMenu).not.toHaveClass(/mt-open/);
    await expect(triggerText).toHaveText('种植园尨译助手');

    // Step 1: Click trigger button -> Level 1 menu opens, text becomes "关闭"
    await triggerBtn.click();
    await expect(subMenu).toHaveClass(/mt-open/);
    await expect(triggerText).toHaveText('关闭');

    // Step 2: Click "切换主题" Level 1 button -> Level 2 side menu opens
    await page.locator('#mt-action-theme').click();
    await expect(level2Menu).toHaveClass(/mt-open/);
    await expect(triggerText).toHaveText('关闭');

    // Step 3: Click outside on body (x:500, y:500) -> All sub-menus close, text restores to "种植园尨译助手"
    await page.click('body', { position: { x: 500, y: 500 } });

    await expect(subMenu).not.toHaveClass(/mt-open/);
    await expect(level2Menu).not.toHaveClass(/mt-open/);
    await expect(triggerText).toHaveText('种植园尨译助手');
    console.log('[Test Log] Clicked outside: All sub-menus closed and text restored to "种植园尨译助手"!');
  });

  test('Persistence across page reload (Anti-FOUC)', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    const themeAttrAfterReload = await page.getAttribute('html', 'data-mt-theme');
    const modeAttrAfterReload = await page.getAttribute('html', 'data-mt-mode');
    
    console.log(`[Test Log] After reload html data-mt-theme: "${themeAttrAfterReload}", data-mt-mode: "${modeAttrAfterReload}"`);
    expect(themeAttrAfterReload).toBe('light');
    expect(modeAttrAfterReload).toBe('light');
  });
});
