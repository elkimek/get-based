import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?foodContaminantsCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/food-contaminants-browser-coverage', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main><div id="modal-overlay"><div id="detail-modal"></div></div></body></html>',
  }));
  await page.goto('/food-contaminants-browser-coverage', { waitUntil: 'load' });
}

test('food contaminant browser coverage scans diet fields and renders warning UI', async ({ page }) => {
  test.setTimeout(30_000);
  await openBlankPage(page);

  const results = await page.evaluate(async ({ foodUrl, lifestyleUrl }) => {
    const [food, lifestyle, stateModule] = await Promise.all([
      import(foodUrl),
      import(lifestyleUrl),
      import('/js/state.js'),
    ]);
    const { state } = stateModule;
    const outcomes = {};
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const savedDiet = clone(state.importedData?.diet);

    try {
      const warnings = food.scanDietForContaminants({
        breakfast: 'Spinach smoothie with blueberries and pineapple',
        lunch: 'Avocado salad with sweet peas',
        dinner: 'Canned tuna with potatoes',
        snacks: 'Bottled water, boba tea, yogurt, gelato',
        note: 'Avoiding strawberries this month',
        restrictions: ['corn-free'],
        type: 'omnivore',
      });
      const byType = type => warnings.filter(w => w.type === type);
      const warningText = warnings.map(w => w.warning).join('\n');
      const matches = warnings.map(w => w.match);
      outcomes.scanFindsPesticideCleanAndPlasticSignals =
        byType('pesticide').length === 3
        && byType('clean').length === 3
        && byType('plastic').length === 5
        && warningText.includes('Spinach: #1 on EWG Dirty Dozen')
        && warningText.includes('Blueberries: #13 on EWG Dirty Dozen')
        && warningText.includes('Pineapples: on EWG Clean Fifteen')
        && warningText.includes('Avocados: on EWG Clean Fifteen')
        && warningText.includes('BPA detected in canned foods')
        && warningText.includes('DEHP detected in bottled water')
        && warningText.includes('BPA in boba tea')
        && warningText.includes('Plastic chemicals detected in 100% of yogurt')
        && warningText.includes('Plastic chemicals detected in 100% of ice cream')
        && matches.includes('spinach')
        && matches.includes('blueberries')
        && matches.includes('pineapple');

      const ignoredFieldWarnings = food.scanDietForContaminants({
        breakfast: '',
        lunch: '',
        dinner: '',
        snacks: '',
        note: 'I avoid spinach, strawberries, canned soup, and bottled water',
        restrictions: ['corn-free', 'apple-free'],
        type: 'blackberry protocol',
      });
      outcomes.scanIgnoresNotesRestrictionsAndDietType = ignoredFieldWarnings.length === 0;

      const boundaryWarnings = food.scanDietForContaminants({
        breakfast: 'Pineapple with grapefruit and cornbread',
      });
      const boundaryText = boundaryWarnings.map(w => w.warning).join('\n');
      outcomes.scanUsesWordBoundaries =
        boundaryWarnings.length === 1
        && boundaryText.includes('Pineapples: on EWG Clean Fifteen')
        && !boundaryText.includes('Apples:')
        && !boundaryText.includes('Grapes:')
        && !boundaryText.includes('Sweet corn:');

      const dedupWarnings = food.scanDietForContaminants({
        breakfast: 'strawberry strawberries spinach spinach',
        lunch: 'takeout take-out food delivery',
      });
      const dedupText = dedupWarnings.map(w => w.warning).join('\n');
      outcomes.scanDeduplicatesVariantsPerWarning =
        dedupWarnings.filter(w => w.warning.includes('Strawberries:')).length === 1
        && dedupWarnings.filter(w => w.warning.includes('Spinach:')).length === 1
        && dedupWarnings.filter(w => w.warning.includes('Takeout containers')).length === 1
        && dedupText.includes('Strawberries: #2 on EWG Dirty Dozen')
        && dedupText.includes('Takeout containers increase plastic chemical levels');

      state.importedData.diet = {
        breakfast: 'Spinach and avocado',
        lunch: 'Canned soup',
        dinner: '',
        snacks: '',
      };
      const badge = lifestyle.renderDietContaminantsBadge();
      outcomes.dietBadgeCountsOnlyFlaggedSignals =
        badge.includes('2 food contaminant signals detected')
        && badge.includes('role="button"')
        && badge.includes('data-lifestyle-action="show-diet-contaminants"')
        && !badge.includes('onclick=');

      state.importedData.diet = { breakfast: 'avocado and pineapple' };
      outcomes.cleanOnlyDietDoesNotRenderBadge = lifestyle.renderDietContaminantsBadge() === '';

      state.importedData.diet = {
        breakfast: 'Spinach with pineapple',
        lunch: 'Canned beans and bottled water',
        dinner: 'Yogurt',
        snacks: '',
      };
      lifestyle.showDietContaminantsModal();
      const modal = document.getElementById('detail-modal');
      const overlay = document.getElementById('modal-overlay');
      const modalText = modal?.textContent || '';
      outcomes.contaminantsModalGroupsSourcesAndActions =
        overlay?.classList.contains('show') === true
        && modalText.includes('Food Contaminant Signals')
        && modalText.includes('Pesticide Residues')
        && modalText.includes('Plastic Chemicals')
        && modalText.includes('Low Contamination')
        && modalText.includes('EWG Shopper')
        && modalText.includes('PlasticList')
        && modal?.querySelectorAll('a[target="_blank"][rel="noopener"]').length >= 3
        && modal?.querySelector('[data-lifestyle-action="discuss-diet-contaminants"]')
        && !modal?.querySelector('[onclick]');

      state.importedData.diet = { breakfast: '' };
      document.getElementById('detail-modal').innerHTML = 'unchanged';
      lifestyle.showDietContaminantsModal();
      outcomes.emptyWarningsLeaveModalUntouched = document.getElementById('detail-modal')?.innerHTML === 'unchanged';
    } finally {
      if (savedDiet === undefined) delete state.importedData.diet;
      else state.importedData.diet = savedDiet;
      document.getElementById('modal-overlay')?.classList.remove('show');
      const modal = document.getElementById('detail-modal');
      if (modal) modal.innerHTML = '';
    }

    return outcomes;
  }, {
    foodUrl: moduleUrl('/js/food-contaminants.js'),
    lifestyleUrl: moduleUrl('/js/context-card-lifestyle-editors.js'),
  });

  const expectedOutcomeKeys = [
    'scanFindsPesticideCleanAndPlasticSignals',
    'scanIgnoresNotesRestrictionsAndDietType',
    'scanUsesWordBoundaries',
    'scanDeduplicatesVariantsPerWarning',
    'dietBadgeCountsOnlyFlaggedSignals',
    'cleanOnlyDietDoesNotRenderBadge',
    'contaminantsModalGroupsSourcesAndActions',
    'emptyWarningsLeaveModalUntouched',
  ];
  expect(Object.keys(results)).toEqual(expectedOutcomeKeys);
  for (const [name, passed] of Object.entries(results)) {
    expect.soft(passed, name).toBe(true);
  }
});
