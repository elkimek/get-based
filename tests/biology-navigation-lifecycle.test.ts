// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configureBiologyScoreNavigation, installBiologyScoreDelegates } from '../js/biology-score-navigation.js';
import { configureBiologyScoresRuntimeDeps } from '../js/biology-scores-runtime.js';
import { state } from '../js/state.js';
import { recordRouteChange } from '../js/route-lifecycle.js';

let restore: ReturnType<typeof configureBiologyScoresRuntimeDeps> | null = null;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<main id="main-content"></main>';
  state.currentProfile = 'biology-owner'; state.currentView = 'dashboard';
  configureBiologyScoreNavigation({ retrySavedInsights: null, loadInsights: null, runEmbeddedAI: null, reconcile: null });
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
});
afterEach(() => {
  if (restore) configureBiologyScoresRuntimeDeps(restore);
  restore = null;
  configureBiologyScoreNavigation({ retrySavedInsights: null, loadInsights: null, runEmbeddedAI: null, reconcile: null });
  vi.useRealTimers(); vi.restoreAllMocks();
});
function button(action: string, id = '') {
  const element = document.createElement('button');
  element.dataset.biologyScoreAction = action; element.dataset.biologyScoreId = id;
  document.body.append(element); return element;
}
function target(id: string) {
  const element = document.createElement('article'); element.id = `biology-score-${id}`;
  const scroll = vi.fn(); element.scrollIntoView = scroll;
  document.getElementById('main-content')!.append(element);
  return scroll;
}
function pendingNavigation() {
  let complete!: (value: boolean) => void;
  const promise = new Promise<boolean>(resolve => { complete = resolve; });
  const navigate = vi.fn(() => { recordRouteChange(); state.currentView = 'biology-scores'; return promise; });
  restore = configureBiologyScoresRuntimeDeps({ navigate });
  return { complete, navigate };
}

it('installs delegated actions once and calls the current AI owner synchronously', () => {
  const first = vi.fn(async () => {}), current = vi.fn(async () => {});
  configureBiologyScoreNavigation({ retrySavedInsights: null, loadInsights: first, runEmbeddedAI: null, reconcile: null });
  installBiologyScoreDelegates(); installBiologyScoreDelegates();
  configureBiologyScoreNavigation({ retrySavedInsights: null, loadInsights: current, runEmbeddedAI: null, reconcile: null });
  button('update-score-insights').click();
  expect(first).not.toHaveBeenCalled(); expect(current.mock.calls).toEqual([[{ force: true }]]);
});

it('waits beyond the old frame window before jumping after cold navigation completes', async () => {
  const pending = pendingNavigation();
  button('jump-to-domain', 'thyroidCoherence').click();
  const scroll = target('thyroidCoherence');
  await vi.advanceTimersByTimeAsync(700);
  expect(scroll).not.toHaveBeenCalled();
  pending.complete(true); await vi.advanceTimersByTimeAsync(32);
  expect(scroll).toHaveBeenCalledExactlyOnceWith({ behavior: 'smooth', block: 'start' });
  expect(pending.navigate).toHaveBeenCalledExactlyOnceWith('biology-scores');
});

for (const change of ['profile', 'data', 'away-back', 'failed'] as const) it(`does not publish an obsolete cold jump after ${change}`, async () => {
  const pending = pendingNavigation(); button('jump-to-domain', 'ironHandling').click();
  const scroll = target('ironHandling');
  if (change === 'profile') state.currentProfile = 'replacement';
  if (change === 'data') state.importedData = { ...state.importedData };
  if (change === 'away-back') { recordRouteChange(); state.currentView = 'dashboard'; recordRouteChange(); state.currentView = 'biology-scores'; }
  pending.complete(change !== 'failed'); await vi.advanceTimersByTimeAsync(32);
  expect(scroll).not.toHaveBeenCalled();
});

it('expands and jumps immediately for an already displayed score', () => {
  state.currentView = 'biology-scores';
  const scroll = target('thyroidCoherence');
  button('jump-to-domain', 'thyroidCoherence').click();
  expect(scroll).toHaveBeenCalledExactlyOnceWith({ behavior: 'smooth', block: 'start' });
});

for (const replacement of ['data', 'root', 'body'] as const) it(`does not scroll a replacement ${replacement} between completed navigation and its animation frame`, async () => {
  const pending = pendingNavigation(); button('jump-to-domain', 'ironHandling').click();
  const originalScroll = target('ironHandling');
  pending.complete(true);
  // Resolve navigation and capture its actual rendered owner, without advancing
  // the queued animation frame that performs the eventual scroll.
  await vi.advanceTimersByTimeAsync(0);
  const main = document.getElementById('main-content')!;
  const replacementScroll = vi.fn();
  if (replacement === 'data') state.importedData = { ...state.importedData };
  else {
    const next = document.createElement('article'); next.id = 'biology-score-ironHandling'; next.scrollIntoView = replacementScroll;
    if (replacement === 'root') {
      const nextMain = document.createElement('main'); nextMain.id = 'main-content'; nextMain.append(next); main.replaceWith(nextMain);
    } else main.firstElementChild!.replaceWith(next);
  }
  await vi.advanceTimersByTimeAsync(32);
  expect(originalScroll).not.toHaveBeenCalled(); expect(replacementScroll).not.toHaveBeenCalled();
});
