/** Pure Knowledge Base display contracts; callers own reads, async work and DOM lifetime. */
export interface KnowledgeBaseConfig {
  backend: string;
  name: string;
  url: string;
  enabled: boolean;
  topK: number;
  testProbe: string;
  multiQuery: boolean;
}

export interface KnowledgeBaseStatusInput {
  state: string;
  lastChunkCount: number;
  lastError: string | null;
  sourceName: string;
}

export interface KnowledgeBaseStatusView {
  chipText: string;
  chipClass: string;
  detailText: string | null;
  detailClass: string;
}

export interface KnowledgeBasePanelInput {
  config: KnowledgeBaseConfig;
  keySet: boolean;
  isBrowser: boolean;
  isExternal: boolean;
  connected: unknown;
  status: KnowledgeBaseStatusView;
  defaultTestProbe: string;
}

export interface KnowledgeBasePanelView {
  isBrowser: boolean;
  isExternal: boolean;
  connected: boolean;
  enabled: boolean;
  status: KnowledgeBaseStatusView;
  backendCopy: string;
  name: string;
  url: string;
  keyPlaceholder: string;
  testProbe: string;
  defaultTestProbe: string;
  topK: number;
  multiQuery: boolean;
  saveLabel: string;
  privacyCopy: string;
}

export interface KnowledgeBaseModalView {
  showContextBack: boolean;
  panel: KnowledgeBasePanelView;
}

export type KnowledgeBaseStatsView =
  | {
      part: 'summary';
      countCopy: string;
      modelTitle: string;
      modelLabel: string;
      backendLabel: string;
      speed: string;
    }
  | {
      part: 'performance-note';
    }
  | {
      part: 'error';
      message: string;
    };

export interface KnowledgeBaseDocumentView {
  source: string;
  chunks: number;
  actionSource: string | undefined;
  deleteLabel: string;
}

/** Same status predicates and pluralization as the native renderer, without HTML strings. */
export function projectKnowledgeBaseStatus(
  config: KnowledgeBaseConfig,
  connected: unknown,
  isBrowser: boolean,
  usableSource: boolean,
  status: KnowledgeBaseStatusInput,
): KnowledgeBaseStatusView {
  const chipText = !connected
    ? 'Not connected'
    : status.state === 'error'
      ? `⚠ Error${config.name ? ' · ' + config.name : ''}`
      : config.enabled
        ? isBrowser && !usableSource
          ? 'Enabled · add documents'
          : `✓ Active${config.name ? ' · ' + config.name : ''}`
        : 'Ready, currently off';
  const chipClass = !connected
    ? 'kb-status-text'
    : status.state === 'error'
      ? 'kb-status-text kb-status-error'
      : config.enabled && !(isBrowser && !usableSource)
        ? 'kb-status-text kb-status-active'
        : 'kb-status-text';
  const detailText = status.state === 'error' && status.lastError
    ? `Last error: ${status.lastError}`
    : connected && status.lastChunkCount
      ? `Last search: ${status.lastChunkCount} excerpt${status.lastChunkCount !== 1 ? 's' : ''}${status.sourceName ? ' from ' + status.sourceName : ''}`
      : null;
  const detailClass = status.state === 'error' && status.lastError
    ? 'kb-status-detail kb-status-error'
    : 'kb-status-detail';

  return {
    chipText,
    chipClass,
    detailText,
    detailClass,
  };
}

/** Display-only projection of the controller's already-read configuration and branch flags. */
export function projectKnowledgeBasePanel(
  input: KnowledgeBasePanelInput,
): KnowledgeBasePanelView {
  const { config, isBrowser, isExternal } = input;
  return {
    isBrowser,
    isExternal,
    connected: !!input.connected,
    enabled: !!config.enabled,
    status: input.status,
    backendCopy: isBrowser
      ? 'Indexing and search run on this device after the first model download. Matching excerpts are shared with your selected AI provider when chat answers.'
      : 'Connect to a knowledge server on your computer or local network. Best for large document collections.',
    name: config.name,
    url: config.url,
    keyPlaceholder: input.keySet ? '••••••••' : '',
    testProbe: config.testProbe || input.defaultTestProbe,
    defaultTestProbe: input.defaultTestProbe,
    topK: config.topK || 5,
    multiQuery: config.multiQuery !== false,
    saveLabel: isExternal ? 'Save + connect' : 'Save changes',
    privacyCopy: isBrowser
      ? 'Files, embeddings, and searches stay on this device. When chat uses the Knowledge Base, matching excerpts are included in the request to your configured AI provider. Query rewriting also sends the question when enabled.'
      : 'Questions are sent directly to the server you configure. Only connect to a server you control or trust.',
  };
}

/** The controller retains its populated/empty and model/speed decisions before this text projection. */
export function projectKnowledgeBaseStats(input: {
  totalChunks: number;
  documentCount: number;
  model: string;
  modelLabel: string;
  backendLabel: string;
  speed: string;
}): KnowledgeBaseStatsView {
  return {
    part: 'summary',
    countCopy: `${input.totalChunks.toLocaleString()} excerpt${input.totalChunks !== 1 ? 's' : ''} from ${input.documentCount} document${input.documentCount !== 1 ? 's' : ''} · `,
    modelTitle: input.model,
    modelLabel: input.modelLabel,
    backendLabel: input.backendLabel,
    speed: input.speed,
  };
}

export function projectKnowledgeBaseDocuments(
  documents: readonly {
    source: string;
    chunks: number;
  }[],
): KnowledgeBaseDocumentView[] {
  return documents.map(document => ({
    source: document.source,
    chunks: document.chunks,
    actionSource: document.source !== '' ? document.source : undefined,
    deleteLabel: `Delete ${document.source}`,
  }));
}
