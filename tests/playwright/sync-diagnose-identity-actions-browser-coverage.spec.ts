import { createModuleUrl } from '../helpers/browser-module-url.js';
import { expect, test } from './coverage-fixture.js';

const moduleUrl = createModuleUrl('syncDiagnoseIdentityActionsCoverage');

test('sync diagnose identity actions cover rotate modal and apply paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('body');

  const results = await page.evaluate(async ({ actionsUrl }) => {
    const [actions, context, confirmRuntime] = await Promise.all([
      (import(actionsUrl) as Promise<unknown>) as Promise<Pick<typeof import('../../js/sync-diagnose-identity-actions.js'), "confirmRotateIdentity">>,
      import('/js/sync-diagnose-actions-context.js'),
      import('/js/sync-diagnose-runtime.js'),
    ]);
    const outcomes: Record<string, unknown> = {};
    const saved = {
      bip39: (window as unknown as {bip39?: unknown}).bip39,
      qrcode: (window as unknown as {qrcode?: unknown}).qrcode,
      clipboard: Object.getOwnPropertyDescriptor(navigator, 'clipboard'),
      execCommand: document.execCommand,
      bodyHTML: document.body.innerHTML,
    };
    const confirmMessages: string[] = [];
    const notifications = () => [...document.querySelectorAll<HTMLElement>('.notification-toast')]
      .map(toast => toast.textContent || '')
      .join('\n');
    const clearNotifications = () => {
      document.querySelectorAll<HTMLElement>('.notification-toast').forEach(toast => toast.remove());
      const container = document.getElementById('notification-container');
      if (container) container.innerHTML = '';
    };
    const waitFor = async (predicate: () => unknown | Promise<unknown>) => {
      for (let i = 0; i < 60; i += 1) {
        const value = predicate();
        if (value) return value;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return null;
    };
    const words = Array.from({ length: 24 }, (_, index) => `word${index + 1}`);
    let confirmResponses: boolean[] = [];
    const previousConfirmDeps = confirmRuntime.configureSyncDiagnoseRuntimeDeps({
      showConfirmDialog: async message => {
        confirmMessages.push(String(message || ''));
        return confirmResponses.length ? confirmResponses.shift()! : true;
      },
    });
    let generatedBits: unknown = null;
    let qrData: unknown = null;
    let qrMade = false;
    const enableCalls: unknown[][] = [];
    const restoreCalls: unknown[][] = [];
    const copied: unknown[] = [];

    try {
      document.querySelectorAll<HTMLElement>('.modal-overlay').forEach(overlay => overlay.remove());
      clearNotifications();
      confirmResponses = [false];
      await actions.confirmRotateIdentity();
      outcomes.warningCancelStopsBeforeMnemonic = confirmMessages[0]?.includes('Rotate sync identity') === true
        && confirmMessages[0]?.includes('OTHER device') === true
        && !document.querySelector<HTMLElement>('.modal-overlay');

      clearNotifications();
      confirmResponses = [true];
      (window as unknown as {bip39?: unknown}).bip39 = {
        generateMnemonic: async () => {
          throw new Error('entropy unavailable');
        },
      };
      await actions.confirmRotateIdentity();
      outcomes.mnemonicGenerationFailureNotifies = notifications().includes('Mnemonic generation failed: entropy unavailable')
        && !document.querySelector<HTMLElement>('.modal-overlay');

      clearNotifications();
      (window as unknown as {bip39?: unknown}).bip39 = {
        generateMnemonic: async () => 'too few words',
      };
      await actions.confirmRotateIdentity();
      outcomes.malformedMnemonicNotifies = notifications().includes('Generated mnemonic is malformed')
        && !document.querySelector<HTMLElement>('.modal-overlay');

      (window as unknown as {bip39?: unknown}).bip39 = {
        generateMnemonic: async (bits: unknown) => {
          generatedBits = bits;
          return words.join(' ');
        },
      };
      (window as unknown as {qrcode?: unknown}).qrcode = function qrcodeStub() {
        return {
          addData(value: unknown) { qrData = value; },
          make() { qrMade = true; },
          createSvgTag() { return '<svg data-sync-identity-qr="1"></svg>'; },
        };
      };
      context.configureSyncDiagnoseActionContext({
        isSyncEnabled: () => false,
        enableSync: async (...args) => {
          enableCalls.push(args);
          return true;
        },
        restoreFromMnemonic: async (...args) => {
          restoreCalls.push(args);
          return true;
        },
      });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text: string) => copied.push(text) },
      });

      const existing = document.createElement('div');
      existing.className = 'modal-overlay show';
      existing.innerHTML = '<button id="rotate-existing-trigger">Rotate</button>';
      document.body.appendChild(existing);
      const trigger = existing.querySelector('button');
      await actions.confirmRotateIdentity(trigger);

      const overlay = document.querySelector<HTMLElement>('.modal-overlay.show');
      const applyBtn = overlay?.querySelector<HTMLButtonElement>('#rotate-apply-btn');
      const check = overlay?.querySelector<HTMLButtonElement>('#rotate-saved-check');
      const copyBtn = overlay?.querySelector<HTMLButtonElement>('#rotate-copy-btn');
      outcomes.modalReplacesExistingOverlayAndRendersQr = existing.isConnected === false
        && generatedBits === 256
        && qrData === words.join(' ')
        && (qrMade as boolean) === true
        && overlay?.querySelector<HTMLButtonElement>('svg[data-sync-identity-qr="1"]') !== null
        && document.getElementById('rotate-words')?.textContent.includes('word24') === true
        && applyBtn?.disabled === true;

      copyBtn?.click();
      await waitFor(() => copied.length > 0);
      outcomes.copyButtonWritesMnemonic = copied[0] === words.join(' ')
        && copyBtn?.textContent.includes('Copied') === true;

      check?.click();
      outcomes.savedCheckboxEnablesApply = applyBtn?.disabled === false;
      applyBtn?.click();
      await waitFor(() => restoreCalls.length === 1);
      outcomes.applyEnablesSyncAndRestoresMnemonic = enableCalls.length === 1
        && (enableCalls[0]?.[0] as {skipPush?: unknown} | undefined)?.skipPush === true
        && restoreCalls[0]?.[0] === words.join(' ')
        && (restoreCalls[0]?.[1] as {seedLocal?: unknown} | undefined)?.seedLocal === true
        && applyBtn?.disabled === true
        && applyBtn?.textContent.includes('Applying') === true;
      overlay?.remove();

      (window as unknown as {qrcode?: unknown}).qrcode = function brokenQRCode() {
        throw new Error('qr unavailable');
      };
      context.configureSyncDiagnoseActionContext({
        isSyncEnabled: () => true,
        enableSync: async (...args) => {
          enableCalls.push(args);
          return true;
        },
        restoreFromMnemonic: async (...args) => {
          restoreCalls.push(args);
          return false;
        },
      });
      const beforeFailureEnableCalls = enableCalls.length;
      const beforeFailureRestoreCalls = restoreCalls.length;
      await actions.confirmRotateIdentity();
      const failureOverlay = document.querySelector<HTMLElement>('.modal-overlay.show');
      const failureApply = failureOverlay?.querySelector<HTMLButtonElement>('#rotate-apply-btn');
      failureOverlay?.querySelector<HTMLButtonElement>('#rotate-saved-check')?.click();
      failureApply?.click();
      await waitFor(() => restoreCalls.length === beforeFailureRestoreCalls + 1);
      await waitFor(() => failureApply?.disabled === false && failureApply?.textContent === 'Apply on this device');
      outcomes.restoreFalseSkipsEnableWhenAlreadyEnabled = enableCalls.length === beforeFailureEnableCalls;
      outcomes.restoreFalseCallsRestoreWithSeedLocal = (restoreCalls.at(-1)?.[1] as {seedLocal?: unknown} | undefined)?.seedLocal === true;
      outcomes.restoreFalseOmitsQrWhenQrGenerationFails = failureOverlay?.querySelector<HTMLButtonElement>('svg') === null;
      outcomes.restoreFalseResetsApplyButton = failureApply?.disabled === false
        && failureApply?.textContent === 'Apply on this device';
      outcomes.restoreFalseNotifies = notifications().includes('Restore returned false');
    } finally {
      context.configureSyncDiagnoseActionContext({
        enableSync: async () => false,
        restoreFromMnemonic: async () => false,
        isSyncEnabled: () => false,
      });
      confirmRuntime.configureSyncDiagnoseRuntimeDeps(previousConfirmDeps);
      if (saved.bip39 === undefined) delete (window as unknown as {bip39?: unknown}).bip39;
      else (window as unknown as {bip39?: unknown}).bip39 = saved.bip39;
      if (saved.qrcode === undefined) delete (window as unknown as {qrcode?: unknown}).qrcode;
      else (window as unknown as {qrcode?: unknown}).qrcode = saved.qrcode;
      if (saved.clipboard) Object.defineProperty(navigator, 'clipboard', saved.clipboard);
      else delete (navigator as {clipboard?: unknown}).clipboard;
      document.execCommand = saved.execCommand;
      document.body.innerHTML = saved.bodyHTML;
    }

    return outcomes;
  }, {
    actionsUrl: moduleUrl('/js/sync-diagnose-identity-actions.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
