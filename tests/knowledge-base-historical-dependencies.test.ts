import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';
import {qualifyHistoricalModalDependency, qualifyCurrentDomainDependency, readFrozen} from './helpers/knowledge-base-current-capture.mjs';

it.each(['ts', 'js'] as const)('retains the exact original modal %s dependency pin and rejects corrupted evidence', extension => {
  const file = `js/modal-lifecycle.${extension}` as const;
  const snapshot = readFileSync(`tests/fixtures/knowledge-base/modal-lifecycle.original.${extension}.txt`);
  const baseline = readFrozen<{originalCanonicalHashes: Record<string, string>; originalRuntimeHashes: Record<string, string>}>('candidate-baseline.json');
  const expected = extension === 'ts' ? baseline.originalCanonicalHashes[file] : baseline.originalRuntimeHashes[file];
  expect(qualifyHistoricalModalDependency(file, snapshot)).toBe(expected);
  expect(() => qualifyHistoricalModalDependency(file, Buffer.concat([snapshot, Buffer.from('\n/* changed */')]))).toThrow('Historical modal dependency changed');
});

it('keeps current modal behavior in the public Knowledge Base capture rather than loading historical UI', () => {
  const ui = readFileSync('js/lens-knowledge-base-ui.ts', 'utf8');
  expect(ui).toContain("import { closeModalOverlay, openModalOverlay, wireBackdropClose } from './modal-lifecycle.js';");
  expect(ui).not.toContain('modal-lifecycle.original');
  const current = readFileSync('js/modal-lifecycle.ts', 'utf8');
  expect(current).not.toBe(readFileSync('tests/fixtures/knowledge-base/modal-lifecycle.original.ts.txt', 'utf8'));
  expect(() => qualifyHistoricalModalDependency('js/modal-lifecycle.ts', Buffer.from(current))).toThrow('Historical modal dependency changed');
});

const reviewedNative = ['lens-local', 'lens-local-protocol', 'lens-local-worker', 'lens-local-library-registry', 'lens-local-store', 'lens-local-ingest', 'lens-local-utils'];
it.each(reviewedNative.flatMap(name => ['ts', 'js'].map(extension => `js/${name}.${extension}`)))(
  'pins reviewed native dependency %s and rejects any further source change', file => {
    const bytes = readFileSync(file);
    expect(qualifyCurrentDomainDependency(file, bytes)).toMatch(/^[0-9a-f]{64}$/);
    expect(() => qualifyCurrentDomainDependency(file, Buffer.concat([bytes, Buffer.from('\n/* changed */')]))).toThrow('Protected domain source changed');
  },
);
it('retains unmodified original domain pins and rejects unregistered dependencies', () => {
  for (const name of ['lens-local-parsers', 'lens-local-embedder-config', 'lens-actions']) {
    for (const extension of ['ts', 'js']) {
      const file = `js/${name}.${extension}`, bytes = readFileSync(file);
      expect(qualifyCurrentDomainDependency(file, bytes)).toMatch(/^[0-9a-f]{64}$/);
      expect(() => qualifyCurrentDomainDependency(file, Buffer.concat([bytes, Buffer.from(' changed')]))).toThrow('Protected domain source changed');
    }
  }
  expect(() => qualifyCurrentDomainDependency('js/unregistered.ts', Buffer.from(''))).toThrow('Known protected dependency');
});
