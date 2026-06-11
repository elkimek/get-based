import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?lensHelperCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openIsolatedLensHelperPage(page) {
  await page.route('**/lens-helper-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html>
      <html>
        <body>
          <div id="notification-container"></div>
        </body>
      </html>`,
  }));
  await page.route('**/js/lens-local.js*', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: `
      export async function openLocalLens() {
        throw new Error('local lens unavailable for coverage');
      }
    `,
  }));
  await page.goto('/lens-helper-browser-coverage', { waitUntil: 'load' });
}

test('lens browser coverage exercises helper exports and fallback library prompt', async ({ page }) => {
  await openIsolatedLensHelperPage(page);

  const results = await page.evaluate(async ({ lensUrl }) => {
    const lens = await import(lensUrl);
    const outcomes = {};
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, key == null ? null : localStorage.getItem(key)];
    }));
    const waitFor = async (predicate, label) => {
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
        && fused[0].source === 'doc-a.md'
        && fused[0].text === 'alpha'
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
