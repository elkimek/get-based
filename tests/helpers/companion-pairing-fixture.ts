import { expect, vi } from 'vitest';
import { companionChatPairingCode, companionEndpointProof } from '../../lib/agent-host-boundary.js';
import { pairLocalCompanion } from '../../js/agent-chat-settings.js';

export function stubPairedCompanion(port: number, respond: (input: string, init?: RequestInit) => Response | Promise<Response>) {
  const endpoint = `http://127.0.0.1:${port}`;
  const code = companionChatPairingCode('synthetic-companion-installation-secret', endpoint);
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input), location.origin);
    expect(url.origin).toBe(endpoint);
    if (url.pathname === '/v1/pairing') {
      expect(new Headers(init?.headers).has('Authorization')).toBe(false);
      const challenge = url.searchParams.get('challenge')!;
      expect(challenge).toMatch(/^[0-9a-f]{32}$/);
      return Response.json({ proof: companionEndpointProof(code, endpoint, location.origin, challenge) });
    }
    if (url.pathname === '/v1/discovery') {
      expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${code}`);
    }
    return respond(url.href, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, pair: () => pairLocalCompanion(code) };
}
