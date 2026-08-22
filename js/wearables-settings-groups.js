// @ts-check
// Pure presentation grouping for Settings → Wearables. Keeping ordering rules
// separate from the renderer makes the hosted/self-host layout easy to test
// without coupling it to connection actions or DOM state.

export const WEARABLE_GROUP_COPY = Object.freeze({
  connected: {
    title: 'Connected',
    hint: 'Choose a source to update or disconnect it.',
  },
  available: {
    title: 'Ready to connect',
    hint: 'Connect an account to import its readings.',
  },
  self_host: {
    title: 'For self-hosted getbased',
    hint: 'Available when you run getbased on your own server.',
  },
  local: {
    title: 'Import or enter data',
    hint: 'Use an Apple Health export or add readings yourself.',
  },
});

/** @type {Readonly<Record<string, number>>} */
const SELF_HOST_ADAPTER_ORDER = Object.freeze({
  google_health: 0,
  whoop: 1,
  ultrahuman: 2,
});

/**
 * @param {Array<any>} adapters
 * @param {object} connected
 * @param {(adapter: any) => boolean} needsAttention
 */
export function groupWearableAdapters(adapters, connected, needsAttention) {
  /** @type {Record<string, Array<any>>} */
  const grouped = { connected: [], available: [], self_host: [], local: [] };
  const registryIndex = new Map(adapters.map((adapter, index) => [adapter.id, index]));

  for (const adapter of adapters) {
    if (Object.prototype.hasOwnProperty.call(connected, adapter.id)) grouped.connected.push(adapter);
    else if (adapter.authType === 'manual' || adapter.authType === 'file-import') grouped.local.push(adapter);
    else if (adapter.hostConfiguredOnly || adapter.experimentalSelfHost || adapter.integrationKind === 'aggregator') grouped.self_host.push(adapter);
    else grouped.available.push(adapter);
  }

  grouped.connected.sort((a, b) => {
    const attention = Number(Boolean(needsAttention(b))) - Number(Boolean(needsAttention(a)));
    return attention || (registryIndex.get(a.id) ?? 0) - (registryIndex.get(b.id) ?? 0);
  });
  grouped.self_host.sort((a, b) => {
    const aRank = SELF_HOST_ADAPTER_ORDER[a.id] ?? Number.MAX_SAFE_INTEGER;
    const bRank = SELF_HOST_ADAPTER_ORDER[b.id] ?? Number.MAX_SAFE_INTEGER;
    return aRank - bRank || (registryIndex.get(a.id) ?? 0) - (registryIndex.get(b.id) ?? 0);
  });
  grouped.local.sort((a, b) => {
    const typeOrder = Number(a.authType === 'manual') - Number(b.authType === 'manual');
    return typeOrder || (registryIndex.get(a.id) ?? 0) - (registryIndex.get(b.id) ?? 0);
  });

  return Object.entries(grouped)
    .filter(([, items]) => items.length)
    .map(([id, items]) => ({ id, items, ...WEARABLE_GROUP_COPY[id] }));
}
