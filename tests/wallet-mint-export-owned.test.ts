// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { mountWalletMint, getWalletMintView, disposeWalletMint } from '../js/wallet-mint-component.js';
import { createWalletMintController } from '../js/wallet-mint-controller.js';
import { mountWalletExport, getWalletExportView, disposeWalletExport } from '../js/wallet-export-component.js';
import { createWalletExportController } from '../js/wallet-export-controller.js';
import type { WalletMintView } from '../js/wallet-mint-contract.js';
const mint = 'https://mint.original.test', other = 'https://mint.other.test', token = 'cashuAPRIVATE BACKUP';
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function mintView() { const host = document.createElement('div'); document.body.append(host); const view = mountWalletMint(host, { save: () => {}, cancel: () => {}, reload: () => {} }); return { host, view }; }
function mintFixture() {
  const ui = mintView(); let active = true; const finished = vi.fn(async (_mint: string) => {});
  const deps = { view: getWalletMintView, isActive: () => active, node: vi.fn(() => 'https://node.test'),
    mint: vi.fn(async () => mint), inventory: vi.fn(async (): Promise<unknown> => [{ mint, balance: 12 }, { mint: other, balance: 7 }]), accepted: vi.fn(async (_node: string) => [other]),
    checkMint: vi.fn(async (_mint: string): Promise<'valid' | 'invalid' | 'unreachable'> => 'valid'), select: vi.fn(async (_mint: string, _expected: string): Promise<unknown> => undefined),
    captureSelection: () => finished, close: vi.fn((_view: WalletMintView) => disposeWalletMint()), notify: vi.fn() };
  return { ...ui, deps, finished, controller: createWalletMintController(deps), deactivate: () => { active = false; } };
}
function exportView() { const host = document.createElement('div'); document.body.append(host); const view = mountWalletExport(host, { prepare: () => {}, copy: () => {}, close: () => {} }); return { host, view }; }
function exportFixture() {
  const ui = exportView(); let active = true; const clears: (() => void)[] = [];
  const deps = { view: getWalletExportView, isActive: () => active, mint: vi.fn(async () => mint), export: vi.fn(async (_mint: string): Promise<unknown> => token), writeClipboard: vi.fn(async (_token: string) => {}), scheduleClear: (clear: () => void) => { clears.push(clear); }, notify: vi.fn() };
  return { ...ui, deps, clears, controller: createWalletExportController(deps), deactivate: () => { active = false; } };
}
afterEach(() => { disposeWalletMint(); disposeWalletExport(); document.body.replaceChildren(); vi.restoreAllMocks(); });
it('shows saved balances before optional node discovery without replacing an edited or autofilled draft', async () => {
  const f = mintFixture(), hints = deferred<string[]>(); f.deps.accepted.mockReturnValue(hints.promise);
  const pending = f.controller.load(f.view); await vi.waitFor(() => expect(f.view.getState().loading).toBe(false));
  expect(f.host.textContent).toContain('12 sats'); expect(f.view.getState().hints).toBe('loading');
  const input = f.host.querySelector<HTMLInputElement>('input')!; input.value = 'https://mint.draft.test'; input.focus();
  hints.resolve([other]); await pending; expect(input.value).toBe('https://mint.draft.test'); expect(document.activeElement).toBe(input);
  await f.controller.load(f.view); expect(f.view.readDraft()).toBe('https://mint.draft.test');
  f.view.setDraft(''); await f.controller.load(f.view); expect(f.view.readDraft()).toBe('');
});
it('selects saved mints offline and passes the captured original mint into the locked domain action', async () => {
  const f = mintFixture(); f.deps.accepted.mockRejectedValue(new Error('offline')); await f.controller.load(f.view);
  expect(f.host.textContent).toContain('selectable offline'); f.view.setDraft(other + '/'); await f.controller.save();
  expect(f.deps.checkMint).not.toHaveBeenCalled(); expect(f.deps.select).toHaveBeenCalledExactlyOnceWith(other, mint); expect(f.finished).toHaveBeenCalledExactlyOnceWith(other);
});
it.each(['http://mint.test', 'https://localhost', 'https://127.0.0.1', 'https://10.0.0.1', 'https://169.254.169.254', 'https://[::1]', 'not a URL'])('rejects unsafe mint %s before network checks or persisted selection', async value => {
  const f = mintFixture(); await f.controller.load(f.view); f.view.setDraft(value); await f.controller.save();
  expect(f.deps.checkMint).not.toHaveBeenCalled(); expect(f.deps.select).not.toHaveBeenCalled(); expect(f.view.getState().status.text).toContain('valid public mint URL');
});
it.each(['invalid', 'unreachable'] as const)('retains the new mint draft after a %s info response', async result => {
  const f = mintFixture(); await f.controller.load(f.view); f.view.setDraft('https://new.mint.test'); f.deps.checkMint.mockResolvedValue(result); await f.controller.save();
  expect(f.deps.select).not.toHaveBeenCalled(); expect(f.view.readDraft()).toBe('https://new.mint.test'); expect(f.view.getState().pending).toBe(false); expect(f.view.getState().status.tone).toBe('danger');
});
it('drops old node hints and failed inventory replies after the owner changes', async () => {
  const f = mintFixture(), hints = deferred<string[]>(); f.deps.accepted.mockReturnValue(hints.promise);
  const pending = f.controller.load(f.view); await vi.waitFor(() => expect(f.deps.accepted).toHaveBeenCalled()); f.deps.node.mockReturnValue('https://new.node.test'); hints.resolve([other]); await pending;
  expect(f.view.getState().accepted).toEqual([]); expect(f.view.getState().hints).toBe('unavailable');
  const rows = deferred<unknown>(); f.deps.inventory.mockReturnValue(rows.promise); const late = f.controller.load(f.view); const replacement = mintView(); rows.reject(new Error(token)); await late;
  expect(replacement.host.textContent).not.toContain('unavailable'); expect(replacement.host.textContent).not.toContain(token);
});
it.each(['draft', 'provider', 'owner', 'mint'] as const)('cancels mint selection when %s changes before domain acceptance', async change => {
  const f = mintFixture(), checked = deferred<'valid'>(); await f.controller.load(f.view); f.view.setDraft('https://new.mint.test'); f.deps.checkMint.mockReturnValue(checked.promise);
  const pending = f.controller.save(); await vi.waitFor(() => expect(f.deps.checkMint).toHaveBeenCalled());
  if (change === 'draft') f.view.setDraft(other); if (change === 'provider') f.deactivate(); if (change === 'owner') mintView(); if (change === 'mint') f.deps.mint.mockResolvedValue(other);
  checked.resolve('valid'); await pending; expect(f.deps.select).not.toHaveBeenCalled();
});
it('finishes accepted mint selection once after close without hiding a replacement picker', async () => {
  const f = mintFixture(), accepted = deferred<unknown>(); await f.controller.load(f.view); f.view.setDraft(other); f.deps.select.mockReturnValue(accepted.promise);
  const pending = f.controller.save(); await vi.waitFor(() => expect(f.deps.select).toHaveBeenCalledOnce());
  const replacement = mintView(); replacement.view.setDraft('https://later.mint.test'); await f.controller.save(); accepted.resolve(undefined); await pending;
  expect(f.deps.select).toHaveBeenCalledOnce(); expect(f.finished).toHaveBeenCalledOnce(); expect(f.deps.close).not.toHaveBeenCalled(); expect(replacement.view.readDraft()).toBe('https://later.mint.test'); expect(replacement.view.getState().mint).toBe(other);
});
it('retains saved balances and uses generic copy for secret-bearing domain failures', async () => {
  const f = mintFixture(); await f.controller.load(f.view); f.view.setDraft(other); f.deps.select.mockRejectedValue(new Error(token)); await f.controller.save();
  expect(f.view.getState().saved).toHaveLength(2); expect(f.view.getState().status.text).toContain('recovery records are preserved'); expect(f.host.textContent).not.toContain(token);
  f.deps.select.mockRejectedValue(new Error('Wallet mint changed before selection.')); await f.controller.save(); expect(f.view.getState().status.text).toContain('Reload balances');
});
it('keeps malformed balances explicitly unavailable and rejects malformed inventory', async () => {
  const f = mintFixture(); f.deps.inventory.mockResolvedValue([{ mint, balance: '12' }]); await f.controller.load(f.view); expect(f.view.getState().saved[0]!.balance).toBeNull(); expect(f.host.textContent).toContain('—');
  f.deps.inventory.mockResolvedValue({ broken: true }); await f.controller.load(f.view); expect(f.view.getState().status.text).toContain('Saved balances unavailable');
});
it('uses local row and keyboard actions without triggering the legacy click delegate twice', () => {
  const host = document.createElement('div'); document.body.append(host); const save = vi.fn(), cancel = vi.fn(), delegated = vi.fn(); document.addEventListener('click', delegated);
  const view = mountWalletMint(host, { save, cancel, reload: () => {} }); view.setState({ ...view.getState(), mint, saved: [{ mint: other, balance: 7 }], loading: false });
  host.querySelector<HTMLButtonElement>('[data-mint-url]')!.click(); expect(view.readDraft()).toBe(other); expect(host.querySelector('[data-mint-url]')!.getAttribute('aria-pressed')).toBe('true');
  const input = host.querySelector<HTMLInputElement>('input')!; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); expect(save).toHaveBeenCalledOnce();
  host.querySelector<HTMLButtonElement>('[data-routstr-wallet-action="save-mint"]')!.click(); host.querySelector<HTMLButtonElement>('[data-routstr-wallet-action="cancel-mint"]')!.click(); expect(save).toHaveBeenCalledTimes(2); expect(cancel).toHaveBeenCalledOnce(); expect(delegated).not.toHaveBeenCalled(); document.removeEventListener('click', delegated);
});
it('exports at the captured mint without placing token text in snapshots or attributes and scrubs retained fields on close', async () => {
  const f = exportFixture(); await f.controller.prepare(f.view); expect(f.deps.export).toHaveBeenCalledExactlyOnceWith(mint); expect(f.deps.writeClipboard).toHaveBeenCalledExactlyOnceWith(token);
  const text = f.host.querySelector<HTMLTextAreaElement>('textarea')!; expect(text.value).toBe(token); expect(f.host.innerHTML).not.toContain(token); expect(JSON.stringify(f.view.getState())).not.toContain(token); expect(f.host.querySelector('[data-token],[data-clipboard-text]')).toBeNull();
  disposeWalletExport(); expect(text.value).toBe(''); expect(f.view.readToken()).toBe(''); f.clears[0]!(); await Promise.resolve(); expect(f.deps.writeClipboard).toHaveBeenLastCalledWith('');
});
it('keeps private token text available for manual copying when clipboard access fails', async () => {
  const f = exportFixture(); f.deps.writeClipboard.mockRejectedValue(new Error(token)); await f.controller.prepare(f.view);
  expect(f.view.getState().phase).toBe('ready'); expect(f.host.textContent).toContain('copy it manually'); expect(f.host.textContent).not.toContain(token); expect(f.view.readToken()).toBe(token);
  const details = f.host.querySelector('details')!; details.open = true; const text = f.host.querySelector<HTMLTextAreaElement>('textarea')!; text.focus(); f.view.setState({ ...f.view.getState(), status: { text: 'retry', tone: 'secondary' } }); expect(details.open).toBe(true); expect(document.activeElement).toBe(text); expect(text.selectionEnd).toBe(token.length);
});
it.each(['provider', 'owner', 'mint'] as const)('does not show or copy a prepared token after %s changes', async change => {
  const f = exportFixture(), exported = deferred<unknown>(); f.deps.export.mockReturnValue(exported.promise); const pending = f.controller.prepare(f.view); await vi.waitFor(() => expect(f.deps.export).toHaveBeenCalled());
  if (change === 'provider') f.deactivate(); if (change === 'owner') exportView(); if (change === 'mint') f.deps.mint.mockResolvedValue(other);
  exported.resolve(token); await pending; expect(f.deps.writeClipboard).not.toHaveBeenCalled(); expect(getWalletExportView()?.readToken()).toBe(''); expect(document.body.textContent).not.toContain(token);
});
it('rejects a stale copy and erases its private token before allowing a new export', async () => {
  const f = exportFixture(); await f.controller.prepare(f.view); f.deps.writeClipboard.mockClear(); f.deps.mint.mockResolvedValue(other); await f.controller.copy();
  expect(f.deps.writeClipboard).not.toHaveBeenCalled(); expect(f.view.readToken()).toBe(''); expect(f.view.getState().phase).toBe('error'); expect(f.host.textContent).toContain('Wallet mint changed');
});
it('single-flights export across remounts and never overwrites the replacement owner', async () => {
  const f = exportFixture(), result = deferred<unknown>(); f.deps.export.mockReturnValue(result.promise); const pending = f.controller.prepare(f.view); await vi.waitFor(() => expect(f.deps.export).toHaveBeenCalled());
  const next = exportView(); await f.controller.prepare(next.view); expect(f.deps.export).toHaveBeenCalledOnce(); expect(next.host.textContent).toContain('already in progress'); result.resolve(token); await pending; expect(next.view.readToken()).toBe('');
  f.deps.export.mockResolvedValue(token); await f.controller.prepare(next.view); expect(next.view.readToken()).toBe(token);
});
it.each([null, '', { token }, new Error(token)])('offers a safe empty/error retry for an export without a usable token', async value => {
  const f = exportFixture(); if (value instanceof Error) f.deps.export.mockRejectedValue(value); else f.deps.export.mockResolvedValue(value); await f.controller.prepare(f.view);
  expect(f.deps.writeClipboard).not.toHaveBeenCalled(); expect(f.view.readToken()).toBe(''); expect(f.host.textContent).not.toContain(token); expect(f.host.textContent).toContain('Refresh export');
});
it('finishes an accepted copy after close and keeps its clearing callback without changing a new view', async () => {
  const f = exportFixture(), copied = deferred<void>(); f.deps.writeClipboard.mockReturnValue(copied.promise); const pending = f.controller.prepare(f.view); await vi.waitFor(() => expect(f.deps.writeClipboard).toHaveBeenCalled());
  const next = exportView(); copied.resolve(); await pending; expect(next.view.getState().copied).toBe(false); expect(next.view.readToken()).toBe(''); expect(f.clears).toHaveLength(1);
});
