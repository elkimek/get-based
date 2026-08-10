// @ts-check

import { errorCode } from './error-utils.js';
import { isAllowedProxyUrl, PROXY_MAX_RESPONSE_BYTES } from './proxy-policy.js';
import {
  fetchWithValidatedRedirects,
  readResponseTextWithCap,
} from './proxy-upstream.js';

export function handleDevFetchPage(req, res, target, options) {
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
