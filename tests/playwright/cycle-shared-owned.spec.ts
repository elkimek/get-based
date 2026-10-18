import fs from 'node:fs';
import {createHash} from 'node:crypto';
import postcss from 'postcss';
import type {Page} from '@playwright/test';
import {expect, test} from './coverage-fixture.js';
import {prepareDemoProfile} from './biology-score-fixture.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';

test.use({timezoneId: 'UTC'});

type Owner = 'editor' | 'import' | 'overview';
type Side = 'original' | 'current';
type PointerState = 'hover' | 'active';
interface Sample {
  kind: string; name: string; html: string;
  input: {mc?: unknown; profileDob?: string | null; data?: unknown; opts?: unknown};
}
interface StyleBlock {file: string; order: number; css: string; atRules: {name: string; params: string}[]}
interface Frozen {
  revision: string; fixedNow: string; samples: Sample[]; styleFiles: string[];
  stylePlacements?: {file: string; anchor: string | null}[]; styleBlocks: StyleBlock[];
}
interface Case {owner: Owner; sample: Sample; placement: string; icons: number}
interface PressCapture {events: number; snapshot: Record<string, string> | null; error: string | null; trusted: boolean}
interface PairHost extends HTMLElement {pairs: HTMLElement[]; sides: {original: HTMLElement; current: HTMLElement}[]; actionClicks: string[]; motionDiagnostics: {postReadTransitions: number}; pressedCapture: PressCapture}
interface Target {pair: number; index: number; name: string; action: string}
interface Point {x: number; y: number}

const files = {
  editor: 'tests/fixtures/cycle-editor-original.json',
  import: 'tests/fixtures/cycle-import-original.json',
  overview: 'tests/fixtures/cycle-overview-original.json',
};
const fixtures = Object.fromEntries(Object.entries(files).map(([owner, file]) => [owner, JSON.parse(fs.readFileSync(file, 'utf8'))])) as Record<Owner, Frozen>;
const fixtureHashes = Object.fromEntries(Object.entries(files).map(([owner, file]) => [owner, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
// Authenticate the captured baseline shell; current modal attributes are independently checked below.
const appShellSHA256 = createHash('sha256').update(fs.readFileSync(new URL('../fixtures/cycle-shared-original-index.html', import.meta.url))).digest('hex');
if (appShellSHA256 !== '8388ccf371eb403d2d03abcbabd15723a1e54e2137a3bf8573eaa5636198b6d7') throw new Error('Shared Cycle baseline app-shell source changed');
const shellAttributes = {'aria-label': 'Marker Detail', 'aria-modal': 'true', role: 'dialog'};
const wrapperComposition = 'Original editor fixture has only id/class on its scaffold. Its unchanged contents and native class are composed with the exact three pre-existing app-shell attributes captured before opening the editor; current attributes remain untouched.';
if (fixtures.editor.revision !== '9ccf0adbf8d38ecc7fa1a024b2e91b0838f99d16' || fixtures.import.revision !== '54696fe849fe60f064a5a52700cb716b2a18ed8d' || fixtures.overview.revision !== '4d88598e7b518cd5d7b20738e58568c4fe3c16ce') throw new Error('Wrong immutable Cycle original revisions');
if (new Set(Object.values(fixtures).map(fixture => fixture.fixedNow)).size !== 1) throw new Error('Cycle fixture clock mismatch');
function sample(owner: Owner, kind: string, name: string): Sample {
  const matches = fixtures[owner].samples.filter(candidate => candidate.kind === kind && candidate.name === name);
  if (matches.length !== 1) throw new Error(`Missing unique original ${owner}/${kind}/${name}`);
  return matches[0]!;
}
const cases: Case[] = [
  {owner: 'editor', sample: sample('editor', 'editor', 'mixed-import-coverage'), placement: 'modal', icons: 6},
  {owner: 'import', sample: sample('import', 'summary', 'mixed-sources'), placement: 'coverage', icons: 2},
  {owner: 'import', sample: sample('import', 'picker', 'loaded-and-cold'), placement: 'picker', icons: 1},
  {owner: 'overview', sample: sample('overview', 'overview', 'many-periods-full-caps-order'), placement: 'body-full', icons: 2},
  {owner: 'overview', sample: sample('overview', 'overview', 'many-periods-full-caps-order-dashboard'), placement: 'dashboard-half', icons: 0},
];
const widths = [320, 768, 769, 1440];
const themes = ['default', 'dark', 'light', 'glass', 'synth-sunrise', 'neuromancer', 'cyberterm'];
const sharedSelector = '.cycle-icon-btn,.cycle-delete-btn,.period-symptom-tag,.cycle-period-note,.cycle-editor-section,.cycle-editor-section-title';
const properties = [
  'display', 'position', 'top', 'bottom', 'z-index', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'font-stretch', 'font-kerning', 'font-feature-settings', 'font-variation-settings', 'font-size-adjust', 'line-height', 'letter-spacing', 'text-transform',
  'color', 'background-color', 'background-image', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style', 'border-radius',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'gap', 'grid-template-columns', 'align-items', 'justify-content', 'flex-direction', 'flex-basis', 'flex-grow', 'flex-shrink', 'flex-wrap', 'order',
  'overflow-x', 'overflow-y', 'white-space', 'overflow-wrap', 'text-overflow', 'box-shadow', 'backdrop-filter', 'overscroll-behavior',
  'scrollbar-gutter', 'text-align', 'text-decoration', 'cursor', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill', 'transform',
  'outline-width', 'outline-style', 'outline-color', 'outline-offset', 'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay',
];
// Originals are scoped to their own fixture revision, preserving specificity,
// declaration order, original at-rules and original stylesheet placement.
const originals = (Object.keys(fixtures) as Owner[]).flatMap(owner => fixtures[owner].styleFiles.map(file => ({owner, file, css: fixtures[owner].styleBlocks.filter(block => block.file === file).sort((a, b) => a.order - b.order).map(block => {
  const tree = postcss.parse(block.css);
  tree.walkRules(rule => {rule.selector = rule.selectors.map(selector => {
    const ancestor = selector.match(/^((?:html|body)[^\s>+~]*)\s+(.+)$/);
    const scope = `:where([data-cycle-original="${owner}"])`;
    return ancestor ? `${ancestor[1]} ${scope} ${ancestor[2]}` : `${scope} ${selector}`;
  }).join(',');});
  return block.atRules.reduceRight((css, at) => `@${at.name} ${at.params}{${css}}`, tree.toString());
}).join('\n')})));

async function mountPairs(page: Page): Promise<void> {
  await installDiscussionFixture(page.context(), {provider: 'openrouter', paused: true});
  await prepareDemoProfile(page);
  // The genuine chrome fixtures use production's lazy Body/Dashboard ports.
  // Prepare them through the public route before invoking their synchronous renderers.
  const bodyPrepared = await page.evaluate(async () => (await import('/js/views-runtime.js')).navigate('body'));
  expect(bodyPrepared).toBe(true);
  await page.clock.setFixedTime(new Date(fixtures.overview.fixedNow));
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.evaluate(async ({cases, originals, placements, shellAttributes}) => {
    if (Intl.DateTimeFormat().resolvedOptions().timeZone !== 'UTC') throw new Error('Original Cycle timezone must be UTC');
    for (const {file, anchor} of placements) {
      const href = '/' + file;
      if ([...document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].some(link => new URL(link.href).pathname === href)) continue;
      await new Promise<void>((resolve, reject) => {
        const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href;
        link.onload = () => resolve(); link.onerror = () => reject(new Error(href));
        if (anchor) {const before = document.querySelector(anchor); if (!before) throw new Error('Missing Cycle stylesheet anchor'); before.before(link);} else document.head.append(link);
      });
    }
    const [{state}, cycle, runtime, rendering, controlsModule] = await Promise.all([
      import('/js/state.js'), import('/js/cycle.js'), import('/js/cycle-runtime.js'), import('/js/cycle-import-rendering.js'), import('/js/dashboard-widget-controls.js'),
    ]);
    const fixtureShell=await import('/tests/helpers/lens-chrome-fixture.js');await runtime.loadCycleStylesheetForAction();
    const modal = document.getElementById('detail-modal')!, overlay = document.getElementById('modal-overlay')!;
    const readShellAttributes = (node: Element): Record<string, string> => Object.fromEntries<string>([...node.attributes].filter(attr => !['id', 'class'].includes(attr.name)).map(attr => [attr.name, attr.value] as const).sort(([a], [b]) => a.localeCompare(b)));
    const savedShellAttributes = readShellAttributes(modal);
    if (JSON.stringify(savedShellAttributes) !== JSON.stringify(shellAttributes)) throw new Error('Expected exact three pre-existing app-shell modal attributes');
    const saved = {data: state.importedData, dob: state.profileDob, html: modal.innerHTML, className: modal.className};
    const controls = controlsModule.createDashboardWidgetControls({state});
    const prepared: {entry: Case; current: string}[] = [];
    try {
      for (const entry of cases) {
        let current: string;
        if (entry.owner === 'editor') {
          state.importedData = {menstrualCycle: structuredClone(entry.sample.input.mc)} as typeof state.importedData;
          await cycle.openMenstrualCycleEditor();
          if (JSON.stringify(readShellAttributes(modal)) !== JSON.stringify(savedShellAttributes)) throw new Error('Editor changed pre-existing app-shell modal attributes');
          current = modal.outerHTML;
        } else if (entry.owner === 'import') {
          current = entry.sample.kind === 'picker' ? rendering.renderCycleImportPicker() : rendering.renderCycleImportSummary(entry.sample.input.mc, source => () => rendering.cycleImportSourceLabel(source));
        } else {
          state.importedData = {menstrualCycle: structuredClone(entry.sample.input.mc ?? null)} as typeof state.importedData;
          state.profileDob = entry.sample.input.profileDob ?? null;
          current = cycle.renderMenstrualCycleSection(structuredClone(entry.sample.input.data ?? null) as Parameters<typeof cycle.renderMenstrualCycleSection>[0], entry.sample.input.opts as Parameters<typeof cycle.renderMenstrualCycleSection>[1]);
        }
        prepared.push({entry, current});
      }
    } finally {
      state.importedData = saved.data; state.profileDob = saved.dob;
      modal.innerHTML = saved.html; modal.className = saved.className; overlay.classList.remove('show');
    }
    const host: PairHost = Object.assign(document.createElement('div'), {pairs: [] as HTMLElement[], sides: [] as {original: HTMLElement; current: HTMLElement}[], actionClicks: [] as string[], motionDiagnostics: {postReadTransitions: 0}, pressedCapture: {events: 0, snapshot: null, error: null, trusted: false}});
    host.id = 'cycle-shared-parity'; host.style.cssText = 'position:fixed;inset:0;background:var(--bg-primary);z-index:20000;overflow:auto';
    document.body.append(host);
    const wrap = (html: string, entry: Case) => {
      if (entry.placement === 'modal') return '<div class="modal-overlay show">' + html + '</div>';
      if (entry.placement === 'body-full') return fixtureShell.renderLensPageWidgetsChromeFixture('body', [{id: 'cycle', title: 'Cycle', description: 'Menstrual cycle context', body: html, size: 'full'}]);
      if (entry.placement === 'dashboard-half') {
        const widget = {def: {id: 'cycle', source: 'Body', title: 'Cycle', description: 'Menstrual cycle context', size: 'half'}, body: html};
        return '<div class="dashboard-widgets">' + fixtureShell.renderDashboardWidgetChromeFixture(controls, widget, {hidden: [], order: []}, 0, [widget]) + '</div>';
      }
      return fixtureShell.renderLensPageWidgetsChromeFixture('body', [{id: 'cycle', title: 'Cycle', description: 'Menstrual cycle context', body: html, size: 'full'}]);
    };
    for (const {entry, current} of prepared) {
      const pair = document.createElement('div'); pair.dataset.name = entry.owner + '/' + entry.sample.name + '/' + entry.placement; pair.dataset.owner = entry.owner; pair.dataset.icons = String(entry.icons); pair.style.cssText = 'position:absolute;inset:0;padding:12px';
      let originalHTML = entry.sample.html;
      if (entry.owner === 'editor') {
        const scaffold = document.createElement('div'); scaffold.innerHTML = originalHTML;
        const root = scaffold.firstElementChild;
        if (scaffold.children.length !== 1 || !root || root.id !== 'detail-modal' || root.getAttribute('class') !== 'modal cycle-modal' || root.attributes.length !== 2 || [...root.attributes].some(attr => !['id', 'class'].includes(attr.name))) throw new Error('Original editor fixture must retain its exact id/class-only scaffold');
        for (const [name, value] of Object.entries(savedShellAttributes)) root.setAttribute(name, value);
        if (JSON.stringify(readShellAttributes(root)) !== JSON.stringify(shellAttributes)) throw new Error('Original editor wrapper composition changed shell attributes');
        originalHTML = scaffold.innerHTML;
      }
      for (const [kind, html] of [['original', originalHTML], ['current', current]] as const) {
        const side = document.createElement('section'); side.dataset[kind] = ''; if (kind === 'original') side.dataset.cycleOriginal = entry.owner;
        side.style.cssText = 'position:absolute;inset:0;padding:12px'; side.innerHTML = wrap(html, entry); pair.append(side);
      }
      host.sides.push({original: pair.querySelector<HTMLElement>('[data-original]')!, current: pair.querySelector<HTMLElement>('[data-current]')!});
      host.pairs.push(pair);
    }
    for (const {owner, file, css} of originals) {
      const runtimeFile = file.replace('.base.css', '.css');
      const link = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].find(link => new URL(link.href).pathname === '/' + runtimeFile);
      if (!link) throw new Error('Missing original stylesheet placement ' + owner + '/' + file);
      const style = document.createElement('style'); style.dataset.cycleOriginalStyles = owner + '/' + file; style.textContent = css; link.after(style);
    }
    host.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target.closest('[data-cycle-action],[data-cycle-import-action]') : null;
      if (!target) return;
      host.actionClicks.push(target.getAttribute('data-cycle-action') || target.getAttribute('data-cycle-import-action') || '');
      event.preventDefault(); event.stopImmediatePropagation();
    }, true);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) throw new Error('Shared Cycle acceptance requires normal motion');
    for (const pair of host.pairs) {
      host.replaceChildren(pair);
      for (const control of pair.querySelectorAll('.cycle-icon-btn')) {
      const css = getComputedStyle(control);
      const durations = css.transitionDuration.split(',').map(part => parseFloat(part) * (part.trim().endsWith('ms') ? 1 : 1000));
      if (JSON.stringify(durations) !== JSON.stringify([150, 150, 150, 50])) throw new Error('Original Cycle transition timing was altered: ' + css.transitionDuration);
      }
    }
    host.replaceChildren();
    await document.fonts.ready;
  }, {cases, originals, placements: [...fixtures.overview.stylePlacements!, {file: 'css/import.css', anchor: null}], shellAttributes});
}
async function setTheme(page: Page, theme: string): Promise<void> {
  await page.evaluate(async theme => {
    if (theme === 'default') document.documentElement.removeAttribute('data-theme'); else (await import('/js/theme.js')).setTheme(theme);
    await document.fonts.ready;
  }, theme);
}

async function geometry(page: Page): Promise<{problems: string[]; comparisons: number; sharedNodes: number; adjacentSections: number}> {
  return page.locator('#cycle-shared-parity').evaluate((element, {properties, sharedSelector}) => {
    const host = element as PairHost, problems: string[] = []; let sharedNodes = 0, adjacentSections = 0;
    const auto = (node: Element) => node.classList.contains('cycle-field') && !!node.querySelector(':scope > .cycle-auto-value');
    interface NodeSnapshot {tag: string; attrs: Record<string, string>; text: string; children: NodeSnapshot[]}
    const normalized = (node: Element): NodeSnapshot => ({
      tag: node.tagName === 'LABEL' && auto(node) ? 'DIV' : node.tagName,
      attrs: Object.fromEntries([...node.attributes].filter(attr => !['class', 'data-cycle-editor-view', 'data-cycle-import-view', 'data-cycle-overview-view', 'data-cycle-original', 'data-original', 'data-current'].includes(attr.name)).map(attr => [attr.name, attr.value]).sort(([a], [b]) => a!.localeCompare(b!))),
      text: [...node.childNodes].filter(child => child.nodeType === Node.TEXT_NODE).map(child => child.textContent).join('').replace(/\s+/g, ' ').trim(),
      children: [...node.children].map(normalized),
    });
    const firstDifference = (before: NodeSnapshot, after: NodeSnapshot, path: string): string | null => {
      if (before.tag !== after.tag) return `${path}/tag: current=${JSON.stringify(after.tag)} original=${JSON.stringify(before.tag)}`;
      for (const name of [...new Set([...Object.keys(before.attrs), ...Object.keys(after.attrs)])].sort()) {
        if (before.attrs[name] !== after.attrs[name]) return `${path}/${before.tag}/@${name}: current=${JSON.stringify(after.attrs[name])} original=${JSON.stringify(before.attrs[name])}`;
      }
      if (before.text !== after.text) return `${path}/${before.tag}/direct-text: current=${JSON.stringify(after.text)} original=${JSON.stringify(before.text)}`;
      if (before.children.length !== after.children.length) return `${path}/${before.tag}/child-count: current=${after.children.length} original=${before.children.length}`;
      for (let index = 0; index < before.children.length; index++) {
        const difference = firstDifference(before.children[index]!, after.children[index]!, `${path}/${before.tag}[${index}]`);
        if (difference) return difference;
      }
      return null;
    };
    for (const pair of host.pairs) {
      host.replaceChildren(pair);
      const original = pair.querySelector<HTMLElement>('[data-original]')!, current = pair.querySelector<HTMLElement>('[data-current]')!;
      original.style.visibility = 'visible'; current.style.visibility = 'visible';
      const priorDOM = normalized(original), currentDOM = normalized(current);
      if (JSON.stringify(priorDOM) !== JSON.stringify(currentDOM)) problems.push(pair.dataset.name + '/topology attributes or direct text: ' + (firstDifference(priorDOM, currentDOM, 'side') || 'serialized snapshots differ'));
      const before = [...original.querySelectorAll('*')], after = [...current.querySelectorAll('*')];
      if (before.length !== after.length) {problems.push(pair.dataset.name + '/node count'); continue;}
      if (pair.dataset.owner === 'editor') {
        const old = before.filter(node => node.tagName === 'LABEL' && auto(node));
        const next = after.filter(node => node.tagName === 'DIV' && auto(node));
        if (old.length !== 4 || next.length !== 4 || next.some(node => node.hasAttribute('for') || node.querySelector('input,select,textarea,button,meter,output,progress'))) problems.push('Exact four approved automatic-field semantic repairs');
      }
      const snapshot = (node: Element) => {const css = getComputedStyle(node); return Object.fromEntries(properties.map(property => [property, css.getPropertyValue(property)]));};
      before.forEach((node, index) => {
        const next = after[index]!;
        const repair = node.tagName === 'LABEL' && auto(node) && next.tagName === 'DIV' && auto(next);
        if (node.tagName !== next.tagName && !repair) problems.push(pair.dataset.name + '/' + index + '/tag');
        for (const name of node.classList) if (!next.classList.contains(name)) problems.push(pair.dataset.name + '/' + index + '/native class ' + name);
        // Whole tree geometry catches shared changes propagated into surrounding
        // authored rows/forms and production wrapper layout, not just targets.
        const a = node.getBoundingClientRect(), b = next.getBoundingClientRect();
        if (a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height) problems.push(pair.dataset.name + '/' + index + '/bounds ' + JSON.stringify(b) + ' != ' + JSON.stringify(a));
        if (node.matches(sharedSelector)) {
          sharedNodes++; const prior = snapshot(node), now = snapshot(next);
          for (const property of properties) if (prior[property] !== now[property]) problems.push(`${pair.dataset.name}/${index}/${property}: ${now[property]} != ${prior[property]}`);
        }
        if (node instanceof HTMLElement && node.hidden !== (next as HTMLElement).hidden) problems.push(pair.dataset.name + '/' + index + '/hidden');
      });
      const adjacent = [...original.querySelectorAll('.cycle-editor-section + .cycle-editor-section')];
      if (adjacent.length !== current.querySelectorAll('.cycle-editor-section + .cycle-editor-section').length) problems.push(pair.dataset.name + '/section adjacency');
      adjacentSections += adjacent.length;
      if (original.querySelectorAll('.cycle-icon-btn').length !== Number(pair.dataset.icons) || current.querySelectorAll('.cycle-icon-btn').length !== Number(pair.dataset.icons)) problems.push(pair.dataset.name + '/exact icon count');
    }
    return {problems, comparisons: host.pairs.length, sharedNodes, adjacentSections};
  }, {properties, sharedSelector});
}
async function targets(page: Page, scrollOwners: boolean): Promise<Target[]> {
  return page.locator('#cycle-shared-parity').evaluate((element, scrollOwners) => {
    const host = element as PairHost, plan: Target[] = [];
    host.pairs.forEach((pair, pairIndex) => {
      for (const side of pair.children) if (scrollOwners) {const owner = side as HTMLElement; owner.style.overflow = 'auto'; owner.style.overscrollBehavior = 'contain';}
      const before = [...pair.querySelector('[data-original]')!.querySelectorAll<HTMLButtonElement>('.cycle-icon-btn')], after = [...pair.querySelector('[data-current]')!.querySelectorAll<HTMLButtonElement>('.cycle-icon-btn')];
      if (before.length !== Number(pair.dataset.icons) || after.length !== before.length) throw new Error('Shared icon topology ' + pair.dataset.name);
      before.forEach((control, index) => {
        const next = after[index]!;
        if (control.tagName !== 'BUTTON' || next.tagName !== 'BUTTON' || control.disabled || next.disabled || control.getAttribute('data-cycle-action') !== next.getAttribute('data-cycle-action') || control.getAttribute('data-cycle-import-action') !== next.getAttribute('data-cycle-import-action')) throw new Error('Shared icon contract ' + pair.dataset.name + '/' + index);
        plan.push({pair: pairIndex, index, name: pair.dataset.name!, action: control.getAttribute('data-cycle-action') || control.getAttribute('data-cycle-import-action') || ''});
      });
    });
    return plan;
  }, scrollOwners);
}
async function prepareControl(page: Page, target: Target, side: Side): Promise<Point> {
  return page.evaluate(({target, side}) => {
    const host = document.getElementById('cycle-shared-parity') as PairHost | null, pair = host?.pairs[target.pair];
    if (!host || !pair) throw new Error('Missing shared Cycle pair');
    if (host.firstElementChild !== pair) {host.replaceChildren(pair); host.scrollTop = 0; host.scrollLeft = 0;}
    const references = host.sides[target.pair];
    if (!references) throw new Error('Missing shared Cycle fixture-side references');
    const {original, current} = references;
    // Only one fixture-side tree is attached during interaction. Two connected
    // modal-overlay.show fixtures would change real modal focus-trap ordering,
    // even with one hidden; neither production subtree receives style changes.
    pair.replaceChildren(references[side]);
    const control = (side === 'original' ? original : current).querySelectorAll<HTMLButtonElement>('.cycle-icon-btn')[target.index];
    if (!control || control.disabled) throw new Error('Missing or disabled shared Cycle icon');
    control.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'instant'});
    const box = control.getBoundingClientRect(), css = getComputedStyle(control), point = {x: box.x + box.width / 2, y: box.y + box.height / 2};
    if (css.visibility !== 'visible' || css.display === 'none' || box.width <= 0 || box.height <= 0) throw new Error('Hidden shared Cycle icon ' + target.name);
    const hit = document.elementFromPoint(point.x, point.y);
    if (!hit || !(hit === control || control.contains(hit))) throw new Error('Shared Cycle icon not hit-testable ' + JSON.stringify({target, side, point, box: box.toJSON(), hit: hit?.outerHTML.slice(0, 400), originalAttached: original.isConnected, currentAttached: current.isConnected}));
    return point;
  }, {target, side});
}
async function pointerSnapshot(page: Page, target: Target, side: Side, state: PointerState, point: Point): Promise<Record<string, string>> {
  const settling: {firstAt: number | null; last: string | null; stableFrames: number} = {firstAt: null, last: null, stableFrames: 0};
  const handle = await page.waitForFunction(({target, side, state, point, properties, settling}) => {
    const host = document.getElementById('cycle-shared-parity') as PairHost | null, pair = host?.pairs[target.pair];
    if (!host || !pair || host.firstElementChild !== pair) throw new Error('Shared pointer pair is not attached');
    const control = pair.querySelector('[data-' + side + ']')?.querySelectorAll<HTMLButtonElement>('.cycle-icon-btn')[target.index];
    if (!control) throw new Error('Missing shared pointer target');
    const hit = document.elementFromPoint(point.x, point.y);
    if (!hit || !(hit === control || control.contains(hit)) || !control.matches(':hover') || (state === 'active' ? !control.matches(':active') : control.matches(':active'))) {settling.firstAt = null; settling.last = null; settling.stableFrames = 0; return null;}
    settling.firstAt ??= performance.now();
    // Wait for this one gesture's real transitions; no repeated input, forced
    // pseudo-class, synthetic event or stylesheet override is used.
    if (control.getAnimations().some(animation => animation.playState === 'running' || animation.pending)) {settling.last = null; settling.stableFrames = 0; return null;}
    const css = getComputedStyle(control), snapshot = Object.fromEntries(properties.map(property => [property, css.getPropertyValue(property)]));
    // Reading styles can flush a newly started native transition. Reject that
    // sample too; matching pseudo-state alone does not prove settled colors.
    if (control.getAnimations().some(animation => animation.playState === 'running' || animation.pending)) {host.motionDiagnostics.postReadTransitions++; settling.last = null; settling.stableFrames = 0; return null;}
    // Some native transition samples are not exposed by getAnimations().
    // Use the actual computed duration/delay budget, then require two equal
    // consecutive real-frame reads without altering CSS, time or input.
    const milliseconds = (value: string) => value.split(',').map(part => parseFloat(part) * (part.trim().endsWith('ms') ? 1 : 1000));
    const durations = milliseconds(css.transitionDuration), delays = milliseconds(css.transitionDelay);
    if (!durations.length || !delays.length || [...durations, ...delays].some(value => !Number.isFinite(value))) throw new Error('Invalid native transition timing');
    const minimumMs = Math.max(0, ...durations.map((duration, index) => duration + delays[index % delays.length]!));
    if (performance.now() - settling.firstAt < minimumMs) {settling.last = null; settling.stableFrames = 0; return null;}
    const signature = JSON.stringify(snapshot);
    settling.stableFrames = signature === settling.last ? settling.stableFrames + 1 : 1; settling.last = signature;
    if (settling.stableFrames < 2) return null;
    const measuredHit = document.elementFromPoint(point.x, point.y);
    if (!measuredHit || !(measuredHit === control || control.contains(measuredHit)) || !control.matches(':hover') || (state === 'active' ? !control.matches(':active') : control.matches(':active'))) throw new Error('Genuine shared pointer state changed during capture');
    return snapshot;
  }, {target, side, state, point, properties, settling}, {polling: 'raf', timeout: 3000});
  try {const value = await handle.jsonValue(); if (!value) throw new Error('Missing atomic shared pointer styles'); return value;} finally {await handle.dispose();}
}
async function armPressedCapture(page: Page, target: Target, side: Side, point: Point): Promise<void> {
  await page.evaluate(({target, side, point, properties}) => {
    const host = document.getElementById('cycle-shared-parity') as PairHost | null;
    if (!host) throw new Error('Missing shared pressed host');
    host.pressedCapture = {events: 0, snapshot: null, error: null, trusted: false};
    document.addEventListener('mousedown', event => {
      const capture = host.pressedCapture; capture.events++; capture.trusted = event.isTrusted;
      const pair = host.pairs[target.pair];
      const control = pair?.querySelector('[data-' + side + ']')?.querySelectorAll<HTMLButtonElement>('.cycle-icon-btn')[target.index];
      try {
        const hit = document.elementFromPoint(point.x, point.y), eventHit = document.elementFromPoint(event.clientX, event.clientY);
        if (!pair || host.firstElementChild !== pair || !control || !event.isTrusted || event.button !== 0 || event.buttons !== 1 || !(event.target instanceof Node) || !control.contains(event.target) || !hit || !(hit === control || control.contains(hit)) || !eventHit || !(eventHit === control || control.contains(eventHit)) || !control.matches(':hover') || !control.matches(':active')) throw new Error('Genuine shared pressed event contract absent');
        const css = getComputedStyle(control), snapshot = Object.fromEntries(properties.map(property => [property, css.getPropertyValue(property)]));
        const postHit = document.elementFromPoint(point.x, point.y), postEventHit = document.elementFromPoint(event.clientX, event.clientY);
        if (!postHit || !(postHit === control || control.contains(postHit)) || !postEventHit || !(postEventHit === control || control.contains(postEventHit)) || !control.matches(':hover') || !control.matches(':active')) throw new Error('Genuine shared pressed event state changed during capture');
        capture.snapshot = snapshot;
      } catch (error) {capture.error = (error instanceof Error ? error.message : String(error)) + ': ' + JSON.stringify({side, target, point, trusted: event.isTrusted, button: event.button, buttons: event.buttons, clientX: event.clientX, clientY: event.clientY, hover: control?.matches(':hover'), active: control?.matches(':active'), rect: control?.getBoundingClientRect().toJSON()});}
    }, {capture: true, once: true});
  }, {target, side, point, properties});
}
async function pressedSnapshot(page: Page): Promise<Record<string, string>> {
  await page.waitForFunction(() => (document.getElementById('cycle-shared-parity') as PairHost | null)?.pressedCapture.events === 1, {}, {polling: 'raf', timeout: 3000});
  const capture = await page.locator('#cycle-shared-parity').evaluate(element => (element as PairHost).pressedCapture);
  expect(capture.events).toBe(1); expect(capture.trusted).toBe(true);
  if (capture.error || !capture.snapshot) throw new Error(capture.error || 'Missing genuine shared pressed styles');
  return capture.snapshot;
}
async function zeroClicks(page: Page): Promise<void> {
  expect(await page.locator('#cycle-shared-parity').evaluate(element => (element as PairHost).actionClicks)).toEqual([]);
}

for (const theme of themes) {
  test('shared Cycle originals retain topology, native cascade and layout / ' + theme, async ({page}, info) => {
    test.setTimeout(60000); await mountPairs(page); await setTheme(page, theme); await page.mouse.move(0, 0);
    const receipts = [];
    for (const width of widths) {
      await page.setViewportSize({width, height: 1000}); const result = await geometry(page);
      expect(result.problems, theme + '/' + width).toEqual([]); expect(result.comparisons).toBe(5); expect(result.adjacentSections).toBe(2); expect(result.sharedNodes).toBe(55); receipts.push({width, ...result});
    }
    await zeroClicks(page);
    fs.writeFileSync(info.outputPath('cycle-shared-geometry.json'), JSON.stringify({themes: [theme], widths, receipts, properties, fixtureHashes, appShellSHA256, shellAttributes, wrapperComposition, timezone: 'UTC', normalMotion: {reduced: false, durationsMs: [150, 150, 150, 50]}, consumers: 8, nativeSelectorPaths: 14}, null, 2));
  });
  test('shared Cycle controls retain genuine keyboard focus / ' + theme, async ({page}, info) => {
    test.setTimeout(60000); await mountPairs(page); await setTheme(page, theme); const plan = await targets(page, true); expect(plan).toHaveLength(11); let checks = 0;
    for (const width of widths) {
      await page.setViewportSize({width, height: 1000}); await page.mouse.move(0, 0);
      for (const target of plan) {
        const snapshots: Record<string, string>[] = [];
        for (const side of ['original', 'current'] as const) {
          await prepareControl(page, target, side);
          // Focus a real preceding control, then let a trusted Tab select the
          // target. A non-tabbable side anchors the first control without a
          // fabricated button or changing any product control's tabindex.
          await page.evaluate(({target, side}) => {
            const host = document.getElementById('cycle-shared-parity') as PairHost | null, pair = host?.pairs[target.pair];
            if (!host || !pair || host.firstElementChild !== pair) throw new Error('Shared focus pair is not attached');
            const owner = pair.querySelector<HTMLElement>('[data-' + side + ']')!;
            const control = owner.querySelectorAll<HTMLButtonElement>('.cycle-icon-btn')[target.index]!;
            const focusable = [...owner.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]')].filter(node => {
              const css = getComputedStyle(node); return !(node as HTMLButtonElement).disabled && node.tabIndex >= 0 && css.visibility === 'visible' && css.display !== 'none' && node.getClientRects().length > 0;
            });
            const index = focusable.indexOf(control); if (index < 0) throw new Error('Shared icon absent from native tab order');
            const previous = index ? focusable[index - 1]! : owner; if (!index) owner.tabIndex = -1;
            previous.focus({preventScroll: true}); if (document.activeElement !== previous) throw new Error('Cannot anchor shared icon keyboard navigation');
          }, {target, side});
          await page.keyboard.press('Tab');
          snapshots.push(await page.evaluate(({target, side, properties}) => {
            const host = document.getElementById('cycle-shared-parity') as PairHost | null, pair = host?.pairs[target.pair];
            if (!host || !pair || host.firstElementChild !== pair) throw new Error('Shared focus snapshot pair is not attached');
            const control = pair.querySelector('[data-' + side + ']')?.querySelectorAll<HTMLButtonElement>('.cycle-icon-btn')[target.index];
            if (!control || document.activeElement !== control || !control.matches(':focus-visible') || control.matches(':hover') || control.matches(':active')) throw new Error('Genuine shared keyboard focus state absent ' + JSON.stringify({target, side, focus: control?.matches(':focus-visible'), hover: control?.matches(':hover'), active: control?.matches(':active'), activeElement: document.activeElement?.outerHTML.slice(0, 500), expected: control?.outerHTML.slice(0, 300)}));
            const css = getComputedStyle(control); return Object.fromEntries(properties.map(property => [property, css.getPropertyValue(property)]));
          }, {target, side, properties}));
        }
        expect(snapshots[1], theme + '/' + width + '/' + target.name + '/' + target.index + '/focus').toEqual(snapshots[0]); checks++;
      }
    }
    expect(checks).toBe(44); await zeroClicks(page);
    fs.writeFileSync(info.outputPath('cycle-shared-focus.json'), JSON.stringify({checks, widths, themes: [theme], controls: plan, properties, fixtureHashes, appShellSHA256, shellAttributes, wrapperComposition, timezone: 'UTC', normalMotion: {reduced: false, durationsMs: [150, 150, 150, 50]}, delegatedActionClicks: 0}, null, 2));
  });
  for (const width of widths) for (const pointerState of ['hover', 'active'] as const) {
    test('shared Cycle controls retain real ' + pointerState + ' / ' + theme + ' / ' + width, async ({page, browserName}, info) => {
      test.setTimeout(60000); await mountPairs(page); await page.setViewportSize({width, height: 1000}); await setTheme(page, theme); await page.mouse.move(0, 0);
      const plan = await targets(page, true); expect(plan).toHaveLength(11); const eventPress = pointerState === 'active' && browserName === 'webkit'; let checks = 0;
      for (const target of plan) {
        const snapshots: Record<string, string>[] = [];
        for (const side of ['original', 'current'] as const) {
          const point = await prepareControl(page, target, side); await page.mouse.move(point.x, point.y);
          const hoverSnapshot = await pointerSnapshot(page, target, side, 'hover', point);
          if (eventPress) await armPressedCapture(page, target, side, point);
          if (pointerState === 'active') await page.mouse.down();
          try {snapshots.push(pointerState === 'hover' ? hoverSnapshot : eventPress ? await pressedSnapshot(page) : await pointerSnapshot(page, target, side, pointerState, point));}
          finally {
            await page.mouse.move(0, 0);
            if (pointerState === 'active') {
              expect(await page.evaluate(() => !document.elementFromPoint(0, 0)?.closest('[data-cycle-action],[data-cycle-import-action]'))).toBe(true);
              await page.mouse.up();
            }
          }
        }
        expect(snapshots[1], theme + '/' + width + '/' + target.name + '/' + target.index + '/' + pointerState).toEqual(snapshots[0]); checks++;
      }
      expect(checks).toBe(11); await zeroClicks(page);
      fs.writeFileSync(info.outputPath('cycle-shared-pointer.json'), JSON.stringify({checks, activeChecks: pointerState === 'active' ? checks : 0, themes: [theme], widths: [width], pointerState, controls: plan, properties, fixtureHashes, appShellSHA256, shellAttributes, wrapperComposition, timezone: 'UTC', normalMotion: {reduced: false, durationsMs: [150, 150, 150, 50]}, delegatedActionClicks: 0, trustedPressEvents: eventPress ? checks * 2 : 0, pressSampling: pointerState === 'hover' ? 'hover-atomic' : eventPress ? 'trusted-mousedown' : 'post-delivery-atomic', syntheticStateOrEvents: false, postStyleAnimationGate: true, computedTransitionBudget: true, consecutiveStableFrames: 2, motionDiagnostics: await page.locator('#cycle-shared-parity').evaluate(element => (element as PairHost).motionDiagnostics)}, null, 2));
    });
  }
}
