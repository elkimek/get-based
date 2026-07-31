// @ts-check
// Shared upstream lifecycle for every server-side proxy branch. Redirect
// validation, DNS pinning, cancellation, timeouts, and byte caps belong here
// so secret-bearing relays cannot accidentally bypass the generic safeguards.

import { fetchWithPinnedProxyDns } from './proxy-network.js';
import { createErrorWithCode } from './error-utils.js';
import { isAllowedProxyUrl } from './proxy-policy.js';

const PROXY_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const PROXY_MAX_REDIRECTS = 5;
const DEFAULT_PROXY_UPSTREAM_TIMEOUT_MS = 180_000;

export const PROXY_MAX_CREDENTIAL_RESPONSE_BYTES = 256 * 1024;

function readBoundedEnvInteger(name, fallback, min, max) {
  const raw = typeof process !== 'undefined' ? process.env?.[name] : undefined;
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

function proxyRuntimeError(code, message) {
  return createErrorWithCode(code, message);
}

function requestTooLargeError() {
  return proxyRuntimeError('PROXY_REQUEST_TOO_LARGE', 'Proxy request body too large');
}

function responseTooLargeError() {
  return proxyRuntimeError('PROXY_RESPONSE_TOO_LARGE', 'Proxy response exceeds size cap');
}

function redirectRequestOptions(status, options) {
  const method = String(options.method || 'GET').toUpperCase();
  if (status !== 303 && !((status === 301 || status === 302) && method === 'POST')) {
    return options;
  }
  const headers = { ...(options.headers || {}) };
  for (const name of Object.keys(headers)) {
    if (['content-length', 'content-type'].includes(name.toLowerCase())) delete headers[name];
  }
  return { ...options, method: 'GET', headers, body: undefined };
}

function stripProxyCredentialHeaders(options) {
  const headers = { ...(options.headers || {}) };
  for (const name of Object.keys(headers)) {
    if (['api-key', 'authorization', 'x-api-key', 'xi-api-key'].includes(name.toLowerCase())) {
      delete headers[name];
    }
  }
  return { ...options, headers };
}

async function discardResponseBody(response) {
  try {
    await response.body?.cancel?.();
  } catch {}
}

function createUpstreamLifecycle(externalSignal) {
  const timeoutMs = readBoundedEnvInteger(
    'PROXY_UPSTREAM_TIMEOUT_MS',
    DEFAULT_PROXY_UPSTREAM_TIMEOUT_MS,
    10,
    180_000,
  );
  const controller = new AbortController();
  let timedOut = false;
  let settled = false;
  const abortFromCaller = () => {
    controller.abort(externalSignal?.reason || proxyRuntimeError(
      'PROXY_CLIENT_ABORTED',
      'Proxy client disconnected',
    ));
  };
  if (externalSignal?.aborted) abortFromCaller();
  else externalSignal?.addEventListener?.('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(proxyRuntimeError('PROXY_UPSTREAM_TIMEOUT', 'Proxy upstream timed out'));
  }, timeoutMs);

  return {
    signal: controller.signal,
    mapError(error) {
      if (timedOut) {
        return proxyRuntimeError('PROXY_UPSTREAM_TIMEOUT', 'Proxy upstream timed out');
      }
      if (externalSignal?.aborted) {
        return proxyRuntimeError('PROXY_CLIENT_ABORTED', 'Proxy client disconnected');
      }
      return error;
    },
    settle() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      externalSignal?.removeEventListener?.('abort', abortFromCaller);
    },
    abort(reason) {
      if (!controller.signal.aborted) controller.abort(reason);
    },
  };
}

function bindResponseLifecycle(response, lifecycle) {
  if (!response.body?.getReader || typeof ReadableStream !== 'function') {
    lifecycle.settle();
    return response;
  }
  const reader = response.body.getReader();
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    lifecycle.settle();
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
        const mapped = lifecycle.mapError(error);
        settle();
        controller.error(mapped);
      }
    },
    async cancel(reason) {
      lifecycle.abort(reason instanceof Error ? reason : new Error('Proxy response cancelled'));
      try {
        await reader.cancel(reason);
      } finally {
        settle();
      }
    },
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

// Fetch redirects manually so every destination passes the same SSRF policy.
// Credentialed/body-bearing cross-origin redirects are constrained so API
// secrets and request payloads never migrate to a new host. Safe GET redirects
// remain supported for ordinary product pages that canonicalize to `www`.
export async function fetchWithValidatedRedirects(initialUrl, initialOptions = {}, {
  signal: externalSignal,
} = /** @type {{ signal?: AbortSignal }} */ ({})) {
  const lifecycle = createUpstreamLifecycle(externalSignal);
  let url = '';
  let options = { ...initialOptions };
  let redirects = 0;

  try {
    url = new URL(initialUrl).toString();
    while (true) {
      if (!isAllowedProxyUrl(url)) {
        throw proxyRuntimeError('PROXY_REDIRECT_BLOCKED', 'Proxy redirect target not allowed');
      }
      const response = await fetchWithPinnedProxyDns(url, {
        ...options,
        redirect: 'manual',
        signal: lifecycle.signal,
      });

      if (!PROXY_REDIRECT_STATUSES.has(response.status)) {
        return bindResponseLifecycle(response, lifecycle);
      }
      const location = response.headers.get('location');
      if (!location) return bindResponseLifecycle(response, lifecycle);
      if (redirects >= PROXY_MAX_REDIRECTS) {
        await discardResponseBody(response);
        throw proxyRuntimeError('PROXY_REDIRECT_LIMIT', 'Proxy redirect limit exceeded');
      }

      let nextUrl;
      try {
        nextUrl = new URL(location, url).toString();
      } catch {
        await discardResponseBody(response);
        throw proxyRuntimeError('PROXY_REDIRECT_BLOCKED', 'Proxy redirect target not allowed');
      }
      if (!isAllowedProxyUrl(nextUrl)) {
        await discardResponseBody(response);
        throw proxyRuntimeError('PROXY_REDIRECT_BLOCKED', 'Proxy redirect target not allowed');
      }
      let nextOptions = redirectRequestOptions(response.status, options);
      if (new URL(nextUrl).origin !== new URL(url).origin && nextOptions.body != null) {
        await discardResponseBody(response);
        throw proxyRuntimeError(
          'PROXY_CROSS_ORIGIN_BODY_REDIRECT',
          'Cross-origin proxy redirects with a request body are not allowed',
        );
      }
      if (new URL(nextUrl).origin !== new URL(url).origin) {
        nextOptions = stripProxyCredentialHeaders(nextOptions);
      }

      await discardResponseBody(response);
      options = nextOptions;
      url = nextUrl;
      redirects++;
    }
  } catch (error) {
    lifecycle.settle();
    throw lifecycle.mapError(error);
  }
}

export async function readRequestTextWithCap(request, maxBytes) {
  const contentLength = Number.parseInt(request.headers.get('content-length') || '0', 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    try {
      await request.body?.cancel?.();
    } catch {}
    throw requestTooLargeError();
  }
  const reader = request.body?.getReader?.();
  if (!reader) {
    const body = await request.text();
    if (new TextEncoder().encode(body).length > maxBytes) throw requestTooLargeError();
    return body;
  }

  const decoder = new TextDecoder();
  let body = '';
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value?.byteLength || 0;
    if (bytes > maxBytes) {
      try {
        await reader.cancel();
      } catch {}
      throw requestTooLargeError();
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

export async function readResponseTextWithCap(response, maxBytes) {
  const contentLength = Number.parseInt(response.headers.get('content-length') || '0', 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await discardResponseBody(response);
    throw responseTooLargeError();
  }
  const reader = response.body?.getReader?.();
  if (!reader) {
    const body = await response.text();
    if (new TextEncoder().encode(body).length > maxBytes) throw responseTooLargeError();
    return body;
  }

  const decoder = new TextDecoder();
  let body = '';
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value?.byteLength || 0;
    if (bytes > maxBytes) {
      try {
        await reader.cancel();
      } catch {}
      throw responseTooLargeError();
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

export function capReadableStream(body, maxBytes) {
  if (!body?.getReader || typeof ReadableStream !== 'function') return body;
  const reader = body.getReader();
  let bytes = 0;
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        bytes += value?.byteLength || 0;
        if (bytes > maxBytes) {
          try {
            await reader.cancel();
          } catch {}
          controller.error(responseTooLargeError());
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
