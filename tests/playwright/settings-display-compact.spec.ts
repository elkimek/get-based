import fs from 'node:fs';
import crypto from 'node:crypto';
import { expect, test } from './coverage-fixture.js';
import { routeHtml } from '../helpers/browser-static-routes.js';
import type { Page } from '@playwright/test';

const fixtureBytes = fs.readFileSync('tests/fixtures/display-prepilot-native.json');
const native = JSON.parse(fixtureBytes.toString('utf8')) as {
  revision: string; html: string; styles: { path: string; source: string }[];
};
const selectors = [
  '.settings-section', '.settings-label', '.settings-copy-title', '.settings-copy-desc',
  '.unit-toggle', '.range-toggle', '.unit-toggle-btn', '.range-toggle-btn', '.time-toggle-btn',
  '.settings-mini-btn', '.settings-group-title', '.settings-links-row', '.settings-link-btn',
  '.toggle-switch', '.toggle-switch > span', '#settings-commit-hash',
];
async function mountFixture(page: Page, original: boolean): Promise<void> {
  const name = original ? 'reference' : 'current';
  const styles = original ? native.styles.map(style => `<style>${style.source}</style>`).join('')
    : native.styles.map(style => `<link rel="stylesheet" href="/${style.path}">`).join('');
  const panel = '<div class="settings-tab-panel active" id="settings-tab-display" role="tabpanel" aria-label="Display"></div>';
  await routeHtml(page, `**/display-compact-${name}`, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/vendor/fonts/fonts.css">${styles}<style>#settings-modal{width:min(94vw,660px);padding:0}.settings-content{padding:18px 24px 24px}@media(max-width:720px){#settings-modal{width:min(94vw,860px)}.settings-content{padding:18px 16px 16px}}</style></head><body><div class="modal-overlay show"><main class="modal settings-modal" id="settings-modal"><div class="settings-content">${panel}</div></main></div></body></html>`);
  await page.goto(`/display-compact-${name}`);
  // Inter's optional face must be ready before either fixture first paints text.
  // The application already has visible body text before opening Settings.
  await page.evaluate(async () => { await Promise.all([...document.fonts].map(face => face.load())); });
  if (original) await page.locator('#settings-tab-display').evaluate((panel, html) => { panel.outerHTML = html; }, native.html);
  else await page.evaluate(async () => {
    const { default: Display, mount, flushSync } = await import('/js/components/DisplaySettings.svelte.native.js');
    mount(Display, { target: document.getElementById('settings-tab-display')!, props: { initial: {
      unitSystem: 'EU', showAltUnits: false, rangeMode: 'optimal', timeFormat: '24h',
      productRecs: true, debugMode: false, version: '1.3.9',
    } } });
    flushSync();
  });
  await page.evaluate(async () => { void document.body.offsetWidth; await Promise.all([...document.querySelectorAll<HTMLElement>('#settings-tab-display *')].map(element => document.fonts.load(getComputedStyle(element).font, element.textContent || 'A'))); await document.fonts.ready; await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished)); });
}
async function metrics(page: Page) {
  return page.locator('#settings-tab-display').evaluate((panel, selectors) => {
    const properties = ['font-family','font-size','font-weight','line-height','letter-spacing','text-transform',
      'padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-bottom',
      'border-top-width','border-right-width','border-radius','background-color','color','opacity',
      'row-gap','column-gap','display','align-items','justify-content','grid-template-columns'];
    const origin = panel.getBoundingClientRect();
    return selectors.map(selector => ({ selector, elements: [...panel.querySelectorAll<HTMLElement>(selector)].map(element => {
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return { text: element.innerText.trim(), styles: Object.fromEntries(properties.map(name => [name, style.getPropertyValue(name)])),
        rect: { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height } };
    }) }));
  }, selectors);
}

test('Display matches complete pre-pilot compact metrics across six themes and desktop/mobile fine pointers', async ({ browser }) => {
  expect(crypto.createHash('sha256').update(fixtureBytes).digest('hex')).toBe('c988381710d932dcba7c3470ade761ac1712423b84717dcd629ea94d51be9cdb');
  expect(native.revision).toBe('f0d4eb8f');
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: false });
  const reference = await context.newPage(), current = await context.newPage();
  try {
    await mountFixture(reference, true); await mountFixture(current, false);
    for (const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']) {
      for (const page of [reference, current]) await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      for (const width of [1280, 700, 390]) {
        for (const page of [reference, current]) await page.setViewportSize({ width, height: 900 });
        for (const page of [reference, current]) await page.evaluate(async () => { void document.body.offsetWidth; await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished)); });
        const actual = await metrics(current), expected = await metrics(reference);
        await test.info().attach(`metrics-${theme}-${width}`, { body: JSON.stringify({actual,expected}), contentType: 'application/json' });
        expect(actual, `${theme}/${width}`).toEqual(expected);
        expect(await current.locator('#settings-tab-display').evaluate(panel => panel.scrollWidth <= panel.clientWidth)).toBe(true);
      }
    }
    const pristine = await metrics(current);
    await current.locator('[data-unit="US"]').evaluate(button => { button.textContent = 'Corrupted US'; });
    expect(await metrics(current)).not.toEqual(pristine);
    await current.locator('[data-unit="US"]').evaluate(button => { button.textContent = 'US'; });
    expect(await metrics(current)).toEqual(pristine);
    await current.locator('[data-settings-action="open-tweaks"]').focus();
    await expect(current.locator('[data-settings-action="open-tweaks"]')).toHaveCSS('outline-width', '2px');
  } finally { await context.close(); }
});

test('Display coarse pointers retain 44px targets and compact visible toggle tracks', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  try {
    await mountFixture(page, false);
    expect(await page.evaluate(() => matchMedia('(pointer:coarse)').matches)).toBe(true);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(async () => { void document.body.offsetWidth; await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished)); });
      const panelBounds = (await page.locator('#settings-tab-display').boundingBox())!;
      for (const control of await page.locator('#settings-tab-display button,#settings-tab-display a,#settings-tab-display .toggle-switch').all()) {
        const bounds = await control.boundingBox();
        expect(bounds!.height).toBeGreaterThanOrEqual(44); expect(bounds!.width).toBeGreaterThanOrEqual(44);
        expect(bounds!.x).toBeGreaterThanOrEqual(panelBounds.x);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(panelBounds.x + panelBounds.width);
      }
      for (const track of await page.locator('#settings-tab-display .toggle-switch > span').all()) {
        await expect(track).toHaveCSS('width','36px'); await expect(track).toHaveCSS('height','20px');
      }
      await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
      expect(await page.locator('#settings-tab-display').evaluate(panel => ({width:panel.clientWidth,scroll:panel.scrollWidth}))).toEqual(expect.objectContaining({width:expect.any(Number),scroll:expect.any(Number)}));
      expect(await page.locator('#settings-tab-display').evaluate(panel => panel.scrollWidth <= panel.clientWidth), `coarse/${width}`).toBe(true);
    }
    const toggle = page.locator('#debug-mode-toggle');
    await toggle.focus(); await expect(toggle).toBeFocused();
    await expect(page.locator('#debug-mode-toggle + span')).toHaveCSS('outline-width','2px');
    await toggle.press('Space'); await expect(toggle).toBeChecked();
  } finally { await context.close(); }
});

test('shared toggle preserves boolean touch and compact modes alongside the new coarse-only mode', async ({ browser }) => {
  for (const hasTouch of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch });
    const page = await context.newPage();
    try {
      await mountFixture(page, false);
      await page.evaluate(async () => {
        const { default: Toggle, mount, flushSync } = await import('/js/components/SettingsToggle.svelte.native.js');
        const host = document.createElement('div'); document.getElementById('settings-tab-display')!.append(host);
        for (const [id, touch, compact] of [['plain',false,false],['touch',true,false],['compact',false,true],['coarse','coarse',false]] as const) {
          mount(Toggle, { target: host, props: { id: `mode-${id}`, label: id, checked: false, touch, compact } });
        }
        flushSync();
      });
      for (const [id, width, height, trackWidth, trackHeight] of [
        ['plain',36,20,36,20],['touch',44,44,36,20],['compact',32,28,32,18],
        ['coarse',hasTouch ? 44 : 36,hasTouch ? 44 : 20,36,20],
      ] as const) {
        const control = page.locator(`#mode-${id}`).locator('..');
        await expect(control).toHaveCSS('width',`${width}px`); await expect(control).toHaveCSS('height',`${height}px`);
        await expect(control.locator('span')).toHaveCSS('width',`${trackWidth}px`);
        await expect(control.locator('span')).toHaveCSS('height',`${trackHeight}px`);
      }
    } finally { await context.close(); }
  }
});
