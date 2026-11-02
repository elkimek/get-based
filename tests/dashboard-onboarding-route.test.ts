// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { createDefaultProfileData } from '../js/profile.js';
import { state } from '../js/state.js';
import { createNavigate } from '../js/views-router.js';
import { configureDashboardPageRuntimeDeps, createDashboardPageView } from '../js/dashboard-page-view.js';

it('releases reserved Dashboard space and cancels delayed guided Chat when the user navigates to Light', () => {
  vi.useFakeTimers();
  vi.stubGlobal('innerWidth', 1280);
  const previous = { currentView: state.currentView, currentProfile: state.currentProfile, importedData: state.importedData, chatHistory: state.chatHistory, nutritionSummary: state.nutritionSummary };
  const open = vi.fn();
  const previousRuntime = configureDashboardPageRuntimeDeps({ openChatPanel: open });
  try {
    Object.assign(state, { currentView: 'dashboard', currentProfile: 'default', importedData: createDefaultProfileData(), chatHistory: [], nutritionSummary: null });
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    document.body.innerHTML = '<main id="main-content"></main>';
    const { showDashboard } = createDashboardPageView({ setupDropZone: () => {}, projectAIConnectionReminder: () => null });
    showDashboard({ dates: [], categories: {} });
    expect(document.body.classList.contains('chat-autostart-reserved')).toBe(true);
    vi.advanceTimersByTime(799);
    expect(open).not.toHaveBeenCalled();
    const navigate = createNavigate({ routeHandlers: { light: () => { document.getElementById('main-content')!.textContent = 'Light'; } } });
    navigate('light');
    expect(document.body.classList.contains('chat-autostart-reserved')).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(open).not.toHaveBeenCalled();
    expect(state.currentView).toBe('light');
  } finally {
    configureDashboardPageRuntimeDeps(previousRuntime);
    Object.assign(state, previous);
    document.body.replaceChildren(); document.body.className = '';
    localStorage.clear(); vi.unstubAllGlobals(); vi.useRealTimers();
  }
});

it.each(['reject', 'throw', 'resize', 'mobile', 'new-render', 'profile-change', 'sync-popover', 'settings-modal', 'guard-withdrawn', 'existing-popover'] as const)('owns optional Chat startup cleanup through %s', async scenario => {
  vi.useFakeTimers(); vi.stubGlobal('innerWidth', scenario === 'mobile' ? 390 : 1280);
  const previous = {currentView: state.currentView, currentProfile: state.currentProfile, importedData: state.importedData, chatHistory: state.chatHistory, nutritionSummary: state.nutritionSummary};
  let reject!: (error: Error) => void;
  const pending = new Promise<void>((_resolve, fail) => { reject = fail; });
  const open = vi.fn((..._args: unknown[]) => { if (scenario === 'throw') throw new Error('Synthetic optional module failure'); return pending; });
  const previousRuntime = configureDashboardPageRuntimeDeps({openChatPanel: open});
  try {
    Object.assign(state, {currentView: 'dashboard', currentProfile: 'default', importedData: createDefaultProfileData(), chatHistory: [], nutritionSummary: null});
    localStorage.setItem('labcharts-default-emptyTour', 'completed'); document.body.innerHTML = '<main id="main-content"></main>';
    if(scenario==='existing-popover'){const popover=document.createElement('div');popover.id='sync-popover';document.body.append(popover);}
    const {showDashboard} = createDashboardPageView({setupDropZone: () => {}, projectAIConnectionReminder: () => null});
    showDashboard({dates: [], categories: {}});
    if(scenario==='existing-popover') expect(document.body.classList.contains('chat-autostart-reserved')).toBe(false);
    if (scenario === 'resize') vi.stubGlobal('innerWidth', 390);
    if (scenario === 'sync-popover' || scenario === 'settings-modal') { const overlay=document.createElement('div'); overlay.id=scenario; if(scenario==='settings-modal') overlay.className='modal-overlay show'; document.body.append(overlay); }
    await vi.advanceTimersByTimeAsync(800);
    if (scenario === 'guard-withdrawn') {
      const request=open.mock.calls[0]?.[1] as {canOpen?: () => boolean} | undefined;
      expect(request?.canOpen?.()).toBe(true);
      const popover=document.createElement('div');popover.id='sync-popover';document.body.append(popover);
      expect(request?.canOpen?.()).toBe(false);
    }
    if (scenario === 'new-render') showDashboard({dates: [], categories: {}});
    if (scenario === 'profile-change') state.currentProfile = 'another-profile';
    if (!['throw','resize','mobile','sync-popover','settings-modal','existing-popover'].includes(scenario)) { reject(new Error('Synthetic optional module failure')); await Promise.resolve(); }
    expect(document.body.classList.contains('chat-autostart-reserved')).toBe(scenario === 'new-render' || scenario === 'profile-change');
    expect(open).toHaveBeenCalledTimes(['resize','mobile','sync-popover','settings-modal','existing-popover'].includes(scenario) ? 0 : 1);
  } finally {
    configureDashboardPageRuntimeDeps(previousRuntime); Object.assign(state, previous);
    document.body.replaceChildren(); document.body.className = ''; localStorage.clear(); vi.clearAllTimers(); vi.unstubAllGlobals(); vi.useRealTimers();
  }
});

it.each(['profile', 'data'] as const)('does not let a retired %s Dashboard timer open Chat or consume the new reservation', field => {
  vi.useFakeTimers(); vi.stubGlobal('innerWidth', 1280);
  const previous = { currentView: state.currentView, currentProfile: state.currentProfile, importedData: state.importedData, chatHistory: state.chatHistory, nutritionSummary: state.nutritionSummary };
  const open = vi.fn(), previousRuntime = configureDashboardPageRuntimeDeps({ openChatPanel: open });
  try {
    Object.assign(state, { currentView: 'dashboard', currentProfile: 'default', importedData: createDefaultProfileData(), chatHistory: [], nutritionSummary: null });
    localStorage.setItem('labcharts-default-emptyTour', 'completed'); localStorage.setItem('labcharts-next-emptyTour', 'completed');
    document.body.innerHTML = '<main id="main-content"></main>';
    const { showDashboard } = createDashboardPageView({ setupDropZone: () => {}, projectAIConnectionReminder: () => null });
    showDashboard({ dates: [], categories: {} }); vi.advanceTimersByTime(400);
    if (field === 'profile') state.currentProfile = 'next';
    else state.importedData = createDefaultProfileData();
    showDashboard({ dates: [], categories: {} });
    vi.advanceTimersByTime(400);
    expect(open).not.toHaveBeenCalled(); expect(document.body.classList.contains('chat-autostart-reserved')).toBe(true);
    vi.advanceTimersByTime(400); expect(open).toHaveBeenCalledOnce();
  } finally {
    configureDashboardPageRuntimeDeps(previousRuntime); Object.assign(state, previous);
    document.body.replaceChildren(); document.body.className = ''; localStorage.clear(); vi.unstubAllGlobals(); vi.useRealTimers();
  }
});
