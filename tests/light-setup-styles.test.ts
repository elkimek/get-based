import {compileLightLayoutStyles} from '../scripts/light-layout-style-ownership.mjs';
import{createHash}from'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import postcss from 'postcss';
import { expect, it } from 'vitest';
import { buildLightSetupStyles } from '../scripts/build-styles.mjs';
// Real Tailwind compilation includes whole-runtime TS/Svelte qualification.
// CI coverage takes 5-7s per independent build; retain a bounded integration
// deadline without changing any stylesheet, stale-output or resource assertion.
const LIGHT_SETUP_INTEGRATION_TIMEOUT_MS = 30_000;
it('retains the lazy stylesheet URL, valid numeric state selectors and scoped utilities without Preflight', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-light-setup-styles-'));
  try {
    const outputPath = path.join(directory, 'light-setup.css'); await buildLightSetupStyles({ outputPath });
    const source = await fs.readFile(outputPath, 'utf8'); const base = (await compileLightLayoutStyles('setup',await fs.readFile('css/light-setup.base.css','utf8'),path.resolve('css/light-setup.base.css'),path.resolve('.'))).css.trimEnd();
    expect(source).toContain(base); expect(base).not.toContain('.ctx-skin-face'); expect(base).not.toContain('.light-setup-choice');
    const selectors: string[] = []; postcss.parse(source.slice(source.indexOf(base) + base.length)).walkRules(rule => { selectors.push(...rule.selectors); });
    const owned = selectors.filter(selector => selector.includes('.gb-ls-'));
    expect(owned.length).toBeGreaterThan(150); expect(owned.every(selector => selector.includes(':is([data-light-setup-presentation],[data-light-setup-presentation] *)'))).toBe(true);
    expect(selectors).not.toContain('body'); expect(selectors).not.toContain('button,input,optgroup,select,textarea');
    // The original reduced-motion contract fully disables these effects, even
    // when the shared animation safety rule supplies an important duration.
    const important: postcss.Declaration[] = [];
    postcss.parse(source).walkDecls(declaration => { if (declaration.important) important.push(declaration); });
    const setupMotion = important.filter(declaration => declaration.parent?.toString().includes('gb-ls-'));
    const onboardingMotion = important.filter(declaration => declaration.parent?.toString().includes('gb\\:onboarding-ai\\:'));
    expect(setupMotion).toHaveLength(7); expect(onboardingMotion).toHaveLength(3);
    expect(important).toHaveLength(setupMotion.length + onboardingMotion.length);
    for (const declaration of important) {
      expect(['transition', 'animation', 'transform']).toContain(declaration.prop);
      expect(declaration.value).toBe('none');
      expect(declaration.parent?.type).toBe('rule');
      expect(declaration.parent?.toString()).toMatch(/(?:gb-ls-|gb\\:onboarding-ai\\:)/);
      let ancestor: postcss.Node | undefined = declaration.parent;
      while (ancestor && ancestor.type !== 'atrule') ancestor = ancestor.parent;
      expect(ancestor?.toString()).toContain('prefers-reduced-motion:reduce');
    }
    const onboarding = selectors.filter(selector => selector.includes('.gb\\:onboarding-ai\\:'));
    expect(onboarding.length).toBeGreaterThan(40);
    expect(onboarding.every(selector => selector.includes(':is([data-light-onboarding-ai],[data-light-onboarding-ai] *)'))).toBe(true);
    expect(base).not.toContain('.light-setup-ai-');
    const nativeAI: string[] = [];
    const nativeLight = (await compileLightLayoutStyles('page',await fs.readFile('css/light-sun.base.css','utf8'),path.resolve('css/light-sun.base.css'),path.resolve('.'))).css;
    postcss.parse(nativeLight).walkRules(rule => {
      nativeAI.push(...rule.selectors.filter(selector => /\.sun-(?:session-ai|detail-ai)/.test(selector)));
    });
    // Accepted native AI styles had already retired before this family migration. Preserve the whole original current CSS bytes, rather than a stale positive selector count.
    expect(createHash('sha256').update(nativeLight).digest('hex')).toBe('82bb6eab1ee986e193e9a4e6eb5d5a0436260f9bf1250d3c623656ef2a477264');expect(nativeAI).toHaveLength(0);
    expect(nativeAI.every(selector => selector.includes(':not(:where([data-light-onboarding-ai], [data-light-onboarding-ai] *))'))).toBe(true);
    expect(source).toContain('[data-tier="2"]'); expect(source).toContain('[data-idx="5"]');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}, LIGHT_SETUP_INTEGRATION_TIMEOUT_MS);

for (const stale of [false, true]) it(`qualifies Light setup ${stale ? 'stale rejection' : 'complete CSS equality'} without rewriting output`, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-light-setup-check-'));
  try {
    const outputPath = path.join(directory, 'light-setup.css');
    const source = await fs.readFile('css/light-setup.css', 'utf8') + (stale ? '/* stale */' : '');
    await fs.writeFile(outputPath, source);
    if (stale) await expect(buildLightSetupStyles({ outputPath, check: true })).rejects.toThrow('Light setup CSS is stale');
    else await buildLightSetupStyles({ outputPath, check: true });
    expect(await fs.readFile(outputPath, 'utf8')).toBe(source);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}, LIGHT_SETUP_INTEGRATION_TIMEOUT_MS);
