// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {configureProviderPanelRendererRuntime} from '../js/provider-panel-renderers-runtime.js';
import {
  clearRoutstrWalletTimers, configureRoutstrWalletRuntime, hydrateRoutstrSettings,
  refreshCashuWalletBalance, refreshRoutstrBalance, refreshWalletSeedStatus,
} from '../js/provider-wallet-panels.js';

const owner = vi.hoisted(() => ({
  provider: 'routstr',
  key: 'synthetic-session-a',
  node: 'https://node-a.example.invalid',
  balance: vi.fn<() => Promise<{sats: number} | null>>(),
  touchSession: vi.fn(),
}));
vi.mock('../js/api.js', async load => ({
  ...await load<typeof import('../js/api.js')>(),
  getAIProvider: () => owner.provider,
  getRoutstrKey: () => owner.key,
  getRoutstrBalance: owner.balance,
  touchRoutstrSession: owner.touchSession,
}));
vi.mock('../js/agent-chat-settings.js', async load => ({
  ...await load<typeof import('../js/agent-chat-settings.js')>(),
  getChatBackend: () => 'direct',
}));

const mintA = 'https://mint-a.example.invalid';
const mintB = 'https://mint-b.example.invalid';
const mint = vi.fn<() => Promise<string>>();
const wallet = vi.fn<() => Promise<number>>();
const savedWallet = vi.fn<() => Promise<number>>();
const proofs = vi.fn<(mint: string) => Promise<number>>();
const seed = vi.fn<() => Promise<boolean>>();
const transfer = vi.fn(async () => { throw new Error('Unexpected transfer'); });
const network = vi.fn(async () => { throw new Error('Unexpected network'); });
const status = (id: string) => document.getElementById(id)?.textContent?.trim();

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return {promise, resolve};
}

let reset: () => void;
beforeEach(() => {
  vi.resetAllMocks();
  owner.provider = 'routstr';
  owner.node = 'https://node-a.example.invalid';
  owner.key = 'synthetic-session-a';
  mint.mockResolvedValue(mintA);
  wallet.mockResolvedValue(340);
  savedWallet.mockResolvedValue(80);
  proofs.mockResolvedValue(350);
  seed.mockResolvedValue(true);
  transfer.mockImplementation(async () => { throw new Error('Unexpected transfer'); });
  network.mockImplementation(async () => { throw new Error('Unexpected network'); });
  vi.stubGlobal('fetch', network);
  localStorage.clear();
  document.body.innerHTML = '<div id="ai-provider-panel"><div data-routstr-settings-host></div></div>';
  const panel = configureProviderPanelRendererRuntime({getSelectedNodeUrl: () => owner.node, discoverNodes: null});
  const runtime = configureRoutstrWalletRuntime({
    cashuGetMintUrl: mint, cashuGetBalance: wallet, cashuGetLocalBalance: savedWallet,
    cashuCheckProofStates: proofs, cashuHasWalletSeed: seed, cashuGetPendingNodeRefund: async () => null,
    cashuRecoverPendingDeposit: async () => null, cashuRecoverPendingWithdraw: async () => null,
    cashuReceiveToken: transfer, cashuDepositToNode: transfer, cashuExecuteWithdraw: transfer,
  });
  reset = () => {
    configureRoutstrWalletRuntime(runtime);
    configureProviderPanelRendererRuntime(panel);
  };
});
afterEach(() => {
  try {
    expect(transfer).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  } finally {
    clearRoutstrWalletTimers();
    reset();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    localStorage.clear();
  }
});

it('renders each verified node balance in the current settings owner and rejects invalid amounts', async () => {
  hydrateRoutstrSettings();
  await vi.waitFor(() => expect(status('routstr-wallet-balance')).toBe('⚡ 340 sats'));
  expect(status('routstr-mint-label')).toBe('mint-a.example.invalid');
  expect(status('routstr-wallet-device-status')).toBe('12-word wallet seed set up on this device');

  for (const [value, text, tone] of [
    [50, 'Balance: ⚡ 50 sats', 'danger'],
    [200, 'Balance: ⚡ 200 sats', 'warning'],
    [650, 'Balance: ⚡ 650 sats', 'success'],
    [-1, 'Balance: unavailable', 'secondary'],
    [20.5, 'Balance: unavailable', 'secondary'],
  ] as const) {
    owner.balance.mockResolvedValueOnce({sats: value});
    refreshRoutstrBalance();
    expect(status('routstr-node-balance')).toBe('Balance: refreshing...');
    await vi.waitFor(() => expect(status('routstr-node-balance')).toBe(text));
    if (tone !== 'secondary') expect(document.getElementById('routstr-node-balance')?.className).toContain(tone);
  }
  expect(owner.touchSession).toHaveBeenCalledTimes(3);
  owner.balance.mockRejectedValueOnce(new Error('Private transport diagnostics'));
  refreshRoutstrBalance();
  await vi.waitFor(() => expect(status('routstr-node-balance')).toBe('Balance: unavailable'));
  expect(document.body.textContent).not.toContain('Private transport diagnostics');
});

it.each(['node', 'key', 'provider', 'component', 'new request'] as const)(
  'discards a node balance from the previous %s owner',
  async change => {
    hydrateRoutstrSettings();
    await vi.waitFor(() => expect(status('routstr-wallet-balance')).toBe('⚡ 340 sats'));
    const pending = deferred<{sats: number}>();
    owner.balance.mockReturnValueOnce(pending.promise);
    refreshRoutstrBalance();
    expect(status('routstr-node-balance')).toBe('Balance: refreshing...');
    if (change === 'node') owner.node = 'https://node-b.example.invalid';
    if (change === 'key') owner.key = 'synthetic-session-b';
    if (change === 'provider') owner.provider = 'openrouter';
    if (change === 'component') {
      document.getElementById('ai-provider-panel')!.replaceChildren();
      hydrateRoutstrSettings();
    }
    if (change === 'new request') {
      owner.balance.mockResolvedValueOnce({sats: 77});
      refreshRoutstrBalance();
      await vi.waitFor(() => expect(status('routstr-node-balance')).toBe('Balance: ⚡ 77 sats'));
    }
    const displayed = status('routstr-node-balance');
    pending.resolve({sats: 999});
    await pending.promise;
    expect(status('routstr-node-balance')).toBe(displayed);
    expect(document.body.textContent).not.toContain('999 sats');
    expect(owner.touchSession).toHaveBeenCalledTimes(change === 'new request' ? 1 : 0);
  },
);

it('reads the newly selected mint locally when its display owner changes during proof verification', async () => {
  hydrateRoutstrSettings();
  await vi.waitFor(() => expect(status('routstr-wallet-balance')).toBe('⚡ 340 sats'));
  const pending = deferred<number>();
  proofs.mockReturnValueOnce(pending.promise);
  const verification = refreshCashuWalletBalance();
  await vi.waitFor(() => expect(proofs).toHaveBeenCalledWith(mintA));
  expect(status('routstr-wallet-balance')).toBe('⚡ verifying...');
  mint.mockResolvedValue(mintB);
  pending.resolve(999);
  await verification;
  expect(proofs).toHaveBeenCalledTimes(1);
  expect(savedWallet).toHaveBeenCalledTimes(1);
  expect(status('routstr-wallet-balance')).toBe('⚡ 80 sats');
  expect(status('routstr-mint-label')).toBe('mint-b.example.invalid');
});

it('keeps failed verification and seed readiness localized to the current form', async () => {
  hydrateRoutstrSettings();
  await vi.waitFor(() => expect(status('routstr-wallet-balance')).toBe('⚡ 340 sats'));
  proofs.mockResolvedValueOnce(-1);
  await refreshCashuWalletBalance();
  expect(status('routstr-wallet-balance')).toBe('⚡ 80 sats (saved balance; check failed)');
  mint.mockResolvedValueOnce('unusable mint URL');
  savedWallet.mockRejectedValueOnce(new Error('private storage details'));
  await refreshCashuWalletBalance();
  expect(proofs).toHaveBeenCalledTimes(1);
  expect(status('routstr-wallet-balance')).toBe('⚡ check failed');
  seed.mockResolvedValueOnce(false);
  await refreshWalletSeedStatus();
  expect(status('routstr-wallet-device-status')).toBe('No 12-word wallet seed on this device');
  seed.mockRejectedValueOnce(new Error('private storage details'));
  await refreshWalletSeedStatus();
  expect(status('routstr-wallet-device-status')).toBe('Local wallet setup unavailable');
  expect(document.body.textContent).not.toContain('private storage details');
});
