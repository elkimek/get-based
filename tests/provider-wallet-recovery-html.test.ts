// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { refundRecoveryHtml, nodeSessionRejectedHtml, showSavedNodeRefunds } from '../js/provider-wallet-refund-recovery.js';
import { recoverPendingWalletFunding } from '../js/provider-wallet-funding-recovery.js';
import { configureRoutstrWalletRuntime } from '../js/provider-wallet-runtime.js';

const payloads = [
  '</textarea><img src=x onerror="alert(1)">',
  '\"><svg onload="alert(1)"><script>alert(1)</script>',
  "' autofocus onfocus='alert(1)' & < >",
];

function expectInert(root: ParentNode) {
  expect(root.querySelector('script, img, svg, iframe')).toBeNull();
  for (const element of root.querySelectorAll('*')) {
    expect(element.getAttributeNames().filter(name => /^on/i.test(name))).toEqual([]);
  }
}

beforeEach(() => { document.body.replaceChildren(); });

it.each(payloads)('keeps saved refund text and recovery attributes inert: %s', payload => {
  const root = document.createElement('div');
  root.innerHTML = refundRecoveryHtml(new Error(payload), payload, payload, {
    nodeUrl: payload, mint: payload, recoveryId: payload, generation: payload, createdAt: 1,
  });
  expectInert(root);
  expect(root.querySelector('textarea')!.value).toBe(payload);
  expect(root.querySelector('[role="status"]')!.textContent).toBe(payload);
  const button = root.querySelector('button')!;
  for (const name of ['nodeUrl', 'recoveryId', 'token', 'generation']) {
    expect(button.dataset[name]).toBe(payload);
  }
  expect(root.textContent).toContain('Node: ' + payload);
  expect(root.textContent).toContain('Token mint: ' + payload);
});

it.each(payloads)('keeps rejected-session node attributes inert: %s', payload => {
  const root = document.createElement('div');
  root.innerHTML = nodeSessionRejectedHtml(payload);
  expectInert(root);
  expect(root.querySelector('button')!.dataset.nodeUrl).toBe(payload);
  expect(root.querySelector('button')!.dataset.routstrWalletAction).toBe('new-node-session');
});

it.each(payloads)('escapes pending funding mint and error details without exposing token data: %s', async payload => {
  document.body.innerHTML = '<div id="routstr-wfund-status"></div>';
  const refresh = vi.fn();
  await recoverPendingWalletFunding({
    cashuRecoverPendingWalletOperation: async () => ({ recovered: 0, pending: true,
      results: [{ recovered: 0, pending: true, operation: 'receive', mint: payload, error: 'private-token-data' }] }),
    cashuRecoverPendingFunding: async () => ({ mint: payload, checked: 1, recovered: 0, pending: 1,
      cleared: 0, failed: 1, balance: 0, results: [], pendingQuotes: [],
      errors: [{ mint: payload, quote: 'fixture-quote', message: payload, retryAfterMs: 0 }] }),
  }, refresh);
  const status = document.getElementById('routstr-wfund-status')!;
  expectInert(status);
  expect(status.textContent).toContain('Token import at ' + payload);
  expect(status.textContent).toContain('Pending invoice at ' + payload + ': ' + payload);
  expect(status.textContent).not.toContain('private-token-data');
  expect(refresh).not.toHaveBeenCalled();
});

it('renders saved refund cards through the actual sink without interpreting stored token metadata', async () => {
  const payload = payloads[0]!;
  document.body.innerHTML = '<div id="routstr-node-picker"></div>';
  const previous = configureRoutstrWalletRuntime({
    cashuGetPendingNodeRefunds: async () => [{ nodeUrl: payload, token: payload, recoveryId: payload, generation: payload, createdAt: 1 }],
    cashuGetTokenMintUrl: async () => payload,
  });
  try {
    await showSavedNodeRefunds();
    const picker = document.getElementById('routstr-node-picker')!;
    expectInert(picker);
    expect(picker.querySelector('textarea')!.value).toBe(payload);
    expect(picker.querySelector('button')!.dataset.recoveryId).toBe(payload);
    expect(picker.textContent).toContain('Token mint: ' + payload);
  } finally { configureRoutstrWalletRuntime(previous); }
});
