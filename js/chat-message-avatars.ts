import type { ChatMessage } from '../types/chat-data.js';
import type { ProfileRecord } from './profile.js';

export type ChatAvatarDetails = { [Key in 'personalityName' | 'personalityIcon' | 'agentId']?: ChatMessage[Key] | undefined };
export type ChatAvatarIdentity = ChatAvatarDetails & { role: 'user' | 'assistant' };
type TranscriptAvatarMessage = Pick<Partial<ChatMessage>, 'role' | 'hidden' | 'joined' | 'personalityName' | 'personalityIcon' | 'agentId'>;
type AvatarProfile = Pick<ProfileRecord, 'id' | 'name' | 'avatar'>;

// Decorative sender identity for transcript and live chat messages.

import { state } from './state.js';
import { getCLIAgentBrandAsset } from './cli-agent-brand-assets.js';

const DEFAULT_PERSONA_NAME = 'AI Lab Analyst';

/**
 * Default one-assistant chat is identified by its avatar and header. Named
 * personas and discussion participants still need an explicit transcript label.
 */
export function shouldShowChatPersonaLabel(message: Pick<Partial<ChatMessage>, 'personalityName' | 'discussion'>) {
  const name = String(message?.personalityName || '').trim();
  return Boolean(name && (message?.discussion || name !== DEFAULT_PERSONA_NAME));
}

function isSafeProfileAvatar(value: unknown) {
  return typeof value === 'string' && /^data:image\/(?:png|jpe?g|webp|gif|avif|svg\+xml);base64,/i.test(value);
}

function getActiveProfile() {
  if (!Array.isArray(state.profiles)) return null;
  return (state.profiles as AvatarProfile[]).find(profile => profile?.id === state.currentProfile) || state.profiles[0] || null;
}

function firstDisplayCharacter(value: unknown, fallback: string) {
  const normalized = String(value || '').trim();
  return Array.from(normalized)[0]?.toLocaleUpperCase() || fallback;
}

/**
 * Apply a decorative avatar without adding children that streaming text could
 * overwrite. The article's aria-label already carries the sender identity.
 *
 */
export function projectChatMessageAvatar(identity: ChatAvatarIdentity): { text: string; image: string | null; size: string | null; photo: boolean; branded: boolean } {
  if (identity.role === 'user') {
    const profile = getActiveProfile();
    const image = isSafeProfileAvatar(profile?.avatar) ? String(profile!.avatar) : null;
    return { text: image ? '' : firstDisplayCharacter(profile?.name, 'Y'), image, size: image ? 'cover' : null, photo: !!image, branded: false };
  }
  const name = String(identity.personalityName || '').trim();
  const icon = String(identity.personalityIcon || '').trim();
  const image = getCLIAgentBrandAsset(String(identity.agentId || '').trim());
  const branded = !!image && !(icon && name && name !== DEFAULT_PERSONA_NAME);
  return { text: branded ? '' : icon || '✦', image: branded ? image : null, size: branded ? '18px' : null, photo: false, branded };
}
export function applyChatMessageAvatar(element: HTMLElement, identity: ChatAvatarIdentity) {
  const view = projectChatMessageAvatar(identity);
  element.classList.add('chat-avatar-anchor');
  element.dataset.chatAvatarRole = identity.role;
  element.dataset.chatAvatarText = view.text;
  element.classList.toggle('chat-avatar-photo', view.photo);
  element.classList.toggle('chat-avatar-branded', view.branded);
  if (view.image) element.style.setProperty('--chat-avatar-image', `url("${view.image}")`);
  else element.style.removeProperty('--chat-avatar-image');
  if (view.size) element.style.setProperty('--chat-avatar-image-size', view.size);
  else element.style.removeProperty('--chat-avatar-image-size');
  return element;
}

export function applyRenderedChatMessageAvatars(container: HTMLElement, messages: readonly TranscriptAvatarMessage[], renderStart = 0) {
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
