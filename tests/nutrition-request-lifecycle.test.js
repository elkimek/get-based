// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ files: vi.fn(), analyze: vi.fn(), notify: vi.fn(), open: vi.fn() }));
vi.mock('../js/nutrition-analysis.js', () => ({ mealAnalysisFiles: mocks.files, analyzeMealPhoto: mocks.analyze }));
vi.mock('../js/utils.js', () => ({ showNotification: mocks.notify }));
vi.mock('../js/modal-lifecycle.js', () => ({ openModalOverlay: mocks.open }));
import { state } from '../js/state.js';
import { configureNutritionRequestLifecycle, runNutritionMealAnalysis, cancelNutritionMealAnalysis,
  resetNutritionRequestLifecycle, startNutritionComparisonRequest, finishNutritionComparisonRequest,
  isNutritionComparisonRequestActive, beginNutritionBackgroundSession, isNutritionBackgroundSession,
  resumeNutritionBackgroundSession } from '../js/nutrition-request-lifecycle.js';
let deps, modal, overlay;
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
beforeEach(() => {
  resetNutritionRequestLifecycle(); vi.resetAllMocks();
  state.currentProfile = 'a'; state.importedData = { entries: [] };
  document.body.innerHTML = '<div id="modal-overlay"></div><div id="detail-modal" class="modal nutrition-modal"><input id="nutrition-photo-input"><div id="nutrition-comparison-return"></div></div>';
  modal = document.getElementById('detail-modal'); overlay = document.getElementById('modal-overlay');
  deps = Object.fromEntries(['applyAnalysis','focusReview','setStatus','updateProgress','finishProgress','isAnalysisRunning','isComparisonRunning','hasPendingAnalysis'].map(k => [k,vi.fn()]));
  Object.assign(deps, {selectedPhotos: () => ['photo'], getExistingImages: () => [], getAnalysisKind: () => 'meal-photo', getConsumption: () => ({amount:2,unit:'servings'}), getUserContext: () => 'context', getCorrectionContext: () => 'correction', startProgress: vi.fn(() => 'progress')});
  configureNutritionRequestLifecycle(deps);
  mocks.files.mockResolvedValue(['file']); mocks.analyze.mockResolvedValue({name:'meal'});
});
afterEach(() => resetNutritionRequestLifecycle());
it('applies a successful result and releases progress', async () => {
  await runNutritionMealAnalysis();
  expect(deps.applyAnalysis).toHaveBeenCalledWith({name:'meal'});
  expect(deps.focusReview).toHaveBeenCalledOnce();
  expect(deps.finishProgress).toHaveBeenCalledWith('progress',true,null);
  expect(overlay.hasAttribute('data-modal-background-dismissible')).toBe(false);
  expect(mocks.analyze.mock.calls[0][1]).toMatchObject({consumedAmount:2,consumedUnit:'servings',userContext:'context\ncorrection'});
});
it.each([['meal-photo','','Analyzing…'],['nutrition-label','','Scanning…'],['meal-photo','Soup','Recalculating…']])('labels %s correction %s', async (kind,corrected,label) => {
  deps.getAnalysisKind = () => kind; configureNutritionRequestLifecycle(deps);
  await runNutritionMealAnalysis({correctedMealName:corrected,previousMealName:'old'});
  expect(deps.startProgress).toHaveBeenCalledWith(null,label);
  expect(mocks.analyze.mock.calls[0][1]).toMatchObject({correctedMealName:corrected,previousMealName:'old'});
});
it('does not contact a provider without photos', async () => {
  mocks.files.mockResolvedValue([]); await runNutritionMealAnalysis();
  expect(mocks.analyze).not.toHaveBeenCalled(); expect(mocks.notify).toHaveBeenCalledOnce();
  expect(cancelNutritionMealAnalysis()).toBe(false);
});
it.each(['files','analyze'])('handles %s failure and permits retry', async stage => {
  mocks[stage].mockRejectedValueOnce(new Error('failure'));
  await expect(runNutritionMealAnalysis()).resolves.toBeUndefined();
  expect(deps.setStatus).toHaveBeenCalledWith('failure','error');
  await runNutritionMealAnalysis(); expect(deps.applyAnalysis).toHaveBeenCalledOnce();
});
it.each(['files','analyze'])('cancels during %s and ignores late completion', async stage => {
  const gate=deferred(); mocks[stage].mockReturnValueOnce(gate.promise);
  const pending=runNutritionMealAnalysis(); await vi.waitFor(() => expect(mocks[stage]).toHaveBeenCalled());
  expect(cancelNutritionMealAnalysis()).toBe(true); expect(cancelNutritionMealAnalysis()).toBe(false);
  gate.resolve(stage==='files'?['old']:{name:'old'}); await pending;
  expect(deps.applyAnalysis).not.toHaveBeenCalled();
  if(stage==='files') expect(mocks.analyze).not.toHaveBeenCalled();
});
it.each(['files','analyze'])('reset invalidates pending %s work', async stage => {
  const gate=deferred(); mocks[stage].mockReturnValueOnce(gate.promise);
  const pending=runNutritionMealAnalysis(); await vi.waitFor(() => expect(mocks[stage]).toHaveBeenCalled());
  resetNutritionRequestLifecycle(); gate.resolve(stage==='files'?['old']:{name:'old'}); await pending;
  expect(deps.applyAnalysis).not.toHaveBeenCalled(); expect(deps.finishProgress).not.toHaveBeenCalled();
});
it.each(['files','analyze'])('new request wins when older %s work completes last', async stage => {
  const gate=deferred(); mocks[stage].mockReturnValueOnce(gate.promise);
  const old=runNutritionMealAnalysis(); await vi.waitFor(() => expect(mocks[stage]).toHaveBeenCalled());
  await runNutritionMealAnalysis(); gate.resolve(stage==='files'?['old']:{name:'old'}); await old;
  expect(deps.applyAnalysis.mock.calls).toEqual([[{name:'meal'}]]);
  expect(deps.finishProgress).toHaveBeenCalledOnce();
});
it.each(['files','analyze'])('profile navigation during %s cannot update destination', async stage => {
  const gate=deferred(); mocks[stage].mockReturnValueOnce(gate.promise);
  const pending=runNutritionMealAnalysis(); await vi.waitFor(() => expect(mocks[stage]).toHaveBeenCalled());
  state.currentProfile='b'; state.importedData={entries:[]};
  gate.resolve(stage==='files'?['old']:{name:'old'}); await pending;
  expect(deps.applyAnalysis).not.toHaveBeenCalled(); expect(deps.finishProgress).not.toHaveBeenCalled();
});
it('returning to the same profile does not revive an old request', async () => {
  const gate=deferred(); mocks.analyze.mockReturnValueOnce(gate.promise);
  const pending=runNutritionMealAnalysis(); await vi.waitFor(() => expect(mocks.analyze).toHaveBeenCalled());
  state.importedData={entries:[]}; gate.resolve({name:'stale'}); await pending;
  expect(deps.applyAnalysis).not.toHaveBeenCalled();
});
it('stale provider errors and progress cannot alter the destination editor', async () => {
  const gate=deferred(); mocks.analyze.mockReturnValueOnce(gate.promise);
  const pending=runNutritionMealAnalysis(); await vi.waitFor(() => expect(mocks.analyze).toHaveBeenCalled());
  state.currentProfile='b'; deps.setStatus.mockClear();
  mocks.analyze.mock.calls[0][1].onProgress('old','stale'); gate.reject(new Error('stale')); await pending;
  expect(deps.setStatus).not.toHaveBeenCalled(); expect(deps.updateProgress).not.toHaveBeenCalled();
});
it('forwards current provider progress', async () => {
  mocks.analyze.mockImplementation(async (_files,options) => { options.onProgress('parse','Parsing'); return {}; });
  await runNutritionMealAnalysis(); expect(deps.updateProgress).toHaveBeenCalledWith('progress','parse','Parsing');
});
it('comparison controllers retain dismissal until all finish', () => {
  const a=startNutritionComparisonRequest(), b=startNutritionComparisonRequest();
  finishNutritionComparisonRequest(a); expect(isNutritionComparisonRequestActive(a)).toBe(false);
  expect(isNutritionComparisonRequestActive(b)).toBe(true); expect(overlay.hasAttribute('data-modal-background-dismissible')).toBe(true);
  finishNutritionComparisonRequest(b); expect(overlay.hasAttribute('data-modal-background-dismissible')).toBe(false);
});
it('reset aborts every comparison and is repeatable', () => {
  const a=startNutritionComparisonRequest(),b=startNutritionComparisonRequest(); resetNutritionRequestLifecycle(); resetNutritionRequestLifecycle();
  expect(a.signal.aborted).toBe(true); expect(b.signal.aborted).toBe(true); expect(isNutritionComparisonRequestActive(b)).toBe(false);
});
it('parks and restores the same input nodes, values, classes and scroll', () => {
  const input=modal.querySelector('input'); input.value='draft'; modal.scrollTop=42;
  expect(beginNutritionBackgroundSession()).toBe(true); expect(beginNutritionBackgroundSession()).toBe(true);
  expect(isNutritionBackgroundSession()).toBe(true); expect(modal.childNodes).toHaveLength(0);
  expect(resumeNutritionBackgroundSession(modal,overlay)).toBe(true);
  expect(modal.querySelector('input')).toBe(input); expect(input.value).toBe('draft'); expect(modal.scrollTop).toBe(42);
  expect(isNutritionBackgroundSession()).toBe(false); expect(document.getElementById('nutrition-background-workspace')).toBeNull();
});
it('profile change discards a parked workspace and aborts comparisons', () => {
  const controller=startNutritionComparisonRequest(); beginNutritionBackgroundSession(); state.currentProfile='b';
  expect(resumeNutritionBackgroundSession(modal,overlay)).toBe(false); expect(controller.signal.aborted).toBe(true);
  expect(mocks.open).not.toHaveBeenCalled(); expect(document.getElementById('nutrition-background-workspace')).toBeNull();
});
it.each([['cancel-comparison-run','[data-nutrition-action="cancel-comparison-run"]'],['cancel-analysis','[data-nutrition-action="cancel-analysis"]']])('restores focus to %s', (action,selector) => {
  modal.insertAdjacentHTML('beforeend',`<button data-nutrition-action="${action}"></button>`); beginNutritionBackgroundSession();
  resumeNutritionBackgroundSession(modal,overlay); expect(mocks.open).toHaveBeenCalledWith(overlay,{initialFocus:selector,focusDelay:30});
});
it('does not resume without a background session', () => { expect(resumeNutritionBackgroundSession(modal,overlay)).toBe(false); expect(mocks.open).not.toHaveBeenCalled(); });
it('a failed parking attempt does not create a background session', () => {
  modal.className='modal'; expect(beginNutritionBackgroundSession()).toBe(false); expect(isNutritionBackgroundSession()).toBe(false);
});
it('returning to a reloaded profile discards its older parked draft', () => {
  beginNutritionBackgroundSession(); state.importedData={entries:[]};
  expect(resumeNutritionBackgroundSession(modal,overlay)).toBe(false); expect(mocks.open).not.toHaveBeenCalled();
});
it('repeated parking cannot transfer ownership of an existing workspace', () => {
  beginNutritionBackgroundSession(); state.currentProfile='b'; beginNutritionBackgroundSession();
  expect(resumeNutritionBackgroundSession(modal,overlay)).toBe(false);
});
it.each([['pending','#nutrition-meal-name'],['benchmark','[data-nutrition-action="return-editor"]'],['default','#nutrition-photo-input']])('restores %s focus', (mode,selector) => {
  if(mode==='pending') deps.hasPendingAnalysis.mockReturnValue(true);
  if(mode==='benchmark') modal.classList.add('nutrition-benchmark-modal');
  beginNutritionBackgroundSession(); resumeNutritionBackgroundSession(modal,overlay);
  expect(mocks.open).toHaveBeenCalledWith(overlay,{initialFocus:selector,focusDelay:30});
});
it.each(['isAnalysisRunning','isComparisonRunning'])('restored %s workspace remains background-dismissible', key => {
  deps[key].mockReturnValue(true); beginNutritionBackgroundSession(); resumeNutritionBackgroundSession(modal,overlay);
  expect(overlay.hasAttribute('data-modal-background-dismissible')).toBe(true);
  expect(overlay.hasAttribute('data-modal-dismiss-protected')).toBe(true);
});
