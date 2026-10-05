import { expect, test } from './coverage-fixture.js';

async function openDisplay(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    await (await import('/js/chat-panel.js')).closeChatPanel();
    await (await import('/js/settings-loader.js')).openSettingsModal('display');
  });
}

test('Display preferences remain delegated, accessible, and persistent', async ({ page }) => {
  await openDisplay(page);
  await page.evaluate(async () => {
    const profiles = await import('/js/profile.js');
    const id = await profiles.createProfile('Display pilot', { skipInitialSync: true });
    localStorage.setItem(`labcharts-${id}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${id}-tour`, 'completed');
    await profiles.switchProfile(id);
    await (await import('/js/settings-loader.js')).openSettingsModal('display');
  });
  const panel = page.locator('#settings-tab-display');
  const us = panel.locator('[data-unit="US"]');
  await expect(us).toHaveCSS('min-height', '44px');
  await expect(panel.getByRole('group', { name: 'Unit System', exact: true })).toBeVisible();
  await us.click();
  await expect(us).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('[data-unit="EU"]')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => page.evaluate(async () => (await import('/js/state.js')).state.unitSystem)).toBe('US');
  await panel.locator('[data-alt-units="on"]').click();
  await expect(panel.locator('[data-alt-units="on"]')).toHaveAttribute('aria-pressed', 'true');
  await panel.locator('[data-range="reference"]').click();
  await expect(panel.locator('[data-range="reference"]')).toHaveAttribute('aria-pressed', 'true');
  await panel.locator('[data-timefmt="12h"]').click();
  await expect(panel.locator('[data-timefmt="12h"]')).toHaveAttribute('aria-pressed', 'true');
  await panel.getByText('Debug Mode', { exact: true }).click();
  await expect(panel.locator('#debug-mode-toggle')).toBeChecked();
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(async () => { await (await import('/js/settings-loader.js')).openSettingsModal('display'); });
  await expect(page.locator('#settings-tab-display [data-unit="US"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#settings-tab-display [data-alt-units="on"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#settings-tab-display [data-range="reference"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#settings-tab-display [data-timefmt="12h"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#debug-mode-toggle')).toBeChecked();
});

test('pilot styles stay lazy, scoped, keyboard-visible, and container responsive', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  expect(await page.locator('link[data-settings-stylesheet]').count()).toBe(0);
  await page.evaluate(() => {
    const sentinel = document.createElement('button');
    sentinel.id = 'display-pilot-sentinel';
    sentinel.className = 'unit-toggle-btn gb:display:min-h-11 gb:display:bg-surface';
    sentinel.textContent = 'Outside pilot';
    document.body.append(sentinel);
  });
  const sentinel = page.locator('#display-pilot-sentinel');
  const before = await sentinel.evaluate(button => ({ height: getComputedStyle(button).minHeight, background: getComputedStyle(button).backgroundColor }));
  await page.evaluate(async () => { await (await import('/js/settings-loader.js')).openSettingsModal('display'); });
  expect(await sentinel.evaluate(button => ({ height: getComputedStyle(button).minHeight, background: getComputedStyle(button).backgroundColor }))).toEqual(before);
  const control = page.locator('#settings-tab-display [data-unit="US"]');
  await control.focus();
  await expect(control).toBeFocused();
  await expect(control).toHaveCSS('outline-width', '2px');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(control).toHaveCSS('transition-property', 'none');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator('#settings-tab-display').evaluate(panel => panel.scrollWidth <= panel.clientWidth)).toBe(true);
  const row = page.locator('#settings-tab-display [role="group"]').first().locator('..');
  await expect.poll(() => row.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(1);
});

test('all theme palettes and sunset mode reach the pilot controls', async ({ page }) => {
  await openDisplay(page);
  const button = page.locator('#settings-tab-display [data-unit="EU"]');
  for (const name of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
    await page.evaluate(async name => { await (await import('/js/theme.js')).setTheme(name); }, name);
    await expect.poll(() => button.evaluate(element => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'var(--accent)';
      probe.style.color = 'var(--on-accent)';
      element.append(probe);
      const expected = getComputedStyle(probe);
      const actual = getComputedStyle(element);
      const matches = expected.backgroundColor === actual.backgroundColor && expected.color === actual.color;
      probe.remove();
      return matches;
    })).toBe(true);
  }
  await page.evaluate(async () => { (await import('/js/theme.js')).setSunsetMode(true); });
  await expect.poll(() => button.evaluate(element => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--accent)';
    element.append(probe);
    const matches = getComputedStyle(probe).backgroundColor === getComputedStyle(element).backgroundColor;
    probe.remove();
    return matches;
  })).toBe(true);
});


test('Svelte lifecycle preserves focus and profile state through repeated mounts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openDisplay(page);
  const ids = await page.evaluate(async () => {
    const profiles = await import('/js/profile.js');
    const first = await profiles.createProfile('Pilot SI', { skipInitialSync: true });
    const second = await profiles.createProfile('Pilot US', { skipInitialSync: true });
    for (const id of [first, second]) {
      localStorage.setItem(`labcharts-${id}-emptyTour`, 'completed');
      localStorage.setItem(`labcharts-${id}-tour`, 'completed');
    }
    return { first, second };
  });
  const panel = page.locator('#settings-tab-display');
  for (const [id, unit] of [[ids.first, 'EU'], [ids.second, 'US']] as const) {
    await page.evaluate(async id => { await (await import('/js/profile.js')).switchProfile(id); }, id);
    await page.evaluate(async () => { await (await import('/js/settings-loader.js')).openSettingsModal('display'); });
    await panel.locator(`[data-unit="${unit}"]`).click();
    await expect(panel.locator(`[data-unit="${unit}"]`)).toHaveAttribute('aria-pressed', 'true');
  }
  for (let iteration = 0; iteration < 3; iteration++) {
    await page.evaluate(async () => { await (await import('/js/settings-loader.js')).openSettingsModal('display'); });
    await expect(panel.locator('[data-unit="US"]')).toHaveCount(1);
    const button = panel.locator('[data-range="both"]');
    await button.focus();
    await button.press('Enter');
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    // A click reaching the existing shell exactly once matters more than merely
    // finding one copy of the generated DOM after each mount.
    const changes = await page.evaluate(async () => {
      let count = 0;
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'labcharts-debug') count++;
        original.call(this, key, value);
      };
      try {
        document.getElementById('debug-mode-toggle')!.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        return count;
      } finally { Storage.prototype.setItem = original; }
    });
    expect(changes).toBe(1);
    await page.locator('#settings-modal [data-settings-action="close"]').click();
  }
  await page.evaluate(async id => { await (await import('/js/profile.js')).switchProfile(id); }, ids.first);
  await page.evaluate(async () => { await (await import('/js/settings-loader.js')).openSettingsModal('display'); });
  await expect(panel.locator('[data-unit="EU"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('[data-unit="US"]')).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});
