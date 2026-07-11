#!/usr/bin/env node
/**
 * Routstr/Cashu real-funds browser canary.
 *
 * This is intentionally NOT part of the normal automated suite. It moves bearer
 * money and must be run manually with tiny sats after Cashu/Routstr refactors.
 * It redacts seeds, Cashu tokens, and Routstr keys. The only bearer-like value it
 * prints is the Lightning invoice in setup phase, because an operator must pay it.
 *
 * Usage:
 *   GETBASED_URL=http://127.0.0.1:8180/app \
 *   ROUTSTR_CANARY_ALLOW_REAL_FUNDS=1 \
 *   node scripts/routstr-real-funds-canary.mjs setup
 *
 *   # pay printed PAY_THIS_LIGHTNING_INVOICE, then:
 *   GETBASED_URL=http://127.0.0.1:8180/app \
 *   ROUTSTR_CANARY_ALLOW_REAL_FUNDS=1 \
 *   node scripts/routstr-real-funds-canary.mjs resume
 */
import { chromium } from 'playwright';
import { existsSync, rmSync } from 'node:fs';

const APP_URL = process.env.GETBASED_URL || 'http://127.0.0.1:8180/app';
const USER_DATA_DIR = process.env.CANARY_PROFILE || '/tmp/getbased-routstr-real-canary-profile';
const TOKEN_IMPORT_DIR = process.env.CANARY_TOKEN_PROFILE || '/tmp/getbased-routstr-token-import-profile';
const SEED_RESTORE_DIR = process.env.CANARY_RESTORE_PROFILE || '/tmp/getbased-routstr-seed-restore-profile';
const MINT_URL = process.env.CANARY_MINT || 'https://mint.cubabitcoin.org';
const AMOUNT_SATS = Number(process.env.CANARY_SATS || '1000');
const phase = process.argv[2] || 'help';

function requireRealFundsAllowed() {
  if (process.env.ROUTSTR_CANARY_ALLOW_REAL_FUNDS !== '1') {
    throw new Error('Refusing real-funds canary without ROUTSTR_CANARY_ALLOW_REAL_FUNDS=1');
  }
  if (!Number.isFinite(AMOUNT_SATS) || AMOUNT_SATS < 100 || AMOUNT_SATS > 5000) {
    throw new Error(`Unsafe CANARY_SATS=${AMOUNT_SATS}; expected 100..5000`);
  }
}
function log(msg, obj) {
  if (obj === undefined) console.log(msg);
  else console.log(msg, JSON.stringify(obj));
}
function redactText(text) {
  if (!text) return text;
  return String(text)
    .replace(/cashu[A-Za-z0-9_-]{20,}/g, '[cashu-token-redacted]')
    .replace(/sk-[A-Za-z0-9_-]{10,}/g, '[routstr-key-redacted]')
    .replace(/\b(?:[a-z]+\s+){11}[a-z]+\b/g, '[possible-seed-redacted]');
}
async function openApp(dir = USER_DATA_DIR) {
  const context = await chromium.launchPersistentContext(dir, {
    headless: true,
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] || await context.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('request', req => {
    const url = req.url();
    if (/routstr|balance|wallet|mint|cashu/i.test(url)) {
      requests.push({ method: req.method(), url: url.replace(/initial_balance_token=[^&]+/, 'initial_balance_token=[redacted]') });
    }
  });
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    document.querySelector('.chat-close-btn')?.click();
    document.querySelectorAll('.tour-btn, .analytics-consent-btn').forEach(btn => {
      if (/^(Skip|Turn off|Got it)$/.test((btn.textContent || '').trim())) btn.click();
    });
  });
  return { context, page, errors, requests };
}
async function preflightCanaryProfileReset() {
  if (!existsSync(USER_DATA_DIR)) return;
  const { context, page } = await openApp(USER_DATA_DIR);
  try {
    const state = await page.evaluate(async () => {
      const required = [
        'cashuGetBalance',
        'cashuRecoverPendingDeposit',
        'cashuRecoverPendingWithdraw',
      ];
      const missing = required.filter(name => typeof window[name] !== 'function');
      if (missing.length) return { inspectError: 'missing wallet APIs: ' + missing.join(', ') };
      const safe = async (fn) => { try { return await fn(); } catch (e) { return { error: e?.message || String(e) }; } };
      const hasPendingFundingQuote = () => new Promise((resolve, reject) => {
        const req = indexedDB.open('getbased-cashu');
        req.onerror = () => reject(req.error || new Error('failed to open getbased-cashu'));
        req.onsuccess = () => {
          const db = req.result;
          try {
            if (!db.objectStoreNames.contains('meta')) {
              db.close();
              resolve(false);
              return;
            }
            const tx = db.transaction('meta', 'readonly');
            const store = tx.objectStore('meta');
            const cursorReq = store.openCursor();
            cursorReq.onerror = () => reject(cursorReq.error || new Error('failed to inspect Cashu meta store'));
            cursorReq.onsuccess = () => {
              const cursor = cursorReq.result;
              if (!cursor) {
                db.close();
                resolve(false);
                return;
              }
              if (String(cursor.value?.key || '').startsWith('pendingQuote:')) {
                db.close();
                resolve(true);
                return;
              }
              cursor.continue();
            };
          } catch (e) {
            db.close();
            reject(e);
          }
        };
      });
      return {
        walletBalance: await safe(async () => Number(await window.cashuGetBalance()) || 0),
        pendingFunding: await safe(hasPendingFundingQuote),
        pendingDeposit: await safe(async () => !!(await window.cashuRecoverPendingDeposit())),
        pendingWithdraw: await safe(async () => !!(await window.cashuRecoverPendingWithdraw())),
        hasRoutstrKey: !!localStorage.getItem('labcharts-routstr-key'),
      };
    });
    if (state.inspectError) throw new Error(`Refusing to reset canary profile: ${state.inspectError}`);
    const inspectError = ['walletBalance', 'pendingFunding', 'pendingDeposit', 'pendingWithdraw'].find(k => state[k]?.error);
    if (inspectError) throw new Error(`Refusing to reset canary profile: could not inspect ${inspectError}: ${state[inspectError].error}`);
    if (state.walletBalance > 0 || state.pendingFunding || state.pendingDeposit || state.pendingWithdraw || state.hasRoutstrKey) {
      throw new Error('Refusing to reset non-empty real-funds canary profile: ' + JSON.stringify(state));
    }
  } finally {
    await context.close();
  }
}
async function ensureAppWallet(page) {
  await page.evaluate(async (mint) => {
    if (typeof window.cashuHasWalletSeed === 'function' && !(await window.cashuHasWalletSeed())) {
      await window.cashuGenerateWalletSeed();
    }
    await window.cashuSetMintUrl(mint);
  }, MINT_URL);
  log('PASS app wallet seed exists and mint selected', { mintHost: new URL(MINT_URL).host });
}
async function setup() {
  requireRealFundsAllowed();
  await preflightCanaryProfileReset();
  rmSync(USER_DATA_DIR, { recursive: true, force: true });
  const { context, page, errors } = await openApp(USER_DATA_DIR);
  try {
    await ensureAppWallet(page);
    const quote = await page.evaluate(async (sats) => window.cashuCreateFundingInvoice(sats), AMOUNT_SATS);
    const invoice = quote?.request || quote?.invoice || quote?.bolt11 || quote?.payment_request || '';
    if (!invoice) throw new Error('No Lightning invoice found after funding request');
    log('PASS app Lightning invoice created', { sats: AMOUNT_SATS, mintHost: new URL(MINT_URL).host });
    console.log('PAY_THIS_LIGHTNING_INVOICE=' + invoice);
    log('NEXT', { command: 'ROUTSTR_CANARY_ALLOW_REAL_FUNDS=1 node scripts/routstr-real-funds-canary.mjs resume' });
    if (errors.length) log('WARN browser_errors_redacted', errors.map(redactText).slice(-5));
  } finally {
    await context.close();
  }
}
async function resume() {
  requireRealFundsAllowed();
  const { context, page, errors, requests } = await openApp(USER_DATA_DIR);
  let contextClosed = false;
  try {
    await ensureAppWallet(page);
    await page.evaluate(async () => window.cashuRecoverPendingFunding());
    const initialWallet = await page.evaluate(async () => Number(await window.cashuGetBalance()) || 0);
    if (initialWallet <= 0) {
      log('WAIT pending funding not paid or not minted yet', { walletSats: initialWallet });
      return;
    }
    log('PASS wallet funding recovered/confirmed', { walletSats: initialWallet });

    const firstDeposit = Math.min(500, Math.max(100, Math.floor(initialWallet / 2)));
    await page.evaluate(async (amount) => {
      const node = localStorage.getItem('labcharts-routstr-node') || 'https://api.routstr.com/';
      const result = await window.cashuDepositToNode(node, amount, null);
      if (!result?.api_key) throw new Error('Node deposit did not return a Routstr key');
      window.__routstrCanaryKey = result.api_key;
      localStorage.setItem('labcharts-routstr-node', node);
    }, firstDeposit);
    const createCalls = requests.filter(r => /\/v1\/balance\/create/.test(r.url)).length;
    if (createCalls !== 1) throw new Error(`Expected exactly one create call for first deposit, saw ${createCalls}`);
    log('PASS first node deposit used /v1/balance/create', { sats: firstDeposit });

    await page.evaluate(async () => {
      const node = localStorage.getItem('labcharts-routstr-node') || 'https://api.routstr.com/';
      const key = window.__routstrCanaryKey;
      if (!key) throw new Error('No Routstr key after first deposit');
      await window.cashuDepositToNode(node, 100, key);
    });
    const topupCalls = requests.filter(r => /\/v1\/balance\/topup/.test(r.url)).length;
    if (topupCalls !== 1) throw new Error(`Expected existing key topup call, saw ${topupCalls}`);
    log('PASS second node deposit used /v1/balance/topup');

    const nodeResult = await page.evaluate(async () => {
      const node = (localStorage.getItem('labcharts-routstr-node') || 'https://api.routstr.com/').replace(/\/$/, '');
      const key = window.__routstrCanaryKey;
      if (!key) throw new Error('No Routstr key available for canary node checks');
      const balanceInfo = async () => {
        const res = await fetch(node + '/v1/balance/info', { headers: { Authorization: 'Bearer ' + key } });
        const json = await res.json().catch(() => ({}));
        return { ok: res.ok, sats: json.balance != null ? Math.floor(json.balance / 1000) : null, total_requests: json.total_requests || 0, total_spent: json.total_spent || 0 };
      };
      const before = await balanceInfo();
      let modelCall = { ok: false };
      try {
        const model = localStorage.getItem('labcharts-routstr-model') || 'claude-sonnet-4.6';
        const res = await fetch(node + '/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with exactly: ok' }], max_tokens: 3, temperature: 0 }),
        });
        const json = await res.json().catch(() => ({}));
        modelCall = { ok: res.ok, status: res.status, hasChoice: Array.isArray(json.choices) && json.choices.length > 0 };
      } catch (e) { modelCall = { ok: false, error: e.message }; }
      const afterModel = await balanceInfo();
      const refundRes = await fetch(node + '/v1/wallet/refund', { method: 'POST', headers: { Authorization: 'Bearer ' + key } });
      const refundJson = await refundRes.json().catch(() => null);
      const token = refundJson?.token || refundJson?.cashu_token || (typeof refundJson === 'string' && refundJson.startsWith('cashu') ? refundJson : null);
      if (!refundRes.ok || !token) return { before, afterModel, modelCall, refund: { ok: refundRes.ok, hasToken: !!token } };
      const pendingSaved = await window.cashuSavePendingWithdrawToken(token, 'routstr-real-canary-refund');
      const recv = await window.cashuReceiveToken(token);
      await window.cashuClearPendingWithdraw();
      delete window.__routstrCanaryKey;
      localStorage.removeItem('labcharts-routstr-key');
      return { before, afterModel, modelCall, refund: { ok: true, hasToken: true, pendingSaved, received: Number(recv?.received ?? recv) || 0 } };
    });
    if (!nodeResult.modelCall.ok) throw new Error('Routstr model call failed: ' + redactText(JSON.stringify(nodeResult.modelCall)));
    if (!nodeResult.refund.ok || !nodeResult.refund.pendingSaved || !nodeResult.refund.received) {
      throw new Error('Node refund recovery failed: ' + redactText(JSON.stringify(nodeResult.refund)));
    }
    log('PASS model call and refund recovered', nodeResult);

    await context.close();
    contextClosed = true;

    const tokenRoundtrip = await tokenRoundtripAndSeedRestore();
    log('PASS token export/import and seed restore', tokenRoundtrip);

    const final = await openApp(USER_DATA_DIR);
    try {
      const finalState = await final.page.evaluate(async () => ({
        mintHost: new URL(await window.cashuGetMintUrl()).host,
        walletBalance: Number(await window.cashuGetBalance()) || 0,
        hasRoutstrKey: !!localStorage.getItem('labcharts-routstr-key') || !!window.__routstrCanaryKey,
        pendingDeposit: !!(await window.cashuRecoverPendingDeposit()),
        pendingWithdraw: !!(await window.cashuRecoverPendingWithdraw()),
      }));
      log('PASS final state', finalState);
      if (finalState.hasRoutstrKey || finalState.pendingDeposit || finalState.pendingWithdraw) {
        throw new Error('Final canary state is not clean: ' + JSON.stringify(finalState));
      }
      if (final.errors.length) log('WARN final_browser_errors_redacted', final.errors.map(redactText).slice(-10));
    } finally {
      await final.context.close();
    }
    if (errors.length) log('WARN browser_errors_redacted', errors.map(redactText).slice(-10));
  } finally {
    if (!contextClosed) await context.close();
  }
}
async function tokenRoundtripAndSeedRestore() {
  const main = await openApp(USER_DATA_DIR);
  let tokenToSecond;
  try {
    const sent = await main.page.evaluate(async () => {
      const before = Number(await window.cashuGetBalance());
      const amount = Math.min(100, Math.max(10, before - 10));
      const result = await window.cashuSendAsToken(amount);
      return { before, after: Number(await window.cashuGetBalance()), amount: result.amount, token: result.token };
    });
    tokenToSecond = sent.token;
  } finally { await main.context.close(); }

  rmSync(TOKEN_IMPORT_DIR, { recursive: true, force: true });
  const second = await openApp(TOKEN_IMPORT_DIR);
  let recovered;
  let seed;
  try {
    const received = await second.page.evaluate(async ({ token, mint }) => {
      await window.cashuGenerateWalletSeed();
      await window.cashuSetMintUrl(mint);
      const recv = await window.cashuReceiveToken(token);
      const backup = await window.cashuExportWallet();
      const balance = Number(await window.cashuGetBalance());
      let sendBack = null;
      for (const amount of [Math.max(1, balance - 1), Math.max(1, balance - 2), Math.max(1, balance - 5), 1]) {
        try { sendBack = await window.cashuSendAsToken(amount); break; } catch {}
      }
      return { received: Number(recv?.received ?? recv) || 0, backupCreated: !!backup, sendBack };
    }, { token: tokenToSecond, mint: MINT_URL });
    if (!received.received || !received.backupCreated || !received.sendBack?.token) throw new Error('Token import/export failed');

    const recover = await openApp(USER_DATA_DIR);
    try {
      recovered = await recover.page.evaluate(async (token) => {
        // The second profile received the original token, so its sender journal
        // is now safe to clear before accepting the confirmed return token.
        await window.cashuClearPendingWithdraw();
        const recv = await window.cashuReceiveToken(token);
        return {
          received: Number(recv?.received ?? recv) || 0,
          balance: Number(await window.cashuGetBalance()) || 0,
          seed: await window.cashuGetWalletMnemonic(),
        };
      }, received.sendBack.token);
      if (!recovered.received) throw new Error('Return token receive failed');
      if (!recovered.seed) throw new Error('Cannot run seed restore smoke without a wallet mnemonic');
      seed = recovered.seed;

      // Only clear the second profile's return-token journal after the main
      // profile has durably accepted that token.
      await second.page.evaluate(async () => window.cashuClearPendingWithdraw());
    } finally {
      await recover.context.close();
    }
  } finally {
    await second.context.close();
  }

  const seedRestore = await seedRestoreSmoke(seed);
  if (!seedRestore.balance) throw new Error('Seed restore smoke did not recover a positive balance');
  return {
    recovered: recovered.received,
    walletBalance: recovered.balance,
    seedRestoreBalance: seedRestore.balance,
  };
}
async function seedRestoreSmoke(seed) {
  if (!seed) throw new Error('Cannot run seed restore smoke without a wallet mnemonic');
  rmSync(SEED_RESTORE_DIR, { recursive: true, force: true });
  const restored = await openApp(SEED_RESTORE_DIR);
  try {
    const result = await restored.page.evaluate(async ({ seed, mint }) => {
      await window.cashuSetMintUrl(mint);
      await window.cashuRestoreWalletFromSeed(seed);
      const balance = Number(await window.cashuGetBalance()) || 0;
      if (balance <= 0) throw new Error('Seed restore completed without recoverable balance');
      return { balance };
    }, { seed, mint: MINT_URL });
    return result;
  } finally {
    await restored.context.close();
    rmSync(SEED_RESTORE_DIR, { recursive: true, force: true });
  }
}

if (phase === 'setup') await setup();
else if (phase === 'resume') await resume();
else {
  console.log('Usage: ROUTSTR_CANARY_ALLOW_REAL_FUNDS=1 node scripts/routstr-real-funds-canary.mjs <setup|resume>');
}
