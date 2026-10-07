import type { AgentDraft } from './agent-tool-runtime.js';
export interface DraftReader { profileId?: unknown; status?: unknown; kind?: unknown; payload?: unknown; id?: unknown; summary?: unknown; }
type DraftPayload = Readonly<AgentDraft['payload']>;
function draftRows(draft: DraftReader | null | undefined) {
  const payload = (draft?.payload || {}) as DraftPayload;
  if (draft?.kind === 'note') return [
    ['Destination', payload.scope === 'marker' ? `Marker · ${payload.marker}` : 'Profile context note'],
    ['Mode', payload.mode || 'append'],
    ['Text', payload.text],
  ];
  if (draft?.kind === 'meal') return [
    ['Meal', payload.name], ['Type', payload.mealType], ['When', payload.eatenAt || 'Now'],
    ...Object.entries(payload.nutrients || {}).map(([key, value]) => [key, String(value)]),
    ...(payload.note ? [['Note', payload.note]] : []),
  ];
  if (draft?.kind === 'biometric') {
    const value = payload.metric === 'bp'
      ? `${payload.systolic}/${payload.diastolic}${payload.pulse ? ` · pulse ${payload.pulse}` : ''}`
      : `${payload.value} ${payload.unit || ''}`.trim();
    return [['Metric', payload.metric], ['Date', payload.date || 'Today'], ['Value', value], ...(payload.note ? [['Note', payload.note]] : [])];
  }
  return [['Type', payload.type], ['Name', payload.name], ['Start', payload.startDate || 'Today'],
    ...(payload.dosage ? [['Directions', payload.dosage]] : []), ...(payload.note ? [['Note', payload.note]] : [])];
}

export interface AgentDraftCard {
  id: string | undefined;
  status: 'pending' | 'applying' | 'applied' | 'discarded' | 'failed';
  summary: string;
  rows: { label: string; value: string }[];
}
export function projectAgentDraftCards(message: { agentDrafts?: unknown } | null | undefined): AgentDraftCard[] {
  const drafts = (Array.isArray(message?.agentDrafts) ? message.agentDrafts : []) as DraftReader[];
  return drafts.map(draft => ({
    id: draft.id == null || draft.id === false ? undefined : String(draft.id),
    status: draft.status === 'applying' || draft.status === 'applied' || draft.status === 'discarded' || draft.status === 'failed' ? draft.status : 'pending',
    summary: String(draft.summary || 'Agent proposal'),
    rows: draftRows(draft).filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([label, value]) => ({ label: String(label), value: String(value) })),
  }));
}
