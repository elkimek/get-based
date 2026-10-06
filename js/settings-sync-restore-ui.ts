// Public compatibility entrypoints; one typed controller and owned view implement them.
import { enableSync, disableSync, isSyncEnabled, isSyncConfigured, getMnemonic, getSyncIdentityOwnerId, restoreFromMnemonic } from './sync.js';
import { showNotification } from './utils.js';
import { getSyncDialogOwner } from './sync-dialog-component.js';
import { createSyncDialogController } from './sync-dialog-controller.js';
const hooks = { refresh: () => {}, release: () => {} };
export function configureSyncDialogHooks(next: Partial<typeof hooks>): void { Object.assign(hooks, next); }
const controller = createSyncDialogController({
  enabled: isSyncEnabled, configured: isSyncConfigured, ownerId: getSyncIdentityOwnerId, mnemonic: getMnemonic,
  enable: enableSync, disable: disableSync, restore: restoreFromMnemonic,
  notify: showNotification, refresh: () => hooks.refresh(), release: () => hooks.release(),
  wait: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
});
export function showSyncSetupModal(): void { controller.showSetup(); }
export async function closeSyncSetup(): Promise<boolean> { return controller.cancelSetup(); }
export async function syncSetupNew(): Promise<void> { await controller.newIdentity(); }
export function syncSetupDone(): void { controller.done(); }
export function syncSetupRestore(): void { controller.joinStep(); }
export function syncSetupBack(): void { controller.back(); }
export async function syncSetupDoRestore(): Promise<void> { await controller.join(); }
export function updateSyncSetupAck(): void { controller.acknowledge(); }
export function updateSyncSetupRestoreState(_input?: HTMLTextAreaElement | null, _busy?: boolean): void { controller.validate('setup'); }
export function openRestoreMnemonicDialog(): void { controller.showRestore(); }
export function closeRestoreMnemonicDialog(): void { controller.closeRestore(); }
export async function confirmRestoreMnemonic(): Promise<void> { await controller.restore(); }
export function updateRestoreMnemonicDialogState(_input?: HTMLTextAreaElement | null): void { controller.validate('restore'); }

// Retain published progress helpers while the owned component supplies rendering.
export function setSyncSetupRestoreBusy(busy: boolean, message = ''): void {
  getSyncDialogOwner('setup')?.patch({ pending: busy, ...(message ? { message, tone: busy ? 'secondary' : 'danger' } : {}) });
}
export function setSyncSetupRestoreReloading(): void {
  const owner = getSyncDialogOwner('setup'); owner?.clearSecrets();
  owner?.patch({ pending: true, reloading: true, message: 'Identity accepted. Reloading this device…', tone: 'success' });
}
