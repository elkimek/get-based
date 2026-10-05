// dna-genotype.js - strand-aware genotype lookup helpers.

export interface GenotypeEntry<Info = unknown, Hint = unknown> {
  genotypes?: Record<string, Info> | null;
  snpHints?: Record<string, Hint> | null;
}

export function sortAlleles<T extends string | null | undefined>(genotype: T) {
  if (!genotype || genotype.length !== 2) return genotype;
  return genotype.split('').sort().join('');
}

export function normalizeGenotype(genotype: unknown) {
  const raw = String(genotype || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[|\\]/g, '/');
  if (/^[ACGT]{1,2}$/.test(raw)) return raw;
  if (/^\d+\/\d+$/.test(raw)) return raw;
  return '';
}

const COMPLEMENT: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C' };

function reverseComplement(genotype: string) {
  if (!genotype) return genotype;
  let out = '';
  for (let i = genotype.length - 1; i >= 0; i--) {
    out += COMPLEMENT[genotype[i]!] || genotype[i];
  }
  return out;
}

function isPalindromicEntry(entry: GenotypeEntry | null | undefined) {
  if (!entry || !entry.genotypes) return false;
  const alleles = new Set();
  for (const k of Object.keys(entry.genotypes)) {
    for (const c of k) alleles.add(c);
  }
  if (alleles.size !== 2) return false;
  return (alleles.has('A') && alleles.has('T')) || (alleles.has('C') && alleles.has('G'));
}

function buildStrandAwareKeys(genotype: string, palindromic: boolean) {
  const tries = [genotype];
  if (/^\d+\/\d+$/.test(genotype)) {
    const [left, right] = genotype.split('/');
    if (left !== right) tries.push(`${right}/${left}`);
    return tries;
  }
  if (genotype.length === 2) tries.push(genotype[1]! + genotype[0]!);
  tries.push(sortAlleles(genotype));
  if (!palindromic) {
    const rc = reverseComplement(genotype);
    tries.push(rc);
    if (rc.length === 2) tries.push(rc[1]! + rc[0]!);
    tries.push(sortAlleles(rc));
  }
  return tries;
}

function findStrandAwareEntry<Value>(table: Record<string, Value> | null | undefined, genotype: string | null | undefined, palindromic: boolean) {
  if (!table || !genotype) return null;
  for (const key of buildStrandAwareKeys(genotype, palindromic)) {
    if (table[key] != null) return { key, value: table[key]! };
  }
  return null;
}

export function findGenotypeKey(entry: GenotypeEntry | null | undefined, genotype: unknown) {
  if (!entry || !entry.genotypes) return null;
  const raw = normalizeGenotype(genotype);
  if (!raw) return null;
  return findStrandAwareEntry(entry.genotypes, raw, isPalindromicEntry(entry))?.key || null;
}

export function findGenotypeMatch<Info>(entry: GenotypeEntry<Info> | null | undefined, genotype: unknown) {
  if (!entry || !entry.genotypes) return null;
  const raw = normalizeGenotype(genotype);
  if (!raw) return null;
  const match = findStrandAwareEntry(entry.genotypes, raw, isPalindromicEntry(entry));
  return match ? { key: match.key, info: match.value } : null;
}

export function findGenotypeInfo<Info>(entry: GenotypeEntry<Info> | null | undefined, genotype: unknown) {
  return findGenotypeMatch(entry, genotype)?.info || null;
}

export function findSnpHint<Hint>(entry: GenotypeEntry<unknown, Hint> | null | undefined, genotype: string | null | undefined) {
  if (!entry || !entry.snpHints) return null;
  return findStrandAwareEntry(entry.snpHints, genotype, isPalindromicEntry(entry))?.value || null;
}
