// @ts-check
// emf-interpretation.js - EMF AI interpretation modal, streaming, and chat handoff.

import { state } from './state.js';
import { SBM_2015_THRESHOLDS, getEMFSeverity, calculateCost, formatCost, trackUsage } from './schema.js';
import { escapeHTML, escapeAttr } from './utils.js';
import { saveImportedData } from './data.js';
import { callAssistantFeatureAI, getAssistantFeatureIdentity } from './ai-feature-routing.js';
import { renderMarkdown } from './markdown.js';
import {
  detectMitigationsInText,
  isProductRecsEnabled,
  loadEMFCatalog,
  renderEMFMitigationRecs,
} from './health-data-loader.js';
import { openModalOverlay, removeModalOverlay, trapModalFocus } from './modal-lifecycle.js';

/**
 * @typedef {{ text?: string, model?: string, provider?: string, modelId?: string, inputTokens?: number, outputTokens?: number, date?: string }} EMFInterpretation
 * @typedef {HTMLElement & { _interpretText?: string, _onGenerate?: (() => void), _mouseDownInside?: boolean, _delegatesInstalled?: boolean }} EMFInterpretationOverlay
 * @typedef {{ collectActiveAssessmentState?: () => void, getAssessments?: () => any[] }} EMFInterpretationDeps
 */

const emfInterpretationRuntimeDeps = {
  callClaudeAPI: callAssistantFeatureAI,
  closeModal: /** @type {null | (() => void)} */ (null),
  openChatPanel: /** @type {null | ((message?: string) => unknown)} */ (null),
};

export function configureEMFInterpretationRuntimeDeps(deps = {}) {
  const previous = { ...emfInterpretationRuntimeDeps };
  if (typeof deps.callClaudeAPI === 'function') emfInterpretationRuntimeDeps.callClaudeAPI = deps.callClaudeAPI;
  if (Object.hasOwn(deps, 'closeModal')) {
    emfInterpretationRuntimeDeps.closeModal = typeof deps.closeModal === 'function'
      ? deps.closeModal
      : null;
  }
  if (Object.prototype.hasOwnProperty.call(deps, 'openChatPanel')) {
    emfInterpretationRuntimeDeps.openChatPanel = typeof deps.openChatPanel === 'function'
      ? deps.openChatPanel
      : null;
  }
  return previous;
}

let _aiAbortController = null;

function closeParentEMFModalRuntime() {
  emfInterpretationRuntimeDeps.closeModal?.();
}

function openEMFInterpretationChatRuntime(message) {
  emfInterpretationRuntimeDeps.openChatPanel?.(message);
}

function getAssessments(deps) {
  return deps?.getAssessments?.() || state.importedData.emfAssessment?.assessments || [];
}

function serializeAssessment(a) {
  const fmtDate = new Date(a.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  let text = `Assessment: ${fmtDate}${a.label ? ' (' + a.label + ')' : ''}${a.consultant ? ' by ' + a.consultant : ''}\n`;
  for (const room of a.rooms) {
    const sleeping = room.sleeping !== false;
    text += `  ${room.name}${room.location ? ' (' + room.location + ')' : ''} [${sleeping ? 'sleeping area' : 'daytime area'}]:\n`;
    for (const [type, m] of Object.entries(room.measurements || {})) {
      if (m && m.value != null) {
        const def = SBM_2015_THRESHOLDS[type];
        const sev = getEMFSeverity(type, m.value, sleeping);
        text += `    ${def.name}: ${m.value} ${def.unit}${sev ? ' \u2014 ' + sev.label : ''}${m.meter ? ' (meter: ' + m.meter + ')' : ''}\n`;
      }
    }
    if (room.sources?.length) text += `    Sources: ${room.sources.join(', ')}\n`;
    if (room.mitigations?.length) text += `    Mitigations: ${room.mitigations.join(', ')}\n`;
  }
  if (a.note) text += `Notes: ${a.note}\n`;
  return text;
}

/** Strip OpenRouter-style <think>...</think> blocks */
function stripThinking(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/, '').trim();
}

const EMF_SYSTEM = `You are a Baubiologie (Building Biology) consultant interpreting EMF assessment data rated against SBM-2015 standards. Be specific about health implications, prioritize concerns by severity (sleeping areas are most critical), and suggest actionable mitigations in priority order. Keep the response concise and practical. Use markdown formatting with headers and bullet points.`;

function emfInterpAttrString(attrs) {
  return Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([name, value]) => `${name}="${escapeAttr(String(value))}"`)
    .join(' ');
}

function emfInterpActionAttrs(action, attrs = {}) {
  return emfInterpAttrString({ 'data-emf-interp-action': action, ...attrs });
}

function _handleEMFInterpretationMouseDown(event) {
  const overlay = /** @type {EMFInterpretationOverlay | null} */ (event.currentTarget instanceof HTMLElement ? event.currentTarget : null);
  if (!overlay) return;
  overlay._mouseDownInside = event.target !== overlay;
}

function _handleEMFInterpretationClick(event) {
  const overlay = /** @type {EMFInterpretationOverlay | null} */ (event.currentTarget instanceof HTMLElement ? event.currentTarget : null);
  if (!overlay) return;

  const target = event.target;
  if (!(target instanceof Element)) {
    overlay._mouseDownInside = false;
    return;
  }

  const actionEl = target.closest('[data-emf-interp-action]');
  if (actionEl instanceof HTMLElement && overlay.contains(actionEl)) {
    const action = actionEl.dataset.emfInterpAction || '';
    if (action === 'close') {
      event.preventDefault();
      overlay._mouseDownInside = false;
      closeEMFInterpretation();
      return;
    }
    if (action === 'discuss') {
      event.preventDefault();
      overlay._mouseDownInside = false;
      discussEMFInterpretation();
      return;
    }
    if (action === 'generate') {
      event.preventDefault();
      overlay._mouseDownInside = false;
      if (!overlay._onGenerate) return;
      const btn = actionEl instanceof HTMLButtonElement ? actionEl : null;
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Interpreting\u2026';
      }
      overlay._onGenerate();
      return;
    }
  }

  if (target === overlay && !overlay._mouseDownInside) closeEMFInterpretation();
  overlay._mouseDownInside = false;
}

function installEMFInterpretationDelegates(overlay) {
  if (overlay._delegatesInstalled) return;
  overlay._delegatesInstalled = true;
  overlay.addEventListener('mousedown', _handleEMFInterpretationMouseDown);
  overlay.addEventListener('click', _handleEMFInterpretationClick);
}

function openInterpretationModal(title, existingInterp, onGenerate, mitigationTags = []) {
  // Create overlay that sits on top of the EMF editor (z-index above modal-overlay)
  let overlay = /** @type {EMFInterpretationOverlay | null} */ (document.getElementById('emf-interp-overlay'));
  if (!overlay) {
    overlay = /** @type {EMFInterpretationOverlay} */ (document.createElement('div'));
    overlay.id = 'emf-interp-overlay';
    overlay.className = 'emf-interp-overlay';
  }

  const hasExisting = existingInterp && existingInterp.text;

  let html = `<div class="emf-interp-modal">
    <div class="emf-interp-header">
      <h3>${escapeHTML(title)}</h3>
      <button class="modal-close" aria-label="Close" ${emfInterpActionAttrs('close')}>&times;</button>
    </div>
    <div class="emf-interp-body" id="emf-interp-body">
      ${hasExisting ? renderMarkdown(existingInterp.text) : '<div class="emf-interp-placeholder">Click Interpret to get an AI interpretation of this assessment.</div>'}
    </div>
    <div id="emf-interp-recs"></div>
    <div class="emf-interp-footer">
      <div id="emf-interp-meta" class="emf-interp-meta">
        ${hasExisting ? buildMetaLine(existingInterp) : ''}
      </div>
      <div class="emf-interp-actions">
        <button class="import-btn import-btn-primary" id="emf-interp-generate" ${emfInterpActionAttrs('generate')}>${hasExisting ? 'Re-interpret' : 'Interpret'}</button>
        ${hasExisting ? `<button class="import-btn import-btn-secondary" ${emfInterpActionAttrs('discuss')}>Discuss in Chat</button>` : ''}
        <button class="import-btn import-btn-secondary" ${emfInterpActionAttrs('close')}>Close</button>
      </div>
    </div>
  </div>`;

  overlay.innerHTML = html;
  const wasConnected = overlay.isConnected;
  if (!wasConnected) document.body.appendChild(overlay);
  openModalOverlay(overlay);
  if (!wasConnected) try { trapModalFocus(overlay, { closeOnEscape: false }); } catch (_) {}

  // Store context for discuss button
  overlay._interpretText = hasExisting ? existingInterp.text : '';
  overlay._onGenerate = onGenerate;
  overlay._mouseDownInside = false;
  installEMFInterpretationDelegates(overlay);

  // Populate mitigation product recs alongside the AI interpretation
  if (mitigationTags && mitigationTags.length && isProductRecsEnabled()) {
    const recSlot = document.getElementById('emf-interp-recs');
    if (recSlot) {
      loadEMFCatalog().then(cat => {
        if (cat && document.getElementById('emf-interp-recs') === recSlot) {
          recSlot.innerHTML = renderEMFMitigationRecs(cat, mitigationTags, { heading: 'Products to consider' });
        }
      });
    }
  }
}

function buildMetaLine(interp) {
  if (!interp) return '';
  const parts = [];
  const separator = ' \u00b7 ';
  if (interp.model) parts.push(interp.model);
  if (interp.inputTokens || interp.outputTokens) {
    const cost = calculateCost(interp.provider || '', interp.modelId || '', interp.inputTokens || 0, interp.outputTokens || 0);
    const total = (interp.inputTokens || 0) + (interp.outputTokens || 0);
    parts.push(`${formatCost(cost)}${separator}${total.toLocaleString()} tokens`);
  }
  if (interp.date) {
    parts.push(new Date(interp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
  }
  return parts.length ? escapeHTML(parts.join(separator)) : '';
}

function streamInterpretation(prompt, onComplete) {
  if (_aiAbortController) _aiAbortController.abort();
  _aiAbortController = new AbortController();

  const body = document.getElementById('emf-interp-body');
  const meta = document.getElementById('emf-interp-meta');
  if (!body) return;

  body.innerHTML = '<div class="emf-interp-placeholder">Thinking\u2026</div>';
  if (meta) meta.textContent = '';

  let lastRender = 0;
  const THROTTLE_MS = 150;

  const identity = getAssistantFeatureIdentity();
  const provider = identity.provider;
  const modelId = identity.modelId;
  const modelDisplay = identity.modelDisplay;

  emfInterpretationRuntimeDeps.callClaudeAPI({
    messages: [{ role: 'user', content: prompt }],
    system: EMF_SYSTEM,
    signal: _aiAbortController.signal,
    onStream(fullText) {
      const now = Date.now();
      if (now - lastRender < THROTTLE_MS) return;
      lastRender = now;
      const clean = stripThinking(fullText);
      if (clean) body.innerHTML = renderMarkdown(clean);
    }
  }).then(response => {
    _aiAbortController = null;
    const finalText = stripThinking(response?.text || '');
    const usage = /** @type {{ inputTokens?: number, outputTokens?: number }} */ (response?.usage || {});
    body.innerHTML = finalText ? renderMarkdown(finalText) : '<div class="emf-interp-placeholder">No response received.</div>';

    const interp = {
      text: finalText,
      model: modelDisplay,
      provider,
      modelId,
      inputTokens: usage.inputTokens || 0,
      outputTokens: usage.outputTokens || 0,
      date: new Date().toISOString()
    };
    if (!identity.subscription) trackUsage(provider, modelId, usage.inputTokens || 0, usage.outputTokens || 0);

    if (meta) meta.innerHTML = buildMetaLine(interp);

    // Update generate button
    const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('emf-interp-generate'));
    if (btn) { btn.disabled = false; btn.textContent = 'Re-interpret'; }

    // Add discuss button if not present
    const overlay = /** @type {EMFInterpretationOverlay | null} */ (document.getElementById('emf-interp-overlay'));
    const actions = overlay?.querySelector('.emf-interp-actions');
    if (actions && !actions.querySelector('[data-emf-interp-action="discuss"]')) {
      const discussBtn = document.createElement('button');
      discussBtn.type = 'button';
      discussBtn.className = 'import-btn import-btn-secondary';
      discussBtn.dataset.emfInterpAction = 'discuss';
      discussBtn.textContent = 'Discuss in Chat';
      actions.appendChild(discussBtn);
    }

    // Store for discuss
    if (overlay) overlay._interpretText = finalText;

    if (onComplete) onComplete(interp);
  }).catch(err => {
    _aiAbortController = null;
    if (err.name === 'AbortError') return;
    body.innerHTML = `<div style="color:var(--red);padding:12px">Error: ${escapeHTML(err.message)}</div>`;
    const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('emf-interp-generate'));
    if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
  });
}

export function closeEMFInterpretation() {
  if (_aiAbortController) { _aiAbortController.abort(); _aiAbortController = null; }
  const overlay = document.getElementById('emf-interp-overlay');
  if (overlay) removeModalOverlay(overlay);
}

export function discussEMFInterpretation() {
  const overlay = /** @type {EMFInterpretationOverlay | null} */ (document.getElementById('emf-interp-overlay'));
  const text = overlay?._interpretText;
  if (!text) return;
  closeEMFInterpretation();
  closeParentEMFModalRuntime();
  openEMFInterpretationChatRuntime(`I'd like to discuss this EMF assessment interpretation further. Here's the interpretation:\n\n${text}\n\nWhat questions should I prioritize, and what are the most important next steps?`);
}

function _collectMitigationTags(assessment) {
  if (!assessment?.rooms) return [];
  const seen = new Set();
  const out = [];
  // 1) User-tagged mitigation chips on each room (explicit signal)
  for (const room of assessment.rooms) {
    for (const t of (room.mitigations || [])) {
      if (!seen.has(t)) { seen.add(t); out.push(t); }
    }
  }
  // 2) Mitigations the AI interpretation text mentions, even if no chip was set.
  // This catches freshly-imported consultant PDFs where recommended mitigations
  // appear in prose but the room's chip array is empty.
  const interpText = assessment.interpretation?.text;
  if (interpText) {
    for (const t of detectMitigationsInText(interpText)) {
      if (!seen.has(t)) { seen.add(t); out.push(t); }
    }
  }
  return out;
}

export function interpretEMFAssessment(assessmentId, deps = {}) {
  deps.collectActiveAssessmentState?.();
  const assessments = getAssessments(deps);
  const a = assessments.find(x => x.id === assessmentId);
  if (!a) return;

  const fmtDate = new Date(a.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const title = `EMF Interpretation \u2014 ${fmtDate}${a.label ? ' (' + a.label + ')' : ''}`;
  const data = serializeAssessment(a);
  const tags = _collectMitigationTags(a);

  openInterpretationModal(title, a.interpretation, () => {
    const prompt = `Interpret this Baubiologie EMF assessment. Identify the most concerning readings, explain health implications (especially for sleeping areas), and recommend specific mitigations in priority order.\n\n${data}`;
    streamInterpretation(prompt, (interp) => {
      a.interpretation = interp;
      saveImportedData();
    });
  }, tags);
}

export function interpretEMFComparison(deps = {}) {
  deps.collectActiveAssessmentState?.();
  const assessments = getAssessments(deps);
  const sorted = [...assessments].sort((a, b) => b.date.localeCompare(a.date));
  if (sorted.length < 2) return;

  const emf = state.importedData.emfAssessment;
  if (!emf) return;
  const title = 'EMF Comparison \u2014 Before vs After';
  const before = serializeAssessment(sorted[1]);
  const after = serializeAssessment(sorted[0]);
  const tags = [..._collectMitigationTags(sorted[0]), ..._collectMitigationTags(sorted[1])];
  const dedup = [];
  const seen = new Set();
  for (const t of tags) { if (!seen.has(t)) { seen.add(t); dedup.push(t); } }

  openInterpretationModal(title, emf.comparisonInterpretation, () => {
    const prompt = `Compare these two Baubiologie EMF assessments (before and after). Evaluate what improved, what worsened, and what still needs attention. Prioritize remaining concerns and suggest next steps.\n\nBEFORE:\n${before}\nAFTER:\n${after}`;
    streamInterpretation(prompt, (interp) => {
      emf.comparisonInterpretation = interp;
      saveImportedData();
    });
  }, dedup);
}
