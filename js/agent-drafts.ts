// Review-and-approve boundary for changes proposed by a connected CLI agent.

import { state } from './state.js';
import { saveImportedDataForProfile } from './data.js';
import { appendImportedArrayItem } from './data-merge.js';
import { getActiveProfileId } from './profile.js';
import { saveMarkerNoteText } from './marker-detail-store.js';
import { saveActiveProfileMeal } from './nutrition-store.js';
import { logManualBP, logManualMetric } from './wearables-manual.js';
import {
  createSupplementRecordId,
  localDateKey,
  SUPPLEMENT_RECORD_VERSION,
} from './supplement-medication-domain.js';
import { resolveAgentMarker } from './agent-tool-bindings.js';

import type { DraftReader } from './agent-draft-presentation.js';
import type { AgentDraft } from './agent-tool-runtime.js';
type DraftPayload = Readonly<AgentDraft['payload']>;
type RawReading<Reading> = { [Key in keyof Reading]?: unknown };
export { renderAgentDraftCards } from './agent-draft-component.js';

function localMealTime(date: Date) {
  return {
    localDate: localDateKey(date),
    localTimeMinutes: date.getHours() * 60 + date.getMinutes(),
    timezoneOffsetMinutes: date.getTimezoneOffset(),
  };
}

async function applyNote(payload: DraftPayload, profileId: string) {
  if (payload.scope === 'marker') {
    const resolved = resolveAgentMarker(payload.marker);
    if (!resolved.row) throw new Error(resolved.matches.length ? 'Choose an unambiguous marker before applying.' : 'That marker is no longer available.');
    const current = String(state.importedData?.markerNotes?.[resolved.row.key] || '').trim();
    const next = payload.mode === 'replace' || !current ? payload.text : `${current}\n\n${payload.text}`;
    if (!await saveMarkerNoteText(resolved.row.key, next)) throw new Error('Could not save the marker note.');
    return `Marker note saved for ${resolved.row.name}.`;
  }
  const baseData = structuredClone(state.importedData);
  const draft = structuredClone(baseData);
  const current = String(draft.contextNotes || '').trim();
  (draft as { contextNotes?: unknown }).contextNotes = payload.mode === 'replace' || !current ? payload.text : `${current}\n\n${payload.text}`;
  if (!await saveImportedDataForProfile(profileId, draft, { baseData })) throw new Error('Could not save the profile context note.');
  return 'Profile context note saved.';
}

async function applyMeal(payload: DraftPayload) {
  const date = payload.eatenAt ? new Date(payload.eatenAt as string | number) : new Date();
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
    nutrients: { ...((payload.nutrients || {}) as Record<string, unknown>) },
    components: [], assumptions: [], warnings: [], images: [],
    confidence: null,
    source: { kind: 'manual-agent-draft', recordedAt: new Date().toISOString(), nutrientBasis: 'user-entered', review: { reviewedAt: new Date().toISOString() } },
    reviewed: true,
  });
  return `Meal “${saved.name}” saved.`;
}

async function applyBiometric(payload: DraftPayload, profileId: string) {
  if (payload.metric === 'bp') {
    await (logManualBP as (profileId: Parameters<typeof logManualBP>[0], reading: RawReading<Parameters<typeof logManualBP>[1]>) => ReturnType<typeof logManualBP>)(profileId, {
      date: payload.date || undefined,
      systolic: payload.systolic,
      diastolic: payload.diastolic,
      pulse: payload.pulse ?? undefined,
      tags: undefined,
      note: payload.note || undefined,
    });
    return 'Blood pressure saved.';
  }
  await (logManualMetric as (profileId: Parameters<typeof logManualMetric>[0], metric: unknown, reading: RawReading<Parameters<typeof logManualMetric>[2]>) => ReturnType<typeof logManualMetric>)(profileId, payload.metric, {
    date: payload.date || undefined,
    value: payload.value,
    unit: payload.unit || (payload.metric === 'weight' ? 'kg' : 'bpm'),
    tags: undefined,
    note: payload.note || undefined,
  });
  return payload.metric === 'weight' ? 'Weight saved.' : 'Resting pulse saved.';
}

async function applySupplement(payload: DraftPayload, profileId: string) {
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
    lifecycle: { state: (startDate as string) <= localDateKey() ? 'active' : 'planned', changedAt: now },
    updatedAt: now,
  };
  const baseData = structuredClone(state.importedData);
  const draft = structuredClone(baseData);
  appendImportedArrayItem(draft, 'supplements', entry);
  if (!await saveImportedDataForProfile(profileId, draft, { baseData })) throw new Error('Could not save the proposed supplement or medication.');
  return `${payload.type === 'medication' ? 'Medication' : 'Supplement'} “${payload.name}” saved.`;
}

export async function applyAgentDraft(draft: DraftReader | null | undefined) {
  if (!draft || draft.status !== 'pending') throw new Error('This proposal is no longer pending.');
  const activeProfileId = getActiveProfileId();
  if (!draft.profileId || draft.profileId !== activeProfileId) {
    throw new Error('Switch back to the profile where this proposal was created before applying it.');
  }
  if (draft.kind === 'note') return applyNote(draft.payload as DraftPayload, activeProfileId);
  if (draft.kind === 'meal') return applyMeal(draft.payload as DraftPayload);
  if (draft.kind === 'biometric') return applyBiometric(draft.payload as DraftPayload, activeProfileId);
  if (draft.kind === 'supplement') return applySupplement(draft.payload as DraftPayload, activeProfileId);
  throw new Error('This proposal type is not supported.');
}
