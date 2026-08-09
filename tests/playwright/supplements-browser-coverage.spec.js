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
          const requestText = typeof options.body === 'string' ? options.body : '';
          const isLabelPhotoReview = requestText.includes('These images may show');
          return jsonResponse({
            choices: [{
              finish_reason: 'stop',
              message: {
                content: JSON.stringify(isLabelPhotoReview ? {
                  product: 'Magnesium Complex',
                  dosage: 'Take two capsules with food',
                  ingredients: [
                    { name: 'Magnesium glycinate', amount: '200 mg' },
                    { name: 'Vitamin B6', amount: '7 mg' },
                    { name: 'Zinc', amount: '10 mg' },
                  ],
                  warnings: ['Keep out of reach of children'],
                } : {
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
          return jsonResponse([
            { _meta: { schemaVersion: 2 } },
            {
              name: 'Magnesium glycinate',
              aliases: ['magnesium glycinate'],
              category: 'supplement',
              evidence: [
                {
                  id: 'magnesium-fixture-12345678',
                  direction: 'mechanism',
                  scopeLabel: 'Coverage fixture only',
                  summary: 'Changed a mitochondrial endpoint in the coverage fixture.',
                  studyType: 'human_cells',
                  studyLabel: 'Human cells / ex vivo',
                  model: 'Coverage fixture cells',
                  exposure: 'Coverage fixture exposure.',
                  limitations: 'Coverage fixture cannot establish a clinical effect.',
                  pmid: 12345678,
                  title: 'Coverage fixture primary study.',
                },
                {
                  id: 'magnesium-fixture-87654321',
                  direction: 'null',
                  scopeLabel: 'Second fixture population',
                  summary: 'Detected no mitochondrial change in the second coverage fixture.',
                  studyType: 'human_trial',
                  studyLabel: 'Human RCT',
                  model: 'Second coverage fixture population',
                  exposure: 'Second coverage fixture exposure.',
                  limitations: 'Second coverage fixture has limited generalizability.',
                  pmid: 87654321,
                  title: 'Second coverage fixture primary study.',
                },
              ],
            },
          ]);
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
          unknownFutureField: { preserve: true },
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
        && supplementSectionHost.textContent.includes('Changed a mitochondrial endpoint')
        && supplementSectionHost.textContent.includes('Mechanism, not harm')
        && supplementSectionHost.textContent.includes('Coverage fixture only');
      outcomes.multipleStudiesCollapseUnderOneCompound =
        supplementSectionHost.querySelectorAll('.supp-mitotox-item').length === 1
        && supplementSectionHost.querySelectorAll('.supp-mito-study').length === 2
        && supplementSectionHost.textContent.includes('1 matched compound')
        && supplementSectionHost.textContent.includes('2 verified studies')
        && supplementSectionHost.textContent.includes('Evidence differs by context')
        && supplementSectionHost.textContent.includes('Second fixture population');
      const mitoReportUrls = Array.from(supplementSectionHost.querySelectorAll('.supp-mito-report-link'))
        .filter(link => link instanceof HTMLAnchorElement)
        .map(link => new URL(link.href));
      const mitoReportUrl = mitoReportUrls.find(url => (url.searchParams.get('body') || '').includes('PMID 12345678'));
      const mitoReportBody = mitoReportUrl?.searchParams.get('body') || '';
      outcomes.mitoEvidenceReportPrefillsPublicCatalogContextWithoutPrivateRegimen =
        mitoReportUrl?.pathname === '/elkimek/get-based/issues/new'
        && mitoReportUrl?.searchParams.get('labels') === 'mitochondrial-evidence'
        && mitoReportBody.includes('PMID 12345678')
        && mitoReportBody.includes('Changed a mitochondrial endpoint')
        && mitoReportBody.includes('Coverage fixture only')
        && mitoReportUrls.every(url => {
          const body = url.searchParams.get('body') || '';
          return !body.includes('calm sleep') && !body.includes('200 mg');
        });

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
      amountInput.value = '125';
      const unitInput = firstRow.querySelector('.supp-ing-unit');
      unitInput.value = 'mg';
      unitInput.dispatchEvent(new Event('change', { bubbles: true }));
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
      await waitUntil(() => !!document.querySelector('.supp-import-review'), 'URL import review staged');
      const formUntouchedBeforeReview = (document.getElementById('supp-name')?.value || '') === '';
      document.querySelector('[data-supp-action="apply-import"]')?.click();
      await waitUntil(() => (document.getElementById('supp-name')?.value || '') === 'Magnesium Complex', 'URL import fields populated');
      const importedRows = Array.from(document.querySelectorAll('#supp-ingredients .supp-ingredient-row'))
        .map(row => ({
          name: row.querySelector('.supp-ing-name')?.value || '',
          amount: row.querySelector('.supp-ing-amount')?.value || '',
          unit: row.querySelector('.supp-ing-unit')?.value || '',
          total: row.querySelector('.supp-ing-total')?.textContent || '',
        }));
      outcomes.fetchSupplementFromURLStagesReviewBeforeApplyingLabelFacts =
        formUntouchedBeforeReview
        && (document.getElementById('supp-dosage')?.value || '') === ''
        && (document.getElementById('supp-label-directions')?.value || '') === '2 capsules/day'
        && importedRows.length === 2
        && importedRows[0].name === 'Magnesium glycinate'
        && importedRows[0].amount === '200'
        && importedRows[0].unit === 'mg'
        && importedRows[0].total === '400 mg/day'
        && importedRows[1].name === 'Vitamin B6'
        && fetchCalls.some(call => call.url.startsWith('/api/fetch-page?url='))
        && fetchCalls.some(call => call.url === 'http://localhost:11434/v1/chat/completions')
        && Array.from(document.querySelectorAll('.notification-toast'))
          .some(el => (el.textContent || '').includes('Draft ready'));

      const vitaminB6Row = Array.from(document.querySelectorAll('#supp-ingredients .supp-ingredient-row'))
        .find(row => row.querySelector('.supp-ing-name')?.value === 'Vitamin B6');
      const vitaminB6Amount = vitaminB6Row?.querySelector('.supp-ing-amount');
      if (vitaminB6Amount) vitaminB6Amount.value = '6';
      const imageCanvas = document.createElement('canvas');
      imageCanvas.width = 8;
      imageCanvas.height = 8;
      imageCanvas.getContext('2d').fillRect(0, 0, 8, 8);
      const imageBlob = await new Promise(resolve => imageCanvas.toBlob(resolve, 'image/png'));
      const photoInput = document.createElement('input');
      photoInput.type = 'file';
      Object.defineProperty(photoInput, 'files', {
        configurable: true,
        value: [new File([imageBlob], 'supplement-facts.png', { type: 'image/png' })],
      });
      document.body.appendChild(photoInput);
      await supplements.scanSupplementLabel(photoInput);
      await waitUntil(
        () => (document.querySelector('.supp-import-review')?.textContent || '').includes('label photos'),
        'combined URL and photo review staged',
      );
      const rowsBeforeCombinedApply = document.querySelectorAll('#supp-ingredients .supp-ingredient-row').length;
      const combinedReviewText = document.querySelector('.supp-import-review')?.textContent || '';
      document.querySelector('[data-supp-action="apply-import"]')?.click();
      const combinedRows = Array.from(document.querySelectorAll('#supp-ingredients .supp-ingredient-row'));
      const combinedValues = Object.fromEntries(combinedRows.map(row => [
        row.querySelector('.supp-ing-name')?.value || '',
        row.querySelector('.supp-ing-amount')?.value || '',
      ]));
      const evidenceMergePassed =
        rowsBeforeCombinedApply === 2
        && combinedRows.length === 3
        && combinedValues['Vitamin B6'] === '6'
        && combinedValues.Zinc === '10'
        && combinedReviewText.includes('product URL')
        && combinedReviewText.includes('label photos')
        && combinedReviewText.includes('Vitamin B6 amount differs')
        && combinedReviewText.includes('Keep out of reach of children');
      outcomes.linkAndPhotoEvidenceUnionsIngredientsWithoutOverwritingFormValues = evidenceMergePassed || {
        rowsBeforeCombinedApply,
        rowCount: combinedRows.length,
        combinedValues,
        combinedReviewText,
        aiRequestContainsPhotoPrompt: fetchCalls
          .filter(call => call.url === 'http://localhost:11434/v1/chat/completions')
          .some(call => JSON.stringify(call.body).includes('These images may show')),
      };
      photoInput.remove();

      supplements.saveSupplement(-1);
      await waitUntil(() => state.importedData.supplements.length === 2, 'reviewed import saved');
      const importedRecord = state.importedData.supplements[1];
      outcomes.reviewedImportSavesStructuredAndLegacyMirrorsWithProvenance =
        importedRecord.id.startsWith('sm_')
        && importedRecord.labelDirections === '2 capsules/day'
        && importedRecord.dosage === ''
        && importedRecord.ingredients[0].amount === '200 mg'
        && importedRecord.ingredients[0].amountValue === 200
        && importedRecord.ingredients[0].amountUnit === 'mg'
        && importedRecord.ingredients.find(ingredient => ingredient.name === 'Vitamin B6')?.amount === '6 mg'
        && importedRecord.ingredients.find(ingredient => ingredient.name === 'Zinc')?.amount === '10 mg'
        && importedRecord.importProvenance?.fields?.ingredients?.source === 'product URL + label photos'
        && importedRecord.importProvenance?.evidence?.length === 2
        && importedRecord.labelWarnings?.includes('Keep out of reach of children')
        && importedRecord.sourceUrl === 'https://example.test/products/magnesium';

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

      supplements.saveSupplement(0);
      await waitUntil(() => !!state.importedData.supplements[0].id, 'legacy supplement upgraded on save');
      outcomes.legacyEditUsesStableOldSyncIdentityAndPreservesUnknownFields =
        state.importedData.supplements[0].id.startsWith('s_')
        && state.importedData.supplements[0].unknownFutureField?.preserve === true
        && state.importedData.supplements[0].schemaVersion === 2;

      supplements.beginSupplementDoseChange(0);
      outcomes.doseChangeStagesANewPeriodWithoutOverwritingHistory =
        document.querySelectorAll('#supp-periods .supp-period-row').length === 2
        && document.querySelectorAll('#supp-periods .supp-period-end')[0]?.value !== ''
        && document.querySelectorAll('#supp-periods .supp-period-start')[1]?.value !== ''
        && state.importedData.supplements[0].periods?.length === 1;
      supplements.openSupplementsEditor(0);

      supplements.endSupplement(0);
      await waitUntil(() => !supplements.renderSupplementsSection().includes('Magnesium Glycinate'), 'ended item hidden from dashboard');
      const endedState = state.importedData.supplements[0].lifecycle?.state === 'ended'
        && document.querySelector('.supp-list-group-title')?.textContent !== '';
      supplements.restartSupplement(0);
      await waitUntil(() => supplements.renderSupplementsSection().includes('Magnesium Glycinate'), 'restarted item visible on dashboard');
      outcomes.endHidesFromCurrentWhileRestartKeepsHistoryAtHand =
        endedState
        && state.importedData.supplements[0].lifecycle?.state === 'active'
        && state.importedData.supplements[0].periods?.length === 1
        && state.importedData.supplements[0].periods[0].end === null;

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
      await waitUntil(() => textarea.value.includes('primary-study mitochondrial evidence'), 'AI context prompt inserted');
      outcomes.askAIMitoContextClicksAIAndSeedsChatPrompt =
        calls.some(call => call[0] === 'ask-ai-click')
        && calls.some(call => call[0] === 'chat-input')
        && textarea.value.includes('do not treat mechanistic findings as proof')
        && document.activeElement === textarea;

      document.getElementById('detail-modal')?.remove();
      document.getElementById('modal-overlay')?.remove();
      supplements.openSupplementsEditor();
      outcomes.editorIgnoresMissingModalShell = true;
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

test('review link reads a BrainMarket composition table without AI JSON truncation', async ({ page }) => {
  await page.addInitScript(seedCompletedTour);
  await page.goto('/app', { waitUntil: 'load' });

  const result = await page.evaluate(async () => {
    const [{ state }, data, supplements] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
      import('/js/supplements.js'),
    ]);
    const originalFetch = window.fetch;
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitUntil = async (predicate, label) => {
      for (let i = 0; i < 120; i += 1) {
        if (predicate()) return true;
        await wait(20);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const ingredientRows = [
      ['Lipozomální vitamín C', '119 mg'],
      ['z toho vitamín C (kyselina L-askorbová)', '80 mg'],
      ['z toho lipozomální fosfolipidová směs', '39 mg'],
      ['Cholin (VitaCholine® L(+)-bitartrát)', '100 mg'],
      ['Vitamín B3 (niacinamid)', '100 mg'],
      ['Kyselina alfa-lipoová', '90 mg'],
      ['Inositol', '90 mg'],
      ['Trimethylglycin (betain)', '60 mg'],
      ['Vitamín B1 (thiamin hydrochlorid)', '50 mg'],
      ['Vitamín B5 (kalcium-pantothenát)', '50 mg'],
      ['Vitamín B2 (riboflavin)', '40 mg'],
      ['Koenzym Q10', '20 mg'],
      ["Vitamín B6 (pyridoxal-5'-fosfát)", '12 mg'],
      ['Vitamín B7 (biotin)', '1000 µg'],
      ['Vitamín B9 (L-5-methyltetrahydrofolát vápenatý)', '400 µg'],
      ['Vitamín B12 (methylkobalamin)', '100 µg'],
    ];
    const productHtml = `<!doctype html><html><body>
      <span itemprop="brand"><meta itemprop="name" content="BrainMax"></span>
      <h1>BrainMax Activated B-Complex®, 90 rostlinných kapslí <span class="product-appendix">Komplex aktivovaných B vitamínů</span></h1>
      <div class="m-dosage"><h2>Doporučené dávkování</h2><p>2 kapsle denně</p></div>
      <div class="m-specific-table"><table>
        <thead><tr><th>Těžké kovy</th><th>Hodnota</th></tr></thead>
        <tbody>
          <tr><td>Kadmium (mg/kapsle)</td><td>ND</td></tr>
          <tr><td>Rtuť (mg/kapsle)</td><td>NQ</td></tr>
          <tr><td>Olovo (mg/kapsle)</td><td>ND</td></tr>
        </tbody>
      </table></div>
      <div id="nutritional-values"><h2>Složení</h2><table>
        <thead><tr><th>Aktivní látky ve 2 kapslích</th><th>Množství</th><th>%RHP</th></tr></thead>
        <tbody>${ingredientRows.map(([name, amount]) => `<tr><td>${name}</td><td>${amount}</td><td>**</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="tab-pane active"><table class="detail-parameters"><tbody>
        <tr><th>EAN:</th><td>8594190023908</td></tr>
        <tr><th>Počet kapslí:</th><td>90</td></tr>
        <tr><th>Expirace:</th><td>30.9.2027</td></tr>
      </tbody></table></div>
      <p><strong>Upozornění:</strong> Uchovávejte mimo dosah dětí.</p>
      <p>Doplněk stravy.</p>
    </body></html>`;
    let aiCalls = 0;
    window.fetch = async url => {
      const value = String(url);
      if (value.startsWith('/api/fetch-page')) {
        return new Response(JSON.stringify({ status: 200, html: productHtml }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (value.includes('/v1/chat/completions')) {
        aiCalls += 1;
        await new Promise(resolve => setTimeout(resolve, 80));
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            product: 'BrainMax Activated B-Complex®, 90 rostlinných kapslí',
            type: 'supplement',
            ingredients: [],
            inactiveIngredients: ['rostlinná kapsle'],
            qualityTests: [
              { category: 'contaminant', analyte: 'Kadmium', resultText: 'ND', unit: 'mg', basis: 'per capsule', status: 'not-detected' },
              { category: 'contaminant', analyte: 'Rtuť', resultText: 'NQ', unit: 'mg', basis: 'per capsule', status: 'not-quantified' },
              { category: 'contaminant', analyte: 'Olovo', resultText: 'ND', unit: 'mg', basis: 'per capsule', status: 'not-detected' },
              { category: 'potency', analyte: 'Vitamín B12', resultText: '102%', unit: '%', basis: 'label claim', status: 'pass' },
            ],
          }) } }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error(`Unexpected fetch ${value}`);
    };
    const previousData = state.importedData;
    state.importedData = {
      entries: [], notes: [], supplements: [], healthGoals: [], diagnoses: null,
      customMarkers: {}, markerNotes: {}, markerValueNotes: {}, changeHistory: [],
    };
    data.invalidateActiveDataCache();
    try {
      supplements.openSupplementsEditor();
      supplements.showAddSuppForm();
      document.getElementById('supp-url').value = 'https://www.brainmarket.cz/brainmax-activated-b-complex--90-rostlinnych-kapsli/';
      const importPromise = supplements.fetchSupplementFromURL();
      await waitUntil(
        () => (document.getElementById('supp-import-progress')?.textContent || '').includes('Classifying active ingredients'),
        'visible AI classification progress',
      );
      const progressTextWhileRunning = document.getElementById('supp-import-progress')?.textContent.replace(/\s+/g, ' ').trim() || '';
      const reviewLinkShowsSpinner = document.querySelector('.supp-url-fetch:not(.supp-scan-label)')?.classList.contains('is-loading') || false;
      await importPromise;
      const progressTextAfterImport = document.getElementById('supp-import-progress')?.textContent.replace(/\s+/g, ' ').trim() || '';
      const reviewCount = document.querySelectorAll('.supp-import-review-ingredients > .supp-import-choice').length;
      const reviewQualityCount = document.querySelectorAll('.supp-import-review-quality > .supp-import-choice').length;
      const reviewText = document.querySelector('.supp-import-review')?.textContent || '';
      const potencyChoice = Array.from(document.querySelectorAll('[data-supp-import-kind="quality"]'))
        .find(input => input.closest('.supp-import-choice')?.textContent.includes('Vitamín B12'));
      const potencyDefaultSelected = potencyChoice?.checked ?? null;
      const potencyMarkedInformational = potencyChoice?.closest('.supp-import-choice')?.textContent.includes('not selected by default') || false;
      document.querySelector('[data-supp-action="quality-safety-only"]')?.click();
      const safetyFilterStates = Array.from(document.querySelectorAll('[data-supp-import-kind="quality"]'))
        .map(input => ({ category: input.dataset.suppImportCategory, checked: input.checked }));
      const safetyButton = document.querySelector('[data-supp-action="quality-safety-only"]');
      const safetyButtonAfterFilter = {
        text: safetyButton?.textContent || '',
        pressed: safetyButton?.getAttribute('aria-pressed'),
      };
      safetyButton?.click();
      const restoredAllQualityResults = Array.from(document.querySelectorAll('[data-supp-import-kind="quality"]'))
        .every(input => input.checked);
      document.querySelector('[data-supp-action="apply-import"]')?.click();
      const rows = Array.from(document.querySelectorAll('#supp-ingredients .supp-ingredient-row'));
      const b12 = rows.find(row => row.querySelector('.supp-ing-name')?.value.includes('Vitamín B12'));
      const formValues = {
        name: document.getElementById('supp-name')?.value,
        brand: document.getElementById('supp-brand')?.value,
        servingValue: document.getElementById('supp-serving-value')?.value,
        servingUnit: document.getElementById('supp-serving-unit')?.value,
        directions: document.getElementById('supp-label-directions')?.value,
        rowCount: rows.length,
        qualityRowCount: document.querySelectorAll('#supp-quality-tests .supp-quality-row').length,
        potencyAIIncluded: Array.from(document.querySelectorAll('#supp-quality-tests .supp-quality-row'))
          .find(row => row.querySelector('.supp-quality-analyte')?.value === 'Vitamín B12')
          ?.querySelector('.supp-quality-ai-context')?.checked,
        b12Amount: b12?.querySelector('.supp-ing-amount')?.value,
        b12Unit: b12?.querySelector('.supp-ing-unit')?.value,
      };
      document.getElementById('supp-times').value = '1';
      supplements.saveSupplement(-1);
      const saved = state.importedData.supplements[0];
      return {
        aiCalls,
        progressTextWhileRunning,
        progressTextAfterImport,
        reviewLinkShowsSpinner,
        reviewCount,
        reviewQualityCount,
        potencyDefaultSelected,
        potencyMarkedInformational,
        safetyFilterStates,
        safetyButtonAfterFilter,
        restoredAllQualityResults,
        activeReviewHasCadmium: document.querySelector('.supp-import-review-ingredients')?.textContent.includes('Kadmium') || false,
        reviewHasWarning: reviewText.includes('Uchovávejte mimo dosah dětí'),
        reviewHasMetadata: /EAN|Počet kapslí|Expirace/.test(reviewText),
        ...formValues,
        savedQualityCount: saved?.qualityTests?.length || 0,
        savedPotencyAIIncluded: saved?.qualityTests?.find(test => test.category === 'potency')?.includeInAIContext,
        savedQualityScope: saved?.qualityEvidenceScope,
        savedIngredientHasCadmium: saved?.ingredients?.some(ingredient => ingredient.name === 'Kadmium') || false,
        overviewText: document.querySelector('.supp-quality-overview')?.textContent.replace(/\s+/g, ' ').trim() || '',
      };
    } finally {
      state.importedData = previousData;
      data.invalidateActiveDataCache();
      window.fetch = originalFetch;
    }
  });

  expect(result).toEqual({
    aiCalls: 1,
    progressTextWhileRunning: expect.stringContaining('Step 3 of 4'),
    progressTextAfterImport: expect.stringContaining('Complete'),
    reviewLinkShowsSpinner: true,
    reviewCount: 16,
    reviewQualityCount: 4,
    potencyDefaultSelected: false,
    potencyMarkedInformational: true,
    safetyFilterStates: [
      { category: 'contaminant', checked: true },
      { category: 'contaminant', checked: true },
      { category: 'contaminant', checked: true },
      { category: 'potency', checked: false },
    ],
    safetyButtonAfterFilter: { text: 'Restore all quality results', pressed: 'true' },
    restoredAllQualityResults: true,
    activeReviewHasCadmium: false,
    reviewHasWarning: true,
    reviewHasMetadata: false,
    name: 'BrainMax Activated B-Complex®, 90 rostlinných kapslí',
    brand: 'BrainMax',
    servingValue: '2',
    servingUnit: 'capsule',
    directions: '2 kapsle denně',
    rowCount: 16,
    qualityRowCount: 4,
    potencyAIIncluded: false,
    b12Amount: '100',
    b12Unit: 'mcg',
    savedQualityCount: 4,
    savedPotencyAIIncluded: false,
    savedQualityScope: 'unknown',
    savedIngredientHasCadmium: false,
    overviewText: expect.stringContaining('Kadmium'),
  });
});

test('supplements mobile editor groups history and keeps structured controls inside the modal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(seedCompletedTour);
  await page.goto('/app', { waitUntil: 'load' });

  const result = await page.evaluate(async () => {
    const [{ state }, supplements] = await Promise.all([
      import('/js/state.js'),
      import('/js/supplements.js'),
    ]);
    Element.prototype.scrollIntoView = function() {};
    state.importedData.supplements = [
      {
        name: 'Current combination product with a deliberately long name',
        type: 'supplement',
        startDate: '2026-01-01',
        endDate: null,
        timesPerDay: 2,
        ingredients: [
          { name: 'Magnesium bisglycinate with long ingredient name', amountValue: 200, amountUnit: 'mg', amount: '200 mg' },
          { name: 'Custom probiotic blend', amountValue: 25, amountUnit: 'billion CFU', amount: '25 billion CFU' },
        ],
        qualityEvidenceScope: 'unknown',
        qualityTests: [
          { category: 'contaminant', analyte: 'Lead with a deliberately long translated name', resultText: 'ND', unit: 'mg', basis: 'per capsule', includeInAIContext: true },
        ],
      },
      { name: 'Completed medication', type: 'medication', startDate: '2024-01-01', endDate: '2024-02-01' },
      { name: 'Paused supplement', type: 'supplement', periods: [{ start: '2025-01-01', end: '2025-03-01' }], lifecycle: { state: 'paused' } },
    ];

    const dashboard = supplements.renderSupplementsSection();
    supplements.openSupplementsEditor(0);
    const modal = document.getElementById('detail-modal');
    const ingredientRow = modal?.querySelector('.supp-ingredient-row');
    const modalRect = modal?.getBoundingClientRect();
    const controls = modal ? Array.from(modal.querySelectorAll('.supp-ingredient-row input, .supp-ingredient-row select, .supp-ingredient-row button, .supp-quality-row input, .supp-quality-row select, .supp-quality-row button')) : [];
    return {
      dashboardHasCurrent: dashboard.includes('Current combination product'),
      dashboardHidesEnded: !dashboard.includes('Completed medication'),
      groups: Array.from(modal?.querySelectorAll('.supp-list-group-title') || []).map(el => el.textContent),
      noModalOverflow: !!modal && modal.scrollWidth <= modal.clientWidth + 1,
      controlsInsideModal: !!modalRect && controls.every(control => {
        if (control.hidden) return true;
        const rect = control.getBoundingClientRect();
        return rect.left >= modalRect.left - 1 && rect.right <= modalRect.right + 1;
      }),
      hasUnitDropdown: !!ingredientRow?.querySelector('.supp-ing-unit'),
      hasQualityAIControl: !!modal?.querySelector('.supp-quality-ai-context:checked'),
      hasQualityScopeControl: !!modal?.querySelector('#supp-quality-evidence-scope'),
      customUnitVisible: !modal?.querySelectorAll('.supp-ing-unit-custom')[1]?.hidden,
      closeHasAccessibleName: !!modal?.querySelector('.modal-close[aria-label]'),
    };
  });

  expect(result).toEqual({
    dashboardHasCurrent: true,
    dashboardHidesEnded: true,
    groups: ['Current', 'Paused / between cycles', 'History'],
    noModalOverflow: true,
    controlsInsideModal: true,
    hasUnitDropdown: true,
    hasQualityAIControl: true,
    hasQualityScopeControl: true,
    customUnitVisible: true,
    closeHasAccessibleName: true,
  });
});
