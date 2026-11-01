import { expect, it } from 'vitest';
import { captureCurrent, originalCaseCount, originalRevision, readFrozen } from './helpers/knowledge-base-current-capture.mjs';
import { equalIngestSnapshot, type IngestReceipt, type IngestSnapshot } from './helpers/knowledge-base-frozen-contract.js';

interface NativeIngestReceipt extends IngestReceipt {
  cleanupTimers: unknown[];
  setup: { requests: IngestReceipt['requests']; snapshot: IngestSnapshot };
}

const original = readFrozen<{
  baselineRevisionLabel: string;
  results: Array<{ name: string; exitCode: number; receipt: NativeIngestReceipt }>;
  summary: { captured: string[]; uncaptured: string[]; failed: string[] };
}>('candidate-ingest-branches-original.json');
expect(original.baselineRevisionLabel).toBe(originalRevision);
expect(originalCaseCount).toBe(97);
expect(original.summary.captured).toHaveLength(13);
expect(original.summary.uncaptured).toEqual([]);
expect(original.summary.failed).toEqual([]);

// Explicitly approved native safety changes, applied to a copy of the immutable
// original receipt. No observed output supplies an expected value.
function reviewedNativeReceipt(baseline: NativeIngestReceipt): NativeIngestReceipt {
  const reviewed = structuredClone(baseline);
  for (const request of reviewed.requests) {
    if (request.message.type === 'ingest') request.message.expectedLibraryId = 'research';
  }
  if (baseline.name !== 'worker-ingest-error') return reviewed;

  expect(baseline.wireDelta).toEqual(['ingest']);
  expect(baseline.requests).toHaveLength(4);
  expect(baseline.replies).toHaveLength(4);
  expect(baseline.trace).toHaveLength(10);
  const corpus = baseline.setup.snapshot.corpus as Record<string, unknown>;
  reviewed.requests.push({ now: 3000, message: { type: 'stats' } });
  reviewed.replies.push({ now: 3000, data: { type: 'stats_result', ...corpus } });
  reviewed.wireDelta = ['ingest', 'stats'];
  expect(baseline.trace[2]).toEqual({ type: 'recordLocalLensStats', stats: corpus });
  expect(baseline.trace[3]).toEqual({ type: 'updateLensStatus', partial: {} });
  // The recovered stats reply publishes the same two native callbacks as setup,
  // before the original cleanup timers fire. Preserve the entire ordered trace.
  reviewed.trace.splice(6, 0, structuredClone(baseline.trace[2]!), structuredClone(baseline.trace[3]!));
  const recoveredLabels = ['terminal', 'terminal-plus-2999ms', 'terminal-plus-3000ms'];
  expect(baseline.snapshots.filter(snapshot => recoveredLabels.includes(snapshot.label)).map(snapshot => snapshot.label)).toEqual(recoveredLabels);
  reviewed.snapshots = reviewed.snapshots.map(snapshot => recoveredLabels.includes(snapshot.label) ? {
    ...snapshot,
    statsHTML: baseline.setup.snapshot.statsHTML,
    docListHTML: baseline.setup.snapshot.docListHTML,
    requestCount: Number(snapshot.requestCount) + 1,
    traceCount: Number(snapshot.traceCount) + 2,
  } : snapshot);
  return reviewed;
}

it.each(original.results)(
  'retains public ingest/parser/FIFO branch with reviewed native safety: $name',
  expected => {
    const current = captureCurrent<NativeIngestReceipt>('candidate-ingest-branches', expected.name);
    const reviewed = reviewedNativeReceipt(expected.receipt);
    expect(current.status).toBe('captured');
    expect(expected.exitCode).toBe(0);
    expect(current.requests).toEqual(reviewed.requests);
    // Missing and wrong owner guards must fail this complete wire comparison;
    // all other request fields, ordering and timing remain part of the contract.
    if (current.requests.some(request => request.message.type === 'ingest')) {
      const unguarded = structuredClone(current.requests);
      const wrongOwner = structuredClone(current.requests);
      for (const request of unguarded) if (request.message.type === 'ingest') delete request.message.expectedLibraryId;
      for (const request of wrongOwner) if (request.message.type === 'ingest') request.message.expectedLibraryId = 'different-library';
      expect(unguarded).not.toEqual(reviewed.requests);
      expect(wrongOwner).not.toEqual(reviewed.requests);
    }
    expect(current.replies).toEqual(reviewed.replies);
    expect(current.wireDelta).toEqual(reviewed.wireDelta);
    expect(current.focusedBranchWire).toEqual(reviewed.focusedBranchWire);
    expect(current.loadingStopReceipt).toEqual(reviewed.loadingStopReceipt);
    expect(current.observations).toEqual(reviewed.observations);
    expect(current.warnings).toEqual(reviewed.warnings);
    expect(current.errors).toEqual(reviewed.errors);
    expect(current.cleanupTimers).toEqual(reviewed.cleanupTimers);
    expect(current.setup.requests).toEqual(reviewed.setup.requests);
    equalIngestSnapshot(current.setup.snapshot, reviewed.setup.snapshot);
    expect(current.snapshots.map(snapshot => snapshot.label)).toEqual(reviewed.snapshots.map(snapshot => snapshot.label));
    current.snapshots.forEach((snapshot, index) => equalIngestSnapshot(snapshot, reviewed.snapshots[index]!));
    if (expected.name === 'worker-ingest-error') {
      for (const label of ['terminal', 'terminal-plus-2999ms', 'terminal-plus-3000ms']) {
        const snapshot = current.snapshots.find(item => item.label === label)!;
        expect(snapshot.statsHTML).toBe(current.setup.snapshot.statsHTML);
        expect(snapshot.docListHTML).toBe(current.setup.snapshot.docListHTML);
        expect(snapshot.corpus).toEqual(current.setup.snapshot.corpus);
      }
    }
    const stableTrace = (receipt: IngestReceipt) => receipt.trace.map(entry => {
      if (entry.type !== 'worker-created') return entry;
      const { url, ...rest } = entry;
      expect(new URL(url!).pathname).toMatch(/\/js\/lens-local-worker\.js$/);
      expect(entry.options).toEqual({ type: 'module' });
      return rest;
    });
    expect(stableTrace(current)).toEqual(stableTrace(reviewed));
  },
  30000,
);
