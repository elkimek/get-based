import { expect, test } from './coverage-fixture.js';
async function openPrivacy(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-default-emptyTour', 'completed'); localStorage.setItem('labcharts-default-tour', 'completed');
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => { await (await import('/js/chat-panel.js')).closeChatPanel(); await (await import('/js/settings-loader.js')).openSettingsModal('privacy'); });
}
test('Privacy theme tokens, responsive fields and keyboard controls remain usable', async ({ page }) => {
  await openPrivacy(page); const panel = page.locator('#settings-tab-privacy');
  const reviewSlider = panel.locator('#pii-review-toggle').locator('..').locator('span');
  await expect(page.locator('#pii-review-toggle')).toBeChecked();
  await expect.poll(() => reviewSlider.evaluate(element => { const probe = document.createElement('span'); probe.style.backgroundColor = 'var(--accent)'; element.append(probe); const matches = getComputedStyle(element).backgroundColor === getComputedStyle(probe).backgroundColor && parseFloat(getComputedStyle(element, '::before').translate) === 16; probe.remove(); return matches; })).toBe(true);
  const configure = panel.locator('[data-settings-action="toggle-privacy-configure"]');
  await configure.focus(); await configure.press('Space'); await expect(configure).toHaveAttribute('aria-expanded', 'true');
  await expect(configure).toHaveCSS('outline-width', '2px');
  for (const viewport of [{ width: 1280, height: 900 }, { width: 700, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
      const appliedTheme = await page.evaluate(async name => {
        const themes = await import('/js/theme.js');
        const ready = await themes.setTheme(name);
        return { ready, selected: themes.getTheme(), stored: localStorage.getItem('labcharts-theme'), attribute: document.documentElement.getAttribute('data-theme') };
      }, theme);
      expect(appliedTheme, `${theme}/${viewport.width}`).toEqual({ ready: true, selected: theme, stored: theme, attribute: theme === 'dark' ? null : theme });
      expect(await panel.evaluate(element => {
        const input = element.querySelector<HTMLInputElement>('#pii-local-url-input')!;
        const card = element.querySelector<HTMLElement>('#privacy-status-card')!;
        const probe = document.createElement('span'); probe.style.backgroundColor = 'var(--bg-card)'; probe.style.color = 'var(--text-primary)'; element.append(probe);
        const expected = getComputedStyle(probe); const actual = getComputedStyle(input);
        const matches = expected.backgroundColor === actual.backgroundColor && expected.color === actual.color && expected.backgroundColor === getComputedStyle(card).backgroundColor;
        probe.remove(); return matches;
      })).toBe(true);
      expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      const field = panel.locator('#pii-local-url-input'); await expect(field).toBeVisible();
      const fieldBox = (await field.boundingBox())!; const panelBox = (await panel.boundingBox())!;
      expect(fieldBox.x + fieldBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 1);
    }
  }
  await page.evaluate(async () => { (await import('/js/theme.js')).setSunsetMode(true); });
  const review = panel.locator('#pii-review-toggle'); await review.focus();
  await expect(review.locator('..').locator('span')).toHaveCSS('outline-width', '2px');
});
test('Privacy remounts preserve global preferences across profile switches and keep a single view', async ({ page }) => {
  await openPrivacy(page);
  const ids = await page.evaluate(async () => {
    const profiles = await import('/js/profile.js');
    const first = await profiles.createProfile('Privacy first', { skipInitialSync: true });
    const second = await profiles.createProfile('Privacy second', { skipInitialSync: true });
    for (const id of [first, second]) { localStorage.setItem(`labcharts-${id}-emptyTour`, 'completed'); localStorage.setItem(`labcharts-${id}-tour`, 'completed'); }
    localStorage.setItem('labcharts-pii-review', 'false'); localStorage.setItem('labcharts-analytics-disabled', 'true'); localStorage.setItem('labcharts-ollama-pii-enabled', 'false');
    return [first, second, first];
  });
  for (const id of ids) {
    await page.evaluate(async id => {
      await (await import('/js/profile.js')).switchProfile(id);
      await (await import('/js/settings-loader.js')).openSettingsModal('privacy');
    }, id);
    await expect(page.locator('#pii-review-toggle')).not.toBeChecked(); await expect(page.locator('#analytics-toggle')).not.toBeChecked();
    await expect(page.locator('#pii-local-toggle')).not.toBeChecked();
    await expect(page.locator('#privacy-status-title')).toHaveText('Basic protection');
    await expect(page.locator('#privacy-settings-content')).toHaveCount(1);
    await expect(page.locator('#pii-local-url-input')).toHaveCount(1);
  }
});

test('an old provider discovery cannot persist credentials or update a remounted Privacy panel', async ({ page }) => {
  await openPrivacy(page);
  const result = await page.evaluate(async () => {
    const controls = await import('/js/provider-local-ai-controls.js');
    const settings = await import('/js/settings.js');
    const storage = await import('/js/api-provider-storage.js');
    const originalFetch = window.fetch;
    const before = { url: storage.getOllamaPIIUrl(), key: storage.getOllamaPIIApiKey(), model: storage.getOllamaPIIModel() };
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    window.fetch = async (input, options = {}) => {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!href.startsWith('http://localhost:12345/')) return originalFetch(input, options);
      await gate;
      if (options.method === 'HEAD') return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ data: [{ id: 'old-model' }], models: [{ name: 'old-model' }] }), { headers: { 'Content-Type': 'application/json' } });
    };
    try {
      (document.getElementById('pii-local-url-input') as HTMLInputElement).value = 'http://localhost:12345';
      (document.getElementById('pii-local-apikey-input') as HTMLInputElement).value = 'old-key';
      const pending = controls.testPIIOllamaConnection();
      settings.openSettingsModal('privacy'); release(); await pending;
      return {
        before, after: { url: storage.getOllamaPIIUrl(), key: storage.getOllamaPIIApiKey(), model: storage.getOllamaPIIModel() },
        status: document.getElementById('pii-local-status-text')!.textContent,
        options: (document.getElementById('pii-model-select') as HTMLSelectElement).options.length,
      };
    } finally { window.fetch = originalFetch; }
  });
  expect(result.after).toEqual(result.before); expect(result.status).toBe('Click Test to check'); expect(result.options).toBe(0);
});
