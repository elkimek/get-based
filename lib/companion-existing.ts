// A temporary bootstrap must not create a second bridge beside a login service.
import { randomBytes } from 'node:crypto';
import { companionChatPairingCode, companionEndpointProof, tokenMatches } from './agent-host-boundary.js';
export type CompanionHealthFetch = (url: string, options: RequestInit) => Promise<Response>;
export async function findExistingCompanion(options: { env?: NodeJS.ProcessEnv; fetchImpl?: CompanionHealthFetch; installationToken?: string } = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const explicit = String(env.GETBASED_AGENT_HOST_PORT || '').trim();
  const port = Number(explicit || 8324);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const ports = explicit ? [port] : Array.from({ length: 8 }, (_, index) => 8324 + index);
  for (const candidate of ports) {
    const endpoint = `http://127.0.0.1:${candidate}`;
    try {
      const response = await fetchImpl(`${endpoint}/health`, { redirect: 'error', signal: AbortSignal.timeout(300) });
      if (!response.ok || !response.body) continue;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 4096) throw new Error('Unexpected health response');
          chunks.push(value);
        }
      } finally { await reader.cancel(); }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { ok?: unknown; service?: unknown };
      if (data.ok !== true || data.service !== 'getbased-agent-host') continue;
      if (options.installationToken) {
        const challenge = randomBytes(16).toString('hex');
        const result = await fetchImpl(`${endpoint}/v1/pairing?challenge=${challenge}`, { redirect: 'error', signal: AbortSignal.timeout(400) });
        if (!result.ok) continue;
        const {proof} = await result.json() as {proof?: string};
        const key = companionChatPairingCode(options.installationToken, endpoint);
        if (!proof || !tokenMatches(proof, companionEndpointProof(key, endpoint, '', challenge))) continue;
      }
      return { endpoint };
    } catch { /* An unrelated or unavailable listener is not a Companion. */ }
  }
  return null;
}
