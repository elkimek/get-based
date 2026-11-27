// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {
  acknowledgeRoutstrKey, configureProviderPanelDeps, copyProviderPanelClipboard,
  recoverPendingDeposit, recoverPendingWithdraw, selectProviderPanelText, showInsufficientBalanceDialog,
} from '../js/provider-panels.js';
import {configureRoutstrWalletRuntime} from '../js/provider-wallet-panels.js';

const network = vi.fn(async () => { throw new Error('Unexpected network'); });
const reload = vi.fn();
let previousDeps: ReturnType<typeof configureProviderPanelDeps>;
let clipboard: PropertyDescriptor | undefined;
beforeEach(() => {
  previousDeps = configureProviderPanelDeps({reloadPage: reload});
  clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  network.mockClear();
  reload.mockClear();
  vi.stubGlobal('fetch', network);
  document.body.replaceChildren();
});
afterEach(() => {
  try {
    expect(network).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
    if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
    else Reflect.deleteProperty(navigator, 'clipboard');
    configureProviderPanelDeps(previousDeps);
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  }
});

it('copies the explicit compatibility field and clears the stub clipboard at its owned deadline', async () => {
  vi.useFakeTimers();
  const writeText = vi.fn(async (_value: string) => {});
  Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText}});
  const button = document.createElement('button');
  button.dataset.clipboardText = 'Synthetic copied field';
  button.dataset.token = 'Separate synthetic fallback field';
  button.dataset.copiedText = 'Local copy accepted';
  button.dataset.clearTimerKey = 'provider-fixture';
  button.dataset.clearClipboardAfter = '400';
  document.body.append(button);

  copyProviderPanelClipboard(null);
  copyProviderPanelClipboard(button);
  await vi.advanceTimersByTimeAsync(0);
  expect(button.textContent).toBe('Local copy accepted');
  expect(writeText).toHaveBeenCalledExactlyOnceWith('Synthetic copied field');
  await vi.advanceTimersByTimeAsync(399);
  expect(writeText).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(writeText.mock.calls).toEqual([['Synthetic copied field'], ['']]);

  const draft = document.createElement('textarea');
  draft.value = 'Synthetic field to select';
  document.body.append(draft);
  selectProviderPanelText(draft);
  expect([draft.selectionStart, draft.selectionEnd]).toEqual([0, draft.value.length]);
});

it.each(['deposit', 'withdraw'] as const)('keeps the pending %s journal when either recovery operation is unavailable', async (kind) => {
  vi.useFakeTimers();
  const receive = vi.fn(async () => { throw new Error('Unexpected transfer'); });
  const clear = vi.fn();
  const previous = configureRoutstrWalletRuntime({
    cashuReceiveToken: receive, cashuClearPendingDeposit: undefined, cashuClearPendingWithdraw: undefined,
  });
  const notifications = document.createElement('div');
  notifications.id = 'notification-container';
  const action = document.createElement('button');
  action.dataset.token = 'Synthetic held recovery';
  document.body.append(action, notifications);
  const recover = kind === 'deposit' ? recoverPendingDeposit : recoverPendingWithdraw;
  try {
    recover(action);
    await vi.advanceTimersByTimeAsync(0);
    expect(notifications.querySelector('[role="alert"]')?.textContent).toContain('Wallet recovery is unavailable');
    expect(receive).not.toHaveBeenCalled();
    notifications.replaceChildren();

    configureRoutstrWalletRuntime({
      cashuReceiveToken: undefined, cashuClearPendingDeposit: clear, cashuClearPendingWithdraw: clear,
    });
    recover(action);
    acknowledgeRoutstrKey();
    await vi.advanceTimersByTimeAsync(0);
    expect(notifications.querySelector('[role="alert"]')?.textContent).toContain('Wallet recovery is unavailable');
    expect(document.body.textContent).not.toContain('Synthetic held recovery');
    expect(clear).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  } finally {
    configureRoutstrWalletRuntime(previous);
  }
});

it('opens the published credit destination only after the explicit action with a private new tab', () => {
  const open = vi.fn();
  vi.stubGlobal('open', open);
  showInsufficientBalanceDialog();
  expect(open).not.toHaveBeenCalled();
  const action = document.querySelector<HTMLButtonElement>('#or-add-credits');
  expect(action).not.toBeNull();
  action!.click();
  expect(open).toHaveBeenCalledExactlyOnceWith('https://openrouter.ai/settings/credits', '_blank', 'noopener');
});
