import { getDecodedToken, getEncodedToken } from '@cashu/cashu-ts';
import type { Proof } from '@cashu/cashu-ts';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BrowserContext } from '@playwright/test';
import { prepareStaticWithdraw } from './withdraw-static-fixture.js';
const mint = 'https://mint.minibits.cash/Bitcoin';
/** Same-origin fixture routes preserve real browser SDK and journal execution. */
export async function prepareStaticNode(context: BrowserContext) {
  const synthetic = await prepareStaticWithdraw(context, true);
  const accounts = new Map<string, { proofs: Proof[]; token: string }>(); let deposits = 0, refunds = 0, failReceive = false;
  async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const pathname = new URL(request.url!, 'http://localhost').pathname;
    const reply = (status: number, value: unknown) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)); return true; };
    if (failReceive && refunds && pathname === '/api/__synthetic-withdraw/swap') return reply(503, { error: 'Synthetic mint temporarily unavailable' });
    if (!pathname.startsWith('/api/__synthetic-node/')) return synthetic.handleRequest(request, response);
    const path = pathname.slice('/api/__synthetic-node/'.length), key = (request.headers.authorization || '').replace(/^Bearer /, '');
    if (path === 'info') return reply(200, { mints: [mint] });
    if (path === 'models') return reply(200, { data: [{ id: 'claude-sonnet-4.6', name: 'Synthetic Claude model', enabled: true }] });
    if (path === 'balance/info') { const account = accounts.get(key); return account ? reply(200, { balance: account.proofs.reduce((sum, proof) => sum + Number(proof.amount), 0) * 1000 }) : reply(401, { error: 'Unknown synthetic account' }); }
    if (path === 'balance/create' || path === 'balance/topup') {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString()) as { initial_balance_token?: string; cashu_token?: string };
      const token = body.initial_balance_token || body.cashu_token || '', decoded = getDecodedToken(token, [synthetic.keysetId]);
      if (decoded.mint !== mint) return reply(400, { error: 'Unexpected synthetic mint' });
      const target = path === 'balance/create' ? 'sk-' + createHash('sha256').update(token).digest('hex') : key;
      const previous = accounts.get(target); if (path === 'balance/topup' && !previous) return reply(401, { error: 'Unknown synthetic account' });
      const proofs = [...(previous?.proofs || []), ...decoded.proofs]; accounts.set(target, { proofs, token }); ++deposits;
      return reply(200, { api_key: target, balance: proofs.reduce((sum, proof) => sum + Number(proof.amount), 0) * 1000 });
    }
    if (path === 'wallet/refund') {
      const account = accounts.get(key); if (!account?.proofs.length) return reply(401, { error: 'No synthetic node balance' });
      ++refunds; const token = getEncodedToken({ mint, proofs: account.proofs }); accounts.set(key, { proofs: [], token }); return reply(200, { token });
    }
    return reply(404, { error: 'Unexpected synthetic node route' });
  }
  return { handleRequest, keysetId: synthetic.keysetId, failReceive: (value: boolean) => { failReceive = value; }, counts: () => ({ ...synthetic.counts(), deposits, refunds, accounts: accounts.size }) };
}
