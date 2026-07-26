import crypto from 'node:crypto';

export function sourceFingerprint(source) {
  const text = typeof source === 'string' ? source : '';
  return {
    sourceLength: text.length,
    sourceHash: text
      ? crypto.createHash('sha256').update(text).digest('hex')
      : null,
  };
}

export function coverageEntryMatchesSource(entry, source) {
  if (!entry?.sourceHash) return true;
  const fingerprint = sourceFingerprint(source);
  return entry.sourceLength === fingerprint.sourceLength
    && entry.sourceHash === fingerprint.sourceHash;
}

export function coverageFunctionRange(fn) {
  const range = fn?.ranges?.[0];
  if (!range) return null;
  const start = range.start ?? range.startOffset ?? 0;
  const end = range.end ?? range.endOffset ?? 0;
  return end > start ? { start, end } : null;
}

export function isTopLevelScriptFunction(fn, index, total) {
  if (index !== 0 || fn?.functionName) return false;
  const range = coverageFunctionRange(fn);
  return Boolean(range && range.start === 0 && range.end >= total);
}
