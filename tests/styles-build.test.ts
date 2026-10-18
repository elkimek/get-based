import {compileRemainingFeatureStyles} from '../scripts/remaining-feature-style-ownership.mjs';
import {compileSettingsChatLayoutStyles} from '../scripts/settings-chat-layout-style-ownership.mjs';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import postcss from 'postcss';
import {compileStartupBannerStyles} from '../scripts/startup-banner-style-ownership.mjs';
import {compileModalPresentationStyles} from '../scripts/modal-presentation-style-ownership.mjs';
import {compilePIIReviewStyles} from '../scripts/pii-review-style-ownership.mjs';
import {cycleSharedUtilities} from '../js/cycle-shared-classes.js';
import { buildStyles, buildProtectionStyles, buildChatStyles, buildAppShellStyles, buildModalStyles, buildImportStyles, buildRecommendationStyles, buildCycleStyles } from '../scripts/build-styles.mjs';

let directory: string;
let outputPath: string;
let protectionOutputPath: string;
let chatOutputPath: string;
beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-style-test-'));
  outputPath = path.join(directory, 'settings.css');
  await buildStyles({ outputPath });
  protectionOutputPath = path.join(directory,'data-protection.css');
  await buildProtectionStyles({ outputPath:protectionOutputPath });
  chatOutputPath = path.join(directory, 'chat-panel-open.css');
  await buildChatStyles({ outputPath: chatOutputPath });
});
afterAll(async () => { await fs.rm(directory, { recursive: true, force: true }); });

/** Check the actual Display utility owners, including emitted behavioral states. */
function verifyDisplayUtilities(source: string, component: string): void {
  const expected = [...new Set(component.match(/\bgb:display:[^\s"'`<>}]+/g) || [])].sort();
  expect(expected.length).toBeGreaterThan(0);
  const rules: postcss.Rule[] = [];
  postcss.parse(source).walkRules(rule => {if (rule.selector.includes('.gb\\:display')) rules.push(rule);});
  const actual = rules.flatMap(rule => rule.selectors.map(selector => {
    expect(selector.startsWith('#settings-tab-display ')).toBe(true);
    const decoded = decodedCssSelector(selector);
    const token = expected.find(token => decoded === '#settings-tab-display .' + token
      || decoded === '#settings-tab-display .' + token + ':focus-visible');
    expect(token, selector).toBeDefined();
    return token!;
  })).sort();
  expect(actual).toEqual(expected);
  for (const [token, property, value, media] of [
    ['focus-visible:outline-2', 'outline-width', '2px', null],
    ['focus-visible:outline-offset-2', 'outline-offset', '2px', null],
    ['focus-visible:outline-accent', 'outline-color', 'var(--accent)', null],
    ['motion-reduce:transition-none', 'transition-property', 'none', '(prefers-reduced-motion:reduce)'],
    ['[@media(pointer:coarse)]:min-h-11', 'min-height', 'calc(var(--gb-spacing)*11)', '(pointer:coarse)'],
    ['[@media(pointer:coarse)]:min-w-11', 'min-width', 'calc(var(--gb-spacing)*11)', '(pointer:coarse)'],
    ['[@media(pointer:coarse)]:shrink-0', 'flex-shrink', '0', '(pointer:coarse)'],
  ] as const) {
    const matched = rules.filter(rule => rule.selectors.some(selector => {
      const decoded = decodedCssSelector(selector), target = '#settings-tab-display .gb:display:' + token;
      return decoded === target || decoded === target + ':focus-visible';
    }));
    expect(matched, token).toHaveLength(1);
    const rule = matched[0]!;
    expect(rule.nodes.some(node => node.type === 'decl' && node.prop === property
      && node.value.replace(/\s+/g, '') === value && !node.important), token).toBe(true);
    const ancestry: string[] = [];
    for (let parent: postcss.Rule['parent'] | postcss.Document = rule.parent; parent; parent = parent.parent) {
      if (parent.type === 'atrule') ancestry.unshift(parent.name + ':' + parent.params.replace(/\s+/g, ''));
    }
    expect(ancestry, token).toEqual(media ? ['media:' + media] : []);
    if (token.startsWith('focus-visible:')) expect(rule.selector.endsWith(':focus-visible')).toBe(true);
  }
}

it('preserves legacy Settings CSS and scopes generated utilities without a reset', async () => {
  const source = await fs.readFile(outputPath, 'utf8');
  const base = (await compileSettingsChatLayoutStyles('settings',await fs.readFile('css/settings.base.css','utf8'),path.resolve('css/settings.base.css'),path.resolve('.'))).css.trimEnd();
  expect(source).toContain(base);
  const utilities = source.slice(source.indexOf(base) + base.length);
  const selectors: string[] = [];
  postcss.parse(utilities).walkRules(rule => { selectors.push(...rule.selectors); });
  // Compact Display uses shared semantic recipes plus its own focus/touch/
  // reduced-motion utilities. Guard both owners instead of counting retired
  // utility spellings or reintroducing inert classes just to inflate that count.
  const originalText = await fs.readFile('tests/fixtures/settings-chat-native.json', 'utf8');
  expect(createHash('sha256').update(originalText).digest('hex')).toBe('ae1c1483c6ebc51de21b0ffafb3fba96460c7c45ea783defdff5da9c9e13b308');
  const original = (JSON.parse(originalText) as {lane: string; native: string; declarations: number; receivers: number}[]).find(row => row.lane === 'settings')!;
  expect(original.declarations).toBe(234); expect(original.receivers).toBe(71);
  expect(base).toBe(original.native.trimEnd());
  let layoutReceivers = 0, layoutDeclarations = 0;
  postcss.parse(base).walkRules(rule => {
    // The frozen receiver/declaration inventory excludes the animation's from/to
    // frames; the full-byte equality above still protects that animation too.
    for (let parent: postcss.Rule['parent'] | postcss.Document = rule.parent; parent; parent = parent.parent) {
      if (parent.type === 'atrule' && /keyframes$/.test(parent.name)) return;
    }
    layoutReceivers++;
    layoutDeclarations += rule.nodes.filter(node => node.type === 'decl').length;
  });
  expect(layoutReceivers).toBeGreaterThan(30);
  expect(layoutReceivers).toBe(original.receivers); expect(layoutDeclarations).toBe(original.declarations);
  verifyDisplayUtilities(utilities, await fs.readFile('js/components/DisplaySettings.svelte', 'utf8'));
  const sync = selectors.filter(selector => selector.includes('.gb\\:sync\\:'));
  expect(sync.length).toBeGreaterThan(30);
  expect(sync.every(selector => selector.startsWith('#sync-section '))).toBe(true);
  const dialogs = selectors.filter(selector => selector.includes('.gb\\:sync-dialog'));
  expect(dialogs.length).toBeGreaterThan(30);
  expect(dialogs.every(selector => selector.startsWith(':is(#sync-setup-overlay,#sync-restore-overlay) '))).toBe(true);
  const wearables = selectors.filter(selector => selector.includes('.gb\\:wearables'));
  expect(wearables.length).toBeGreaterThan(50);
  expect(wearables.every(selector => selector.startsWith('#wearables-section '))).toBe(true);
  const mealModels = selectors.filter(selector => selector.includes('.gb\\:meal-model'));
  expect(mealModels.length).toBeGreaterThan(15);
  expect(mealModels.every(selector => selector.includes(':is(#nutrition-ai-model-settings,#nutrition-ai-model-settings *)'))).toBe(true);
  const cloudProviders = selectors.filter(selector => selector.includes('.gb\\:cloud-provider'));
  expect(cloudProviders.length).toBeGreaterThan(35);
  expect(cloudProviders.every(selector => selector.includes(':is([data-cloud-provider-settings-view],[data-cloud-provider-settings-view] *)'))).toBe(true);
  expect(utilities).toContain(':checked');
  expect(utilities).toContain('color:var(--warning-ink)');
  expect(selectors).not.toContain('body');
  expect(selectors).not.toContain('button,input,optgroup,select,textarea');
  expect(utilities).not.toContain('!important');
  expect(utilities).toContain('background-color:var(--accent)');
  expect(utilities).toContain('color:var(--on-accent)');
  expect(utilities).toContain('@container');
});

it('rejects missing Display utilities, escaped scope and changed focus/touch/motion behavior', async () => {
  const source = await fs.readFile(outputPath, 'utf8');
  const component = await fs.readFile('js/components/DisplaySettings.svelte', 'utf8');
  for (const change of ['remove-utility', 'scope', 'focus', 'coarse', 'motion'] as const) {
    const tree = postcss.parse(source); let changed = false;
    tree.walkRules(rule => {
      if (changed || !rule.selector.includes('.gb\\:display')) return;
      if (change === 'scope') {rule.selector = rule.selector.replace('#settings-tab-display', '#settings-tab-ai'); changed = true;}
      else if (change === 'remove-utility') {rule.remove(); changed = true;}
      else if (change === 'focus' && rule.selector.includes('outline-offset-2')) {
        rule.walkDecls('outline-offset', declaration => {declaration.value = '0'; changed = true;});
      } else if (change === 'coarse' && rule.selector.includes('min-h-11')
        || change === 'motion' && rule.selector.includes('transition-none')) {
        const parent = rule.parent;
        if (parent?.type === 'atrule') {parent.params = '(hover:hover)'; changed = true;}
      }
    });
    expect(changed, change).toBe(true);
    expect(() => verifyDisplayUtilities(tree.toString(), component), change).toThrow();
  }
});

it('rebuilds deterministically and rejects stale CSS without overwriting it', async () => {
  const source = await fs.readFile(outputPath, 'utf8');
  await buildStyles({ outputPath, check: true });
  await fs.writeFile(outputPath, source + '/* stale */');
  await expect(buildStyles({ outputPath, check: true })).rejects.toThrow('Settings CSS is stale');
  expect(await fs.readFile(outputPath, 'utf8')).toBe(source + '/* stale */');
});


it('preserves PII base styles and scopes protection dialog utilities without a reset', async () => {
  const source = await fs.readFile(protectionOutputPath,'utf8');
  const base = (await compilePIIReviewStyles(await fs.readFile('css/data-protection.base.css','utf8'),path.resolve('css/data-protection.base.css'),path.resolve('.'))).css.trimEnd();
  expect(source).toContain(base); expect(base).not.toContain('.passphrase-dialog');
  const selectors: string[] = []; postcss.parse(source.slice(source.indexOf(base)+base.length)).walkRules(rule=>{selectors.push(...rule.selectors);});
  const owned = selectors.filter(selector=>selector.includes('.gb\\:passphrase'));
  expect(owned.length).toBeGreaterThan(30); expect(owned.every(selector=>selector.startsWith('#passphrase-overlay '))).toBe(true);
  expect(selectors).not.toContain('body'); expect(selectors).not.toContain('button,input,optgroup,select,textarea');
  expect(source).not.toContain('!important');
});
it('rebuilds protection CSS deterministically and rejects stale output without overwriting it', async () => {
  const source = await fs.readFile(protectionOutputPath,'utf8');
  await buildProtectionStyles({outputPath:protectionOutputPath,check:true});
  await fs.writeFile(protectionOutputPath,source+'/* stale */');
  await expect(buildProtectionStyles({outputPath:protectionOutputPath,check:true})).rejects.toThrow('Data protection CSS is stale');
  expect(await fs.readFile(protectionOutputPath,'utf8')).toBe(source+'/* stale */');
});

it('retains the lazy Chat stylesheet URL, scopes navigation utilities and rejects stale output', async () => {
  const source = await fs.readFile(chatOutputPath, 'utf8');
  const base = (await compileSettingsChatLayoutStyles('chat-open',await fs.readFile('css/chat-panel-open.base.css','utf8'),path.resolve('css/chat-panel-open.base.css'),path.resolve('.'))).css.trimEnd();
  expect(source).toContain(base);
  expect(base).not.toMatch(/\.chat-thread-item(?:\s|\{|:|\.)/);
  const utilities = source.slice(source.indexOf(base) + base.length);
  const selectors: string[] = [];
  postcss.parse(utilities).walkRules(rule => { selectors.push(...rule.selectors); });
  const owned = selectors.filter(selector => selector.includes('.gb\\:thread-nav'));
  expect(owned.length).toBeGreaterThan(40);
  expect(owned.every(selector => selector.includes(':is([data-chat-thread-navigation-view],[data-chat-thread-navigation-view] *)'))).toBe(true);
  expect(selectors).not.toContain('body');
  expect(utilities).not.toContain('!important');
  expect(utilities.replace(/\s+/g, '')).toContain('min-height:calc(var(--gb-spacing)*11)');
  await buildChatStyles({ outputPath: chatOutputPath, check: true });
  await fs.writeFile(chatOutputPath, source + '/* stale */');
  await expect(buildChatStyles({ outputPath: chatOutputPath, check: true })).rejects.toThrow('Chat CSS is stale');
  expect(await fs.readFile(chatOutputPath, 'utf8')).toBe(source + '/* stale */');
});


const sharedStyleBuilders = [['app-shell', buildAppShellStyles], ['modal-shared', buildModalStyles]] as const;
it.each(sharedStyleBuilders)('keeps %s runtime URLs with owned utilities and no reset', async (name, build) => {
    const outputPath = path.join(directory, `${name}.css`);
    await build({outputPath});
    const source = await fs.readFile(outputPath, 'utf8');
    const basePath = path.resolve(`css/${name}.base.css`);
    const baseInput = await fs.readFile(basePath, 'utf8');
    const compiled = name === 'app-shell'
      ? await compileStartupBannerStyles('app-shell', baseInput, basePath, path.resolve('.'))
      : await compileModalPresentationStyles(baseInput, basePath, path.resolve('.'));
    const base = compiled.css.trimEnd();
    expect(source).toContain(base);
    const utilities = source.slice(source.indexOf(base) + base.length);
    expect(utilities).not.toContain('button,input,optgroup,select,textarea');
    const selectors: string[] = [];
    postcss.parse(utilities).walkRules(rule => { selectors.push(...rule.selectors); });
    expect(selectors).not.toContain('body');
    if (name === 'app-shell') {
      expect(base).not.toContain('#tour-tooltip');
      expect(utilities).toContain('#tour-tooltip');
      expect(utilities).toContain('(pointer:coarse)');
      expect(utilities).toContain(':focus-visible');
    } else {
      expect(base).not.toContain('.report-builder-modal');
      expect(utilities).toContain('[data-report-builder-view]');
      expect(utilities).toContain('[hidden]');
      expect(utilities).toContain('display:none!important');
      expect(utilities).toContain(':checked');
    }
    let hoverRules = 0;
    postcss.parse(utilities).walkRules(rule => {
      if (!rule.selector.includes(name === 'app-shell' ? 'tour-hover' : 'report-hover')) return;
      hoverRules++;
      expect(rule.selector).toContain(':hover');
      for (let parent: postcss.Rule['parent'] | postcss.Document = rule.parent; parent; parent = parent.parent) {
        if (parent.type === 'atrule' && parent.name === 'media') expect(parent.params).not.toMatch(/\(hover:\s*hover\)/);
      }
    });
    expect(hoverRules).toBeGreaterThan(0);
});
it.each(sharedStyleBuilders)('validates the complete generated %s stylesheet without writing', async (name, build) => {
  const outputPath = path.join(directory, `${name}.css`), source = await fs.readFile(`css/${name}.css`, 'utf8');
  await fs.writeFile(outputPath, source);
  await build({outputPath, check: true});
  expect(await fs.readFile(outputPath, 'utf8')).toBe(source);
});
it.each(sharedStyleBuilders)('rejects stale %s CSS without rewriting it', async (name, build) => {
  const outputPath = path.join(directory, `${name}.css`), source = await fs.readFile(`css/${name}.css`, 'utf8');
  await fs.writeFile(outputPath, source + '/* stale */');
  await expect(build({outputPath, check: true})).rejects.toThrow('CSS is stale');
  expect(await fs.readFile(outputPath, 'utf8')).toBe(source + '/* stale */');
});


it('retains shared import styles, scopes marker mapping and rejects stale lazy CSS', async () => {
  const outputPath = path.join(directory, 'import.css');
  await buildImportStyles({outputPath});
  const source = await fs.readFile(outputPath, 'utf8');
  const base = (await compileRemainingFeatureStyles('import',await fs.readFile('css/import.base.css','utf8'),path.resolve('css/import.base.css'),path.resolve('.'))).css.trimEnd();
  expect(source).toContain(base);
  expect(base).not.toContain('.import-marker-map-modal');
  expect(base).not.toContain('.import-preview-modal');
  const utilities = source.slice(source.indexOf(base) + base.length);
  const selectors: string[] = [];
  let hoverRules = 0;
  postcss.parse(utilities).walkRules(rule => {
    selectors.push(...rule.selectors);
    if (!rule.selector.includes('import-map-hover')) return;
    hoverRules++;
    expect(rule.selector).toContain(':hover');
    for (let parent: postcss.Rule['parent'] | postcss.Document = rule.parent; parent; parent = parent.parent) {
      if (parent.type === 'atrule' && parent.name === 'media') expect(parent.params).not.toMatch(/\(hover:\s*hover\)/);
    }
  });
  const owned = selectors.filter(selector => selector.includes('.gb\\:import-map'));
  expect(owned.length).toBeGreaterThan(40);
  expect(owned.every(selector => selector.includes('[data-import-marker-map-view]'))).toBe(true);
  const previewRules: postcss.Rule[] = [];
  postcss.parse(utilities).walkRules(rule => {
    if (rule.selector.includes('.gb\\:review-ui')) previewRules.push(rule);
  });
  expect(previewRules.length).toBeGreaterThan(150);
  expect(previewRules.every(rule => rule.selector.includes('[data-import-review-view]'))).toBe(true);
  for (const [property, value] of [['width', 'min(94vw,920px)'], ['max-width', '920px'], ['max-height', '90vh'], ['padding', '0']] as const) {
    expect(previewRules.some(rule => rule.selector.includes('#import-modal') && rule.nodes.some(node => node.type === 'decl' && node.prop === property && node.value.replace(/\s+/g, '') === value))).toBe(true);
  }

  expect(selectors).not.toContain('body');
  expect(utilities).not.toContain('button,input,optgroup,select,textarea');
  expect(utilities).toContain('768px');
  expect(hoverRules).toBeGreaterThan(0);
  await buildImportStyles({outputPath, check: true});
  await fs.writeFile(outputPath, source + '/* stale */');
  await expect(buildImportStyles({outputPath, check: true})).rejects.toThrow('Import CSS is stale');
  expect(await fs.readFile(outputPath, 'utf8')).toBe(source + '/* stale */');
});


it('compiles recommendation card utilities at the stable lazy URL without changing other owners', async () => {
  const outputPath = path.join(directory, 'recommendations.css');
  await buildRecommendationStyles({outputPath});
  const source = await fs.readFile(outputPath, 'utf8');
  const base = (await compileRemainingFeatureStyles('recommendations',await fs.readFile('css/recommendations.base.css','utf8'),path.resolve('css/recommendations.base.css'),path.resolve('.'))).css.trimEnd();
  expect(source).toContain(base);
  expect(base).not.toContain('.rec-next-card');
  expect(base).not.toContain('.recommendation-detail-modal .rec-section');
  const selectors: string[] = [];
  const utilities = source.slice(source.indexOf(base) + base.length);
  postcss.parse(utilities).walkRules(rule => { selectors.push(...rule.selectors); });
  const owned = selectors.filter(selector => selector.includes('.gb\\:rec-ui'));
  expect(owned.length).toBeGreaterThan(30);
  expect(owned.every(selector => selector.includes('[data-recommendation-cards-view]'))).toBe(true);
  const detailRules: postcss.Rule[] = [];
  postcss.parse(utilities).walkRules(rule => {
    if (rule.selector.startsWith('.recommendation-detail-modal ') && rule.selector.includes('.gb\\:tips-ui')) detailRules.push(rule);
  });
  expect(detailRules.length).toBeGreaterThanOrEqual(3);
  expect(detailRules.every(rule => rule.selector.includes('[data-tips-view]'))).toBe(true);
  for (const [property, value] of [['border-top', '0'], ['margin-top', '10px'], ['padding-top', '0']] as const) {
    expect(detailRules.some(rule => rule.nodes.some(node => node.type === 'decl' && node.prop === property && node.value === value))).toBe(true);
  }

  expect(selectors).not.toContain('body');
  expect(utilities).not.toContain('button,input,optgroup,select,textarea');
  await buildRecommendationStyles({outputPath, check: true});
  await fs.writeFile(outputPath, source + '/* stale */');
  await expect(buildRecommendationStyles({outputPath, check: true})).rejects.toThrow('Recommendations CSS is stale');
  expect(await fs.readFile(outputPath, 'utf8')).toBe(source + '/* stale */');
});

it('scopes both laboratory review and its body-level popup without a reset or desktop-only hover', async () => {
  const outputPath = path.join(directory, 'import-review.css');
  await buildImportStyles({outputPath});
  const source = await fs.readFile(outputPath, 'utf8');
  const base = (await compileRemainingFeatureStyles('import',await fs.readFile('css/import.base.css','utf8'),path.resolve('css/import.base.css'),path.resolve('.'))).css.trimEnd();
  const utilities = source.slice(source.indexOf(base) + base.length);
  const selectors: string[] = [];
  let hoverRules = 0;
  postcss.parse(utilities).walkRules(rule => {
    selectors.push(...rule.selectors);
    if (!rule.selector.includes('.gb\\:review-ui') || !rule.selector.includes(':hover')) return;
    hoverRules++;
    for (let parent: postcss.Rule['parent'] | postcss.Document = rule.parent; parent; parent = parent.parent) {
      if (parent.type === 'atrule' && parent.name === 'media') expect(parent.params).not.toMatch(/\(hover:\s*hover\)/);
    }
  });
  const owned = selectors.filter(selector => selector.includes('.gb\\:review-ui'));
  expect(owned.length).toBeGreaterThan(150);
  expect(owned.every(selector => selector.includes('[data-import-review-view]'))).toBe(true);
  expect(hoverRules).toBeGreaterThan(0);
  expect(utilities).toContain('768px');
  expect(selectors).not.toContain('body');
  expect(utilities).not.toContain('button,input,optgroup,select,textarea');
});

interface FrozenStyleBlock {
  file: string;
  css: string;
  atRules: {name: string; params: string}[];
}
interface StylePathRecord {
  selector: string;
  declarations: {property: string; value: string; important: boolean}[];
  atRules: {name: string; params: string}[];
}
function stylePathRecords(css: string, inheritedAtRules: FrozenStyleBlock['atRules'] = []): StylePathRecord[] {
  const records: StylePathRecord[] = [];
  postcss.parse(css).walkRules(rule => {
    const ancestry: FrozenStyleBlock['atRules'] = [];
    for (let parent: postcss.Rule['parent'] | postcss.Document = rule.parent; parent; parent = parent.parent) {
      if (parent.type === 'atrule') ancestry.unshift({name: parent.name, params: parent.params});
    }
    const declarations = rule.nodes.filter((node): node is postcss.Declaration => node.type === 'decl')
      .map(node => ({property: node.prop, value: node.value, important: !!node.important}));
    for (const selector of rule.selectors) records.push({selector, declarations, atRules: [...inheritedAtRules, ...ancestry]});
  });
  return records;
}

function decodedCssSelector(selector: string): string {
  return selector.replace(/\\([0-9a-f]{1,6}) ?|\\(.)/gi, (_match, hex: string | undefined, character: string | undefined) => hex ? String.fromCodePoint(parseInt(hex, 16)) : character!);
}
function normalizedCssValue(value: string, property: string): string {
  // CSS minification may express the same transition duration in seconds or
  // milliseconds. Preserve exact decimal/unit equivalence, scoped to this
  // property; other declaration units remain untouched.
  const durations = property === 'transition' ? value.replace(
    /(?<![\w.])([+-]?(?:\d+(?:\.\d*)?|\.\d+))(ms|s)\b/g,
    (_match, number: string, unit: string) => {
      const parts = number.split('.');
      let coefficient = BigInt(parts.join(''));
      let exponent = (unit === 's' ? 3 : 0) - (parts[1]?.length ?? 0);
      if (coefficient === 0n) return '0ms';
      while (coefficient % 10n === 0n) { coefficient /= 10n; exponent++; }
      return `${coefficient}e${exponent}ms`;
    },
  ) : value;
  return durations.replace(/\s+/g, '').replace(/(^|[^0-9])0\.(\d)/g, '$1.$2');
}
/** Every retired original declaration maps to a literal catalog utility and its emitted declaration. */
function verifySharedStyleMapping(original: StylePathRecord[], rules: postcss.Rule[]): void {
  for (const record of original) {
    const name = record.selector.match(/\.([a-z-]+)(?::[a-z-]+)?$/)![1]!;
    const phone = record.atRules.some(at => at.name === 'media' && at.params === '(max-width: 768px)');
    expect(record.atRules).toEqual(phone ? [{name: 'media', params: '(max-width: 768px)'}] : []);
    const state = record.selector.endsWith(':hover') ? 'hover' : record.selector.endsWith(':active') ? 'active' : record.selector.endsWith(':focus-visible') ? 'focus-visible' : null;
    const adjacent = record.selector.includes(' + ');
    for (const declaration of record.declarations) {
      // The native shorthand's four remaining inherited fields are expanded;
      // its size/weight/line-height are overwritten by later original records.
      const fields = declaration.property === 'font' && declaration.value === 'inherit'
        ? ['font-family','font-style','font-variant','font-stretch'].map(property => ({property, value: 'inherit'}))
        : name === 'cycle-icon-btn' && declaration.property === 'border'
          ? [{property: 'border-width', value: '1px'}, {property: 'border-style', value: 'solid'}, {property: 'border-color', value: 'var(--border)'}]
          : [{property: declaration.property, value: declaration.value}];
      for (const field of fields) {
        const wide = !phone && ((name === 'cycle-icon-btn' && ['min-width','min-height'].includes(field.property)) || (name === 'cycle-editor-section' && field.property === 'padding'));
        const candidates = cycleSharedUtilities(name).split(/\s+/).filter(token => {
          const content = token.slice(token.lastIndexOf(':[') + 2, -1), separator = content.indexOf(':');
          const property = content.slice(0, separator), value = content.slice(separator + 1).replace(/_/g, ' ');
          const tokenState = /\[&:hover(?:\]|:)/.test(token) ? 'hover' : token.includes('[&:active]') ? 'active' : token.includes('[&:focus-visible]') ? 'focus-visible' : null;
          return property === field.property && normalizedCssValue(value, field.property) === normalizedCssValue(field.value, field.property)
            && token.includes(':cycle-shared-phone:') === phone && token.includes(':cycle-shared-wide:') === wide
            && tokenState === state && token.includes('[.cycle-editor-section_+_&]') === adjacent;
        });
        expect(candidates, JSON.stringify({record, declaration, field})).toHaveLength(1);
        const token = candidates[0]!;
        const generated = rules.filter(rule => decodedCssSelector(rule.selector).includes('.' + token));
        expect(generated.length, token).toBeGreaterThan(0);
        expect(generated.some(rule => rule.nodes.some(node => node.type === 'decl' && node.prop === field.property && normalizedCssValue(node.value, field.property) === normalizedCssValue(field.value, field.property) && !!node.important === declaration.important)), token).toBe(true);
        for (const rule of generated) {
          const media: string[] = [];
          for (let parent: postcss.Rule['parent'] | postcss.Document = rule.parent; parent; parent = parent.parent) if (parent.type === 'atrule' && parent.name === 'media') media.unshift(parent.params.replace(/\s+/g, ''));
          expect(media, token).toEqual(phone ? ['(max-width:768px)'] : wide ? ['notalland(max-width:768px)'] : []);
          for (const node of rule.nodes) if (node.type === 'decl') expect(!!node.important, token).toBe(declaration.important);
        }
      }
    }
  }
}

it('composes Cycle overview, editor, import and exact original shared styles into owned utilities at cycle.css', async () => {
  const outputPath = path.join(directory, 'cycle.css');
  await buildCycleStyles({outputPath});
  const source = await fs.readFile(outputPath, 'utf8');
  const base = (await fs.readFile('css/cycle.base.css', 'utf8')).trimEnd();
  expect(source).toContain(base);
  expect(await fs.readFile('js/cycle-runtime.ts', 'utf8')).toContain("new URL('../css/cycle.css', import.meta.url)");
  const sharedSelectors = new Set([
    '.cycle-icon-btn', '.cycle-icon-btn:hover', '.cycle-icon-btn:active', '.cycle-icon-btn:focus-visible',
    '.period-symptom-tag', '.cycle-period-note', '.cycle-editor-section',
    '.cycle-editor-section + .cycle-editor-section', '.cycle-editor-section-title',
    '.cycle-delete-btn:hover', '.cycle-delete-btn',
  ]);
  const editorOriginal = JSON.parse(await fs.readFile('tests/fixtures/cycle-editor-original.json', 'utf8')) as {styleBlocks: FrozenStyleBlock[]};
  const retained = editorOriginal.styleBlocks.filter(block => block.file === 'css/cycle.css')
    .flatMap(block => stylePathRecords(block.css, block.atRules)).filter(record => sharedSelectors.has(record.selector));
  expect(retained).toHaveLength(14);
  // The editor freezes all 14 shared paths. The selective overview capture
  // freezes eight of those paths, preserving their complete declarations,
  // important flags and at-rule ancestry in original order.
  const overviewOriginal = JSON.parse(await fs.readFile('tests/fixtures/cycle-overview-original.json', 'utf8')) as {styleBlocks: FrozenStyleBlock[]};
  const overviewShared = overviewOriginal.styleBlocks.filter(block => block.file === 'css/cycle.css')
    .flatMap(block => stylePathRecords(block.css, block.atRules)).filter(record => sharedSelectors.has(record.selector));
  expect(overviewShared).toHaveLength(8);
  expect(overviewShared.map(({selector, atRules}) => ({selector, atRules}))).toEqual([
    {selector: '.cycle-icon-btn', atRules: []},
    {selector: '.cycle-icon-btn:hover', atRules: []},
    {selector: '.cycle-icon-btn:active', atRules: []},
    {selector: '.cycle-icon-btn:focus-visible', atRules: []},
    {selector: '.period-symptom-tag', atRules: []},
    {selector: '.period-symptom-tag', atRules: []},
    {selector: '.cycle-period-note', atRules: []},
    {selector: '.cycle-icon-btn', atRules: [{name: 'media', params: '(max-width: 768px)'}]},
  ]);
  expect(overviewShared).toEqual([0, 1, 2, 3, 4, 5, 6, 11].map(index => retained[index]!));
  expect(stylePathRecords(base)).toEqual([]);
  const retired = overviewOriginal.styleBlocks.filter(block => block.file === 'css/cycle.css')
    .flatMap(block => stylePathRecords(block.css, block.atRules)).filter(record => !sharedSelectors.has(record.selector));
  expect(retired).toHaveLength(82);
  const nativeSelectors = stylePathRecords(base).map(record => record.selector);
  for (const record of retired) expect(nativeSelectors).not.toContain(record.selector);

  const utilities = source.slice(source.indexOf(base) + base.length);
  const rules: postcss.Rule[] = [];
  postcss.parse(utilities).walkRules(rule => { rules.push(rule); });
  const selectors = rules.flatMap(rule => rule.selectors);
  verifySharedStyleMapping(retained, rules);
  const sharedScope = ':where([data-cycle-editor-view],[data-cycle-editor-view] *,[data-cycle-import-view],[data-cycle-import-view] *,[data-cycle-overview-view],[data-cycle-overview-view] *)';
  const shared = selectors.filter(selector => selector.includes('.gb\\:cycle-shared-ui\\:'));
  expect(shared.length).toBeGreaterThan(40);
  expect(shared.every(selector => selector.split(sharedScope).length === 2)).toBe(true);
  expect(shared.some(selector => selector.startsWith('.cycle-editor-section+') && selector.includes('[margin-top\\:14px\\]'))).toBe(true);
  const ordinaryHover = shared.filter(selector => /(?<!\\):hover/.test(selector) && selector.includes(':not(:where(.cycle-delete-btn))'));
  expect(ordinaryHover).toHaveLength(3); // Color mix includes its guarded fallback rule.
  expect(shared.some(selector => decodedCssSelector(selector).includes('[&:hover]:[background:var(--bg-hover)]'))).toBe(true);
  expect(shared.some(selector => decodedCssSelector(selector).includes('[&:hover]:[border-color:color-mix(in_srgb,_var(--red)_55%,_var(--border))]'))).toBe(true);
  for (const [prefix, marker] of [
    ['cycle-overview-ui', 'data-cycle-overview-view'],
    ['cycle-editor-ui', 'data-cycle-editor-view'],
    ['cycle-import-ui', 'data-cycle-import-view'],
  ] as const) {
    const owned = selectors.filter(selector => selector.includes(`.gb\\:${prefix}\\:`));
    expect(owned.length).toBeGreaterThan(100);
    expect(owned.every(selector => selector.includes(`:where([${marker}],[${marker}] *)`))).toBe(true);
  }
  const modalRoot = selectors.filter(selector => selector.includes('.gb\\:cycle-editor-root\\:'));
  expect(modalRoot.length).toBeGreaterThan(10);
  expect(modalRoot.every(selector => selector.includes('.cycle-modal'))).toBe(true);
  for (const prefix of ['cycle-overview-ui', 'cycle-editor-ui', 'cycle-import-ui', 'cycle-shared-ui']) {
    const hover = rules.filter(rule => rule.selector.includes(`.gb\\:${prefix}\\:`) && /(?<!\\):hover/.test(rule.selector) && !rule.selector.includes(':not(:where(:hover))'));
    expect(hover.length).toBeGreaterThan(0);
    for (const rule of hover) {
      for (let parent: postcss.Rule['parent'] | postcss.Document = rule.parent; parent; parent = parent.parent) {
        if (parent.type === 'atrule' && parent.name === 'media') expect(parent.params).not.toMatch(/\(hover:\s*hover\)/);
      }
    }
  }
  expect(selectors).not.toContain('body');
  expect(utilities).not.toContain('button,input,optgroup,select,textarea');
  expect(utilities).not.toContain('!important');
  expect(utilities).toContain('max-width:768px');
  expect(utilities).toContain(':focus-visible');
  expect(utilities).toContain('-webkit-line-clamp:2');
  expect(selectors.some(selector => selector.startsWith('.dashboard-widget-body>') && selector.includes('.gb\\:cycle-overview-ui\\:') && selector.endsWith(':first-child'))).toBe(true);
  await buildCycleStyles({outputPath, check: true});
  const rebuiltPath = path.join(directory, 'cycle-rebuilt.css');
  await buildCycleStyles({outputPath: rebuiltPath});
  expect(await fs.readFile(rebuiltPath, 'utf8')).toBe(source);
  await fs.writeFile(outputPath, source + '/* stale */');
  await expect(buildCycleStyles({outputPath, check: true})).rejects.toThrow('Cycle CSS is stale');
  expect(await fs.readFile(outputPath, 'utf8')).toBe(source + '/* stale */');
});
