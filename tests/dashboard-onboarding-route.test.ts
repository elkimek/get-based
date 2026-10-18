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
