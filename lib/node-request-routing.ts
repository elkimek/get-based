import type { IncomingMessage } from 'node:http';

export function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function firstForwardedValue(value: unknown) {
  return String(value || '').split(',')[0]!.trim();
}

export function requestUrl(incoming: IncomingMessage) {
  const forwardedProto = firstForwardedValue(incoming.headers['x-forwarded-proto']);
  const protocol = forwardedProto === 'https' ? 'https' : 'http';
  const forwardedHost = firstForwardedValue(incoming.headers['x-forwarded-host']);
  const host = forwardedHost || firstForwardedValue(incoming.headers.host) || 'localhost';
  return new URL(incoming.url || '/', `${protocol}://${host}`).toString();
}
