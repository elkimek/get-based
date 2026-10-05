type QueriedModuleOperations = {_dedupeQueriesForTest: typeof import('../../js/lens.js')._dedupeQueriesForTest; _fuseChunksRRFForTest: typeof import('../../js/lens.js')._fuseChunksRRFForTest; _resetRewriteCache: typeof import('../../js/lens.js')._resetRewriteCache; saveLensConfig: typeof import('../../js/lens.js').saveLensConfig; handleLibraryNew: typeof import('../../js/lens.js').handleLibraryNew};

import type {Page} from '@playwright/test';
import { routeHtml, routeJavaScript } from '../helpers/browser-static-routes.js';
import { createModuleUrl } from '../helpers/browser-module-url.js';
import { expect, test } from './coverage-fixture.js';

const moduleUrl = createModuleUrl('lensHelperCoverage');

async function openIsolatedLensHelperPage(page: Page) {
  await routeHtml(page, '**/lens-helper-browser-coverage', `<!doctype html>
      <html>
        <body>
          <div id="notification-container"></div>
        </body>
      </html>`, 200);
  await routeJavaScript(page, '**/js/lens-local.js*', `
      export async function openLocalLens() {
        throw new Error('local lens unavailable for coverage');
      }
    `, 200);
  await page.goto('/lens-helper-browser-coverage', { waitUntil: 'load' });
}

test('lens browser coverage exercises helper exports and fallback library prompt', async ({ page }) => {
  await openIsolatedLensHelperPage(page);

  const results = await page.evaluate(async ({ lensUrl }) => {
    const lens = (await import(lensUrl) as unknown) as QueriedModuleOperations;
    const outcomes: Record<string, boolean> = {};
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, key == null ? null : localStorage.getItem(key)];
    }));
    const waitFor = async (predicate: () => boolean, label: string) => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(`Timed out waiting for ${label}`);
    };

    try {
      const deduped = lens._dedupeQueriesForTest([
        ' Black Seed Oil insulin ',
        'black seed oil insulin',
        '',
        null,
        'Nigella Sativa',
      ]);
      outcomes.dedupeQueriesDropsEmptyAndCaseDuplicates =
        deduped.length === 2
        && deduped[0] === 'Black Seed Oil insulin'
        && deduped[1] === 'Nigella Sativa';

      const chunkA = { source: 'doc-a.md', text: 'alpha' };
      const chunkA2 = { source: 'doc-a.md', text: 'alpha' };
      const chunkB = { source: 'doc-b.md', text: 'beta' };
      const fused = lens._fuseChunksRRFForTest([
        [chunkA, chunkB],
        [chunkA2],
        [null, { source: 'bad' }, { text: 42 }],
      ], 3);
      outcomes.fuseChunksRanksDedupesAndSkipsMalformed =
        fused.length === 2
        && fused[0]!.source === 'doc-a.md'
        && fused[0]!.text === 'alpha'
        && fused[1] === chunkB;

      lens._resetRewriteCache();
      outcomes.resetRewriteCacheCallable = true;

      lens.saveLensConfig({ backend: 'in-browser', name: '', enabled: true });
      const createPromise = lens.handleLibraryNew();
      await waitFor(() => !!document.getElementById('prompt-dialog-input'), 'fallback library prompt');
      const input = document.getElementById('prompt-dialog-input');
      const ok = document.getElementById('prompt-ok');
      if (!(input instanceof HTMLInputElement) || !(ok instanceof HTMLButtonElement)) {
        throw new Error('library prompt controls missing');
      }
      input.value = 'Browser Prompt Library';
      ok.click();
      await createPromise;
      outcomes.plainNamePromptFallbackAttemptsLibraryCreate =
        !document.getElementById('prompt-dialog-overlay')?.classList.contains('show')
        && Array.from(document.querySelectorAll('.notification-toast'))
          .some(el => (el.textContent || '').includes("Couldn't create library"));
    } finally {
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
      document.getElementById('prompt-dialog-overlay')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
    }

    return outcomes;
  }, {
    lensUrl: moduleUrl('/js/lens.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
