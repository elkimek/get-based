import { beforeEach, expect, it, vi } from 'vitest';
const { start } = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock('../js/provider-wallet-panels.js', () => ({ startRoutstrFundingMonitor: start }));
vi.mock('../js/api.js', () => ({
  clearOpenRouterOAuthSession: vi.fn(), getAIProvider: vi.fn(),
  getOpenRouterKey: vi.fn(), rememberOpenRouterOAuthPreviousProvider: vi.fn(),
}));
vi.mock('../js/agent-chat-settings.js', () => ({ getChatBackend: vi.fn(), setChatBackend: vi.fn() }));
beforeEach(() => { localStorage.clear(); start.mockClear(); vi.resetModules(); });
it('resumes saved wallet funding after reload without opening settings', async () => {
  localStorage.setItem('labcharts-cashu-wallet-mnemonic', 'encrypted-test-fixture');
  await import('../js/settings-provider-bridge.js');
  await vi.dynamicImportSettled();
  expect(start).toHaveBeenCalledTimes(1);
});
it('does not start the wallet monitor for visitors without a wallet', async () => {
  await import('../js/settings-provider-bridge.js');
  await vi.dynamicImportSettled();
  expect(start).not.toHaveBeenCalled();
});
