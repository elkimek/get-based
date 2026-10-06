// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountWalletNode, disposeWalletNode } from '../js/wallet-node-component.js';
import { recoverPendingWalletFunding } from '../js/provider-wallet-funding-recovery.js';
import { disposeWalletFunding, mountWalletFunding } from '../js/wallet-funding-component.js';

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
afterEach(() => { disposeWalletFunding(); disposeWalletNode(); });

function nodeView() {
  const root = document.createElement('div'); document.body.append(root);
  const view = mountWalletNode(root, { connect: () => {}, refresh: () => {}, chooseMint: () => {}, deposit: () => {}, newSession: () => {}, retry: () => {}, copy: () => {}, reclaim: () => {}, close: () => {} }, 'refunds');
  return { root, view };
}
it.each(payloads)('keeps private recovery ports and metadata inert: %s', payload => {
  const { root, view } = nodeView();
  view.setRecoveries([{ node: payload, mint: payload, token: payload, id: payload, generation: payload, createdAt: 1 }]);
  view.setState({ ...view.getState(), phase: 'ready', pending: false });
  expectInert(root); expect(root.querySelector('textarea')!.value).toBe(payload);
  expect(root.querySelector('[data-token],[data-recovery-id],[data-generation]')).toBeNull();
  expect(root.textContent).toContain(payload); expect(root.textContent).toContain('Token mint: ' + payload);
  expect(view.readRecovery(0)).toMatchObject({ token: payload, id: payload, generation: payload });
  expect(JSON.stringify(view.getState())).not.toContain(payload);
});
it.each(payloads)('keeps rejected-session node text inert: %s', payload => {
  const { root, view } = nodeView();
  view.setState({ ...view.getState(), mode: 'deposit', node: payload, phase: 'rejected', pending: false });
  expectInert(root); expect(root.textContent).toContain(payload);
  expect(root.querySelector('[data-routstr-wallet-action="new-node-session"]')).not.toBeNull();
});

it.each(payloads)('escapes pending funding mint and error details without exposing token data: %s', async payload => {
  document.body.innerHTML = '<div id="funding-host"></div>';
  mountWalletFunding(document.getElementById('funding-host')!, 0, { submitCustom: () => {}, cancelCustom: () => {} });
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
