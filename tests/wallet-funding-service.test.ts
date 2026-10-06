// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const qrLoader = vi.hoisted(() => vi.fn());
vi.mock('../js/provider-qr.js', () => ({ ensureQRCode: qrLoader }));
vi.mock('../js/utils.js', () => ({ showNotification: vi.fn() }));
import { renderFundingInvoice, recoverPendingWalletFunding } from '../js/provider-wallet-funding-recovery.js';
import { disposeWalletFunding, mountWalletFunding } from '../js/wallet-funding-component.js';
import { applyWalletFundingResult } from '../js/wallet-funding-presentation.js';
import { makeTestInvoice } from './fixtures/lightning-invoices.js';
const payment = () => ({ invoice: makeTestInvoice(1000), quote: 'private-quote', mint: 'https://mint.test', amount: 1000 });
const qr = () => ({ addData: vi.fn(), make: vi.fn(), createSvgTag: () => '<svg xmlns="http://www.w3.org/2000/svg"/>' });
function mounted() { const host = document.createElement('div'); document.body.append(host); return mountWalletFunding(host, 0, { submitCustom: () => {}, cancelCustom: () => {} }); }
beforeEach(() => { qrLoader.mockReset(); }); afterEach(() => { disposeWalletFunding(); document.body.replaceChildren(); });
it('uses upper-case local QR data and preserves copied feedback and an open invoice disclosure', async () => {
  const view = mounted(); const maker = qr(); let finish!: (value: () => ReturnType<typeof qr>) => void;
  qrLoader.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const invoice = payment(); const pending = renderFundingInvoice(invoice); view.setCopied(); const details = document.querySelector('details')!; details.open = true;
  finish(() => maker); await pending;
  expect(maker.addData).toHaveBeenCalledWith(invoice.invoice.toUpperCase()); expect(view.readInvoice()?.qrImage).toMatch(/^data:image\/svg\+xml/);
  expect(document.querySelector('details')).toBe(details); expect(details.open).toBe(true); expect(document.body.textContent).toContain('✓ Copied');
});
it.each(['paid', 'expired', 'replaced'])('rejects late QR work when the initiating invoice is %s', async mode => {
  const view = mounted(); let finish!: (value: () => ReturnType<typeof qr>) => void; qrLoader.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const invoice = payment(); const pending = renderFundingInvoice(invoice);
  if (mode === 'replaced') { disposeWalletFunding(); mounted(); }
  else applyWalletFundingResult({ mint: invoice.mint, results: [{ quote: invoice.quote, paid: mode === 'paid', minted: 1000, fee: 2, state: mode === 'expired' ? 'EXPIRED' : 'PAID' }] });
  finish(qr); await pending;
  expect(document.querySelector('img')).toBeNull(); expect(view.readInvoice()).toBeNull();
  if (mode === 'paid') expect(document.body.textContent).toContain('+998 sats added');
  if (mode === 'expired') expect(document.body.textContent).toContain('expired or was cancelled');
});
it('keeps a valid copyable invoice and wallet link if the QR vendor is unavailable', async () => {
  const view = mounted(); qrLoader.mockRejectedValue(new Error('offline vendor')); const invoice = payment(); await renderFundingInvoice(invoice);
  expect(view.readInvoice()?.invoice).toBe(invoice.invoice); expect(document.querySelector('a')!.getAttribute('href')).toBe('lightning:' + invoice.invoice);
  expect(document.querySelector('textarea')!.value).toBe(invoice.invoice); expect(view.getState().pending).toBe(false);
});
it('reconciles requested pending recovery after close without writing into a replacement view', async () => {
  mounted(); let finish!: (value: unknown) => void; const refresh = vi.fn(), onResult = vi.fn();
  type Recovery = NonNullable<Parameters<typeof recoverPendingWalletFunding>[0]['cashuRecoverPendingFunding']>;
  const check = vi.fn(() => new Promise<Awaited<ReturnType<Recovery>>>(resolve => { finish = value => resolve(value as Awaited<ReturnType<Recovery>>); }));
  const pending = recoverPendingWalletFunding({ cashuRecoverPendingFunding: check }, refresh, onResult); await vi.waitFor(() => expect(check).toHaveBeenCalledOnce());
  disposeWalletFunding(); const next = mounted(); finish({ checked: 1, recovered: 998, failed: 0, cleared: 0, results: [] }); await pending;
  expect(refresh).toHaveBeenCalledOnce(); expect(onResult).toHaveBeenCalledOnce(); expect(next.getState().status.text).toBe(''); expect(document.body.textContent).not.toContain('recovered to wallet');
});
