import { test, expect, chromium } from '@playwright/test';
import path from 'path';

const extensionPath = path.resolve(process.cwd());

test.describe('Moetran Helper Extension - Japanese Symbol Panel Shortcuts', () => {
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
    await page.goto('https://moetran.com', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#mt-floating-trigger-btn')).toBeVisible({ timeout: 10000 });
    // Wait for the content script to finish loading shortcut config from storage
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-mt-jsym-ready'), null, { timeout: 10000 });
  });

  test.afterAll(async () => {
    if (context) await context.close();
  });

  // Focus a dedicated test textarea so insertSymbol has a real editable target.
  async function focusTestInput() {
    await page.evaluate(() => {
      let el = document.getElementById('e2e-sym-input');
      if (!el) {
        el = document.createElement('textarea');
        el.id = 'e2e-sym-input';
        document.body.appendChild(el);
      }
      el.value = '';
      el.focus();
    });
    return page.locator('#e2e-sym-input');
  }

  async function closeSymbolPanel() {
    const box = page.locator('#mt-jsym-modal-box');
    const isOpen = await box.evaluate((el) => el.classList.contains('mt-active'));
    if (isOpen) await page.locator('#mt-jsym-close-btn').click();
  }

  async function openSymbolPanel() {
    const subMenu = page.locator('#mt-sub-menu');
    const isOpen = await subMenu.evaluate((el) => el.classList.contains('mt-open'));
    if (!isOpen) await page.locator('#mt-floating-trigger-btn').click();
    await page.locator('#mt-action-jsym').click();
    await expect(page.locator('#mt-jsym-modal-box')).toHaveClass(/mt-active/);
  }

  async function enterEditMode() {
    const box = page.locator('#mt-jsym-modal-box');
    const isOpen = await box.evaluate((el) => el.classList.contains('mt-active'));
    if (!isOpen) await openSymbolPanel();
    const editor = page.locator('.mt-jsym-edit-head');
    if ((await editor.count()) === 0) {
      await page.locator('#mt-jsym-edit-btn').click();
    }
    await expect(page.locator('.mt-jsym-edit-list')).toBeVisible();
  }

  test('Default shortcut Alt+Shift+1 inserts ♥ into focused input', async () => {
    await closeSymbolPanel();
    const input = await focusTestInput();
    await page.keyboard.press('Alt+Shift+1');
    await expect(input).toHaveValue('♥');
  });

  test('Unconfigured combo Alt+Shift+6 does nothing', async () => {
    const input = await focusTestInput();
    await page.keyboard.press('Alt+Shift+6');
    await expect(input).toHaveValue('');
  });

  test('Shortcut with no focused input opens panel and shows hint', async () => {
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await closeSymbolPanel();
    await page.keyboard.press('Alt+Shift+1');
    await expect(page.locator('#mt-jsym-modal-box')).toHaveClass(/mt-active/);
    await expect(page.locator('#mt-jsym-hint')).toContainText('请先点击翻译输入框');
  });

  test('Customize slot 2 (symbol ★, combo Alt+Shift+7) persists across reload', async () => {
    await enterEditMode();
    // Change symbol of slot 2 (index 1) to ★
    await page.locator('.mt-jsym-edit-row[data-slot="1"] [data-act="pick"]').click();
    await page.locator('.mt-jsym-pick-sym[data-symbol="★"]').click();
    await expect(page.locator('.mt-jsym-edit-row[data-slot="1"] .mt-jsym-edit-sym')).toHaveText('★');
    // Record combo Alt+Shift+7 for slot 2
    await page.locator('.mt-jsym-edit-row[data-slot="1"] [data-act="record"]').click();
    await page.keyboard.press('Alt+Shift+7');
    await expect(page.locator('.mt-jsym-edit-row[data-slot="1"] .mt-jsym-edit-combo')).toContainText('Shift+7');
    // Save
    await page.locator('[data-act="save"]').click();
    await expect(page.locator('#mt-jsym-hint')).toContainText('已保存');
    // Reload and verify the customized shortcut still works
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#mt-floating-trigger-btn')).toBeVisible({ timeout: 10000 });
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-mt-jsym-ready'), null, { timeout: 10000 });
    const input = await focusTestInput();
    await page.keyboard.press('Alt+Shift+7');
    await expect(input).toHaveValue('★');
  });

  test('Duplicate combo rejected while recording', async () => {
    await enterEditMode();
    await page.locator('.mt-jsym-edit-row[data-slot="1"] [data-act="record"]').click();
    await page.keyboard.press('Alt+Shift+1'); // already taken by slot 1
    await expect(page.locator('#mt-jsym-hint')).toContainText('已分配');
    // Combo unchanged (must not be Shift+1)
    await expect(page.locator('.mt-jsym-edit-row[data-slot="1"] .mt-jsym-edit-combo')).not.toContainText('Shift+1');
    // Esc cancels recording
    await page.keyboard.press('Escape');
    await expect(page.locator('.mt-jsym-edit-row[data-slot="1"] .mt-jsym-edit-combo')).not.toContainText('请按键');
  });
});
