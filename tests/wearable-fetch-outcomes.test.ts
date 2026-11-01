import { afterEach, expect, it, vi } from 'vitest';
import { createWearableFetchScope } from '../js/wearable-fetch-scope.js';
import { fetchOuraDailyRange } from '../js/wearables-oura.js';
import { fetchWhoopDailyRange } from '../js/wearables-whoop.js';
import { fetchWithingsDailyRange } from '../js/wearables-withings.js';
import { fetchFitbitDailyRange } from '../js/wearables-fitbit.js';
import { fetchUltrahumanDailyRange } from '../js/wearables-ultrahuman.js';
import { fetchGoogleHealthDailyRange } from '../js/wearables-google-health.js';
import { fetchPolarDailyRange } from '../js/wearables-polar.js';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const args = ['SYNTHETIC_FETCH_TOKEN', '2026-10-28', '2026-10-29'] as const;
const adapters = [
  ['Oura', () => fetchOuraDailyRange(...args)], ['WHOOP', () => fetchWhoopDailyRange(...args)],
  ['Withings', () => fetchWithingsDailyRange(...args)], ['Fitbit', () => fetchFitbitDailyRange(...args)],
  ['Ultrahuman', () => fetchUltrahumanDailyRange(...args)], ['Google Health', () => fetchGoogleHealthDailyRange(...args)],
  ['Polar', () => fetchPolarDailyRange(...args, { userId: 'synthetic-polar' })],
] as const;
it.each(adapters)('%s never treats an entirely failed HTTP batch as successful empty readings', async (_name, fetchRows) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"Synthetic unavailable source"}', { status: 503, headers: { 'Content-Type': 'application/json' } })));
  await expect(fetchRows()).rejects.toMatchObject({ status: 503 });
});
it('retains successful empty data when another optional metric family fails', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
    const { url } = JSON.parse(String(init.body));
    return new Response(JSON.stringify(url.includes('/recovery?') ? { error: 'rate_limited' } : { records: [] }), { status: url.includes('/recovery?') ? 429 : 200, headers: { 'Content-Type': 'application/json' } });
  }));
  expect(await fetchWhoopDailyRange(...args)).toEqual([]);
});
it('keeps authentication failure actionable and waits for all requested families', async () => {
  const scope = createWearableFetchScope(), failed = vi.fn();
  await Promise.all([scope.run(Promise.reject(Object.assign(new Error('Unavailable'), { status: 503 })), [], failed), scope.run(Promise.reject(Object.assign(new Error('Expired'), { status: 401 })), [], failed)]);
  expect(() => scope.assertSuccessful()).toThrow('Expired'); expect(failed).toHaveBeenCalledTimes(2);
});
it('recognizes a successful empty response as success rather than missing data', async () => {
  const scope = createWearableFetchScope(); expect(await scope.run(Promise.resolve([]), [], vi.fn())).toEqual([]); expect(() => scope.assertSuccessful()).not.toThrow();
});
it.each(['activity', 'exercise'] as const)('does not consume a Polar %s transaction when one listed record could not be read', async kind => {
  vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
    const { url, method } = JSON.parse(String(init.body));
    if (url.endsWith('/' + kind + '-transactions') && method === 'POST') return new Response(JSON.stringify({ 'transaction-id': 'pending-a', [kind === 'activity' ? 'activity-log' : 'exercises']: ['https://www.polaraccesslink.com/activity/good', 'https://www.polaraccesslink.com/activity/unavailable'] }), { status: 200 });
    if (url.endsWith('/activity/good')) return new Response(JSON.stringify(kind === 'activity' ? { date: '2026-10-28', 'active-steps': 80 } : { 'start-time': '2026-10-28T12:00:00Z', 'heart-rate': { average: 80 } }), { status: 200 });
    if (url.endsWith('/activity/unavailable')) return new Response('{"error":"Synthetic temporarily unavailable record"}', { status: 503 });
    return new Response(null, { status: 204 });
  }));
  const rows = await fetchPolarDailyRange(...args, { userId: 'synthetic-polar' });
  expect(rows).toContainEqual(expect.objectContaining({ date: '2026-10-28', [kind === 'activity' ? 'steps' : 'hr_day']: 80 }));
  expect(rows._polarTransactions).toEqual([]);
});
