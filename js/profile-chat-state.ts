// Conversation admission stays paused across an incomplete native profile load.
interface ProfileChatTransition { profileId: string; indexReady: boolean }
let transition: ProfileChatTransition | null = null;
function changed() {
  if (typeof globalThis.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    globalThis.dispatchEvent(new CustomEvent('getbased:profile-chat-state-changed'));
  }
}
export function beginProfileChatTransition(profileId: string) {
  transition = { profileId, indexReady: false };
  changed();
  return transition;
}
export function completeProfileChatTransition(owner: ProfileChatTransition) {
  if (transition !== owner) return;
  transition = null;
  changed();
}
export function isProfileChatReady(profileId: string) { return transition?.profileId !== profileId; }
export function isProfileChatIndexReady(profileId: string) {
  return transition?.profileId !== profileId || transition.indexReady;
}
export function markProfileChatIndexReady(profileId: string) {
  if (transition?.profileId === profileId) transition.indexReady = true;
}
