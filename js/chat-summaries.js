// chat-summaries.js - conversation summary generation, storage, and modal actions

import { state } from './state.js';
import { calculateCost, formatCost } from './schema.js';
import { escapeHTML, showNotification } from './utils.js';
import { saveImportedData } from './data.js';
import { callClaudeAPI, getActiveModelDisplay, getActiveModelId, getAIProvider, hasAIProvider, isAIPaused } from './api.js';
import { renderThreadList, saveChatThreadIndex } from './chat-threads.js';
import { renderMarkdown } from './markdown.js';
import { recordArrayItemTombstone } from './data-merge.js';

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

let _summaryAbortController = null;
let _activeSummary = null;

function _contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(part => {
      if (!part) return '';
      if (typeof part === 'string') return part;
      if (part.type === 'text') return part.text || '';
      if (part.type === 'image_url' || part.type === 'image') return '[image attached]';
      return '';
    }).filter(Boolean).join('\n');
  }
  if (content == null) return '';
  return String(content);
}

export function buildSummaryTranscript(history = []) {
  const chunks = [];
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
  if (!hasAIProvider()) {
    showNotification('No AI provider configured', 'error');
    return;
  }
  if (isAIPaused()) {
    showNotification('AI features are paused', 'info');
    return;
  }

  const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
  if (thread?.summary) {
    _showSummaryModal(thread.summary, thread);
    return;
  }

  _generateSummary();
}

async function _generateSummary() {
  if (_summaryAbortController) {
    _summaryAbortController.abort();
    _summaryAbortController = null;
  }
  const thread = state.chatThreads.find(t => t.id === state.currentThreadId);
  if (!thread) return;

  const transcript = buildSummaryTranscript(state.chatHistory);
  const messages = [{
    role: 'user',
    content: `Summarize this conversation transcript:\n\n${transcript}`
  }];

  _showSummaryModal(null, thread, true);

  const _modelId = getActiveModelId();
  const _modelDisplay = getActiveModelDisplay();
  const _provider = getAIProvider();

  _summaryAbortController = new AbortController();

  try {
    const { text, usage } = await callClaudeAPI({
      system: SUMMARY_PROMPT,
      messages,
      maxTokens: 2048,
      signal: _summaryAbortController.signal,
      onStream(partial) {
        const body = document.getElementById('summary-modal-body');
        if (body) {
          body.innerHTML = renderMarkdown(partial);
          body.scrollTop = body.scrollHeight;
        }
      }
    });

    const costInfo = usage ? { provider: _provider, modelId: _modelId, modelDisplay: _modelDisplay, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } : null;
    const now = new Date().toISOString();
    thread.summary = text;
    thread.summaryDate = now;
    thread.summaryModel = _modelDisplay;
    if (costInfo) thread.summaryCost = costInfo;
    saveChatThreadIndex();

    await _saveSummaryToProfile({
      id: 's_' + Date.now().toString(36),
      threadId: thread.id,
      threadName: thread.name,
      content: text,
      createdAt: now,
      model: _modelDisplay,
      cost: costInfo
    });

    renderThreadList();
    renderSavedSummaries();

    const savedSummary = _getLatestSavedSummary(thread.id);
    _showSummaryModal(text, { ...thread, _savedId: savedSummary?.id }, false, costInfo);
  } catch (e) {
    if (e.name === 'AbortError') {
      showNotification('Summary cancelled', 'info');
    } else {
      showNotification('Summary failed: ' + e.message, 'error');
    }
    _closeSummaryModal();
  } finally {
    _summaryAbortController = null;
  }
}

function _getSavedSummaries() {
  return (state.importedData.chatSummaries || []);
}

async function _saveSummaryToProfile(summary) {
  if (!state.importedData.chatSummaries) state.importedData.chatSummaries = [];
  const idx = state.importedData.chatSummaries.findIndex(s => s.threadId === summary.threadId);
  if (idx >= 0) {
    summary.id = state.importedData.chatSummaries[idx].id;
    state.importedData.chatSummaries[idx] = summary;
  } else {
    state.importedData.chatSummaries.push(summary);
  }
  await saveImportedData();
}

function _getLatestSavedSummary(threadId) {
  return _getSavedSummaries().find(s => s.threadId === threadId);
}

export async function deleteSavedSummary(id) {
  if (!state.importedData.chatSummaries) return;
  const summary = state.importedData.chatSummaries.find(s => s.id === id);
  recordArrayItemTombstone(state.importedData, 'chatSummaries', summary);
  state.importedData.chatSummaries = state.importedData.chatSummaries.filter(s => s.id !== id);
  await saveImportedData();
  renderSavedSummaries();
  _closeSummaryModal();
  showNotification('Summary deleted', 'info');
}

export function viewSavedSummary(id) {
  const s = _getSavedSummaries().find(s => s.id === id);
  if (!s) return;
  _showSummaryModal(s.content, {
    name: s.threadName,
    summaryDate: s.createdAt,
    summaryModel: s.model,
    summaryCost: s.cost,
    summary: s.content,
    _savedId: s.id
  });
}

export function renderSavedSummaries() {
  const container = document.getElementById('chat-saved-summaries');
  if (!container) return;
  const summaries = _getSavedSummaries().slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (summaries.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = '<div class="chat-saved-summaries-title">Summaries</div>' +
    summaries.map(s => {
      const date = new Date(s.createdAt);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `<div class="chat-saved-summary-item" onclick="viewSavedSummary('${escapeHTML(s.id)}')">
        <div class="chat-saved-summary-name">${escapeHTML(s.threadName)}</div>
        <div class="chat-saved-summary-meta">${dateStr}${s.model ? ' \u00b7 ' + escapeHTML(s.model) : ''}</div>
      </div>`;
    }).join('');
}

function _showSummaryModal(summaryText, thread, loading = false, usageInfo = null) {
  _activeSummary = summaryText ? { content: summaryText, name: thread?.name, date: thread?.summaryDate, model: thread?.summaryModel } : null;
  let overlay = document.getElementById('summary-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'summary-modal-overlay';
    overlay.className = 'modal-overlay show';
    let mdInside = false;
    overlay.addEventListener('mousedown', (e) => { mdInside = e.target !== overlay; });
    overlay.onclick = (e) => { if (e.target === overlay && !mdInside) _closeSummaryModal(); mdInside = false; };
    document.body.appendChild(overlay);
  } else {
    overlay.className = 'modal-overlay show';
  }

  const threadName = thread ? escapeHTML(thread.name) : 'Conversation';
  const dateStr = thread?.summaryDate ? new Date(thread.summaryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const modelStr = thread?.summaryModel ? ` \u00b7 ${escapeHTML(thread.summaryModel)}` : '';

  let costLine = '';
  const ui = usageInfo || thread?.summaryCost;
  if (ui && ui.modelDisplay) {
    const cost = calculateCost(ui.provider, ui.modelId, ui.inputTokens, ui.outputTokens);
    const totalTokens = (ui.inputTokens || 0) + (ui.outputTokens || 0);
    costLine = ` \u00b7 ${escapeHTML(formatCost(cost))} \u00b7 ${totalTokens.toLocaleString()} tokens`;
  }

  let bodyContent;
  if (loading) {
    bodyContent = '<div class="typing-indicator" style="margin:20px auto"><span></span><span></span><span></span></div>';
  } else if (summaryText) {
    bodyContent = renderMarkdown(summaryText);
  } else {
    bodyContent = '';
  }

  overlay.innerHTML = `<div class="modal">
    <button class="modal-close" onclick="closeSummaryModal()" aria-label="Close">&times;</button>
    <h3>Summary</h3>
    <div class="summary-modal-meta">${threadName}${dateStr ? ' \u00b7 ' + dateStr : ''}${modelStr}${costLine}</div>
    <div id="summary-modal-body" class="summary-modal-body">${bodyContent}</div>
    <div class="summary-modal-actions"${loading ? ' style="display:none"' : ''}>
      <button class="summary-action-btn" onclick="copySummary()" title="Copy as markdown">Copy</button>
      <button class="summary-action-btn" onclick="downloadSummary()" title="Download as .md file">Download</button>
      <button class="summary-action-btn" onclick="printSummary()" title="Print">Print</button>
      ${thread?._savedId ? `<button class="summary-action-btn secondary delete" onclick="deleteSavedSummary('${escapeHTML(thread._savedId)}')" title="Delete summary">Delete</button>` : ''}
    </div>
  </div>`;
}

function _closeSummaryModal() {
  if (_summaryAbortController) {
    _summaryAbortController.abort();
    _summaryAbortController = null;
  }
  _activeSummary = null;
  const overlay = document.getElementById('summary-modal-overlay');
  if (overlay) {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 300);
  }
}

export function closeSummaryModal() {
  _closeSummaryModal();
}

export function copySummary() {
  if (!_activeSummary?.content) return;
  navigator.clipboard.writeText(_activeSummary.content).then(() => {
    showNotification('Summary copied to clipboard', 'info');
  });
}

export function downloadSummary() {
  if (!_activeSummary?.content) return;
  const name = _activeSummary.name || 'summary';
  const filename = name.replace(/[^a-zA-Z0-9_-]/g, '_') + '_summary.md';
  const dateLine = _activeSummary.date ? `_Summarized ${new Date(_activeSummary.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}${_activeSummary.model ? ' \u00b7 ' + _activeSummary.model : ''}_` : '';
  const header = `# ${name}\n\n${dateLine}\n\n---\n\n`;
  const blob = new Blob([header + _activeSummary.content], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function printSummary() {
  if (!_activeSummary?.content) return;
  const name = _activeSummary.name || 'Summary';
  const html = renderMarkdown(_activeSummary.content);
  const dateLine = _activeSummary.date ? `Summarized ${new Date(_activeSummary.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}${_activeSummary.model ? ' \u00b7 ' + escapeHTML(_activeSummary.model) : ''}` : '';
  const w = window.open('', '_blank');
  if (!w) { showNotification('Popup blocked \u2014 allow popups for this site', 'error'); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>${escapeHTML(name)} - Summary</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:700px;margin:40px auto;padding:0 20px;line-height:1.6;color:#1a1a1a}
h1{font-size:20px;border-bottom:1px solid #ddd;padding-bottom:8px}h2{font-size:16px;margin-top:24px}
ul,ol{padding-left:20px}li{margin:4px 0}.meta{color:#666;font-size:13px;margin-bottom:20px}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
@media print{body{margin:20px}}</style>
</head><body>
<h1>${escapeHTML(name)}</h1>
${dateLine ? `<div class="meta">${dateLine}</div>` : ''}
${html}
</body></html>`);
  w.document.close();
  w.print();
}
