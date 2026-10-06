// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { disposeWalletFunding, getWalletFundingView, mountWalletFunding } from '../js/wallet-funding-component.js';
import { applyWalletFundingResult } from '../js/wallet-funding-presentation.js';
const invoice = { invoice: 'PRIVATE SYNTHETIC INVOICE', quote: 'PRIVATE QUOTE', mint: 'https://mint.test', amount: 1000, qrImage: '' };
const mount = (actions = { submitCustom: () => {}, cancelCustom: () => {} }) => { const host = document.createElement('div'); document.body.append(host); return { host, view: mountWalletFunding(host, 0.03, actions) }; };
afterEach(() => { disposeWalletFunding(); document.body.replaceChildren(); });
it('keeps private token and invoice ports out of snapshots and action attributes, and scrubs disposed fields', () => {
  const { host, view } = mount(); expect(host.textContent).toContain('3% development fee applies'); expect(host.textContent).toContain('Cashu token (3% fee)'); const input = host.querySelector<HTMLInputElement>('#routstr-wcashu-input')!;
  input.value = 'cashuAPRIVATE TOKEN'; expect(view.readToken()).toBe('cashuAPRIVATE TOKEN');
  view.showInvoice(invoice); view.setState({ ...view.getState(), phase: 'invoice' });
  const text = host.querySelector<HTMLTextAreaElement>('textarea')!; expect(text.value).toBe(invoice.invoice);
  expect(host.querySelector('[data-token],[data-clipboard-text],[data-quote],[data-mint]')).toBeNull();
  expect(JSON.stringify(view.getState())).not.toContain('PRIVATE'); expect(host.innerHTML).not.toContain('cashuAPRIVATE TOKEN');
  disposeWalletFunding(); expect(input.value).toBe(''); expect(text.value).toBe(''); expect(view.readInvoice()).toBeNull(); expect(view.readToken()).toBe(''); expect(getWalletFundingView()).toBeNull();
});
it('preserves focused token drafts and open invoice disclosure across funding status and QR updates', () => {
  const { host, view } = mount(); const input = host.querySelector<HTMLInputElement>('#routstr-wcashu-input')!;
  input.value = 'cashuAAUTOFILL'; input.focus(); view.showInvoice(invoice); view.setState({ ...view.getState(), phase: 'invoice' });
  const details = host.querySelector('details')!; details.open = true; view.setCopied(); view.showInvoice({ ...invoice, qrImage: 'data:image/svg+xml,%3Csvg/%3E' });
  view.setState({ ...view.getState(), poll: 'Payment confirmation delayed' });
  expect(input).toBe(document.activeElement); expect(view.readToken()).toBe('cashuAAUTOFILL'); expect(host.querySelector('details')).toBe(details); expect(details.open).toBe(true); expect(host.textContent).toContain('✓ Copied');
});
it('owns custom keyboard handlers and prevents duplicate delegated submissions', () => {
  const submit = vi.fn(), cancel = vi.fn(); const { host, view } = mount({ submitCustom: submit, cancelCustom: cancel });
  view.setState({ ...view.getState(), custom: true }); view.focusCustomAmount(); const input = host.querySelector<HTMLInputElement>('#routstr-wfund-custom')!;
  expect(document.activeElement).toBe(input); expect(input.dataset.routstrWalletKey).toBeUndefined(); input.value = '1,000'; expect(view.readCustomAmount()).toBe('1,000');
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); expect(submit).toHaveBeenCalledOnce();
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); expect(cancel).toHaveBeenCalledOnce();
  view.setState({ ...view.getState(), pending: true }); expect(host.querySelector<HTMLButtonElement>('[data-routstr-wallet-action="fund-wallet-preset"]')!.disabled).toBe(true);
});
it('matches private invoice identity across mints and replaces QR only after confirmed receipt', () => {
  const { host, view } = mount(); view.showInvoice(invoice); view.setState({ ...view.getState(), phase: 'invoice' });
  applyWalletFundingResult({ mint: 'https://other.test', results: [{ quote: invoice.quote, paid: true, minted: 1000 }] }); expect(host.querySelector('a')).not.toBeNull();
  applyWalletFundingResult({ mint: invoice.mint, results: [{ quote: 'other', paid: true, minted: 1000 }] }); expect(host.querySelector('a')).not.toBeNull();
  applyWalletFundingResult({ mint: invoice.mint, results: [{ quote: invoice.quote, paid: true, minted: 'malformed' }] }); expect(host.querySelector('a')).not.toBeNull();
  applyWalletFundingResult({ mint: 'https://other.test', results: [{ quote: invoice.quote, mint: invoice.mint, paid: true, minted: 1000, fee: 2 }] });
  expect(host.textContent).toContain('+998 sats added'); expect(view.readInvoice()).toBeNull(); expect(host.querySelector('a')).toBeNull();
});
it.each(['EXPIRED', 'CANCELLED', 'CANCELED'])('retires terminal private invoice %s and prevents stale updates after replacement', state => {
  const { host, view } = mount(); view.showInvoice(invoice); view.setState({ ...view.getState(), phase: 'invoice' });
  applyWalletFundingResult({ mint: invoice.mint, results: [{ quote: invoice.quote, state }] });
  expect(host.textContent).toContain('expired or was cancelled'); expect(view.readInvoice()).toBeNull();
  host.replaceChildren(); const replacement = mountWalletFunding(host, 0, { submitCustom: () => {}, cancelCustom: () => {} });
  view.setState({ ...view.getState(), status: { text: 'STALE SECRET', tone: 'danger' } }); expect(host.textContent).not.toContain('STALE'); expect(replacement.isCurrent()).toBe(true);
});
