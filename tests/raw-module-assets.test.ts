import fs from 'node:fs/promises';
import { expect, it } from 'vitest';
import { collectRawModuleAssets } from '../scripts/raw-module-assets.mjs';
import { productionRawModuleAssets, pruneSourceModuleAppShell } from '../scripts/build-production.mjs';
import { inlineServiceWorkerAssets } from '../scripts/service-worker-source.js';

it('retains recursive runtime imports, exports and literal lazy imports through cycles', async () => {
  const modules = new Map([
    ['/js/worker.js', `import './shared.js'; export { answer } from './export.js'; import('./lazy.js?retry=1'); import('https://cdn.test/model.js'); // import './comment.js'`],
    ['/js/shared.js', `import './worker.js'; import '../shared/deep.mjs'; const text = "import './text.js'";`],
    ['/js/export.js', 'export const answer = 42;'], ['/js/lazy.js', 'export {};'], ['/shared/deep.mjs', 'export {};'],
  ]);
  const reads: string[] = [];
  const result = await collectRawModuleAssets(new Set(['/js/worker.js']), async url => { reads.push(url); if (!modules.has(url)) throw new Error(url); return modules.get(url)!; });
  expect([...result].sort()).toEqual([...modules.keys()].sort());
  expect(reads).toHaveLength(modules.size);
});
it('rejects missing dependencies and unsupported local import types', async () => {
  await expect(collectRawModuleAssets(new Set(['/js/worker.js']), async url => { if (url.endsWith('missing.js')) throw new Error('Missing emitted module'); return `import './missing.js';`; })).rejects.toThrow('Missing emitted module');
  await expect(collectRawModuleAssets(new Set(['/js/worker.js']), async () => `import './data.json';`)).rejects.toThrow('not JavaScript');
});
it('retains the actual Knowledge Base and voice worker graph in the pruned production shell', async () => {
  const assets = await productionRawModuleAssets();
  for (const file of ['lens-local-worker', 'lens-local-utils', 'lens-local-store', 'lens-local-embedder-config', 'lens-local-ingest', 'lens-local-library-registry', 'caught-error', 'unique-id', 'voice-local-stt-worker', 'voice-local-tts-worker', 'voice-model-catalog']) expect(assets.has(`/js/${file}.js`)).toBe(true);
  const worker = inlineServiceWorkerAssets(await fs.readFile('service-worker.js', 'utf8'), await fs.readFile('service-worker-assets.js', 'utf8'));
  const pruned = pruneSourceModuleAppShell(worker, assets);
  for (const url of assets) expect(pruned).toContain(`'${url}'`);
  expect(pruned).not.toContain("'/js/main.js'");
  expect(() => pruneSourceModuleAppShell(worker.replace("'/js/caught-error.js',", ''), assets)).toThrow('missing from APP_SHELL');
});
