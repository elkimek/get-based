// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { makeTestInvoice } from './fixtures/lightning-invoices.js';
import { createWalletFundingController } from '../js/wallet-funding-controller.js';
import { disposeWalletFunding, getWalletFundingView, mountWalletFunding } from '../js/wallet-funding-component.js';
const mintUrl = 'https://mint.test';
function mounted() { const host = document.createElement('div'); document.body.append(host); return mountWalletFunding(host, 0, { submitCustom: () => {}, cancelCustom: () => {} }); }
function fixture() {
  const deps = { view: getWalletFundingView, isActive: () => true, mint: vi.fn(async () => mintUrl),
    createInvoice: vi.fn(async (amount: number): Promise<unknown> => ({ invoice: makeTestInvoice(amount), quote: 'private-quote', mint: mintUrl })),
    receiveToken: vi.fn(async (_token: string): Promise<unknown> => ({ received: 500, fee: 2 })),
    renderInvoice: vi.fn(async (invoice: NonNullable<ReturnType<NonNullable<ReturnType<typeof getWalletFundingView>>['readInvoice']>>) => { const view = getWalletFundingView()!; view.showInvoice(invoice); view.setState({ ...view.getState(), phase: 'invoice', pending: false }); }),
    startMonitor: vi.fn(), refreshBalance: vi.fn(), notify: vi.fn(), writeClipboard: vi.fn(async (_text: string) => {}), close: vi.fn() };
  return { deps, controller: createWalletFundingController(deps) };
}
afterEach(() => { disposeWalletFunding(); document.body.replaceChildren(); });
it('validates whole sats and minimum, single-flights creation and reuses the displayed invoice', async () => {
  const view = mounted(); const { deps, controller } = fixture();
  for (const amount of [NaN, Infinity, 99, -1, 100.5, Number.MAX_SAFE_INTEGER + 1]) expect(await controller.fund(amount)).toBe(false);
  expect(deps.createInvoice).not.toHaveBeenCalled(); expect(view.getState().status.text).toContain('Minimum 100');
  const first = controller.fund(1000); expect(controller.fund(1000)).toBe(first); expect(await first).toBe(true);
  expect(await controller.fund(1000)).toBe(true); expect(deps.createInvoice).toHaveBeenCalledOnce(); expect(deps.startMonitor).toHaveBeenCalledOnce();
  expect(JSON.stringify(view.getState())).not.toContain('private-quote');
});
it('keeps accepted quotes after close and shows them only at their own mint on reopening', async () => {
  mounted(); const { deps, controller } = fixture(); let finish!: (value: unknown) => void;
  deps.createInvoice.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = controller.fund(1000); await vi.waitFor(() => expect(deps.createInvoice).toHaveBeenCalledOnce());
  disposeWalletFunding(); const next = mounted(); finish({ invoice: makeTestInvoice(1000), quote: 'saved-quote', mint: mintUrl }); await pending;
  expect(deps.renderInvoice).not.toHaveBeenCalled(); expect(next.readInvoice()).toBeNull(); expect(deps.startMonitor).toHaveBeenCalledOnce();
  deps.mint.mockResolvedValue('https://other.test'); await controller.showCached(next); expect(deps.renderInvoice).not.toHaveBeenCalled();
  deps.mint.mockResolvedValue(mintUrl); await controller.showCached(next); expect(next.readInvoice()?.quote).toBe('saved-quote');
  controller.acceptResult({ mint: 'https://other.test', results: [{ quote: 'saved-quote', state: 'EXPIRED' }] }); await controller.showCached(next); expect(deps.renderInvoice).toHaveBeenCalledTimes(2);
  controller.acceptResult({ mint: mintUrl, results: [{ quote: 'saved-quote', state: 'EXPIRED' }] }); next.clearInvoice(); await controller.showCached(next); expect(next.readInvoice()).toBeNull();
});
it('does not begin an invoice after the owner or mint changes during prerequisite work', async () => {
  mounted(); const { deps, controller } = fixture(); deps.mint.mockResolvedValueOnce(mintUrl).mockResolvedValueOnce('https://other.test');
  expect(await controller.fund(1000)).toBe(false); expect(deps.createInvoice).not.toHaveBeenCalled();
  deps.mint.mockImplementation(async () => { disposeWalletFunding(); mounted(); return mintUrl; });
  expect(await controller.fund(1000)).toBe(false); expect(deps.createInvoice).not.toHaveBeenCalled();
});
it('reports malformed invoices without rendering or erasing persisted recovery data', async () => {
  const view = mounted(); const { deps, controller } = fixture(); deps.createInvoice.mockResolvedValue({ invoice: 'private-error-invalid', quote: 'saved-private-quote' });
  expect(await controller.fund(1000)).toBe(false); expect(deps.renderInvoice).not.toHaveBeenCalled(); expect(view.getState().status.text).toContain('saved recovery data is retained'); expect(view.getState().status.text).not.toContain('private-error-invalid');
});
it('reconciles accepted token imports after close without clearing or hiding a new view', async () => {
  mounted(); const { deps, controller } = fixture(); let finish!: (value: unknown) => void;
  deps.receiveToken.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = controller.receive('cashu:cashuAPRIVATE'); expect(deps.receiveToken).toHaveBeenCalledWith('cashuAPRIVATE');
  await controller.receive('cashuAduplicate'); expect(deps.receiveToken).toHaveBeenCalledOnce();
  disposeWalletFunding(); const next = mounted(); const input = document.getElementById('routstr-wcashu-input') as HTMLInputElement; input.value = 'cashuANEW';
  finish({ received: 500, fee: 2 }); await pending;
  expect(next.readToken()).toBe('cashuANEW'); expect(deps.close).not.toHaveBeenCalled(); expect(deps.refreshBalance).toHaveBeenCalledOnce(); expect(deps.notify).toHaveBeenCalledWith('Wallet funded ⚡ +500 sats (2 fee)', 'success');
});
it('retains failed token drafts and never displays secret-bearing transport exceptions', async () => {
  const view = mounted(); const { deps, controller } = fixture(); const input = document.getElementById('routstr-wcashu-input') as HTMLInputElement; input.value = 'cashuAPRIVATE';
  deps.receiveToken.mockRejectedValue(new Error('cashuAPRIVATE raw recovery-token')); await controller.receive();
  expect(view.readToken()).toBe('cashuAPRIVATE'); expect(view.getState().status.text).toContain('Saved recovery data is retained'); expect(view.getState().status.text).not.toContain('PRIVATE');
  input.value = 'bad'; await controller.receive(); expect(deps.receiveToken).toHaveBeenCalledOnce(); expect(view.getState().status.text).toContain('valid Cashu token');
});
it('copies via private ports and suppresses feedback for a replaced invoice or view', async () => {
  const view = mounted(); const { deps, controller } = fixture(); await controller.fund(1000); let finish!: () => void;
  deps.writeClipboard.mockImplementation(() => new Promise(resolve => { finish = resolve; })); const pending = controller.copy();
  expect(deps.writeClipboard).toHaveBeenCalledWith(view.readInvoice()!.invoice); disposeWalletFunding(); const next = mounted(); finish(); await pending;
  expect(document.body.textContent).not.toContain('✓ Copied'); expect(next.readInvoice()).toBeNull();
});
