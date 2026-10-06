// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ provider: 'openrouter', backend: 'direct', paused: false, persistPause: vi.fn(), focus: vi.fn(), notify: vi.fn(), render: vi.fn(() => '<div>owned provider</div>'), switchProvider: vi.fn(async () => true), hydrate: vi.fn(), init: vi.fn(), refresh: vi.fn(), clearWallet: vi.fn(), monitor: vi.fn() }));
vi.mock('../js/api.js', () => ({ getAIProvider: () => state.provider, isAIPaused: () => state.paused, setAIPaused: (value: boolean) => { state.persistPause(value); state.paused = value; }, getOpenRouterKey: () => '', rememberOpenRouterOAuthPreviousProvider: vi.fn(), clearOpenRouterOAuthSession: vi.fn() }));
vi.mock('../js/agent-chat-settings.js', () => ({ getChatBackend: () => state.backend, setChatBackend: vi.fn((value: string) => { state.backend = value; }) }));
vi.mock('../js/provider-panels.js', () => ({ configureProviderPanelDeps: vi.fn(), renderAIProviderPanel: state.render, hydrateOwnedProviderSettings: state.hydrate, initSettingsOllamaCheck: state.init, initSettingsModelFetch: state.init, switchAIProvider: state.switchProvider }));
vi.mock('../js/provider-wallet-panels.js', () => ({ clearRoutstrWalletTimers: state.clearWallet, startRoutstrFundingMonitor: state.monitor }));
vi.mock('../js/focus-card.js', () => ({ loadFocusCard: state.focus }));
vi.mock('../js/utils.js', () => ({ showNotification: state.notify }));
vi.mock('../js/settings-cli-agent-panel.js', () => ({ renderCLIAgentProviderPanel: () => '<div>CLI controls</div>' }));
import { mountAiSettings, getAiSettingsView } from '../js/ai-settings-component.js';
import { buildAiSettingsSnapshot } from '../js/ai-settings-presentation.js';
import { configureSettingsProviderBridgeDeps, disposeSettingsProviderPanels, initSettingsProviderPanels, renderAIProviderPanelBridge, switchAIProviderBridge, showCLIAgentProviderBridge, toggleAIPauseBridge } from '../js/settings-provider-bridge.js';
import { setChatBackend } from '../js/agent-chat-settings.js';
function host() {
  const root = document.createElement('section'); document.body.append(root);
  const view = mountAiSettings(root, buildAiSettingsSnapshot({ enabled: !state.paused, hideProviders: false, provider: state.provider, backend: state.backend }), {
    pause: toggleAIPauseBridge, select: provider => provider === 'cli' ? showCLIAgentProviderBridge() : switchAIProviderBridge(provider),
  });
  const panel = view.getProviderHost()!; panel.textContent = 'existing'; return panel;
}
afterEach(() => { disposeSettingsProviderPanels(); document.body.replaceChildren(); vi.clearAllMocks(); state.provider = 'openrouter'; state.backend = 'direct'; state.paused = false; state.persistPause.mockReset(); state.switchProvider.mockResolvedValue(true); });
it('returns a host placeholder without starting asynchronous presentation work', async () => {
  expect(renderAIProviderPanelBridge()).toContain('data-ai-provider-loading-host');
  await Promise.resolve(); expect(state.render).not.toHaveBeenCalled();
});
it('rejects initialization after close or root replacement', async () => {
  const old = host(); const work = initSettingsProviderPanels(); disposeSettingsProviderPanels(); old.remove(); const replacement = host();
  await work; expect(replacement.textContent).toBe('existing'); expect(state.render).not.toHaveBeenCalled();
});
it('mounts only the latest Settings root and leaves a selected CLI panel intact', async () => {
  const old = host(); const earlier = initSettingsProviderPanels(); old.remove(); const current = host(); const latest = initSettingsProviderPanels();
  await Promise.all([earlier, latest]); expect(current.textContent).toBe('owned provider'); expect(state.render).toHaveBeenCalledOnce();
  state.backend = 'codex'; current.textContent = 'CLI controls'; await initSettingsProviderPanels(); expect(current.textContent).toBe('CLI controls');
});
it('does not start a provider switch after selecting another panel before lazy load', async () => {
  const panel = host(); switchAIProviderBridge('venice'); disposeSettingsProviderPanels(); panel.textContent = 'CLI controls';
  await vi.waitFor(() => expect(panel.textContent).toBe('CLI controls')); await Promise.resolve();
  expect(state.switchProvider).not.toHaveBeenCalled();
});
it('does not change chat backend or refresh a replacement view after delayed provider consent', async () => {
  host(); let release!: (value: boolean) => void; state.switchProvider.mockImplementationOnce(() => new Promise<boolean>(resolve => { release = resolve; }));
  configureSettingsProviderBridgeDeps({ refreshNutritionAISettings: state.refresh });
  switchAIProviderBridge('venice'); await vi.waitFor(() => expect(state.switchProvider).toHaveBeenCalledOnce());
  disposeSettingsProviderPanels(); state.backend = 'codex'; release(true); await Promise.resolve(); await Promise.resolve();
  expect(setChatBackend).not.toHaveBeenCalled(); expect(state.refresh).not.toHaveBeenCalled(); expect(state.backend).toBe('codex');
});

it('disposes loaded wallet controls synchronously on Settings close and provider switch', async () => {
  host(); await initSettingsProviderPanels(); expect(state.clearWallet).not.toHaveBeenCalled();
  disposeSettingsProviderPanels(); expect(state.clearWallet).toHaveBeenCalledOnce();
  host(); switchAIProviderBridge('venice'); expect(state.clearWallet).toHaveBeenCalledTimes(2);
  await vi.waitFor(() => expect(state.switchProvider).toHaveBeenCalledOnce());
});

it('preserves a newer provider owner mounted inside the same Settings root while initialization loads', async () => {
  const panel = host(); panel.innerHTML = renderAIProviderPanelBridge();
  const work = initSettingsProviderPanels();
  const input = document.createElement('input'); input.type = 'password'; input.value = 'PRIVATE DRAFT';
  panel.replaceChildren(input); state.provider = 'custom';
  await work;
  expect(panel.firstElementChild).toBe(input); expect(input.value).toBe('PRIVATE DRAFT');
  expect(state.render).not.toHaveBeenCalled(); expect(state.hydrate).not.toHaveBeenCalled(); expect(state.init).not.toHaveBeenCalled();
});
it('uses the latest provider when only the stored selection changes while the loading owner remains', async () => {
  const panel = host(); panel.innerHTML = renderAIProviderPanelBridge();
  const work = initSettingsProviderPanels(); state.provider = 'venice'; await work;
  expect(state.render).toHaveBeenCalledWith('venice'); expect(getAiSettingsView()?.getSnapshot().activeProvider).toBe('venice'); expect(state.hydrate).toHaveBeenCalledOnce(); expect(state.init).toHaveBeenCalledTimes(2);
});

it('keeps a rejected feature toggle consistent with persistence and allows a retry', () => {
  host(); const checkbox = document.querySelector<HTMLInputElement>('#ai-pause-toggle')!;
  state.persistPause.mockImplementationOnce(() => { throw new Error('storage unavailable'); });
  checkbox.click();
  expect(checkbox.checked).toBe(true); expect(state.paused).toBe(false);
  expect(document.body.textContent).toContain('AI features could not be updated');
  expect(state.notify).not.toHaveBeenCalled(); expect(state.focus).not.toHaveBeenCalled();
  checkbox.click();
  expect(checkbox.checked).toBe(false); expect(state.paused).toBe(true);
  expect(document.body.textContent).not.toContain('AI features could not be updated');
  expect(state.notify).toHaveBeenCalledExactlyOnceWith('AI features paused','info');
  expect(state.focus).toHaveBeenCalledOnce();
  checkbox.click(); expect(checkbox.checked).toBe(true); expect(state.paused).toBe(false);
});
it('rejects pause and provider helpers after the parent is disposed', () => {
  host(); disposeSettingsProviderPanels();
  toggleAIPauseBridge(false); switchAIProviderBridge('venice'); showCLIAgentProviderBridge();
  expect(state.persistPause).not.toHaveBeenCalled(); expect(state.switchProvider).not.toHaveBeenCalled();
  expect(getAiSettingsView()).toBeNull();
});
it('restores the selected CLI preview when provider consent is declined', async () => {
  state.backend = 'codex'; const panel = host(); state.switchProvider.mockResolvedValueOnce(false);
  switchAIProviderBridge('venice');
  await vi.waitFor(() => expect(panel.textContent).toBe('CLI controls'));
  expect(getAiSettingsView()?.getSnapshot().activeProvider).toBe('cli');
  expect(state.backend).toBe('codex'); expect(setChatBackend).not.toHaveBeenCalled();
});
