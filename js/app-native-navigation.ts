// Native feature owners open their own views. No model-supplied selector or write.
import { chatNavigationAllowed, CHAT_NATIVE_UI_NOTICE } from '../shared/chat-control-policy.js';
import type { AppNavigationRequest } from '../shared/app-navigation-contract.js';
import type { AppNavigationReceipt } from './app-navigation-runtime.js';
import { state } from './state.js';
const denied = (reason = 'The view or record is no longer available.'): AppNavigationReceipt => ({ changed: false, reason, dataSaved: false });
const receipt = (view: string, opened: boolean): AppNavigationReceipt => ({ changed: opened, opened: opened ? view : null, dataSaved: false, settingsSaved: false, credentialsEntered: false });
const detailOpen = () => !!document.querySelector('#modal-overlay.show #detail-modal');
export async function openAppDestination(request: AppNavigationRequest, current: () => boolean, isOwnerCurrent = current): Promise<AppNavigationReceipt> {
  const { view, card, recordId } = request;
  if (!current()) return denied('The navigation request expired.');
  if (!chatNavigationAllowed(request)) return denied(CHAT_NATIVE_UI_NOTICE);
  if (view === 'correlations') {
    await import('./compare-correlations.js'); if (!current()) return denied('The correlation view request expired.');
    const runtime = await import('./data-view-controls.js'); if (!current()) return denied();
    const rendered = await runtime.navigateDataViewOutcomeRuntime('correlations');
    const opened = rendered && isOwnerCurrent() && state.currentView === 'correlations' && !!document.querySelector('#corr-search');
    return { changed: opened, opened: opened ? 'correlations' : null, dataSaved: false };
  }
  if (view === 'category') {
    const { openLabView } = await import('./lab-view-controls.js');
    return openLabView(request, current);
  }
  if (view === 'contextEditor') {
    const { loadContextCardsModule, loadCycleModule } = await import('./health-data-loader.js');
    if (card === 'menstrualCycle') {
      const [cycle, runtime] = await Promise.all([loadCycleModule(), import('./cycle-runtime.js')]);
      await runtime.loadCycleStylesheet(); if (!current()) return denied();
      await cycle.openMenstrualCycleEditor(); return receipt(view, detailOpen());
    }
    const [cards, stylesheet] = await Promise.all([loadContextCardsModule(), import('./context-card-editor-ui.js')]);
    await stylesheet.loadContextEditorStylesheet();
    // Preload nested facades before the final guard so their first open cannot
    // publish into a conversation selected while the implementation was loading.
    if (card === 'diagnoses') await (await import('./context-card-medical-history-editor.js')).loadMedicalHistoryEditor();
    else await (await import('./context-card-lifestyle-editors.js')).loadLifestyleContextEditors();
    if (!current()) return denied();
    const opens: Record<string, (() => unknown) | undefined> = { diet: cards.openDietEditor, sleepRest: cards.openSleepRestEditor, exercise: cards.openExerciseEditor,
      stress: cards.openStressEditor, loveLife: cards.openLoveLifeEditor, environment: cards.openEnvironmentEditor, lightCircadian: cards.openLightCircadianEditor,
      diagnoses: cards.openDiagnosesEditor, healthGoals: cards.openHealthGoalsEditor, interpretiveLens: cards.openInterpretiveLensEditor };
    const open = card ? opens[card] : null; if (!open) return denied('Choose a declared context card.');
    await open(); return receipt(view, detailOpen());
  }
  if (['nutritionHistory', 'nutritionEditor', 'nutritionTargets', 'fluidLog'].includes(view)) {
    const loader = await import('./nutrition-context.js'), nutrition = await loader.loadNutritionFeature();
    if (!current()) return denied();
    if (view === 'nutritionHistory') {
      const history = await import('./nutrition-history.js'); if (!current()) return denied();
      const opened = await history.openNutritionHistory(undefined, { persistPreferences: false }, current);
      return receipt(view, opened);
    }
    if (view === 'nutritionTargets') return receipt(view, await nutrition.openNutritionTargets({}, current));
    if (view === 'fluidLog') return receipt(view, await nutrition.openFluidLog(current));
    let meal;
    if (recordId) {
      meal = (await (await import('./nutrition-record-store.js')).readCurrentNutritionRecords(state.currentProfile)).find(row => row.id === recordId);
      if (!current() || !meal) return denied('That exact meal no longer exists. No new meal was created.');
    }
    if (!current()) return denied();
    return receipt(view, await nutrition.openNutritionEditor(meal ? { mode: 'edit', seedMeal: meal } : {}, isOwnerCurrent));
  }
  if (view === 'emfAssessment') {
    const runtime = await import('./emf-runtime.js'); if (!current()) return denied();
    const exists = () => !recordId || state.importedData.emfAssessment?.assessments?.some((row: { id: string }) => row.id === recordId) === true;
    if (!exists()) return denied('That exact EMF assessment no longer exists.');
    await runtime.openEMFAssessmentEditor({ isCurrent: () => current() && exists(), ...(recordId ? { assessmentId: recordId } : {}) });
    return receipt(view, detailOpen());
  }
  if (['lightDevice', 'sunSession', 'deviceSession', 'lightAssessment'].includes(view)) {
    const loader = await import('./light-sun-loader.js'); await loader.loadLightSunUI();
    if (!current()) return denied();
    if (view === 'lightDevice') {
      const devices = await import('./light-device-modal-loader.js'); if (!current()) return denied();
      if (!state.importedData.lightDevices?.some((row: { id: string }) => row.id === recordId)) return denied('That exact light device no longer exists.');
      if (!/^(I|II|III|IV|V|VI)$/.test(String(state.importedData.sunDefaults?.fitzpatrick || ''))) return denied('Confirm your skin type in native Light setup before opening a device session.');
      return receipt(view, await devices.openDeviceSessionDialog(recordId, { isCurrent: current, hydrate: false }) !== false);
    }
    if (view === 'lightAssessment') {
      const environment = await import('./light-env.js'); if (!current()) return denied();
      environment.openLightEnvironmentAssessment(); return receipt(view, !!document.querySelector('.light-env-assessment-overlay.show'));
    }
    if (view === 'sunSession') {
      const session = state.importedData.sunSessions?.find((row: { id: string }) => row.id === recordId);
      if (!session) return denied('That exact sunlight session no longer exists.');
      const ui = await import('./sun-session-ui.js'); if (!current() || !state.importedData.sunSessions?.includes(session)) return denied();
      const opened = ui.openSunSessionDetail(recordId); return receipt(view, !!opened?.isConnected && opened.classList.contains('show'));
    }
    const session = state.importedData.deviceSessions?.find((row: { id: string }) => row.id === recordId);
    if (!session) return denied('That exact device session no longer exists.');
    const ui = await import('./light-devices.js'); if (!current() || !state.importedData.deviceSessions?.includes(session)) return denied();
    const opened = ui.openDeviceSessionDetail(recordId); return receipt(view, !!opened?.isConnected && opened.classList.contains('show'));
  }
  return denied('This native destination is not supported.');
}
