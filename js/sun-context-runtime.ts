// sun-context-runtime.js — Shared dependency configuration for Sun AI context owners.

const DEFAULT_TIER_LABELS = ['none', 'low', 'moderate', 'good', 'strong'];

// Raw configured slots remain opaque; the existing public registry also permits extensions.
export const sunContextDeps: Record<string, unknown> = {
  bodyRegions: [],
  channelDisplay: {},
  circadianMelanopicLux: null,
  computeDeficitAxes: null,
  computeIndoorBurden: null,
  cumulativeMEDToday: () => 0,
  getMeteoConfig: () => ({ privacyRounding: 0.01 }),
  isDebugMode: () => false,
  invalidateLabContextCache: null,
  pbmJoulesPerCm2: null,
  rollingChannelTotals: () => ({}),
  rollingDeviceTotals: () => ({}),
  tierLabel: (tier: number) => DEFAULT_TIER_LABELS[tier] || 'none',
  vitaminDDailySaturationIU: 20000,
  vitaminDIUPerSession: null,
  weeklyChannelTier: null,
};

export function configureSunContext(deps: unknown = {}) {
  const previous = { ...sunContextDeps };
  for (const [key, value] of (Object.entries as (value: unknown) => Array<[string, unknown]>)(deps || {})) {
    if (Object.prototype.hasOwnProperty.call(sunContextDeps, key)) {
      sunContextDeps[key] = value;
    } else {
      _debugWarn('[sun-context] ignoring unknown dependency key', key);
    }
  }
  return previous;
}

export function _debugWarn(...args: unknown[]) {
  if (typeof sunContextDeps.isDebugMode === 'function' && (sunContextDeps.isDebugMode as () => unknown)()) {
    console.warn(...args);
  }
}

export function _bodyRegionFractionByKey() {
  const regions: Array<{ key?: unknown; fraction?: unknown }> = Array.isArray(sunContextDeps.bodyRegions) ? sunContextDeps.bodyRegions : [];
  return (Object.fromEntries as (entries: Iterable<readonly [unknown, unknown]>) => Record<string, unknown>)(regions.map(r => [r.key, r.fraction]));
}

// Sanitize user-supplied strings before interpolating into AI prompts.
// User-typed device and room names can reach the always tier on every turn.
export function _safeText(s: unknown, max = 80) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}
