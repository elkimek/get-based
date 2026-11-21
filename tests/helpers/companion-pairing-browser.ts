import {randomBytes} from 'node:crypto';
import type {Page} from '@playwright/test';
import {companionChatPairingCode, companionEndpointProof} from '../../lib/agent-host-boundary.js';

/** Layer real origin-bound pairing over an explicitly intercepted synthetic
 * Companion. Existing deterministic chat/catalog handlers receive authorized requests. */
export async function authorizeMockCompanion(page: Page, endpoint: string, sessionToken: string) {
  const code = companionChatPairingCode(randomBytes(32).toString('hex'), endpoint);
  await page.route(url => url.origin === endpoint && url.pathname.startsWith('/v1/'), async route => {
    const request = route.request();
    const url = new URL(request.url());
    const origin = new URL(page.url()).origin;
    if (url.pathname === '/v1/pairing') {
      const challenge = url.searchParams.get('challenge') || '';
      return route.fulfill({json: {proof: companionEndpointProof(code, endpoint, origin, challenge)}});
    }
    const credential = url.pathname === '/v1/discovery' ? code : sessionToken;
    if (request.headers().authorization !== 'Bearer ' + credential) {
      return route.fulfill({status: 401, json: {error: 'Synthetic Companion requires the matching credential'}});
    }
    await route.fallback();
  });
  await page.evaluate(async pairingCode => {
    const settings = await import('/js/agent-chat-settings.js');
    await settings.pairLocalCompanion(pairingCode);
  }, code);
}
