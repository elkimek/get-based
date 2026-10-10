import { expect, it } from 'vitest';
import { captureCurrent, originalRevision, readFrozen } from './helpers/knowledge-base-current-capture.mjs';
import { equalOriginalDOM, type StatsSample } from './helpers/knowledge-base-frozen-contract.js';

const original = readFrozen<{ revision: string; samples: StatsSample[] }>('candidate-stats-original.json');
expect(original.revision).toBe(originalRevision);
expect(original.samples).toHaveLength(18);

it.each(original.samples.map((sample, index) => ({ ...sample, index })))(
  'retains actual local API stats/document/error order: $name',
  expected => {
    // A fresh Node child preserves the genuine retained rejected queue and
    // isolates NaN/Infinity and intentionally malformed original outcomes.
    const current = captureCurrent<StatsSample>('candidate-stats', String(expected.index));
    for (const field of ['initialHTML', 'statsHTML', 'documentsHTML', 'libraryOptionsHTML', 'finalPanelHTML'] as const) {
      equalOriginalDOM(current[field], expected[field]);
    }
    expect(current.name).toBe(expected.name);
    expect(current.input).toEqual(expected.input);
    expect(current.trace).toEqual(expected.trace);
    expect(current.workerRequests).toEqual(expected.workerRequests);
    expect(current.cachedCorpusCount).toBe(expected.cachedCorpusCount);
    expect(current.remainingFrames).toBe(expected.remainingFrames);
  },
  30000,
);
