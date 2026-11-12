// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
const state = vi.hoisted(() => ({transition: null as null | {phase: string; announcedAt: number; cutoffAt: number; announcementUrl: string | null}, confirm: vi.fn<(...args: unknown[]) => Promise<boolean>>(), migrate: vi.fn(async () => {}), notify: vi.fn()}));
vi.mock('../shared/hosted-transition.js', () => ({getHostedTransition: () => state.transition}));
vi.mock('../js/utils.js', () => ({showConfirmDialog: state.confirm, showNotification: state.notify}));
vi.mock('../js/migration-navigation.js', () => ({openMigrationRecovery: state.migrate}));
import {showHostedTransitionNotice} from '../js/hosted-transition-notice.js';
beforeEach(() => {document.body.replaceChildren(); document.head.replaceChildren(); localStorage.clear(); state.transition = {phase: 'notice', announcedAt: 1000, cutoffAt: 2592001000, announcementUrl: 'https://your-host.example/announcement'}; state.confirm.mockReset().mockResolvedValue(false); state.migrate.mockReset().mockResolvedValue(); state.notify.mockReset();});
afterEach(() => {vi.restoreAllMocks();});
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
