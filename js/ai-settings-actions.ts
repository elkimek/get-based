import { setAIPaused } from './api.js';
import { showNotification } from './utils.js';
import { loadFocusCard } from './focus-card.js';

/** Shared domain action; Settings checks its live owner before calling. */
export function setAiSettingsEnabled(enabled: unknown, refreshFocus: () => unknown = loadFocusCard): void {
  setAIPaused(!enabled);
  showNotification(enabled ? 'AI features enabled' : 'AI features paused', 'info');
  refreshFocus();
}
