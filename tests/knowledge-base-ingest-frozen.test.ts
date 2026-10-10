import { expect, it } from 'vitest';
import { captureCurrent, originalCaseCount, originalRevision, readFrozen } from './helpers/knowledge-base-current-capture.mjs';
import { equalIngestSnapshot, type IngestReceipt } from './helpers/knowledge-base-frozen-contract.js';

const original = readFrozen<{
  baselineRevisionLabel: string;
  results: Array<{ name: string; exitCode: number; receipt: IngestReceipt }>;
  summary: { captured: string[]; uncaptured: string[]; failed: string[] };
}>('candidate-ingest-branches-original.json');
expect(original.baselineRevisionLabel).toBe(originalRevision);
expect(originalCaseCount).toBe(97);
expect(original.summary.captured).toHaveLength(13);
expect(original.summary.uncaptured).toEqual([]);
expect(original.summary.failed).toEqual([]);

it.each(original.results)(
  'retains original public ingest/parser/FIFO branch: $name',
  expected => {
    const current = captureCurrent<IngestReceipt>('candidate-ingest-branches', expected.name);
    expect(current.status).toBe('captured');
    expect(expected.exitCode).toBe(0);
    expect(current.requests).toEqual(expected.receipt.requests);
    expect(current.replies).toEqual(expected.receipt.replies);
    expect(current.wireDelta).toEqual(expected.receipt.wireDelta);
    expect(current.focusedBranchWire).toEqual(expected.receipt.focusedBranchWire);
    expect(current.loadingStopReceipt).toEqual(expected.receipt.loadingStopReceipt);
    expect(current.observations).toEqual(expected.receipt.observations);
    expect(current.warnings).toEqual(expected.receipt.warnings);
    expect(current.errors).toEqual(expected.receipt.errors);
    expect(current.snapshots.map(snapshot => snapshot.label)).toEqual(expected.receipt.snapshots.map(snapshot => snapshot.label));
    current.snapshots.forEach((snapshot, index) => equalIngestSnapshot(snapshot, expected.receipt.snapshots[index]!));
    const stableTrace = (receipt: IngestReceipt) => receipt.trace.map(entry => {
      if (entry.type !== 'worker-created') return entry;
      const { url, ...rest } = entry;
      expect(new URL(url!).pathname).toMatch(/\/js\/lens-local-worker\.js$/);
      expect(entry.options).toEqual({ type: 'module' });
      return rest;
    });
    expect(stableTrace(current)).toEqual(stableTrace(expected.receipt));
  },
  30000,
);
