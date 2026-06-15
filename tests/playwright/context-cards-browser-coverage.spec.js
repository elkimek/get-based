import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?contextCardsCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function expectAll(outcomes) {
  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
}

test('context cards browser coverage exercises notes save dots and tips', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ cardsUrl }) => {
    const [{ state }, cards] = await Promise.all([
      import('/js/state.js'),
      import(cardsUrl),
    ]);
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const outcomes = {};
    const calls = [];
    const saved = {
      importedData: clone(state.importedData),
      closeModal: window.closeModal,
      navigate: window.navigate,
      onContextCardSaved: window.onContextCardSaved,
      isProductRecsEnabled: window.isProductRecsEnabled,
      loadCatalog: window.loadCatalog,
      getCardSlotKeys: window.getCardSlotKeys,
      renderCardTipsModal: window.renderCardTipsModal,
      aiProvider: localStorage.getItem('labcharts-ai-provider'),
      aiPaused: localStorage.getItem('labcharts-ai-paused'),
      detailsOpen: sessionStorage.getItem('welcome-details-open'),
    };
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
        diet: { type: 'omnivore', breakfast: 'eggs' },
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
      const notes = document.getElementById('ctx-notes-textarea');
      notes.value = 'Extra context for AI';
      notes.dispatchEvent(new InputEvent('input', { bubbles: true }));
      await waitFor(() => state.importedData.contextNotes === 'Extra context for AI'
        && (state.importedData.changeHistory || []).some(entry => entry.field === 'contextNotes'));
      outcomes.delegatedContextNotesPersistsAndRecordsChange = state.importedData.contextNotes === 'Extra context for AI'
        && (state.importedData.changeHistory || []).some(entry => entry.field === 'contextNotes');

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
      window.closeModal = () => calls.push(['close']);
      window.navigate = category => calls.push(['navigate', category]);
      window.onContextCardSaved = () => calls.push(['saved']);
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

      window.isProductRecsEnabled = () => true;
      window.loadCatalog = async () => calls.push(['catalog']);
      window.getCardSlotKeys = key => key === 'diet' ? ['protein'] : [];
      window.renderCardTipsModal = key => `<div class="tips-modal" data-card="${key}">Tips for ${key}</div>`;
      host.innerHTML = cards.renderProfileContextCards();
      await window.loadContextCardTips();
      const dietBadge = document.querySelector('#ctx-tips-diet .ctx-tips-badge');
      dietBadge?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      outcomes.cardTipsBadgeLoadsCatalogAndOpensModal = calls.some(call => call[0] === 'catalog')
        && !!dietBadge
        && document.getElementById('modal-overlay')?.classList.contains('show') === true
        && document.getElementById('detail-modal')?.textContent.includes('Tips for diet');
    } finally {
      state.importedData = saved.importedData;
      if (saved.closeModal) window.closeModal = saved.closeModal;
      else delete window.closeModal;
      if (saved.navigate) window.navigate = saved.navigate;
      else delete window.navigate;
      if (saved.onContextCardSaved) window.onContextCardSaved = saved.onContextCardSaved;
      else delete window.onContextCardSaved;
      if (saved.isProductRecsEnabled) window.isProductRecsEnabled = saved.isProductRecsEnabled;
      else delete window.isProductRecsEnabled;
      if (saved.loadCatalog) window.loadCatalog = saved.loadCatalog;
      else delete window.loadCatalog;
      if (saved.getCardSlotKeys) window.getCardSlotKeys = saved.getCardSlotKeys;
      else delete window.getCardSlotKeys;
      if (saved.renderCardTipsModal) window.renderCardTipsModal = saved.renderCardTipsModal;
      else delete window.renderCardTipsModal;
      if (saved.aiProvider == null) localStorage.removeItem('labcharts-ai-provider');
      else localStorage.setItem('labcharts-ai-provider', saved.aiProvider);
      if (saved.aiPaused == null) localStorage.removeItem('labcharts-ai-paused');
      else localStorage.setItem('labcharts-ai-paused', saved.aiPaused);
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
