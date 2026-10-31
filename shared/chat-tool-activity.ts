import { AGENT_CONTEXT_CARD_LABELS } from './agent-tool-contract.js';
const LABELS: Record<string, string> = {
  getbased_lab_context: 'Read enabled health context', getbased_section: 'Read context section', getbased_search_markers: 'Find lab markers',
  getbased_marker_history: 'Read marker history', getbased_nutrition_summary: 'Read nutrition summary', getbased_wearable_series: 'Read wearable history',
  getbased_search_knowledge: 'Search saved documents', getbased_read_context_card: 'Read context card', getbased_read_data: 'Read saved records',
  getbased_draft_data: 'Prepare record review', getbased_navigate: 'Open app view', getbased_draft_note: 'Prepare note review',
  getbased_draft_context: 'Prepare context review', getbased_draft_meal: 'Prepare meal review', getbased_draft_biometric: 'Prepare measurement review',
  getbased_draft_supplement: 'Prepare treatment review', getbased_app_actions: 'Check available app actions', getbased_read_app: 'Read app settings', getbased_request_app: 'Prepare settings review',
};
export interface ChatToolActivity { id: string; tool: string; card?: string; status: 'running' | 'completed' | 'failed' | 'interrupted' }
export function normalizeChatToolActivity(value: unknown, live = false): ChatToolActivity[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 32).flatMap(raw => {
    if (!raw || typeof raw !== 'object') return [];
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string' || !/^(?:[1-9]|[12][0-9]|3[0-2])$/.test(r.id) || seen.has(r.id)
      || typeof r.tool !== 'string' || !Object.hasOwn(LABELS, r.tool) || !['running','completed','failed','interrupted'].includes(String(r.status))) return [];
    seen.add(r.id);
    return [{ id: r.id, tool: r.tool, status: r.status === 'running' && !live ? 'interrupted' : r.status as ChatToolActivity['status'],
      ...(typeof r.card === 'string' && Object.hasOwn(AGENT_CONTEXT_CARD_LABELS, r.card) ? { card: r.card } : {}) }];
  });
}
export function chatToolActivityLabel(activity: ChatToolActivity): string {
  const card = activity.card && AGENT_CONTEXT_CARD_LABELS[activity.card as keyof typeof AGENT_CONTEXT_CARD_LABELS];
  return card && activity.tool === 'getbased_read_context_card' ? `Read ${card}` : card && activity.tool === 'getbased_draft_context' ? `Prepare ${card} review` : LABELS[activity.tool] || 'App tool';
}
