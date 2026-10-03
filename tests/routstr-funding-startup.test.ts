import { beforeEach, expect, it, vi } from 'vitest';
const { start, provider, backend } = vi.hoisted(() => ({ start: vi.fn(), provider: vi.fn(), backend: vi.fn() }));
vi.mock('../js/provider-wallet-panels.js', () => ({ startRoutstrFundingMonitor: start }));
vi.mock('../js/api.js', () => ({
  clearOpenRouterOAuthSession: vi.fn(), getAIProvider: provider,
  getOpenRouterKey: vi.fn(), rememberOpenRouterOAuthPreviousProvider: vi.fn(),
}));
vi.mock('../js/agent-chat-settings.js', () => ({ getChatBackend: backend, setChatBackend: vi.fn() }));
beforeEach(() => {
  localStorage.clear(); start.mockClear(); vi.resetModules();
  provider.mockReturnValue('routstr'); backend.mockReturnValue('direct');
});
it('resumes saved wallet funding after reload when Routstr is active', async () => {
  localStorage.setItem('labcharts-cashu-wallet-mnemonic', 'encrypted-test-fixture');
  await import('../js/settings-provider-bridge.js');
  await vi.dynamicImportSettled();
  expect(start).toHaveBeenCalledTimes(1);
});
it.each(['openrouter', 'venice', 'custom'])('does not start saved funding for %s', async selected => {
  provider.mockReturnValue(selected);
  localStorage.setItem('labcharts-cashu-wallet-mnemonic', 'encrypted-test-fixture');
  await import('../js/settings-provider-bridge.js');
  await vi.dynamicImportSettled();
  expect(start).not.toHaveBeenCalled();
});
it('does not start funding while the CLI backend is active', async () => {
  backend.mockReturnValue('codex');
  localStorage.setItem('labcharts-cashu-wallet-mnemonic', 'encrypted-test-fixture');
  await import('../js/settings-provider-bridge.js');
  await vi.dynamicImportSettled();
  expect(start).not.toHaveBeenCalled();
});
it('does not start the wallet monitor for visitors without a wallet', async () => {
  await import('../js/settings-provider-bridge.js');
  await vi.dynamicImportSettled();
  expect(start).not.toHaveBeenCalled();
});
