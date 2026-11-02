// Public genetics reviews contain reported calls and catalog labels, never source files/raw DNA.
import { agentDataObject, parseAgentDataPatch, validateFieldNames } from '../shared/agent-data-contract.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { HAPLOGROUP_LIST } from './constants.js';
import { CONTEXT_SOURCE_IDS, isContextSourceEnabled } from './context-source-registry.js';

export type GeneticsResource = 'geneticVariants' | 'maternalHaplogroup' | 'genome';
export interface GeneticVariantRecord {
  id: string; rsid: string; gene: string; variant: string; genotype: string | null; normalizedGenotype: string | null;
  removed: boolean; previousCallCount: number; catalogGenotypes: string[]; evidenceLevel: string | null; relevanceLevel: string | null;
}
export interface MaternalHaplogroupRecord { id: 'maternal'; haplogroup: string | null; confidence: number | null; storedMutationCount: number; previousReportCount: number; removed: boolean; }
export interface GenomeRecord { id: 'genome'; hasData: boolean; removed: boolean; storedCallCount: number | null; previousCallCount: number | null; maternalRecorded: boolean | null; previousMaternalReportCount: number | null; legacyData: boolean; }
export type GeneticsRecord = GeneticVariantRecord | MaternalHaplogroupRecord | GenomeRecord;
export interface GeneticsPlan {
  after: GeneticsRecord; replacesRecordedCall: boolean; clearsMaternalEvidence: boolean; clearsVariantEvidence?: boolean; restoresRemovedCall?: boolean;
  restoresRemovedGenome?: boolean; restoresMaternalData?: boolean;
  clearsWholeGenome?: boolean;
  apoe?: { before: string | null; after: string | null };
  coverage?: { before: number; after: number };
}
export interface GeneticsSnapshot { version: 1; resource: GeneticsResource; id: string; record: GeneticsRecord; revision: string; summaryEnabled: boolean; plan?: GeneticsPlan; }
export const isGeneticsResource = (value: unknown): value is GeneticsResource => value === 'geneticVariants' || value === 'maternalHaplogroup' || value === 'genome';
export function geneticsScope(resource: GeneticsResource) {
  if (resource === 'genome') return isContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_INVENTORY) && isContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_SUMMARY);
  return isContextSourceEnabled(resource === 'geneticVariants' ? CONTEXT_SOURCE_IDS.GENOME_INVENTORY : CONTEXT_SOURCE_IDS.GENOME_SUMMARY);
}
export function geneticsCapabilities(resource: GeneticsResource) {
  if (resource === 'genome') return { operations: ['remove'], fields: {}, rules: { identity: 'Read recordId genome only for an explicit request to remove ALL saved genome data. Remove with an empty patch clears every saved SNP, maternal record, derived summary, genome metadata and local source/call/report history. Never use this for one SNP or just maternal data. Original files, conversations and identity-only removal generations remain. This requires both genome-summary and full-inventory disclosure. Restoration requires new reported facts or a new chosen-file restoration review; erased evidence is not recovered.' } };
  return resource === 'geneticVariants' ? { operations: ['update', 'remove'], fields: { genotype: 'Explicit reported allele call or supported repeat, e.g. CT or 6/7', sourceLabel: 'Optional user-reported source label, max 120 characters' },
    rules: { identity: 'List/search the public catalog and stored calls, then read the exact rsID, including an unrecorded one. Update records that explicitly reported call. Do not infer genotype from symptoms, ethnicity, gene names, APOE labels or family history. Preserve allele notation; the catalog resolves supported strand/repeat equivalents. Corrections retain prior source evidence locally. Remove with an empty patch clears only this SNP call and its prior-call/source history, retaining an identity-only removal record against stale sync revival. APOE and coverage are reviewed. Other SNPs, maternal data, conversations and original files remain. To restore a removed call, read it and update with an explicitly reported genotype; imports do not restore it implicitly. Chosen-file imports still use their dedicated workflow.' } }
    : { operations: ['update', 'remove'], fields: { haplogroup: HAPLOGROUP_LIST }, rules: { identity: 'Read recordId maternal. Update only an explicitly reported maternal haplogroup. Never infer lineage from ancestry or appearance. Remove clears the saved maternal record and its local mutation/report history; SNP calls remain. Original files are not deleted. File-based subclade analysis still requires the chosen-file workflow.' } };
}
export function parseGeneticsSnapshot(value: unknown): GeneticsSnapshot {
  const row = agentDataObject(value), record = agentDataObject(row.record);
  if (row.version !== 1 || !isGeneticsResource(row.resource) || typeof row.id !== 'string' || record.id !== row.id
    || !(row.resource === 'geneticVariants' ? /^rs\d{1,15}$/.test(row.id) && record.rsid === row.id && Array.isArray(record.catalogGenotypes) : row.id === (row.resource === 'genome' ? 'genome' : 'maternal'))
    || typeof row.revision !== 'string' || !/^[a-f0-9]{64}$/.test(row.revision) || typeof row.summaryEnabled !== 'boolean') throw new Error('Read an exact genetics record before proposing a change.');
  return row as unknown as GeneticsSnapshot;
}
export function geneticsPatch(proposal: AgentDataProposal) {
  const patch = parseAgentDataPatch(proposal.patch);
  if (!isGeneticsResource(proposal.resource)) throw new Error('Choose a genetics resource.');
  if (!geneticsCapabilities(proposal.resource).operations.includes(proposal.operation)) throw new Error('Unsupported genetics operation.');
  validateFieldNames(patch, proposal.operation === 'remove' ? [] : proposal.resource === 'geneticVariants' ? ['genotype', 'sourceLabel'] : ['haplogroup']);
  if (proposal.operation === 'update' && proposal.resource === 'geneticVariants') {
    if (typeof patch.genotype !== 'string' || !patch.genotype.trim() || patch.genotype.length > 40) throw new Error('Supply an explicit reported genotype.');
    if (Object.hasOwn(patch, 'sourceLabel') && (typeof patch.sourceLabel !== 'string' || !patch.sourceLabel.trim() || patch.sourceLabel.length > 120)) throw new Error('Supply a short reported source label.');
  }
  if (proposal.operation === 'update' && proposal.resource === 'maternalHaplogroup' && (typeof patch.haplogroup !== 'string' || !HAPLOGROUP_LIST.some(id => id.toUpperCase() === patch.haplogroup!.toString().trim().toUpperCase()))) throw new Error('Choose a supported explicitly reported maternal haplogroup.');
  return patch;
}
export function projectGeneticsRecord(proposal: AgentDataProposal) {
  const snapshot = parseGeneticsSnapshot(JSON.parse(proposal.baseline)); geneticsPatch(proposal);
  if (snapshot.resource !== proposal.resource || snapshot.id !== proposal.recordId || !snapshot.plan || snapshot.plan.after.id !== snapshot.id
    || typeof snapshot.plan.replacesRecordedCall !== 'boolean' || typeof snapshot.plan.clearsMaternalEvidence !== 'boolean') throw new Error('Prepare a complete genetics review before applying it.');
  return { before: snapshot.record, after: snapshot.plan.after, plan: snapshot.plan };
}
export function displayGeneticsRecord(value: unknown): GeneticsRecord {
  const row = agentDataObject(value); return row.version === 1 ? parseGeneticsSnapshot(row).record : row as unknown as GeneticsRecord;
}
export function describeGeneticsRecord(value: unknown) {
  const row = displayGeneticsRecord(value);
  if ('hasData' in row) {
    const genome = row, count = (value: number | null) => value === null ? 'Unknown (legacy data)' : String(value);
    return `${genome.hasData ? 'Saved genome data' : 'No saved genome data'}\nSNP calls: ${count(genome.storedCallCount)} · previous calls: ${count(genome.previousCallCount)}\nMaternal record: ${genome.maternalRecorded === null ? 'Unknown (legacy data)' : genome.maternalRecorded ? 'Recorded' : 'Not recorded'} · previous reports: ${count(genome.previousMaternalReportCount)}${genome.legacyData ? '\nIncludes legacy data; all saved genetics fields will be cleared.' : ''}${genome.removed ? '\nGenome removed; restoration requires new reported facts or a reviewed file.' : ''}`;
  }
  return 'rsid' in row ? `${row.gene || row.rsid}${row.variant ? ` · ${row.variant}` : ''} (${row.rsid})\nGenotype: ${row.genotype || 'Not recorded'}${row.normalizedGenotype && row.normalizedGenotype !== row.genotype ? ` · catalog match ${row.normalizedGenotype}` : ''}\nPrevious saved calls: ${row.previousCallCount || 0}${row.removed ? '\nRemoved; a reported genotype is required to restore it.' : ''}`
    : 'haplogroup' in row ? `Maternal haplogroup: ${row.haplogroup || 'Not recorded'}\nSaved mutation records: ${row.storedMutationCount} · previous reports: ${row.previousReportCount}${row.removed ? '\nRemoved; new reported lineage or a reviewed file is required to restore it.' : ''}` : '';
}
export function canDiscloseGeneticsReview(proposal: AgentDataProposal): boolean {
  try { const row = parseGeneticsSnapshot(JSON.parse(proposal.baseline)); return row.resource === proposal.resource && geneticsScope(row.resource)
    && (!row.plan?.apoe || isContextSourceEnabled(CONTEXT_SOURCE_IDS.GENOME_SUMMARY)); } catch { return false; }
}
