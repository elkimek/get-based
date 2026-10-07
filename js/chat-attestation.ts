// Compatibility HTML for transcript services, authored by the shared Svelte badge.
import { renderHTML } from './components/ChatAttestationBadge.svelte.html.js';
export { attestationTooltip } from './chat-attestation-presentation.js';
export { installAttestationTooltips } from './chat-attestation-component.js';
import { installAttestationTooltips } from './chat-attestation-component.js';
function renderReceipt(attestation: unknown, footnote = false): string {
  // Keep the existing strict attribute serialization contract at the HTML API.
  // Svelte safely quotes attributes but leaves literal angle brackets in them.
  return renderHTML({ attestation, footnote }).replace(/(aria-label|data-attestation-tooltip)="([^"]*)"/g,
    (_attribute, name: string, value: string) => `${name}="${value.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}"`);
}
export function e2eeLockHTML(attestation: unknown) { return renderReceipt(attestation); }
export function e2eeLockFootnote(attestation: unknown) { return renderReceipt(attestation, true); }
installAttestationTooltips();
