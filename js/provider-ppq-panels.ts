// provider-ppq-panels.js — PPQ Settings compatibility facade. Domain operations own persistence and
// payment services; the captured Svelte view owns all panel presentation.
import { showNotification, showConfirmDialog } from './utils.js';
import {
  getAIProvider, getPpqKey, getPpqCreditId, savePpqKey, savePpqCreditId,
  fetchPpqModels, validatePpqKey, createPpqAccount, getPpqBalance,
  createPpqTopup, checkPpqTopupStatus,
} from './api.js';
import { updateKeyCache } from './crypto.js';
import { ensureQRCode } from './provider-qr.js';
import { getSettingsModuleFunction } from './settings-runtime-bridge.js';
import { createProviderKeyController } from './provider-key-controller.js';
import { createPpqAccountController } from './ppq-account-controller.js';
import { createPpqTopupController } from './ppq-topup-controller.js';
import { getPpqSettingsView, mountPpqSettings, configurePpqSettingsLifecycle } from './ppq-settings-component.js';
import { buildPpqSettingsSnapshot, ppqBalance } from './ppq-settings-view.js';
import type { PpqSettingsSnapshot } from './ppq-settings-contract.js';

export interface PpqPanelConfiguration {
  returnToChatIfOnboarding?: () => unknown;
  requestProviderActivation?: (provider: string, options?: { endpoint?: string; modelId?: string }) => Promise<boolean>;
}
type PpqActionElement = Pick<HTMLElement, 'dataset'> | null | undefined;
let returnToChatIfOnboarding: () => unknown = () => {};
let requestProviderActivation: NonNullable<PpqPanelConfiguration['requestProviderActivation']> = async () => true;
let removing = false;
let balanceSequence = 0;
let clipboardTimer: ReturnType<typeof setTimeout> | null = null;
const keyController = createProviderKeyController<PpqSettingsSnapshot>('ppq');
const accountController = createPpqAccountController({
  view: getPpqSettingsView, provider: getAIProvider, key: getPpqKey, creditId: getPpqCreditId,
  busy: () => keyController.isPending() || removing,
  create: createPpqAccount, saveKey: savePpqKey, saveCreditId: savePpqCreditId,
  loadModels: loadCurrentModels, activate: () => requestProviderActivation('ppq'), snapshot: buildPpqSettingsSnapshot,
});
const topupController = createPpqTopupController({
  view: getPpqSettingsView, provider: getAIProvider, key: getPpqKey, creditId: getPpqCreditId,
  create: createPpqTopup, status: checkPpqTopupStatus,
  qr: async text => {
    const makeQr = await ensureQRCode();
    const qr = makeQr(0, 'L'); qr.addData(text); qr.make();
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true }));
  },
  refreshBalance: refreshPpqBalance,
  received: () => showNotification('Top-up successful!', 'success'),
  returnToChat: () => { returnToChatIfOnboarding(); },
  error: message => showNotification(message, 'error'),
});
configurePpqSettingsLifecycle({
  cleanup: () => { ++balanceSequence; topupController.clear(); },
  submitCustom: () => doPpqTopupCustom(),
  cancelCustom: () => { const method = getPpqSettingsView()?.getTopup().method; if (method) selectPpqMethod(method); },
});
function busy(): boolean { return removing || accountController.isPending() || keyController.isPending(); }
export function configurePpqPanels(options: PpqPanelConfiguration = {}): void {
  if (typeof options.returnToChatIfOnboarding === 'function') returnToChatIfOnboarding = options.returnToChatIfOnboarding;
  if (typeof options.requestProviderActivation === 'function') requestProviderActivation = options.requestProviderActivation;
}
export function hydratePpqSettings(): void {
  if (getAIProvider() !== 'ppq') return;
  const host = document.querySelector<HTMLElement>('#ai-provider-panel [data-ppq-settings-host]');
  if (!host) return;
  const previous = getPpqSettingsView();
  const view = mountPpqSettings(host, buildPpqSettingsSnapshot());
  if (view !== previous) view.setStoredKey(getPpqKey());
}
async function loadCurrentModels(key: string): Promise<void> {
  const creditId = getPpqCreditId();
  const view = getPpqSettingsView();
  const accountCurrent = () => getPpqKey() === key && getPpqCreditId() === creditId;
  await fetchPpqModels(key, { isCurrent: accountCurrent });
  if (view?.isCurrent() && getAIProvider() === 'ppq' && accountCurrent()) view.refresh(buildPpqSettingsSnapshot());
}
export function initSettingsPpqPanel(): void {
  if (getAIProvider() !== 'ppq' || !getPpqSettingsView() || !getPpqKey()) return;
  void loadCurrentModels(getPpqKey());
  void refreshPpqBalance();
}
export function clearPpqTopupTimers(): void { topupController.clear(); }
export function handleCreatePpqAccount(): Promise<void> { return accountController.create(); }
export function dismissPpqKeyReveal(): void {
  const view = getPpqSettingsView();
  if (!view?.readAccount() || accountController.isPending() || getAIProvider() !== 'ppq') return;
  view.hideAccount(); view.refresh(buildPpqSettingsSnapshot());
  void refreshPpqBalance(); topupController.picker(true);
  showNotification('Account ready — top up to start using AI', 'info');
}
export async function handleSavePpqKey(): Promise<void> {
  if (accountController.isPending() || removing) return;
  topupController.cancel();
  const creditId = getPpqCreditId();
  await keyController.save(getPpqSettingsView(), {
    currentProvider: () => getPpqCreditId() === creditId ? getAIProvider() : '', currentKey: getPpqKey,
    validate: async key => {
      const result = await validatePpqKey(key);
      return result.valid ? result : { valid: false, error: result.error === 'Invalid API key' ? result.error : 'Connection could not be verified.' };
    },
    activate: () => requestProviderActivation('ppq'), save: savePpqKey,
    loadModels: loadCurrentModels, snapshot: buildPpqSettingsSnapshot,
    committed: () => { void refreshPpqBalance(); showNotification('PPQ key saved', 'success'); returnToChatIfOnboarding(); },
  });
}
export async function handleRemovePpqKey(): Promise<void> {
  const view = getPpqSettingsView(); const key = getPpqKey(); const creditId = getPpqCreditId();
  if (!view || getAIProvider() !== 'ppq' || !key || busy()) return;
  const current = () => view.isCurrent() && getPpqSettingsView() === view && getAIProvider() === 'ppq' && getPpqKey() === key && getPpqCreditId() === creditId;
  topupController.cancel();
  removing = true;
  let failed = false;
  view.setSaveState({ pending: true, text: 'Checking account balance…', tone: 'secondary' });
  try {
    const balance = await getPpqBalance();
    if (!current()) return;
    const value = balance == null ? NaN : Number(balance);
    const hasFunds = Number.isFinite(value) && value > 0;
    const msg = hasFunds
      ? `This account has $${value.toFixed(2)} remaining. Removing this key will permanently lose access to those funds unless you’ve saved the key elsewhere.\n\nRemove PPQ key?`
      : 'Remove PPQ key? Make sure you’ve saved it if you want to reuse this account later.';
    if (!await showConfirmDialog(msg) || !current()) return;
    topupController.clear(); ++balanceSequence;
    localStorage.removeItem('labcharts-ppq-key');
    updateKeyCache('labcharts-ppq-key', null);
    localStorage.removeItem('labcharts-ppq-models');
    localStorage.removeItem('labcharts-ppq-private-models');
    localStorage.removeItem('labcharts-ppq-model');
    localStorage.removeItem('labcharts-ppq-model-regular');
    localStorage.removeItem('labcharts-ppq-model-private');
    localStorage.removeItem('labcharts-ppq-private-mode');
    localStorage.removeItem('labcharts-ppq-pricing');
    localStorage.removeItem('labcharts-ppq-vision-models');
    localStorage.removeItem('labcharts-ppq-private-vision-models');
    localStorage.removeItem('labcharts-ppq-credit-id');
    view.clearKey(); view.hideAccount(); view.refresh(buildPpqSettingsSnapshot());
    showNotification('PPQ key removed', 'info');
    getSettingsModuleFunction('openSettingsModal')?.();
  } catch {
    failed = true;
    if (current()) view.setSaveState({ pending: false, text: 'Could not remove this key. Please retry.', tone: 'danger' });
  } finally {
    removing = false;
    if (view.isCurrent() && (!failed || !current())) view.setSaveState({ pending: false, text: getPpqKey() ? '✓ Connected' : 'No key set', tone: getPpqKey() ? 'success' : 'secondary' });
  }
}
export async function refreshPpqBalance(): Promise<void> {
  const view = getPpqSettingsView(); const key = getPpqKey(); const creditId = getPpqCreditId();
  if (!view || getAIProvider() !== 'ppq' || !key) return;
  const sequence = ++balanceSequence;
  const current = () => sequence === balanceSequence && view.isCurrent() && getAIProvider() === 'ppq' && getPpqKey() === key && getPpqCreditId() === creditId;
  view.setBalance({ text: 'Balance: refreshing…', tone: 'secondary' });
  try {
    const balance = await getPpqBalance();
    if (!current()) return;
    view.setBalance(ppqBalance(balance));
    if (balance != null && Number(balance) === 0) topupController.picker(true);
  } catch { if (current()) view.setBalance(ppqBalance(null)); }
}
async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  try { await navigator.clipboard.writeText(text); return true; }
  catch { showNotification('Copy failed. Please copy the displayed text manually.', 'error'); return false; }
}
export function copyPpqKeyReveal(_actionEl: PpqActionElement): void {
  const view = getPpqSettingsView(); const account = view?.readAccount();
  if (!account) return;
  void copyText(`API Key: ${account.apiKey}\nCredit ID: ${account.creditId}`).then(copied => {
    if (!copied) return;
    if (view?.isCurrent() && view.readAccount()?.apiKey === account.apiKey && view.readAccount()?.creditId === account.creditId) view.setAccountCopied();
    if (clipboardTimer) clearTimeout(clipboardTimer);
    clipboardTimer = setTimeout(() => { void navigator.clipboard?.writeText?.('').catch(() => {}); clipboardTimer = null; }, 60000);
  });
}
export function copyPpqPayment(_actionEl: PpqActionElement): void {
  const view = getPpqSettingsView(); const text = view?.readPayment() || '';
  void copyText(text).then(copied => { if (copied && view?.isCurrent() && view.readPayment() === text) view.setPaymentCopied(); });
}
export function handleSelectPpqMethod(actionEl: PpqActionElement): void { selectPpqMethod(actionEl?.dataset.ppqMethod || ''); }
export function handlePpqTopupPreset(actionEl: PpqActionElement): void { const amount = Number(actionEl?.dataset.amount); if (Number.isFinite(amount)) void doPpqTopup(amount); }
export function showPpqTopup(): void { if (!busy()) topupController.picker(); }
export function selectPpqMethod(methodId: string): void { if (!busy()) topupController.select(methodId); }
export function ppqShowCustomInput(): void { if (!busy()) topupController.custom(); }
export function doPpqTopupCustom(): void { if (!busy()) topupController.submitCustom(); }
export async function doPpqTopup(amount: unknown): Promise<void> { if (!busy()) await topupController.create(amount); }
export function cancelPpqTopup(): void { topupController.cancel(); }
