import fs from 'node:fs';
import postcss from 'postcss';
import type {Page} from '@playwright/test';
import {expect, test} from './coverage-fixture.js';
import {prepareDemoProfile} from './biology-score-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import type {DashboardPickerInput} from '../../js/dashboard-picker-presentation.js';
import type {projectImportMarkerMap, projectImportMarkerMapCategories, projectImportMarkerMapResults} from '../../js/import-marker-map-presentation.js';
type Sample = {name: string; html: string} & (
  {kind: 'dashboard-picker'; input: DashboardPickerInput}
  | {kind: 'import-map'; input: {marker: Parameters<typeof projectImportMarkerMap>[0]; currentKey: string; query?: string}; activeCategory: string; categories: Parameters<typeof projectImportMarkerMapCategories>[0]; results: Parameters<typeof projectImportMarkerMapResults>[0]}
);
interface PairHost extends HTMLElement {pairs: HTMLElement[]}
const frozen = JSON.parse(fs.readFileSync('tests/fixtures/widget-map-original.json', 'utf8')) as {
  samples: Sample[];
  styleBlocks: Array<{css: string; atRules: Array<{name: string; params: string}>}>;
};
const originalCSS = frozen.styleBlocks.map(block => {
  const tree = postcss.parse(block.css);
  tree.walkRules(rule => {rule.selector = rule.selectors.map(selector => `:where([data-original]) ${selector}`).join(',');});
  return block.atRules.reduceRight((css, at) => `@${at.name} ${at.params}{${css}}`, tree.toString());
}).join('\n');
const widths = [320, 480, 640, 767, 768, 769, 1440];
const themes = ['default', 'dark', 'light', 'glass', 'synth-sunrise', 'neuromancer', 'cyberterm'];
const properties = [
  'display', 'position', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform',
  'color', 'background-color', 'background-image', 'border-top-width', 'border-right-width',
  'border-bottom-width', 'border-left-width', 'border-top-color', 'border-top-style', 'border-radius',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-right',
  'margin-bottom', 'margin-left', 'gap', 'grid-template-columns', 'align-items', 'justify-content',
  'flex-direction', 'flex-basis', 'flex-grow', 'flex-shrink', 'flex-wrap', 'overflow-x', 'overflow-y',
  'white-space', 'overflow-wrap', 'text-overflow', 'box-shadow', 'backdrop-filter', 'overscroll-behavior',
  'scrollbar-gutter', 'text-align', 'text-decoration', 'cursor',
];

async function mountPairs(page: Page) {
  await installDiscussionFixture(page.context(), {provider: 'openrouter', paused: true});
  await prepareDemoProfile(page);
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.evaluate(async ({samples, css}) => {
    await Promise.all(['css/dashboard-widgets.css', 'css/import.css'].map(href => new Promise<void>((resolve, reject) => {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href;
      link.onload = () => resolve(); link.onerror = () => reject(new Error('Cannot load parity stylesheet ' + href));
      document.head.append(link);
    })));
    const [dashboard, dashboardProject, shell, categories, results, mapProject, mapClasses] = await Promise.all([
      import('/js/components/DashboardPickerPresentation.svelte.html.js'),
      import('/js/dashboard-picker-presentation.js'),
      import('/js/components/ImportMarkerMapPresentation.svelte.html.js'),
      import('/js/components/ImportMarkerMapCategories.svelte.html.js'),
      import('/js/components/ImportMarkerMapResults.svelte.html.js'),
      import('/js/import-marker-map-presentation.js'),
      import('/js/import-marker-map-classes.js'),
    ]);
    const style = document.createElement('style');
    style.textContent = css + '\n#widget-map-parity *,#widget-map-parity *::before,#widget-map-parity *::after{transition:none!important;animation:none!important}';
    document.head.append(style);
    const host: PairHost = Object.assign(document.createElement('div'), {pairs: [] as HTMLElement[]});
    host.id = 'widget-map-parity'; host.style.cssText = 'position:fixed;inset:0;background:var(--bg-primary);z-index:20000'; document.body.append(host);
    for (const sample of samples) {
      let current: string;
      if (sample.kind === 'dashboard-picker') current = dashboard.renderHTML({view: dashboardProject.projectDashboardPickerPresentation(sample.input)});
      else {
        const overlay = document.createElement('div');
        overlay.className = mapClasses.importMarkerMapClasses('modal-overlay import-map-modal-overlay');
        overlay.dataset.importMarkerMapView = '';
        overlay.innerHTML = shell.renderHTML({view: mapProject.projectImportMarkerMap(sample.input.marker)});
        overlay.querySelector('.import-map-categories')!.innerHTML = categories.renderHTML({categories: mapProject.projectImportMarkerMapCategories(sample.categories, sample.activeCategory)});
        overlay.querySelector('.import-map-results')!.innerHTML = results.renderHTML({results: mapProject.projectImportMarkerMapResults(sample.results, sample.input.currentKey)});
        current = overlay.outerHTML;
      }
      const pair = document.createElement('div'); pair.dataset.name = sample.name; pair.dataset.kind = sample.kind; pair.style.cssText = 'position:absolute;inset:0';
      for (const [kind, html] of [['original', sample.html], ['current', current]]) {
        const side = document.createElement('section'); side.dataset[kind!] = ''; side.style.cssText = 'position:absolute;inset:0'; side.innerHTML = html!;
        side.querySelector('.modal-overlay')!.classList.add('show');
        if (sample.kind === 'import-map') (side.querySelector('input') as HTMLInputElement).value = sample.input.query || '';
        pair.append(side);
      }
      host.pairs.push(pair);
    }
    await document.fonts.ready;
  }, {samples: frozen.samples, css: originalCSS});
}
async function setTheme(page: Page, theme: string) {
  await page.evaluate(async theme => {
    if (theme === 'default') document.documentElement.removeAttribute('data-theme');
    else (await import('/js/theme.js')).setTheme(theme);
    await document.fonts.ready;
  }, theme);
}
async function compareAll(page: Page, hiddenCards: boolean) {
  return page.locator('#widget-map-parity').evaluate((element, {properties, hiddenCards}) => {
    const host = element as PairHost; const problems: string[] = [];
    for (const pair of host.pairs) {
      host.replaceChildren(pair);
      for (const side of pair.children) {
        [...side.querySelectorAll<HTMLElement>('.dashboard-widget-picker-card')].forEach((card, index) => {card.hidden = hiddenCards && index % 2 === 0;});
      }
      const original = [...pair.querySelector('[data-original]')!.querySelectorAll('*')], current = [...pair.querySelector('[data-current]')!.querySelectorAll('*')];
      if (original.length !== current.length) {problems.push(`${pair.dataset.name}: element count ${current.length} != ${original.length}`); continue;}
      const originalRects = original.map(node => node.getBoundingClientRect()), currentRects = current.map(node => node.getBoundingClientRect());
      const snapshot = (node: Element) => {const style = getComputedStyle(node); return Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)]));};
      const beforeStyles = original.map(snapshot), afterStyles = current.map(snapshot);
      original.forEach((node, index) => {
        const next = current[index]!;
        if (node.tagName !== next.tagName) problems.push(`${pair.dataset.name}/${index}: tag ${next.tagName} != ${node.tagName}`);
        const before = beforeStyles[index]!, after = afterStyles[index]!;
        for (const property of properties) if (before[property] !== after[property]) problems.push(`${pair.dataset.name}/${index}/${node.tagName}/${property}: ${after[property]} != ${before[property]}`);
        const a = originalRects[index]!, b = currentRects[index]!;
        if (a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height) problems.push(`${pair.dataset.name}/${index}/bounds: (${b.x},${b.y}) ${b.width}x${b.height} != (${a.x},${a.y}) ${a.width}x${a.height}`);
      });
    }
    return problems;
  }, {properties, hiddenCards});
}
async function interactionChecks(page: Page, interaction: 'hover' | 'focus') {
  let checks = 0;
  if (interaction === 'focus') await page.keyboard.press('Tab');
  for (const sample of frozen.samples) {
    await page.locator('#widget-map-parity').evaluate((element, name) => {
      const host = element as PairHost; host.replaceChildren(host.pairs.find(pair => pair.dataset.name === name)!);
      for (const card of host.querySelectorAll<HTMLElement>('.dashboard-widget-picker-card')) card.hidden = false;
      (host.querySelector('[data-current]') as HTMLElement).style.visibility = 'hidden';
      (host.querySelector('[data-original]') as HTMLElement).style.visibility = 'visible';
    }, sample.name);
    const selectors = sample.kind === 'dashboard-picker'
      ? ['.dashboard-widget-picker-search', '.dashboard-widget-picker-card', '.dashboard-action-btn', '.modal-close']
      : ['.import-map-modal-search', '.import-map-category.active', '.import-map-category:not(.active)', '.import-map-result.selected', '.import-map-result:not(.selected)', '.import-btn', '.modal-close'];
    for (const selector of selectors) {
      const original = page.locator('#widget-map-parity [data-original]').locator(selector).first();
      if (await original.count() === 0) continue;
      if (interaction === 'hover') await original.hover();
      else { await page.mouse.move(0, 0); await original.focus(); }
      const before = await original.evaluate((node, properties) => {
        if (document.activeElement !== node && properties.includes('outline-width')) throw new Error('Original control did not receive focus');
        if (properties.includes('outline-width') && node.matches(':hover')) throw new Error('Original focus comparison includes pointer hover');
        const style = getComputedStyle(node); return Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)]));
      }, interaction === 'focus' ? [...properties, 'outline-width', 'outline-color', 'outline-style', 'outline-offset'] : properties);
      await page.locator('#widget-map-parity').evaluate(host => {
        (host.querySelector('[data-original]') as HTMLElement).style.visibility = 'hidden';
        (host.querySelector('[data-current]') as HTMLElement).style.visibility = 'visible';
      });
      const current = page.locator('#widget-map-parity [data-current]').locator(selector).first();
      if (interaction === 'hover') await current.hover();
      else { await page.mouse.move(0, 0); await current.focus(); }
      expect(await current.evaluate((node, properties) => {
        if (document.activeElement !== node && properties.includes('outline-width')) throw new Error('Authored control did not receive focus');
        if (properties.includes('outline-width') && node.matches(':hover')) throw new Error('Authored focus comparison includes pointer hover');
        const style = getComputedStyle(node); return Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)]));
      }, interaction === 'focus' ? [...properties, 'outline-width', 'outline-color', 'outline-style', 'outline-offset'] : properties), `${sample.name}/${selector}/${interaction}`).toEqual(before);
      await page.locator('#widget-map-parity').evaluate(host => {
        (host.querySelector('[data-original]') as HTMLElement).style.visibility = 'visible';
        (host.querySelector('[data-current]') as HTMLElement).style.visibility = 'hidden';
      });
      checks++;
    }
    await page.locator('#widget-map-parity').evaluate(host => {(host.querySelector('[data-current]') as HTMLElement).style.visibility = 'visible';});
  }
  return checks;
}
test('authored dashboard and import mapping pickers preserve frozen layout, theme, hidden-card, hover and keyboard focus states', async ({page}, info) => {
  // The complete frozen matrix is slower under mobile WebKit emulation.
  test.setTimeout(600000);
  await mountPairs(page);
  let comparisons = 0, hovers = 0, focusedControls = 0;
  for (const width of widths) {
    await page.setViewportSize({width, height: 1000});
    for (const theme of themes) {
      await setTheme(page, theme); await page.mouse.move(0, 0);
      for (const hidden of [false, true]) {
        expect(await compareAll(page, hidden), `${width}/${theme}/hidden:${hidden}`).toEqual([]);
        comparisons += frozen.samples.length;
      }
    }
  }
  await page.setViewportSize({width: 1440, height: 1000});
  for (const theme of themes) {
    await setTheme(page, theme);
    hovers += await interactionChecks(page, 'hover');
    focusedControls += await interactionChecks(page, 'focus');
  }
  fs.writeFileSync(info.outputPath('widget-map-parity.json'), JSON.stringify({comparisons, hovers, focusedControls, samples: frozen.samples.length, widths, themes, properties}, null, 2));
});
