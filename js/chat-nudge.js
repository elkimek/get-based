// chat-nudge.js — Chat FAB nudge badge state

import { state } from './state.js';
import { getProfiles } from './profile.js';
import { hasAIProvider } from './api.js';

/**
 * Show/hide the unread badge + gentle pulse on the chat FAB.
 * Stages:
 *   'profile' — no name/sex set yet (first visit)
 *   'api'     — no AI provider connected
 *   'data'    — API connected but no lab data imported
 *   'context' — data imported, nudge to fill context cards
 *   null      — clear the nudge
 */
export function setChatNudge(stage) {
  const fab = document.getElementById('chat-fab');
  if (!fab) return;
  let badge = fab.querySelector('.chat-fab-badge');
  if (stage) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'chat-fab-badge';
      fab.appendChild(badge);
    }
    fab.classList.add('chat-fab-nudge');
    localStorage.setItem('labcharts-chat-nudge', stage);
  } else {
    if (badge) badge.remove();
    fab.classList.remove('chat-fab-nudge');
    localStorage.removeItem('labcharts-chat-nudge');
  }
}

export function dismissCurrentChatNudge() {
  const currentNudge = localStorage.getItem('labcharts-chat-nudge');
  if (currentNudge && currentNudge !== 'profile') {
    localStorage.setItem(`labcharts-chat-nudge-dismissed-${state.currentProfile}`, currentNudge);
    setChatNudge(null);
  }
}

/** Check state and show appropriate nudge if user hasn't dismissed it. */
export function updateChatNudge() {
  const dismissed = localStorage.getItem(`labcharts-chat-nudge-dismissed-${state.currentProfile}`);
  const hasData = state.importedData?.entries?.length > 0;
  const currentP = getProfiles().find(p => p.id === state.currentProfile);
  const hasProfile = currentP?.name && currentP.name !== 'Default' && state.profileSex;

  if (!hasProfile) {
    // Stage 0: no profile — always nudge (can't dismiss)
    setChatNudge('profile');
  } else if (!hasAIProvider()) {
    if (dismissed !== 'api') setChatNudge('api');
    else setChatNudge(null);
  } else if (!hasData) {
    if (dismissed !== 'data') setChatNudge('data');
    else setChatNudge(null);
  } else {
    const filledCards = ['diagnoses', 'diet', 'exercise', 'sleepRest', 'lightCircadian', 'stress', 'loveLife', 'environment', 'healthGoals']
      .filter(k => {
        const v = state.importedData?.[k];
        return v && typeof v === 'object' && Object.values(v).some(f => f != null && f !== '' && !(Array.isArray(f) && f.length === 0));
      }).length;
    if (filledCards < 3 && dismissed !== 'context') setChatNudge('context');
    else setChatNudge(null);
  }
}
