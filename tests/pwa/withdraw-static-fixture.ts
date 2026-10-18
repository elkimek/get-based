import { createNewMintKeys, createBlindSignature, pointFromHex, hashToCurve } from '@cashu/cashu-ts';
import type { Proof, SerializedBlindedMessage } from '@cashu/cashu-ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BrowserContext } from '@playwright/test';
import { prepareStaticWallet } from './wallet-static-fixture.js';
/** A local, deterministic mint simulator; no external payment or spendable mint. */
export async function prepareStaticWithdraw(context: BrowserContext, node = false) {
  await prepareStaticWallet(context, true, true, node);
  const keys = createNewMintKeys(12, new Uint8Array(32).fill(7), { versionByte: 0 });
  const publicKeys = Object.fromEntries(Object.entries(keys.pubKeys).map(([amount, key]) => [amount, Buffer.from(key).toString('hex')]));
  const spent = new Set<string>(); let swaps = 0; let melts = 0; let payment = 'UNPAID'; let invoice = '';
  const y = (secret: string) => hashToCurve(new TextEncoder().encode(secret)).toHex(true);
  const quote = () => ({ quote: 'synthetic-withdraw-quote', unit: 'sat', amount: 4, fee_reserve: 1, request: invoice, state: payment, expiry: Math.floor(Date.now() / 1000) + 3600, payment_preimage: null, change: [] });
  async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const pathname = new URL(request.url!, 'http://localhost').pathname;
    if (!pathname.startsWith('/api/__synthetic-withdraw/')) return false;
    const path = pathname.slice('/api/__synthetic-withdraw/'.length);
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString();
    const body = text ? JSON.parse(text) as { inputs?: Proof[]; outputs?: SerializedBlindedMessage[]; Ys?: string[]; request?: string } : {};
    let data: unknown;
    if (path === 'info') data = { name: 'Local synthetic withdrawal mint', version: 'synthetic/1', nuts: { '4': { methods: [{ method: 'bolt11', unit: 'sat', min_amount: 1, max_amount: 25000 }], disabled: false }, '5': { methods: [{ method: 'bolt11', unit: 'sat', min_amount: 1, max_amount: 25000 }], disabled: false } } };
    else if (path === 'keysets') data = { keysets: [{ id: keys.keysetId, unit: 'sat', active: true, input_fee_ppk: 0 }] };
    else if (path.startsWith('keys')) data = { keysets: [{ id: keys.keysetId, unit: 'sat', keys: publicKeys }] };
    else if (path === 'checkstate') data = { states: (body.Ys || []).map(Y => ({ Y, state: spent.has(Y) ? 'SPENT' : 'UNSPENT' })) };
    else if (path === 'swap') {
      swaps++; for (const input of body.inputs || []) spent.add(y(input.secret));
      data = { signatures: (body.outputs || []).map(output => ({ amount: output.amount, id: keys.keysetId, C_: createBlindSignature(pointFromHex(output.B_), keys.privKeys[String(output.amount)]!, keys.keysetId).C_.toHex(true) })) };
    } else if (path === 'melt/quote/bolt11') { invoice = body.request || ''; data = quote(); }
    else if (path.startsWith('melt/quote/bolt11/')) data = quote();
    else if (path === 'melt/bolt11') { melts++; payment = 'PENDING'; data = quote(); }
    else if (path === 'restore') data = { outputs: [], signatures: [] };
    else { response.writeHead(404, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'Unexpected synthetic mint route: ' + path })); return true; }
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)); return true;
  }
  return { handleRequest, counts: () => ({ swaps, melts }), keysetId: keys.keysetId };
}
