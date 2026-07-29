import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildProduction } from '../scripts/build-production.mjs';

let outputRoot;
let summary;
const appShellBudget = JSON.parse(
  await fs.readFile('scripts/app-shell-budget.json', 'utf8'),
);

beforeAll(async () => {
  outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-production-build-test-'));
  summary = await buildProduction({ outputRoot });
}, 20_000);

afterAll(async () => {
  if (outputRoot) await fs.rm(outputRoot, { recursive: true, force: true });
});

describe('production startup build', () => {
  it('collapses the static startup graph into one bundle plus its tiny runtime', () => {
    expect(summary.startupJavaScriptFiles).toBe(2);
    expect(summary.startupDecodedBytes).toBeLessThanOrEqual(1_100_000);
    expect(summary.outputJavaScriptFiles).toBeLessThanOrEqual(140);
    expect(summary.outputDecodedBytes).toBeLessThanOrEqual(4_500_000);
    expect(summary.lazyJavaScriptFiles).toBeGreaterThan(100);
  });

  it('points production HTML at the hashed entry while preserving the early welcome paint', async () => {
    const index = await fs.readFile(path.join(outputRoot, 'index.html'), 'utf8');
    expect(index).toContain(`<script type="module" src="js/${summary.entryFile}"></script>`);
    expect(index).toContain('<link rel="modulepreload" href="js/bundle-rolldown-runtime-');
    expect(index).not.toContain('<script type="module" src="js/main.js"></script>');
    expect(index).toContain('data-prerendered-welcome');
    expect(index).toContain('data-dashboard-welcome-action="open-chat"');
    expect(index).toContain('Chat starts with the basics');
    expect(index).not.toContain('<script src="js/legal-consent-bootstrap.js"></script>');
    expect(index).toContain("overlay.dataset.legalConsentBootstrapBound = 'true'");
  });

  it('pre-caches every generated lazy chunk for installed offline use', async () => {
    const serviceWorker = await fs.readFile(path.join(outputRoot, 'service-worker.js'), 'utf8');
    const serviceWorkerRuntime = await fs.readFile(
      path.join(outputRoot, 'service-worker-runtime.js'),
      'utf8',
    );
    const generatedFiles = (await fs.readdir(path.join(outputRoot, 'js')))
      .filter(fileName => /^bundle-.*\.js$/.test(fileName));

    expect(generatedFiles).toHaveLength(summary.outputJavaScriptFiles);
    for (const fileName of generatedFiles) {
      expect(serviceWorker).toContain(`'/js/${fileName}',`);
    }
    expect(serviceWorker).not.toContain("'/js/main.js',");
    expect(serviceWorker).not.toContain("'/js/views.js',");
    expect(serviceWorker).not.toContain("'/js/legal-consent-bootstrap.js',");
    expect(serviceWorker).toContain("'/js/service-worker-update.js',");
    expect(serviceWorker).toContain("'/js/lens-local-worker.js',");
    expect(serviceWorker).toContain("'/js/lens-local-utils.js',");
    expect(serviceWorker).toContain("'/js/lens-local-store.js',");
    expect(serviceWorker).toContain("'/service-worker-runtime.js',");
    expect(serviceWorkerRuntime).toContain('installServiceWorkerRuntime');
    expect(summary.appShellResources).toBeLessThanOrEqual(
      appShellBudget.maximums.resources,
    );
    expect(summary.appShellDecodedBytes).toBeLessThanOrEqual(
      appShellBudget.maximums.decodedBytes,
    );
  });

  it('keeps the cold Latin body font from repainting the mobile LCP text', async () => {
    const fonts = await fs.readFile('vendor/fonts/fonts.css', 'utf8');
    expect(fonts).toMatch(
      /font-weight: 400;\s+font-display: optional;\s+src: url\('\.\/inter-400-7\.woff2'\)/,
    );
  });
});
