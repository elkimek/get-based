import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import postcss from 'postcss';
import { buildStyles, buildProtectionStyles } from '../scripts/build-styles.mjs';

let directory: string;
let outputPath: string;
let protectionOutputPath: string;
beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-style-test-'));
  outputPath = path.join(directory, 'settings.css');
  await buildStyles({ outputPath });
  protectionOutputPath = path.join(directory,'data-protection.css');
  await buildProtectionStyles({ outputPath:protectionOutputPath });
});
afterAll(async () => { await fs.rm(directory, { recursive: true, force: true }); });

it('preserves legacy Settings CSS and scopes generated utilities without a reset', async () => {
  const source = await fs.readFile(outputPath, 'utf8');
  const base = (await fs.readFile('css/settings.base.css', 'utf8')).trimEnd();
  expect(source).toContain(base);
  const utilities = source.slice(source.indexOf(base) + base.length);
  const selectors: string[] = [];
  postcss.parse(utilities).walkRules(rule => { selectors.push(rule.selector); });
  const pilot = selectors.filter(selector => selector.includes('.gb\\:display'));
  expect(pilot.length).toBeGreaterThan(30);
  expect(pilot.every(selector => selector.startsWith('#settings-tab-display '))).toBe(true);
  const sync = selectors.filter(selector => selector.includes('.gb\\:sync\\:'));
  expect(sync.length).toBeGreaterThan(30);
  expect(sync.every(selector => selector.startsWith('#sync-section '))).toBe(true);
  const dialogs = selectors.filter(selector => selector.includes('.gb\\:sync-dialog'));
  expect(dialogs.length).toBeGreaterThan(30);
  expect(dialogs.every(selector => selector.startsWith(':is(#sync-setup-overlay,#sync-restore-overlay) '))).toBe(true);
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
  const selectors: string[] = []; postcss.parse(source.slice(source.indexOf(base)+base.length)).walkRules(rule=>{selectors.push(rule.selector);});
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
