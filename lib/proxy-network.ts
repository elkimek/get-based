// Node-only proxy transport. Resolve each HTTPS hostname once, reject the
// entire answer set if any address is non-public, and pin the validated set
// into Undici's connection lookup so DNS cannot change between validation and
// the actual socket connection.

import { lookup as dnsLookup } from 'node:dns/promises';
import { Agent, fetch as undiciFetch } from 'undici';
import type { RequestInit as UndiciRequestInit } from 'undici';
import type { LookupFunction } from 'node:net';

export interface ProxyAddress { address: string; family: number }
type ProxyDnsRecord = { address?: unknown; family?: unknown } | null;
export type ProxyDnsResolver = (hostname: string, options: { all: true; verbatim: true }) =>
  Promise<ProxyDnsRecord | ProxyDnsRecord[]>;
type PinnedLookupCallback = (error: NodeJS.ErrnoException | null, address?: string | ProxyAddress[], family?: number) => void;
export type PinnedProxyLookup = (hostname: string, options: { family?: unknown; all?: unknown } | null | undefined,
  callback: PinnedLookupCallback) => void;
export interface ProxyDispatcher {
  close?: () => Promise<void> | undefined;
  destroy?: (error: Error) => Promise<void> | undefined;
}
export interface ProxyRequestOptions extends Omit<UndiciRequestInit, 'dispatcher' | 'headers' | 'body'> {
  headers?: Record<string, string> | undefined;
  body?: UndiciRequestInit['body'];
}
export type ProxyFetch = (url: string, options: ProxyRequestOptions & { dispatcher: ProxyDispatcher }) => Promise<Response>;
export interface ProxyDnsDependencies {
  lookup?: ProxyDnsResolver;
  fetch?: ProxyFetch;
  createDispatcher?: (lookup: PinnedProxyLookup) => ProxyDispatcher;
}

import { createErrorWithCode } from './error-utils.js';
import { isProxyHostBlocked } from './proxy-policy.js';

function proxyDnsError(message: string) {
  return createErrorWithCode('PROXY_DNS_BLOCKED', message);
}

export async function resolveProxyAddresses(hostname: string, lookup: ProxyDnsResolver = dnsLookup) {
  let resolved;
  try {
    resolved = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw proxyDnsError('Proxy hostname could not be resolved');
  }
  const records = Array.isArray(resolved) ? resolved : [resolved];
  if (records.length === 0) throw proxyDnsError('Proxy hostname did not resolve');

  const seen = new Set<string>();
  const addresses: ProxyAddress[] = [];
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

export function createPinnedProxyLookup(addresses: readonly ProxyAddress[]): PinnedProxyLookup {
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
    callback(null, candidates[0]!.address, candidates[0]!.family);
  };
}

function closeDispatcher(dispatcher: ProxyDispatcher, error: Error | null = null) {
  try {
    const closing = error ? dispatcher.destroy?.(error) : dispatcher.close?.();
    closing?.catch?.(() => {});
  } catch {}
}

function bindDispatcherLifetime(response: Response, dispatcher: ProxyDispatcher) {
  if (!response.body?.getReader) {
    closeDispatcher(dispatcher);
    return response;
  }
  const reader = response.body.getReader();
  let settled = false;
  const settle = (error: Error | null = null) => {
    if (settled) return;
    settled = true;
    closeDispatcher(dispatcher, error);
  };
  const body = new ReadableStream<Uint8Array>({
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

function resolveWithAbort(hostname: string, lookup: ProxyDnsResolver, signal: AbortSignal | null | undefined) {
  const resolution = resolveProxyAddresses(hostname, lookup);
  if (!signal) return resolution;
  if (signal.aborted) return Promise.reject(signal.reason || new DOMException('Aborted', 'AbortError'));
  return new Promise<ProxyAddress[]>((resolve, reject) => {
    const abort = () => reject(signal.reason || new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    resolution.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function fetchWithPinnedProxyDns(url: string, options: ProxyRequestOptions = {}, deps: ProxyDnsDependencies = {}) {
  const hostname = new URL(url).hostname;
  const addresses = await resolveWithAbort(hostname, deps.lookup || dnsLookup, options.signal);
  const pinnedLookup = createPinnedProxyLookup(addresses);
  const dispatcher = deps.createDispatcher
    ? deps.createDispatcher(pinnedLookup)
    : new Agent({ connect: { lookup: pinnedLookup as LookupFunction } });
  const fetchImpl = (deps.fetch || undiciFetch) as ProxyFetch;

  try {
    const response = await fetchImpl(url, { ...options, dispatcher });
    return bindDispatcherLifetime(response, dispatcher);
  } catch (error) {
    closeDispatcher(dispatcher, error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}
