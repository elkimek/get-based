// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { configurePpqSettingsLifecycle, disposePpqSettings, getPpqSettingsView, mountPpqSettings } from '../js/ppq-settings-component.js';
import type { PpqSettingsSnapshot } from '../js/ppq-settings-contract.js';
const initial: PpqSettingsSnapshot = {
  connected: true, mode: { enabled: true, available: true, active: true },
  models: { selectedModel: 'private/a', modelDisplay: 'A', groups: [{ label: '', options: [{ value: 'private/a', label: 'A' }, { value: 'private/b', label: 'B' }] }], pricing: { text: 'Free', tone: 'success' } },
};
function mounted(snapshot = initial) { const host = document.createElement('section'); document.body.append(host); return { host, view: mountPpqSettings(host, snapshot) }; }
afterEach(() => { disposePpqSettings(); configurePpqSettingsLifecycle({ cleanup: () => {}, submitCustom: () => {}, cancelCustom: () => {} }); document.body.replaceChildren(); });
it('keeps credentials private, preserves autofill and focus, and scrubs disposed and replaced fields', () => {
  const { host, view } = mounted(); view.setStoredKey('PRIVATE SYNTHETIC KEY');
  const input = host.querySelector<HTMLInputElement>('#ppq-key-input')!;
  expect(host.innerHTML).not.toContain('PRIVATE SYNTHETIC KEY'); input.value = 'PRIVATE AUTOFILL'; input.focus();
  view.refresh({ ...initial, mode: { ...initial.mode, available: false } });
  expect(host.querySelector('#ppq-key-input')).toBe(input); expect(document.activeElement).toBe(input); expect(view.readKey()).toBe('PRIVATE AUTOFILL');
  expect(JSON.stringify(view.getModels())).not.toContain('PRIVATE');
  host.replaceChildren(); mountPpqSettings(host, initial); expect(input.value).toBe(''); expect(view.readKey()).toBe('');
  view.setBalance({ text: 'STALE BALANCE', tone: 'danger' }); expect(host.textContent).not.toContain('STALE BALANCE');
  disposePpqSettings(); expect(getPpqSettingsView()).toBeNull();
});
it('owns anonymous account recovery and copies without serializing credentials into action attributes', () => {
  const { host, view } = mounted();
  view.showAccount({ apiKey: 'PRIVATE KEY', creditId: 'PRIVATE CREDIT', activated: false });
  expect(host.textContent).toContain('there is no way to recover a lost key'); expect(host.textContent).toContain('PRIVATE KEY'); expect(host.textContent).toContain('PRIVATE CREDIT');
  expect(host.querySelector('[data-provider-panel-action="dismiss-ppq-key-reveal"]')!.textContent).toBe('Finish without activation');
  expect(host.querySelector('[data-clipboard-text]')).toBeNull(); expect(host.querySelector('#ppq-key-input')).toBeNull();
  view.setSaveState({ pending: true, text: 'Creating account…', tone: 'secondary' });
  expect(host.querySelector<HTMLButtonElement>('[data-provider-panel-action="dismiss-ppq-key-reveal"]')!.disabled).toBe(true);
  view.setSaveState({ pending: false, text: 'Could not finish account creation', tone: 'danger' }); expect(host.textContent).toContain('Could not finish account creation');
  view.setAccountCopied(); view.showAccount({ apiKey: 'PRIVATE KEY', creditId: 'PRIVATE CREDIT', activated: true }); expect(host.textContent).toContain('✓ Copied (clears in 60s)'); expect(host.textContent).toContain('I’ve saved it');
  view.hideAccount(); expect(host.textContent).not.toContain('PRIVATE KEY'); expect(view.readAccount()).toBeNull();
});
it('owns private payment text and preserves open disclosure across countdown and balance updates', () => {
  const { host, view } = mounted();
  view.setTopup({ open: true, phase: 'invoice', method: 'xmr', amount: 5, custom: false, status: { text: 'Waiting for payment…', tone: 'secondary' } });
  view.showPayment({ method: 'xmr', amount: 5, paymentText: 'PRIVATE ADDRESS', qrImage: '', walletUri: 'monero:PRIVATE ADDRESS', cryptoAmount: 0.02 });
  expect(host.querySelector('[data-clipboard-text]')).toBeNull(); expect(JSON.stringify(view.getTopup())).not.toContain('PRIVATE ADDRESS');
  const details = host.querySelector('details')!; details.open = true;
  view.setTopup({ ...view.getTopup(), status: { text: 'Waiting for payment… 3:21', tone: 'secondary' } });
  view.setBalance({ text: 'Balance: $1.00', tone: 'success' });
  expect(host.querySelector('details')).toBe(details); expect(details.open).toBe(true); expect(view.readPayment()).toBe('PRIVATE ADDRESS');
  expect(host.querySelector('a[href^="monero:"]')).not.toBeNull(); view.setPaymentCopied(); expect(host.textContent).toContain('✓ Copied!');
  view.clearPayment(); expect(host.textContent).not.toContain('PRIVATE ADDRESS'); expect(view.readPayment()).toBe('');
});
it('uses owned keyboard and blur handlers, including custom focus, escape, submission and disposal cleanup', () => {
  const cleanup = vi.fn(); const submit = vi.fn(); const cancel = vi.fn();
  configurePpqSettingsLifecycle({ cleanup, submitCustom: submit, cancelCustom: cancel });
  const { host, view } = mounted(); cleanup.mockClear();
  view.setTopup({ ...view.getTopup(), open: true, custom: true }); view.focusCustomAmount();
  const input = host.querySelector<HTMLInputElement>('#ppq-custom-amount')!; expect(document.activeElement).toBe(input);
  input.value = '6.25'; input.dispatchEvent(new Event('input', { bubbles: true })); expect(view.readCustomAmount()).toBe('6.25');
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); expect(submit).toHaveBeenCalledOnce();
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); expect(cancel).toHaveBeenCalledOnce();
  input.dispatchEvent(new FocusEvent('blur')); expect(submit).toHaveBeenCalledTimes(2);
  disposePpqSettings(); expect(cleanup).toHaveBeenCalledOnce(); expect(view.readCustomAmount()).toBe('');
});
it('preserves missing private catalogs, unavailable selections, escaped labels and delegate contracts', () => {
  const { host, view } = mounted(); view.setMode({ enabled: true, available: false, active: false });
  expect(host.querySelector<HTMLInputElement>('#ppq-private-toggle')!.checked).toBe(true); expect(host.querySelector<HTMLElement>('#ppq-private-indicator')!.hidden).toBe(true);
  expect(host.textContent).toContain('Private mode remains enabled');
  view.setModels({ ...initial.models, selectedModel: 'missing', groups: [{ label: '<img>', options: [{ value: 'other', label: '<svg onload=unsafe>' }] }] });
  const select = host.querySelector<HTMLSelectElement>('#ppq-model-select')!; expect(select.value).toBe('missing'); expect(select.selectedOptions[0]!.disabled).toBe(true);
  expect(host.querySelector('optgroup option')!.textContent).toBe('<svg onload=unsafe>'); expect(host.querySelector('img,[onload]')).toBeNull();
  expect(host.querySelector('[autocomplete="username"]')!.getAttribute('value')).toBe('ppq'); expect(host.querySelector('label[for="ppq-key-input"]')).not.toBeNull();
  expect(host.querySelector('#ppq-key-input')!.getAttribute('autocomplete')).toBe('new-password');
  view.setSaveState({ pending: true, text: 'Validating...', tone: 'secondary' }); expect(host.querySelector<HTMLButtonElement>('#save-ppq-key-btn')!.disabled).toBe(true);
});
