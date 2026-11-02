// Lazy exact genetics reads and approval commits through the ordinary domain owner.
import type { ProfileData } from '../types/app-state.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import type { GeneticsData, DnaProfileData } from './dna-runtime.js';
import type { SnpCatalog } from './dna-evidence.js';
import type { HaplogroupTable } from './dna-haplogroup-catalog.js';
import type { GeneticsResource, GeneticsRecord, GeneticsSnapshot, GeneticsPlan, GenomeRecord } from './genetics-proposals.js';
import { parseGeneticsSnapshot, geneticsPatch, geneticsScope, projectGeneticsRecord, isGeneticsResource } from './genetics-proposals.js';
import { loadSnpCatalog } from './dna-evidence.js';
import { loadHaplogroupCatalog } from './dna-haplogroup-catalog.js';
import { upsertGeneticsWithCatalog, removeGeneticsSnpWithCatalog, setReportedHaplogroup, clearReportedHaplogroup } from './genetics-mutations.js';
import { mergeGeneticsSnpStates, geneticsSnpRemoved, reconcileGeneticsSnpState } from './genetics-snp-lifecycle.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { commitGeneticsWrite } from './genetics-record-store.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { CONTEXT_SOURCE_IDS, isContextSourceEnabled } from './context-source-registry.js';
import { state } from './state.js';
import { geneticsScopeRemoved, removeGeneticsScope } from './genetics-lifecycle.js';

const conflict = (): never => { throw Object.assign(new Error('This genetics record, source or catalog changed since review. Read it again. No change was applied.'), { noChangeApplied: true }); };
type Catalogs = { snps: SnpCatalog | null; maternal: HaplogroupTable | null };
async function catalogs(resource: GeneticsResource): Promise<Catalogs> {
  if (resource === 'genome') return { snps: null, maternal: null };
  return resource === 'geneticVariants' ? { snps: await loadSnpCatalog({ forceFresh: true }), maternal: null } : { snps: null, maternal: await loadHaplogroupCatalog({ forceFresh: true }) };
}
function genetics(data: ProfileData): GeneticsData | null {
  const value: unknown = data.genetics;
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Review this profile’s genetics in the normal editor.');
  const row = structuredClone(value) as GeneticsData;
  if (row.snps != null && (typeof row.snps !== 'object' || Array.isArray(row.snps) || Object.entries(row.snps).some(([id, call]) => !/^rs\d{1,15}$/.test(id) || !call || typeof call !== 'object' || Array.isArray(call)))) throw new Error('Review the saved SNP identities in the normal editor.');
  if (Object.values(row.snps || {}).some(call => call.priorCalls != null && !Array.isArray(call.priorCalls))) throw new Error('Review the saved SNP source history in the normal editor.');
  if (row.mtdna != null && (typeof row.mtdna !== 'object' || Array.isArray(row.mtdna)) || row.mtdnaHistory != null && !Array.isArray(row.mtdnaHistory)) throw new Error('Review the saved maternal reports in the normal editor.');
  const reviewed: DnaProfileData = { genetics: row, ...(data.geneticsSnpTombstones ? { geneticsSnpTombstones: data.geneticsSnpTombstones } : {}), ...(data.geneticsLifecycle ? { geneticsLifecycle: data.geneticsLifecycle } : {}) };
  reconcileGeneticsSnpState(reviewed);
  return reviewed.genetics || null;
}
function genomeRecord(data: ProfileData): GenomeRecord {
  const view = { genetics: structuredClone(data.genetics) as unknown, geneticsLifecycle: data.geneticsLifecycle, geneticsSnpTombstones: data.geneticsSnpTombstones };
  reconcileGeneticsSnpState(view);
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  const hasData = view.genetics != null, raw = object(view.genetics) ? view.genetics : null;
  const calls = raw?.snps == null ? {} : object(raw.snps) ? raw.snps : null;
  let previousCallCount: number | null = calls ? 0 : null, legacyData = hasData && raw === null || calls === null;
  for (const call of Object.values(calls || {})) {
    if (!object(call)) { legacyData = true; previousCallCount = null; continue; }
    if (call.priorCalls != null && !Array.isArray(call.priorCalls)) { legacyData = true; previousCallCount = null; }
    else if (previousCallCount !== null && Array.isArray(call.priorCalls)) previousCallCount += call.priorCalls.length;
  }
  const maternalHistory = raw?.mtdnaHistory;
  if (maternalHistory != null && !Array.isArray(maternalHistory) || raw?.mtdna != null && !object(raw.mtdna)) legacyData = true;
  if (raw && Object.keys(raw).some(key => !['snps', 'apoe', 'source', 'importDate', 'coverage', 'effects', 'catalogVersion', 'mtdna', 'mtdnaHistory', 'updatedAt', 'genomeGeneration'].includes(key))) legacyData = true;
  return { id: 'genome', hasData, removed: geneticsScopeRemoved(data.geneticsLifecycle, 'genome'),
    storedCallCount: hasData && !raw || calls === null ? null : Object.keys(calls || {}).length, previousCallCount: hasData && !raw ? null : previousCallCount,
    maternalRecorded: hasData && !raw ? null : raw?.mtdna != null,
    previousMaternalReportCount: hasData && !raw ? null : maternalHistory == null ? 0 : Array.isArray(maternalHistory) ? maternalHistory.length : null, legacyData };
}
function publicRecord(data: ProfileData, resource: GeneticsResource, id: string, reference: Catalogs): GeneticsRecord {
  if (resource === 'genome') { if (id !== 'genome') throw new Error('Read recordId genome before proposing whole-genome removal.'); return genomeRecord(data); }
  const saved = genetics(data);
  if (resource === 'maternalHaplogroup') {
    if (id !== 'maternal') throw new Error('Read recordId maternal for the maternal haplogroup.');
    return { id: 'maternal', haplogroup: typeof saved?.mtdna?.haplogroup === 'string' ? saved.mtdna.haplogroup : null,
      confidence: typeof saved?.mtdna?.confidence === 'number' && Number.isFinite(saved.mtdna.confidence) ? saved.mtdna.confidence : null,
      storedMutationCount: Array.isArray(saved?.mtdna?.mutations) ? saved.mtdna.mutations.length : 0, previousReportCount: saved?.mtdnaHistory?.length || 0,
      removed: geneticsScopeRemoved(data.geneticsLifecycle, 'genome') || geneticsScopeRemoved(data.geneticsLifecycle, 'maternal') };
  }
  if (!/^rs\d{1,15}$/.test(id)) throw new Error('Read an exact rsID, such as rs1801133.');
  const entry = reference.snps?.[id], call = saved?.snps?.[id], states = mergeGeneticsSnpStates(data.geneticsSnpTombstones, null);
  if (!entry && !call && !states[id]) throw new Error('This rsID is not in the supported catalog or saved calls.');
  const text = (value: unknown) => typeof value === 'string' ? value.slice(0, 400) : '';
  return { id, rsid: id, gene: text(entry?.gene || call?.gene), variant: text(entry?.variant || call?.variant), genotype: text(call?.genotype) || null,
    normalizedGenotype: text(call?.normalizedGenotype) || null, removed: geneticsSnpRemoved(states, id) || geneticsScopeRemoved(data.geneticsLifecycle, 'genome'), previousCallCount: Array.isArray(call?.priorCalls) ? call.priorCalls.length : 0, catalogGenotypes: Object.keys(entry?.genotypes || {}),
    evidenceLevel: text(entry?.evidence?.level) || null, relevanceLevel: text(entry?.relevance?.level) || null };
}
async function snapshot(data: ProfileData, resource: GeneticsResource, id: string, reference: Catalogs): Promise<GeneticsSnapshot> {
  const record = publicRecord(data, resource, id, reference), summaryEnabled = isContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_SUMMARY);
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])])) : value;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical({ genetics: data.genetics ?? null, geneticsSnpTombstones: data.geneticsSnpTombstones ?? null, geneticsLifecycle: data.geneticsLifecycle ?? null, reference, summaryEnabled }))));
  return { version: 1, resource, id, record, summaryEnabled, revision: [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
}
export async function readCurrentGeneticsRecord(profileId: string, resource: GeneticsResource, id: string) {
  const reference = await catalogs(resource), data = await readAgentProfileRecords(profileId);
  return snapshot(data, resource, id, reference);
}
export async function listCurrentGeneticsRecords(profileId: string, resource: GeneticsResource) {
  const reference = await catalogs(resource), data = await readAgentProfileRecords(profileId);
  const ids = resource === 'genome' ? ['genome'] : resource === 'maternalHaplogroup' ? ['maternal'] : [...new Set([...Object.keys(reference.snps || {}).filter(key => /^rs\d{1,15}$/.test(key)), ...Object.keys(genetics(data)?.snps || {}), ...Object.keys(mergeGeneticsSnpStates(data.geneticsSnpTombstones, null))])].sort();
  return ids.map(id => publicRecord(data, resource, id, reference));
}
function computed(data: ProfileData, proposal: AgentDataProposal, reference: Catalogs, expected: GeneticsSnapshot) {
  const patch = geneticsPatch(proposal), next = structuredClone(data), saved = proposal.resource === 'genome' ? null : genetics(data);
  reconcileGeneticsSnpState(next);
  if (proposal.resource === 'genome') {
    if (!('hasData' in expected.record) || !expected.record.hasData) throw new Error('There is no saved genome data to remove.');
    removeGeneticsScope(next, 'genome', proposal.recordedAt);
  } else if (proposal.resource === 'geneticVariants' && proposal.operation === 'remove') removeGeneticsSnpWithCatalog(next, proposal.recordId, reference.snps, proposal.recordedAt);
  else if (proposal.resource === 'geneticVariants') {
    const result = upsertGeneticsWithCatalog(next, proposal.recordId, patch.genotype,
      { type: 'chat-report', label: typeof patch.sourceLabel === 'string' ? patch.sourceLabel.trim() : 'Reported in chat', rawText: proposal.evidence, addedAt: new Date(proposal.recordedAt).toISOString() }, reference.snps, proposal.recordedAt, { restoreRemoved: true });
    if (!result.ok) throw new Error(result.error);
  } else if (proposal.operation === 'remove') clearReportedHaplogroup(next, proposal.recordedAt);
  else setReportedHaplogroup(next, patch.haplogroup, reference.maternal!, proposal.recordedAt);
  const after = publicRecord(next, expected.resource, expected.id, reference);
  const plan: GeneticsPlan = { after, replacesRecordedCall: proposal.resource === 'geneticVariants' && proposal.operation === 'update' && !!saved?.snps?.[proposal.recordId],
    restoresRemovedGenome: proposal.operation === 'update' && geneticsScopeRemoved(data.geneticsLifecycle, 'genome'),
    restoresMaternalData: proposal.resource === 'maternalHaplogroup' && proposal.operation === 'update' && geneticsScopeRemoved(data.geneticsLifecycle, 'maternal'),
    clearsWholeGenome: proposal.resource === 'genome',
    clearsVariantEvidence: proposal.resource === 'geneticVariants' && proposal.operation === 'remove',
    restoresRemovedCall: proposal.resource === 'geneticVariants' && proposal.operation === 'update' && geneticsSnpRemoved(mergeGeneticsSnpStates(data.geneticsSnpTombstones, null), proposal.recordId),
    clearsMaternalEvidence: proposal.resource === 'maternalHaplogroup' && proposal.operation === 'remove' && !!(saved?.mtdna || saved?.mtdnaHistory?.length) };
  if (proposal.resource === 'geneticVariants') {
    plan.coverage = { before: Object.keys(saved?.snps || {}).length, after: Object.keys(next.genetics?.snps || {}).length };
    if (expected.summaryEnabled && (saved?.apoe ?? null) !== (next.genetics?.apoe ?? null)) plan.apoe = { before: saved?.apoe || null, after: next.genetics?.apoe || null };
  }
  if (proposal.resource === 'genome' && 'hasData' in expected.record) {
    if (expected.record.storedCallCount !== null) plan.coverage = { before: expected.record.storedCallCount, after: 0 };
    const apoe: unknown = data.genetics?.apoe;
    if (expected.summaryEnabled && typeof apoe === 'string' && apoe) plan.apoe = { before: apoe, after: null };
  }
  return { next, plan };
}
export async function prepareReviewedGeneticsRecord(profileId: string, proposal: AgentDataProposal) {
  if (!isGeneticsResource(proposal.resource)) throw new Error('Choose a genetics resource.');
  const expected = parseGeneticsSnapshot(JSON.parse(proposal.baseline)), reference = await catalogs(proposal.resource), data = await readAgentProfileRecords(profileId);
  if (!profileDataValuesEqual(expected, await snapshot(data, proposal.resource, proposal.recordId, reference))) conflict();
  const { plan } = computed(data, proposal, reference, expected), before = expected.record, after = plan.after;
  if ('rsid' in before && 'rsid' in after ? before.genotype === after.genotype : 'haplogroup' in before && 'haplogroup' in after && before.haplogroup === after.haplogroup && !(proposal.operation === 'remove' && plan.clearsMaternalEvidence)) throw new Error('This reported value is already recorded.');
  proposal.baseline = JSON.stringify({ ...expected, plan }); projectGeneticsRecord(proposal);
  if (state.currentProfile !== profileId || !geneticsScope(proposal.resource) || expected.summaryEnabled !== isContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_SUMMARY)) throw new Error('This genetics disclosure scope changed. Read it again.');
}
export async function commitReviewedGeneticsRecord(profileId: string, proposal: AgentDataProposal, authorized: () => boolean) {
  if (!isGeneticsResource(proposal.resource)) throw new Error('Choose a genetics resource.');
  projectGeneticsRecord(proposal);
  const expected = parseGeneticsSnapshot(JSON.parse(proposal.baseline)), { plan: reviewed, ...before } = expected;
  const reference = await catalogs(proposal.resource), data = await readAgentProfileRecords(profileId);
  if (!profileDataValuesEqual(before, await snapshot(data, proposal.resource, proposal.recordId, reference))) conflict();
  const { next, plan } = computed(data, proposal, reference, expected);
  if (!profileDataValuesEqual(reviewed, plan)) conflict();
  let changed = false, revoked = false;
  const scope = () => { if (!authorized() || !geneticsScope(expected.resource) || expected.summaryEnabled !== isContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_SUMMARY)) revoked = true; return !revoked; };
  if (!await commitGeneticsWrite(profileId, data, data, next, scope, () => { changed = true; })) {
    if (revoked) throw Object.assign(new Error('This genetics source is no longer authorized. No change was applied.'), { noChangeApplied: true });
    if (changed) conflict(); throw new Error('Could not save this genetics change.');
  }
  try { (await import('./dna-runtime.js')).refreshDnaSidebar(); } catch { /* Durable success is independent of sidebar rendering. */ }
  return 'Reviewed genetics change saved.';
}
