// Compatibility presentation adapter until catalog hydration owns these controls.
import { acceptContextNotes, contextNotesPresentation, subscribeContextNotes } from './context-notes-session.js';
import type { ContextNotesPresentation } from './context-notes-session.js';
let legacy: { input: HTMLTextAreaElement; status: HTMLElement | null; ticket: string } | null = null;
function render(value: ContextNotesPresentation): void {
  if (typeof document === 'undefined') return;
  for (const root of document.querySelectorAll<HTMLElement>('[data-context-notes-ticket]')) {
    if (root.dataset.contextNotesTicket !== value.ticket || !root.isConnected) continue;
    const input = root.querySelector<HTMLTextAreaElement>('.ctx-notes-textarea');
    if (input && input.value !== value.notes) input.value = value.notes;
    const status = root.querySelector<HTMLElement>('.ctx-notes-status');
    if (status) status.textContent = value.status;
    const retry = root.querySelector<HTMLButtonElement>('.ctx-notes-retry');
    if (retry) {
      retry.hidden = value.status !== 'Not saved — try again';
      retry.textContent = value.saved === null ? 'Retry save' : 'Save draft instead';
    }
    const conflict = root.querySelector<HTMLElement>('.ctx-notes-conflict');
    if (conflict) conflict.hidden = value.saved === null;
    const saved = root.querySelector<HTMLElement>('.ctx-notes-conflict-saved');
    if (saved) saved.textContent = value.saved === '' ? 'Saved notes are empty.' : value.saved || '';
    const keep = root.querySelector<HTMLButtonElement>('.ctx-notes-use-saved');
    if (keep) keep.disabled = value.status === 'Saving…';
  }
  if (legacy?.ticket === value.ticket && legacy.input.isConnected && legacy.status?.isConnected) legacy.status.textContent = value.status;
}
subscribeContextNotes(render);
export function debounceContextNotes(input: HTMLTextAreaElement | null = document.getElementById('ctx-notes-textarea') as HTMLTextAreaElement | null): void {
  if (!input?.isConnected) return;
  const root = input.closest<HTMLElement>('[data-context-cards-view]');
  const value = contextNotesPresentation(), ticket = root?.dataset.contextNotesTicket || value.ticket;
  if (root && !root.dataset.contextNotesTicket) return;
  if (!root) legacy = { input, status: document.getElementById('ctx-notes-status'), ticket };
  acceptContextNotes(ticket, input.value);
}
