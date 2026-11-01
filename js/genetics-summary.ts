// Deterministic summary of stored calls; no profile access or catalog fetch.
import type { GeneticsData, StoredSnpCall } from './dna-runtime.js';
import type { SnpCatalog } from './dna-evidence.js';
import { sortAlleles } from './dna-genotype.js';

export function resolveGeneticsAPOE(matches: Record<string, Pick<StoredSnpCall, 'genotype'> & Partial<Pick<StoredSnpCall, 'normalizedGenotype'>>>) {
  const left = matches.rs429358?.normalizedGenotype || matches.rs429358?.genotype, right = matches.rs7412?.normalizedGenotype || matches.rs7412?.genotype;
  if (!left || !right || left.length !== 2 || right.length !== 2) return null;
  const table: Record<string, string> = {
    'TT|CC': 'ε3/ε3', 'CT|CC': 'ε3/ε4', 'CC|CC': 'ε4/ε4',
    'TT|CT': 'ε2/ε3', 'CT|CT': 'ε2/ε4', 'TT|TT': 'ε2/ε2',
  };
  return table[`${sortAlleles(left)}|${sortAlleles(right)}`] || null;
}
export function recalculateGenetics(genetics: GeneticsData | null | undefined, table?: SnpCatalog | null) {
  if (!genetics) return;
  const apoe = resolveGeneticsAPOE(genetics.snps || {}), effects = { significant: 0, moderate: 0, mild: 0, normal: 0 };
  for (const [id, call] of Object.entries(genetics.snps || {})) {
    if (!call || typeof call !== 'object') continue;
    if (apoe && ['rs429358', 'rs7412'].includes(id)) continue;
    if (call.effect === 'none') effects.normal++;
    else if (call.effect === 'significant' || call.effect === 'moderate' || call.effect === 'mild') effects[call.effect]++;
  }
  genetics.effects = effects;
  genetics.coverage = { found: Object.keys(genetics.snps || {}).length, total: table ? Object.keys(table).filter(key => key.startsWith('rs')).length : genetics.coverage?.total || 0 };
  if (apoe) genetics.apoe = apoe; else delete genetics.apoe;
}
