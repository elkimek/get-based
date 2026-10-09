import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import postcss from 'postcss';
import { buildStyles, buildProtectionStyles, buildChatStyles, buildAppShellStyles, buildModalStyles, buildImportStyles } from '../scripts/build-styles.mjs';

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
  expect(base).toContain('.import-preview-modal');
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
  expect(selectors).not.toContain('body');
  expect(utilities).not.toContain('button,input,optgroup,select,textarea');
  expect(utilities).toContain('768px');
  expect(hoverRules).toBeGreaterThan(0);
  await buildImportStyles({outputPath, check: true});
  await fs.writeFile(outputPath, source + '/* stale */');
  await expect(buildImportStyles({outputPath, check: true})).rejects.toThrow('Import CSS is stale');
  expect(await fs.readFile(outputPath, 'utf8')).toBe(source + '/* stale */');
});
