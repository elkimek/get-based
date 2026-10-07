// Persona selection metadata and encrypted persistence have no presentation dependency.
import { state } from './state.js';
import { CHAT_PERSONALITIES } from './constants.js';
import { getCachedCustomPersonalities, loadCustomPersonalitiesFromStorage, saveCustomPersonalitiesToStorage } from './chat-personality-storage.js';
import { isCustomPersonalityUsable } from './chat-personality-policy.js';
import { notifyCustomPersonalitySavedRuntime } from './chat-runtime.js';
const PERSONA_ICONS = ['🧠', '🎭', '🔮', '🌿', '⚡', '🦊', '🧬', '🌊', '🔥', '🏛️'];

export function pickPersonaIcon(name: string | null | undefined) {
  if (!name || !name.trim()) return '✏️';
  let hash = 5381;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) + hash) + name.charCodeAt(i);
  return PERSONA_ICONS[Math.abs(hash) % PERSONA_ICONS.length]!;
}

export function getCustomPersonalities() { return getCachedCustomPersonalities(); }

export function loadCustomPersonalities() {
  return loadCustomPersonalitiesFromStorage();
}

export async function saveCustomPersonalities(arr: unknown, profileId = state.currentProfile) {
  const saved = await saveCustomPersonalitiesToStorage(arr, profileId);
  notifyCustomPersonalitySavedRuntime(profileId);
  return saved;
}

// Compat shim - returns the custom personality matching current selection, or first, or blank
export function getCustomPersonality(selection = state.currentChatPersonality) {
  const customs = getCustomPersonalities();
  if (selection && selection.startsWith('custom_')) {
    const match = customs.find(p => p.id === selection);
    if (match && isCustomPersonalityUsable(match)) return match;
    if (match) return { ...match, promptText: '' };
  }
  const firstUsable = customs.find(personality => isCustomPersonalityUsable(personality));
  if (firstUsable) return firstUsable;
  return { name: 'Custom Personality', icon: '✏️', promptText: '', evidenceBased: false };
}

export function getActivePersonality(selection = state.currentChatPersonality) {
  if (selection && selection.startsWith('custom_')) {
    const customs = getCustomPersonalities();
    const cp = customs.find(p => p.id === selection);
    if (cp && isCustomPersonalityUsable(cp)) {
      return {
        id: cp.id,
        name: cp.name,
        icon: cp.icon,
        description: 'Custom personality',
        greeting: 'Ask me about your lab results, trends, or what specific biomarkers mean.',
        promptAddition: null
      };
    }
  }
  return CHAT_PERSONALITIES.find(p => p.id === selection) || CHAT_PERSONALITIES[0]!;
}

export function getCustomPersonalityText() {
  return getCustomPersonality().promptText;
}

export function loadChatPersonality() {
  const saved = localStorage.getItem(`labcharts-${state.currentProfile}-chatPersonality`);
  if (!saved) { state.currentChatPersonality = 'default'; return; }
  if (CHAT_PERSONALITIES.some(p => p.id === saved)) { state.currentChatPersonality = saved; return; }
  if (saved.startsWith('custom_')) {
    const custom = getCustomPersonalities().find(personality => personality.id === saved);
    if (custom && isCustomPersonalityUsable(custom)) { state.currentChatPersonality = saved; return; }
    if (custom) {
      state.currentChatPersonality = 'default';
      localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, 'default');
      return;
    }
  }
  if (saved === 'custom') {
    const customs = getCustomPersonalities();
    if (customs.length > 0) {
      state.currentChatPersonality = customs[0]!.id;
      localStorage.setItem(`labcharts-${state.currentProfile}-chatPersonality`, customs[0]!.id);
      return;
    }
  }
  state.currentChatPersonality = 'default';
}
