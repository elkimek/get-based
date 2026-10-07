// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import { applyDotColor, applyAISummary, applyAIProfileSummary } from '../js/context-card-health-dots.js';
import { contextCardStatus, contextCardStatusTicket, publishContextCardStatus, subscribeContextCardStatus } from '../js/context-card-status.js';
import { ensureContextCardStatus } from '../js/context-card-status-view.js';
import { renderProfileContextCards, loadContextCardTips } from '../js/context-cards.js';
import { configureRecommendationModuleBridge } from '../js/recommendations-runtime.js';
import { contextStatusElement } from './helpers/context-card-status-fixture.js';
let bridge: ReturnType<typeof configureRecommendationModuleBridge> | null = null;
function render(): HTMLElement {
  const host = document.createElement('div'); host.innerHTML = renderProfileContextCards(); document.body.append(host); ensureContextCardStatus(); return host;
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  document.body.replaceChildren(); globalThis.dispatchEvent(new Event('labcharts-profile-switched'));
  state.profileSex = null; state.profileDob = null;
  state.currentProfile = 'status-owner'; state.importedData = createDefaultProfileData(); state.importedData.diet = { breakfast: 'Reported eggs' };
});
afterEach(async () => {
  if (bridge) configureRecommendationModuleBridge(bridge); bridge = null;
  document.body.replaceChildren(); await Promise.resolve();
});
describe('authored context assessment ownership', () => {
  it('does not create a browser observer when no authored status view is mounted', () => {
    ensureContextCardStatus();
    vi.stubGlobal('MutationObserver', undefined);
    try { expect(() => ensureContextCardStatus()).not.toThrow(); }
    finally { vi.unstubAllGlobals(); }
  });
  it('updates every simultaneous catalog literally without replacing controls', () => {
    const first = render(), second = render(), control = first.querySelector('button');
    applyDotColor('diet', 'yellow'); applyAISummary('diet', '<img onerror=evil> & tip', 'yellow'); applyAIProfileSummary('diet', '<reported food>');
    for (const host of [first, second]) {
      expect(contextStatusElement('health', 'diet', host)?.hidden).toBe(false);
      expect(contextStatusElement('health-label', 'diet', host)?.textContent).toBe('Caution');
      expect(contextStatusElement('summary', 'diet', host)?.textContent).toBe('<reported food>');
      expect(contextStatusElement('ai', 'diet', host)?.textContent).toContain('<img onerror=evil> & tip');
      expect(host.querySelector('img, reported')).toBeNull();
    }
    expect(first.querySelector('button')).toBe(control);
    const ids = [...document.querySelectorAll<HTMLElement>('[id]')].map(el => el.id); expect(new Set(ids).size).toBe(ids.length);
  });
  it('reapplies the current assessment after a catalog rebuild and restores local summaries', () => {
    const first = render(), local = contextStatusElement('summary', 'diet', first)!.dataset.localSummary;
    applyAIProfileSummary('diet', 'Summarized report'); first.remove();
    const replacement = render(); expect(contextStatusElement('summary', 'diet', replacement)?.textContent).toBe('Summarized report');
    applyAIProfileSummary('diet', ''); expect(contextStatusElement('summary', 'diet', replacement)?.textContent).toBe(local);
    expect(contextStatusElement('summary', 'diet', replacement)?.dataset.summarySource).toBe('local');
  });
  it.each(['facts', 'notes', 'sex', 'dob'])('does not revive an old assessment after %s change in the same data lifetime', change => {
    render(); applyDotColor('diet', 'green'); applyAIProfileSummary('diet', 'Old reported summary'); applyAISummary('diet', 'Old assessment', 'green');
    if (change === 'facts') state.importedData.diet!.breakfast = 'Reported oats';
    if (change === 'notes') state.importedData.contextNotes = 'New relevant context';
    if (change === 'sex') state.profileSex = 'female';
    if (change === 'dob') state.profileDob = '1990-01-01';
    const current = render(); expect(contextStatusElement('health', 'diet', current)?.hidden).toBe(true);
    expect(contextStatusElement('summary', 'diet', current)?.textContent).not.toBe('Old reported summary');
    expect(contextStatusElement('ai', 'diet', current)?.textContent).not.toContain('Old assessment');
  });
  it('does not publish new profile assessments into an old still-connected catalog', () => {
    const old = render(); state.currentProfile = 'replacement'; state.importedData = createDefaultProfileData();
    const current = render(); applyDotColor('diet', 'red'); applyAISummary('diet', 'Current only', 'red');
    expect(contextStatusElement('health', 'diet', current)?.hidden).toBe(false);
    expect(contextStatusElement('ai', 'diet', current)?.textContent).toContain('Current only');
    expect(old.textContent).not.toContain('Current only');
  });
  it('retires tickets after a profile event even when the data object is reused', () => {
    const ticket = contextCardStatusTicket(); const old = render();
    globalThis.dispatchEvent(new Event('labcharts-profile-switched'));
    expect(publishContextCardStatus('diet', { insight: 'Retired' }, ticket)).toBe(false);
    render(); applyAISummary('diet', 'New session', 'green'); expect(old.textContent).not.toContain('New session');
  });
  it('disposes removed view subscriptions and does not revive detached controls', async () => {
    const host = render(); host.remove(); await Promise.resolve();
    publishContextCardStatus('diet', { insight: 'Later update' }); expect(host.textContent).not.toContain('Later update');
  });
  it('allows unsubscribe and isolates an expired presentation listener', () => {
    const broken = subscribeContextCardStatus(() => { throw new Error('Removed view'); }); const listener = vi.fn(), stop = subscribeContextCardStatus(listener);
    publishContextCardStatus('diet', { label: 'First' }); expect(listener).toHaveBeenCalledTimes(1);
    stop(); broken(); publishContextCardStatus('diet', { label: 'Second' }); expect(listener).toHaveBeenCalledTimes(1);
  });
  it('rejects a delayed recommendation catalog after a profile replacement', async () => {
    const pending = deferred(); bridge = configureRecommendationModuleBridge({ isProductRecsEnabled: () => true, loadCatalog: () => pending.promise, getCardSlotKeys: () => ['protein'] });
    render(); const load = loadContextCardTips(); state.currentProfile = 'replacement'; state.importedData = createDefaultProfileData(); const current = render();
    pending.resolve(); await load; expect(current.querySelector('.ctx-tips-badge')).toBeNull(); expect(contextCardStatus('diet').tips).toBe(false);
  });
  it('rejects a delayed recommendation catalog after disabling recommendations or replacing its bridge', async () => {
    const pending = deferred(); let enabled = true;
    bridge = configureRecommendationModuleBridge({ isProductRecsEnabled: () => enabled, loadCatalog: () => pending.promise, getCardSlotKeys: () => ['protein'] });
    const host = render(), load = loadContextCardTips(); enabled = false; pending.resolve(); await load; expect(host.querySelector('.ctx-tips-badge')).toBeNull();
    enabled = true; const next = deferred(); configureRecommendationModuleBridge({ loadCatalog: () => next.promise });
    const obsolete = loadContextCardTips(); configureRecommendationModuleBridge({ getCardSlotKeys: () => ['replacement'] });
    next.resolve(); await obsolete; expect(host.querySelector('.ctx-tips-badge')).toBeNull();
  });
  it('handles a failed recommendation load and clears disabled tips', async () => {
    let enabled = true; bridge = configureRecommendationModuleBridge({ isProductRecsEnabled: () => enabled, loadCatalog: async () => {}, getCardSlotKeys: () => ['protein'] });
    const host = render(); await loadContextCardTips(); expect(host.querySelector('.ctx-tips-badge')).not.toBeNull();
    enabled = false; await loadContextCardTips(); expect(host.querySelector('.ctx-tips-badge')).toBeNull();
    enabled = true; configureRecommendationModuleBridge({ loadCatalog: async () => { throw new Error('Catalog unavailable'); } });
    await expect(loadContextCardTips()).resolves.toBeUndefined(); expect(host.querySelector('.ctx-tips-badge')).toBeNull();
  });
  it('publishes keyboard buttons to simultaneous catalogs and removes absent recommendations', async () => {
    let keys = ['protein']; bridge = configureRecommendationModuleBridge({ isProductRecsEnabled: () => true, loadCatalog: async () => {}, getCardSlotKeys: (key: string) => key === 'diet' ? keys : [] });
    const first = render(), second = render(); await loadContextCardTips();
    for (const host of [first, second]) expect(host.querySelector<HTMLButtonElement>('.ctx-tips-badge')?.type).toBe('button');
    keys = []; await loadContextCardTips(); expect(first.querySelector('.ctx-tips-badge')).toBeNull(); expect(second.querySelector('.ctx-tips-badge')).toBeNull();
  });
});
