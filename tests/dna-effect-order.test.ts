import { expect, it } from 'vitest';
import { saveGeneticsData } from '../js/dna.js';
import type { DnaProfileData, StoredSnpCall } from '../js/dna-runtime.js';

it('captures Object.entries before a report matches getter replaces it', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Object, 'entries')!;
  const entries = Object.entries;
  const matches: Record<string, StoredSnpCall> = { rs1801133: { genotype: 'CC', effect: 'none' } };
  const calls: string[] = [];
  const original = (value: object) => { if (value === matches) calls.push('original'); return entries(value); };
  const replacement = (value: object) => { if (value === matches) calls.push('replacement'); return entries(value); };
  let reads = 0;
  const result = {
    source: 'Synthetic report',
    get matches() {
      if (++reads === 2) Object.defineProperty(Object, 'entries', { ...descriptor, value: replacement });
      return matches;
    },
  };
  const profile: DnaProfileData = {};
  Object.defineProperty(Object, 'entries', { configurable: true, get: () => original });
  try { saveGeneticsData(profile, result); }
  finally { Object.defineProperty(Object, 'entries', descriptor); }
  expect(calls).toEqual(['original', 'replacement']);
  expect(profile.genetics?.snps?.rs1801133?.genotype).toBe('CC');
});
