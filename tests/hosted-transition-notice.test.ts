// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
const state = vi.hoisted(() => ({transition: null as null | {phase: string; announcedAt: number; cutoffAt: number; announcementUrl: string | null}, confirm: vi.fn<(...args: unknown[]) => Promise<boolean>>(), migrate: vi.fn(async () => {}), save: vi.fn(async () => {}), capture: vi.fn(), copied: vi.fn(), notify: vi.fn()}));
vi.mock('../shared/hosted-transition.js', () => ({getHostedTransition: () => state.transition}));
vi.mock('../js/utils.js', () => ({showConfirmDialog: state.confirm, showNotification: state.notify}));
vi.mock('../js/migration-navigation.js', () => ({openMigrationRecovery: state.migrate, saveMigrationDrafts: state.save, captureMigrationUnsavedWork: state.capture, openMigrationAfterSavedWork: state.copied}));
import {showHostedTransitionNotice, showHostedRecoveryCutoff} from '../js/hosted-transition-notice.js';
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
function mockDialog() {Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {configurable: true, value: function (this: HTMLDialogElement) {this.open = true;}});}
beforeEach(() => {document.body.replaceChildren(); document.head.replaceChildren(); localStorage.clear(); state.transition = {phase: 'notice', announcedAt: 1000, cutoffAt: 2592001000, announcementUrl: 'https://your-host.example/announcement'}; state.confirm.mockReset().mockResolvedValue(false); state.migrate.mockReset().mockResolvedValue(); state.notify.mockReset(); state.save.mockReset().mockResolvedValue(); state.capture.mockReset().mockReturnValue({files: [], pending: false, isCurrent: () => true}); state.copied.mockReset();});
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals(); if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShowModal); else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');});
it('shows a persistent dated banner and acknowledges the first-visit notice once', async () => {
  await showHostedTransitionNotice();
  const banner = document.querySelector('#hosted-transition-banner')!;
  expect(banner.textContent).toContain('Recovery stays available');
  expect(banner.querySelector('time')?.getAttribute('datetime')).toBe(new Date(2592001000).toISOString());
  expect(state.confirm).toHaveBeenCalledWith(expect.stringContaining('official encrypted Sync relay'), expect.objectContaining({confirmLabel: 'Start migration', cancelLabel: 'Continue for now'}));
  banner.remove(); await showHostedTransitionNotice(); expect(document.querySelector('#hosted-transition-banner')).toBeTruthy(); expect(state.confirm).toHaveBeenCalledTimes(1);
});
it('uses the draft-preserving navigation owner from the dialog and banner', async () => {
  state.confirm.mockResolvedValue(true); await showHostedTransitionNotice(); expect(state.migrate).toHaveBeenCalledTimes(1);
  (document.querySelector('#hosted-transition-banner button') as HTMLButtonElement).click(); await Promise.resolve(); expect(state.migrate).toHaveBeenCalledTimes(2);
});
it('retains the window and reports a failed migration handoff', async () => {
  state.migrate.mockRejectedValue(new Error('Save unsent attachments first.')); await showHostedTransitionNotice();
  (document.querySelector('#hosted-transition-banner button') as HTMLButtonElement).click(); await Promise.resolve();
  expect(state.notify).toHaveBeenCalledWith('Save unsent attachments first.', 'error', 12000); expect(document.querySelector('#hosted-transition-banner')).toBeTruthy();
});
it('does not show a notice on independent deployments or recovery-only launches', async () => {
  state.transition = null; await showHostedTransitionNotice(); expect(document.body.childElementCount).toBe(0);
  state.transition = {phase: 'recovery', announcedAt: 1000, cutoffAt: 2592001000, announcementUrl: null};
  await showHostedTransitionNotice(); expect(document.body.childElementCount).toBe(0); expect(state.confirm).not.toHaveBeenCalled();
});

it('blocks editing at cutoff without automatically leaving the page or losing in-memory copies', async () => {
  mockDialog();
  vi.stubGlobal('URL', class extends URL {static override createObjectURL() {return 'blob:synthetic-private-work';}});
  state.save.mockResolvedValue();
  const captured = {files: [{name: '<unsafe-name>.txt', blob: new Blob(['synthetic draft'])}], pending: false, isCurrent: () => true};
  state.capture.mockReturnValue(captured); state.copied.mockReset(); state.migrate.mockReset();
  await showHostedRecoveryCutoff();
  const dialog = document.querySelector<HTMLDialogElement>('#hosted-cutoff-dialog')!;
  expect(dialog.open).toBe(true); expect(state.save).toHaveBeenCalled(); expect(state.migrate).not.toHaveBeenCalled();
  expect(dialog.dispatchEvent(new Event('cancel', {cancelable: true}))).toBe(false);
  expect(dialog.querySelector('a[download]')?.textContent).toBe('<unsafe-name>.txt'); expect(dialog.querySelector('unsafe-name')).toBeNull();
  const proceed = dialog.querySelector<HTMLButtonElement>('[data-cutoff-continue]')!;
  expect(proceed.disabled).toBe(true); proceed.click(); expect(state.copied).not.toHaveBeenCalled();
  const checked = dialog.querySelector<HTMLInputElement>('[data-cutoff-confirm]')!; checked.checked = true; checked.dispatchEvent(new Event('change'));
  expect(proceed.disabled).toBe(false); proceed.click(); expect(state.copied).toHaveBeenCalledWith(captured);
});
it('keeps failed saves and in-flight images in the recovery-only dialog with retry available', async () => {
  mockDialog();
  state.save.mockRejectedValue(new Error('Storage is full')); state.capture.mockReturnValue({files: [], pending: true, isCurrent: () => false});
  await showHostedRecoveryCutoff();
  const dialog = document.querySelector<HTMLDialogElement>('#hosted-cutoff-dialog')!;
  expect(dialog.open).toBe(true); expect(dialog.textContent).toContain('Storage is full'); expect(dialog.textContent).toContain('still being prepared');
  expect(dialog.querySelector<HTMLButtonElement>('[data-cutoff-continue]')!.disabled).toBe(true);
  expect(dialog.querySelector<HTMLButtonElement>('[data-cutoff-retry]')!.disabled).toBe(false);
});
