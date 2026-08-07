import { expect, test } from './coverage-fixture.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axeScriptPath = require.resolve('axe-core/axe.min.js');

function moduleUrl(path) {
  return `${path}?contextCardsCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function expectAll(outcomes) {
  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
}

test('context cards browser coverage exercises notes save dots and tips', async ({ page }) => {
  await page.addInitScript({ path: axeScriptPath });
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ cardsUrl }) => {
    const [{ state }, cards, recommendationRuntime, contextCardsRuntime, health, cryptoStore] = await Promise.all([
      import('/js/state.js'),
      import(cardsUrl),
      import('/js/recommendations-runtime.js'),
      import('/js/context-cards-runtime.js'),
      import('/js/context-card-health-dots.js'),
      import('/js/crypto.js'),
    ]);
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const outcomes = {};
    const calls = [];
    const saved = {
      importedData: clone(state.importedData),
      aiProvider: localStorage.getItem('labcharts-ai-provider'),
      aiPaused: localStorage.getItem('labcharts-ai-paused'),
      openRouterKeyCache: cryptoStore.getCachedKey('labcharts-openrouter-key'),
      openRouterModel: localStorage.getItem('labcharts-openrouter-model'),
      detailsOpen: sessionStorage.getItem('welcome-details-open'),
    };
    let previousRecommendationBridge = null;
    let previousContextCardsRuntime = null;
    let host = null;
    let injectedNav = null;
    let details = null;
    let activeNavEls = [];
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate, attempts = 80, delayMs = 25) => {
      for (let i = 0; i < attempts; i += 1) {
        if (predicate()) return true;
        await wait(delayMs);
      }
      return false;
    };
    const toasts = () => Array.from(document.querySelectorAll('.notification-toast')).map(el => el.textContent || '');

    try {
      localStorage.removeItem('labcharts-ai-provider');
      localStorage.setItem('labcharts-ai-paused', 'true');
      sessionStorage.removeItem('welcome-details-open');
      state.importedData = {
        ...state.importedData,
        entries: [],
        contextNotes: '',
        healthGoals: [{ text: 'Improve sleep', severity: 'major' }],
        stress: { level: 'high', sources: ['work'], management: ['walks'], note: '' },
        diet: { type: 'omnivore', breakfast: 'Spinach', lunch: 'Canned soup' },
      };

      if (!document.getElementById('modal-overlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'modal-overlay';
        document.body.appendChild(overlay);
      }
      if (!document.getElementById('detail-modal')) {
        const modal = document.createElement('div');
        modal.id = 'detail-modal';
        document.getElementById('modal-overlay').appendChild(modal);
      }

      host = document.createElement('div');
      document.body.appendChild(host);
      host.innerHTML = '<span id="ctx-dot-diet" class="ctx-health-dot"></span><span id="ctx-ai-diet"></span>';

      cards.applyDotColor('diet', 'red');
      cards.applyAISummary('diet', 'Needs more protein', 'red');
      outcomes.facadeAppliesDotAndAISummary = document.getElementById('ctx-dot-diet')?.classList.contains('ctx-health-dot-red') === true
        && document.getElementById('ctx-dot-diet')?.getAttribute('aria-label') === 'Concern'
        && document.getElementById('ctx-ai-diet')?.classList.contains('ctx-ai-summary-visible') === true
        && document.getElementById('ctx-ai-diet')?.classList.contains('ctx-ai-summary-red') === true
        && document.getElementById('ctx-ai-diet')?.textContent.includes('Needs more protein');

      cards.refreshAllHealthDots();
      outcomes.refreshAllHealthDotsRequiresProviderViaFacade = toasts().some(text => text.includes('Set up an AI provider first'));
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());

      host.innerHTML = cards.renderProfileContextCards();
      outcomes.profileContextCardsUseDelegatedActions =
        !!host.querySelector('[data-context-card-action="refresh-all-health-dots"], [data-context-card-action="open-editor"]')
        && !!host.querySelector('#ctx-notes-textarea[data-context-card-action="context-notes-input"]')
        && !host.innerHTML.includes('onclick=')
        && !host.innerHTML.includes('oninput=');
      host.style.width = '860px';
      cards.applyDotColor('loveLife', 'green');
      const loveLifeLabel = host.querySelector('[data-context-card-key="loveLife"] .context-card-label');
      const loveLifeLineHeight = loveLifeLabel ? Number.parseFloat(getComputedStyle(loveLifeLabel).lineHeight) : 0;
      outcomes.loveLifeAndRelationshipsStaysAUnifiedCardTitle = !!loveLifeLabel
        && getComputedStyle(loveLifeLabel).whiteSpace === 'nowrap'
        && loveLifeLabel.getBoundingClientRect().height <= loveLifeLineHeight * 1.1;
      host.style.width = '';
      const infoButton = host.querySelector('[data-context-card-action="toggle-explanation"]');
      const explanation = infoButton?.getAttribute('aria-controls')
        ? document.getElementById(infoButton.getAttribute('aria-controls'))
        : null;
      infoButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      outcomes.profileContextCardsExposeAccessibleStructureAndExplanations =
        host.querySelectorAll('article.context-card').length === 9
        && host.querySelector('.context-progress-text')?.textContent.includes('of 9 added')
        && host.querySelectorAll('button.context-card-open[data-context-card-action="open-editor"]').length === 9
        && host.querySelectorAll('.context-card-icon svg').length === 9
        && host.querySelector('button.context-card-open')?.getAttribute('aria-label')?.includes('Health Goals')
        && host.querySelector('label[for="ctx-notes-textarea"]')?.textContent.includes('Additional context')
        && infoButton?.getAttribute('aria-expanded') === 'true'
        && explanation?.hidden === false
        && !host.querySelector('.context-card-state, .diagnoses-edit-btn')
        && !host.querySelector('article.context-card[data-context-card-action="open-editor"]');
      cards.applyDotColor('diet', 'yellow');
      outcomes.profileContextCardsExposeTextForAIAssessment =
        document.getElementById('ctx-health-diet')?.hidden === false
        && !!document.getElementById('ctx-health-diet')?.closest('.context-card-title')
        && document.getElementById('ctx-health-label-diet')?.textContent === 'Caution'
        && document.getElementById('ctx-dot-diet')?.getAttribute('aria-hidden') === 'true';
      cards.applyAISummary('healthGoals', 'Goal aligns with the current profile', 'green');
      cards.applyAISummary('diagnoses', 'History changes how borderline thyroid markers should be read', 'yellow');
      cards.applyAISummary('diet', 'Diet signals may affect nutrient interpretation', 'yellow');
      const firstRowInsightTops = ['healthGoals', 'diagnoses', 'diet']
        .map(key => document.getElementById(`ctx-ai-${key}`)?.getBoundingClientRect().top || 0);
      const firstRowInsightsAlign = Math.max(...firstRowInsightTops) - Math.min(...firstRowInsightTops) < 1;
      const dietInsight = document.getElementById('ctx-ai-diet');
      const dietContaminants = host.querySelector('.diet-contaminants');
      const dietPreDividerGap = dietInsight && dietContaminants
        ? dietInsight.getBoundingClientRect().top - dietContaminants.getBoundingClientRect().bottom
        : 0;
      outcomes.aiInsightFootnotesAlignDespiteVariableContent = firstRowInsightsAlign
        && getComputedStyle(dietInsight).borderTopStyle === 'solid'
        && dietInsight?.dataset.severity === 'Caution'
        && dietPreDividerGap >= 7
        && !!dietContaminants?.querySelector('svg');
      const accessibility = await window.axe.run(host, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      });
      outcomes.profileContextCardsHaveNoAxeViolations = accessibility.violations.length === 0;

      const previousDemoHealthDeps = health.configureContextCardHealthDots({ isActiveDemoProfile: () => true });
      const previousDemoRuntime = contextCardsRuntime.configureContextCardsRuntimeCallbacks({
        navigate: category => calls.push(['demo-navigate', category]),
      });
      localStorage.setItem('labcharts-ai-provider', 'openrouter');
      localStorage.removeItem('labcharts-ai-paused');
      localStorage.setItem('labcharts-openrouter-model', 'openai/gpt-5.4');
      cryptoStore.updateKeyCache('labcharts-openrouter-key', 'demo-consent-ui-key');
      host.innerHTML = cards.renderProfileContextCards();
      const demoAccessibility = await window.axe.run(host, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      });
      outcomes.demoAIStatusControlsHaveNoAxeViolations = demoAccessibility.violations.length === 0;
      const enableDemoAI = host.querySelector('[data-context-card-action="enable-demo-live-ai"]');
      enableDemoAI?.click();
      await waitFor(() => document.getElementById('confirm-dialog-overlay')?.classList.contains('show') === true);
      outcomes.paidDemoAIShowsExplicitCostConfirmation = !!enableDemoAI
        && document.querySelector('#confirm-dialog-overlay .confirm-message')?.textContent.includes('may use paid tokens')
        && document.getElementById('confirm-ok')?.textContent.includes('Enable live AI')
        && health.getDemoContextAIMode().mode === 'paid-off';
      document.getElementById('confirm-ok')?.click();
      await waitFor(() => health.getDemoContextAIMode().mode === 'paid-live');
      host.innerHTML = cards.renderProfileContextCards();
      const disableDemoAI = host.querySelector('[data-context-card-action="disable-demo-live-ai"]');
      disableDemoAI?.click();
      outcomes.paidDemoAIConsentIsVisibleAndReversible = !!disableDemoAI
        && health.getDemoContextAIMode().mode === 'paid-off'
        && calls.some(call => call[0] === 'demo-navigate');
      contextCardsRuntime.configureContextCardsRuntimeCallbacks(previousDemoRuntime);
      health.configureContextCardHealthDots(previousDemoHealthDeps);
      cryptoStore.updateKeyCache('labcharts-openrouter-key', saved.openRouterKeyCache);
      if (saved.openRouterModel == null) localStorage.removeItem('labcharts-openrouter-model');
      else localStorage.setItem('labcharts-openrouter-model', saved.openRouterModel);
      localStorage.removeItem('labcharts-ai-provider');
      localStorage.setItem('labcharts-ai-paused', 'true');

      host.querySelector('button.context-card-open')?.click();
      outcomes.wholeCardActionOpensItsEditor = await waitFor(
        () => document.getElementById('detail-modal')?.getAttribute('aria-label') === 'Health Goals',
      );
      cards.closeHealthGoals();
      const notes = document.getElementById('ctx-notes-textarea');
      notes.value = 'Extra context for AI';
      notes.dispatchEvent(new InputEvent('input', { bubbles: true }));
      outcomes.contextNotesShowsSavingState = document.getElementById('ctx-notes-status')?.textContent === 'Saving\u2026';
      await waitFor(() => state.importedData.contextNotes === 'Extra context for AI'
        && (state.importedData.changeHistory || []).some(entry => entry.field === 'contextNotes'));
      outcomes.delegatedContextNotesPersistsAndRecordsChange = state.importedData.contextNotes === 'Extra context for AI'
        && (state.importedData.changeHistory || []).some(entry => entry.field === 'contextNotes')
        && document.getElementById('ctx-notes-status')?.textContent === 'Saved';

      details = document.createElement('details');
      details.className = 'welcome-context-details';
      details.open = true;
      document.body.appendChild(details);
      activeNavEls = Array.from(document.querySelectorAll('.nav-item.active'));
      activeNavEls.forEach(el => el.classList.remove('active'));
      injectedNav = document.createElement('button');
      injectedNav.className = 'nav-item active';
      injectedNav.dataset.category = 'body';
      document.body.appendChild(injectedNav);
      previousContextCardsRuntime = contextCardsRuntime.configureContextCardsRuntimeCallbacks({
        closeModal: () => calls.push(['close']),
        navigate: category => calls.push(['navigate', category]),
        onContextCardSaved: () => calls.push(['saved']),
      });
      state.importedData.stress = { level: 'moderate', sources: ['work'], management: ['walks'], note: '' };
      const saveBefore = calls.length;
      cards.saveAndRefresh('Stress profile saved', 'stress');
      await wait(0);
      const saveCalls = calls.slice(saveBefore);
      outcomes.saveAndRefreshRecordsClosesNotifiesAndNavigates = sessionStorage.getItem('welcome-details-open') === '1'
        && (state.importedData.changeHistory || []).some(entry => entry.field === 'stress')
        && saveCalls.some(call => call[0] === 'close')
        && saveCalls.some(call => call[0] === 'saved')
        && saveCalls.some(call => call[0] === 'navigate' && call[1] === 'body')
        && toasts().some(text => text.includes('Stress profile saved'));
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());

      previousRecommendationBridge = recommendationRuntime.configureRecommendationModuleBridge({
        isProductRecsEnabled: () => true,
        loadCatalog: async () => calls.push(['catalog']),
        getCardSlotKeys: key => key === 'diet' ? ['protein'] : [],
        renderCardTipsModal: key => `<div class="tips-modal" data-card="${key}">Tips for ${key}</div>`,
      });
      host.innerHTML = cards.renderProfileContextCards();
      await cards.loadContextCardTips();
      const dietBadge = document.querySelector('#ctx-tips-diet .ctx-tips-badge');
      dietBadge?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await waitFor(() => document.getElementById('modal-overlay')?.classList.contains('show') === true);
      outcomes.cardTipsBadgeLoadsCatalogAndOpensModal = calls.some(call => call[0] === 'catalog')
        && !!dietBadge
        && document.getElementById('modal-overlay')?.classList.contains('show') === true
        && document.getElementById('detail-modal')?.textContent.includes('Tips for diet');
      outcomes.contextCardApisStayModuleOnly = [
        'openContextModal',
        'openDietEditor',
        'recordChange',
        'triggerDNAFilePicker',
        'loadContextCardTips',
      ].every(name => typeof cards[name] === 'function' && !(name in window));
      outcomes.recommendationHooksStayModuleOnly = [
        'isProductRecsEnabled', 'loadCatalog', 'getCardSlotKeys', 'renderCardTipsModal',
      ].every(name => !(name in window));
    } finally {
      state.importedData = saved.importedData;
      if (previousContextCardsRuntime) {
        contextCardsRuntime.configureContextCardsRuntimeCallbacks(previousContextCardsRuntime);
      }
      if (previousRecommendationBridge) {
        recommendationRuntime.configureRecommendationModuleBridge(previousRecommendationBridge);
      }
      if (saved.aiProvider == null) localStorage.removeItem('labcharts-ai-provider');
      else localStorage.setItem('labcharts-ai-provider', saved.aiProvider);
      if (saved.aiPaused == null) localStorage.removeItem('labcharts-ai-paused');
      else localStorage.setItem('labcharts-ai-paused', saved.aiPaused);
      cryptoStore.updateKeyCache('labcharts-openrouter-key', saved.openRouterKeyCache);
      if (saved.openRouterModel == null) localStorage.removeItem('labcharts-openrouter-model');
      else localStorage.setItem('labcharts-openrouter-model', saved.openRouterModel);
      if (saved.detailsOpen == null) sessionStorage.removeItem('welcome-details-open');
      else sessionStorage.setItem('welcome-details-open', saved.detailsOpen);
      host?.remove();
      injectedNav?.remove();
      details?.remove();
      document.querySelectorAll('.notification-container,.notification-toast').forEach(el => el.remove());
      document.getElementById('modal-overlay')?.classList.remove('show');
      document.querySelectorAll('.nav-item.active').forEach(el => el.classList.remove('active'));
      activeNavEls.forEach(el => el.classList.add('active'));
    }

    return outcomes;
  }, { cardsUrl: moduleUrl('/js/context-cards.js') });

  expectAll(results);
});
