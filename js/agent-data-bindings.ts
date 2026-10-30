import { chatDataReadAllowed, chatDataChangeAllowed, CHAT_NATIVE_UI_NOTICE } from '../shared/chat-control-policy.js';
import { isLabDisplayResource } from './lab-display-core.js';
import { readCurrentLabDisplay, listCurrentLabDisplay } from './lab-display-records.js';
import { readCurrentCustomMarkerCreation, readCurrentCustomMarker, listCurrentCustomMarkers, prepareReviewedCustomMarker } from './custom-marker-records.js';
import { readCurrentMarkerRange, listCurrentMarkerRanges } from './marker-range-records.js';

import { getLensConfig } from './lens.js';

import { isEMFResource } from './emf-record-fields.js';
import { projectEMFRecord } from './emf-record-proposals.js';
import { state } from './state.js';
import { CONTEXT_SOURCE_IDS, isContextSourceEnabled } from './context-source-registry.js';
import { AGENT_DATA_RESOURCES, normalizeAgentDataProposal, agentDataObject, parseAgentDataPatch } from '../shared/agent-data-contract.js';
import type { AgentDataResource } from '../shared/agent-data-contract.js';
import { AGENT_DATA_LABELS, agentDataRows, agentDataIdentity, findAgentDataRecord, agentDataCapabilities, agentDataDisplay, projectAgentDataChange } from './agent-health-data-model.js';
import { createSupplementRecordId, getSupplementStatus, localDateKey } from './supplement-medication-domain.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import type { AgentToolReadOptions } from './agent-tool-runtime.js';
import { getProfiles, readCurrentProfileMeta } from './profile.js';
import { profileRecordSnapshot } from './profile-record-commands.js';
import { readCurrentNutritionRecords } from './nutrition-record-store.js';
import { createMealRecordSnapshot, freezeMealPatchTiming } from './nutrition-record-commands.js';
import { emptyManualRecordSnapshot } from './manual-record-commands.js';
import type { ManualRecordSnapshot } from './manual-record-commands.js';
import { readCurrentManualRecords, readCurrentManualRecord, prepareReviewedManualRecord } from './manual-record-store.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { listCurrentMarkerNotes, readCurrentMarkerNote } from './marker-note-records.js';
import { readCurrentLabResult, listCurrentLabResults } from './lab-result-records.js';
import { freezeLabResultPatch } from './lab-result-commands.js';
import { readCurrentLabSample, listCurrentLabSamples, createCurrentLabSampleSnapshot, prepareReviewedLabSample } from './lab-sample-records.js';
import { prepareLegacyAgentData } from './agent-legacy-draft-tools.js';
import { getContextDisclosureFingerprint } from './lab-context-settings.js';
import { isGeneticsResource, geneticsScope, projectGeneticsRecord } from './genetics-proposals.js';
import { isLightDeviceResource } from './light-device-fields.js';
import { projectLightDeviceRecord } from './light-device-proposals.js';
import { isLightEnvironmentResource } from './light-env-mutations.js';
import { projectLightEnvironmentRecord } from './light-env-proposals.js';
import { isLightMeasurementResource } from './light-measurement-fields.js';
import { projectLightMeasurementRecord } from './light-measurement-proposals.js';
import { projectSunSessionRecord } from './sun-session-proposals.js';
import { projectSunSetupRecord } from './sun-setup-proposals.js';
import { projectLabReport } from './lab-report-proposals.js';

async function currentRecord(resource: AgentDataResource, recordId: string, profileId: string) {

  if (isEMFResource(resource)) return (await import('./emf-records.js')).readCurrentEMFRecord(profileId, resource, recordId);
  if (resource === 'sunSessions') return (await import('./sun-session-records.js')).readCurrentSunSession(profileId, recordId);
  if (resource === 'sunSetup') return (await import('./sun-setup-records.js')).readCurrentSunSetup(profileId);
  if (isLightMeasurementResource(resource)) return (await import('./light-measurement-records.js')).readCurrentLightMeasurementRecord(profileId, resource, recordId);
  if (isLightDeviceResource(resource)) return (await import('./light-device-records.js')).readCurrentLightDeviceRecord(profileId, resource, recordId);
  if (isLightEnvironmentResource(resource)) return (await import('./light-env-records.js')).readCurrentLightEnvironmentRecord(profileId, resource, recordId);
  if (isGeneticsResource(resource)) return (await import('./genetics-records.js')).readCurrentGeneticsRecord(profileId, resource, recordId);
  if (resource === 'labReports') return (await import('./lab-report-records.js')).readCurrentLabReport(profileId, recordId);
  if (resource === 'labSamples') return readCurrentLabSample(profileId, recordId);
  if (isLabDisplayResource(resource)) return readCurrentLabDisplay(profileId, resource, recordId);
  if (resource === 'customMarkers') return readCurrentCustomMarker(profileId, recordId);
  if (resource === 'markerRanges') return readCurrentMarkerRange(profileId, recordId);
  if (resource === 'labResults') return readCurrentLabResult(profileId, recordId);
  if (resource === 'markerNotes' || resource === 'markerValueNotes') return readCurrentMarkerNote(profileId, resource, recordId);
  if (resource === 'meals') return (await readCurrentNutritionRecords(profileId)).find(row => row.id === recordId) || null;
  if (resource === 'manualReadings') return recordId ? readCurrentManualRecord(profileId, recordId) : null;
  if (resource !== 'profile') return findAgentDataRecord(await readAgentProfileRecords(profileId), resource, recordId);
  const row = getProfiles().find(profile => profile.id === profileId);
  return row ? profileRecordSnapshot(row) : null;
}

export function isAgentDataEnabled(resource: AgentDataResource): boolean {
  if (resource === 'knowledgeLibraries' || resource === 'knowledgeDocuments' || resource === 'knowledgeImports') { const source = getLensConfig(); return source.enabled && source.backend === 'in-browser'; }
  if (resource === 'knowledgeSettings') return true;
  if (resource === 'sunSessions') return isContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN);
  if (resource === 'sunSetup') return isContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN);
  if (isLightMeasurementResource(resource)) return isContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN);
  if (isLightDeviceResource(resource)) return isContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN);
  if (isLightEnvironmentResource(resource)) return isContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN);
  if (isGeneticsResource(resource)) return geneticsScope(resource);
  return isContextSourceEnabled(resource === 'labReports' || resource === 'labSamples' || resource === 'markerRanges' || resource === 'customMarkers' || isLabDisplayResource(resource) || resource === 'labResults' || resource === 'markerNotes' || resource === 'markerValueNotes' ? CONTEXT_SOURCE_IDS.LAB_MARKERS : resource === 'manualReadings' ? CONTEXT_SOURCE_IDS.WEARABLES : resource === 'supplements' ? CONTEXT_SOURCE_IDS.SUPPLEMENTS_MEDS : resource === 'nutritionTargets' || resource === 'meals' ? CONTEXT_SOURCE_IDS.NUTRITION : CONTEXT_SOURCE_IDS.INSIGHT_CARDS);
}
const unavailable = (reason: string) => ({ available: false as const, reason });
export function createAgentDataTools() {
  const profileId = state.currentProfile;
  const recordedAt = Date.now(), effectiveDate = localDateKey(recordedAt);
  const turnZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const turnLocalDateTime = new Date(recordedAt - new Date(recordedAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const snapshots = new Map<string, { resource: AgentDataResource; recordId: string; baseline: string; create: boolean }>();
  const capabilities = (resource: AgentDataResource) => {
    const native = agentDataCapabilities(resource, isContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS));
    return resource === 'labReports' ? { operations: [], fields: {}, rules: 'Metadata only. Source changes and removal use the native report review.' }
      : { ...native, operations: native.operations.filter(operation => chatDataChangeAllowed(resource, operation)), ...(resource === 'labSamples' ? { chatScope: 'Whole-sample removal uses the native sample/history UI.' } : {}) };
  };
  const tools = {
    async readData(input: AgentToolReadOptions['readData']) {
      const disclosure = getContextDisclosureFingerprint();
      const insightEnabled = isContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS);
      if (state.currentProfile !== profileId) return unavailable('Switch back to the originating profile.');
      if (!input.resource) return { available: true, resources: AGENT_DATA_RESOURCES.filter(chatDataReadAllowed).filter(isAgentDataEnabled).map(resource => ({ resource, label: AGENT_DATA_LABELS[resource] })) };
      const resource = input.resource;
      if (!chatDataReadAllowed(resource)) return unavailable(CHAT_NATIVE_UI_NOTICE);
      const scopeCurrent = () => state.currentProfile === profileId && getContextDisclosureFingerprint() === disclosure && isAgentDataEnabled(resource)
        && (!['labSamples', 'labReports'].includes(resource) || insightEnabled === isContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS));
      if (!isAgentDataEnabled(resource)) return unavailable('This data source is disabled.');
      const singleton = resource === 'sunSetup' || resource === 'profileNotes' || resource === 'nutritionTargets' || resource === 'profile';
      if (singleton && input.recordId) return unavailable('This resource uses the current profile and needs no record ID.');
      if (input.create && (singleton || input.recordId)) return unavailable('Use create only for a new collection record.');
      if (input.create && isGeneticsResource(resource)) return unavailable('Read the exact rsID, maternal or genome identity, then use its supported update/remove operation.');

      if (input.create && resource === 'labReports') return unavailable('Report creation requires the chosen-file import workflow. Read an existing report ID.');
      if (input.create && isLabDisplayResource(resource)) return unavailable('Read an exact existing marker or category ID; display metadata supports update/revert.');
      if (input.create && resource === 'markerRanges') return unavailable('Read the exact reference or optimal range ID, then use update or revert.');
      if (input.create && resource === 'labResults') return unavailable('Read an existing result ID. New lab results require the manual-entry or import editor.');
      if (input.create && (resource === 'markerNotes' || resource === 'markerValueNotes')) return unavailable('Read the marker note ID, including an empty note; then use update.');
      if (!singleton && !input.recordId && !input.create) {
        const rows = (isEMFResource(resource) ? await (await import('./emf-records.js')).listCurrentEMFRecords(profileId, resource) : resource === 'sunSessions' ? await (await import('./sun-session-records.js')).listCurrentSunSessions(profileId) : isLightMeasurementResource(resource) ? await (await import('./light-measurement-records.js')).listCurrentLightMeasurementRecords(profileId, resource) : isLightDeviceResource(resource) ? await (await import('./light-device-records.js')).listCurrentLightDeviceRecords(profileId, resource) : isLightEnvironmentResource(resource) ? await (await import('./light-env-records.js')).listCurrentLightEnvironmentRecords(profileId, resource) : isGeneticsResource(resource) ? await (await import('./genetics-records.js')).listCurrentGeneticsRecords(profileId, resource) : resource === 'labReports' ? await (await import('./lab-report-records.js')).listCurrentLabReports(profileId) : resource === 'labSamples' ? await listCurrentLabSamples(profileId) : isLabDisplayResource(resource) ? await listCurrentLabDisplay(profileId, resource) : resource === 'customMarkers' ? await listCurrentCustomMarkers(profileId) : resource === 'markerRanges' ? await listCurrentMarkerRanges(profileId) : resource === 'labResults' ? await listCurrentLabResults(profileId) : resource === 'markerNotes' || resource === 'markerValueNotes' ? await listCurrentMarkerNotes(profileId, resource) : resource === 'meals' ? await readCurrentNutritionRecords(profileId) : resource === 'manualReadings' ? await readCurrentManualRecords(profileId) : agentDataRows(await readAgentProfileRecords(profileId), resource))
          .filter(row => !input.query || JSON.stringify(agentDataDisplay(resource, row)).toLowerCase().includes(input.query.toLowerCase()));
        if (!scopeCurrent()) return unavailable('This profile or data source changed while reading. Read it again.');
        return { available: true, resource, ...capabilities(resource), total: rows.length, offset: input.offset,
          records: rows.slice(input.offset, input.offset + input.limit).map(row => {
            const display = agentDataDisplay(resource, row);
            return { recordId: agentDataIdentity(resource, row), summary: JSON.stringify(display).slice(0, 400),
              ...(resource === 'supplements' ? { name: String(agentDataObject(display).name || '').slice(0, 4000), type: String(agentDataObject(display).type || '') } : {}),
              ...(resource === 'markerRanges' || resource === 'customMarkers' || isLabDisplayResource(resource) || resource === 'labResults' || resource === 'markerNotes' || resource === 'markerValueNotes' ? { markerKey: String(agentDataObject(display).markerKey || ''), markerName: String(agentDataObject(display).markerName || '').slice(0, 4000) } : {}) };
          }), nextOffset: input.offset + input.limit < rows.length ? input.offset + input.limit : null };
      }
      if (resource === 'profile') await readCurrentProfileMeta(profileId);
      const recordId = input.create ? isEMFResource(resource) ? `emf_${globalThis.crypto.randomUUID()}` : resource === 'supplements' ? createSupplementRecordId() : resource === 'sunSessions' ? `sun_${globalThis.crypto.randomUUID()}` : isLightMeasurementResource(resource) ? `${resource === 'lightMeasurements' ? 'lm_' : 'la_'}${globalThis.crypto.randomUUID()}` : isLightDeviceResource(resource) ? `${resource === 'lightDevices' ? 'dev_' : 'devsess_'}${globalThis.crypto.randomUUID()}` : isLightEnvironmentResource(resource) ? `${resource === 'lightRooms' ? 'room_' : 'scr_'}${globalThis.crypto.randomUUID()}` : resource === 'meals' || resource === 'labSamples' ? globalThis.crypto.randomUUID() : '' : input.recordId;
      const current = input.create ? null : await currentRecord(resource, recordId, profileId);
      if (resource === 'profile' && current === null) return unavailable('The current profile is no longer available.');
      if (!singleton && !input.create && current === null) return { ...unavailable('This record is no longer available.'), missingRecord: true };
      const baseline = JSON.stringify(resource === 'customMarkers' && input.create ? await readCurrentCustomMarkerCreation(profileId) : isEMFResource(resource) && input.create ? await (await import('./emf-records.js')).readCurrentEMFRecord(profileId, resource, recordId, true) : resource === 'sunSessions' && input.create ? await (await import('./sun-session-records.js')).readCurrentSunSession(profileId, recordId, true) : isLightMeasurementResource(resource) && input.create ? await (await import('./light-measurement-records.js')).readCurrentLightMeasurementRecord(profileId, resource, recordId, true) : isLightDeviceResource(resource) && input.create ? await (await import('./light-device-records.js')).readCurrentLightDeviceRecord(profileId, resource, recordId, true) : isLightEnvironmentResource(resource) && input.create ? await (await import('./light-env-records.js')).readCurrentLightEnvironmentRecord(profileId, resource, recordId, true) : resource === 'labSamples' && input.create ? await createCurrentLabSampleSnapshot(profileId, recordId) : resource === 'meals' ? await createMealRecordSnapshot(current) : resource === 'manualReadings' ? current ?? emptyManualRecordSnapshot() : current);
      const deviceChoices = isLightDeviceResource(resource) ? (await import('./light-device-records.js')).lightDeviceRecordChoices() : null;
      if (!scopeCurrent()) return unavailable('This profile or data source changed while reading. Read it again.');
      if (baseline.length > 64000) return unavailable('This record is too large for one proposal. Use its editor.');
      const snapshotId = globalThis.crypto.randomUUID();
      if (snapshots.size >= 20) snapshots.delete(snapshots.keys().next().value!);
      snapshots.set(snapshotId, { resource, recordId, baseline, create: input.create });
      return { available: true, resource, recordId, snapshotId, ...({}), localDate: effectiveDate, currentTime: new Date(recordedAt).toISOString(), localDateTime: turnLocalDateTime, timeZone: turnZone, ...capabilities(resource), current: agentDataDisplay(resource, current),
        ...(isLabDisplayResource(resource) ? { choices: JSON.parse(baseline).choices } : {}),
        ...(resource === 'customMarkers' && input.create ? { choices: { categories: JSON.parse(baseline).categories } } : {}),
        ...({}),
        ...(resource === 'sunSessions' ? { requirements: { start: JSON.parse(baseline).start } } : {}),
        ...(deviceChoices ? { choices: deviceChoices } : {}),
        ...(resource === 'manualReadings' && (current as ManualRecordSnapshot | null)?.record?.kind === 'bloodPressure' ? { related: { manualPulseBpm: (current as ManualRecordSnapshot).relatedPulse ?? null } } : {}),
        ...(resource === 'supplements' && current ? { status: getSupplementStatus(agentDataObject(current)) } : {}) };
    },
    async prepareDataChange(input: AgentToolReadOptions['prepareDataChange']) {
      if (!chatDataChangeAllowed(input.resource, input.operation)) return unavailable(CHAT_NATIVE_UI_NOTICE);
      const disclosure = getContextDisclosureFingerprint();
      const insightEnabled = isContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS);
      if (state.currentProfile !== profileId) return unavailable('Switch back to the originating profile.');
      if (!isAgentDataEnabled(input.resource)) return unavailable('This data source is disabled.');
      const snapshot = snapshots.get(input.snapshotId);
      if (!snapshot || snapshot.resource !== input.resource || snapshot.create !== (input.operation === 'add' || input.resource === 'sunSessions' && input.operation === 'start')) return unavailable('Read the intended record (or create snapshot) first.');
      try {
        const current = snapshot.create ? null : await currentRecord(input.resource, snapshot.recordId, profileId);
        const currentBaseline = input.resource === 'meals' ? await createMealRecordSnapshot(current) : current;
        if ((!snapshot.create) && !profileDataValuesEqual(JSON.parse(snapshot.baseline), currentBaseline)) return unavailable('This record changed. Read it again.');
        const patch = input.resource === 'meals' ? JSON.stringify(freezeMealPatchTiming(parseAgentDataPatch(input.patch), current, recordedAt, turnZone)) : input.patch;
        const proposal = normalizeAgentDataProposal({ ...input, patch, recordId: snapshot.recordId, baseline: snapshot.baseline, effectiveDate, recordedAt });
        if (!proposal) return unavailable('Invalid data proposal.');
        if (proposal.resource === 'labResults') proposal.patch = JSON.stringify(freezeLabResultPatch(proposal));

        if (isEMFResource(proposal.resource)) await (await import('./emf-records.js')).prepareReviewedEMFRecord(profileId, proposal);
        if (proposal.resource === 'sunSessions') await (await import('./sun-session-records.js')).prepareReviewedSunSession(profileId, proposal);
        if (proposal.resource === 'sunSetup') await (await import('./sun-setup-records.js')).prepareReviewedSunSetup(profileId, proposal);
        if (isLightMeasurementResource(proposal.resource)) await (await import('./light-measurement-records.js')).prepareReviewedLightMeasurementRecord(profileId, proposal);
        if (isLightDeviceResource(proposal.resource)) await (await import('./light-device-records.js')).prepareReviewedLightDeviceRecord(profileId, proposal);
        if (isLightEnvironmentResource(proposal.resource)) await (await import('./light-env-records.js')).prepareReviewedLightEnvironmentRecord(profileId, proposal);
        if (isGeneticsResource(proposal.resource)) await (await import('./genetics-records.js')).prepareReviewedGeneticsRecord(profileId, proposal);
        if (proposal.resource === 'labReports') await (await import('./lab-report-records.js')).prepareReviewedLabReport(profileId, proposal);
        if (proposal.resource === 'labSamples') await prepareReviewedLabSample(profileId, proposal);
        if (proposal.resource === 'customMarkers') await prepareReviewedCustomMarker(profileId, proposal);
        if (proposal.resource === 'manualReadings') await prepareReviewedManualRecord(profileId, proposal);
        const { before, after } = projectAgentDataChange(proposal);
        if (proposal.operation === 'add' && proposal.resource === 'datedNotes') proposal.recordId = agentDataIdentity(proposal.resource, after);
        if ((proposal.operation === 'add' || proposal.resource === 'sunSessions' && proposal.operation === 'start') && await currentRecord(proposal.resource, proposal.recordId, profileId) !== null) return unavailable('This record already exists. Read it before proposing an edit.');
        const comparable = (value: unknown) => {
          const display = agentDataDisplay(proposal.resource, value);
          if (proposal.resource !== 'meals' || display === null) return display;
          const { source: _provenance, ...facts } = agentDataObject(display); return facts;
        };
        const imageOrder = proposal.resource === 'meals' ? parseAgentDataPatch(proposal.patch).keepImageIndices : undefined;
        const photosChanged = Array.isArray(imageOrder) && (imageOrder.length !== (before as { images?: unknown[] } | null)?.images?.length || imageOrder.some((value, index) => value !== index));
        if (!photosChanged && profileDataValuesEqual(comparable(before), comparable(after))) return unavailable('These values are already recorded.');
        if (state.currentProfile !== profileId || getContextDisclosureFingerprint() !== disclosure || !isAgentDataEnabled(input.resource)
          || ['labSamples', 'labReports'].includes(input.resource) && insightEnabled !== isContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS)) return unavailable('This profile or data source changed while preparing the review. Read it again.');
        const emfReview = isEMFResource(proposal.resource) ? projectEMFRecord(proposal) : null;
        const sessionReview = proposal.resource === 'sunSessions' ? projectSunSessionRecord(proposal) : null;
        const sunReview = proposal.resource === 'sunSetup' ? projectSunSetupRecord(proposal) : null;
        const measurementReview = isLightMeasurementResource(proposal.resource) ? projectLightMeasurementRecord(proposal) : null;
        const deviceReview = isLightDeviceResource(proposal.resource) ? projectLightDeviceRecord(proposal) : null;
        const lightReview = isLightEnvironmentResource(proposal.resource) ? projectLightEnvironmentRecord(proposal) : null;
        const geneticsReview = isGeneticsResource(proposal.resource) ? projectGeneticsRecord(proposal) : null;
        const reportReview = proposal.resource === 'labReports' ? projectLabReport(proposal) : null;

        return { available: true, payload: proposal, summary: `${AGENT_DATA_LABELS[proposal.resource]} · ${proposal.operation}`,
          ...({}),
          ...({}),
          ...({}),
          ...(emfReview ? { publicReview: { current: emfReview.before, proposed: emfReview.after, effects: emfReview.effects, applied: false } } : {}),
          ...(sessionReview ? { publicReview: { current: sessionReview.before, proposed: sessionReview.after, effects: sessionReview.effects, applied: false } } : {}),
          ...(sunReview ? { publicReview: { current: sunReview.before, proposed: sunReview.after, effects: sunReview.effects, applied: false } } : {}),
          ...(measurementReview ? { publicReview: { current: measurementReview.before, proposed: measurementReview.after, effects: measurementReview.effects, applied: false } } : {}),
          ...(deviceReview ? { publicReview: { current: deviceReview.before, proposed: deviceReview.after, effects: deviceReview.effects, applied: false } } : {}),
          ...(lightReview ? { publicReview: { current: lightReview.before, proposed: lightReview.after, effects: lightReview.effects, applied: false } } : {}),
          ...(geneticsReview ? { publicReview: { current: geneticsReview.before, effects: geneticsReview.plan, applied: false } } : {}),
          ...(reportReview ? { publicReview: { current: reportReview.before, effects: reportReview.plan, applied: false, diagnosticsRetained: true } } : {}) };
      } catch (error) { return unavailable(error instanceof Error ? error.message : 'Invalid data proposal.'); }
    },
  };
  return { ...tools, prepareLegacyDraft: (input: AgentToolReadOptions['prepareLegacyDraft']) => prepareLegacyAgentData(input, tools) };
}
