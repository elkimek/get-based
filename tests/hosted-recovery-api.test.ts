import {afterEach, expect, it, vi} from 'vitest';
vi.mock('../shared/hosted-transition.js', () => ({getHostedTransition: (origin: string) => origin === 'https://app.getbased.health' ? {phase: 'recovery'} : null}));
import {handler} from '../api/proxy.js';
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllEnvs();});
it.each(['https://app.getbased.health/api/proxy', 'https://integrations.getbased.health/api/proxy'])('refuses hosted personal operations at %s before reading the body or contacting an upstream', async url => {
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', ''); const upstream = vi.spyOn(globalThis, 'fetch');
  const request = new Request(url, {method: 'POST', headers: {Origin: 'https://app.getbased.health', 'Content-Type': 'application/json'}, body: '{"synthetic":"must remain unread"}'});
  const response = await handler(request);
  expect(response.status).toBe(410); expect(await response.json()).toEqual({error: 'The hosted app is recovery-only. Use your self-hosted app for personal integrations.'});
  expect(request.bodyUsed).toBe(false); expect(upstream).not.toHaveBeenCalled(); expect(response.headers.get('access-control-allow-origin')).toBe('https://app.getbased.health');
});
