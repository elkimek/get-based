export interface SourceFingerprintReader { sourceHash?: unknown; sourceLength?: unknown; }
export interface CoverageRangeReader {
  start?: number | null;
  end?: number | null;
  startOffset?: number | null;
  endOffset?: number | null;
  count?: number;
}
export interface CoverageFunctionReader {
  functionName?: unknown;
  ranges?: readonly CoverageRangeReader[] | null;
}

import crypto from 'node:crypto';

export function sourceFingerprint(source: unknown) {
  const text = typeof source === 'string' ? source : '';
  return {
    sourceLength: text.length,
    sourceHash: text
      ? crypto.createHash('sha256').update(text).digest('hex')
      : null,
  };
}

export function coverageEntryMatchesSource(entry: SourceFingerprintReader | null | undefined, source: unknown) {
  if (!entry?.sourceHash) return true;
  const fingerprint = sourceFingerprint(source);
  return entry.sourceLength === fingerprint.sourceLength
    && entry.sourceHash === fingerprint.sourceHash;
}

export function coverageFunctionRange(fn: CoverageFunctionReader | null | undefined) {
  const range = fn?.ranges?.[0];
  if (!range) return null;
  const start = range.start ?? range.startOffset ?? 0;
  const end = range.end ?? range.endOffset ?? 0;
  return end > start ? { start, end } : null;
}

export function isTopLevelScriptFunction(fn: CoverageFunctionReader | null | undefined, index: number, total: number) {
  if (index !== 0 || fn?.functionName) return false;
  const range = coverageFunctionRange(fn);
  return Boolean(range && range.start === 0 && range.end >= total);
}
