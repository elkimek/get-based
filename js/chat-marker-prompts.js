// @ts-check
// chat-marker-prompts.js — marker and correlation prompts that open chat

import { state } from './state.js';
import { CONTEXT_SOURCE_IDS, isContextSourceEnabled } from './context-source-registry.js';
import { formatValue, getStatus, showNotification } from './utils.js';
import { getActiveData } from './data.js';
import { getEffectiveRangeForDate, getEffectiveRangeLabelForDate, getLatestValueIndex } from './marker-analysis.js';
import { openChatPanel } from './chat-panel.js';
import { createNewThread, ensureActiveThread, loadChatThreads, renameThread } from './chat-threads.js';
import { loadChatHistory, saveChatHistory } from './chat-history.js';
import { closeChatModalRuntime } from './chat-runtime.js';

/** @param {string} prompt @param {string} threadName @param {{closeModal?: boolean, canOpen?: () => boolean}} [options] */
async function openSourcePrompt(prompt, threadName, { closeModal = false, canOpen = () => true } = {}) {
  const profile = state.currentProfile;
  if (!canOpen()) return;
  if (closeModal) closeChatModalRuntime();
  const threadsLoaded = await loadChatThreads();
  if (threadsLoaded === false || state.currentProfile !== profile) return;
  ensureActiveThread();
  await loadChatHistory();
  if (state.currentProfile !== profile) return;
  if (state.chatHistory.length > 0) {
    await saveChatHistory();
    if (state.currentProfile !== profile) return;
    createNewThread();
  }
  if (!canOpen()) return;
  renameThread(state.currentThreadId, threadName);
  await openChatPanel(prompt);
}

export function askAIAboutMarker(markerId) {
  const marker = state.markerRegistry[markerId];
  if (!marker) return;
  const data = getActiveData();
  const dates = marker.singlePoint ? [marker.singleDateLabel || 'N/A'] : data.dates;
  const valuesText = marker.values
    .map((v, i) => {
      if (v === null) return null;
      let text = `${dates[i]}: ${formatValue(v)} ${marker.unit}`;
      if (marker.phaseLabels && marker.phaseLabels[i]) {
        const pr = marker.phaseRefRanges[i];
        const phaseLabel = marker.phaseDisplayLabels?.[i] || marker.phaseLabels[i];
        const cycleDay = marker.phaseCycleDays?.[i];
        const source = marker.phaseSources?.[i] === 'recorded' ? 'recorded' : 'predicted';
        text += ` (${phaseLabel} phase${cycleDay ? `, cycle day ${cycleDay}` : ''}, ${source}; ref ${formatValue(pr.min)}\u2013${formatValue(pr.max)})`;
      } else if (marker.contextRefRanges?.[i] || marker.contextOptimalRanges?.[i]) {
        const cr = getEffectiveRangeForDate(marker, i);
        const label = getEffectiveRangeLabelForDate(marker, i);
        const rangeText = cr.min != null || cr.max != null
          ? `${cr.min != null ? formatValue(cr.min) : '–'}\u2013${cr.max != null ? formatValue(cr.max) : '–'}`
          : 'not set';
        text += ` (${label}: ${rangeText})`;
      }
      return text;
    })
    .filter(Boolean).join(', ');
  const latestIdx = getLatestValueIndex(marker.values);
  const lr = getEffectiveRangeForDate(marker, latestIdx);
  const latestRangeLabel = getEffectiveRangeLabelForDate(marker, latestIdx);
  const status = latestIdx !== -1
    ? (lr.min != null || lr.max != null ? getStatus(marker.values[latestIdx], lr.min, lr.max) : 'unrated')
    : 'no data';
  const latestRangeText = lr.min != null || lr.max != null
    ? `${lr.min != null ? lr.min : '–'}\u2013${lr.max != null ? lr.max : '–'} ${marker.unit}`
    : 'not set';
  let prompt = `Tell me about my ${marker.name} results. Values: ${valuesText}. ${latestRangeLabel}: ${latestRangeText}${marker.optimalMin != null && !marker.contextOptimalRanges?.[latestIdx] && latestRangeLabel !== 'Optimal' ? `. Optimal range: ${marker.optimalMin}\u2013${marker.optimalMax}` : ''}. Current status: ${status}.`;
  if (marker.phaseLabels) prompt += ' Note: reference ranges shown are phase-specific for the menstrual cycle.';
  if (marker.rangePolicy === 'guidance') prompt += ' Note: the displayed band is guidance, not a diagnostic interval; use a report-provided laboratory range when available.';
  const nonNull = marker.values.filter(v => v !== null);
  if (nonNull.length >= 2) {
    const prev = nonNull[nonNull.length - 2];
    const last = nonNull[nonNull.length - 1];
    if (prev !== 0) {
      const pctChange = ((last - prev) / prev * 100).toFixed(1);
      const dir = last > prev ? 'up' : last < prev ? 'down' : 'stable';
      prompt += ` Trend: ${dir} ${Math.abs(parseFloat(pctChange))}% from previous.`;
    }
  }
  prompt += ' What matters most, what does this mean, and should I be concerned? Lead with the main takeaway and keep range comparisons brief unless a different threshold changes the interpretation.';
  void openSourcePrompt(prompt, marker.name, { closeModal: true });
}

function correlationSourcesAllowed(includeTherapies) {
  return isContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS)
    && (!includeTherapies || isContextSourceEnabled(CONTEXT_SOURCE_IDS.SUPPLEMENTS_MEDS));
}

export async function askAIAboutCorrelations() {
  if (state.selectedCorrelationMarkers.length < 1) return;
  if (!correlationSourcesAllowed(state.selectedCorrelationSupplements.length > 0)) { showNotification('Enable selected sources in AI Context.', 'info'); return; }
  const profile = state.currentProfile;
  const { prepareCorrelationSelection, therapyCorrelationPrompt } = await import('./therapy-correlations.js');
  if (profile !== state.currentProfile) return;
  const includeTherapies = state.selectedCorrelationSupplements.length > 0;
  const canOpen = () => correlationSourcesAllowed(includeTherapies);
  const selection = prepareCorrelationSelection(getActiveData(), state.importedData, state.selectedCorrelationMarkers, state.selectedCorrelationSupplements, 0, state.correlationView);
  if (selection.rangeError || !(selection.comparisons.length || selection.markerPairs.length)) return;
  const prompt = therapyCorrelationPrompt(selection);
  if (!prompt) { showNotification('Too much data for AI. Select fewer items or a shorter date range.', 'info'); return; }
  void openSourcePrompt(prompt, 'Biomarker and dose exploration', { canOpen });
}
