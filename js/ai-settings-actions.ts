import { commitAssistantPreferences, type AssistantPreferenceOptions } from './assistant-preferences.js';
import { showNotification } from './utils.js';
import { loadFocusCard } from './focus-card.js';

/** Shared domain action; Settings checks its live owner before calling. */
export async function setAiSettingsEnabled(enabled: unknown, refreshFocus: () => unknown = loadFocusCard, options: AssistantPreferenceOptions = {}): Promise<void> {
  await commitAssistantPreferences({ paused: !enabled }, options);
  try { showNotification(enabled ? 'AI features enabled' : 'AI features paused', 'info'); } catch { /* A toast cannot invalidate the saved flag. */ }
  try { void Promise.resolve(refreshFocus()).catch(() => {}); } catch { /* Saved preference remains authoritative. */ }
}
