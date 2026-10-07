/** Values projected from Chat services; the component owns their presentation. */
export interface ChatContextView { label: string; description: string; pending: boolean; error: boolean; announcement: string; }
export interface ChatHeaderState {
  title: string; titleDescription?: string; model: string; privateMode: boolean; attestation: unknown;
  hasSummary: boolean; canSummarize: boolean; summaryLabel: string;
  webSearchVisible: boolean; webSearchEnabled: boolean; context: ChatContextView;
}
export const EMPTY_CHAT_CONTEXT: ChatContextView = { label: '', description: '', pending: false, error: false, announcement: '' };
export const INITIAL_CHAT_HEADER: ChatHeaderState = {
  title: 'AI Lab Analyst', model: '', privateMode: false, attestation: null, hasSummary: false, canSummarize: false,
  summaryLabel: 'Summary available after four messages', webSearchVisible: false, webSearchEnabled: false, context: EMPTY_CHAT_CONTEXT,
};
export function projectChatContext(active: unknown[], pending: string[], knowledgeError: unknown, available: boolean): ChatContextView {
  const parts = [...active, ...pending];
  if (!available || !parts.length) return { ...EMPTY_CHAT_CONTEXT };
  const pendingOnly = !active.length && pending.length > 0;
  const description = knowledgeError
    ? `The Knowledge Base could not be searched for the last answer: ${knowledgeError}. Click to manage Context.`
    : pendingOnly ? 'Knowledge Base is enabled but no library is indexed yet. Click to manage Context.' : 'Click to manage Context.';
  return { label: `AI Context: ${parts.join(' + ')}`, description, pending: pendingOnly, error: !!knowledgeError, announcement: knowledgeError ? description : '' };
}
export function projectChatTitle(history: readonly { role?: unknown; personalityName?: unknown; personalityIcon?: unknown; }[], activeName: string): Pick<ChatHeaderState, 'title' | 'titleDescription'> {
  const seen = new Set<unknown>(), names: string[] = [];
  for (const message of history) if (message.role === 'assistant' && message.personalityName && !seen.has(message.personalityName)) {
    seen.add(message.personalityName); names.push(`${message.personalityIcon || ''} ${message.personalityName}`);
  }
  return names.length >= 2 ? { title: `${names[0]} + ${names.length - 1} perspective${names.length === 2 ? '' : 's'}`, titleDescription: names.join(', ') } : { title: activeName };
}
export function projectChatSummary(history: readonly { hidden?: unknown; joined?: unknown; }[], summary: unknown): Pick<ChatHeaderState, 'hasSummary' | 'canSummarize' | 'summaryLabel'> {
  const hasSummary = !!summary, canSummarize = hasSummary || history.filter(message => !message.hidden && !message.joined).length >= 4;
  return { hasSummary, canSummarize, summaryLabel: hasSummary ? 'View summary' : canSummarize ? 'Summarize this conversation' : 'Summary available after four messages' };
}
