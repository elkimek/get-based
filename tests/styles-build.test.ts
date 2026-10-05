import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import postcss from 'postcss';
import { buildStyles } from '../scripts/build-styles.mjs';

let directory: string;
let outputPath: string;
beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-style-test-'));
  outputPath = path.join(directory, 'settings.css');
  await buildStyles({ outputPath });
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
