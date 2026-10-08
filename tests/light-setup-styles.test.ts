import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import postcss from 'postcss';
import { expect, it } from 'vitest';
import { buildLightSetupStyles } from '../scripts/build-styles.mjs';
it('retains the lazy stylesheet URL, valid numeric state selectors and scoped utilities without Preflight', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-light-setup-styles-'));
  try {
    const outputPath = path.join(directory, 'light-setup.css'); await buildLightSetupStyles({ outputPath });
    const source = await fs.readFile(outputPath, 'utf8'); const base = (await fs.readFile('css/light-setup.base.css', 'utf8')).trimEnd();
    expect(source).toContain(base); expect(base).not.toContain('.ctx-skin-face'); expect(base).not.toContain('.light-setup-choice');
    const selectors: string[] = []; postcss.parse(source.slice(source.indexOf(base) + base.length)).walkRules(rule => { selectors.push(...rule.selectors); });
    const owned = selectors.filter(selector => selector.includes('.gb\\:light-setup\\:'));
    expect(owned.length).toBeGreaterThan(150); expect(owned.every(selector => selector.includes(':is([data-light-setup-presentation],[data-light-setup-presentation] *)'))).toBe(true);
    expect(selectors).not.toContain('body'); expect(selectors).not.toContain('button,input,optgroup,select,textarea');
    // The original reduced-motion contract fully disables these effects, even
    // when the shared animation safety rule supplies an important duration.
    const important: postcss.Declaration[] = [];
    postcss.parse(source).walkDecls(declaration => { if (declaration.important) important.push(declaration); });
    expect(important).toHaveLength(7);
    for (const declaration of important) {
      expect(['transition', 'animation', 'transform']).toContain(declaration.prop);
      expect(declaration.value).toBe('none');
      expect(declaration.parent?.type).toBe('rule');
      expect(declaration.parent?.toString()).toContain('gb\\:light-setup\\:');
      let ancestor: postcss.Node | undefined = declaration.parent;
      while (ancestor && ancestor.type !== 'atrule') ancestor = ancestor.parent;
      expect(ancestor?.toString()).toContain('prefers-reduced-motion:reduce');
    }
    expect(source).toContain('[data-tier="2"]'); expect(source).toContain('[data-idx="5"]');
    await buildLightSetupStyles({ outputPath, check: true }); await fs.writeFile(outputPath, source + '/* stale */');
    await expect(buildLightSetupStyles({ outputPath, check: true })).rejects.toThrow('Light setup CSS is stale');
    expect(await fs.readFile(outputPath, 'utf8')).toBe(source + '/* stale */');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
