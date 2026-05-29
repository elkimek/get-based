// api-transport.js - Shared AI API fetch retry and stream timeout helpers

import { isDebugMode } from './utils.js';

// Mid-stream stall timeout. Streaming SSE / NDJSON readers can hang
// indefinitely on `reader.read()` if the network drops between chunks
// (airplane-mode toggle, lost cell signal, server crash without close).
// Wrap each read in this helper so the loop fails loud after 30 s of
// silence instead of leaving the chat message stuck in "typing..." forever.
// Cancels the reader on timeout so the connection releases.
export const STREAM_STALL_TIMEOUT_MS = 30000;
export function readWithStallTimeout(reader, label = 'AI stream') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try { reader.cancel(); } catch (e) {}
      reject(new Error(`${label} stalled — no data for ${Math.round(STREAM_STALL_TIMEOUT_MS / 1000)}s. Check your connection, tap Stop in the chat header, then try again.`));
    }, STREAM_STALL_TIMEOUT_MS);
    reader.read().then(
      (result) => { clearTimeout(timer); resolve(result); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// Initial-response timeout for AI API calls. Browsers without explicit
// timeouts can hang for minutes on a stalled connection (airplane mode,
// dropped cell signal, server unresponsive) before the OS TCP layer
// gives up. 60s is generous for slow models (long prompts still respond
// within ~10s) but short enough to surface offline state quickly.
export const FETCH_REQUEST_TIMEOUT_MS = 60000;
export const AI_IMPORT_REQUEST_TIMEOUT_MS = 180000;

export function createProxyFetch(shouldUseProxy) {
  return function proxyFetch(url, options) {
    if (!shouldUseProxy()) return fetch(url, options);
    // Extract headers (minus Content-Type which the proxy sets) and body.
    const { 'Content-Type': _ct, ...fwdHeaders } = options.headers || {};
    const proxyBody = {
      url,
      headers: fwdHeaders,
      body: options.body, // already JSON string
    };
    return fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proxyBody),
      signal: options.signal,
    });
  };
}

function buildFetchOptions(options, requestTimeoutMs) {
  const timeoutMs = Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0 ? requestTimeoutMs : FETCH_REQUEST_TIMEOUT_MS;
  const timeoutSig = AbortSignal.timeout(timeoutMs);
  let signal;
  if (!options.signal) {
    signal = timeoutSig;
  } else if (typeof AbortSignal.any === 'function') {
    signal = AbortSignal.any([options.signal, timeoutSig]);
  } else {
    // Manual polyfill for browsers without AbortSignal.any (Safari
    // <17.4, etc.). Without this the request timeout would silently
    // disappear when the caller passed their own signal - exactly
    // the "hang on flaky network" regression this code is meant to
    // prevent. Don't trust the .any check alone.
    const ctl = new AbortController();
    const fwd = (sig) => sig.addEventListener('abort', () => ctl.abort(sig.reason), { once: true });
    if (options.signal.aborted) ctl.abort(options.signal.reason);
    else fwd(options.signal);
    if (timeoutSig.aborted) ctl.abort(timeoutSig.reason);
    else fwd(timeoutSig);
    signal = ctl.signal;
  }
  return { ...options, signal };
}

export async function fetchWithRetry(
  url,
  options,
  {
    retries = 2,
    useProxy = true,
    requestTimeoutMs = FETCH_REQUEST_TIMEOUT_MS,
    proxyFetch = fetch,
    directFetch = fetch,
    debug = isDebugMode,
  } = {},
) {
  const fetchFn = useProxy ? proxyFetch : directFetch;
  for (let i = 0; i <= retries; i++) {
    let res;
    try {
      res = await fetchFn(url, buildFetchOptions(options, requestTimeoutMs));
    } catch (e) {
      // User-initiated abort - surface immediately without retry.
      if (options.signal?.aborted) throw e;
      // Transient network errors: TypeError ("Failed to fetch") from a
      // dropped connection, or timeout abort from FETCH_REQUEST_TIMEOUT_MS.
      // Retry with backoff before giving up - matches the airplane-mode
      // toggle pattern where one attempt fails but the next succeeds.
      const isTimeout = e?.name === 'TimeoutError' || (e?.name === 'AbortError' && !options.signal?.aborted);
      const isNetwork = e instanceof TypeError || /Failed to fetch|Load failed|NetworkError/.test(e?.message || '');
      if ((isTimeout || isNetwork) && i < retries) {
        const delay = (i + 1) * 1500; // 1.5s, 3s
        if (debug()) console.log(`[API] Network error ${e?.name || e?.message}, retry ${i + 1}/${retries} in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      if (isTimeout) {
        const timeoutMs = Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0 ? requestTimeoutMs : FETCH_REQUEST_TIMEOUT_MS;
        throw new Error(`request timed out after ${Math.round(timeoutMs / 1000)}s — check your network`);
      }
      throw e;
    }
    if (res.status !== 429 || i === retries) return res;
    const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
    const delay = Math.max(retryAfter * 1000, (i + 1) * 5000);
    if (debug()) console.log(`[API] Rate limited, retry ${i + 1}/${retries} in ${delay / 1000}s`);
    if (options.signal?.aborted) return res;
    await new Promise(r => setTimeout(r, delay));
  }
}
