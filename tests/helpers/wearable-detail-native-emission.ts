/** Exact expected callback spellings qualified by the complete original controller
 * through normal TypeScript 7 emission, maintained indentation compaction and
 * ordinary Vitest JavaScript loading. Actual receipts are never normalized.
 * The immutable original fixture and every other field stay exact. */
export const WEARABLE_DETAIL_ORIGINAL_FIXTURE_SHA256 = "a08486406477acad9d69efca0cb10299514ff0329d3fe9188560c7d0f5b27d65";
const scenarios = ["missing metric", "unknown metric ID", "HRV empty source", "HRV chart", "range 6 months", "range 1 year", "range all", "invalid saved range native fallback", "missing modal", "missing overlay", "prior chart destroyed before assignment", "primary history error", "manual history error tolerated", "empty weight compact vendor affordance", "empty weight full manual section", "weight manual rows and tags/note", "weight manual US units", "manual rows older than range", "manual all-time older chart", "manual pulse readings", "BP paired same source", "BP diastolic ID redirects native", "BP paired different sources", "BP split summary dates", "BP incomplete summary dates", "BP manual pair and source swap", "single source swap", "unknown primary source fallback", "companion latest/7d/30d", "companion no sufficient weekly", "companion latest only", "Polar daytime tooltip", "Whoop daytime tooltip", "Fitbit daytime tooltip", "resting HR missing daytime tooltip", "activity all-zero rest mode", "temperature absolute delta", "steps suppress delta partial chart", "zero baseline suppress delta", "nonfinite baseline", "null latest", "zero latest suppression", "improving trend", "declining trend", "native escaped canon labels", "native Symbol canon labels", "native canon getter order", "native canon string hint", "native label coercion throw", "native latest getter chronology", "native latest getter throws after read", "native baseline Symbol numeric throw", "native manual note getter", "native manual row date throw", "EMF regressing sleep no assessment", "EMF recent assessment suppresses hint", "EMF old assessment allows hint", "EMF no sources suppresses hint", "native async stale operation is discarded", "forward Tab native focus wraps", "backward Tab native focus wraps", "hidden overlay detaches native trap"] as const;
const emittedScenarios = ["HRV chart", "range 6 months", "range 1 year", "range all", "invalid saved range native fallback", "prior chart destroyed before assignment", "manual history error tolerated", "weight manual rows and tags/note", "weight manual US units", "manual all-time older chart", "manual pulse readings", "single source swap", "companion latest/7d/30d", "activity all-zero rest mode", "steps suppress delta partial chart", "native manual note getter", "native manual row date throw", "native async stale operation is discarded", "forward Tab native focus wraps", "backward Tab native focus wraps", "hidden overlay detaches native trap"] as const;
const callbacks = [
  {
    "path": [
      "chartCalls",
      0,
      "config",
      2,
      3,
      1,
      3,
      3,
      1,
      1,
      3,
      1,
      5,
      3,
      1,
      0,
      3,
      1
    ],
    "name": "titleForPoint",
    "length": 1,
    "before": "(items) => {\n\t\tconst rawX = items?.[0]?.raw?.x;\n\t\tif (typeof rawX === \"string\") return (0,__vite_ssr_import_10__.shortDate)(rawX);\n\t\treturn items?.[0]?.label || \"\";\n\t}",
    "after": "(items) => {\n    const rawX = items?.[0]?.raw?.x;\n    if (typeof rawX === 'string')\n      return (0,__vite_ssr_import_10__.shortDate)(rawX);\n    return items?.[0]?.label || '';\n  }"
  },
  {
    "path": [
      "chartCalls",
      0,
      "config",
      2,
      3,
      1,
      3,
      3,
      1,
      1,
      3,
      1,
      5,
      3,
      1,
      1,
      3,
      1
    ],
    "name": "label",
    "length": 1,
    "before": "(c) => {\n\t\t\t\t\t\t\tconst base = `${c.dataset.label}: ${formatV(c.parsed.y)}${unit ? \" \" + unit : \"\"}`;\n\t\t\t\t\t\t\tif (c.dataset._kind === \"manual\") return `${base}  (manual entry)`;\n\t\t\t\t\t\t\treturn c.dataset._kind === \"primary\" && isPartialIdx(c.dataIndex) ? `${base}  (partial day · in progress)` : base;\n\t\t\t\t\t\t}",
    "after": "(c) => {\n              const base = `${c.dataset.label}: ${formatV(c.parsed.y)}${unit ? ' ' + unit : ''}`;\n              if (c.dataset._kind === 'manual')\n                return `${base}  (manual entry)`;\n              return (c.dataset._kind === 'primary' && isPartialIdx(c.dataIndex))\n                ? `${base}  (partial day · in progress)`\n                : base;\n            }"
  }
] as const;
type NativeReceiptRecord = Record<string, unknown>;
function callbackAt(root: unknown, path: readonly (string | number)[]): NativeReceiptRecord {
  let value: unknown = root;
  for (const part of path) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, part)) throw new Error('Missing qualified native callback path');
    if (typeof part === 'number' && (!Array.isArray(value) || !Number.isInteger(part))) throw new Error('Invalid qualified native callback order');
    value = (value as Record<string | number, unknown>)[part];
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid qualified native callback snapshot');
  return value as NativeReceiptRecord;
}
function requireCallback(value: NativeReceiptRecord, name: string, length: number, source: string): void {
  if (Object.keys(value).join(',') !== 'type,name,length,source' || value.type !== 'function'
    || value.name !== name || value.length !== length || value.source !== source) {
    throw new Error('Unqualified native callback name, arity, source or field order');
  }
}
export function qualifyWearableDetailExpectedReceipt(name: string, original: unknown): unknown {
  if (!(scenarios as readonly string[]).includes(name)) throw new Error('Unknown native Wearables receipt scenario');
  const expected: unknown = structuredClone(original);
  if (!(emittedScenarios as readonly string[]).includes(name)) return expected;
  let changed = 0;
  for (const callback of callbacks) {
    const value = callbackAt(expected, callback.path);
    requireCallback(value, callback.name, callback.length, callback.before);
    value.source = callback.after;
    changed++;
  }
  if (changed !== 2) throw new Error('Expected exactly two qualified native callback spellings');
  const restored: unknown = structuredClone(expected);
  for (const callback of callbacks) {
    const value = callbackAt(restored, callback.path);
    requireCallback(value, callback.name, callback.length, callback.after);
    value.source = callback.before;
  }
  if (JSON.stringify(restored) !== JSON.stringify(original)) throw new Error('Native receipt changed outside qualified callback source leaves');
  return expected;
}
