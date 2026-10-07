import { renderHTML as renderCitations } from './components/ChatCitations.svelte.html.js';
import { renderHTML as renderImages } from './components/ChatStoredImages.svelte.html.js';
import { projectChatCitations, projectChatStoredImages } from './chat-message-content-contract.js';
/** Public string-render contracts share the same authored components as the transcript. */
export function renderChatCitations(chunks: unknown, sourceName?: unknown): string {
  const view = projectChatCitations(chunks, sourceName);
  return view ? renderCitations({ view }) : '';
}
export function renderChatStoredImages(message: Parameters<typeof projectChatStoredImages>[0]): string {
  const view = projectChatStoredImages(message);
  return view ? renderImages({ view }) : '';
}
