import { expect, test } from './coverage-fixture.js';

const moduleUrl = (path) => `${path}?chartCardRecsBrowserCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function openBlankPage(page) {
  await page.route('**/chart-card-recs-browser-coverage', route => {
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><head></head><body><main id="fixture"></main></body></html>',
    });
  });
  await page.goto('/chart-card-recs-browser-coverage', { waitUntil: 'load' });
}

test('chart card recommendation browser coverage handles badges reorder clicks and nudges', async ({ page }) => {
  await page.route('**/js/utils.js', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        export function showNotification(message, type) {
          window.__chartRecNotifications.push({ message, type });
        }
      `,
    });
  });
  await page.route('**/js/marker-detail-modal.js', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        export function showDetailModal(id, options) {
          window.__chartRecDetailCalls.push({ id, options });
        }
      `,
    });
  });
  await openBlankPage(page);

  const results = await page.evaluate(async ({ chartCardRecsUrl }) => {
    window.__chartRecNotifications = [];
    window.__chartRecDetailCalls = [];
    const [chartCardRecs, recommendationRuntime] = await Promise.all([
      import(chartCardRecsUrl),
      import('/js/recommendations-runtime.js'),
    ]);
    const outcomes = {};

    const fixture = document.getElementById('fixture');
    const renderCards = () => {
      fixture.innerHTML = `
        <div id="modal-overlay" class="modal-overlay"></div>
        <div class="charts-grid" id="primary-grid">
          <article class="chart-card" id="card-empty"><span id="chart-rec-missing_marker"></span></article>
          <article class="chart-card" id="card-apob"><span id="chart-rec-lipids_apob"></span></article>
          <article class="chart-card" id="card-glucose"><span id="chart-rec-biochemistry_glucose"></span></article>
        </div>
        <div class="charts-grid" id="secondary-grid">
          <article class="chart-card" id="card-secondary-empty"><span id="chart-rec-secondary_missing"></span></article>
          <article class="chart-card" id="card-secondary-rec"><span id="chart-rec-hormones_cortisol"></span></article>
        </div>
      `;
    };
    const cardOrder = gridId => Array.from(document.querySelectorAll(`#${gridId} .chart-card`)).map(card => card.id);
    const badgeTexts = () => Array.from(document.querySelectorAll('.ctx-tips-badge')).map(badge => badge.textContent);

    renderCards();
    recommendationRuntime.configureRecommendationModuleBridge({
      isProductRecsEnabled: () => false,
      loadCatalog: () => { throw new Error('loadCatalog should not run when recs are disabled'); },
    });
    await chartCardRecs.loadChartCardRecs();
    outcomes.disabledProductRecsReturnBeforeLoadingCatalog =
      document.querySelectorAll('.ctx-tips-badge').length === 0
      && window.__chartRecNotifications.length === 0;

    recommendationRuntime.configureRecommendationModuleBridge({
      isProductRecsEnabled: () => true,
      loadCatalog: null,
    });
    await chartCardRecs.loadChartCardRecs();
    outcomes.missingCatalogLoaderReturnsWithoutMutatingCards =
      document.querySelectorAll('.ctx-tips-badge').length === 0;

    recommendationRuntime.configureRecommendationModuleBridge({ loadCatalog: async () => ({ slots: null }) });
    await chartCardRecs.loadChartCardRecs();
    outcomes.catalogWithoutSlotsReturnsWithoutMutatingCards =
      document.querySelectorAll('.ctx-tips-badge').length === 0;

    localStorage.removeItem('labcharts-rec-nudge-seen');
    recommendationRuntime.configureRecommendationModuleBridge({
      loadCatalog: async () => ({
        slots: {
          'lipids.apob': {},
          'biochemistry.glucose': {},
          'hormones.cortisol': {},
        },
      }),
    });
    let bubbledClicks = 0;
    document.getElementById('card-apob').addEventListener('click', () => { bubbledClicks += 1; });
    await chartCardRecs.loadChartCardRecs();
    outcomes.badgesRenderForMatchingSlotsAndReorderWithinEachGrid =
      badgeTexts().join('|') === 'Tips|Tips|Tips'
      && [...document.querySelectorAll('.ctx-tips-badge')].every(badge => badge.tagName === 'BUTTON' && badge.tabIndex === 0 && badge.getAttribute('aria-label')?.startsWith('Open general-information tips'))
      && document.querySelector('#chart-rec-missing_marker .ctx-tips-badge') == null
      && cardOrder('primary-grid').join('|') === 'card-apob|card-glucose|card-empty'
      && cardOrder('secondary-grid').join('|') === 'card-secondary-rec|card-secondary-empty';
    outcomes.firstNudgeIsStoredAndIncludesPluralMarkerCopy =
      localStorage.getItem('labcharts-rec-nudge-seen') === '1'
      && window.__chartRecNotifications.length === 1
      && window.__chartRecNotifications[0].type === 'info'
      && window.__chartRecNotifications[0].message.includes('3 markers have optional tips');

    document.querySelector('#chart-rec-lipids_apob .ctx-tips-badge').click();
    outcomes.badgeClickStopsPropagationAndOpensDetailModalWithScrollRequest =
      bubbledClicks === 0
      && window.__chartRecDetailCalls.length === 1
      && window.__chartRecDetailCalls[0].id === 'lipids_apob'
      && window.__chartRecDetailCalls[0].options.scrollToRec === true;

    await chartCardRecs.loadChartCardRecs();
    outcomes.repeatLoadDoesNotDuplicateBadgesOrRepeatSeenNudge =
      document.querySelectorAll('[id^="chart-rec-"] .ctx-tips-badge').length === 3
      && window.__chartRecNotifications.length === 1;

    localStorage.removeItem('labcharts-rec-nudge-seen');
    document.getElementById('modal-overlay').classList.add('show');
    await chartCardRecs.loadChartCardRecs();
    outcomes.openModalSuppressesOneTimeNudge =
      localStorage.getItem('labcharts-rec-nudge-seen') == null
      && window.__chartRecNotifications.length === 1;

    outcomes.allOutcomesReached = true;
    return outcomes;
  }, {
    chartCardRecsUrl: moduleUrl('/js/chart-card-recs.js'),
  });

  const expectedOutcomeKeys = [
    'disabledProductRecsReturnBeforeLoadingCatalog',
    'missingCatalogLoaderReturnsWithoutMutatingCards',
    'catalogWithoutSlotsReturnsWithoutMutatingCards',
    'badgesRenderForMatchingSlotsAndReorderWithinEachGrid',
    'firstNudgeIsStoredAndIncludesPluralMarkerCopy',
    'badgeClickStopsPropagationAndOpensDetailModalWithScrollRequest',
    'repeatLoadDoesNotDuplicateBadgesOrRepeatSeenNudge',
    'openModalSuppressesOneTimeNudge',
    'allOutcomesReached',
  ];
  expect(Object.keys(results)).toEqual(expectedOutcomeKeys);
  for (const [name, passed] of Object.entries(results)) {
    expect.soft(passed, name).toBe(true);
  }
});
