// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {configureProviderPanelRendererRuntime} from '../js/provider-panel-renderers-runtime.js';
import {
  clearRoutstrWalletTimers, configureRoutstrWalletRuntime, hydrateRoutstrSettings,
  refreshCashuWalletBalance, refreshRoutstrBalance, refreshWalletSeedStatus, walletRuntime,
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
const inventory = vi.fn<() => Promise<{mint: string; balance: number}[]>>();
const pendingDeposit = vi.fn<() => Promise<string | null>>();
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
  inventory.mockResolvedValue([{mint: mintA, balance: 340}, {mint: mintB, balance: 80}]);
  pendingDeposit.mockResolvedValue(null);
  transfer.mockImplementation(async () => { throw new Error('Unexpected transfer'); });
  network.mockImplementation(async () => { throw new Error('Unexpected network'); });
  vi.stubGlobal('fetch', network);
  localStorage.clear();
  document.body.innerHTML = '<div id="ai-provider-panel"><div data-routstr-settings-host></div></div>';
  const panel = configureProviderPanelRendererRuntime({getSelectedNodeUrl: () => owner.node, discoverNodes: null});
  const runtime = configureRoutstrWalletRuntime({
    cashuGetMintUrl: mint, cashuGetBalance: wallet, cashuGetLocalBalance: savedWallet,
    cashuCheckProofStates: proofs, cashuHasWalletSeed: seed, cashuGetPendingNodeRefund: async () => null,
    cashuRecoverPendingDeposit: pendingDeposit, cashuRecoverPendingWithdraw: async () => null,
    cashuGetWalletMints: inventory, nostrGetSelectedNode: () => null,
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

it('keeps the native balance buttons and mint chooser scoped to the current account', async () => {
  hydrateRoutstrSettings();
  await vi.waitFor(() => expect(status('routstr-wallet-balance')).toBe('⚡ 340 sats'));
  const button = (action: string) => document.querySelector<HTMLButtonElement>('[data-provider-panel-action="' + action + '"]')!;
  owner.balance.mockResolvedValueOnce({sats: 220});
  button('refresh-routstr-balance').click();
  await vi.waitFor(() => expect(status('routstr-node-balance')).toBe('Balance: ⚡ 220 sats'));
  button('refresh-cashu-wallet-balance').click();
  await vi.waitFor(() => expect(status('routstr-wallet-balance')).toBe('⚡ 350 sats'));

  button('show-routstr-mint-edit').click();
  const picker = document.querySelector<HTMLElement>('[data-wallet-mint-view]')!;
  await vi.waitFor(() => expect(picker.getAttribute('aria-busy')).toBe('false'));
  expect(picker.textContent).toContain('80 sats');
  const reload = [...picker.querySelectorAll('button')].find(candidate => candidate.textContent === 'Reload balances')!;
  inventory.mockResolvedValueOnce([{mint: mintB, balance: 120}]);
  reload.click();
  await vi.waitFor(() => expect(picker.textContent).toContain('120 sats'));
  const url = picker.querySelector<HTMLInputElement>('#routstr-mint-input')!;
  url.value = 'not a public mint';
  url.dispatchEvent(new Event('input', {bubbles: true}));
  picker.querySelector<HTMLButtonElement>('[data-routstr-wallet-action="save-mint"]')!.click();
  await vi.waitFor(() => expect(status('routstr-mint-status')).toBe('Enter a valid public mint URL (https://...)'));
  expect(status('routstr-mint-label')).toBe('mint-a.example.invalid');

  picker.querySelector<HTMLButtonElement>('[data-routstr-wallet-action="cancel-mint"]')!.click();
  expect(picker.isConnected).toBe(false);
  owner.key = 'synthetic-replacement-account';
  button('show-routstr-mint-edit').click();
  expect(document.querySelector('[data-wallet-mint-view]')).toBeNull();
});

it('copies only the selected synthetic recovery and refuses its replacement before receiving funds', async () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const privateValue = 'synthetic-saved-recovery';
  const writeText = vi.fn(async (_value: string) => {});
  Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText}});
  try {
    pendingDeposit.mockResolvedValueOnce(privateValue);
    hydrateRoutstrSettings();
    const recovery = () => document.querySelector<HTMLElement>('[aria-label="Pending deposit recovery"]')!;
    await vi.waitFor(() => expect(recovery()?.querySelector('textarea')?.value).toBe(privateValue));
    const send = (label: string) => [...recovery().querySelectorAll('button')].find(candidate => candidate.textContent === label)!.click();
    vi.useFakeTimers();
    send('Copy Token');
    await vi.advanceTimersByTimeAsync(0);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(privateValue);
    expect(recovery().textContent).toContain('Copied');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(writeText.mock.calls).toEqual([[privateValue], ['']]);
    pendingDeposit.mockResolvedValueOnce('synthetic-replacement-recovery');
    send('Recover to Wallet');
    await vi.advanceTimersByTimeAsync(0);
    expect(recovery().textContent).toContain('The saved recovery changed');
    expect(recovery().querySelector('textarea')?.value).toBe(privateValue);
    expect(recovery().textContent).not.toContain('synthetic-replacement-recovery');
  } finally {
    vi.useRealTimers();
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else Reflect.deleteProperty(navigator, 'clipboard');
  }
});

function openWalletMenuAction(action: 'seed' | 'backup'): void {
  document.querySelector<HTMLButtonElement>('[data-routstr-wallet-action="toggle-wallet-menu"]')!.click();
  document.querySelector<HTMLButtonElement>('[data-wallet-action="' + action + '"]')!.click();
}

function withStubClipboard(writeText: (value: string) => Promise<void>): () => void {
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText}});
  return () => {
    if (original) Object.defineProperty(navigator, 'clipboard', original);
    else Reflect.deleteProperty(navigator, 'clipboard');
  };
}

const fixtureSeed = Array.from({length: 12}, () => 'fixture').join(' ');

it('keeps the native seed masked until reveal and clears a copied seed after its panel closes', async () => {
  const writeText = vi.fn(async (_value: string) => {});
  const restoreClipboard = withStubClipboard(writeText);
  const restoreSeed = vi.fn(async () => { throw new Error('Unexpected restore'); });
  const previous = configureRoutstrWalletRuntime({...walletRuntime, cashuGetWalletMnemonic: async () => fixtureSeed, cashuRestoreWalletFromSeed: restoreSeed});
  try {
    hydrateRoutstrSettings();
    openWalletMenuAction('seed');
    await vi.waitFor(() => expect(document.getElementById('wallet-seed-display')).not.toBeNull());
    const panel = document.querySelector<HTMLElement>('[data-wallet-seed-view]')!;
    const words = panel.querySelector<HTMLButtonElement>('#wallet-seed-display')!;
    expect(words.getAttribute('aria-pressed')).toBe('false');
    expect(panel.textContent).not.toContain(fixtureSeed);
    expect(writeText).not.toHaveBeenCalled();
    words.click();
    expect(words.getAttribute('aria-pressed')).toBe('true');
    expect(words.textContent).toBe(fixtureSeed);
    words.click();
    expect(words.getAttribute('aria-pressed')).toBe('false');
    expect(panel.textContent).not.toContain(fixtureSeed);
    const draft = panel.querySelector<HTMLTextAreaElement>('textarea')!;
    draft.value = 'fixture';
    draft.dispatchEvent(new Event('input', {bubbles: true}));
    panel.querySelector<HTMLButtonElement>('[data-routstr-wallet-action="wallet-restore"]')!.click();
    await vi.waitFor(() => expect(status('routstr-restore-status')).toBe('Enter exactly 12 words'));
    expect(restoreSeed).not.toHaveBeenCalled();

    vi.useFakeTimers();
    [...panel.querySelectorAll('button')].find(button => button.textContent === 'Copy Seed')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(fixtureSeed);
    expect(panel.textContent).toContain('Copied (60s)');
    openWalletMenuAction('seed');
    expect(panel.isConnected).toBe(false);
    expect(draft.value).toBe('');
    expect(words.textContent).not.toContain(fixtureSeed);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(writeText).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(writeText.mock.calls).toEqual([[fixtureSeed], ['']]);
  } finally {
    configureRoutstrWalletRuntime(previous);
    restoreClipboard();
    vi.useRealTimers();
  }
});

it('requires acknowledged seed setup and keeps a failed acknowledgement reviewable', async () => {
  seed.mockResolvedValue(false);
  const createSeed = vi.fn(async () => ({mnemonic: fixtureSeed}));
  const acknowledge = vi.fn(async () => { seed.mockResolvedValue(true); })
    .mockRejectedValueOnce(new Error('Synthetic write failure'));
  const previous = configureRoutstrWalletRuntime({
    ...walletRuntime,
    cashuGetWalletMnemonic: async () => (await seed()) ? fixtureSeed : null,
    cashuGenerateWalletSeed: createSeed, acknowledgeWalletSeedBackup: acknowledge,
  });
  try {
    hydrateRoutstrSettings();
    openWalletMenuAction('seed');
    const create = '[data-routstr-wallet-action="setup-wallet-seed"]';
    await vi.waitFor(() => expect(document.querySelector(create)).not.toBeNull());
    document.querySelector<HTMLButtonElement>(create)!.click();
    await vi.waitFor(() => expect(document.querySelector('#routstr-seed-ack')).not.toBeNull());
    const confirm = document.querySelector<HTMLButtonElement>('#routstr-seed-continue')!;
    expect(confirm.disabled).toBe(true);
    confirm.click();
    expect(acknowledge).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(fixtureSeed);
    expect(createSeed).toHaveBeenCalledOnce();

    document.querySelector<HTMLInputElement>('#routstr-seed-ack')!.click();
    expect(confirm.disabled).toBe(false);
    confirm.click();
    await vi.waitFor(() => expect(status('routstr-restore-status')).toContain('Could not save the seed backup confirmation'));
    expect(confirm.isConnected).toBe(true);
    expect(confirm.disabled).toBe(false);
    confirm.click();
    await vi.waitFor(() => expect(document.getElementById('wallet-seed-display')).not.toBeNull());
    expect(acknowledge).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).not.toContain(fixtureSeed);
  } finally {
    configureRoutstrWalletRuntime(previous);
  }
});

it('retries a native wallet export and clears the synthetic token from the preview and stub clipboard', async () => {
  const token = 'synthetic-backup-for-active-mint';
  const exportToken = vi.fn(async (_mint: string) => token)
    .mockRejectedValueOnce(new Error('Synthetic storage details'));
  const writeText = vi.fn(async (_value: string) => {});
  const restoreClipboard = withStubClipboard(writeText);
  const previous = configureRoutstrWalletRuntime({...walletRuntime, cashuExportWallet: exportToken});
  try {
    hydrateRoutstrSettings();
    openWalletMenuAction('backup');
    const panel = document.querySelector<HTMLElement>('[data-wallet-export-view]')!;
    const button = (text: string) => [...panel.querySelectorAll('button')].find(candidate => candidate.textContent === text)!;
    await vi.waitFor(() => expect(panel.textContent).toContain('Funds and recovery records are preserved'));
    expect(panel.textContent).not.toContain('Synthetic storage details');
    expect(panel.querySelector('textarea')).toBeNull();
    expect(writeText).not.toHaveBeenCalled();

    vi.useFakeTimers();
    button('Refresh export').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(exportToken.mock.calls).toEqual([[mintA], [mintA]]);
    expect(panel.querySelector('[role="status"]')?.textContent).toContain('Wallet backup copied to clipboard');
    const preview = panel.querySelector<HTMLTextAreaElement>('#routstr-export-token');
    expect(preview?.value).toBe(token);
    expect(preview?.readOnly).toBe(true);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(token);
    button('✓ Copied (60s)').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(writeText.mock.calls).toEqual([[token], [token]]);
    button('Close export').click();
    expect(panel.isConnected).toBe(false);
    expect(preview?.value).toBe('');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(writeText.mock.calls).toEqual([[token], [token], ['']]);
  } finally {
    configureRoutstrWalletRuntime(previous);
    restoreClipboard();
    vi.useRealTimers();
  }
});

it('clears the withdrawal draft when switching rails and rejects invalid drafts before any transfer', async () => {
  const previous = configureRoutstrWalletRuntime({
    ...walletRuntime, cashuCreateWithdrawQuote: transfer, cashuSendAsToken: transfer, cashuWithdrawToAddress: transfer,
  });
  try {
    hydrateRoutstrSettings();
    document.querySelector<HTMLButtonElement>('#routstr-wallet-actions [data-wallet-action="withdraw"]')!.click();
    const panel = document.querySelector<HTMLElement>('[data-wallet-withdraw-view]')!;
    const action = (id: string) => panel.querySelector<HTMLButtonElement>('[data-routstr-wallet-action="' + id + '"]')!;
    await vi.waitFor(() => expect(panel.getAttribute('aria-busy')).toBe('false'));

    action('withdraw-lightning').click();
    await vi.waitFor(() => expect(action('withdraw-quote')?.disabled).toBe(false));
    const original = panel.querySelector<HTMLInputElement>('#routstr-withdraw-input')!;
    original.value = 'Synthetic invalid destination';
    original.dispatchEvent(new Event('input', {bubbles: true}));
    action('withdraw-quote').click();
    await vi.waitFor(() => expect(panel.textContent).toContain('Enter a Lightning invoice (lnbc…) or address'));

    action('withdraw-token').click();
    await vi.waitFor(() => expect(action('send-token-input')?.disabled).toBe(false));
    expect(original.value).toBe('');
    expect(original.isConnected).toBe(false);
    action('send-token-input').click();
    await vi.waitFor(() => expect(panel.textContent).toContain('Enter a valid whole amount'));
    expect(transfer).not.toHaveBeenCalled();

    const close = [...panel.querySelectorAll('button')].find(button => button.textContent === 'Close withdrawal')!;
    close.click();
    expect(panel.isConnected).toBe(false);
  } finally {
    configureRoutstrWalletRuntime(previous);
  }
});
