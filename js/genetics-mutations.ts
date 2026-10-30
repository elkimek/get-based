// Pure genetics commands shared by native editors and reviewed chat operations.
import type { DnaProfileData, SnpSource, StoredSnpCall } from './dna-runtime.js';
import type { SnpCatalog } from './dna-evidence.js';
import type { HaplogroupTable } from './dna-haplogroup-catalog.js';
import { findGenotypeMatch, normalizeGenotype } from './dna-genotype.js';
import { recalculateGenetics } from './genetics-summary.js';
import { mergeGeneticsSnpStates, geneticsSnpRemoved, geneticsSnpAllowed, geneticsSnpMutationTime, recordGeneticsSnpState } from './genetics-snp-lifecycle.js';
import { HAPLOGROUP_LIST } from './constants.js';
import { beginGeneticsMutation, stampGeneticsRecord, removeGeneticsScope, geneticsRecordAllowed } from './genetics-lifecycle.js';

export function geneticsCatalogSignature(table: SnpCatalog | null | undefined) {
  if (!table) return null;
  const ids = Object.keys(table).filter(key => key.startsWith('rs')).sort();
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])])) : value;
  const content = JSON.stringify(ids.map(id => [id, canonical(table[id])]));
  let hash = 5381;
  for (let i = 0; i < content.length; i++) hash = ((hash << 5) + hash) + content.charCodeAt(i);
  return { size: ids.length, hash: (hash >>> 0).toString(36) };
}
export { resolveGeneticsAPOE, recalculateGenetics } from './genetics-summary.js';

export type UpsertGeneticsResult = { ok: false; error: string } | { ok: true; rsid: string; snp: StoredSnpCall };
export function upsertGeneticsWithCatalog(data: DnaProfileData, rsidInput: unknown, genotypeInput: unknown, source: SnpSource, table: SnpCatalog | null | undefined, at = Date.now(), options: { restoreRemoved?: boolean; restoreGenome?: boolean } = {}): UpsertGeneticsResult {
  const prior = data.genetics || null;
  const rsid = String(rsidInput || '').trim().toLowerCase(), genotype = normalizeGenotype(genotypeInput);
  if (!/^rs\d+$/.test(rsid)) return { ok: false, error: 'Enter a valid rsID, e.g. rs1801133.' };
  if (!genotype) return { ok: false, error: 'Enter an allele genotype such as CT, or a supported repeat such as 6/7.' };
  const entry = table?.[rsid];
  if (!entry) return { ok: false, error: 'This SNP is not in the getbased health SNP catalog yet.' };
  const match = findGenotypeMatch(entry, genotype);
  if (!match) return { ok: false, error: 'That genotype does not match this SNP catalog entry.' };
  const states = mergeGeneticsSnpStates(data.geneticsSnpTombstones, null), oldCall = prior?.snps?.[rsid];
  if (geneticsSnpRemoved(states, rsid) && !options.restoreRemoved) return { ok: false, error: 'This SNP was explicitly removed. Restore it with an explicitly reported manual or chat call before importing it again.' };
  let assignmentAt: number;
  try { assignmentAt = beginGeneticsMutation(data, 'snp', geneticsSnpMutationTime(data, rsid, oldCall, at), !!(options.restoreRemoved || options.restoreGenome)); }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Could not prepare this SNP change.' }; }
  const hadCalls = Object.keys(data.genetics?.snps || {}).length > 0, signature = data.genetics?.catalogVersion;
  const date = new Date(at).toISOString().slice(0, 10);
  if (!data.genetics) data.genetics = { source: 'Manual SNPs', importDate: date, coverage: { found: 0, total: 0 }, effects: {}, snps: {}, catalogVersion: geneticsCatalogSignature(table) };
  if (!data.genetics.snps) data.genetics.snps = {};
  const metadata = { type: source.type || 'manual', label: source.label || source.fileName || 'Manual entry', fileName: source.fileName || null,
    rawText: source.rawText || null, addedAt: source.addedAt || new Date(at).toISOString() };
  const previous = geneticsRecordAllowed(data.geneticsLifecycle, oldCall) && geneticsSnpAllowed(states, rsid, oldCall) ? oldCall : undefined;
  const history = previous ? [...(Array.isArray(previous.priorCalls) ? previous.priorCalls : []),
    { call: Object.fromEntries(Object.entries(previous).filter(([key]) => key !== 'priorCalls')), replacedAt: new Date(at).toISOString() }] : [];
  data.genetics.snps[rsid] = { genotype, normalizedGenotype: match.key, gene: entry.gene, variant: entry.variant, category: entry.category || null,
    markers: entry.markers || [], effect: match.info.effect, valence: match.info.valence, evidence: entry.evidence, relevance: entry.relevance, note: match.info.note, source: metadata,
    updatedAt: assignmentAt, ...(history.length ? { priorCalls: history } : {}) };
  stampGeneticsRecord(data, data.genetics.snps[rsid]);
  if (states[rsid]) recordGeneticsSnpState(data, rsid, oldCall, false, at);
  if (!hadCalls || !data.genetics.source) data.genetics.source = metadata.label || data.genetics.source || 'Manual SNPs';
  data.genetics.importDate = date;
  if (!hadCalls) data.genetics.catalogVersion = geneticsCatalogSignature(table);
  else if (signature) data.genetics.catalogVersion = signature; else delete data.genetics.catalogVersion;
  recalculateGenetics(data.genetics, table);
  return { ok: true, rsid, snp: data.genetics.snps[rsid]! };
}
export function removeGeneticsSnpWithCatalog(data: DnaProfileData, id: string, table: SnpCatalog | null | undefined, at = Date.now()) {
  const states = mergeGeneticsSnpStates(data.geneticsSnpTombstones, null), call = data.genetics?.snps?.[id];
  if (!call || !geneticsSnpAllowed(states, id, call)) throw new Error('This SNP call is not recorded or is already removed.');
  recordGeneticsSnpState(data, id, call, true, at);
  delete data.genetics!.snps![id]; recalculateGenetics(data.genetics, table);
}
export function classifyHaplogroupCoupling(haplogroup: string, table: HaplogroupTable) {
  const entry = table.haplogroups[haplogroup], level = entry && table.couplingLevels[entry.coupling];
  return entry && level ? { level: entry.coupling, label: level.label, shortLabel: level.shortLabel, climate: entry.climate,
    description: level.description, implications: level.implications, matchedLatBands: level.latitudeBands } : null;
}
export function replaceMaternalReport(data: DnaProfileData, report: NonNullable<NonNullable<DnaProfileData['genetics']>['mtdna']>, at = Date.now(), restoreRemoved = false) {
  const updatedAt = beginGeneticsMutation(data, 'maternal', at, restoreRemoved);
  if (!data.genetics) data.genetics = { source: null, importDate: null, coverage: { found: 0, total: 0 }, effects: {}, snps: {} };
  if (data.genetics.mtdna) data.genetics.mtdnaHistory = [...(data.genetics.mtdnaHistory || []), structuredClone(data.genetics.mtdna)];
  data.genetics.mtdna = { ...structuredClone(report), updatedAt };
  stampGeneticsRecord(data, data.genetics.mtdna, true);
}
export function setReportedHaplogroup(data: DnaProfileData, value: unknown, table: HaplogroupTable, at = Date.now()) {
  const input = String(value || '').trim(), id = HAPLOGROUP_LIST.find(id => id.toUpperCase() === input.toUpperCase());
  if (!id) throw new Error('Choose a haplogroup supported by the manual editor. Do not infer a maternal lineage from ancestry.');
  replaceMaternalReport(data, { haplogroup: id, confidence: 1, origin: table.haplogroups[id]?.origin || null, details: table.haplogroups[id]?.etc || null,
    coupling: classifyHaplogroupCoupling(id, table), mutations: [], source: 'manual', importDate: new Date(at).toISOString().slice(0, 10) }, at, true);
}
export function clearReportedHaplogroup(data: DnaProfileData, at = Date.now()) { removeGeneticsScope(data, 'maternal', at); }
