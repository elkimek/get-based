import { renderHTML } from './components/ChatAgentDraftCards.svelte.html.js';
import { projectAgentDraftCards } from './agent-draft-presentation.js';
/** Preserve the public string contract using the same authored review view. */
export function renderAgentDraftCards(message: Parameters<typeof projectAgentDraftCards>[0], messageIndex: unknown): string {
  const cards = projectAgentDraftCards(message);
  return cards.length ? renderHTML({ cards, index: messageIndex == null || messageIndex === false ? undefined : String(messageIndex) }) : '';
}
