import fs from 'node:fs/promises';
import path from 'node:path';
import {expect, test, type Page} from '@playwright/test';
import {createBlankPage} from '../helpers/browser-blank-page.js';

interface ChartLayerEvent {
  type: string;
  trusted: boolean;
  key: string | null;
  action: string | null;
}
interface ObservedWindow extends Window {
  chartLayerCalls: unknown[][];
  chartLayerEvents: ChartLayerEvent[];
}
const scenarios = [
  {name: 'dark-desktop', width: 1400, theme: 'dark', touch: false},
  {name: 'light-tablet', width: 768, theme: 'light', touch: false},
  {name: 'dark-coarse', width: 480, theme: 'dark', touch: true},
] as const;
const overlayChanges = [
  ['set-note-overlay', 'noteOverlay'],
  ['set-supp-overlay', 'suppOverlay'],
  ['set-phase-overlay', 'phaseOverlay'],
] as const;
const open = createBlankPage({
  path: '/chart-layers-native-fixture',
  body: `<!doctype html><html><head><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/category-views.css"><link rel="stylesheet" href="/css/chat-redesign.css"></head><body><button class="nav-item active" data-category="metabolic" tabindex="-1">Category</button><main id="fixture"></main><button id="outside">Outside</button></body></html>`,
});

async function snapshotNodes(page: Page) {
  return page.locator('#fixture').evaluate(host => [host, ...host.querySelectorAll('*')].map(element => {
    const css = getComputedStyle(element), bounds = element.getBoundingClientRect();
    return {
      tag: element.tagName,
      classes: element.getAttribute('class'),
      text: element instanceof HTMLButtonElement || element.tagName === 'SPAN' ? element.textContent : null,
      attrs: [...element.attributes].map(attr => [attr.name, attr.value]),
      bounds: [bounds.x, bounds.y, bounds.width, bounds.height],
      css: [...css].map(property => [property, css.getPropertyValue(property)]),
      checked: element instanceof HTMLInputElement ? element.checked : null,
      defaultChecked: element instanceof HTMLInputElement ? element.defaultChecked : null,
    };
  }));
}

for (const scenario of scenarios) {
  test(`chart layers ${scenario.name} preserve native change, keyboard, focus and persistence`, async ({browser, baseURL}, info) => {
    const context = await browser.newContext({
      ...(baseURL ? {baseURL} : {}),
      viewport: {width: scenario.width, height: 900},
      hasTouch: scenario.touch,
      isMobile: scenario.touch,
      serviceWorkers: 'block',
    });
    const page = await context.newPage(), errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await open(page);
      await page.evaluate(async theme => {
        document.documentElement.dataset.theme = theme;
        const [{state}, controls] = await Promise.all([import('/js/state.js'), import('/js/data-view-controls.js')]);
        const calls: unknown[][] = [];
        // Synthetic navigation port keeps the actual native dropdown attached;
        // the static Kit test separately checks real category reconstruction.
        controls.configureDataRuntimeDeps({navigate: (...args) => calls.push(args)});
        Object.assign(state, {currentProfile: 'synthetic-chart-layers', profileSex: 'female',
          noteOverlayMode: 'off', suppOverlayMode: 'off', phaseOverlayMode: 'off'});
        state.importedData.notes = [{date: '2026-01-01', text: 'Synthetic note'}];
        state.importedData.supplements = [{name: 'Synthetic supplement', startDate: '2026-01-01'}];
        state.importedData.menstrualCycle = {periods: [{startDate: '2026-01-01'}], cycleStatus: 'regular'};
        document.getElementById('fixture')!.innerHTML = controls.renderChartLayersDropdown();
        const observed = window as unknown as ObservedWindow;
        observed.chartLayerCalls = calls;
        observed.chartLayerEvents = [];
        for (const type of ['click', 'change', 'keydown']) document.addEventListener(type, event => {
          const target = event.target;
          observed.chartLayerEvents.push({type, trusted: event.isTrusted,
            key: event instanceof KeyboardEvent ? event.key : null,
            action: target instanceof Element ? target.getAttribute('data-lab-data-change') : null});
        }, true);
      }, scenario.theme);
      const trigger = page.locator('.chart-layers-trigger'), menu = page.locator('#chart-layers-dropdown');
      const snapshots: Array<{name: string; controls: Awaited<ReturnType<typeof snapshotNodes>>}> = [];
      const capture = async (name: string) => {snapshots.push({name, controls: await snapshotNodes(page)});};

      await expect(menu).toBeHidden();
      await capture('closed');
      if (scenario.touch) await trigger.tap(); else await trigger.click();
      await expect(menu).toBeVisible();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await capture('opened');
      for (const [action, key] of overlayChanges) {
        const checkbox = page.locator(`[data-lab-data-change="${action}"]`);
        if (scenario.touch) await checkbox.tap(); else await checkbox.click();
        await expect(checkbox).toBeChecked();
        await expect(menu).toBeVisible();
        expect(await page.evaluate(key => localStorage.getItem(`labcharts-synthetic-chart-layers-${key}`), key)).toBe('on');
      }
      expect(await page.evaluate(() => (window as unknown as ObservedWindow).chartLayerCalls.map(call => call[0])))
        .toEqual(['metabolic', 'metabolic', 'metabolic']);
      await capture('all-enabled');
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(menu).toBeVisible();
      await page.keyboard.press('Tab');
      await expect(page.locator('[data-lab-data-change="set-note-overlay"]')).toBeFocused();
      await page.keyboard.press('Space');
      await expect(page.locator('[data-lab-data-change="set-note-overlay"]')).not.toBeChecked();
      expect(await page.evaluate(() => localStorage.getItem('labcharts-synthetic-chart-layers-noteOverlay'))).toBe('off');
      await capture('keyboard-note-off');
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      // Retain the executed fixture's mouse outside-click path even in the touch context.
      await trigger.click();
      await expect(menu).toBeVisible();
      await page.locator('#outside').click();
      await expect(menu).toBeHidden();
      await capture('outside-closed');

      const events = await page.evaluate(() => (window as unknown as ObservedWindow).chartLayerEvents);
      expect(events.filter(event => event.type === 'change').map(event => [event.action, event.trusted]))
        .toEqual([['set-note-overlay', true], ['set-supp-overlay', true], ['set-phase-overlay', true], ['set-note-overlay', true]]);
      expect(await page.evaluate(() => (window as unknown as ObservedWindow).chartLayerCalls.map(call => call[0])))
        .toEqual(['metabolic', 'metabolic', 'metabolic', 'metabolic']);
      expect(errors).toEqual([]);
      expect(snapshots.map(snapshot => snapshot.name)).toEqual(['closed', 'opened', 'all-enabled', 'keyboard-note-off', 'outside-closed']);
      const receipt = JSON.stringify({scenario, snapshots, events, errors}, null, 2) + '\n';
      await info.attach('chart-layers-native', {body: receipt, contentType: 'application/json'});
      // Optional local parity output; ordinary maintained tests need no temporary directory.
      const output = process.env.CHART_LAYERS_RECEIPTS;
      if (output) {await fs.mkdir(output, {recursive: true}); await fs.writeFile(path.join(output, scenario.name + '.json'), receipt);}
    } finally {await context.close();}
  });
}
