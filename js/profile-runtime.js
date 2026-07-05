// @ts-check
// profile-runtime.js - Browser runtime refresh hooks for profile lifecycle.

import { state } from './state.js';

export async function invalidateProfileContextCache() {
  try {
    const mod = await import('./lab-context.js');
    mod.invalidateLabContextCache?.();
  } catch (_) {}
}

export async function reloadProfileRuntimeShell(profileId) {
  const [
    chatPersonalities,
    chatThreads,
    chatHistory,
    chatDiscussion,
    data,
    nav,
    views,
  ] = await Promise.all([
    import('./chat-personalities.js'),
    import('./chat-threads.js'),
    import('./chat-history.js'),
    import('./chat-discussion.js'),
    import('./data.js'),
    import('./nav.js'),
    import('./views.js'),
  ]);

  chatPersonalities.loadChatPersonality();
  chatThreads.loadChatThreads?.();
  if (state.chatThreads.length > 0) chatThreads.ensureActiveThread?.();
  await chatHistory.loadChatHistory?.();
  if (state.currentProfile !== profileId) return;

  chatThreads.renderThreadList?.();
  chatPersonalities.updateChatHeaderTitle?.();
  chatPersonalities.updatePersonalityBar?.();
  chatDiscussion.updateDiscussButton?.();
  data.destroyAllCharts();
  nav.buildSidebar();
  views.navigate(views.getInitialView?.() || 'dashboard');
  data.updateHeaderDates();
  data.updateHeaderRangeToggle();
  nav.renderProfileButton();
}

export async function refreshProfileButton() {
  try {
    const mod = await import('./nav.js');
    mod.renderProfileButton();
  } catch (_) {}
}

export function dispatchProfileSwitched(profileId) {
  if (typeof globalThis.CustomEvent !== 'function') return;
  try {
    globalThis.dispatchEvent(new CustomEvent('labcharts-profile-switched', { detail: { profileId } }));
  } catch (_) {}
}
