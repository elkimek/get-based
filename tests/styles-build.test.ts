import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import postcss from 'postcss';
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

it('preserves legacy Settings CSS and scopes generated utilities without a reset', async () => {
  const source = await fs.readFile(outputPath, 'utf8');
  const base = (await fs.readFile('css/settings.base.css', 'utf8')).trimEnd();
  expect(source).toContain(base);
  const utilities = source.slice(source.indexOf(base) + base.length);
  const selectors: string[] = [];
  postcss.parse(utilities).walkRules(rule => { selectors.push(...rule.selectors); });
  const pilot = selectors.filter(selector => selector.includes('.gb\\:display'));
  expect(pilot.length).toBeGreaterThan(30);
  expect(pilot.every(selector => selector.startsWith('#settings-tab-display '))).toBe(true);
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

it('rebuilds deterministically and rejects stale CSS without overwriting it', async () => {
  const source = await fs.readFile(outputPath, 'utf8');
  await buildStyles({ outputPath, check: true });
  await fs.writeFile(outputPath, source + '/* stale */');
  await expect(buildStyles({ outputPath, check: true })).rejects.toThrow('Settings CSS is stale');
  expect(await fs.readFile(outputPath, 'utf8')).toBe(source + '/* stale */');
});


it('preserves PII base styles and scopes protection dialog utilities without a reset', async () => {
  const source = await fs.readFile(protectionOutputPath,'utf8');
  const base = (await fs.readFile('css/data-protection.base.css','utf8')).trimEnd();
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
  const base = (await fs.readFile('css/chat-panel-open.base.css', 'utf8')).trimEnd();
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


it('keeps app-shell and modal runtime URLs with owned utilities and no reset', async () => {
  for (const [name, build] of [['app-shell', buildAppShellStyles], ['modal-shared', buildModalStyles]] as const) {
    const outputPath = path.join(directory, `${name}.css`);
    await build({outputPath});
    const source = await fs.readFile(outputPath, 'utf8');
    const base = (await fs.readFile(`css/${name}.base.css`, 'utf8')).trimEnd();
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
    await build({outputPath, check: true});
    await fs.writeFile(outputPath, source + '/* stale */');
    await expect(build({outputPath, check: true})).rejects.toThrow('CSS is stale');
    expect(await fs.readFile(outputPath, 'utf8')).toBe(source + '/* stale */');
  }
});


it('retains shared import styles, scopes marker mapping and rejects stale lazy CSS', async () => {
  const outputPath = path.join(directory, 'import.css');
  await buildImportStyles({outputPath});
  const source = await fs.readFile(outputPath, 'utf8');
  const base = (await fs.readFile('css/import.base.css', 'utf8')).trimEnd();
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
  const base = (await fs.readFile('css/recommendations.base.css', 'utf8')).trimEnd();
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
  const base = (await fs.readFile('css/import.base.css', 'utf8')).trimEnd();
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

it('composes Cycle overview, editor and import at cycle.css while retaining exact shared native styles', async () => {
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
  expect(stylePathRecords(base)).toEqual(retained);
  const overviewOriginal = JSON.parse(await fs.readFile('tests/fixtures/cycle-overview-original.json', 'utf8')) as {styleBlocks: FrozenStyleBlock[]};
  const retired = overviewOriginal.styleBlocks.filter(block => block.file === 'css/cycle.css')
    .flatMap(block => stylePathRecords(block.css, block.atRules)).filter(record => !sharedSelectors.has(record.selector));
  expect(retired).toHaveLength(82);
  const nativeSelectors = stylePathRecords(base).map(record => record.selector);
  for (const record of retired) expect(nativeSelectors).not.toContain(record.selector);

  const utilities = source.slice(source.indexOf(base) + base.length);
  const rules: postcss.Rule[] = [];
  postcss.parse(utilities).walkRules(rule => { rules.push(rule); });
  const selectors = rules.flatMap(rule => rule.selectors);
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
  for (const prefix of ['cycle-overview-ui', 'cycle-editor-ui', 'cycle-import-ui']) {
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
