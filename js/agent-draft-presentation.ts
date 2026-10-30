import { chatDataChangeAllowed, CHAT_NATIVE_UI_NOTICE } from '../shared/chat-control-policy.js';

import { isEMFResource, describeEMFRecord } from './emf-record-fields.js';
import { projectEMFRecord } from './emf-record-proposals.js';
import { projectSunSessionRecord, describeSunSessionRecord } from './sun-session-proposals.js';
import { projectSunSetupRecord, describeSunSetupRecord } from './sun-setup-proposals.js';
import { isLightMeasurementResource } from './light-measurement-fields.js';
import { projectLightMeasurementRecord } from './light-measurement-proposals.js';
import { isLightDeviceResource } from './light-device-fields.js';
import { projectLightDeviceRecord } from './light-device-proposals.js';
import { isLightEnvironmentResource } from './light-env-mutations.js';
import { projectLightEnvironmentRecord } from './light-env-proposals.js';
import { normalizeAgentDataProposal } from '../shared/agent-data-contract.js';
import { LEGACY_AGENT_DRAFT_KINDS } from '../shared/agent-data-contract.js';
import type { AgentLegacyDraftKind } from '../shared/agent-data-contract.js';
import { AGENT_DATA_LABELS, agentDataDisplay, projectAgentDataChange } from './agent-health-data-model.js';
import { NUTRIENT_DEFINITIONS } from './nutrition-nutrient-registry.js';
import { parseAgentDataPatch } from '../shared/agent-data-contract.js';
import { projectContextRecord } from './agent-context-records.js';
import { HEALTH_GOAL_PRIORITIES } from './health-goals-utils.js';
import { describeManualRecord, parseManualRecordSnapshot } from './manual-record-commands.js';
import { describeLabSample, parseLabSampleSnapshot } from './lab-sample-proposals.js';
import { describeLabResult, projectLabResult } from './lab-result-commands.js';
import { isGeneticsResource, describeGeneticsRecord, projectGeneticsRecord } from './genetics-proposals.js';
import { describeLabReport, projectLabReport } from './lab-report-proposals.js';
import { describeMarkerNote } from './marker-note-commands.js';
import { contextValueForRead } from './context-card-legacy.js';
import type { AgentDraft } from './agent-tool-runtime.js';
import { AGENT_CONTEXT_CARD_LABELS, normalizeAgentContextProposal } from '../shared/agent-tool-contract.js';
export interface DraftReader { profileId?: unknown; status?: unknown; kind?: unknown; payload?: unknown; id?: unknown; summary?: unknown; }
type DraftPayload = Readonly<AgentDraft['payload']>;
function describeMeal(value: unknown): string {
  if (value === null) return 'Not recorded / removed';
  const row = value as Record<string, unknown>, total = (row.nutrients || {}) as Record<string, unknown>;
  const nutrientText = NUTRIENT_DEFINITIONS.filter(field => typeof total[field.key] === 'number').map(field => `${field.label}: ${total[field.key]} ${field.unit}`).join(' · ');
  const components = (Array.isArray(row.components) ? row.components as Record<string, unknown>[] : []).map((part, index) => `${index + 1}. ${part.name}${part.quantityG == null ? ' · amount unknown' : ` · ${part.quantityG} g`}`).join('\n');
  const photos = Array.isArray(row.images) ? row.images as Record<string, unknown>[] : [];
  const response = (row.responseCheckIn || {}) as Record<string, unknown>;
  const hunger = ['Unknown', 'Hungry again', 'Neutral', 'Still satisfied'][Number(response.satiety2h) || 0];
  const energy = ['Unknown', 'Slump', 'Steady', 'Energized'][Number(response.energy2h) || 0];
  const source = (row.source || {}) as Record<string, unknown>;
  const review = (source.review || {}) as Record<string, unknown>;
  const kinds: Record<string, string> = { 'ai-photo-estimate': 'Photo estimate', 'ai-label-scan': 'Printed label', 'barcode-database': 'Food database', 'reused-meal': 'Reviewed meal copy' };
  const minute = Number(row.localTimeMinutes), time = row.localDate && Number.isInteger(minute)
    ? `${row.localDate} ${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')} ${row.timeZone || ''}` : String(row.eatenAt);
  return [`${row.name} · ${row.mealType || 'other'}`, `When: ${time}`,
    `Nutrients: ${nutrientText || 'Not reported'}`, `Ingredients:\n${components || 'Not reported'}`,
    `Photos: ${photos.length ? photos.map((photo, index) => `${index + 1}. ${photo.fileName || 'Saved photo'}`).join(', ') : 'None'}`,
    ...(row.note ? [`Note: ${row.note}`] : []), ...(row.analysisContext ? [`Meal details: ${row.analysisContext}`] : []),
    `After-meal hunger: ${hunger} · energy: ${energy}`, `Original source: ${kinds[String(source.kind)] || 'Manual entry'}`,
    ...(review.analysisInvalidated === true ? ['The previous estimate was cleared after a correction. Original analysis retained as history.'] : [])].join('\n');
}
function draftRows(draft: DraftReader | null | undefined) {
  const payload = (draft?.payload || {}) as DraftPayload;
  if (draft?.kind === 'data') {
    const proposal = normalizeAgentDataProposal(payload);
    if (!proposal) return [['Proposal', 'Invalid data update. Ask for a new proposal.']];
    try {
      const { before, after } = projectAgentDataChange(proposal);
      const display = (value: unknown) => isEMFResource(proposal.resource) ? describeEMFRecord(proposal.resource, value) : proposal.resource === 'sunSessions' ? describeSunSessionRecord(value) : proposal.resource === 'sunSetup' ? describeSunSetupRecord(value) : isGeneticsResource(proposal.resource) ? describeGeneticsRecord(value) : proposal.resource === 'labReports' ? describeLabReport(value) : proposal.resource === 'labSamples' ? describeLabSample(value) : proposal.resource === 'labResults' ? describeLabResult(value) : proposal.resource === 'markerNotes' || proposal.resource === 'markerValueNotes' ? describeMarkerNote(value) : proposal.resource === 'manualReadings' ? describeManualRecord(value) : proposal.resource === 'meals' ? describeMeal(value) : value === null ? 'Not recorded / removed' : typeof value === 'string' ? value || 'Empty' : JSON.stringify(agentDataDisplay(proposal.resource, value), null, 2);
      const effects: string[][] = [];
      let operationLabel: string = proposal.operation;

      if (isEMFResource(proposal.resource)) {
        const { effects: emf } = projectEMFRecord(proposal);
        if (emf.retainedHistory) effects.push(['Source history', 'Previous inputs, original readings, photos and interpretation remain in private assessment history. This is not complete erasure.']);
        if (emf.interpretationCleared || emf.comparisonCleared) effects.push(['Saved interpretation', 'Stale assessment/comparison interpretation is cleared; current screening uses the approved inputs.']);
        if (emf.removedRooms || emf.removedMeasurements || emf.removedPhotos) effects.push(['Removed current data', `${emf.removedRooms} rooms, ${emf.removedMeasurements} readings and ${emf.removedPhotos} photos leave the current record.`]);
        if (emf.removedAssessment) effects.push(['Assessment removal', `Removes this assessment and its rooms, readings, photos and ${emf.removedHistory} local history entries. Original files, conversations, exports and backups remain.`]);
      }
      if (proposal.resource === 'sunSessions') {
        const { effects: session } = projectSunSessionRecord(proposal);
        if (session.liveAction) {
          operationLabel = session.liveAction === 'start' ? 'Start timer' : session.liveAction === 'setCoverage' ? 'Change exposed body regions' : session.liveAction === 'setSunscreen' ? 'Record sunscreen use' : session.liveAction === 'rotateSides' ? 'Record a side change' : session.liveAction === 'pause' ? 'Pause timer' : session.liveAction === 'resume' ? 'Resume timer' : 'Stop timer';
          effects.push(['Live timer action', operationLabel]);
          effects.push(['Action timing', 'Takes effect when you Apply, after pending Sun writes finish. The timer continues in its current state until then. This does not move the action back to the message time.']);
          if (session.liveAction === 'start') effects.push(['Live exposure inputs', 'Only reported facts are recorded. A known eye mode is tracked over the live interval. Unknown details block estimates; they are not replaced with picker defaults. The timer does not establish a safe exposure duration.']);
          effects.push(['Timed exposure', 'Existing measured slices remain. The current slice closes using the previous exposure inputs before a running timer is paused, stopped or changed. A side change never multiplies a dose.']);
        }
        if (session.retainedHistory) effects.push(['Session source history', 'Previous times, exposure inputs, timed slices, location and interpretation remain in private local history.']);
        if (session.recalculates) effects.push(['Recalculation', 'Previous estimates clear after Apply. The native weather and spectrum owner recalculates from the accepted inputs; results may remain unavailable if conditions cannot be obtained.']);
        if (session.estimateState === 'needs-inputs') effects.push(['Unknown exposure details', 'Unreported skin, eye, sunscreen, glass, posture and ground facts stay unknown. Estimates wait for the missing inputs.']);
        if (session.estimateState === 'needs-location') effects.push(['Location needed', 'Recorded facts are saved. Estimates need a location.']);
        if (session.locationChange !== 'unchanged') effects.push(['Session location', session.locationChange === 'saved' ? 'Use the current saved app location captured for this review.' : session.locationChange === 'clear' ? 'Clear this session location.' : `Reported latitude ${parseAgentDataPatch(proposal.patch).latitude}, longitude ${parseAgentDataPatch(proposal.patch).longitude}${Object.hasOwn(parseAgentDataPatch(proposal.patch), 'altitudeM') ? `, altitude ${parseAgentDataPatch(proposal.patch).altitudeM} m` : ''}`]);
        if (session.removedSession) effects.push(['Removed session evidence', 'This session and its local input, segment, calculation and interpretation history are removed. Other sessions, original files, backups and conversations remain.']);
        if (session.removedHistoryCount) effects.push(['Removed local history', `${session.removedHistoryCount} saved input/calculation versions are removed with this session.`]);
      }
      if (proposal.resource === 'sunSetup') {
        const { effects: setup } = projectSunSetupRecord(proposal);
        if (setup.mirrorsSkin) effects.push(['Light & Circadian skin type', setup.mirroredSkinType || 'Cleared']);
        if (setup.safetyDefaultsChanged) effects.push(['Estimate inputs', 'Future Sun safety estimates and Light device comparisons use these updated defaults. Saved session inputs and calculations remain unchanged.']);
        if (setup.historyRetained) effects.push(['Setup history', 'Previous setup inputs and interpretation remain in private local history.']);
        if (setup.analysisCleared) effects.push(['Previous setup interpretation', 'Cleared because its inputs changed. Request a new interpretation from Light setup when ready.']);
        effects.push(['Partial answers', 'Unreported habits remain unknown. This update does not mark a partial setup complete.']);
      }
      if (isLightMeasurementResource(proposal.resource)) {
        const { effects: readingEffects } = projectLightMeasurementRecord(proposal);
        if (readingEffects.replacedMeasurements.length) effects.push(['Replaced current readings', display(readingEffects.replacedMeasurements)]);
        if (readingEffects.preservedAuditCount) effects.push(['Preserved checkpoints', `${readingEffects.preservedAuditCount} saved checkpoints keep their frozen original evidence.`]);
        if (readingEffects.capturedCounts) effects.push(['Frozen checkpoint', `${readingEffects.capturedCounts.rooms} rooms, ${readingEffects.capturedCounts.screens} screens and ${readingEffects.capturedCounts.measurements} room-mapped readings are copied from the current environment.`]);
        if (readingEffects.retainedHistory) effects.push(['Source history', 'Original acquisition, corrected inputs and replaced readings remain in private local history.']);
        if (readingEffects.removedSnapshot) effects.push(['Removed checkpoint evidence', 'This checkpoint and its frozen rooms, screens, readings and local metadata history are removed. Live environment records remain.']);
        if (readingEffects.removedHistoryCount) effects.push(['Removed local history', `${readingEffects.removedHistoryCount} prior local history entries are removed with this record.`]);
        if (readingEffects.analysisCleared) effects.push(['Saved interpretation', 'The saved analysis is cleared; derived screening uses the accepted inputs.']);
      }
      if (isLightDeviceResource(proposal.resource)) {
        const { effects: deviceEffects } = projectLightDeviceRecord(proposal);
        if (deviceEffects.recalculatedSessions.length) effects.push(['Recalculated sessions', deviceEffects.recalculatedSessions.map(row => `${row.id}: ${JSON.stringify(row.beforeDoses)} → ${JSON.stringify(row.afterDoses)}; end ${row.beforeEndedAt} → ${row.afterEndedAt}`).join('\n')]);
        if (proposal.resource === 'lightDevices' && proposal.operation === 'remove') effects.push(['Preserved sessions', `${deviceEffects.retainedSessionCount} recorded sessions remain with their saved device specifications and calculated history.`]);
        if (deviceEffects.removedSpecificationCount) effects.push(['Removed library history', `${deviceEffects.removedSpecificationCount} previous device-only specifications are removed with this library record. Recorded session snapshots and their history remain.`]);
        if (proposal.resource === 'lightDeviceSessions' && proposal.operation === 'remove') effects.push(['Removed session history', 'Clears this session and its local edit/calculation/AI history. The device, other sessions, conversations and original files remain.']);
        if (deviceEffects.sourceHistoryRetained) effects.push(['Source history', 'Previous device specifications/session inputs and calculations remain in local history.']);
        if (deviceEffects.analysisCleared) effects.push(['Previous AI analysis', 'Cleared because its inputs changed. The previous analysis remains in local history.']);
        if (Object.hasOwn(parseAgentDataPatch(proposal.patch), 'specSourceUrl')) effects.push(['Reported source link', String(parseAgentDataPatch(proposal.patch).specSourceUrl || 'Cleared')]);
      }
      if (isLightEnvironmentResource(proposal.resource)) {
        const { effects: lightEffects } = projectLightEnvironmentRecord(proposal);
        if (lightEffects.unlinkedScreens.length) effects.push(['Unlinked screens', lightEffects.unlinkedScreens.map(row => `${row.device} · ${row.id} becomes portable/unassigned.`).join('\n')]);
        if (proposal.resource === 'lightRooms' && proposal.operation === 'remove') effects.push(['Preserved measurements', `${lightEffects.preservedMeasurementCount} historical readings remain with their original room identity/name. Saved screens remain; only their room link changes.`]);
        if (Object.hasOwn(parseAgentDataPatch(proposal.patch), 'todayActive')) effects.push(['Day override', `Applies only to ${proposal.effectiveDate}. Null clears the override; usual settings apply on other dates.`]);
        if (proposal.operation === 'add') effects.push(['Unreported details', 'Unknown light sources, hours, measurements and screen-filter status remain unknown.']);
      }
      if (isGeneticsResource(proposal.resource)) {
        const { plan } = projectGeneticsRecord(proposal);
        if (plan.apoe) effects.push(['Derived APOE', `${plan.apoe.before || 'Not resolved'} → ${plan.apoe.after || 'Not resolved'}`]);
        if (plan.coverage) effects.push(['Recorded SNP calls', `${plan.coverage.before} → ${plan.coverage.after}`]);
        if (proposal.resource === 'geneticVariants' && proposal.operation === 'update') effects.push(['Reported source', String(parseAgentDataPatch(proposal.patch).sourceLabel || 'Reported in chat')]);
        if (plan.clearsVariantEvidence) effects.push(['Removed SNP evidence', 'Clears this saved call and its prior-call/source history. An identity-only removal record prevents stale copies or imports from reviving it. Other SNPs, maternal data, conversations and original files remain.']);
        if (plan.restoresRemovedCall) effects.push(['Explicit SNP restoration', 'Restores this identity using the reported genotype. Previously removed call/source history is not recovered.']);
        if (plan.restoresRemovedGenome) effects.push(['New genome after removal', 'Records only the reviewed new facts in a new genome generation. Previously removed calls, maternal reports and source history are not recovered.']);
        if (plan.restoresMaternalData) effects.push(['Explicit maternal restoration', 'Records the newly reported lineage. Previously removed mutation records and maternal reports are not recovered.']);
        if (plan.clearsWholeGenome) effects.push(['Whole-genome removal', 'Clears ALL saved SNP calls, maternal data, derived summaries, genome metadata and local call/report/source history. Original files, conversations and identity-only removal generations remain. Restoration needs newly reported facts or a reviewed file and does not recover erased history.']);
        if (plan.replacesRecordedCall) effects.push(['Source evidence', 'The previous call and its original source remain in local call history.']);
        if (proposal.resource === 'maternalHaplogroup') effects.push(['Maternal evidence', plan.clearsMaternalEvidence ? 'Clears the saved maternal lineage, mutation records and previous maternal reports. SNP calls and original files remain.' : plan.restoresMaternalData || plan.restoresRemovedGenome ? 'Records the newly reported lineage without recovering previously erased reports or mutation history.' : 'The previous maternal report remains in local history. An explicitly reported lineage replaces the current maternal summary.']);
      }
      if (proposal.resource === 'labReports') {
        const { plan } = projectLabReport(proposal);
        effects.push(['Report scope', 'Only the selected report is removed. Other samples are preserved. Diagnostic benchmark history and original files are retained.']);
        effects.push(['Result effects', plan.results.length ? plan.results.map(row => `${row.name}: ${row.before ?? 'Not recorded'} → ${row.after ?? 'Removed'} ${row.unit} · ${row.beforeSource} → ${row.afterSource}`).join('\n') : 'No current result values or sources change.']);
        if (plan.sampleRemoved) effects.push(['Sample removal', 'No results remain in the linked sample. Its complete collection record will be removed.']);
        if (plan.collection.length) effects.push(['Collection effects', plan.collection.map(row => `${row.field === 'sampleTime' ? 'Collection time' : 'Fasting'}: ${row.before ?? 'Unknown'} → ${row.after ?? 'Unknown'}`).join('\n')]);
        if (plan.ranges.length) {
          const range = (row: typeof plan.ranges[number]['before']) => `${row.source}: ${row.referenceMin ?? 'No lower override'} to ${row.referenceMax ?? 'No upper override'}; retained lab ${row.retainedLabMin ?? 'None'} to ${row.retainedLabMax ?? 'None'}${row.reportDate ? ` (${row.reportDate})` : ''}`;
          effects.push(['Stored reference-range effects', plan.ranges.map(row => `${row.name} (${row.unit}): ${range(row.before)} → ${range(row.after)}`).join('\n')]);
        }
        if (plan.notes.length) effects.push(['Shared dated note effects', plan.notes.map(row => `${row.name} · ${row.date}: ${row.before || 'Empty'} → ${row.after || 'Cleared'}`).join('\n')]);
        if (plan.clearedOriginals.length) effects.push(['Cleared Revert originals', plan.clearedOriginals.map(row => row.name).join(', ')]);
      }
      if (proposal.resource === 'labSamples') {
        const snapshot = parseLabSampleSnapshot(JSON.parse(proposal.baseline));
        effects.push(['Sample scope', 'Collection and date changes apply to every result on this sample. Separate samples retain their own values and collection facts.']);
        if (snapshot.plan?.notes.length) effects.push(['Dated result notes', snapshot.plan.notes.map(row => `${row.markerKey} · ${row.date}: ${row.before || 'Empty'} → ${row.after || 'Cleared'}`).join('\n')]);
        if (snapshot.plan?.contextNotes.length) effects.push(['Notes applying to this sample', snapshot.plan.contextNotes.map(row => `${row.markerKey}: ${row.before || 'Empty'} → ${row.after || 'Empty'}`).join('\n')]);
        if (snapshot.record && after && snapshot.record.date !== (after as { date: string }).date) effects.push(['Date correction', 'Unshared dated notes move with the sample. Notes still used by another sample remain on the original date.']);
        if (proposal.operation === 'add') effects.push(['New sample', 'Creates a separate manually reported sample. Unknown collection facts stay unknown.']);
        if (['cycleDay', 'cyclePhase', 'cyclePhaseDetail'].some(field => Object.hasOwn(parseAgentDataPatch(proposal.patch), field))) effects.push(['Cycle context', 'Only this sample changes. Observed periods stay unchanged. Reported phases are saved as recorded; clearing the phase allows profile-based predictions again. An incompatible old phase detail is cleared.']);
      }
      if (proposal.resource === 'labResults') {
        const review = projectLabResult(proposal, parseAgentDataPatch(proposal.patch));
        if (review.effects.length) effects.push(['Linked results on this sample', review.effects.map(row => `${row.markerName}: ${row.before ?? 'Not recorded'} → ${row.value ?? 'Removed'} ${row.unit}`).join('\n')]);
        if (review.clearsSharedNote) effects.push(['Shared dated note', 'The last result for this marker leaves this date. Its dated note will be cleared.']);
      }
      if (proposal.resource === 'manualReadings') {
        const patch = parseAgentDataPatch(proposal.patch), snapshot = parseManualRecordSnapshot(JSON.parse(proposal.baseline));
        if (Object.hasOwn(patch, 'pulse')) effects.push(['Manual pulse', `${snapshot.relatedPulse ?? snapshot.destination?.relatedPulse ?? 'Not recorded'} bpm → ${patch.pulse === null ? 'Cleared' : `${patch.pulse} bpm`}. Saved with the blood pressure in one commit.`]);
        if (Object.hasOwn(patch, 'note') || Object.hasOwn(patch, 'tags')) effects.push(['Shared date context', 'These notes/tags apply to all manual readings on the proposed date.']);
        if (snapshot.record && snapshot.soleReading && (!after || (after as { date: string }).date !== snapshot.record.date)) effects.push(['Previous date context', 'The last reading leaves this date. Its shared notes and tags will be cleared.']);
        if (snapshot.record && after && (after as { date: string }).date !== snapshot.record.date) effects.push(['Date correction', 'Only this reading and its paired measurements move. Destination-date notes/tags are retained unless explicitly changed.']);
      }
      if (proposal.resource === 'meals' && after !== null) {
        const patch = parseAgentDataPatch(proposal.patch), prior = (before as { nutrients?: Record<string, unknown> } | null)?.nutrients || {}, next = (after as { nutrients?: Record<string, unknown> }).nutrients || {};
        const cleared = NUTRIENT_DEFINITIONS.filter(field => Object.hasOwn(prior, field.key) && !Object.hasOwn(next, field.key)).map(field => field.label);
        if (cleared.length) effects.push(['Cleared nutrient values', `${cleared.join(', ')}. These values will be unknown.`]);
        if (patch.componentChanges) effects.push(['Portion calculation', 'Linked ingredient nutrients are recalculated. Explicit whole-meal nutrient values are retained.']);
        if (Array.isArray(patch.keepImageIndices)) effects.push(['Retained original photos', patch.keepImageIndices.length ? patch.keepImageIndices.map(index => String(Number(index) + 1)).join(', ') : 'None']);
      }
      return [['Destination', AGENT_DATA_LABELS[proposal.resource]], ['Operation', operationLabel], ['Current', display(before)], ['Proposed', display(after)], ...effects, ['Proposal date', proposal.effectiveDate], ['You said', proposal.evidence], ['Reason', proposal.reason]];
    } catch { return [['Proposal', 'Invalid data update. Ask for a new proposal.']]; }
  }
  if (draft?.kind === 'context') {
    const proposal = normalizeAgentContextProposal(payload);
    if (!proposal) return [['Proposal', 'Invalid context update. Ask for a new proposal.']];
    try {
      const baseline = contextValueForRead(proposal.card, JSON.parse(proposal.baseline)) as Record<string, unknown> | null;
      const recordLabels: Record<string, string> = { name: 'Condition', text: 'Goal', severity: 'Priority / impact', status: 'Status', since: 'Since',
        relative: 'Relative', condition: 'Condition', onsetAge: 'Age at onset', note: 'Note', startDate: 'Start date', endDate: 'End date', flow: 'Flow', symptoms: 'Symptoms', notes: 'Notes' };
      const display = (value: unknown): string => value == null || value === '' || (Array.isArray(value) && !value.length)
        ? 'Not recorded' : Array.isArray(value) ? value.map(display).join('; ')
          : typeof value === 'object' ? Object.entries(value).filter(([key]) => Object.hasOwn(recordLabels, key))
            .map(([key, value]) => `${recordLabels[key]}: ${key === 'relative' ? String(value).replaceAll('_', ' ') : key === 'severity' && proposal.card === 'healthGoals' ? HEALTH_GOAL_PRIORITIES.find(option => option.value === value)?.label || display(value) : display(value)}`).join(' · ') : String(value);
      return [
        ['Destination', AGENT_CONTEXT_CARD_LABELS[proposal.card]],
        ...(proposal.card === 'environment' && proposal.changes.some(change => ['emf', 'emfMitigation'].includes(change.field)) ? [['Self-reported EMF context', 'Changes the Environment card quick answers. No assessment or measured reading is created. Saved assessments require a fresh room-specific proposal.']] : []),
        ...proposal.changes.flatMap(change => {
          const label = proposal.card === 'environment' && change.field === 'emf' ? 'EMF exposure' : proposal.card === 'environment' && change.field === 'emfMitigation' ? 'EMF mitigation' : change.field.replace(/([A-Z])/g, ' $1').replace(/^./, initial => initial.toUpperCase());
          const current = proposal.card === 'healthGoals' ? baseline : proposal.card === 'interpretiveLens' ? baseline
            : baseline?.[change.field] ?? (baseline?.flags as Record<string, unknown> | undefined)?.[change.field];
          if (change.operation) {
            const { before, after } = projectContextRecord(proposal.card, baseline, change);
            const clear = Array.isArray(change.record?.clearFields) ? change.record.clearFields : [];
            return [[`${label} · current`, display(before)], [`${label} · ${change.operation}`, change.operation === 'remove' ? 'Remove this record' : display(after)],
              ...(clear.length ? [['Clear', clear.map(key => recordLabels[key] || key).join(', ')]] : [])];
          }
          return [[`${label} · current`, display(current)], [`${label} · proposed`, display(change.values ?? change.value?.trim())]];
        }),
        ['You said', proposal.evidence], ['Reason', proposal.reason],
      ];
    } catch { return [['Proposal', 'Invalid context update. Ask for a new proposal.']]; }
  }
  if (draft?.kind === 'note') return [
    ['Destination', payload.scope === 'marker' ? `Marker · ${payload.marker}` : 'Profile context note'],
    ['Mode', payload.mode || 'append'],
    ['Text', payload.text],
  ];
  if (draft?.kind === 'meal') return [
    ['Meal', payload.name], ['Type', payload.mealType], ['When', payload.eatenAt || 'Not specified — ask for a dated proposal'],
    ...Object.entries(payload.nutrients || {}).map(([key, value]) => [key, String(value)]),
    ...(payload.note ? [['Note', payload.note]] : []),
  ];
  if (draft?.kind === 'biometric') {
    const value = payload.metric === 'bp'
      ? `${payload.systolic}/${payload.diastolic}${payload.pulse ? ` · pulse ${payload.pulse}` : ''}`
      : `${payload.value} ${payload.unit || ''}`.trim();
    return [['Metric', payload.metric], ['Date', payload.date || 'Not specified — ask for a dated proposal'], ['Value', value], ...(payload.note ? [['Note', payload.note]] : [])];
  }
  return [['Type', payload.type], ['Name', payload.name], ['Start', payload.startDate || 'Not specified — ask for a dated proposal'], ['Schedule', draft?.status === 'applied' ? 'Daily (legacy default)' : 'Not reported — preserved as unknown in refreshed review'],
    ...(payload.dosage ? [['Directions', payload.dosage]] : []), ...(payload.note ? [['Note', payload.note]] : [])];
}

export interface AgentDraftCard {
  nativeOnly?: boolean;
  requiresRefresh: boolean;
  canCheckSavedChange?: boolean;
  canStopImport?: boolean;
  requiresFileSelection?: boolean;
  canPreviewFiles?: boolean;
  fileChoiceLabel?: string;
  selectionInProgress?: boolean;
  importProgress?: string;
  id: string | undefined;
  status: 'pending' | 'applying' | 'applied' | 'discarded' | 'failed' | 'conflict' | 'superseded';
  summary: string;
  rows: { label: string; value: string }[];
}
export function projectAgentDraftCards(message: { agentDrafts?: unknown } | null | undefined): AgentDraftCard[] {
  const drafts = (Array.isArray(message?.agentDrafts) ? message.agentDrafts : []) as DraftReader[];
  return drafts.map(draft => {
    const proposal = draft.kind === 'data' ? normalizeAgentDataProposal(draft.payload) : null;
    if (proposal && !chatDataChangeAllowed(proposal.resource, proposal.operation)) return { nativeOnly: true, requiresRefresh: false, id: undefined, status: 'failed' as const, summary: String(draft.summary || 'Previous proposal'), rows: [{ label: 'Native editor', value: CHAT_NATIVE_UI_NOTICE }] };
    return {
    requiresRefresh: draft.status === 'pending' && LEGACY_AGENT_DRAFT_KINDS.includes(draft.kind as AgentLegacyDraftKind),
    id: draft.id == null || draft.id === false ? undefined : String(draft.id),
    status: draft.status === 'pending' || draft.status === 'applying' || draft.status === 'applied' || draft.status === 'discarded' || draft.status === 'failed' || draft.status === 'conflict' || draft.status === 'superseded' ? draft.status : 'failed',
    summary: String(draft.summary || 'Agent proposal'),
    rows: draftRows(draft).filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([label, value]) => ({ label: String(label), value: String(value) })),
  }; });
}
