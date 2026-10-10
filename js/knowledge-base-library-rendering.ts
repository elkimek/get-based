import { renderHTML as renderOptions } from './components/KnowledgeBaseLibraryOptions.svelte.html.js';
import { renderHTML as renderCreate } from './components/KnowledgeBaseLibraryCreate.svelte.html.js';
import type {
  KnowledgeBaseLibraryOptionsView,
  KnowledgeBaseLibraryCreateView,
} from './knowledge-base-library-presentation.js';

export function renderKnowledgeBaseLibraryOptions(
  view: KnowledgeBaseLibraryOptionsView,
): string {
  return renderOptions({ view });
}

export function renderKnowledgeBaseLibraryCreate(
  view: KnowledgeBaseLibraryCreateView,
): string {
  return renderCreate({ view });
}
