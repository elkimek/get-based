import { renderHTML } from './components/AnalyticsConsentBody.svelte.html.js';

/** Static authored body only; preferences, retry, root creation and events stay in utils. */
export function renderAnalyticsConsentBody(): string {
  return renderHTML();
}
