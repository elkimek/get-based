// Stable ordering for duplicate physical rows representing one logical sync item.
// Client millisecond clocks can tie; neither query order nor locale is a version.
export function syncValueKey(value: unknown): string {
  const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical);
    if (!v || typeof v !== 'object') return v;
    return Object.fromEntries(Object.keys(v).sort().map(key => [key, canonical((v as Record<string, unknown>)[key])]));
  };
  return JSON.stringify(canonical(value)) ?? '';
}
interface ConflictRow {syncedAt?: unknown; isDeleted?: unknown; id?: unknown; payload?: unknown; dataJson?: unknown}
export function compareSyncRows(a: ConflictRow, b: ConflictRow): number {
  const clock = (v: unknown) => Date.parse(typeof v === 'string' ? v : '') || 0;
  const time = clock(a.syncedAt) - clock(b.syncedAt);
  if (time) return time;
  const deleted = Number(!!a.isDeleted) - Number(!!b.isDeleted);
  if (deleted) return deleted;
  const left = String(a.id ?? ''), right = String(b.id ?? '');
  if (left !== right) return left > right ? 1 : -1;
  const av = syncValueKey(a.payload ?? a.dataJson), bv = syncValueKey(b.payload ?? b.dataJson);
  return av > bv ? 1 : av < bv ? -1 : 0;
}

/** A new application version must sort after all versions this planner saw,
 * even when the device wall clock moved backwards. */
export function nextSyncRowTime(rows: readonly {syncedAt?: unknown}[]): string {
  let clock = Date.now();
  for (const row of rows) {
    const seen = Date.parse(typeof row.syncedAt === 'string' ? row.syncedAt : '');
    if (Number.isFinite(seen)) clock = Math.max(clock, seen + 1);
  }
  return new Date(clock).toISOString();
}
