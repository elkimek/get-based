// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSyncDialogController } from '../js/sync-dialog-controller.js';
import { disposeSyncDialog, getSyncDialogOwner, openSyncDialog } from '../js/sync-dialog-component.js';
import type { SyncDialogServices } from '../js/sync-dialog-contract.js';
const phrase = Array.from({ length: 24 }, (_, i) => `synthetic${i + 1}`).join(' ');
function fixture() {
  const live = { enabled: false, configured: false, ownerId: null as string | null };
  const services: SyncDialogServices = {
    enabled: () => live.enabled, configured: () => live.configured, ownerId: () => live.ownerId, mnemonic: () => phrase,
    enable: vi.fn(async () => { live.enabled = true; live.ownerId = 'synthetic-created-owner'; return true; }),
    disable: vi.fn(async () => { live.enabled = false; return true; }), restore: vi.fn(async () => false),
    notify: vi.fn(), refresh: vi.fn(), release: vi.fn(), wait: vi.fn(async () => {}),
  };
  return { live, services, controller: createSyncDialogController(services) };
}
function input(value = phrase) {
  const field = document.querySelector('textarea')!; field.value = value; getSyncDialogOwner()!.validate(); return field;
}
beforeEach(() => { document.body.innerHTML = '<button id="trigger">Open</button>'; document.querySelector<HTMLElement>('#trigger')!.focus(); });
afterEach(() => { disposeSyncDialog(); document.body.replaceChildren(); vi.restoreAllMocks(); });
it('owns validation without storing phrase values in status and requires explicit generation acknowledgement', async () => {
  const { controller } = fixture(); controller.showSetup();
  expect(document.body.textContent).not.toContain(phrase); await controller.newIdentity();
  const owner = getSyncDialogOwner()!;
  expect(JSON.stringify(owner.state())).not.toContain(phrase);
  expect(document.querySelector('#sync-setup-new')!.textContent).toContain(phrase);
  expect((document.querySelector('#sync-setup-done-btn') as HTMLButtonElement).disabled).toBe(true);
  controller.done(); expect(owner.isCurrent()).toBe(true);
  (document.querySelector('#sync-setup-ack') as HTMLInputElement).checked = true; controller.acknowledge(); controller.done();
  expect(getSyncDialogOwner()).toBeNull(); expect(document.body.textContent).not.toContain(phrase);
  expect(document.activeElement?.id).toBe('trigger'); expect(document.body.style.overflow).toBe('');
});
it('keeps 23-word drafts disabled and preserves retryable join failures without disabling the runtime', async () => {
  const { controller, services } = fixture(); controller.showSetup(); controller.joinStep();
  input(phrase.split(' ').slice(0, 23).join(' '));
  expect((document.querySelector('#sync-setup-restore-go') as HTMLButtonElement).disabled).toBe(true);
  await controller.join(); expect(services.enable).not.toHaveBeenCalled();
  input(); await controller.join();
  expect(services.enable).toHaveBeenCalledWith({ skipPush: true, persist: false });
  expect(services.restore).toHaveBeenCalledWith(phrase); expect(services.disable).not.toHaveBeenCalled();
  expect(document.querySelector('#sync-setup-restore-msg')!.textContent).toContain('Could not join');
  expect((document.querySelector('#sync-setup-restore-go') as HTMLButtonElement).disabled).toBe(false);
  expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe(phrase);
});
it('rejects duplicate join, cancellation and replacement while pending, then clears fields on successful reload', async () => {
  const { controller, services } = fixture(); let finish!: (value: boolean) => void;
  services.restore = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  controller.showSetup(); controller.joinStep(); const field = input(); const task = controller.join();
  await vi.waitFor(() => expect(services.restore).toHaveBeenCalledOnce());
  await controller.join(); expect(await controller.cancelSetup()).toBe(false); controller.showRestore();
  expect(getSyncDialogOwner()!.state().kind).toBe('setup'); expect(field.disabled).toBe(true);
  finish(true); await task;
  expect(services.restore).toHaveBeenCalledOnce(); expect(field.value).toBe('');
  expect(document.querySelector('#sync-setup-restore-go')!.textContent).toBe('Reloading…');
  expect(await controller.cancelSetup()).toBe(false);
});
it('awaits generation before cancellation cleanup and never reveals its late recovery words', async () => {
  const { controller, services, live } = fixture(); let finish!: (value: boolean) => void;
  services.enable = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  controller.showSetup(); const task = controller.newIdentity(); const cancelled = controller.cancelSetup();
  expect(getSyncDialogOwner()).toBeNull(); controller.showSetup(); expect(getSyncDialogOwner()).toBeNull();
  expect(services.disable).not.toHaveBeenCalled(); live.enabled = true; live.ownerId = 'late-created-owner'; finish(true);
  await task; expect(await cancelled).toBe(true); expect(services.enable).toHaveBeenCalledOnce(); expect(services.disable).toHaveBeenCalledOnce();
  expect(document.body.textContent).not.toContain(phrase); expect(services.release).toHaveBeenCalledOnce();
});
it('does not reset an existing configured identity or another owner when setup is cancelled', async () => {
  const first = fixture(); first.live.enabled = true; first.live.configured = true; first.live.ownerId = 'existing-owner';
  first.controller.showSetup(); expect(await first.controller.cancelSetup()).toBe(true); expect(first.services.disable).not.toHaveBeenCalled();
  const second = fixture(); second.controller.showSetup(); await second.controller.newIdentity();
  second.live.ownerId = 'replacement-owner'; expect(await second.controller.cancelSetup()).toBe(true); expect(second.services.disable).not.toHaveBeenCalled();
});
it('reports failed cleanup and releases its operation lock', async () => {
  const { controller, services } = fixture(); services.disable = vi.fn(async () => false);
  controller.showSetup(); await controller.newIdentity(); expect(await controller.cancelSetup()).toBe(false);
  expect(services.notify).toHaveBeenCalledWith(expect.stringContaining('cleanup failed'), 'error');
  expect(services.refresh).toHaveBeenCalledOnce(); expect(services.release).toHaveBeenCalledOnce(); controller.showSetup(); expect(getSyncDialogOwner()).not.toBeNull();
});
it('prevents a changed configured owner from consuming a join draft after async initialization', async () => {
  const { controller, services, live } = fixture(); live.configured = true; live.enabled = true; live.ownerId = 'initial-owner';
  services.enable = vi.fn(async () => { live.ownerId = 'replacement-owner'; return true; });
  controller.showSetup(); controller.joinStep(); input(); await controller.join();
  expect(services.restore).not.toHaveBeenCalled(); expect(services.disable).not.toHaveBeenCalled();
  expect(getSyncDialogOwner()!.state().pending).toBe(false);
});
it('keeps standalone restore pending controls protected and old replies cannot update a replacement view', async () => {
  const { controller, services } = fixture(); let finish!: (value: boolean) => void;
  services.restore = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  controller.showRestore(); const field = input(); const old = getSyncDialogOwner()!; const task = controller.restore();
  controller.closeRestore(); expect(old.isCurrent()).toBe(true); expect(field.disabled).toBe(true);
  const next = openSyncDialog('restore', () => {}); finish(false); await task;
  expect(old.isCurrent()).toBe(false); expect(next.state().message).toBe(''); expect(field.value).toBe('');
});
it('clears a cancelled restore draft and contains keyboard focus while preserving Escape dismissal', () => {
  const { controller } = fixture(); controller.showRestore(); const field = input();
  const cancel = document.querySelector('[data-sync-action="close-restore-dialog"]') as HTMLButtonElement;
  cancel.focus(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })); expect(document.activeElement).toBe(field);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true })); expect(document.activeElement).toBe(cancel);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })); expect(getSyncDialogOwner()).toBeNull(); expect(field.value).toBe('');
});

it('allows a configured owner to retry after initialization temporarily becomes unavailable', async () => {
  const { controller, services, live } = fixture(); live.configured = true; live.enabled = true; live.ownerId = 'retained-owner';
  controller.showSetup(); controller.joinStep(); input();
  services.enable = vi.fn(async () => { live.enabled = false; live.ownerId = null; return false; });
  await controller.join(); expect(services.restore).not.toHaveBeenCalled();
  services.enable = vi.fn(async () => { live.enabled = true; live.ownerId = 'retained-owner'; return true; });
  await controller.join(); expect(services.restore).toHaveBeenCalledWith(phrase);
});
it('renders generated words as text and clears them on back or close', () => {
  const owner = openSyncDialog('setup', () => {}); owner.patch({ step: 'new' }); owner.showGeneratedPhrase('<img src=x onerror=alert(1)>');
  expect(document.querySelector('#sync-setup-new img')).toBeNull(); expect(document.querySelector('#sync-setup-new')!.textContent).toContain('<img');
  owner.clearSecrets(); expect(document.querySelector('#sync-setup-new')!.textContent).not.toContain('<img'); owner.close();
});
it('keeps standalone thrown failures retryable without presenting secret-bearing error text', async () => {
  const { controller, services } = fixture(); services.restore = vi.fn(async () => { throw new Error(phrase); });
  controller.showRestore(); input(); await controller.restore();
  expect(getSyncDialogOwner()!.state().pending).toBe(false); expect(getSyncDialogOwner()!.state().message).toContain('Could not restore');
  expect(JSON.stringify(getSyncDialogOwner()!.state())).not.toContain(phrase);
  expect(services.notify).not.toHaveBeenCalledWith(expect.stringContaining(phrase), expect.anything());
});
