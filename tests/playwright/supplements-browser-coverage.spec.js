import { expect, test } from './coverage-fixture.js';

function seedCompletedTour() {
  const profileId = localStorage.getItem('labcharts-active-profile') || 'default';
  localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
  localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
  localStorage.setItem('labcharts-ai-provider', 'ollama');
  localStorage.setItem('labcharts-ollama-model', 'llama3.2');
}

function expectAll(outcomes) {
  const failed = Object.entries(outcomes)
    .filter(([, value]) => value !== true)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  expect(failed).toEqual([]);
}

test('supplements browser coverage handles editor ingredients imports sync and AI handoff', async ({ page }) => {
  await page.addInitScript(seedCompletedTour);
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(() => {
    window.endTour?.();
    document.getElementById('tour-overlay')?.remove();
    document.getElementById('tour-spotlight')?.remove();
    document.getElementById('tour-tooltip')?.remove();
    document.getElementById('sync-setup-overlay')?.remove();
  });

  const outcomes = await page.evaluate(async () => {
    const [{ state }, data, supplements, supplementsRuntime] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/supplements.js'),
      import('/js/supplements-runtime.js'),
    ]);
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitUntil = async (predicate, label) => {
      for (let i = 0; i < 120; i += 1) {
        if (predicate()) return true;
        await wait(20);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const jsonResponse = body => new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const sessionSnapshot = new Map(Array.from({ length: sessionStorage.length }, (_, i) => {
      const key = sessionStorage.key(i);
      return [key, sessionStorage.getItem(key)];
    }));
    const saved = {
      importedData: clone(state.importedData),
      currentProfile: state.currentProfile,
      currentView: state.currentView,
      fetch: window.fetch,
      getOllamaConfig: window.getOllamaConfig,
      scrollIntoView: Element.prototype.scrollIntoView,
    };
    const outcomes = {};
    const calls = [];
    const fetchCalls = [];
    const previousSupplementsRuntime = supplementsRuntime.configureSupplementsRuntimeDeps({
      closeModal: () => document.getElementById('modal-overlay')?.classList.remove('show'),
      navigate: route => calls.push(['navigate', route]),
    });

    try {
      Element.prototype.scrollIntoView = function() {};
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ollama-model', 'llama3.2');
      window.getOllamaConfig = () => ({ url: 'http://localhost:11434', model: 'llama3.2', apiKey: '' });
      window.fetch = async (url, options = {}) => {
        const urlText = String(url);
        fetchCalls.push({
          url: urlText,
          body: typeof options.body === 'string' ? JSON.parse(options.body) : null,
        });
        if (urlText.startsWith('/api/fetch-page')) {
          const html = `<!doctype html><html><head>
            <script type="application/ld+json">{"name":"Magnesium Complex","description":"Supplement Facts serving size 2 capsules active ingredients Magnesium glycinate 200 mg Vitamin B6 5 mg"}</script>
            </head><body><main>
              Magnesium Complex supplement facts serving size 2 capsules.
              Active ingredient Magnesium glycinate 200 mg per serving and Vitamin B6 5 mg per serving.
              Take two capsules daily with food. This product page has enough descriptive text for extraction.
            </main></body></html>`;
          return jsonResponse({ html });
        }
        if (urlText === 'http://localhost:11434/v1/chat/completions') {
          return jsonResponse({
            choices: [{
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({
                  product: 'Magnesium Complex',
                  dosage: '2 capsules/day',
                  ingredients: [
                    { name: 'Magnesium glycinate', amount: '200 mg' },
                    { name: 'Vitamin B6', amount: '5 mg' },
                  ],
                }),
              },
            }],
            usage: { prompt_tokens: 12, completion_tokens: 18 },
          });
        }
        if (urlText === 'data/mito-compounds.json') {
          return jsonResponse([{
            name: 'Magnesium',
            k: ['magnesium glycinate'],
            cat: 'supplement',
            effects: [{ f: 'Complex I', a: 'inhibits', t: 'coverage fixture' }],
            pmid: 12345678,
            more: 'magnesium+mitochondria',
          }]);
        }
        throw new Error(`Unexpected fetch ${urlText}`);
      };

      state.currentProfile = 'supplements-browser-coverage';
      state.currentView = 'dashboard';
      state.importedData = {
        entries: [],
        notes: [],
        supplements: [{
          name: 'Magnesium Glycinate',
          dosage: '200 mg',
          startDate: '2026-01-01',
          endDate: null,
          type: 'supplement',
          note: 'calm sleep',
          timesPerDay: 2,
          sourceUrl: 'https://example.test/magnesium-old',
          ingredients: [{ name: 'Magnesium', amount: '100 mg' }],
        }],
        healthGoals: [],
        diagnoses: null,
        customMarkers: {},
        markerNotes: {},
        markerValueNotes: {},
        changeHistory: [],
      };
      data.invalidateActiveDataCache();

      const supplementSectionHost = document.createElement('div');
      supplementSectionHost.id = 'supplement-warning-refresh-fixture';
      supplementSectionHost.innerHTML = supplements.renderSupplementsSection();
      document.body.appendChild(supplementSectionHost);
      await waitUntil(
        () => !!supplementSectionHost.querySelector('.supp-mitotox'),
        'deferred mitochondrial warning refresh',
      );
      outcomes.supplementWarningsLoadOnDemandAndRefreshTheSection =
        fetchCalls.filter(call => call.url === 'data/mito-compounds.json').length === 1
        && supplementSectionHost.textContent.includes('may inhibit Complex I');

      supplements.openSupplementsEditor();
      await waitUntil(() => document.getElementById('modal-overlay')?.classList.contains('show'), 'supplement editor open');
      document.querySelector('[data-supp-action="close-modal"]')?.click();
      await waitUntil(() => !document.getElementById('modal-overlay')?.classList.contains('show'), 'supplement editor close');
      outcomes.closeButtonDelegatesToSupplementModalRuntime =
        !document.getElementById('modal-overlay')?.classList.contains('show');
      supplements.openSupplementsEditor();
      await waitUntil(() => document.getElementById('modal-overlay')?.classList.contains('show'), 'supplement editor reopen');
      supplements.toggleSuppAccordion(0);
      await waitUntil(() => !!document.querySelector('.supp-list-expanded'), 'supplement row expanded');
      const expanded = document.querySelector('.supp-list-expanded');
      const activeRow = document.querySelector('.supp-list-item[data-idx="0"]');
      const activeBeforeClose = activeRow?.classList.contains('supp-list-item-active') === true;
      supplements.toggleSuppAccordion(0);
      outcomes.toggleSuppAccordionOpensAndClosesExistingRows =
        expanded?.dataset.expandedIdx === '0'
        && activeBeforeClose
        && !document.querySelector('.supp-list-expanded');

      supplements.showAddSuppForm();
      await waitUntil(() => !!document.getElementById('supp-form-panel'), 'add form open');
      const timesInput = document.getElementById('supp-times');
      timesInput.value = '2';
      timesInput.dispatchEvent(new Event('input', { bubbles: true }));
      supplements.addIngredientRow();
      supplements.addIngredientRow();
      await waitUntil(() => document.querySelectorAll('#supp-ingredients .supp-ingredient-row').length === 2, 'ingredient rows added');
      const addRowFocusedLastName = document.activeElement?.classList.contains('supp-ing-name') === true;
      const firstRow = document.querySelector('#supp-ingredients .supp-ingredient-row');
      const amountInput = firstRow.querySelector('.supp-ing-amount');
      amountInput.value = '125 mg';
      amountInput.dispatchEvent(new Event('input', { bubbles: true }));
      const timesOverride = firstRow.querySelector('.supp-ing-times');
      timesOverride.value = '3';
      supplements.updateIngTotal(timesOverride);
      const overriddenTotal = firstRow.querySelector('.supp-ing-total')?.textContent || '';
      const secondRemove = document.querySelectorAll('#supp-ingredients .supp-ing-remove')[1];
      supplements.removeIngredientRow(secondRemove);
      const remainingRows = document.querySelectorAll('#supp-ingredients .supp-ingredient-row').length;
      timesOverride.value = '';
      supplements.updateAllIngTotals();
      const outerTotal = firstRow.querySelector('.supp-ing-total')?.textContent || '';
      outcomes.ingredientTotalsUseRowOverrideOuterTimesAndRemoval =
        overriddenTotal === '375 mg/day'
        && outerTotal === '250 mg/day'
        && remainingRows === 1
        && addRowFocusedLastName;

      document.getElementById('supp-url').value = ' https://example.test/products/magnesium ';
      await supplements.fetchSupplementFromURL();
      await waitUntil(() => (document.getElementById('supp-name')?.value || '') === 'Magnesium Complex', 'URL import fields populated');
      const importedRows = Array.from(document.querySelectorAll('#supp-ingredients .supp-ingredient-row'))
        .map(row => ({
          name: row.querySelector('.supp-ing-name')?.value || '',
          amount: row.querySelector('.supp-ing-amount')?.value || '',
          total: row.querySelector('.supp-ing-total')?.textContent || '',
        }));
      outcomes.fetchSupplementFromURLExtractsPageAndAppliesParsedSupplement =
        (document.getElementById('supp-dosage')?.value || '') === '2 capsules/day'
        && importedRows.length === 2
        && importedRows[0].name === 'Magnesium glycinate'
        && importedRows[0].amount === '200 mg'
        && importedRows[0].total === '400 mg/day'
        && importedRows[1].name === 'Vitamin B6'
        && fetchCalls.some(call => call.url.startsWith('/api/fetch-page?url='))
        && fetchCalls.some(call => call.url === 'http://localhost:11434/v1/chat/completions')
        && Array.from(document.querySelectorAll('.notification-toast'))
          .some(el => (el.textContent || '').includes('2 ingredients extracted'));

      const badInput = document.createElement('input');
      badInput.type = 'file';
      badInput.value = '';
      Object.defineProperty(badInput, 'files', {
        configurable: true,
        value: [new File(['not an image'], 'label.txt', { type: 'text/plain' })],
      });
      document.body.appendChild(badInput);
      await supplements.scanSupplementLabel(badInput);
      outcomes.scanSupplementLabelRejectsInvalidFile =
        Array.from(document.querySelectorAll('.notification-toast'))
          .some(el => (el.textContent || '').includes('Please select an image'));
      badInput.remove();

      supplements.openSupplementsEditor(0);
      await waitUntil(() => !!document.querySelector('.supp-list-expanded'), 'edit form open');
      state.importedData.supplements[0].note = 'synced note from remote';
      window.dispatchEvent(new Event('labcharts-sync-applied'));
      await waitUntil(() => (document.getElementById('supp-note')?.value || '') === 'synced note from remote', 'sync refresh note');
      outcomes.syncRefreshReopensMatchingSupplementByNaturalKey =
        document.getElementById('detail-modal')?.dataset.syncRefreshKind === 'supplements'
        && document.getElementById('detail-modal')?.dataset.syncRefreshItemId?.startsWith('s_') === true
        && document.querySelector('.supp-list-expanded')?.dataset.expandedIdx === '0';

      const aiFixture = document.createElement('div');
      aiFixture.id = 'supplements-ai-context-fixture';
      const askButton = document.createElement('button');
      askButton.type = 'button';
      askButton.setAttribute('aria-label', 'Ask AI');
      askButton.addEventListener('click', () => calls.push(['ask-ai-click']));
      const textarea = document.createElement('textarea');
      textarea.className = 'chat-input';
      textarea.addEventListener('input', () => calls.push(['chat-input']));
      aiFixture.append(askButton, textarea);
      document.body.prepend(aiFixture);
      supplements.askAIMitoContext();
      await waitUntil(() => textarea.value.includes('mitochondrial effects'), 'AI context prompt inserted');
      outcomes.askAIMitoContextClicksAIAndSeedsChatPrompt =
        calls.some(call => call[0] === 'ask-ai-click')
        && calls.some(call => call[0] === 'chat-input')
        && document.activeElement === textarea;
    } finally {
      document.getElementById('modal-overlay')?.classList.remove('show');
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      document.getElementById('supplements-ai-context-fixture')?.remove();
      document.getElementById('supplement-warning-refresh-fixture')?.remove();
      state.importedData = saved.importedData;
      state.currentProfile = saved.currentProfile;
      state.currentView = saved.currentView;
      data.invalidateActiveDataCache();
      window.fetch = saved.fetch;
      if (saved.getOllamaConfig) window.getOllamaConfig = saved.getOllamaConfig;
      else delete window.getOllamaConfig;
      supplementsRuntime.configureSupplementsRuntimeDeps(previousSupplementsRuntime);
      Element.prototype.scrollIntoView = saved.scrollIntoView;
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
      sessionStorage.clear();
      for (const [key, value] of sessionSnapshot) {
        if (key && value != null) sessionStorage.setItem(key, value);
      }
    }

    return outcomes;
  });

  expectAll(outcomes);
});
