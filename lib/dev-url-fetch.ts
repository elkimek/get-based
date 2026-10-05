import type { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import { errorCode } from './error-utils.js';
import { isAllowedProxyUrl, PROXY_MAX_RESPONSE_BYTES } from './proxy-policy.js';
import {
  fetchWithValidatedRedirects,
  readResponseTextWithCap,
  capReadableStream,
} from './proxy-upstream.js';

type DevPageRequest = Pick<EventEmitter, 'once' | 'removeListener'>;
interface DevPageResponse extends DevPageRequest {
  headersSent: boolean;
  destroyed: boolean;
  writeHead: (status: number, headers: Record<string, string>) => unknown;
  end: (body?: string | Uint8Array) => unknown;
}

export function handleDevFetchPage<RequestSource extends DevPageRequest>(
  req: RequestSource,
  res: DevPageResponse,
  target: unknown,
  options: { corsHeaders: (req: RequestSource) => Record<string, string> },
) {
  const corsHeaders = options.corsHeaders;
  if (!isAllowedProxyUrl(target)) {
    res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders(req) });
    res.end(JSON.stringify({ status: 0, error: 'URL blocked by SSRF guard' }));
    return;
  }

  const controller = new AbortController();
  const abort = () => controller.abort(new Error('Client disconnected'));
  req.once('aborted', abort);
  res.once('close', abort);

  void (async () => {
    try {
      const pageResponse = await fetchWithValidatedRedirects(target, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'cs,sk,en;q=0.5',
        },
      }, { signal: controller.signal });
      // Keep local product-page imports aligned with the hosted proxy. Modern
      // storefront HTML commonly exceeds 256 KB even when the useful label
      // facts are small; the previous dev-only cap made valid URLs look
      // unfetchable while the same URL worked after deployment.
      const html = await readResponseTextWithCap(pageResponse, PROXY_MAX_RESPONSE_BYTES);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...corsHeaders(req),
      });
      res.end(JSON.stringify({ status: pageResponse.status, html }));
    } catch (error) {
      if (res.headersSent || res.destroyed) return;
      const message = errorCode(error) === 'PROXY_RESPONSE_TOO_LARGE'
        ? 'Page response exceeds size cap'
        : 'Page fetch failed';
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...corsHeaders(req),
      });
      res.end(JSON.stringify({ status: 0, error: message }));
    } finally {
      req.removeListener('aborted', abort);
      res.removeListener('close', abort);
    }
  })();
}

// Local HEAD checks and legacy binary fetches use the same DNS-pinned transport
// as page imports. A syntactically public hostname can resolve to a private IP.
export function handleDevCheckUrl<RequestSource extends DevPageRequest>(
  req: RequestSource, res: DevPageResponse, target: string,
  options: { corsHeaders: (req: RequestSource) => Record<string, string> },
) {
  if (!isAllowedProxyUrl(target)) {
    res.writeHead(400, { 'Content-Type': 'application/json', ...options.corsHeaders(req) });
    res.end(JSON.stringify({ status: 0, error: 'URL blocked by SSRF guard' }));
    return;
  }
  const controller = new AbortController();
  const abort = () => controller.abort(new Error('Client disconnected'));
  req.once('aborted', abort); res.once('close', abort);
  const timeout = setTimeout(() => controller.abort(new Error('URL check timed out')), 6000);
  void (async () => {
    try {
      const upstream = await fetchWithValidatedRedirects(target, { method: 'HEAD' }, {
        signal: controller.signal, maxRedirects: 1,
      });
      await upstream.body?.cancel?.();
      if (controller.signal.aborted || res.destroyed) return;
      const redirected = upstream.url && upstream.url !== new URL(target).href ? upstream.url : undefined;
      res.writeHead(200, { 'Content-Type': 'application/json', ...options.corsHeaders(req) });
      res.end(JSON.stringify({ status: upstream.status, ...(redirected ? { redirected } : {}) }));
    } catch {
      if (res.headersSent || res.destroyed) return;
      res.writeHead(200, { 'Content-Type': 'application/json', ...options.corsHeaders(req) });
      res.end(JSON.stringify({ status: 0, error: 'URL check failed' }));
    } finally {
      clearTimeout(timeout); req.removeListener('aborted', abort); res.removeListener('close', abort);
    }
  })();
}

export function handleDevRawProxy<RequestSource extends DevPageRequest>(
  req: RequestSource, res: DevPageResponse & NodeJS.WritableStream & { destroy: () => unknown }, target: string,
  options: { corsHeaders: (req: RequestSource) => Record<string, string> },
) {
  if (!isAllowedProxyUrl(target)) {
    res.writeHead(400, options.corsHeaders(req)); res.end('URL blocked by SSRF guard'); return;
  }
  const controller = new AbortController();
  const abort = () => controller.abort(new Error('Client disconnected'));
  req.once('aborted', abort); res.once('close', abort);
  void (async () => {
    try {
      const upstream = await fetchWithValidatedRedirects(target, {
        method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' },
      }, { signal: controller.signal, maxRedirects: 1 });
      if (controller.signal.aborted || res.destroyed) { await upstream.body?.cancel(); return; }
      const body = capReadableStream(upstream.body, PROXY_MAX_RESPONSE_BYTES);
      res.writeHead(upstream.status, {
        'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream', ...options.corsHeaders(req),
      });
      if (!body) { res.end(); return; }
      await pipeline(Readable.fromWeb(body as NodeReadableStream<Uint8Array>), res, { signal: controller.signal });
    } catch (error) {
      if (res.destroyed) return;
      if (res.headersSent) { res.destroy(); return; }
      const blocked = ['PROXY_REDIRECT_BLOCKED', 'PROXY_DNS_BLOCKED'].includes(errorCode(error));
      res.writeHead(blocked ? 400 : 502, options.corsHeaders(req));
      res.end(blocked ? 'URL blocked by SSRF guard' : 'Proxy request failed');
    } finally { req.removeListener('aborted', abort); res.removeListener('close', abort); }
  })();
}
