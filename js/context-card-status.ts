// Presentation state is scoped to a profile/data lifetime, independent of DOM slots.
import { state } from './state.js';
export interface ContextCardStatus {
  visible: boolean; color: string; label: string; loading: boolean;
  insight: string; severity: string; insightLabel: string; insightColor: string; insightAria: string;
  summary: string | null; summarySource: string; tips: boolean; assessmentFingerprint: string | null; assessmentIdentity: string | null;
}
export type ContextCardStatusSlot = 'indicator' | 'summary' | 'insight' | 'tips';
export function emptyContextCardStatus(): ContextCardStatus {
  return { visible: false, color: 'gray', label: 'Not assessed', loading: false, insight: '', severity: '',
    insightLabel: '', insightColor: '', insightAria: '', summary: null, summarySource: 'local', tips: false, assessmentFingerprint: null, assessmentIdentity: null };
}
let sequence = 0;
let scope: { profile: string; data: typeof state.importedData; ticket: string; cards: Map<string, ContextCardStatus> } | null = null;
const listeners = new Set<(ticket: string, key: string, value: ContextCardStatus) => void>();
export function contextCardStatusTicket(): string {
  if (!scope || scope.profile !== state.currentProfile || scope.data !== state.importedData) {
    scope = { profile: state.currentProfile, data: state.importedData, ticket: `context-status-${++sequence}`, cards: new Map() };
  }
  return scope.ticket;
}
export function contextCardStatus(key: string): ContextCardStatus {
  contextCardStatusTicket();
  return scope!.cards.get(key) || emptyContextCardStatus();
}
export function publishContextCardStatus(key: string, update: Partial<ContextCardStatus>, ticket = contextCardStatusTicket()): boolean {
  if (ticket !== contextCardStatusTicket()) return false;
  const next = { ...contextCardStatus(key), ...update };
  scope!.cards.set(key, next);
  for (const listener of listeners) {
    try { listener(ticket, key, next); } catch { /* A removed view cannot interrupt service publication. */ }
  }
  return true;
}
export function subscribeContextCardStatus(listener: (ticket: string, key: string, value: ContextCardStatus) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
if (typeof globalThis.addEventListener === 'function') globalThis.addEventListener('labcharts-profile-switched', () => { scope = null; });
