import {openStaticSettings} from './settings-entry.js';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';

const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');

const settingsThemes = ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer'] as const;
const providerIds = ['ppq', 'routstr', 'openrouter', 'venice', 'custom', 'ollama', 'cli'] as const;
// Full original f0d4eb8fec54748d978ed8dc0cc09c6ef377f280 Firefox desktop,
// bundled fonts settled: Inter, JetBrains Mono and Outfit produce distinct
// padding scroll counters although every label and icon fits its inner border.
// These per-provider caps apply only at the qualified 1280px desktop viewport.
const nativeFirefoxDesktopCounterCaps = {
  dark: [1, 1, 2, 1, 1, 2, 1],
  light: [1, 1, 2, 1, 1, 2, 1],
  cyberterm: [3, 4, 5, 3, 3, 6, 5],
  glass: [1, 1, 2, 1, 1, 2, 1],
  'synth-sunrise': [0, 0, 0, 0, 0, 0, 0],
  neuromancer: [3, 4, 5, 3, 3, 6, 5],
} as const;

async function openSettings(page: Page, origin: string) {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-theme', 'dark');
    localStorage.setItem('labcharts-ai-provider', 'custom');
    localStorage.setItem('labcharts-ai-paused', 'false');
    for (const name of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${name}`, 'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({ accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-10-15T00:00:00Z' }));
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
  });
  await page.goto(origin + '/app');
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout: 30_000 });
  await openStaticSettings(page);
  await page.locator('#settings-nav-ai').click();
  await expect(page.locator('[data-custom-settings-view]')).toBeVisible();
  await expect(page.locator('#ai-provider-panel')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(async () => {
    document.body.getBoundingClientRect();
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished.catch(() => {})));
  });
}

async function measureProviderContent(button: Locator) {
  return button.evaluate(element => {
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    const borders = {
      left: parseFloat(style.borderLeftWidth), right: parseFloat(style.borderRightWidth),
      top: parseFloat(style.borderTopWidth), bottom: parseFloat(style.borderBottomWidth),
    };
    const inside = (content: DOMRect) => content.width > 0 && content.height > 0 &&
      content.left >= rect.left + borders.left && content.right <= rect.right - borders.right &&
      content.top >= rect.top + borders.top && content.bottom <= rect.bottom - borders.bottom;
    const textRanges: DOMRect[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent || '';
      if (!text.trim()) continue;
      const range = document.createRange();
      range.setStart(node, text.search(/\S/));
      range.setEnd(node, text.trimEnd().length);
      textRanges.push(...range.getClientRects());
    }
    const icons = [...element.querySelectorAll('.ai-provider-logo')];
    return {
      labelFits: textRanges.length > 0 && textRanges.every(inside),
      iconFits: icons.length === 1 && icons.every(icon => inside(icon.getBoundingClientRect())),
      scrollOverflow: element.scrollWidth - element.clientWidth, borders,
      provider: element.getAttribute('data-provider'),
    };
  });
}

async function expectProviderContentFits(
  button: Locator, browserName: string, label: string,
  theme: typeof settingsThemes[number] = 'dark', viewportWidth = 1280,
) {
  const measured = await measureProviderContent(button);
  expect(measured.labelFits, `${label}: complete label inside inner borders`).toBe(true);
  expect(measured.iconFits, `${label}: complete icon inside inner borders`).toBe(true);
  if (browserName === 'firefox') {
    expect(measured.borders.left, label).toBe(1);
    expect(measured.borders.right, label).toBe(1);
    const providerIndex = providerIds.findIndex(provider => provider === measured.provider);
    if (providerIndex < 0) throw new Error(`${label}: unexpected provider ${measured.provider}`);
    // The native 800px row genuinely crowded labels; the migrated container
    // wraps there. Preserve that improvement with zero overflow below desktop,
    // rather than inheriting the native row's larger, visibly clipped counters.
    const cap = viewportWidth === 1280 ? nativeFirefoxDesktopCounterCaps[theme][providerIndex] : 0;
    if (cap === undefined) throw new Error(`${label}: missing native provider counter`);
    expect(measured.scrollOverflow, `${label}/${measured.provider}: native-qualified scroll counter`).toBeLessThanOrEqual(cap);
  } else {
    expect(measured.scrollOverflow, label).toBeLessThanOrEqual(0);
  }
}

// Recorded from the complete original application at f0d4eb8f, with its original
// stylesheets and bundled fonts, Dark theme, 1280x900 and a fine pointer. These
// assertions exercise the assembled application's full cascade, not a synthetic
// 610px component host that could conceal extra nested card padding.
test.describe('original desktop Settings density', () => {
  test.use({ viewport: { width: 1280, height: 900 }, hasTouch: false, serviceWorkers: 'block' });
  test('production AI typography and control geometry match the original desktop', async ({ page, browserName }) => {
    const server = await startKitServer(artifact), errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await openSettings(page, server.origin);
      expect(await page.evaluate(() => matchMedia('(pointer:coarse)').matches)).toBe(false);
      await expect(page.locator('#settings-modal')).toHaveCSS('width', '860px');
      await expect(page.locator('.settings-content')).toHaveCSS('padding', '18px 24px 24px');
      const row = page.locator('.ai-provider-toggle');
      // Full native f0d4eb8fec54748d978ed8dc0cc09c6ef377f280 application:
      // WebKit reserves a 6px scrollbar in the 658px content column, whereas
      // Chromium/Firefox overlay it. With unchanged 24px horizontal padding,
      // native row widths are 658 - 6 - 48 = 604 and 658 - 48 = 610 respectively.
      await expect(row).toHaveCSS('width', browserName === 'webkit' ? '604px' : '610px');
      await expect(row).toHaveCSS('gap', '4px');
      const buttons = row.locator('button');
      await expect(buttons).toHaveText(['PPQ', 'Routstr', 'OpenRouter', 'Venice', 'Custom', 'Local models', 'CLI agents']);
      expect(await buttons.evaluateAll(elements => new Set(elements.map(element => element.getBoundingClientRect().top)).size)).toBe(1);
      for (const button of await buttons.all()) {
        await expect(button).toHaveCSS('height', '29px');
        await expect(button).toHaveCSS('font-size', '12px');
        await expect(button).toHaveCSS('line-height', 'normal');
        await expect(button).toHaveCSS('padding', '6px 8px');
        await expect(button).toHaveCSS('gap', '4px');
      }
      await expect(page.locator('[data-ai-settings-view] .settings-copy-title').first()).toHaveCSS('font-size', '13px');
      await expect(page.locator('[data-ai-settings-view] .settings-group-title')).toHaveCSS('font-size', '11px');
      await expect(page.locator('#custom-key-status')).toHaveCSS('font-size', '13px');
      await expect(page.locator('#custom-key-status')).toHaveCSS('line-height', '19.5px');
      for (const id of ['custom-url-input', 'custom-key-input']) {
        await expect(page.locator('#' + id)).toHaveCSS('height', '40px');
        await expect(page.locator('#' + id)).toHaveCSS('padding', '10px 12px');
      }
      const save = page.locator('[data-provider-panel-action="save-custom-api"]');
      await expect(save).toHaveCSS('height', '35px');
      await expect(save).toHaveCSS('padding', '8px 18px');
      await expect(save).toHaveCSS('font-size', '14px');
      for (const provider of ['openrouter', 'venice']) {
        await page.locator(`.ai-provider-btn[data-provider="${provider}"]`).click();
        await expect(page.locator(`[data-${provider}-settings-view]`)).toBeVisible();
        await expect(page.locator(`#${provider}-key-status`)).toHaveCSS('font-size', '13px');
        await expect(page.locator(`#${provider}-key-input`)).toHaveCSS('height', '40px');
      }
      await page.locator('.ai-provider-btn[data-provider="custom"]').click();
      await expect(page.locator('[data-custom-settings-view]')).toBeVisible();
      expect(errors).toEqual([]);
      await page.screenshot({ path: test.info().outputPath('settings-dark-desktop.png') });
    } finally { await server.close(); }
  });

  for (const [themeIndex, theme] of settingsThemes.entries()) {
    test(`provider labels remain uncropped in the real Settings container: ${theme} across widths`, async ({ page, browserName }) => {
      const server = await startKitServer(artifact);
      try {
        await openSettings(page, server.origin);
        const selectTheme = async (theme: typeof settingsThemes[number]) => {
          await page.setViewportSize({ width: 1280, height: 900 });
          await page.locator('#settings-nav-display').click();
          await page.locator('#settings-tab-display [data-settings-action="open-tweaks"]').click();
          await page.locator(`[data-tweaks-action="select-theme"][data-theme-id="${theme}"]`).click();
          await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme || 'dark')).toBe(theme);
          await page.locator('[data-tweaks-action="close"]').click();
          const closeChat = page.getByRole('button', { name: 'Close chat', exact: true });
          if (await closeChat.isVisible()) await closeChat.click();
          if (!await page.locator('#settings-modal').isVisible()) await openStaticSettings(page);
          await page.locator('#settings-nav-ai').click();
          await expect(page.locator('[data-custom-settings-view]')).toBeVisible();
        };
        // Retain the original adjacent theme transition, including whether its
        // extra-theme stylesheet was first used or already loaded by its predecessor.
        const predecessor = settingsThemes[Math.max(0, themeIndex - 1)]!;
        if (themeIndex > 0) await selectTheme(predecessor);
        await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme || 'dark')).toBe(predecessor);
        if (themeIndex > 0) await page.setViewportSize({ width: 320, height: 900 });
        await selectTheme(theme);
        for (const width of [1280, 800, 700, 390, 320]) {
          await page.setViewportSize({ width, height: 900 });
          const panel = page.locator('[data-ai-settings-view]');
          const label = `${theme}/${width}`;
          expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth), label).toBe(true);
          const buttons = panel.locator('.ai-provider-btn');
          await expect(buttons).toHaveCount(7);
          for (const button of await buttons.all()) await expectProviderContentFits(button, browserName, label, theme, width);
          if (width <= 700) expect(await buttons.evaluateAll(elements => new Set(elements.map(element => Math.round(element.getBoundingClientRect().top))).size), label).toBe(4);
        }
      } finally { await server.close(); }
    });
  }

  test('provider content bounds reject clipped labels and displaced icons', async ({ page, browserName }) => {
    const server = await startKitServer(artifact);
    try {
      await openSettings(page, server.origin);
      const button = page.locator('.ai-provider-btn[data-provider="ppq"]');
      await expectProviderContentFits(button, browserName, 'original');
      const originalText = await button.evaluate(element => {
        const label = [...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
        if (!label) throw new Error('Provider label text missing');
        const original = label.textContent || '';
        label.textContent = 'Provider label deliberately too wide '.repeat(40);
        return original;
      });
      expect((await measureProviderContent(button)).labelFits, 'long label must fail the bounds check').toBe(false);
      await button.evaluate((element, text) => {
        const label = [...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
        if (!label) throw new Error('Provider label text missing');
        label.textContent = text;
      }, originalText);
      await expectProviderContentFits(button, browserName, 'restored label');
      const icon = button.locator('.ai-provider-logo');
      const originalStyle = await icon.getAttribute('style');
      await icon.evaluate(element => element.setAttribute('style', 'transform: translateX(-1000px)'));
      expect((await measureProviderContent(button)).iconFits, 'displaced icon must fail the bounds check').toBe(false);
      await icon.evaluate((element, style) => {
        if (style === null) element.removeAttribute('style');
        else element.setAttribute('style', style);
      }, originalStyle);
      await expectProviderContentFits(button, browserName, 'restored icon');
    } finally { await server.close(); }
  });

});

test.describe('Settings coarse pointer targets', () => {
  test.use({ viewport: { width: 1280, height: 900 }, hasTouch: true, serviceWorkers: 'block' });
  test('production compact controls retain 44px targets for touch input', async ({ page }) => {
    const server = await startKitServer(artifact);
    try {
      await openSettings(page, server.origin);
      expect(await page.evaluate(() => matchMedia('(pointer:coarse)').matches)).toBe(true);
      for (const control of await page.locator('.ai-provider-btn, #ai-pause-toggle, #custom-url-input, #custom-key-input, [data-provider-panel-action="save-custom-api"]').all()) {
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await page.locator('#settings-nav-display').click();
      await page.evaluate(async () => {
        await Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished.catch(() => {})));
      });
      for (const control of await page.locator('#settings-tab-display button:visible, #debug-mode-toggle').all()) {
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    } finally { await server.close(); }
  });
});
