// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { createBrowserAgentToolDependencies, canDiscloseAgentDraftReview } from '../js/agent-tool-bindings.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
import { readCurrentGeneticsRecord, prepareReviewedGeneticsRecord, commitReviewedGeneticsRecord } from '../js/genetics-records.js';
import { projectGeneticsRecord } from '../js/genetics-proposals.js';
import { isAgentDataEnabled } from '../js/agent-data-bindings.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { projectAgentDraftCards } from '../js/agent-draft-presentation.js';
import { CONTEXT_SOURCE_IDS, setContextSourceEnabled } from '../js/context-source-registry.js';
import { upsertGeneticsWithCatalog } from '../js/genetics-mutations.js';
import type { SnpCatalog } from '../js/dna-evidence.js';
import type { ProfileData } from '../types/app-state.js';
import type { PendingMtDnaImport } from '../js/dna-mtdna.js';
import type { GeneticsImported } from '../js/genetics-import-events.js';

const catalog = JSON.parse(readFileSync('data/snp-health.json', 'utf8')) as SnpCatalog;
const maternal = JSON.parse(readFileSync('data/haplogroups.json', 'utf8'));
const original = { profile: state.currentProfile, data: state.importedData };
let profile: string, key: string;
const evidence = 'My rs1801133 genotype is CT. My rs429358 genotype is CT. My maternal haplogroup is J. Remove my maternal haplogroup. Remove my rs429358 call and its saved call history. Remove ALL my saved genome data.';
const stored = async () => JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData;
async function maternalPreview() {
  const runtime = await import('../js/dna-runtime.js');
  const pending: PendingMtDnaImport = { mutations: [{ position: 295, allele: 'T', raw: '295T' }],
    resolved: { haplogroup: 'J', confidence: 0.9, matchedMutations: 9, totalDiagnostic: 10 },
    coupling: null, hgData: undefined, source: 'Synthetic maternal report' };
  runtime.setPendingMtDnaImport(pending);
  return { runtime, pending, confirm: (await import('../js/dna-mtdna.js')).confirmMtDNAImport };
}
function tools() { return createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(profile) }); }
async function propose(resource: 'geneticVariants' | 'maternalHaplogroup' | 'genome' = 'geneticVariants', id = 'rs1801133', patch = '{"genotype":"CT"}', operation = 'update') {
  const runtime = tools(), read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource, recordId: id } });
  expect(read.success, read.contentItems[0].text).toBe(true); const current = JSON.parse(read.contentItems[0].text);
  const prepared = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource, operation, snapshotId: current.snapshotId, patch, evidence, reason: 'The user explicitly reported this correction.' } });
  expect(prepared.success, prepared.contentItems[0].text).toBe(true);
  return { runtime, prepared, draft: { ...runtime.getDrafts()[0]!, profileId: profile } };
}
// Whole-genome administration is native-only; individual reviewed genetic facts still use real chat tools.
async function proposeNativeGenome() {
  const baseline = await readCurrentGeneticsRecord(profile, 'genome', 'genome');
  if (!baseline) throw new Error('Missing native genome');
  const payload: AgentDataProposal = { resource: 'genome', operation: 'remove', recordId: 'genome', baseline: JSON.stringify(baseline), patch: '{}', evidence, reason: 'Native whole-genome review', effectiveDate: '2026-10-29', recordedAt: Date.now() };
  await prepareReviewedGeneticsRecord(profile, payload);
  return { nativeReview: projectGeneticsRecord(payload), draft: { kind: 'data' as const, status: 'pending' as const, id: crypto.randomUUID(), profileId: profile, payload } };
}
function applyNativeGenome(draft: { payload: AgentDataProposal }) { return commitReviewedGeneticsRecord(profile, draft.payload, () => state.currentProfile === profile && isAgentDataEnabled('genome')); }
beforeEach(async () => {
  profile = `genetics-tools-${crypto.randomUUID()}`; key = profileStorageKey(profile, 'imported');
  localStorage.setItem('labcharts-active-profile', profile); state.currentProfile = profile; state.importedData = createDefaultProfileData();
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_INVENTORY, true); setContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_SUMMARY, true);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = String(input);
    if (url.includes('snp-health.json')) return new Response(JSON.stringify(catalog));
    if (url.includes('haplogroups.json')) return new Response(JSON.stringify(maternal));
    throw new Error(`Unexpected request ${url}`);
  });
  upsertGeneticsWithCatalog(state.importedData, 'rs1801133', 'CC', { type: 'report', fileName: '/private/patient.pdf', rawText: 'private-dna-sentinel' }, catalog, 100);
  upsertGeneticsWithCatalog(state.importedData, 'rs429358', 'TT', {}, catalog, 100);
  upsertGeneticsWithCatalog(state.importedData, 'rs7412', 'CC', {}, catalog, 100);
  state.importedData.genetics!.mtdna = { haplogroup: 'H', confidence: 0.8, mutations: ['private-mutation-sentinel'], source: '/private/maternal.txt', importDate: '2026-10-20' };
  state.importedData.markerNotes = { retained: 'Keep this note' };
  expect(await saveImportedData()).toBe(true);
});
afterEach(async () => {
  (await import('../js/dna-runtime.js')).clearPendingMtDnaImport();
  vi.restoreAllMocks(); clearSyncSaveTimers();
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_INVENTORY, false); setContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_SUMMARY, true);
  await storage.encryptedRemoveItem(key); state.currentProfile = original.profile; state.importedData = original.data;
});
it('lists/searches catalog identities and reads an unrecorded call without changing or leaking source data', async () => {
  const before = await storage.encryptedGetItem(key), runtime = tools();
  const list = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'geneticVariants', query: 'MTHFR' } });
  expect(list.success).toBe(true); expect(JSON.parse(list.contentItems[0].text).records.map((row: { recordId: string }) => row.recordId)).toContain('rs1801133');
  const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'geneticVariants', recordId: 'rs8175347' } });
  expect(read.success).toBe(true); expect(JSON.parse(read.contentItems[0].text).current).toMatchObject({ genotype: null, catalogGenotypes: expect.arrayContaining(['6/7']) });
  expect(JSON.stringify([list, read])).not.toMatch(/private|patient|rawText|mutation-sentinel/); expect(await storage.encryptedGetItem(key)).toBe(before);
});
it('keeps stored source filenames and raw evidence out of broad genetics model context', async () => {
  const dna = await import('../js/dna.js'); await dna.ensureSNPTable();
  const data = structuredClone(state.importedData.genetics); if (!data) throw new Error('Synthetic genome is missing'); data.source = '/private/patient-genome.txt';
  const context = dna.buildFullGeneticsContext(data);
  expect(context).toContain('rs1801133'); expect(context).toContain('mtDNA Haplogroup: H');
  expect(context).not.toMatch(/\/private\/|patient-genome|private-dna-sentinel|private-mutation-sentinel/);
});
it('requires inventory consent even when priority and genome summary are enabled', async () => {
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_INVENTORY, false); setContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_PRIORITY, true);
  const result = await tools().execute({ tool: 'getbased_read_data', arguments: { resource: 'geneticVariants', recordId: 'rs1801133' } });
  expect(result.success).toBe(false); expect(result.contentItems[0].text).not.toContain('CC');
});
it('applies the reviewed call, preserves original evidence and unrelated data, and rejects a repeated stale Apply', async () => {
  const before = await stored(), { draft, prepared } = await propose();
  expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
  expect(prepared.contentItems[0].text).toContain('pending_user_approval'); expect(JSON.stringify(draft.payload)).not.toMatch(/private|patient|rawText|mutation-sentinel/);
  expect(JSON.stringify(projectAgentDraftCards({ agentDrafts: [draft] }))).toContain('previous call');
  await applyAgentDraft(draft); const saved = await stored();
  expect(saved.genetics.snps.rs1801133).toMatchObject({ genotype: 'CT', normalizedGenotype: 'GA', source: { type: 'chat-report', label: 'Reported in chat' }, priorCalls: [expect.objectContaining({ call: expect.objectContaining({ genotype: 'CC', source: expect.objectContaining({ rawText: 'private-dna-sentinel' }) }) })] });
  expect(saved.genetics.mtdna).toEqual(before.genetics.mtdna); expect(saved.markerNotes).toEqual(before.markerNotes);
  await expect(applyAgentDraft(draft)).rejects.toThrow('changed'); expect(await stored()).toEqual(saved);
});
it('reviews the dependent APOE summary before applying a component call', async () => {
  const { draft, prepared } = await propose('geneticVariants', 'rs429358');
  const payload = draft.payload as { baseline: string }, plan = JSON.parse(payload.baseline).plan;
  expect(plan.apoe).toEqual({ before: 'ε3/ε3', after: 'ε3/ε4' }); expect(prepared.contentItems[0].text).toContain('ε3/ε4');
  expect(JSON.stringify(projectAgentDraftCards({ agentDrafts: [draft] }))).toContain('Derived APOE');
  await applyAgentDraft(draft); expect((await stored()).genetics.apoe).toBe('ε3/ε4');
});
it('does not disclose a disabled APOE summary through the review', async () => {
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_SUMMARY, false);
  const { draft, prepared } = await propose('geneticVariants', 'rs429358');
  expect(JSON.parse((draft.payload as { baseline: string }).baseline).plan.apoe).toBeUndefined();
  expect(prepared.contentItems[0].text).not.toContain('ε3/ε4'); await applyAgentDraft(draft); expect((await stored()).genetics.apoe).toBe('ε3/ε4');
});
it('withholds a pending APOE review and rejects Apply after summary revocation', async () => {
  const before = await stored(), { draft } = await propose('geneticVariants', 'rs429358');
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_SUMMARY, false); expect(canDiscloseAgentDraftReview(draft)).toBe(false);
  await expect(applyAgentDraft(draft)).rejects.toThrow(/changed|authorized/); expect(await stored()).toEqual(before);
});
it('rejects unsupported genotypes, inferred fields and unsupported operations without writing', async () => {
  const before = await stored();
  for (const [operation, patch] of [['update', '{"genotype":"ZZ"}'], ['update', '{"genotype":"CT","effect":"none"}'], ['revert', '{}']]) {
    const runtime = tools(), read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'geneticVariants', recordId: 'rs1801133' } });
    const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'geneticVariants', operation, patch, snapshotId: JSON.parse(read.contentItems[0].text).snapshotId, evidence, reason: 'Reported change' } });
    expect(result.success).toBe(false);
  }
  expect(await stored()).toEqual(before);
});
it('creates an explicitly reported catalog repeat call through an exact empty read', async () => {
  const { draft } = await propose('geneticVariants', 'rs8175347', '{"genotype":"7|6"}');
  await applyAgentDraft(draft); expect((await stored()).genetics.snps.rs8175347).toMatchObject({ genotype: '7/6', normalizedGenotype: '6/7' });
});
it('preserves an imported maternal report when setting a reported lineage and retains SNPs', async () => {
  const before = await stored(), { draft } = await propose('maternalHaplogroup', 'maternal', '{"haplogroup":"j"}');
  expect(await stored()).toEqual(before); await applyAgentDraft(draft); const saved = await stored();
  expect(saved.genetics.mtdna).toMatchObject({ haplogroup: 'J', source: 'manual', mutations: [] }); expect(saved.genetics.mtdnaHistory).toEqual([before.genetics.mtdna]);
  expect(saved.genetics.snps).toEqual(before.genetics.snps);
});
it('reviews and removes maternal evidence while preserving SNPs and unrelated data', async () => {
  const before = await stored(), { draft } = await propose('maternalHaplogroup', 'maternal', '{}', 'remove');
  expect(JSON.stringify(projectAgentDraftCards({ agentDrafts: [draft] }))).toContain('Clears the saved maternal lineage');
  await applyAgentDraft(draft); const saved = await stored(); expect(saved.genetics.mtdna).toBeNull(); expect(saved.genetics.mtdnaHistory).toBeUndefined(); expect(saved.genetics.snps).toEqual(before.genetics.snps); expect(saved.markerNotes).toEqual(before.markerNotes);
});
it('rejects a private source edit that happens inside the locked save', async () => {
  const before = await stored(), { draft } = await propose(), read = storage.encryptedGetItem, write = storage.encryptedSetItem; let reads = 0;
  const peer = structuredClone(before); peer.genetics.snps.rs1801133.source.rawText = 'changed private report';
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) await write(key, JSON.stringify(peer)); return read(...args); });
  await expect(applyAgentDraft(draft)).rejects.toThrow('changed'); expect(await stored()).toEqual(peer); expect(state.importedData).toEqual(before);
});
it('rechecks inventory permission inside the locked save', async () => {
  const before = await stored(), { draft } = await propose(), read = storage.encryptedGetItem; let reads = 0;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) setContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_INVENTORY, false); return read(...args); });
  await expect(applyAgentDraft(draft)).rejects.toThrow('authorized'); expect(await stored()).toEqual(before);
});
it('keeps failure retryable without publishing live or durable mutation', async () => {
  const before = await stored(), { draft } = await propose(), write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic disk failure'); return write(...args); });
  await expect(applyAgentDraft(draft)).rejects.toThrow('Could not save'); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
  vi.mocked(storage.encryptedSetItem).mockRestore(); await applyAgentDraft(draft); expect((await stored()).genetics.snps.rs1801133.genotype).toBe('CT');
});
it('rejects tampered review effects', async () => {
  const before = await stored(), { draft } = await propose(), payload = draft.payload as { baseline: string }, snapshot = JSON.parse(payload.baseline);
  snapshot.plan.after.genotype = 'AA'; payload.baseline = JSON.stringify(snapshot);
  await expect(applyAgentDraft(draft)).rejects.toThrow('changed'); expect(await stored()).toEqual(before);
});
it('does not publish a read after inventory is revoked during hashing', async () => {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => { const result = await digest(...args); setContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_INVENTORY, false); return result; });
  const read = await tools().execute({ tool: 'getbased_read_data', arguments: { resource: 'geneticVariants', recordId: 'rs1801133' } });
  expect(read.success).toBe(false); expect(read.contentItems[0].text).not.toContain('CC');
});
it('resolves a supported reverse-strand APOE component through its catalog match', async () => {
  const { draft } = await propose('geneticVariants', 'rs429358', '{"genotype":"AG"}');
  const plan = JSON.parse((draft.payload as { baseline: string }).baseline).plan;
  expect(plan.apoe).toEqual({ before: 'ε3/ε3', after: 'ε3/ε4' }); await applyAgentDraft(draft);
  expect((await stored()).genetics.snps.rs429358).toMatchObject({ genotype: 'AG', normalizedGenotype: 'TC' });
  expect((await stored()).genetics.apoe).toBe('ε3/ε4');
});
it('does not republish a derived review after permission revocation in the draft callback', async () => {
  const runtime = createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(profile), onDraftCreated: () => setContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_SUMMARY, false) });
  const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'geneticVariants', recordId: 'rs429358' } });
  const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'geneticVariants', operation: 'update', patch: '{"genotype":"CT"}', snapshotId: JSON.parse(read.contentItems[0].text).snapshotId, evidence, reason: 'Reported correction' } });
  expect(result.success).toBe(true); expect(result.contentItems[0].text).not.toContain('ε3/ε4'); expect(JSON.parse(result.contentItems[0].text).review).toBeUndefined();
});
it.each(['set', 'remove', 'snp'])('native %s persistence failure leaves live and saved genetics untouched and can retry', async kind => {
  const { setManualHaplogroup, deleteMtDNAData } = await import('../js/dna-mtdna.js');
  const { saveManualSnpFromModal, ensureSNPTable } = await import('../js/dna.js'); await ensureSNPTable();
  document.body.innerHTML = '<input id="manual-snp-rsid" value="rs1801133"><input id="manual-snp-genotype" value="CT"><input id="manual-snp-source" value="Synthetic source">';
  const before = await stored(), write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic native write failure'); return write(...args); });
  const operation = () => kind === 'set' ? setManualHaplogroup('J') : kind === 'remove' ? deleteMtDNAData() : saveManualSnpFromModal();
  await operation(); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
  vi.mocked(storage.encryptedSetItem).mockRestore(); await operation();
  const saved = await stored();
  if (kind === 'snp') expect(saved.genetics.snps.rs1801133.genotype).toBe('CT'); else expect(saved.genetics.mtdna?.haplogroup ?? null).toBe(kind === 'set' ? 'J' : null);
  expect(saved.markerNotes).toEqual(before.markerNotes); document.body.innerHTML = '';
});
it('native maternal entry stays attached to its original profile while loading the catalog', async () => {
  const { loadHaplogroupCatalog } = await import('../js/dna-haplogroup-catalog.js');
  let release!: (value: Response) => void, started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  vi.mocked(fetch).mockImplementationOnce(() => { started(); return new Promise(resolve => { release = resolve; }); });
  const loading = loadHaplogroupCatalog({ forceFresh: true }); await ready;
  const { setManualHaplogroup } = await import('../js/dna-mtdna.js');
  const operation = setManualHaplogroup('J'), before = await stored(), previous = state.importedData;
  state.currentProfile = 'different-profile'; state.importedData = createDefaultProfileData();
  release(new Response(JSON.stringify(maternal))); await loading; await operation;
  expect(state.importedData.genetics).toBeFalsy(); expect(previous).toEqual(before); expect(await stored()).toEqual(before);
  state.currentProfile = profile; state.importedData = previous;
});
it('reviews exact SNP removal, dependent APOE clearing and unchanged sibling/maternal data', async () => {
  const before = await stored(), { draft, prepared } = await propose('geneticVariants', 'rs429358', '{}', 'remove');
  expect(await stored()).toEqual(before); const snapshot = JSON.parse((draft.payload as { baseline: string }).baseline);
  expect(snapshot.plan.apoe).toEqual({ before: 'ε3/ε3', after: null }); expect(snapshot.plan.clearsVariantEvidence).toBe(true);
  expect(JSON.stringify(projectAgentDraftCards({ agentDrafts: [draft] }))).toContain('Removed SNP evidence'); expect(prepared.contentItems[0].text).toContain('pending_user_approval');
  await applyAgentDraft(draft); const saved = await stored();
  expect(saved.genetics.snps.rs429358).toBeUndefined(); expect(saved.genetics.apoe).toBeUndefined(); expect(saved.genetics.coverage.found).toBe(2);
  expect(saved.geneticsSnpTombstones!.rs429358!.deletedAt).toBeGreaterThan(before.genetics.snps.rs429358.updatedAt);
  expect(saved.genetics.snps.rs7412).toEqual(before.genetics.snps.rs7412); expect(saved.genetics.snps.rs1801133).toEqual(before.genetics.snps.rs1801133); expect(saved.genetics.mtdna).toEqual(before.genetics.mtdna);
});
it('reads the removed identity and restores an explicitly reported genotype without recovering erased source history', async () => {
  const removal = await propose('geneticVariants', 'rs429358', '{}', 'remove'); await applyAgentDraft(removal.draft);
  const removed = await stored(), runtime = tools(), read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'geneticVariants', recordId: 'rs429358' } });
  expect(JSON.parse(read.contentItems[0].text).current).toMatchObject({ genotype: null, removed: true });
  const restoration = await propose('geneticVariants', 'rs429358');
  expect(JSON.parse((restoration.draft.payload as { baseline: string }).baseline).plan.restoresRemovedCall).toBe(true);
  expect(JSON.stringify(projectAgentDraftCards({ agentDrafts: [restoration.draft] }))).toContain('Explicit SNP restoration');
  await applyAgentDraft(restoration.draft); const saved = await stored(); expect(saved.genetics.snps.rs429358).toMatchObject({ genotype: 'CT', source: { type: 'chat-report' } });
  expect(saved.genetics.snps.rs429358.priorCalls).toBeUndefined(); expect(saved.genetics.apoe).toBe('ε3/ε4'); expect(saved.geneticsSnpTombstones!.rs429358!.restoredAt).toBeGreaterThan(removed.geneticsSnpTombstones!.rs429358!.deletedAt);
});
it('does not publish failed SNP removal or its history and permits retry', async () => {
  const before = await stored(), { draft } = await propose('geneticVariants', 'rs429358', '{}', 'remove'), write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic removal failure'); return write(...args); });
  await expect(applyAgentDraft(draft)).rejects.toThrow('Could not save'); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
  vi.mocked(storage.encryptedSetItem).mockRestore(); await applyAgentDraft(draft); expect((await stored()).genetics.snps.rs429358).toBeUndefined();
});
it('refuses a late peer removal/restore history edit inside the locked save', async () => {
  const before = await stored(), { draft } = await propose('geneticVariants', 'rs429358', '{}', 'remove'), read = storage.encryptedGetItem, write = storage.encryptedSetItem; let reads = 0;
  const peer = structuredClone(before); peer.geneticsSnpTombstones = { rs1801133: { deletedAt: 200, restoredAt: 0, updatedAt: 200 } };
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) await write(key, JSON.stringify(peer)); return read(...args); });
  await expect(applyAgentDraft(draft)).rejects.toThrow('changed'); expect(await stored()).toEqual(peer); expect(state.importedData).toEqual(before);
});
it('native SNP report confirmation retains its pending review on storage failure and can retry', async () => {
  const dna = await import('../js/dna.js'), runtime = await import('../js/dna-runtime.js'); await dna.ensureSNPTable();
  const pending = { ...dna.parseClinicalSnpReportText('rs1801133 CT', { source: 'Synthetic report', type: 'report-text' }), mergeSnps: true };
  runtime.setPendingDnaImport(pending); const before = await stored(), write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic report write failure'); return write(...args); });
  await dna.confirmDNAImport(); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before); expect(runtime.getPendingDnaImport()).toBe(pending);
  vi.mocked(storage.encryptedSetItem).mockRestore(); await dna.confirmDNAImport(); expect((await stored()).genetics.snps.rs1801133.genotype).toBe('CT'); expect(runtime.getPendingDnaImport()).toBeNull();
});
it('refuses a SNP report preview after another genetics change and does not revive a removed call', async () => {
  const dna = await import('../js/dna.js'), runtime = await import('../js/dna-runtime.js'); await dna.ensureSNPTable();
  const pending = { ...dna.parseClinicalSnpReportText('rs429358 CT', { source: 'Synthetic report', type: 'report-text' }), mergeSnps: true };
  runtime.setPendingDnaImport(pending);
  const removal = await propose('geneticVariants', 'rs429358', '{}', 'remove'); await applyAgentDraft(removal.draft); const removed = await stored();
  expect(runtime.isPendingDnaImportCurrent(pending)).toBe(false); await dna.confirmDNAImport(); expect(await stored()).toEqual(removed); expect(runtime.getPendingDnaImport()).toBeNull();
});
it('native maternal import retains previous evidence and publishes an actual before/after snapshot', async () => {
  state.importedData.genetics!.mtdnaHistory = [{ haplogroup: 'U5a', source: 'Older report' }];
  expect(await saveImportedData()).toBe(true);
  const before = await stored(), { confirm, runtime } = await maternalPreview();
  const events: GeneticsImported[] = [], listener = (event: Event) => events.push((event as CustomEvent<GeneticsImported>).detail);
  globalThis.addEventListener('labcharts-genetics-imported', listener);
  try {
    await confirm();
    const saved = await stored();
    expect(saved.genetics.mtdna).toMatchObject({ haplogroup: 'J', mutations: ['295T'], source: 'Synthetic maternal report' });
    expect(saved.genetics.mtdnaHistory).toEqual([...before.genetics.mtdnaHistory!, before.genetics.mtdna]);
    expect(saved.genetics.snps).toEqual(before.genetics.snps); expect(saved.markerNotes).toEqual(before.markerNotes);
    expect(events).toHaveLength(1); expect(events[0]!.previousData).toEqual(before); expect(events[0]!.ownerData).toBe(state.importedData); expect(events[0]!.data.genetics).toEqual(saved.genetics);
    expect(runtime.getPendingMtDnaImport()).toBeNull();
  } finally { globalThis.removeEventListener('labcharts-genetics-imported', listener); }
});
it.each(['genetics', 'removals'])('native maternal import rejects a late peer %s change in the locked read', async kind => {
  const before = await stored(), { confirm, runtime } = await maternalPreview();
  const peer = structuredClone(before), read = storage.encryptedGetItem, write = storage.encryptedSetItem;
  if (kind === 'genetics') peer.genetics.mtdna!.source = 'Changed peer report';
  else peer.geneticsSnpTombstones = { rs1801133: { deletedAt: 200, restoredAt: 0, updatedAt: 200 } };
  let intercepted = false;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => {
    if (args[0] === key && !intercepted) { intercepted = true; await write(key, JSON.stringify(peer)); }
    return read(...args);
  });
  await confirm(); expect(intercepted).toBe(true); expect(await stored()).toEqual(peer); expect(state.importedData).toEqual(before);
  expect(runtime.getPendingMtDnaImport()).toBeNull();
});
it('native maternal import cancels when its review closes during the locked read', async () => {
  const before = await stored(), { confirm, runtime } = await maternalPreview(), read = storage.encryptedGetItem;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementationOnce(async (...args) => { const value = await read(...args); runtime.clearPendingMtDnaImport(); return value; });
  await confirm(); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
});
it('native maternal import cancels when the profile changes during the locked read', async () => {
  const before = await stored(), { confirm } = await maternalPreview(), read = storage.encryptedGetItem, previous = state.importedData;
  const notices = vi.spyOn(await import('../js/utils.js'), 'showNotification');
  const other = createDefaultProfileData();
  vi.spyOn(storage, 'encryptedGetItem').mockImplementationOnce(async (...args) => {
    const value = await read(...args); state.currentProfile = 'different-profile'; state.importedData = other; return value;
  });
  await confirm(); expect(await stored()).toEqual(before); expect(previous).toEqual(before); expect(state.importedData).toBe(other);
  expect(notices).not.toHaveBeenCalled();
});
it('a retired maternal preview cannot close another profile overlay or publish feedback there', async () => {
  const before = await stored(), { confirm, runtime } = await maternalPreview();
  const notices = vi.spyOn(await import('../js/utils.js'), 'showNotification');
  state.currentProfile = 'different-profile'; state.importedData = createDefaultProfileData();
  document.body.innerHTML = '<div id="dna-modal-overlay" class="modal-overlay show" data-owner="new-profile"></div>';
  try {
    await confirm(); expect(await stored()).toEqual(before); expect(runtime.getPendingMtDnaImport()).toBeNull();
    expect(document.getElementById('dna-modal-overlay')?.classList.contains('show')).toBe(true); expect(notices).not.toHaveBeenCalled();
  } finally { document.body.innerHTML = ''; }
});
it('native maternal storage failure keeps the reviewed import retryable without publishing evidence', async () => {
  const before = await stored(), { confirm, runtime, pending } = await maternalPreview(), write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic maternal write failure'); return write(...args); });
  await confirm(); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before); expect(runtime.getPendingMtDnaImport()).toBe(pending);
  vi.mocked(storage.encryptedSetItem).mockRestore(); await confirm();
  const saved = await stored(); expect(saved.genetics.mtdna?.haplogroup).toBe('J'); expect(saved.genetics.mtdnaHistory).toEqual([before.genetics.mtdna]); expect(runtime.getPendingMtDnaImport()).toBeNull();
});
it('native maternal confirmation cannot apply an old review after another file replaces it', async () => {
  const before = await stored(), { confirm, runtime } = await maternalPreview(), read = storage.encryptedGetItem;
  let replacement!: PendingMtDnaImport;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementationOnce(async (...args) => {
    const value = await read(...args); replacement = (await maternalPreview()).pending; return value;
  });
  await confirm(); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before); expect(runtime.getPendingMtDnaImport()).toBe(replacement);
});
it('native maternal confirmation serializes repeated clicks without duplicating retained evidence', async () => {
  const before = await stored(), { confirm } = await maternalPreview();
  await Promise.all([confirm(), confirm()]);
  const saved = await stored(); expect(saved.genetics.mtdna?.haplogroup).toBe('J'); expect(saved.genetics.mtdnaHistory).toEqual([before.genetics.mtdna]);
});
it('native maternal parsing refuses a preview when a chat correction changes its source while reading the file', async () => {
  const runtime = await import('../js/dna-runtime.js'), dna = await import('../js/dna-mtdna.js');
  vi.spyOn(runtime, 'loadGeneticsStylesheetForAction').mockResolvedValue(document.createElement('link'));
  let release!: (value: string) => void, started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const importing = dna.handleMtDNAFile({ name: 'synthetic-mtdna.txt', text: () => { started(); return new Promise(resolve => { release = resolve; }); } });
  await ready; const { draft } = await propose('maternalHaplogroup', 'maternal', '{"haplogroup":"J"}'); await applyAgentDraft(draft);
  const corrected = await stored(); release('295T\n489C\n4216C\n10398G\n11251G\n12612G\n13708A\n16069T\n16126C');
  expect(await importing).toBe(false); expect(runtime.getPendingMtDnaImport()).toBeNull(); expect(await stored()).toEqual(corrected);
});
it('reviews and removes the whole genome without exposing private sources or modifying other data', async () => {
  const before = await stored(), { draft, nativeReview } = await proposeNativeGenome();
  expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
  expect(JSON.stringify(draft.payload)).not.toMatch(/private-dna-sentinel|private-mutation-sentinel|patient.pdf/);
  const review = nativeReview;
  expect(review.after).toMatchObject({ hasData: false, storedCallCount: 0 }); expect(review.before).toMatchObject({ hasData: true, storedCallCount: 3, maternalRecorded: true });
  expect(review.plan).toMatchObject({ clearsWholeGenome: true, coverage: { before: 3, after: 0 }, apoe: { before: 'ε3/ε3', after: null } });
  expect(projectAgentDraftCards({ agentDrafts: [draft] })[0]).toMatchObject({ nativeOnly: true });
  await applyNativeGenome(draft); const saved = await stored(); expect(saved.genetics).toBeNull(); expect(saved.geneticsLifecycle?.genome?.deletedAt).toBeGreaterThan(0);
  const withoutGenome = (data: ProfileData) => Object.fromEntries(Object.entries(data).filter(([key]) => !['genetics', 'geneticsLifecycle'].includes(key)));
  expect(withoutGenome(saved)).toEqual(withoutGenome(before));
  await expect(applyNativeGenome(draft)).rejects.toThrow('changed'); expect(await stored()).toEqual(saved);
});
it.each([CONTEXT_SOURCE_IDS.GENOME_INVENTORY, CONTEXT_SOURCE_IDS.GENOME_SUMMARY])('requires both disclosure sources for whole-genome review: %s', async source => {
  const before = await stored(); setContextSourceEnabled(source, false);
  const result = await tools().execute({ tool: 'getbased_read_data', arguments: { resource: 'genome', recordId: 'genome' } });
  expect(result.success).toBe(false); expect(await stored()).toEqual(before);
});
it('retains whole-genome removal on storage failure without publishing and permits retry', async () => {
  const before = await stored(), { draft } = await proposeNativeGenome(), write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic genome write failure'); return write(...args); });
  await expect(applyNativeGenome(draft)).rejects.toThrow('Could not save'); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
  vi.mocked(storage.encryptedSetItem).mockRestore(); await applyNativeGenome(draft); expect((await stored()).genetics).toBeNull();
});
it('rejects a whole-genome removal if its independent lifecycle changed in the locked read', async () => {
  const before = await stored(), { draft } = await proposeNativeGenome(), read = storage.encryptedGetItem, write = storage.encryptedSetItem;
  const peer = structuredClone(before); peer.geneticsLifecycle = { maternal: { deletedAt: 0, restoredAt: 100, updatedAt: 100 } }; let reads = 0;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) await write(key, JSON.stringify(peer)); return read(...args); });
  await expect(applyNativeGenome(draft)).rejects.toThrow('changed'); expect(await stored()).toEqual(peer); expect(state.importedData).toEqual(before);
});
it('restores only a newly reported SNP after whole-genome removal and does not recover erased reports', async () => {
  const removal = await proposeNativeGenome(); await applyNativeGenome(removal.draft);
  const { draft, prepared } = await propose('geneticVariants', 'rs429358');
  expect(JSON.parse(prepared.contentItems[0].text).review.effects.restoresRemovedGenome).toBe(true);
  expect(JSON.stringify(projectAgentDraftCards({ agentDrafts: [draft] }))).toContain('New genome after removal');
  await applyAgentDraft(draft); const saved = await stored(); expect(Object.keys(saved.genetics.snps)).toEqual(['rs429358']);
  expect(saved.genetics.snps.rs429358.priorCalls).toBeUndefined(); expect(saved.genetics.mtdna).toBeUndefined(); expect(saved.genetics.mtdnaHistory).toBeUndefined();
  expect(saved.genetics.snps.rs429358.genomeGeneration).toBe(saved.geneticsLifecycle!.genome!.restoredAt);
});
it('removes legacy opaque genome fields with an explicit bounded legacy-data review', async () => {
  state.importedData.genetics = { snps: { rsTest: 'opaque-private-call' }, mtdnaHistory: [{ source: 'private-legacy-evidence' }], legacy: 'private-opaque-field' };
  expect(await saveImportedData()).toBe(true); const { draft, nativeReview } = await proposeNativeGenome();
  expect(nativeReview.before).toMatchObject({ legacyData: true, storedCallCount: 1, previousCallCount: null });
  expect(JSON.stringify(nativeReview)).not.toMatch(/opaque-private-call|private-legacy-evidence|private-opaque-field/);
  await applyNativeGenome(draft); expect((await stored()).genetics).toBeNull();
});
it('native whole-genome deletion failure preserves live object identity and can retry', async () => {
  const runtime = await import('../js/dna-runtime.js'), { confirmDeleteDNA } = await import('../js/dna.js');
  const previous = runtime.configureDnaRuntimeDeps({ showConfirmDialog: async () => true });
  const before = await stored(), observed = state.importedData, write = storage.encryptedSetItem;
  try {
    vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic native genome deletion failure'); return write(...args); });
    await confirmDeleteDNA(); expect(await stored()).toEqual(before); expect(state.importedData).toBe(observed); expect(observed).toEqual(before);
    vi.mocked(storage.encryptedSetItem).mockRestore(); await confirmDeleteDNA(); expect((await stored()).genetics).toBeNull(); expect(state.importedData).toBe(observed);
  } finally { runtime.configureDnaRuntimeDeps(previous); }
});
it('native whole-genome deletion stays attached to the profile that opened its confirmation', async () => {
  const runtime = await import('../js/dna-runtime.js'), { confirmDeleteDNA } = await import('../js/dna.js');
  const before = await stored(), observed = state.importedData, other = createDefaultProfileData();
  const previous = runtime.configureDnaRuntimeDeps({ showConfirmDialog: async () => { state.currentProfile = 'different-profile'; state.importedData = other; return true; } });
  try { await confirmDeleteDNA(); expect(await stored()).toEqual(before); expect(observed).toEqual(before); expect(state.importedData).toBe(other); }
  finally { runtime.configureDnaRuntimeDeps(previous); }
});
