// @ts-check
// Review-and-approve boundary for changes proposed by a connected CLI agent.

import { state } from './state.js';
import { saveImportedData } from './data.js';
import { getActiveProfileId } from './profile.js';
import { saveMarkerNoteText } from './marker-detail-store.js';
import { saveActiveProfileMeal } from './nutrition-store.js';
import { logManualBP, logManualMetric } from './wearables-manual.js';
import {
  createSupplementRecordId,
  localDateKey,
  SUPPLEMENT_RECORD_VERSION,
} from './supplement-medication-domain.js';
import { escapeHTML } from './utils.js';
import { chatMessageActionAttrs } from './chat-message-action-attrs.js';
import { resolveAgentMarker } from './agent-tool-bindings.js';

function draftRows(draft) {
  const payload = draft?.payload || {};
  if (draft?.kind === 'note') return [
    ['Destination', payload.scope === 'marker' ? `Marker · ${payload.marker}` : 'Profile context note'],
    ['Mode', payload.mode || 'append'],
    ['Text', payload.text],
  ];
  if (draft?.kind === 'meal') return [
    ['Meal', payload.name], ['Type', payload.mealType], ['When', payload.eatenAt || 'Now'],
    ...Object.entries(payload.nutrients || {}).map(([key, value]) => [key, String(value)]),
    ...(payload.note ? [['Note', payload.note]] : []),
  ];
  if (draft?.kind === 'biometric') {
    const value = payload.metric === 'bp'
      ? `${payload.systolic}/${payload.diastolic}${payload.pulse ? ` · pulse ${payload.pulse}` : ''}`
      : `${payload.value} ${payload.unit || ''}`.trim();
    return [['Metric', payload.metric], ['Date', payload.date || 'Today'], ['Value', value], ...(payload.note ? [['Note', payload.note]] : [])];
  }
  return [['Type', payload.type], ['Name', payload.name], ['Start', payload.startDate || 'Today'],
    ...(payload.dosage ? [['Directions', payload.dosage]] : []), ...(payload.note ? [['Note', payload.note]] : [])];
}

export function renderAgentDraftCards(message, messageIndex) {
  const drafts = Array.isArray(message?.agentDrafts) ? message.agentDrafts : [];
  if (!drafts.length) return '';
  return drafts.map(draft => {
    const status = ['applying', 'applied', 'discarded', 'failed'].includes(draft.status) ? draft.status : 'pending';
    const rows = draftRows(draft).filter(([, value]) => value !== undefined && value !== null && value !== '');
    const details = rows.map(([label, value]) => `<div class="chat-agent-draft-row"><span>${escapeHTML(String(label))}</span><strong>${escapeHTML(String(value))}</strong></div>`).join('');
    const controls = status === 'pending'
      ? `<div class="chat-agent-draft-controls"><button type="button" class="chat-agent-draft-apply" ${chatMessageActionAttrs('apply-agent-draft', { index: messageIndex, draftId: draft.id })}>Apply</button><button type="button" class="chat-agent-draft-discard" ${chatMessageActionAttrs('discard-agent-draft', { index: messageIndex, draftId: draft.id })}>Discard</button></div>`
      : `<div class="chat-agent-draft-status chat-agent-draft-status-${status}">${status === 'applying' ? 'Applying…' : status === 'applied' ? 'Applied to getbased' : status === 'discarded' ? 'Discarded' : 'Could not apply'}</div>`;
    return `<section class="chat-agent-draft chat-agent-draft-${status}" aria-label="Agent-proposed change"><div class="chat-agent-draft-heading"><span>Proposed change</span><small>Review required</small></div><p>${escapeHTML(draft.summary || 'Agent proposal')}</p><div class="chat-agent-draft-details">${details}</div>${controls}</section>`;
  }).join('');
}

function localMealTime(date) {
  return {
    localDate: localDateKey(date),
    localTimeMinutes: date.getHours() * 60 + date.getMinutes(),
    timezoneOffsetMinutes: date.getTimezoneOffset(),
  };
}

async function applyNote(payload) {
  if (payload.scope === 'marker') {
    const resolved = resolveAgentMarker(payload.marker);
    if (!resolved.row) throw new Error(resolved.matches.length ? 'Choose an unambiguous marker before applying.' : 'That marker is no longer available.');
    const current = String(state.importedData?.markerNotes?.[resolved.row.key] || '').trim();
    const next = payload.mode === 'replace' || !current ? payload.text : `${current}\n\n${payload.text}`;
    await saveMarkerNoteText(resolved.row.key, next);
    return `Marker note saved for ${resolved.row.name}.`;
  }
  const current = String(state.importedData?.contextNotes || '').trim();
  state.importedData.contextNotes = payload.mode === 'replace' || !current ? payload.text : `${current}\n\n${payload.text}`;
  await saveImportedData();
  return 'Profile context note saved.';
}

async function applyMeal(payload) {
  const date = payload.eatenAt ? new Date(payload.eatenAt) : new Date();
  if (!Number.isFinite(date.getTime())) throw new Error('The proposed meal time is invalid.');
  let timeZone = '';
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}
  const saved = await saveActiveProfileMeal({
    id: globalThis.crypto?.randomUUID?.() || `meal-${Date.now()}`,
    name: payload.name,
    mealType: payload.mealType || 'other',
    eatenAt: date.toISOString(),
    ...localMealTime(date),
    timeZone,
    note: payload.note || '',
    nutrients: { ...(payload.nutrients || {}) },
    components: [], assumptions: [], warnings: [], images: [],
    confidence: null,
    source: { kind: 'manual-agent-draft', recordedAt: new Date().toISOString(), nutrientBasis: 'user-entered', review: { reviewedAt: new Date().toISOString() } },
    reviewed: true,
  });
  return `Meal “${saved.name}” saved.`;
}

async function applyBiometric(payload, profileId) {
  if (payload.metric === 'bp') {
    await logManualBP(profileId, {
      date: payload.date || undefined,
      systolic: payload.systolic,
      diastolic: payload.diastolic,
      pulse: payload.pulse ?? undefined,
      tags: undefined,
      note: payload.note || undefined,
    });
    return 'Blood pressure saved.';
  }
  await logManualMetric(profileId, payload.metric, {
    date: payload.date || undefined,
    value: payload.value,
    unit: payload.unit || (payload.metric === 'weight' ? 'kg' : 'bpm'),
    tags: undefined,
    note: payload.note || undefined,
  });
  return payload.metric === 'weight' ? 'Weight saved.' : 'Resting pulse saved.';
}

async function applySupplement(payload) {
  const startDate = payload.startDate || localDateKey();
  const now = Date.now();
  const entry = {
    id: createSupplementRecordId(),
    schemaVersion: SUPPLEMENT_RECORD_VERSION,
    name: payload.name,
    type: payload.type,
    dosage: payload.dosage || '',
    note: payload.note || '',
    startDate,
    endDate: null,
    periods: [{ start: startDate, end: null }],
    schedule: { mode: 'daily', timesPerDay: null },
    lifecycle: { state: startDate <= localDateKey() ? 'active' : 'planned', changedAt: now },
    updatedAt: now,
  };
  if (!Array.isArray(state.importedData.supplements)) state.importedData.supplements = [];
  state.importedData.supplements.push(entry);
  await saveImportedData();
  return `${payload.type === 'medication' ? 'Medication' : 'Supplement'} “${payload.name}” saved.`;
}

export async function applyAgentDraft(draft) {
  if (!draft || draft.status !== 'pending') throw new Error('This proposal is no longer pending.');
  const activeProfileId = getActiveProfileId();
  if (!draft.profileId || draft.profileId !== activeProfileId) {
    throw new Error('Switch back to the profile where this proposal was created before applying it.');
  }
  if (draft.kind === 'note') return applyNote(draft.payload);
  if (draft.kind === 'meal') return applyMeal(draft.payload);
  if (draft.kind === 'biometric') return applyBiometric(draft.payload, activeProfileId);
  if (draft.kind === 'supplement') return applySupplement(draft.payload);
  throw new Error('This proposal type is not supported.');
}
