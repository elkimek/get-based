import { expect, test } from './coverage-fixture.js';
import type { Page } from '@playwright/test';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';

test.beforeEach(async ({ page, context }) => {
  await installDiscussionFixture(context);
  await page.addInitScript(() => {
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
    localStorage.setItem('labcharts-ai-paused', 'true');
  });
});
async function openSetup(page: Page) {
  await page.goto('/app');
  await page.evaluate(async () => {
    await (await import('/js/light-sun-loader.js')).loadLightSunUI();
    const [{ state }, profile, data, setup] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/data.js'), import('/js/sun-defaults.js')]);
    state.importedData = profile.createDefaultProfileData();
    // Use the canonical empty Light collections; route entry otherwise initializes them lazily.
    state.importedData.lightEnvironment = { rooms: [], screens: [] };
    state.importedData.lightDailyVerdicts = {};
    state.importedData.lightCircadian = { skinType: null, note: 'Keep existing habits', evening: ['Dim warm light'] };
    if (!await data.saveImportedData()) throw new Error('Could not seed Light setup');
    setup.configureSunDefaults({ maybeAnalyzeOnboardingAfterSave: () => {} });
    setup.reopenSunSetup();
  });
  await expect(page.getByRole('dialog', { name: 'Personalize Light', exact: true })).toBeVisible();
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const [{ state }, crypto, profile] = await Promise.all([import('/js/state.js'), import('/js/crypto.js'), import('/js/profile.js')]);
    return JSON.parse((await crypto.encryptedGetItem(profile.profileStorageKey(state.currentProfile, 'imported')))!);
  });
}

test('authored setup preserves validation, keyboard choices, location drafts, live tiers and actual profile saves', async ({ page }) => {
  await openSetup(page); const modal = page.getByRole('dialog', { name: 'Personalize Light', exact: true });
  const before = await stored(page);
  await modal.locator('[data-setup-tab=core]').focus();
  await page.waitForTimeout(150);
  await expect(modal.locator('[data-setup-tab=core]')).toBeFocused();
  await modal.getByRole('button', { name: 'Next: Light patterns', exact: true }).click();
  await modal.getByRole('button', { name: 'Save setup', exact: true }).click();
  await expect(modal.locator('[data-setup-tab="core"]')).toHaveAttribute('aria-selected', 'true');
  await expect(modal.locator('#setup-skin-range')).toHaveAttribute('data-set', '0');
  expect(await stored(page)).toEqual(before);
  const radios = modal.getByRole('radio'); await radios.nth(2).focus(); await page.keyboard.press('End');
  await expect(radios.nth(5)).toBeFocused(); await expect(radios.nth(5)).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Enter'); await expect(radios.nth(5)).toHaveAttribute('aria-checked', 'true');
  await expect(radios.nth(5)).toHaveAttribute('tabindex', '0'); await expect(radios.nth(2)).toHaveAttribute('tabindex', '-1');
  await modal.getByRole('slider', { name: 'Skin type', exact: true }).focus(); await page.keyboard.press('ArrowLeft');
  await expect(radios.nth(4)).toHaveAttribute('aria-checked', 'true'); await expect(modal.locator('#setup-skin-label')).toContainText('very rarely burns');
  await modal.locator('[data-choice-group="setup-homelight"][data-value="led-warm"]').click();
  await modal.locator('[data-choice-group="setup-eyewear"][data-value="sunglasses"]').click();
  await modal.locator('[data-choice-group="setup-photosensitive"][data-value="moderate"]').click();
  await expect(modal.locator('.light-setup-progress')).toHaveText('3/3 done');
  await page.evaluate(async () => {
    let current = false;
    const runtime = await import('/js/sun-defaults-runtime.js');
    runtime.configureSunDefaultsRuntimeDeps({
      getProfileLocation: () => ({ country: 'Czechia', zip: '' }),
      getSunCoords: () => current ? { lat: 50.1, lon: 14.4, source: 'current-device' } : { lat: 50, lon: 14, source: 'country-band' },
      requestPreciseLocation: async () => { current = true; return { lat: 50.1, lon: 14.4, source: 'current-device' }; },
      clearCurrentLocation: () => { current = false; return true; },
    });
  });
  await modal.getByRole('button', { name: 'Use current location today', exact: true }).click();
  await expect(modal.locator('.light-setup-location-status')).toContainText('today only');
  await expect(modal.locator('.light-setup-location-status')).toContainText('not saved to your profile');
  await modal.getByRole('button', { name: 'Use home instead', exact: true }).click();
  await expect(modal.locator('.light-setup-location-status')).toContainText('Profile estimate');
  await expect(modal.locator('#setup-homelight')).toHaveValue('led-warm'); expect(await stored(page)).toEqual(before);
  await modal.getByRole('tab', { name: '1 Your baseline', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await expect(modal.locator('[data-setup-tab="score"]')).toBeFocused(); await expect(modal.locator('[data-setup-tab="score"]')).toHaveAttribute('tabindex', '0');
  const utilities = await modal.locator('#ott-running-label').getAttribute('class');
  for (const checkbox of await modal.locator('[data-ott]').all()) { await checkbox.locator('..').click(); await expect(checkbox).toBeChecked(); }
  await expect(modal.locator('#ott-running-aligned')).toHaveText('10/10'); await expect(modal.locator('#ott-running-label')).toHaveAttribute('data-tier', '4');
  expect((await modal.locator('#ott-running-label').getAttribute('class'))?.split(/\s+/).filter(token => token.startsWith('gb:'))).toEqual(utilities?.split(/\s+/).filter(token => token.startsWith('gb:')));
  await expect(modal.locator('#ott-running-label')).toHaveCSS('font-size', '11px');
  await modal.getByRole('button', { name: 'Save setup', exact: true }).click(); await expect(modal).toHaveCount(0);
  const saved = await stored(page);
  expect(saved.sunDefaults).toMatchObject({ fitzpatrick: 'V', homeLight: 'led-warm', eyewear: 'sunglasses', photosensitiveMeds: 'moderate', ottScore: 10, completedAt: expect.any(Number) });
  expect(Object.values(saved.sunDefaults.ott)).toEqual(Array(10).fill(true));
  expect(saved.lightCircadian).toEqual({ ...before.lightCircadian, skinType: 'V — brown' });
  expect(saved).toEqual({ ...before, sunDefaults: saved.sunDefaults, lightCircadian: saved.lightCircadian });
  await page.evaluate(async () => (await import('/js/sun-defaults.js')).reopenSunSetup());
  await expect(modal.getByRole('button', { name: 'Save changes', exact: true })).toBeHidden();
  await modal.locator('[data-choice-group="setup-homelight"][data-value="led-cool"]').click();
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(modal).toHaveCount(0); expect(await stored(page)).toEqual(saved);
});

test('authored setup has readable accessible forms, responsive panes and visible keyboard focus in all themes', async ({ page }, info) => {
  test.setTimeout(120000); await openSetup(page);
  const modal = page.getByRole('dialog', { name: 'Personalize Light', exact: true });
  await modal.getByRole('radio').nth(2).click();
  await expect(modal.getByRole('radio').nth(2)).toHaveCSS('opacity', '1');
  await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  await expect(modal.getByRole('radio').nth(2)).toBeFocused();
  await expect(modal.getByRole('radio').nth(2)).toHaveCSS('outline-width', '2px');
  for (const width of [320, 599, 600, 601, 607, 1100]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['dark', 'light', 'glass', 'synth-sunrise', 'neuromancer', 'cyberterm']) {
      await page.evaluate(async value => (await import('/js/theme.js')).setTheme(value), theme);
      for (const step of ['core', 'score']) {
        await modal.locator(`[data-setup-tab="${step}"]`).click();
        if (step === 'score' && !await modal.locator('[data-ott]').first().isChecked()) await modal.locator('[data-ott]').first().locator('..').click();
        expect(await modal.evaluate(element => element.scrollWidth - element.clientWidth), `${width}/${theme}/${step} overflow`).toBeLessThanOrEqual(1);
        const violations = await modal.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
        expect(violations, `${width}/${theme}/${step}`).toEqual([]);
        if (width === 320 || width === 1100) {
          await modal.locator('.light-setup-focus-body').evaluate(element => { element.scrollTop = element.scrollHeight; });
          expect(await modal.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))), `${width}/${theme}/${step} bottom`).toEqual([]);
        }
      }
    }
    await modal.screenshot({ path: info.outputPath(`light-setup-patterns-${width}.png`) });
  }
});

test('authored prompt and saved summary retain readable themes and reduced-motion behavior', async ({ page }, info) => {
  test.setTimeout(120000); await page.goto('/app');
  await page.evaluate(async () => {
    await (await import('/js/light-sun-loader.js')).loadLightSunUI();
    const host = document.createElement('div'); host.id = 'setup-cards-acceptance';
    host.style.cssText = 'position:fixed;top:10px;left:10px;right:10px;z-index:20000;max-width:800px'; document.body.append(host);
  });
  const host = page.locator('#setup-cards-acceptance');
  for (const width of [320, 1100]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['dark', 'light', 'glass', 'synth-sunrise', 'neuromancer', 'cyberterm']) {
      await page.evaluate(async value => (await import('/js/theme.js')).setTheme(value), theme);
      for (const mode of ['prompt', 'deferred', 'saved-0', 'saved-6', 'saved-10']) {
        await host.evaluate(async (element, mode) => {
          const [{ renderHTML }, { projectLightSetup }] = await Promise.all([import('/js/components/LightSetupPresentation.svelte.html.js'), import('/js/light-setup-presentation.js')]);
          const complete = mode.startsWith('saved');
          const view = projectLightSetup({ defaults: complete ? { fitzpatrick: 'III', homeLight: 'led-warm', eyewear: 'sunglasses', photosensitiveMeds: 'moderate', ottScore: Number(mode.split('-')[1]) } : mode === 'deferred' ? { setupPromptDismissedAt: 1 } : {}, savedFitzpatrick: null, legacySkin: null, complete, coords: null, profileLocation: null });
          element.innerHTML = renderHTML({ surface: 'card', view });
        }, mode);
        if (mode.startsWith('saved')) {
          const colors = await host.evaluate((element, mode) => {
            const tokens = ['--accent', '--orange', '--purple', mode === 'saved-0' ? '--green' : mode === 'saved-6' ? '--orange' : '--red'];
            const probe = document.createElement('span'); element.append(probe);
            const expected = tokens.map(token => { probe.style.color = `var(${token})`; return getComputedStyle(probe).color; }); probe.remove();
            return { expected, actual: [...element.querySelectorAll('.light-setup-chip')].map(chip => getComputedStyle(chip, '::before').backgroundColor) };
          }, mode);
          expect(colors.actual, `${width}/${theme}/${mode} chip accents`).toEqual(colors.expected);
        }
        expect(await host.evaluate(element => element.scrollWidth - element.clientWidth), `${width}/${theme}/${mode}`).toBeLessThanOrEqual(1);
        expect(await host.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))), `${width}/${theme}/${mode}`).toEqual([]);
      }
    }
    await host.screenshot({ path: info.outputPath(`light-setup-summary-${width}.png`) });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await host.locator('.light-setup-chip').first().hover();
  await expect(host.locator('.light-setup-chip').first()).toHaveCSS('transform', 'none');
  await expect(host.locator('.light-setup-chip').first()).toHaveCSS('transition-duration', '0s');
  await page.evaluate(async () => {
    (await import('/js/sun-defaults.js')).reopenSunSetup();
    document.querySelector('[data-setup-tab="score"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.querySelector('#ott-running-label')?.classList.add('tier-changed');
  });
  await expect(page.locator('#ott-running-label')).toHaveCSS('animation-name', 'none');
});
