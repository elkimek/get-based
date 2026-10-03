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

import type { InterpretationOperations, InterpretationDependencies, InterpretationOverlay, AssessmentOperations, RuntimeConfigInput, RuntimeInvocationOperations, ReplaceOperations, ResponseOperations, TokenOperations, GeneratedInterpretation, SeverityReader, CostReader, UsageReader, MitigationRendererReader, ErrorOperations } from '../types/emf-interpretation.js';

const emfInterpretationRuntimeDeps: {callClaudeAPI: unknown;closeModal: unknown;openChatPanel: unknown} = {
  callClaudeAPI: callAssistantFeatureAI,
  closeModal: null,
  openChatPanel: null,
};

export function configureEMFInterpretationRuntimeDeps(deps: unknown = {}) {
  const previous = { ...emfInterpretationRuntimeDeps };
  if (typeof (deps as RuntimeConfigInput).callClaudeAPI === 'function') emfInterpretationRuntimeDeps.callClaudeAPI = (deps as RuntimeConfigInput).callClaudeAPI;
  if (Object.hasOwn(deps as object, 'closeModal')) {
    emfInterpretationRuntimeDeps.closeModal = typeof (deps as RuntimeConfigInput).closeModal === 'function'
      ? (deps as RuntimeConfigInput).closeModal
      : null;
  }
  if (Object.prototype.hasOwnProperty.call(deps, 'openChatPanel')) {
    emfInterpretationRuntimeDeps.openChatPanel = typeof (deps as RuntimeConfigInput).openChatPanel === 'function'
      ? (deps as RuntimeConfigInput).openChatPanel
      : null;
  }
  return previous;
}

let _aiAbortController: AbortController | null = null;

function closeParentEMFModalRuntime() {
  (emfInterpretationRuntimeDeps as RuntimeInvocationOperations).closeModal?.();
}

function openEMFInterpretationChatRuntime(message: string) {
  (emfInterpretationRuntimeDeps as RuntimeInvocationOperations).openChatPanel?.(message);
}

function getAssessments(deps: InterpretationDependencies) {
  return (deps as {getAssessments?: (() => unknown) | null})?.getAssessments?.() || state.importedData.emfAssessment?.assessments || [];
}

function serializeAssessment(a: AssessmentOperations) {
  const fmtDate = new Date((a.date as string) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  let text = `Assessment: ${fmtDate}${a.label ? ' (' + a.label + ')' : ''}${a.consultant ? ' by ' + a.consultant : ''}\n`;
  for (const room of a.rooms) {
    const sleeping = room.sleeping !== false;
    text += `  ${room.name}${room.location ? ' (' + room.location + ')' : ''} [${sleeping ? 'sleeping area' : 'daytime area'}]:\n`;
    for (const [type, m] of Object.entries(room.measurements || {})) {
      if (m && m.value != null) {
        const def = SBM_2015_THRESHOLDS[type]!;
        const sev = (getEMFSeverity as SeverityReader)(type, m.value, sleeping);
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
function stripThinking(text: unknown) {
  return (text as ReplaceOperations).replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/, '').trim();
}

const EMF_SYSTEM = `You are a Baubiologie (Building Biology) consultant interpreting EMF assessment data rated against SBM-2015 standards. Be specific about health implications, prioritize concerns by severity (sleeping areas are most critical), and suggest actionable mitigations in priority order. Keep the response concise and practical. Use markdown formatting with headers and bullet points.`;

function emfInterpAttrString(attrs: Record<string, unknown>) {
  return Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([name, value]) => `${name}="${escapeAttr(String(value))}"`)
    .join(' ');
}

function emfInterpActionAttrs(action: string, attrs: Record<string, unknown> = {}) {
  return emfInterpAttrString({ 'data-emf-interp-action': action, ...attrs });
}

function _handleEMFInterpretationMouseDown(event: MouseEvent) {
  const overlay = (event.currentTarget instanceof HTMLElement ? event.currentTarget : null) as InterpretationOverlay | null;
  if (!overlay) return;
  overlay._mouseDownInside = event.target !== overlay;
}

function _handleEMFInterpretationClick(event: MouseEvent) {
  const overlay = (event.currentTarget instanceof HTMLElement ? event.currentTarget : null) as InterpretationOverlay | null;
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
      (overlay._onGenerate as () => unknown)();
      return;
    }
  }

  if (target === overlay && !overlay._mouseDownInside) closeEMFInterpretation();
  overlay._mouseDownInside = false;
}

function installEMFInterpretationDelegates(overlay: InterpretationOverlay) {
  if (overlay._delegatesInstalled) return;
  overlay._delegatesInstalled = true;
  overlay.addEventListener('mousedown', _handleEMFInterpretationMouseDown);
  overlay.addEventListener('click', _handleEMFInterpretationClick);
}

function openInterpretationModal(title: unknown, existingInterp: InterpretationOperations | null | undefined, onGenerate: () => unknown, mitigationTags: unknown[] = []) {
  // Create overlay that sits on top of the EMF editor (z-index above modal-overlay)
  let overlay = document.getElementById('emf-interp-overlay') as InterpretationOverlay | null;
  if (!overlay) {
    overlay = document.createElement('div') as InterpretationOverlay;
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
          recSlot.innerHTML = (renderEMFMitigationRecs as MitigationRendererReader)(cat, mitigationTags, { heading: 'Products to consider' });
        }
      });
    }
  }
}

function buildMetaLine(interp: InterpretationOperations | null | undefined) {
  if (!interp) return '';
  const parts: unknown[] = [];
  const separator = ' \u00b7 ';
  if (interp.model) parts.push(interp.model);
  if (interp.inputTokens || interp.outputTokens) {
    const cost = (calculateCost as CostReader)(interp.provider || '', interp.modelId || '', interp.inputTokens || 0, interp.outputTokens || 0);
    const total = ((interp.inputTokens || 0) as number) + ((interp.outputTokens || 0) as number);
    parts.push(`${formatCost(cost)}${separator}${total.toLocaleString()} tokens`);
  }
  if (interp.date) {
    parts.push(new Date(interp.date as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
  }
  return parts.length ? escapeHTML(parts.join(separator)) : '';
}

function streamInterpretation(prompt: string, onComplete: ((interp: GeneratedInterpretation) => unknown) | null | undefined) {
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

  (emfInterpretationRuntimeDeps as RuntimeInvocationOperations).callClaudeAPI({
    messages: [{ role: 'user', content: prompt }],
    system: EMF_SYSTEM,
    signal: _aiAbortController.signal,
    onStream(fullText: unknown) {
      const now = Date.now();
      if (now - lastRender < THROTTLE_MS) return;
      lastRender = now;
      const clean = stripThinking(fullText);
      if (clean) body.innerHTML = renderMarkdown(clean);
    }
  }).then(response => {
    _aiAbortController = null;
    const finalText = stripThinking((response as ResponseOperations | null | undefined)?.text || '');
    const usage = ((response as ResponseOperations | null | undefined)?.usage || {}) as TokenOperations;
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
    if (!identity.subscription) (trackUsage as UsageReader)(provider, modelId, usage.inputTokens || 0, usage.outputTokens || 0);

    if (meta) meta.innerHTML = buildMetaLine(interp);

    // Update generate button
    const btn = document.getElementById('emf-interp-generate') as HTMLButtonElement | null;
    if (btn) { btn.disabled = false; btn.textContent = 'Re-interpret'; }

    // Add discuss button if not present
    const overlay = document.getElementById('emf-interp-overlay') as InterpretationOverlay | null;
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
  }).catch((err: ErrorOperations) => {
    _aiAbortController = null;
    if (err.name === 'AbortError') return;
    body.innerHTML = `<div style="color:var(--red);padding:12px">Error: ${escapeHTML(err.message)}</div>`;
    const btn = document.getElementById('emf-interp-generate') as HTMLButtonElement | null;
    if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
  });
}

export function closeEMFInterpretation() {
  if (_aiAbortController) { _aiAbortController.abort(); _aiAbortController = null; }
  const overlay = document.getElementById('emf-interp-overlay');
  if (overlay) removeModalOverlay(overlay);
}

export function discussEMFInterpretation() {
  const overlay = document.getElementById('emf-interp-overlay') as InterpretationOverlay | null;
  const text = overlay?._interpretText;
  if (!text) return;
  closeEMFInterpretation();
  closeParentEMFModalRuntime();
  openEMFInterpretationChatRuntime(`I'd like to discuss this EMF assessment interpretation further. Here's the interpretation:\n\n${text}\n\nWhat questions should I prioritize, and what are the most important next steps?`);
}

function _collectMitigationTags(assessment: AssessmentOperations | null | undefined) {
  if (!assessment?.rooms) return [];
  const seen = new Set<unknown>();
  const out: unknown[] = [];
  // 1) User-tagged mitigation chips on each room (explicit signal)
  for (const room of assessment.rooms) {
    for (const t of (room.mitigations || [])) {
      if (!seen.has(t)) { seen.add(t); out.push(t); }
    }
  }
  // 2) Mitigations the AI interpretation text mentions, even if no chip was set.
  // This catches freshly-imported consultant PDFs where recommended mitigations
  // appear in prose but the room's chip array is empty.
  const interpText = (assessment.interpretation as InterpretationOperations | null | undefined)?.text;
  if (interpText) {
    for (const t of detectMitigationsInText(interpText)) {
      if (!seen.has(t)) { seen.add(t); out.push(t); }
    }
  }
  return out;
}

export function interpretEMFAssessment(assessmentId: unknown, deps: InterpretationDependencies = {}) {
  (deps as {collectActiveAssessmentState?: (() => unknown) | null}).collectActiveAssessmentState?.();
  const assessments = getAssessments(deps) as AssessmentOperations[];
  const a = assessments.find(x => x.id === assessmentId);
  if (!a) return;

  const fmtDate = new Date((a.date as string) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const title = `EMF Interpretation \u2014 ${fmtDate}${a.label ? ' (' + a.label + ')' : ''}`;
  const data = serializeAssessment(a);
  const tags = _collectMitigationTags(a);

  openInterpretationModal(title, a.interpretation as InterpretationOperations | null | undefined, () => {
    const prompt = `Interpret this Baubiologie EMF assessment. Identify the most concerning readings, explain health implications (especially for sleeping areas), and recommend specific mitigations in priority order.\n\n${data}`;
    streamInterpretation(prompt, (interp) => {
      a.interpretation = interp;
      saveImportedData();
    });
  }, tags);
}

export function interpretEMFComparison(deps: InterpretationDependencies = {}) {
  (deps as {collectActiveAssessmentState?: (() => unknown) | null}).collectActiveAssessmentState?.();
  const assessments = getAssessments(deps) as AssessmentOperations[];
  const sorted = [...assessments].sort((a, b) => (b.date as {localeCompare(value: unknown): number}).localeCompare(a.date));
  if (sorted.length < 2) return;

  const emf = state.importedData.emfAssessment as {comparisonInterpretation?: unknown} | null | undefined;
  if (!emf) return;
  const title = 'EMF Comparison \u2014 Before vs After';
  const before = serializeAssessment(sorted[1]!);
  const after = serializeAssessment(sorted[0]!);
  const tags = [..._collectMitigationTags(sorted[0]!), ..._collectMitigationTags(sorted[1]!)];
  const dedup: unknown[] = [];
  const seen = new Set<unknown>();
  for (const t of tags) { if (!seen.has(t)) { seen.add(t); dedup.push(t); } }

  openInterpretationModal(title, emf.comparisonInterpretation as InterpretationOperations | null | undefined, () => {
    const prompt = `Compare these two Baubiologie EMF assessments (before and after). Evaluate what improved, what worsened, and what still needs attention. Prioritize remaining concerns and suggest next steps.\n\nBEFORE:\n${before}\nAFTER:\n${after}`;
    streamInterpretation(prompt, (interp) => {
      emf.comparisonInterpretation = interp;
      saveImportedData();
    });
  }, dedup);
}
