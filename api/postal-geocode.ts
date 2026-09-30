import type { ProxyRelayRequest } from '../lib/proxy-policy.js';
import type { ProxyRequestOptions } from '../lib/proxy-network.js';


import { fetchWithValidatedRedirects, readResponseTextWithCap } from '../lib/proxy-upstream.js';

export interface PostalGeocodeResult {
  latitude: number; longitude: number; accuracyKm: number; timezone: null;
  label: string; source: 'postal-area'; resolvedAt: number; attribution: string;
}
interface NominatimRow {
  address?: { postcode?: unknown } | null;
  name?: unknown; lat?: unknown; lon?: unknown; display_name?: unknown;
}
export interface PostalGeocodeHelpers {
  corsHeaders: (req: ProxyRelayRequest) => Record<string, string>;
  proxyUpstreamErrorResponse: (req: ProxyRelayRequest, error: unknown, fallback: string) => Response;
}

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_MAX = 512;
const DEFAULT_QUEUE_MAX = 8;
const cache = new Map<string, { cachedAt: number; value: PostalGeocodeResult }>();
let requestQueue: Promise<void> = Promise.resolve();
let lastRequestStartedAt = 0;
let queuedRequests = 0;

class PostalQueueFullError extends Error {}

function postalAbortReason(signal: AbortSignal | undefined) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException('Postal lookup aborted', 'AbortError');
}

function waitForPostalThrottle(waitMs: number, signal: AbortSignal | undefined): Promise<void> {
  if (!waitMs) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(postalAbortReason(signal));
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, waitMs);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      reject(postalAbortReason(signal));
    };
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

function settlePostalRequestForCaller<T>(pending: Promise<T>, signal: AbortSignal | undefined, releaseSlot: () => void) {
  if (!signal?.addEventListener) return pending.finally(releaseSlot);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = <V>(callback: (value: V) => void, value: V) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      releaseSlot();
      callback(value);
    };
    const onAbort = () => finish(reject, postalAbortReason(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    pending.then(
      value => finish(resolve, value),
      error => finish(reject, error),
    );
  });
}

function postalQueueMax() {
  const configured = Number.parseInt(process.env.PROXY_POSTAL_QUEUE_MAX || '', 10);
  return Number.isFinite(configured) && configured >= 1 && configured <= 64
    ? configured
    : DEFAULT_QUEUE_MAX;
}

function fetchPostalGeocodeUpstream(url: string, options: ProxyRequestOptions, signal: AbortSignal | undefined) {
  if (signal?.aborted) throw postalAbortReason(signal);
  if (queuedRequests >= postalQueueMax()) {
    throw new PostalQueueFullError('Postal lookup queue is full');
  }
  queuedRequests++;
  let slotReleased = false;
  const releaseSlot = () => {
    if (slotReleased) return;
    slotReleased = true;
    queuedRequests--;
  };
  const run = async () => {
    if (signal?.aborted) throw postalAbortReason(signal);
    const waitMs = Math.max(0, 1100 - (Date.now() - lastRequestStartedAt));
    await waitForPostalThrottle(waitMs, signal);
    if (signal?.aborted) throw postalAbortReason(signal);
    lastRequestStartedAt = Date.now();
    return fetchWithValidatedRedirects(url, options, { signal });
  };
  const pending = requestQueue.then(run, run);
  requestQueue = pending.then(() => undefined, () => undefined);
  return settlePostalRequestForCaller(pending, signal, releaseSlot);
}

export async function handlePostalGeocode(
  payload: Record<string, unknown>, req: ProxyRelayRequest, helpers: PostalGeocodeHelpers,
) {
  const country = typeof payload.country === 'string' ? payload.country.trim() : '';
  const postalCode = typeof payload.postalCode === 'string' ? payload.postalCode.trim() : '';
  const responseHeaders = () => ({ ...helpers.corsHeaders(req), 'Content-Type': 'application/json' });
  if (!country || !postalCode || country.length > 80 || postalCode.length > 24) {
    return new Response(JSON.stringify({ error: 'Invalid country/postal code' }), { status: 400, headers: responseHeaders() });
  }
  if (!/^[\p{L}\p{N} .-]+$/u.test(postalCode)) {
    return new Response(JSON.stringify({ error: 'Invalid postal code characters' }), { status: 400, headers: responseHeaders() });
  }
  const cacheKey = `${country}|${postalCode}`.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt <= CACHE_TTL_MS) {
    return new Response(JSON.stringify(cached.value), {
      status: 200,
      headers: { ...responseHeaders(), 'Cache-Control': 'no-store' },
    });
  }
  const query = new URLSearchParams({ country, postalcode: postalCode, format: 'jsonv2', limit: '3', addressdetails: '1' });
  const url = `https://nominatim.openstreetmap.org/search?${query.toString()}`;
  try {
    const upstream = await fetchPostalGeocodeUpstream(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'getbased-health-location-proxy/1.0 (+https://getbased.health)' },
    }, req.signal);
    const text = await readResponseTextWithCap(upstream, 64 * 1024);
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: 'Location lookup unavailable' }), { status: upstream.status, headers: responseHeaders() });
    }
    const results: unknown = JSON.parse(text);
    const rows: (NominatimRow | null)[] = Array.isArray(results) ? results : [];
    const normalizedPostal = postalCode.replace(/\s+/g, '').toLowerCase();
    const match = rows.find(item => String(item?.address?.postcode || item?.name || '').replace(/\s+/g, '').toLowerCase() === normalizedPostal) || rows[0];
    const latitude = Number(match?.lat);
    const longitude = Number(match?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return new Response(JSON.stringify({ error: 'Location not found' }), { status: 404, headers: responseHeaders() });
    }
    const value: PostalGeocodeResult = {
      latitude: Math.round(latitude * 10) / 10,
      longitude: Math.round(longitude * 10) / 10,
      accuracyKm: 11,
      timezone: null,
      label: typeof match!.display_name === 'string' ? match!.display_name : `${postalCode}, ${country}`,
      source: 'postal-area',
      resolvedAt: Date.now(),
      attribution: '© OpenStreetMap contributors',
    };
    cache.set(cacheKey, { cachedAt: Date.now(), value });
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
    return new Response(JSON.stringify(value), { status: 200, headers: { ...responseHeaders(), 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof PostalQueueFullError) {
      return new Response(JSON.stringify({ error: 'Location lookup busy. Try again shortly.' }), {
        status: 503,
        headers: { ...responseHeaders(), 'Retry-After': '10' },
      });
    }
    return helpers.proxyUpstreamErrorResponse(req, error, 'Location lookup unavailable');
  }
}
