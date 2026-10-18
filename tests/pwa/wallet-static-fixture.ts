import { createNewMintKeys } from '@cashu/cashu-ts';
import type { BrowserContext, Page } from '@playwright/test';
import { makeTestInvoice } from '../fixtures/lightning-invoices.js';
const mint = 'https://mint.minibits.cash/Bitcoin';
export async function prepareStaticWallet(context: BrowserContext, seeded = true, withdraw = false, node = false, accountMode: 'valid' | 'malformed' | null = null): Promise<void> {
  // Deterministic synthetic mint keys and signed invoice; there is no payable backend.
  const synthetic = createNewMintKeys(12, new Uint8Array(32).fill(7), { versionByte: 0 });
  const publicKeys = Object.fromEntries(Object.entries(synthetic.pubKeys).map(([amount, key]) => [amount, Buffer.from(key).toString('hex')]));
  await context.addInitScript(({ mint, keys, keysetId, invoice, seeded, withdraw, node, accountMode }) => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    const fixture = window as unknown as { syntheticFundingEnabled: boolean; syntheticFundingRequests: number; syntheticRestoreRequests: number };
    fixture.syntheticFundingEnabled = false; fixture.syntheticFundingRequests = 0; fixture.syntheticRestoreRequests = 0;
    const account = accountMode ? { mode: accountMode, creates: 0, clipboard: '' } : null;
    if (account) {
      (window as unknown as { syntheticAccount: typeof account }).syntheticAccount = account;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => { account.clipboard = value; } } });
    }
    const transport = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      // Account responses and the external guard share one initialization owner.
      if (account && url.origin === 'https://synthetic-routstr.test') {
        const reply = (value: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }));
        if (url.pathname === '/v1/balance/create') { ++account.creates; return reply(account.mode === 'valid' ? { api_key: 'sk-SYNTHETIC-CREATED' } : { api_key: 'cashuA-invalid-credential' }); }
        if (url.pathname === '/v1/balance/info') return reply({ balance: 5000 });
        if (url.pathname === '/v1/models') return reply({ data: [{ id: 'claude-sonnet-5', name: 'Claude Sonnet', enabled: true, architecture: { input_modalities: ['text','image'] }, pricing: { prompt: '0.000003', completion: '0.000015' } }] });
        return reply({},404);
      }
      if (node && url.href.startsWith('https://synthetic-routstr.test/v1/')) return transport(location.origin + '/api/__synthetic-node/' + url.href.slice('https://synthetic-routstr.test/v1/'.length), init);
      if (withdraw && url.href.startsWith(mint + '/v1/')) return transport(location.origin + '/api/__synthetic-withdraw/' + url.href.slice((mint + '/v1/').length), init);
      if (url.origin !== location.origin) {
        ++fixture.syntheticFundingRequests;
        if (fixture.syntheticFundingEnabled && url.href.startsWith(mint + '/v1/')) {
          const reply = (value: unknown) => Promise.resolve(new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }));
          if (url.pathname.endsWith('/info')) return reply({ name: 'Synthetic nonpayable mint', pubkey: '', version: 'fixture', nuts: { '4': { methods: [{ method: 'bolt11', unit: 'sat', min_amount: 1, max_amount: 100000 }], disabled: false } } });
          if (url.pathname.endsWith('/restore')) { ++fixture.syntheticRestoreRequests; return reply({ outputs: [], signatures: [] }); }
          if (url.pathname.endsWith('/keysets')) return reply({ keysets: [{ id: keysetId, unit: 'sat', active: true, input_fee_ppk: 0 }] });
          if (url.pathname.includes('/keys')) return reply({ keysets: [{ id: keysetId, unit: 'sat', keys }] });
          if (url.pathname.includes('/mint/quote/bolt11')) return reply({ quote: 'synthetic-static-funding-quote', request: invoice, amount: 1000, unit: 'sat', state: 'UNPAID', expiry: Math.floor(Date.now() / 1000) + 3600 });
        }
        return Promise.reject(new TypeError('External transport unavailable in static acceptance'));
      }
      return transport(input, init);
    };
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true'); localStorage.setItem('labcharts-analytics-consent-seen', '1');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({ accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-10-06T00:00:00Z', appVersion: 'test', location: 'local-test' }));
    if (localStorage.getItem('wallet-funding-fixture-seeded')) return;
    localStorage.setItem('wallet-funding-fixture-seeded', '1'); localStorage.setItem('labcharts-ai-provider', 'routstr'); localStorage.setItem('labcharts-ai-paused', 'false'); localStorage.setItem('labcharts-chat-backend', 'direct');
    localStorage.setItem('labcharts-routstr-node', 'https://synthetic-routstr.test'); localStorage.setItem('labcharts-cashu-wallet-mint', mint);
    if (seeded) localStorage.setItem('labcharts-cashu-wallet-mnemonic', 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
  }, { mint, keys: publicKeys, keysetId: synthetic.keysetId, invoice: makeTestInvoice(1000), seeded, withdraw, node, accountMode });
}

/** Nonspendable stored proofs exercise the real export codec without mint transport. */
export async function seedStaticWalletMints(page: Page): Promise<string> {
  const other = 'https://mint.other.test';
  const synthetic = createNewMintKeys(12, new Uint8Array(32).fill(7), { versionByte: 0 });
  const C = Buffer.from(synthetic.pubKeys['1']!).toString('hex');
  await page.evaluate(async ({ mint, other, C, id }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open('getbased-cashu', 2); req.onupgradeneeded = () => { for (const [store, keyPath] of [['proofs', 'secret'], ['meta', 'key'], ['fee-proofs', 'secret']] as const) if (!req.result.objectStoreNames.contains(store!)) req.result.createObjectStore(store!, { keyPath }); }; req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
      try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(['proofs', 'meta'], 'readwrite');
        for (const [owner, amounts] of [[mint, [8, 4]], [other, [4, 2, 1]]] as const) for (const amount of amounts) tx.objectStore('proofs').put({ secret: 'SYNTHETIC-' + owner + '-' + amount, amount, C, id, _mint: owner });
        for (const [key, value] of [['mintUrl', mint], ['walletMints', [mint, other]], ['proofCheckAt:' + mint, Date.now()], ['proofCheckAt:' + other, Date.now()], ['pendingNodeRefund', { nodeUrl: 'https://synthetic-routstr.test', key: 'SYNTHETIC-RECOVERY', token: 'SYNTHETIC-NODE-TOKEN', createdAt: 1 }]]) tx.objectStore('meta').put({ key, value });
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      }); } finally { db.close(); }
    }, { mint, other, C, id: synthetic.keysetId });
  return synthetic.keysetId;
}
