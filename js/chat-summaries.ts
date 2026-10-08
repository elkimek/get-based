// chat-summaries.js - conversation summary generation, storage, and modal actions

import { getErrorMessage, getErrorName } from './caught-error.js';
import { state } from './state.js';
import { calculateCost, formatCost } from './schema.js';
import { bindModalSyncRefresh, showNotification } from './utils.js';
import { shouldHideAppExtensionAIUsage } from './app-extension-runtime.js';
import { saveImportedData } from './data.js';
import { isAIPaused } from './api.js';
import {
  callAssistantFeatureAI, getAssistantFeatureIdentity, hasAssistantFeatureProvider,
} from './ai-feature-routing.js';
import { renderThreadList, saveChatThreadIndex } from './chat-threads.js';
import { renderMarkdown } from './markdown.js';
import { closeModalOverlay, openModalOverlay, trapModalFocus } from './modal-lifecycle.js';
import { renderHTML as renderSummaryPresentation } from './components/ChatSummaryPresentation.svelte.html.js';
import { projectSavedSummaries, projectSummaryDialog, projectSummaryPrint } from './chat-summary-presentation.js';
import { openUtilsRuntimeWindow } from './utils-runtime.js';
import {
  appendImportedArrayItem,
  deleteImportedArrayItems,
  ensureImportedArray,
  replaceImportedArrayItem,
} from './data-merge.js';
import { createUniqueId } from './unique-id.js';
import { getAIOutputAttribution } from './cli-agent-brand-assets.js';

// Unvalidated persisted summary leaves and AI response extensions stay opaque.
interface SummaryMessageReader { role?: unknown; content?: unknown; personalityName?: unknown }
interface SavedSummaryReader extends Record<string, unknown> {
  id?: unknown; threadId?: unknown; threadName?: unknown; content?: unknown;
  createdAt?: unknown; model?: unknown; attribution?: unknown; cost?: unknown;
}
interface GeneratedSavedSummary extends SavedSummaryReader {
  threadId: (typeof state.chatThreads)[number]['id'];
  threadName: (typeof state.chatThreads)[number]['name'];
  createdAt: ReturnType<Date['toISOString']>;
  model: ReturnType<typeof getAssistantFeatureIdentity>['modelDisplay'];
  attribution: ReturnType<typeof getAIOutputAttribution>;
  content: unknown;
  cost: SummaryUsageReader | null;
}
interface SummaryThreadReader extends Record<string, unknown> {
  name?: unknown; summaryDate?: unknown; summaryModel?: unknown;
  summaryAttribution?: unknown; summaryCost?: unknown; _savedId?: unknown;
}
interface SummaryUsageReader { provider?: unknown; modelId?: unknown; modelDisplay?: unknown; inputTokens?: unknown; outputTokens?: unknown }
interface ActiveSummaryReader { content: unknown; name: unknown; date: unknown; model: unknown; attribution: string }

const SUMMARY_PROMPT = `You are a concise medical note-taker. Summarize this health consultation into a structured note.

FORMAT (use these exact headings):
## Key Findings
Bullet list of the most important lab results, patterns, and insights discussed.

## Action Items
Numbered list of concrete next steps \u2014 tests to order, supplements to try, lifestyle changes, things to discuss with a doctor.

## Open Questions
Bullet list of unresolved questions or areas that need follow-up.

RULES:
- Be specific: include actual marker names, values, and ranges when discussed
- Keep it short \u2014 this is a reference note, not a transcript
- Skip pleasantries and meta-discussion, extract only substance
- If the conversation is too short or trivial, say so in one line`;

let _summaryAbortController: AbortController | null = null;
let _activeSummary: ActiveSummaryReader | null = null;
const summaryCloseTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
const summaryFocusTraps = new WeakMap<Element, (restoreFocus?: boolean) => void>();

function _contentToText(content: unknown) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return (content as unknown[]).map(part => {
      if (!part) return '';
      if (typeof part === 'string') return part;
      if ((part as { type?: unknown }).type === 'text') return (part as { text?: unknown }).text || '';
      if ((part as { type?: unknown }).type === 'image_url' || (part as { type?: unknown }).type === 'image') return '[image attached]';
      return '';
    }).filter(Boolean).join('\n');
  }
  if (content == null) return '';
  return String(content);
}

export function buildSummaryTranscript(history: readonly (SummaryMessageReader | null | undefined)[] = []) {
  const chunks: string[] = [];
  for (const msg of history) {
    if (!msg || (msg.role !== 'user' && msg.role !== 'assistant')) continue;
    const content = _contentToText(msg.content).trim();
    if (!content) continue;
    const speaker = msg.role === 'assistant'
      ? `Assistant${msg.personalityName ? ` (${msg.personalityName})` : ''}`
      : 'User';
    chunks.push(`${speaker}:\n${content}`);
  }
  return chunks.join('\n\n---\n\n') || 'No substantive messages were available.';
}

export async function summarizeThread() {
  if (!state.chatHistory || state.chatHistory.length < 4) {
    showNotification('Need at least 4 messages to summarize', 'info');
    return;
  }
  if (!hasAssistantFeatureProvider()) {
    showNotification('No AI provider configured', 'error');
    return;
  }
  if (isAIPaused()) {
    showNotification('AI features are paused', 'info');
    return;
  }

  const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
  if (thread?.summary) {
    const saved = _getLatestSavedSummary(thread.id);
    _showSummaryModal(thread.summary, {
      ...thread,
      summaryAttribution: saved?.attribution === 'Written with Grok' ? saved.attribution : 'AI-generated',
    });
    return;
  }

  return _generateSummary();
}

async function _generateSummary() {
  if (_summaryAbortController) {
    _summaryAbortController.abort();
    _summaryAbortController = null;
  }
  const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
  if (!thread) return;
  const profile = state.currentProfile;

  const transcript = buildSummaryTranscript(state.chatHistory);
  const messages = [{
    role: 'user',
    content: `Summarize this conversation transcript:\n\n${transcript}`
  }];

  _showSummaryModal(null, thread, true);

  const identity = getAssistantFeatureIdentity();
  const _modelId = identity.modelId;
  const _modelDisplay = identity.modelDisplay;
  const _provider = identity.provider;
  const attribution = getAIOutputAttribution(identity);

  const controller = new AbortController();
  _summaryAbortController = controller;
  const isCurrent = () => _summaryAbortController === controller && !controller.signal.aborted
    && profile === state.currentProfile && state.currentThreadId === thread.id && state.chatThreads.includes(thread);

  try {
    const { text, usage } = await callAssistantFeatureAI({
      system: SUMMARY_PROMPT,
      messages,
      maxTokens: 2048,
      signal: controller.signal,
      onStream(partial) {
        if (!isCurrent()) { controller.abort(); return; }
        const body = document.getElementById('summary-modal-body');
        if (body) {
          body.innerHTML = renderMarkdown(partial);
          body.scrollTop = body.scrollHeight;
        }
      }
    }) as { text: unknown; usage?: unknown };
    if (!isCurrent()) return;

    const costInfo = usage && !identity.subscription ? { provider: _provider, modelId: _modelId, modelDisplay: _modelDisplay, inputTokens: (usage as SummaryUsageReader).inputTokens, outputTokens: (usage as SummaryUsageReader).outputTokens } : null;
    const now = new Date().toISOString();
    const previous: Array<[string, unknown]> = ['summary', 'summaryDate', 'summaryModel', 'summaryCost'].map(key => [key, thread[key]]);
    (thread as { summary?: unknown }).summary = text;
    thread.summaryDate = now;
    thread.summaryModel = _modelDisplay;
    if (costInfo) (thread as { summaryCost?: unknown }).summaryCost = costInfo;
    if (!await saveChatThreadIndex()) {
      if (isCurrent()) for (const [key, value] of previous) {
        if (value === undefined) delete thread[key];
        else thread[key] = value;
      }
      throw new Error('Could not save the conversation summary.');
    }
    if (!isCurrent()) return;

    await _saveSummaryToProfile({
      id: createUniqueId('s_'),
      threadId: thread.id,
      threadName: thread.name,
      content: text,
      createdAt: now,
      model: _modelDisplay,
      attribution,
      cost: costInfo
    });
    if (!isCurrent()) return;

    renderThreadList();
    renderSavedSummaries();

    const savedSummary = _getLatestSavedSummary(thread.id);
    _showSummaryModal(text, {
      ...thread,
      _savedId: savedSummary?.id,
      summaryAttribution: attribution,
    }, false, costInfo);
  } catch (e) {
    if (!isCurrent()) return;
    if (getErrorName(e) === 'AbortError') {
      showNotification('Summary cancelled', 'info');
    } else {
      showNotification('Summary failed: ' + getErrorMessage(e), 'error');
    }
    _closeSummaryModal();
  } finally {
    if (_summaryAbortController === controller) _summaryAbortController = null;
  }
}

// Array/row readers describe unchecked consumer operations, never validation.
function _getSavedSummaries() {
  return (state.importedData.chatSummaries || []) as SavedSummaryReader[];
}

async function _saveSummaryToProfile(summary: GeneratedSavedSummary) {
  const summaries = ensureImportedArray(state.importedData, 'chatSummaries') as SavedSummaryReader[];
  const idx = summaries.findIndex(s => s.threadId === summary.threadId);
  if (idx >= 0) {
    summary.id = summaries[idx]!.id;
    replaceImportedArrayItem(state.importedData, 'chatSummaries', idx, summary);
  } else {
    appendImportedArrayItem(state.importedData, 'chatSummaries', summary);
  }
  await saveImportedData();
}

function _getLatestSavedSummary(threadId: unknown) {
  return _getSavedSummaries().find(s => s.threadId === threadId);
}

function refreshOpenSummaryModalOnSync({ itemId: id = '' }: { itemId?: unknown } = {}) {
  renderSavedSummaries();
  if (!id) return;
  const summary = _getSavedSummaries().find((s: unknown) => (s as SavedSummaryReader).id === id);
  if (summary) {
    viewSavedSummary(id);
  } else {
    _closeSummaryModal();
  }
}

if (typeof window !== 'undefined') {
  bindModalSyncRefresh({
    overlayId: 'summary-modal-overlay',
    modalSelector: '.modal',
    kind: 'chat-summary',
    scrollSelector: '#summary-modal-body',
    getItemId: ({ overlay }) => overlay?.dataset?.syncRefreshSummaryId || '',
    refresh: refreshOpenSummaryModalOnSync,
  });
}

export async function deleteSavedSummary(id: unknown) {
  if (!state.importedData.chatSummaries) return;
  deleteImportedArrayItems(state.importedData, 'chatSummaries', (s: unknown) => (s as SavedSummaryReader).id === id);
  await saveImportedData();
  renderSavedSummaries();
  _closeSummaryModal();
  showNotification('Summary deleted', 'info');
}

export function viewSavedSummary(id: unknown) {
  const s = _getSavedSummaries().find((s: unknown) => (s as SavedSummaryReader).id === id);
  if (!s) return;
  _showSummaryModal(s.content, {
    name: s.threadName,
    summaryDate: s.createdAt,
    summaryModel: s.model,
    summaryAttribution: s.attribution === 'Written with Grok' ? s.attribution : 'AI-generated',
    summaryCost: s.cost,
    summary: s.content,
    _savedId: s.id
  });
}

export function renderSavedSummaries() {
  const container = document.getElementById('chat-saved-summaries');
  if (!container) return;
  container.innerHTML = renderSummaryPresentation({ kind: 'list', rows: projectSavedSummaries(_getSavedSummaries()) });
}

function _showSummaryModal(summaryText: unknown, thread: SummaryThreadReader | null | undefined, loading = false, usageInfo: SummaryUsageReader | null = null) {
  _activeSummary = summaryText ? {
    content: summaryText,
    name: thread?.name,
    date: thread?.summaryDate,
    model: thread?.summaryModel,
    attribution: thread?.summaryAttribution === 'Written with Grok' ? thread.summaryAttribution : 'AI-generated',
  } : null;
  let overlay = document.getElementById('summary-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'summary-modal-overlay';
    overlay.className = 'modal-overlay';
    let mdInside = false;
    overlay.addEventListener('mousedown', (e) => { mdInside = e.target !== overlay; });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && !mdInside) _closeSummaryModal();
      mdInside = false;
    });
    document.body.appendChild(overlay);
  } else if (!overlay.classList.contains('show')) {
    overlay.className = 'modal-overlay';
  }
  clearTimeout(summaryCloseTimers.get(overlay));
  summaryCloseTimers.delete(overlay);
  summaryFocusTraps.get(overlay)?.(false);
  overlay.setAttribute('data-modal-lifecycle-managed', '');
  overlay.dataset.syncRefreshKind = 'chat-summary';
  (overlay.dataset as Record<string, unknown>).syncRefreshSummaryId = thread?._savedId || '';

  let costLine = '';
  const ui = (usageInfo || thread?.summaryCost) as SummaryUsageReader | null | undefined;
  if (ui && ui.modelDisplay && !(shouldHideAppExtensionAIUsage as (provider: unknown) => ReturnType<typeof shouldHideAppExtensionAIUsage>)(ui.provider)) {
    const cost = (calculateCost as (provider: unknown, modelId: unknown, inputTokens: unknown, outputTokens: unknown) => ReturnType<typeof calculateCost>)(ui.provider, ui.modelId, ui.inputTokens, ui.outputTokens);
    const totalTokens = ((ui.inputTokens || 0) as number) + ((ui.outputTokens || 0) as number);
    costLine = ` · ${formatCost(cost)} · ${totalTokens.toLocaleString()} tokens`;
  }

  overlay.innerHTML = renderSummaryPresentation({ kind: 'dialog', view: projectSummaryDialog({
    name: thread ? thread.name : 'Conversation', date: thread?.summaryDate,
    model: thread?.summaryModel, costLabel: costLine, content: summaryText, loading,
    attribution: !loading && _activeSummary ? _activeSummary.attribution : null,
    savedId: thread?._savedId,
  }) });
  openModalOverlay(overlay);
  summaryFocusTraps.set(overlay, trapModalFocus(overlay, { autoFocus: false, onEscape: _closeSummaryModal }));
}

function _closeSummaryModal() {
  if (_summaryAbortController) {
    _summaryAbortController.abort();
    _summaryAbortController = null;
  }
  _activeSummary = null;
  const overlay = document.getElementById('summary-modal-overlay');
  if (overlay) {
    summaryFocusTraps.get(overlay)?.(false);
    summaryFocusTraps.delete(overlay);
    closeModalOverlay(overlay);
    clearTimeout(summaryCloseTimers.get(overlay));
    summaryCloseTimers.set(overlay, setTimeout(() => {
      summaryCloseTimers.delete(overlay);
      if (!overlay.classList.contains('show')) overlay.remove();
    }, 300));
  }
}

export function closeSummaryModal() {
  _closeSummaryModal();
}

export function copySummary() {
  if (!_activeSummary?.content) return;
  const text = _activeSummary.attribution
    ? `${_activeSummary.content}\n\n${_activeSummary.attribution}`
    : _activeSummary.content;
  (navigator.clipboard.writeText as (text: unknown) => ReturnType<typeof navigator.clipboard.writeText>)(text).then(() => {
    showNotification('Summary copied to clipboard', 'info');
  });
}

export function downloadSummary() {
  if (!_activeSummary?.content) return;
  const name = _activeSummary.name || 'summary';
  const filename = (name as { replace(pattern: RegExp, replacement: string): unknown }).replace(/[^a-zA-Z0-9_-]/g, '_') + '_summary.md';
  const dateLine = _activeSummary.date ? `_Summarized ${new Date(_activeSummary.date as ConstructorParameters<typeof Date>[0]).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}${_activeSummary.model ? ' \u00b7 ' + _activeSummary.model : ''}_` : '';
  const header = `# ${name}\n\n${dateLine}\n\n---\n\n`;
  const attribution = _activeSummary.attribution ? `\n\n${_activeSummary.attribution}` : '';
  const blob = new Blob([header + _activeSummary.content + attribution], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function printSummary() {
  if (!_activeSummary?.content) return;
  const view = projectSummaryPrint(_activeSummary);
  const w = openUtilsRuntimeWindow('', '_blank');
  if (!w) { showNotification('Popup blocked \u2014 allow popups for this site', 'error'); return; }
  w.document.write('<!DOCTYPE html>' + renderSummaryPresentation({ kind: 'print', view }));
  w.document.close();
  w.print();
}
