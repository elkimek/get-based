import { renderHTML as renderPanel } from './components/KnowledgeBasePanel.svelte.html.js';
import { renderHTML as renderModal } from './components/KnowledgeBaseModal.svelte.html.js';
import { renderHTML as renderStatus } from './components/KnowledgeBaseStatus.svelte.html.js';
import { renderHTML as renderStats } from './components/KnowledgeBaseStats.svelte.html.js';
import { renderHTML as renderDocuments } from './components/KnowledgeBaseDocuments.svelte.html.js';
import { renderHTML as renderIngestPill } from './components/KnowledgeBaseIngestPill.svelte.html.js';
import type {
  KnowledgeBasePanelView,
  KnowledgeBaseModalView,
  KnowledgeBaseStatusView,
  KnowledgeBaseStatsView,
  KnowledgeBaseDocumentView,
} from './knowledge-base-presentation.js';

/** Synchronous HTML compatibility facades; no client mount, inputs, listeners or service reads. */
export const renderKnowledgeBasePanel = (
  view: KnowledgeBasePanelView,
): string => renderPanel({ view });

export const renderKnowledgeBaseModal = (
  view: KnowledgeBaseModalView,
): string => renderModal({ view });

export const renderKnowledgeBaseStatus = (
  view: KnowledgeBaseStatusView,
): string => renderStatus({ view });

export const renderKnowledgeBaseStats = (
  view: KnowledgeBaseStatsView,
): string => renderStats({ view });

export const renderKnowledgeBaseDocuments = (
  documents: readonly KnowledgeBaseDocumentView[],
): string => renderDocuments({ documents });

export const renderKnowledgeBaseIngestPill = (): string => renderIngestPill();
