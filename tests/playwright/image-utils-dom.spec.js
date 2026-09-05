import { expect, test } from './coverage-fixture.js';

test('chat image attachment DOM is present and its CSS loads on demand', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  await expect(page.locator('#chat-attach-btn')).toHaveCount(1);
  await expect(page.locator('#chat-attach-preview')).toHaveCount(1);
  await expect(page.locator('#chat-image-input')).toHaveCount(1);
  await expect(page.locator('.chat-input-row')).toHaveCount(1);
  await expect(page.locator('#chat-image-input')).toHaveAttribute('accept', /image\//);
  await expect(page.locator('#chat-hd-btn')).toHaveCount(0);
  await expect(page.locator('#chat-composer-hint')).toHaveCount(0);
  await expect(page.locator('[data-chat-action="import-health-file"]')).toHaveCount(1);
  await expect(page.locator('[data-chat-action="open-chat-context"]')).toHaveCount(1);
  await expect(page.locator('#chat-model-menu-toggle')).toHaveCount(1);
  expect(await page.evaluate(() => {
    const model = document.getElementById('chat-model-menu');
    const voice = document.getElementById('chat-voice-btn');
    return !!(model && voice && (model.compareDocumentPosition(voice) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);

  const loadedRules = await page.evaluate(async () => {
    await (await import('/js/chat-panel.js')).loadChatPresentationStylesheets();
    const selectors = [
      '.chat-context-menu-toggle',
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
    '.chat-context-menu-toggle': true,
    '.chat-attach-preview': true,
    '.chat-attach-thumb': true,
    '.chat-attach-remove': true,
    '.chat-image-badge': true,
    '.chat-drop-active': true,
  });
});

test('image utility content builders format provider-compatible vision messages', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const imageUtils = await import(`/js/image-utils.js?imageUtilsCoverage=${Date.now()}`);
    const outcomes = {};
    const block = imageUtils.formatImageBlock('abc123', 'image/png', 'ollama');
    const contentWithText = imageUtils.buildVisionContent([block], 'Read the marker table.', 'openrouter');
    const contentWithoutText = imageUtils.buildVisionContent([block], '', 'venice');

    outcomes.formatImageBlockUsesDataUrlImageBlock =
      block.type === 'image_url'
      && block.image_url.url === 'data:image/png;base64,abc123';
    outcomes.buildVisionContentAppendsTextOnlyWhenProvided =
      contentWithText.length === 2
      && contentWithText[0] === block
      && contentWithText[1].type === 'text'
      && contentWithText[1].text === 'Read the marker table.'
      && contentWithoutText.length === 1
      && contentWithoutText[0] === block;

    return outcomes;
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('image resizing rejects cleanly when a 2D canvas context is unavailable', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const message = await page.evaluate(async () => {
    const imageUtils = await import(`/js/image-utils.js?imageUtilsContextGuard=${Date.now()}`);
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = () => null;
    try {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';
      await imageUtils.resizeImage(new File([svg], 'pixel.svg', { type: 'image/svg+xml' }));
      return 'resolved unexpectedly';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  expect(message).toBe('Canvas 2D context is unavailable');
});
