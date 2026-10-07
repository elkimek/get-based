import { sanitizeChatThumbnailUrl } from './chat-storage-safety.js';
export interface ChatCitation { source: string; score: string | null; lines: string[]; }
export interface ChatCitations { label: string; chunks: ChatCitation[]; }
export interface ChatStoredImages { thumbnails: string[]; count: number; }
interface CitationInput { source?: unknown; score?: unknown; text?: unknown; }
export function projectChatCitations(chunks: unknown, sourceName?: unknown): ChatCitations | null {
  if (!Array.isArray(chunks) || !chunks.length) return null;
  return {
    label: sourceName ? String(sourceName) : 'knowledge base',
    chunks: (chunks as CitationInput[]).map((chunk, index) => ({
      source: String(chunk.source || `excerpt ${index + 1}`),
      score: typeof chunk.score === 'number' ? chunk.score.toFixed(2) : null,
      lines: chunk.text ? String(chunk.text).split('\n') : [''],
    })),
  };
}
export function projectChatStoredImages(message: { hasImages?: unknown; thumbnails?: unknown; imageCount?: unknown; }): ChatStoredImages | null {
  if (!message.hasImages) return null;
  const thumbnails = Array.isArray(message.thumbnails)
    ? message.thumbnails.map(sanitizeChatThumbnailUrl).filter((url): url is string => !!url) : [];
  const count = Number.isFinite(Number(message.imageCount)) ? Math.max(0, Math.trunc(Number(message.imageCount))) : 0;
  return { thumbnails, count };
}
