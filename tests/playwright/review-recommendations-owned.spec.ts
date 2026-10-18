import fs from 'node:fs';
import postcss from 'postcss';
import type {Page} from '@playwright/test';
import {expect, test} from './coverage-fixture.js';
import {prepareDemoProfile} from './biology-score-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import type {ImportReviewMarker} from '../../js/pdf-import-review-runtime.js';
import type {ImportReviewPresentationInput, ImportUnitOptions, ImportReviewStatus, ImportUnitMenuOption} from '../../js/import-review-presentation.js';
import type {RecRenderCandidate} from '../../types/dashboard-recommendation-widget.js';
type Prepared = Omit<ImportReviewPresentationInput, 'rows'> & {rows: {marker: ImportReviewMarker; index: number; status: ImportReviewStatus; prepared: {labRange: string; unitOptions: ImportUnitOptions}}[]};
interface Sample {kind: string; name: string; html: string; input: Record<string, unknown>; prepared?: Prepared}
interface PairHost extends HTMLElement {pairs: HTMLElement[]}
const frozen = JSON.parse(fs.readFileSync('tests/fixtures/review-recommendations-original.json', 'utf8')) as {
 samples: Sample[]; styleBlocks: {css: string; atRules: {name: string; params: string}[]}[];
};
const originalCSS = frozen.styleBlocks.map(block => {
 const tree = postcss.parse(block.css);
 tree.walkRules(rule => {rule.selector = rule.selectors.map(selector => `:where([data-original]) ${selector}`).join(',');});
 return block.atRules.reduceRight((css, at) => `@${at.name} ${at.params}{${css}}`, tree.toString());
}).join('\n');
const widths = [320, 480, 767, 768, 769, 1100, 1440];
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

async function mountPairs(page: Page, samples: Sample[]) {
 await installDiscussionFixture(page.context(), {provider: 'openrouter', paused: true});
 await prepareDemoProfile(page); await page.emulateMedia({reducedMotion: 'reduce'});
 await page.evaluate(async ({samples, css}) => {
  await Promise.all(['/css/import.css', '/css/recommendations.css', '/css/dashboard-core.css', '/css/dashboard-data.css', '/css/dashboard-widgets.css'].map(href => new Promise<void>((resolve, reject) => {
   const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; link.onload = () => resolve(); link.onerror = () => reject(new Error(href)); document.head.append(link);
  })));
  const [shell, unit, mapping, action, menu, model, styleOwner, actions, recommendations, recModel] = await Promise.all([
   import('/js/components/ImportReviewPresentation.svelte.html.js'), import('/js/components/ImportUnitControl.svelte.html.js'),
   import('/js/components/ImportMapControl.svelte.html.js'), import('/js/components/ImportReviewRowAction.svelte.html.js'),
   import('/js/components/ImportUnitMenu.svelte.html.js'), import('/js/import-review-presentation.js'), import('/js/import-review-classes.js'),
   import('/js/import-review-row-actions.js'), import('/js/components/RecommendationPresentation.svelte.html.js'), import('/js/recommendation-presentation.js'),
  ]);
  const style = document.createElement('style'); style.textContent = css + '\n#review-recs-parity *,#review-recs-parity *::before,#review-recs-parity *::after{transition:none!important;animation:none!important}'; document.head.append(style);
  const host: PairHost = Object.assign(document.createElement('div'), {pairs: [] as HTMLElement[]});
  host.id = 'review-recs-parity'; host.style.cssText = 'position:fixed;inset:0;background:var(--bg-primary);z-index:20000'; document.body.append(host);
  for (const sample of samples) {
   let current: string; const input = sample.input;
   if (sample.kind === 'review') {
    const prepared = sample.prepared!;
    const modal = document.createElement('div'); modal.id = 'import-modal'; modal.dataset.importReviewView = '';
    modal.className = styleOwner.importReviewClasses('modal import-preview-modal');
    modal.innerHTML = shell.renderHTML({view: model.projectImportReviewPresentation({...prepared, rows: prepared.rows.map(row => model.projectImportReviewRow(row.marker, row.index, row.status, row.prepared))})});
    const excluded = new Set(((input.result as {_excludedImportIndices?: number[]})._excludedImportIndices || []));
    for (const row of modal.querySelectorAll<HTMLElement>('tbody tr')) {
     if (!excluded.has(Number(row.dataset.importIdx))) continue;
     const button = row.querySelector<HTMLElement>('.import-exclude-btn'); if (!button) continue;
     row.classList.add('import-excluded'); actions.setImportExcludeButtonState(button, true);
    }
    const rows = modal.querySelectorAll('tbody tr');
    if (rows.length) modal.querySelector('#import-visible-count')!.textContent = `${rows.length}/${rows.length} shown`;
    current = modal.outerHTML;
   } else if (sample.kind === 'unit') current = unit.renderHTML({view: model.projectImportUnitControl(input.marker as ImportReviewMarker, input.idx as number, input.unitOptions as ImportUnitOptions)});
   else if (sample.kind === 'map-control') current = mapping.renderHTML({view: model.projectImportMapControl(input.marker as ImportReviewMarker, input.idx as number)});
   else if (sample.kind === 'exclude') current = action.renderHTML({view: model.projectImportExcludeControl(input.markerName as string, input.excluded as boolean)});
   else if (sample.kind === 'unit-menu') {
    const popup = document.createElement('div');
    for (const [name, value] of Object.entries(input.attributes as Record<string, string>)) popup.setAttribute(name, value);
    popup.className = styleOwner.importReviewClasses('import-unit-menu'); popup.dataset.importReviewView = '';
    popup.innerHTML = menu.renderHTML({options: model.projectImportUnitMenu(input.options as ImportUnitMenuOption[])}); current = popup.outerHTML;
   } else if (sample.kind === 'recommendation-card') current = recommendations.renderHTML({view: {kind: 'card', card: recModel.projectRecommendationCard(input.candidate as RecRenderCandidate, input.compact)}});
   else if (sample.kind === 'recommendation-empty') current = recommendations.renderHTML({view: {kind: 'empty', empty: recModel.projectRecommendationEmpty(input.message)}});
   else if (sample.kind === 'recommendation-list') current = recommendations.renderHTML({view: {kind: 'list', cards: recModel.projectRecommendationList(input.candidates as RecRenderCandidate[], input.compact)}});
   else if (sample.kind === 'recommendation-widget') {
    if (input.enabled === false) current = recommendations.renderHTML({view: {kind: 'disabled'}});
    else if (input.loading) current = recommendations.renderHTML({view: {kind: 'loading'}});
    else {
     const candidates = (input.candidates as RecRenderCandidate[]).slice(0, 3);
     current = candidates.length ? recommendations.renderHTML({view: {kind: 'widget', cards: recModel.projectRecommendationList(candidates, true)}}) : recommendations.renderHTML({view: {kind: 'empty', empty: recModel.projectRecommendationEmpty()}});
    }
   } else throw new Error('Unsupported geometry owner ' + sample.kind);
   const pair = document.createElement('div'); pair.dataset.name = sample.name; pair.dataset.kind = sample.kind; pair.style.cssText = 'position:absolute;inset:0';
   for (const [sideKind, html] of [['original', sample.html], ['current', current]]) {
    const side = document.createElement('section'); side.dataset[sideKind!] = ''; side.style.cssText = 'position:absolute;inset:0';
    const wrapper = document.createElement('div');
    if (sample.kind === 'review') wrapper.className = 'modal-overlay show';
    else {wrapper.style.cssText = 'display:contents'; if (sideKind === 'current' && !sample.kind.startsWith('recommendation')) wrapper.dataset.importReviewView = '';}
    wrapper.innerHTML = html!; side.append(wrapper); pair.append(side);
   }
   host.pairs.push(pair);
  }
  await document.fonts.ready;
 }, {samples, css: originalCSS});
}
async function setTheme(page: Page, theme: string) {
 await page.evaluate(async theme => {
  if (theme === 'default') document.documentElement.removeAttribute('data-theme');
  else {
   const themes = await import('/js/theme.js');
   if (await themes.setTheme(theme) !== true) throw new Error('Requested theme failed to load: ' + theme);
   const attribute = document.documentElement.getAttribute('data-theme');
   if (themes.getTheme() !== theme || attribute !== (theme === 'dark' ? null : theme)) throw new Error('Requested theme did not become current: ' + theme);
  }
  await document.fonts.ready;
 }, theme);
}
async function compareAll(page: Page) {
 return page.locator('#review-recs-parity').evaluate((element, properties) => {
  const host = element as PairHost, problems: string[] = [];
  for (const pair of host.pairs) {
   host.replaceChildren(pair);
   const original = [...pair.querySelector('[data-original]')!.querySelectorAll('*')], current = [...pair.querySelector('[data-current]')!.querySelectorAll('*')];
   if (original.length !== current.length) {problems.push(`${pair.dataset.name}: ${original.length}/${current.length} elements`); continue;}
   const originalRects = original.map(node => node.getBoundingClientRect()), currentRects = current.map(node => node.getBoundingClientRect());
   const snapshot = (node: Element) => {const style = getComputedStyle(node); return Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)]));};
   const before = original.map(snapshot), after = current.map(snapshot);
   original.forEach((node, index) => {
    if (node.tagName !== current[index]!.tagName) problems.push(`${pair.dataset.name}/${index} tag`);
    for (const property of properties) if (before[index]![property] !== after[index]![property]) problems.push(`${pair.dataset.name}/${index}/${node.tagName}/${property}: ${after[index]![property]} != ${before[index]![property]}`);
    const a = originalRects[index]!, b = currentRects[index]!;
    if (a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height) problems.push(`${pair.dataset.name}/${index}/bounds: (${b.x},${b.y}) ${b.width}x${b.height} != (${a.x},${a.y}) ${a.width}x${a.height}`);
   });
  }
  return problems;
 }, properties);
}
for (const owner of ['review', 'controls', 'recommendations'] as const) {
 test(`authored ${owner} preserves frozen layout and all breakpoint/theme properties`, async ({page}, info) => {
  test.setTimeout(300000);
  const samples = frozen.samples.filter(sample => owner === 'review' ? sample.kind === 'review' : owner === 'controls' ? ['unit', 'map-control', 'unit-menu', 'exclude'].includes(sample.kind) : sample.kind.startsWith('recommendation'));
  await mountPairs(page, samples); let comparisons = 0;
  for (const width of widths) {
   await page.setViewportSize({width, height: 1000});
   for (const theme of themes) {await setTheme(page, theme); await page.mouse.move(0, 0); expect(await compareAll(page), `${owner}/${width}/${theme}`).toEqual([]); comparisons += samples.length;}
  }
  fs.writeFileSync(info.outputPath(`review-recs-${owner}-geometry.json`), JSON.stringify({owner, comparisons, samples: samples.length, widths, themes, properties}, null, 2));
 });
}

test('authored review and recommendation controls preserve actual keyboard focus properties', async ({page}, info) => {
 test.setTimeout(180000);
 const samples = frozen.samples.filter(sample => ['review', 'unit', 'map-control', 'unit-menu', 'exclude', 'recommendation-card', 'recommendation-widget'].includes(sample.kind));
 await mountPairs(page, samples); await page.setViewportSize({width: 1440, height: 1000});
 let checks = 0;
 for (const theme of themes) {
  await setTheme(page, theme); await page.mouse.move(0, 0); await page.keyboard.press('Tab');
  checks += await page.locator('#review-recs-parity').evaluate((element, properties) => {
   const host = element as PairHost; let count = 0;
   for (const pair of host.pairs) {
    host.replaceChildren(pair);
    const originalSide = pair.querySelector<HTMLElement>('[data-original]')!, currentSide = pair.querySelector<HTMLElement>('[data-current]')!;
    const before = [...originalSide.querySelectorAll<HTMLElement>('button,input,select,a[href]')], after = [...currentSide.querySelectorAll<HTMLElement>('button,input,select,a[href]')];
    if (before.length !== after.length) throw new Error('Focus topology mismatch ' + pair.dataset.name);
    before.forEach((control, index) => {
     if ((control as HTMLButtonElement).disabled || !control.getClientRects().length) return;
     originalSide.style.visibility = 'visible'; currentSide.style.visibility = 'hidden'; control.focus({preventScroll: true});
     if (document.activeElement !== control || control.matches(':hover')) throw new Error('Original focus not isolated ' + pair.dataset.name);
     const priorStyle = getComputedStyle(control); const prior = Object.fromEntries(properties.map(property => [property, priorStyle.getPropertyValue(property)]));
     originalSide.style.visibility = 'hidden'; currentSide.style.visibility = 'visible';
     const current = after[index]!; current.focus({preventScroll: true});
     if (document.activeElement !== current || current.matches(':hover')) throw new Error('Authored focus not isolated ' + pair.dataset.name);
     const nextStyle = getComputedStyle(current); const next = Object.fromEntries(properties.map(property => [property, nextStyle.getPropertyValue(property)]));
     if (JSON.stringify(prior) !== JSON.stringify(next)) throw new Error(`${pair.dataset.name}/${index}/focus: ${JSON.stringify(next)} != ${JSON.stringify(prior)}`);
     count++;
    });
    originalSide.style.visibility = 'visible'; currentSide.style.visibility = 'visible';
   }
   return count;
  }, [...properties, 'outline-width', 'outline-color', 'outline-style', 'outline-offset']);
 }
 fs.writeFileSync(info.outputPath('review-recs-focus.json'), JSON.stringify({checks, samples: samples.length, themes}, null, 2));
});

test('authored review and recommendation hover properties preserve native capability behavior', async ({page}, info) => {
 test.setTimeout(180000);
 const samples = frozen.samples.filter(sample => (sample.kind === 'review' && sample.name === 'mixed') || sample.kind === 'unit-menu' || (sample.kind === 'exclude' && sample.name === 'restored') || (sample.kind === 'recommendation-card' && ['lab:one-false', 'literal-false'].includes(sample.name)));
 await mountPairs(page, samples); await page.setViewportSize({width: 1440, height: 1000}); let checks = 0;
 for (const theme of themes) {
  await setTheme(page, theme);
  for (const sample of samples) {
   await page.locator('#review-recs-parity').evaluate((element, name) => {
    const host = element as PairHost; host.replaceChildren(host.pairs.find(pair => pair.dataset.name === name)!);
    (host.querySelector('[data-original]') as HTMLElement).style.visibility = 'visible'; (host.querySelector('[data-current]') as HTMLElement).style.visibility = 'hidden';
   }, sample.name);
   const selectors = sample.kind.startsWith('recommendation') ? ['.dashboard-action-btn-primary', '[data-dashboard-rec-action="save"]', '[data-dashboard-rec-action="dismiss"]'] : sample.kind === 'review' ? ['.import-filter-btn.active', '.import-filter-btn:not(.active)', '.import-exclude-btn', '.import-map-picker-btn', '.import-unit-button', '.import-btn-primary', '.modal-close'] : sample.kind === 'unit-menu' ? ['.import-unit-option[aria-selected="true"]:not(:disabled)', '.import-unit-option[aria-selected="false"]:not(:disabled)'] : ['.import-exclude-btn'];
   for (const selector of selectors) {
    const original = page.locator('#review-recs-parity [data-original]').locator(selector).first(); if (!await original.count()) continue;
    await original.hover(); const before = await original.evaluate((node, properties) => {const css = getComputedStyle(node); return Object.fromEntries(properties.map(property => [property, css.getPropertyValue(property)]));}, properties);
    await page.locator('#review-recs-parity').evaluate(host => {(host.querySelector('[data-original]') as HTMLElement).style.visibility = 'hidden'; (host.querySelector('[data-current]') as HTMLElement).style.visibility = 'visible';});
    const current = page.locator('#review-recs-parity [data-current]').locator(selector).first(); await current.hover();
    expect(await current.evaluate((node, properties) => {const css = getComputedStyle(node); return Object.fromEntries(properties.map(property => [property, css.getPropertyValue(property)]));}, properties), `${sample.name}/${selector}/${theme}/hover`).toEqual(before);
    await page.locator('#review-recs-parity').evaluate(host => {(host.querySelector('[data-original]') as HTMLElement).style.visibility = 'visible'; (host.querySelector('[data-current]') as HTMLElement).style.visibility = 'hidden';}); checks++;
   }
  }
 }
 fs.writeFileSync(info.outputPath('review-recs-hover.json'), JSON.stringify({checks, samples: samples.length, themes}, null, 2));
});
