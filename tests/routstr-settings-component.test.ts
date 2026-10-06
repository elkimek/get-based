// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { initialRoutstrSettingsState } from '../js/routstr-settings-contract.js';
import type { RoutstrSettingsActions } from '../js/routstr-settings-contract.js';
import { disposeRoutstrSettings, getRoutstrSettingsView, mountRoutstrSettings } from '../js/routstr-settings-component.js';
import { mountRoutstrModelSettings, getRoutstrModelSettingsView } from '../js/routstr-model-settings-component.js';
import { mountWalletNode, getWalletNodeView } from '../js/wallet-node-component.js';
const node = 'https://synthetic-routstr.test';
const actions = (): RoutstrSettingsActions => ({ wallet: vi.fn(), node: vi.fn(), mints: vi.fn(), refreshWallet: vi.fn(), refreshNode: vi.fn(), refunds: vi.fn(), copyRecovery: vi.fn(), reclaimRecovery: vi.fn() });
function mounted() {
  const host = document.createElement('div'); document.body.append(host); const callbacks = actions();
  return { host, callbacks, view: mountRoutstrSettings(host, initialRoutstrSettingsState(node, true), callbacks, { node, key: 'sk-PRIVATE-ACCOUNT' }) };
}
afterEach(() => { disposeRoutstrSettings(); document.body.replaceChildren(); });
it('keeps account and recovery secrets behind private ports and scrubs retained fields and replaced owners', () => {
  const { host, view } = mounted(); view.showRecovery('deposit', 'PRIVATE-DEPOSIT'); view.showRecovery('withdraw', 'PRIVATE-WITHDRAW');
  const fields = [...host.querySelectorAll<HTMLTextAreaElement>('textarea')]; expect(fields.map(field => field.value)).toEqual(['PRIVATE-DEPOSIT','PRIVATE-WITHDRAW']);
  expect(JSON.stringify(view.getState())).not.toContain('PRIVATE'); expect(host.innerHTML).not.toContain('PRIVATE');
  expect(host.querySelector('[data-token],[data-clipboard-text],[data-key],[data-generation]')).toBeNull();
  host.replaceChildren(); mountRoutstrSettings(host, initialRoutstrSettingsState(node, false), actions(), { node, key: '' });
  expect(fields.every(field => field.value === '')).toBe(true); expect(view.readAccount()).toBeNull(); expect(view.readRecovery('deposit')).toBe('');
  view.setState({ ...view.getState(), walletBalance: 'STALE' }); expect(host.textContent).not.toContain('STALE');
});
it('retains child slots, private recoveries, model focus and wallet controls during balance/account refreshes', () => {
  const { host, view } = mounted();
  const slots = ['routstr-mint-edit','routstr-wallet-fund-area','routstr-node-picker'].map(id => host.querySelector('#' + id));
  const models = mountRoutstrModelSettings(host.querySelector<HTMLElement>('[data-routstr-model-settings-host]')!, { connected: true, models: { selectedModel: 'a', modelDisplay: 'A', groups: [{ label: '', options: [{ value: 'a', label: 'A' }] }], pricing: { text: 'Free', tone: 'success' } }, mode: { enabled: false, available: false, active: false } });
  const select = host.querySelector<HTMLSelectElement>('select')!; select.focus(); view.showRecovery('deposit', 'PRIVATE-DEPOSIT');
  const refresh = host.querySelector('[data-provider-panel-action="refresh-cashu-wallet-balance"]');
  view.setState({ ...view.getState(), walletBalance: '⚡ 120 sats', nodeBalance: { text: 'Balance: ⚡ 100 sats', tone: 'warning' }, seed: { text: 'Seed ready', tone: 'success' } });
  view.setAccount({ node, key: 'sk-REPLACEMENT' }); models.setModels({ ...models.getModels(), pricing: { text: '$1/M', tone: 'secondary' } });
  expect(slots).toEqual(['routstr-mint-edit','routstr-wallet-fund-area','routstr-node-picker'].map(id => host.querySelector('#' + id)));
  expect(host.querySelector('select')).toBe(select); expect(document.activeElement).toBe(select); expect(host.querySelector('[data-provider-panel-action="refresh-cashu-wallet-balance"]')).toBe(refresh);
  expect(view.readRecovery('deposit')).toBe('PRIVATE-DEPOSIT'); expect(host.querySelector('#routstr-wallet-balance')!.textContent).toBe('⚡ 120 sats');
});
it('dispatches each action once and rejects retained controls after replacing the shell', () => {
  const { host, callbacks, view } = mounted(); const deposit = host.querySelector<HTMLButtonElement>('[data-wallet-action="deposit"]')!;
  deposit.click(); expect(callbacks.wallet).toHaveBeenCalledExactlyOnceWith('deposit');
  host.querySelector<HTMLButtonElement>('[data-node-action="deposit"]')!.click(); expect(callbacks.node).toHaveBeenCalledExactlyOnceWith('deposit', node);
  view.showRecovery('deposit', 'PRIVATE'); const copy = [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Copy Token')!; copy.click(); expect(callbacks.copyRecovery).toHaveBeenCalledExactlyOnceWith('deposit');
  mountRoutstrSettings(document.body.appendChild(document.createElement('div')), initialRoutstrSettingsState('', false), actions(), { node: '', key: '' }); deposit.click(); copy.click();
  expect(callbacks.wallet).toHaveBeenCalledTimes(1); expect(callbacks.copyRecovery).toHaveBeenCalledTimes(1);
});
it('owns menu visibility, outside click and Escape focus without replacing the toggle', async () => {
  const { host, view } = mounted(); const toggle = host.querySelector<HTMLButtonElement>('[data-routstr-wallet-action="toggle-wallet-menu"]')!;
  toggle.click(); await Promise.resolve(); expect(view.getState().menuOpen).toBe(true); expect(toggle.getAttribute('aria-expanded')).toBe('true');
  toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); expect(view.getState().menuOpen).toBe(false); expect(document.activeElement).toBe(toggle);
  toggle.click(); document.body.click(); expect(view.getState().menuOpen).toBe(false); expect(host.querySelector('[data-routstr-wallet-action="toggle-wallet-menu"]')).toBe(toggle);
});
it('disposes nested wallet/model ownership and synchronously clears retained node recovery fields', () => {
  const { host } = mounted(); const picker = host.querySelector<HTMLElement>('#routstr-node-picker')!; picker.style.display = 'block';
  const child = mountWalletNode(picker, { connect: () => {}, refresh: () => {}, chooseMint: () => {}, deposit: () => {}, newSession: () => {}, retry: () => {}, copy: () => {}, reclaim: () => {}, close: () => {} }, 'refunds');
  child.setRecoveries([{ node, mint: node, token: 'PRIVATE-NODE', id: 'PRIVATE-ID', generation: 'PRIVATE-GENERATION', createdAt: 0 }]); child.setState({ ...child.getState(), pending: false, phase: 'ready' });
  const field = picker.querySelector<HTMLTextAreaElement>('textarea')!; expect(field.value).toBe('PRIVATE-NODE'); disposeRoutstrSettings();
  expect(field.value).toBe(''); expect(getWalletNodeView()).toBeNull(); expect(getRoutstrModelSettingsView()).toBeNull(); expect(getRoutstrSettingsView()).toBeNull();
});
it('escapes discovery names and recovery tokens as inert text without generated event attributes', () => {
  const { host, view } = mounted(); view.setAccount({ node, key: 'sk-private' }, '<img src=x onerror=unsafe>'); view.showRecovery('deposit', '</textarea><svg onload=unsafe>');
  expect(host.querySelector('img,svg,script,[onerror],[onload]')).toBeNull(); expect(host.innerHTML).not.toContain('</textarea><svg'); expect(view.readRecovery('deposit')).toBe('</textarea><svg onload=unsafe>');
});
