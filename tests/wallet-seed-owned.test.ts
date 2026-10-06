// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { disposeWalletSeed, getWalletSeedView, mountWalletSeed } from '../js/wallet-seed-component.js';
import { createWalletSeedController } from '../js/wallet-seed-controller.js';
import type { WalletSeedView } from '../js/wallet-seed-contract.js';
const words = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function mount(mode: 'manage' | 'missing' | 'onboarding' = 'manage') {
  const host = document.createElement('div'); document.body.append(host);
  const view = mountWalletSeed(host, { copy: () => {}, create: () => {}, restore: () => {}, continue: () => {} });
  view.setState({ mode, pending: false, status: { text: '', tone: 'secondary' } }); return { host, view };
}
function fixture() {
  const ui = mount(); let active = true; const clears: (() => void)[] = [];
  const deps = { view: getWalletSeedView, isActive: () => active, hasSeed: vi.fn(async (): Promise<unknown> => false),
    generate: vi.fn(async (): Promise<unknown> => ({ mnemonic: words })), mnemonic: vi.fn(async (): Promise<unknown> => words),
    restore: vi.fn(async (_words: string): Promise<unknown> => ({ balance: 4321 })), refresh: vi.fn(), notify: vi.fn(),
    writeClipboard: vi.fn(async (_text: string) => {}), scheduleClear: (clear: () => void) => { clears.push(clear); },
    close: vi.fn((_view: WalletSeedView) => disposeWalletSeed()) };
  return { ...ui, deps, clears, controller: createWalletSeedController(deps), deactivate: () => { active = false; } };
}
afterEach(() => { disposeWalletSeed(); document.body.replaceChildren(); vi.restoreAllMocks(); });
it('keeps masked recovery words and restore autofill out of snapshots/attributes and scrubs on close', () => {
  const { host, view } = mount(); view.setMnemonic(words);
  const input = host.querySelector<HTMLTextAreaElement>('textarea')!; input.value = words;
  expect(view.readRestore()).toBe(words); expect(view.readMnemonic()).toBe(words);
  expect(host.innerHTML).not.toContain(words); expect(JSON.stringify(view.getState())).not.toContain(words);
  expect(host.querySelector('[data-clipboard-text],[data-token],[data-mnemonic]')).toBeNull();
  const reveal = host.querySelector<HTMLButtonElement>('#wallet-seed-display')!;
  expect(reveal.getAttribute('aria-pressed')).toBe('false'); reveal.click();
  expect(reveal.textContent).toBe(words); expect(reveal.getAttribute('aria-pressed')).toBe('true');
  view.setState({ ...view.getState(), status: { text: 'Updated receipt', tone: 'secondary' } }); expect(reveal.textContent).toBe(words);
  reveal.click(); expect(host.textContent).not.toContain(words);
  reveal.click(); expect(reveal.textContent).toBe(words);
  disposeWalletSeed(); expect(input.value).toBe(''); expect(reveal.textContent).not.toContain(words); expect(view.readMnemonic()).toBe(''); expect(view.readRestore()).toBe('');
});
it('renders restored words as inert text while retaining form focus through status updates', () => {
  const { host, view } = mount(); const input = host.querySelector<HTMLTextAreaElement>('textarea')!;
  input.value = words; input.focus(); view.setState({ ...view.getState(), status: { text: 'Invalid mnemonic', tone: 'danger' } });
  expect(document.activeElement).toBe(input); expect(input.value).toBe(words);
  view.setMnemonic('<img src=x onerror=alert(1)>'); host.querySelector<HTMLButtonElement>('#wallet-seed-display')!.click();
  expect(host.textContent).toContain('<img src=x onerror=alert(1)>'); expect(host.querySelector('img')).toBeNull();
  view.setMnemonic(words); expect(host.querySelector('#wallet-seed-display')!.getAttribute('aria-pressed')).toBe('false');
});
it('requires explicit acknowledgement from the originating owner and continues exactly once', async () => {
  const f = fixture(); const after = vi.fn(); await f.controller.ensure(f.view, after);
  const button = f.host.querySelector<HTMLButtonElement>('#routstr-seed-continue')!;
  expect(button.disabled).toBe(true); await f.controller.acknowledge(); expect(after).not.toHaveBeenCalled();
  const checkbox = f.host.querySelector<HTMLInputElement>('#routstr-seed-ack')!; checkbox.checked = true; checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  expect(button.disabled).toBe(false); await f.controller.acknowledge(); await f.controller.acknowledge();
  expect(after).toHaveBeenCalledOnce(); expect(f.deps.close).toHaveBeenCalledWith(f.view); expect(f.deps.refresh).toHaveBeenCalledOnce(); expect(f.host.textContent).not.toContain(words);
});
it('does not carry an acknowledged continuation into a replacement view', async () => {
  const f = fixture(), after = vi.fn(); await f.controller.ensure(f.view, after);
  const checkbox = f.host.querySelector<HTMLInputElement>('#routstr-seed-ack')!; checkbox.checked = true;
  const replacement = mount('onboarding'); replacement.view.setMnemonic(words);
  const nextAck = replacement.host.querySelector<HTMLInputElement>('#routstr-seed-ack')!; nextAck.checked = true;
  await f.controller.acknowledge(); expect(after).not.toHaveBeenCalled(); expect(f.deps.close).not.toHaveBeenCalled();
});
it('rejects seed prerequisite results after provider change or panel replacement', async () => {
  const f = fixture(), after = vi.fn(), ready = deferred<unknown>(); f.deps.hasSeed.mockReturnValue(ready.promise);
  const pending = f.controller.ensure(f.view, after); f.deactivate(); ready.resolve(true); await pending;
  expect(after).not.toHaveBeenCalled(); expect(f.deps.generate).not.toHaveBeenCalled();
  const reading = deferred<unknown>(); const g = fixture(); g.deps.mnemonic.mockReturnValue(reading.promise);
  const load = g.controller.load(g.view); const replacement = mount('missing'); reading.resolve(words); await load;
  expect(replacement.view.readMnemonic()).toBe(''); expect(replacement.host.textContent).not.toContain(words);
});
it('shares accepted seed generation and gives acknowledgement only to the latest owner', async () => {
  const f = fixture(), generated = deferred<unknown>(), firstAfter = vi.fn(), secondAfter = vi.fn(); f.deps.generate.mockReturnValue(generated.promise);
  const first = f.controller.ensure(f.view, firstAfter); await Promise.resolve();
  const secondView = mount(); const second = f.controller.ensure(secondView.view, secondAfter); await Promise.resolve();
  expect(f.deps.generate).toHaveBeenCalledOnce(); generated.resolve({ mnemonic: words }); await Promise.all([first, second]);
  expect(secondView.view.getState().mode).toBe('onboarding'); expect(firstAfter).not.toHaveBeenCalled();
  secondView.host.querySelector<HTMLInputElement>('#routstr-seed-ack')!.checked = true; await f.controller.acknowledge();
  expect(secondAfter).toHaveBeenCalledOnce(); expect(firstAfter).not.toHaveBeenCalled();
});
it('accepts existing local seed without generation and reports continuation failures safely', async () => {
  const f = fixture(); f.deps.hasSeed.mockResolvedValue(true);
  const after = vi.fn(async () => { throw new Error(words); }); await f.controller.ensure(f.view, after);
  expect(f.deps.generate).not.toHaveBeenCalled(); expect(after).toHaveBeenCalledOnce();
  const g = fixture(); await g.controller.ensure(g.view, after); g.host.querySelector<HTMLInputElement>('#routstr-seed-ack')!.checked = true;
  await g.controller.acknowledge(); expect(g.deps.notify.mock.calls[0]![0]).not.toContain(words);
});
it('normalizes all whitespace and case, keeps accepted restoration single flight, and clears the private draft on success', async () => {
  const f = fixture(), result = deferred<unknown>(); f.deps.restore.mockReturnValue(result.promise);
  const input = f.host.querySelector<HTMLTextAreaElement>('textarea')!; input.value = '  ' + words.toUpperCase().replaceAll(' ', '\n  ') + '\t';
  const first = f.controller.restore(); const duplicate = f.controller.restore();
  expect(f.deps.restore).toHaveBeenCalledExactlyOnceWith(words); expect(input.disabled).toBe(true);
  result.resolve({ balance: 4321 }); await Promise.all([first, duplicate]);
  expect(f.host.textContent).toContain('4,321 sats'); expect(input.value).toBe(''); expect(f.view.readMnemonic()).toBe(words);
  expect(f.host.textContent).not.toContain(words); expect(f.deps.refresh).toHaveBeenCalledOnce();
});
it('finishes accepted restoration after close without writing private words or receipt into a new owner', async () => {
  const f = fixture(), result = deferred<unknown>(); f.deps.restore.mockReturnValue(result.promise);
  f.host.querySelector<HTMLTextAreaElement>('textarea')!.value = words; const pending = f.controller.restore();
  const replacement = mount('missing'); replacement.host.querySelector<HTMLTextAreaElement>('textarea')!.value = 'later draft';
  await f.controller.restore(); expect(f.deps.restore).toHaveBeenCalledOnce(); result.resolve({ balance: 4321 }); await pending;
  expect(replacement.view.readRestore()).toBe('later draft'); expect(replacement.view.readMnemonic()).toBe(''); expect(replacement.host.textContent).not.toContain('Restored!');
  expect(f.deps.notify).toHaveBeenCalledWith('Wallet restored', 'success'); expect(f.deps.refresh).toHaveBeenCalledOnce();
});
it.each([
  ['one two', 'Enter exactly 12 words'],
  ['<script> ' + words.split(' ').slice(1).join(' '), 'Invalid mnemonic'],
])('validates restore input %s before the domain call', async (draft, message) => {
  const f = fixture(); f.host.querySelector<HTMLTextAreaElement>('textarea')!.value = draft;
  await f.controller.restore(); expect(f.deps.restore).not.toHaveBeenCalled(); expect(f.host.textContent).toContain(message); expect(f.view.readRestore()).toBe(draft);
});
it.each([
  ['Invalid mnemonic — check your words', 'Invalid mnemonic'],
  ['Cannot replace the wallet seed while funds or recovery records exist.', 'Back up and empty this wallet first'],
  ['Wallet restore was incomplete and made no proof changes: PRIVATE REQUEST ' + words, 'made no proof changes'],
  ['PRIVATE REQUEST ' + words, 'Local funds and recovery records are retained'],
])('preserves actionable recovery failures without echoing private transport exceptions: %s', async (error, message) => {
  const f = fixture(); f.host.querySelector<HTMLTextAreaElement>('textarea')!.value = words; f.deps.restore.mockRejectedValue(new Error(error));
  await f.controller.restore(); expect(f.host.textContent).toContain(message); expect(f.host.textContent).not.toContain(words); expect(f.view.readRestore()).toBe(words); expect(f.view.getState().pending).toBe(false);
});
it('copies private words and retains scheduled clearing after close while suppressing stale feedback', async () => {
  const f = fixture(), copied = deferred<void>(); f.view.setMnemonic(words); f.deps.writeClipboard.mockReturnValueOnce(copied.promise);
  const copying = f.controller.copy(); const replacement = mount('missing'); copied.resolve(); await copying;
  expect(f.deps.writeClipboard).toHaveBeenCalledWith(words); expect(replacement.host.textContent).not.toContain('Copied');
  f.clears[0]!(); await Promise.resolve(); expect(f.deps.writeClipboard).toHaveBeenCalledWith('');
});
it('allows manual reveal on clipboard failure and suppresses malformed restore receipts', async () => {
  const f = fixture(); f.view.setMnemonic(words); f.deps.writeClipboard.mockRejectedValue(new Error(words)); await f.controller.copy();
  expect(f.host.textContent).toContain('Reveal the seed phrase'); expect(f.host.textContent).not.toContain(words); expect(f.clears).toEqual([]);
  f.host.querySelector<HTMLTextAreaElement>('textarea')!.value = words; f.deps.restore.mockResolvedValue({ balance: '4321' }); await f.controller.restore();
  expect(f.host.textContent).not.toContain('Restored!'); expect(f.deps.notify).not.toHaveBeenCalled(); expect(f.view.readRestore()).toBe(words);
});
