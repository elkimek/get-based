// @ts-check
// dna-genotype.js - strand-aware genotype lookup helpers.

export function sortAlleles(genotype) {
  if (!genotype || genotype.length !== 2) return genotype;
  return genotype.split('').sort().join('');
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

function findStrandAwareKey(table, genotype, palindromic) {
  if (!table || !genotype) return null;
  const tries = [genotype];
  if (genotype.length === 2) tries.push(genotype[1] + genotype[0]);
  tries.push(sortAlleles(genotype));
  if (!palindromic) {
    const rc = reverseComplement(genotype);
    tries.push(rc);
    if (rc.length === 2) tries.push(rc[1] + rc[0]);
    tries.push(sortAlleles(rc));
  }
  for (const k of tries) {
    if (table[k] != null) return table[k];
  }
  return null;
}

export function findGenotypeInfo(entry, genotype) {
  if (!entry || !entry.genotypes) return null;
  return findStrandAwareKey(entry.genotypes, genotype, isPalindromicEntry(entry));
}

export function findSnpHint(entry, genotype) {
  if (!entry || !entry.snpHints) return null;
  return findStrandAwareKey(entry.snpHints, genotype, isPalindromicEntry(entry));
}
