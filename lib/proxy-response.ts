import { proxyCorsHeaders } from './proxy-policy.js';
import type { ProxyCaller } from './proxy-policy.js';

/** JSON relay responses share the same CORS and privacy headers. */
export function proxyJsonResponse(
  req: ProxyCaller, status: number, payload: unknown, extraHeaders?: () => Record<string, string>,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...proxyCorsHeaders(req), 'Content-Type': 'application/json', ...extraHeaders?.() },
  });
}
