// @ts-check
// dna-genotype.js - strand-aware genotype lookup helpers.

export function sortAlleles(genotype) {
  if (!genotype || genotype.length !== 2) return genotype;
  return genotype.split('').sort().join('');
}

export function normalizeGenotype(genotype) {
  const raw = String(genotype || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[|\\]/g, '/');
  if (/^[ACGT]{1,2}$/.test(raw)) return raw;
  if (/^\d+\/\d+$/.test(raw)) return raw;
  return '';
}

const COMPLEMENT = { A: 'T', T: 'A', C: 'G', G: 'C' };

function reverseComplement(genotype) {
  if (!genotype) return genotype;
  let out = '';
  for (let i = genotype.length - 1; i >= 0; i--) {
    out += COMPLEMENT[genotype[i]] || genotype[i];
  }
  return out;
}

function isPalindromicEntry(entry) {
  if (!entry || !entry.genotypes) return false;
  const alleles = new Set();
  for (const k of Object.keys(entry.genotypes)) {
    for (const c of k) alleles.add(c);
  }
  if (alleles.size !== 2) return false;
  return (alleles.has('A') && alleles.has('T')) || (alleles.has('C') && alleles.has('G'));
}

function buildStrandAwareKeys(genotype, palindromic) {
  const tries = [genotype];
  if (/^\d+\/\d+$/.test(genotype)) {
    const [left, right] = genotype.split('/');
    if (left !== right) tries.push(`${right}/${left}`);
    return tries;
  }
  if (genotype.length === 2) tries.push(genotype[1] + genotype[0]);
  tries.push(sortAlleles(genotype));
  if (!palindromic) {
    const rc = reverseComplement(genotype);
    tries.push(rc);
    if (rc.length === 2) tries.push(rc[1] + rc[0]);
    tries.push(sortAlleles(rc));
  }
  return tries;
}

function findStrandAwareEntry(table, genotype, palindromic) {
  if (!table || !genotype) return null;
  for (const key of buildStrandAwareKeys(genotype, palindromic)) {
    if (table[key] != null) return { key, value: table[key] };
  }
  return null;
}

export function findGenotypeKey(entry, genotype) {
  if (!entry || !entry.genotypes) return null;
  const raw = normalizeGenotype(genotype);
  if (!raw) return null;
  return findStrandAwareEntry(entry.genotypes, raw, isPalindromicEntry(entry))?.key || null;
}

export function findGenotypeMatch(entry, genotype) {
  if (!entry || !entry.genotypes) return null;
  const raw = normalizeGenotype(genotype);
  if (!raw) return null;
  const match = findStrandAwareEntry(entry.genotypes, raw, isPalindromicEntry(entry));
  return match ? { key: match.key, info: match.value } : null;
}

export function findGenotypeInfo(entry, genotype) {
  return findGenotypeMatch(entry, genotype)?.info || null;
}

export function findSnpHint(entry, genotype) {
  if (!entry || !entry.snpHints) return null;
  return findStrandAwareEntry(entry.snpHints, genotype, isPalindromicEntry(entry))?.value || null;
}
