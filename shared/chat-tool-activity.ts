import { AGENT_CONTEXT_CARD_LABELS, AGENT_TOOL_ACTIVITY_LABELS as LABELS } from './agent-tool-contract.js';
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
