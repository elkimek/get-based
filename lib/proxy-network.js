// @ts-check
// Node-only proxy transport. Resolve each HTTPS hostname once, reject the
// entire answer set if any address is non-public, and pin the validated set
// into Undici's connection lookup so DNS cannot change between validation and
// the actual socket connection.

import { lookup as dnsLookup } from 'node:dns/promises';

import { createErrorWithCode } from './error-utils.js';
import { isProxyHostBlocked } from './proxy-policy.js';

/** @type {Promise<typeof import('undici')> | null} */
let undiciModulePromise = null;

// Keep the transport out of the proxy's module-initialization path. Lightweight
// OPTIONS and method-rejection responses must not depend on a Node networking
// package loading successfully. The package itself is pinned to the exact
// 7.28.0 artifact proven by the last healthy Node 24 production deployment.
function loadUndiciTransport() {
  undiciModulePromise ||= import('undici');
  return undiciModulePromise;
}

function proxyDnsError(message) {
  return createErrorWithCode('PROXY_DNS_BLOCKED', message);
}

/**
 * @param {string} hostname
 * @param {typeof dnsLookup} [lookup]
 */
export async function resolveProxyAddresses(hostname, lookup = dnsLookup) {
  let resolved;
  try {
    resolved = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw proxyDnsError('Proxy hostname could not be resolved');
  }
  const records = Array.isArray(resolved) ? resolved : [resolved];
  if (records.length === 0) throw proxyDnsError('Proxy hostname did not resolve');

  const seen = new Set();
  const addresses = [];
  for (const record of records) {
    const address = String(record?.address || '').trim();
    const family = Number(record?.family) === 6 ? 6 : 4;
    if (!address || isProxyHostBlocked(address)) {
      throw proxyDnsError('Proxy hostname resolved to a blocked address');
    }
    const key = `${family}:${address}`;
    if (seen.has(key)) continue;
    seen.add(key);
    addresses.push({ address, family });
  }
  if (addresses.length === 0) throw proxyDnsError('Proxy hostname did not resolve');
  return addresses;
}

/**
 * @param {Array<{ address: string, family: number }>} addresses
 */
export function createPinnedProxyLookup(addresses) {
  return (_hostname, options, callback) => {
    const requestedFamily = Number(options?.family) || 0;
    const candidates = requestedFamily
      ? addresses.filter(record => record.family === requestedFamily)
      : addresses;
    if (candidates.length === 0) {
      const error = createErrorWithCode('EAI_ADDRFAMILY', 'No validated address for requested family');
      callback(error);
      return;
    }
    if (options?.all) {
      callback(null, candidates.map(record => ({ ...record })));
      return;
    }
    callback(null, candidates[0].address, candidates[0].family);
  };
}

function closeDispatcher(dispatcher, error = null) {
  try {
    const closing = error ? dispatcher.destroy?.(error) : dispatcher.close?.();
    closing?.catch?.(() => {});
  } catch {}
}

function bindDispatcherLifetime(response, dispatcher) {
  if (!response.body?.getReader) {
    closeDispatcher(dispatcher);
    return response;
  }
  const reader = response.body.getReader();
  let settled = false;
  const settle = (error = null) => {
    if (settled) return;
    settled = true;
    closeDispatcher(dispatcher, error);
  };
  const body = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          settle();
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        settle(error instanceof Error ? error : new Error(String(error)));
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        settle(reason instanceof Error ? reason : new Error('Proxy response cancelled'));
      }
    },
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function resolveWithAbort(hostname, lookup, signal) {
  const resolution = resolveProxyAddresses(hostname, lookup);
  if (!signal) return resolution;
  if (signal.aborted) return Promise.reject(signal.reason || new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    resolution.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/**
 * Fetch an HTTPS URL through a dispatcher whose socket lookup is pinned to a
 * DNS answer set that has already passed the proxy's private-address policy.
 * The dependency overrides keep the transport unit-testable without network
 * access; production callers use the defaults.
 *
 * @param {string} url
 * @param {Record<string, any>} [options]
 * @param {{
 *   lookup?: typeof dnsLookup,
 *   fetch?: Function,
 *   createDispatcher?: (lookup: Function) => any,
 * }} [deps]
 */
export async function fetchWithPinnedProxyDns(url, options = {}, deps = {}) {
  const hostname = new URL(url).hostname;
  const addresses = await resolveWithAbort(hostname, deps.lookup || dnsLookup, options.signal);
  const pinnedLookup = createPinnedProxyLookup(addresses);
  const transport = !deps.fetch || !deps.createDispatcher
    ? await loadUndiciTransport()
    : null;
  const dispatcher = deps.createDispatcher
    ? deps.createDispatcher(pinnedLookup)
    : new transport.Agent({ connect: { lookup: pinnedLookup } });
  const fetchImpl = deps.fetch || transport.fetch;

  try {
    const response = await fetchImpl(url, { ...options, dispatcher });
    return bindDispatcherLifetime(response, dispatcher);
  } catch (error) {
    closeDispatcher(dispatcher, error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}
