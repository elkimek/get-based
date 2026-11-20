import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

export function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function firstForwardedValue(value: unknown) {
  return String(value || '').split(',')[0]!.trim();
}

export function requestUrl(incoming: IncomingMessage, trustForwarded = true) {
  const forwardedProto = trustForwarded ? firstForwardedValue(incoming.headers['x-forwarded-proto']) : '';
  const protocol = forwardedProto === 'https' ? 'https' : 'http';
  const forwardedHost = trustForwarded ? firstForwardedValue(incoming.headers['x-forwarded-host']) : '';
  const host = forwardedHost || firstForwardedValue(incoming.headers.host) || 'localhost';
  return new URL(incoming.url || '/', `${protocol}://${host}`).toString();
}

export function nodeRelayHeaders(incoming: IncomingMessage, trustForwarded: boolean) {
  const headers = new Headers(incoming.headers as HeadersInit);
  const forwarded = (headers.get('x-forwarded-for') || '').split(',').map(item => item.trim()).filter(Boolean).at(-1);
  for (const name of ['x-forwarded-for', 'x-vercel-forwarded-for', 'x-real-ip', 'cf-connecting-ip']) headers.delete(name);
  const peer = incoming.socket.remoteAddress || 'unknown-client';
  headers.set('x-forwarded-for', trustForwarded && forwarded && isIP(forwarded) ? forwarded : peer);
  return headers;
}
