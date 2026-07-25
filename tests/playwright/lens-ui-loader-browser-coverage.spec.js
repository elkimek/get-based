import { expect, test } from './coverage-fixture.js';

const facadeUrl = () => `/js/lens.js?uiLoaderCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
const syntheticLensUi = `
  const record = (name, ...args) => {
    window.__lensUiLoaderCalls ||= [];
    window.__lensUiLoaderCalls.push([name, ...args]);
  };
  export function createLensKnowledgeBaseUi(deps) {
    record('create');
    deps.recordLocalLensStats({
      documents: [{ source: 'notes.md' }],
      total_chunks: 2,
    });
    return {
      renderCustomLensSection() {
        record('renderCustomLensSection');
        return 'lens controls';
      },
      openKnowledgeBaseModal() {
        record('openKnowledgeBaseModal');
        return 'opened';
      },
      closeKnowledgeBaseModal() {
        record('closeKnowledgeBaseModal');
        return 'closed';
      },
      handleSaveLensConfig() { return 'saved'; },
      handleLensBackendChange(backend) { return backend; },
      handleLocalLensDeleteDoc(source) { return source; },
      handleLocalLensClear() { return 'cleared'; },
      handleLibraryActivate(id) { return id; },
      handleLibraryNew() { return 'new'; },
      handleLibraryRename() { return 'renamed'; },
      handleLibraryDelete() { return 'deleted'; },
      handleToggleLens(checked) { return checked; },
      handleClearLensCache() { return 'cache-cleared'; },
      handleRemoveLens() { return 'removed'; },
    };
  }
`;

test.beforeEach(async ({ page }) => {
  await page.route('**/lens-ui-loader-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><div id="notification-container"></div></body></html>',
  }));
  await page.goto('/lens-ui-loader-coverage');
});

test('Knowledge Base UI stays cold, single-flights, and enriches the core summary after loading', async ({ page }) => {
  const implementationRequests = [];
  await page.route('**/js/lens-knowledge-base-ui.js*', async route => {
    implementationRequests.push(route.request().url());
    await new Promise(resolve => setTimeout(resolve, 25));
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticLensUi,
    });
  });

  const outcomes = await page.evaluate(async url => {
    localStorage.setItem('labcharts-lens-config', JSON.stringify({
      name: 'Local Notes',
      enabled: true,
      backend: 'in-browser',
      multiQuery: true,
    }));
    localStorage.setItem('labcharts-lens-local-count', '2');
    const facade = await import(url);
    const cold = !facade.isLensKnowledgeBaseUiLoaded();
    const coldSummary = facade.getLensSummary();
    const coldClose = facade.closeKnowledgeBaseModal();
    const section = document.createElement('section');
    section.id = 'custom-lens-section';
    document.body.appendChild(section);
    section.innerHTML = facade.renderCustomLensSection();
    const coldMarkup = section.textContent;
    const first = facade.loadLensKnowledgeBaseUi();
    const second = facade.loadLensKnowledgeBaseUi();
    const sharedPromise = first === second;
    await Promise.all([first, second]);
    const warmSummary = facade.getLensSummary();
    return {
      cold,
      coldClose,
      coldDocCount: coldSummary.docCount,
      coldMarkup,
      sharedPromise,
      loaded: facade.isLensKnowledgeBaseUiLoaded(),
      warmDocCount: warmSummary.docCount,
      warmChunkCount: warmSummary.chunkCount,
      hydratedMarkup: section.textContent,
      markup: facade.renderCustomLensSection(),
      opened: facade.openKnowledgeBaseModal(),
      closed: facade.closeKnowledgeBaseModal(),
      saved: facade.handleSaveLensConfig(),
      backend: facade.handleLensBackendChange('external-server'),
      deletedDoc: facade.handleLocalLensDeleteDoc('notes.md'),
      clearedLocal: facade.handleLocalLensClear(),
      activated: facade.handleLibraryActivate('library-2'),
      created: facade.handleLibraryNew(),
      renamed: facade.handleLibraryRename(),
      deleted: facade.handleLibraryDelete(),
      toggled: facade.handleToggleLens(true),
      cacheCleared: facade.handleClearLensCache(),
      removed: facade.handleRemoveLens(),
      calls: window.__lensUiLoaderCalls || [],
    };
  }, facadeUrl());

  expect(implementationRequests).toHaveLength(1);
  expect(outcomes).toEqual({
    cold: true,
    coldClose: undefined,
    coldDocCount: null,
    coldMarkup: 'Loading Knowledge Base controls…',
    sharedPromise: true,
    loaded: true,
    warmDocCount: 1,
    warmChunkCount: 2,
    hydratedMarkup: 'lens controls',
    markup: 'lens controls',
    opened: 'opened',
    closed: 'closed',
    saved: 'saved',
    backend: 'external-server',
    deletedDoc: 'notes.md',
    clearedLocal: 'cleared',
    activated: 'library-2',
    created: 'new',
    renamed: 'renamed',
    deleted: 'deleted',
    toggled: true,
    cacheCleared: 'cache-cleared',
    removed: 'removed',
    calls: [
      ['create'],
      ['renderCustomLensSection'],
      ['renderCustomLensSection'],
      ['openKnowledgeBaseModal'],
      ['closeKnowledgeBaseModal'],
    ],
  });
});

test('Knowledge Base UI retries with a fixed URL and reports the first failure', async ({ page }) => {
  const implementationRequests = [];
  await page.route('**/js/lens-knowledge-base-ui.js*', async route => {
    const url = route.request().url();
    implementationRequests.push(url);
    if (!url.includes('lazy-retry=1')) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      contentType: 'text/javascript',
      body: syntheticLensUi,
    });
  });

  const outcomes = await page.evaluate(async url => {
    const facade = await import(url);
    const first = await facade.openKnowledgeBaseModal();
    const notification = document.querySelector('#notification-container')?.textContent || '';
    const second = await facade.openKnowledgeBaseModal();
    return {
      first,
      second,
      loaded: facade.isLensKnowledgeBaseUiLoaded(),
      notification,
    };
  }, facadeUrl());

  expect(implementationRequests).toHaveLength(2);
  expect(new URL(implementationRequests[0]).search).toBe('');
  expect(new URL(implementationRequests[1]).search).toBe('?lazy-retry=1');
  expect(outcomes).toEqual({
    first: false,
    second: 'opened',
    loaded: true,
    notification: '✗ Knowledge Base controls could not be loaded. Try again.',
  });
});
