// @ts-check
// Node HTTP bridge for the Web-standard /api/voice handler used in production.

import { Readable } from 'node:stream';

import { handler as voiceHandler } from './voice-relay-handler.js';

function requestHeaders(nodeHeaders = {}) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(nodeHeaders)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, String(value));
    }
  }
  return headers;
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ handler?: (request: Request) => Promise<Response> }} [options]
 */
export function handleDevVoiceRelay(req, res, options = {}) {
  const handler = options.handler || voiceHandler;
  const host = String(req.headers.host || '127.0.0.1:8000');
  const protocol = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim() || 'http';
  const url = new URL(req.url || '/api/voice', `${protocol}://${host}`);
  const controller = new AbortController();
  const abortClientRequest = () => {
    if (!controller.signal.aborted) {
      controller.abort(new DOMException('Client disconnected', 'AbortError'));
    }
    removeClientListeners();
  };
  const removeClientListeners = () => {
    req.removeListener('aborted', abortClientRequest);
    res.removeListener('close', abortClientRequest);
    res.removeListener('finish', removeClientListeners);
  };
  req.once('aborted', abortClientRequest);
  res.once('close', abortClientRequest);
  res.once('finish', removeClientListeners);
  /** @type {RequestInit & { duplex?: string }} */
  const init = {
    method: req.method || 'GET',
    headers: requestHeaders(req.headers),
    signal: controller.signal,
  };
  if (init.method !== 'GET' && init.method !== 'HEAD') {
    init.body = /** @type {any} */ (Readable.toWeb(req));
    init.duplex = 'half';
  }

  Promise.resolve(handler(new Request(url, init))).then(response => {
    if (controller.signal.aborted || res.destroyed || res.headersSent) return;
    /** @type {Record<string, string>} */
    const headers = {};
    response.headers.forEach((value, name) => { headers[name] = value; });
    res.writeHead(response.status, headers);
    if (!response.body) {
      res.end();
      return;
    }
    const body = Readable.fromWeb(/** @type {any} */ (response.body));
    body.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end();
    });
    body.pipe(res);
  }).catch(() => {
    if (controller.signal.aborted || res.destroyed) return;
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    }
    res.end(JSON.stringify({ error: 'Local voice relay failed.' }));
  });
  return true;
}
