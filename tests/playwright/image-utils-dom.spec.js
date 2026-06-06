import { expect, test } from './coverage-fixture.js';

test('chat image attachment DOM and CSS are loaded', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await expect(page.locator('#chat-attach-btn')).toHaveCount(1);
  await expect(page.locator('#chat-attach-preview')).toHaveCount(1);
  await expect(page.locator('#chat-image-input')).toHaveCount(1);
  await expect(page.locator('.chat-input-row')).toHaveCount(1);
  await expect(page.locator('#chat-image-input')).toHaveAttribute('accept', /image\//);

  const loadedRules = await page.evaluate(() => {
    const selectors = [
      '.chat-attach-btn',
      '.chat-attach-preview',
      '.chat-attach-thumb',
      '.chat-attach-remove',
      '.chat-image-badge',
      '.chat-drop-active',
    ];
    const cssText = [...document.styleSheets].map((sheet) => {
      try {
        return [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
      } catch {
        return '';
      }
    }).join('\n');
    return Object.fromEntries(selectors.map((selector) => [selector, cssText.includes(selector)]));
  });

  expect(loadedRules).toEqual({
    '.chat-attach-btn': true,
    '.chat-attach-preview': true,
    '.chat-attach-thumb': true,
    '.chat-attach-remove': true,
    '.chat-image-badge': true,
    '.chat-drop-active': true,
  });
});
