// @ts-check
// Decorative sender identity for transcript and live chat messages.

import { state } from './state.js';
import { getCLIAgentBrandAsset } from './cli-agent-brand-assets.js';

const DEFAULT_PERSONA_NAME = 'AI Lab Analyst';

/** @param {unknown} value */
function isSafeProfileAvatar(value) {
  return typeof value === 'string' && /^data:image\/(?:png|jpe?g|webp|gif|avif|svg\+xml);base64,/i.test(value);
}

function getActiveProfile() {
  if (!Array.isArray(state.profiles)) return null;
  return state.profiles.find(profile => profile?.id === state.currentProfile) || state.profiles[0] || null;
}

/** @param {unknown} value @param {string} fallback */
function firstDisplayCharacter(value, fallback) {
  const normalized = String(value || '').trim();
  return Array.from(normalized)[0]?.toLocaleUpperCase() || fallback;
}

/**
 * Apply a decorative avatar without adding children that streaming text could
 * overwrite. The article's aria-label already carries the sender identity.
 *
 * @param {HTMLElement} element
 * @param {{ role: 'user' | 'assistant', personalityName?: string, personalityIcon?: string, agentId?: string }} identity
 */
export function applyChatMessageAvatar(element, identity) {
  element.classList.add('chat-avatar-anchor');
  element.dataset.chatAvatarRole = identity.role;
  element.dataset.chatAvatarText = '';
  element.classList.remove('chat-avatar-branded', 'chat-avatar-photo');
  element.style.removeProperty('--chat-avatar-image');
  element.style.removeProperty('--chat-avatar-image-size');

  if (identity.role === 'user') {
    const profile = getActiveProfile();
    element.dataset.chatAvatarText = firstDisplayCharacter(profile?.name, 'Y');
    if (isSafeProfileAvatar(profile?.avatar)) {
      // CSSOM assignment avoids placing a potentially large data URL into HTML.
      element.style.setProperty('--chat-avatar-image', `url("${profile.avatar}")`);
      element.style.setProperty('--chat-avatar-image-size', 'cover');
      element.classList.add('chat-avatar-photo');
      element.dataset.chatAvatarText = '';
    }
    return element;
  }

  const personalityName = String(identity.personalityName || '').trim();
  const personalityIcon = String(identity.personalityIcon || '').trim();
  const showPersona = Boolean(personalityIcon && personalityName && personalityName !== DEFAULT_PERSONA_NAME);
  const agentAsset = getCLIAgentBrandAsset(String(identity.agentId || '').trim());
  if (agentAsset && !showPersona) {
    element.style.setProperty('--chat-avatar-image', `url("${agentAsset}")`);
    element.style.setProperty('--chat-avatar-image-size', '18px');
    element.classList.add('chat-avatar-branded');
    return element;
  }

  element.dataset.chatAvatarText = personalityIcon || '✦';
  return element;
}

/** @param {HTMLElement} container @param {any[]} messages @param {number} renderStart */
export function applyRenderedChatMessageAvatars(container, messages, renderStart = 0) {
  for (let index = renderStart; index < messages.length; index++) {
    const message = messages[index];
    if (!message || message.hidden || message.joined) continue;
    const element = document.getElementById(`chat-msg-${index}`);
    if (!element || !container.contains(element)) continue;
    applyChatMessageAvatar(element, {
      role: message.role === 'user' ? 'user' : 'assistant',
      personalityName: message.personalityName,
      personalityIcon: message.personalityIcon,
      agentId: message.agentId,
    });
  }
}
