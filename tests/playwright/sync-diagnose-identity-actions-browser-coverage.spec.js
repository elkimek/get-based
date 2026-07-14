import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?syncDiagnoseIdentityActionsCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('sync diagnose identity actions cover rotate modal and apply paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForSelector('body');

  const results = await page.evaluate(async ({ actionsUrl }) => {
    const [actions, context, confirmRuntime] = await Promise.all([
      import(actionsUrl),
      import('/js/sync-diagnose-actions-context.js'),
      import('/js/sync-diagnose-runtime.js'),
    ]);
    const outcomes = {};
    const saved = {
      bip39: window.bip39,
      qrcode: window.qrcode,
      clipboard: Object.getOwnPropertyDescriptor(navigator, 'clipboard'),
      execCommand: document.execCommand,
      bodyHTML: document.body.innerHTML,
    };
    const confirmMessages = [];
    const notifications = () => [...document.querySelectorAll('.notification-toast')]
      .map(toast => toast.textContent || '')
      .join('\n');
    const clearNotifications = () => {
      document.querySelectorAll('.notification-toast').forEach(toast => toast.remove());
      const container = document.getElementById('notification-container');
      if (container) container.innerHTML = '';
    };
    const waitFor = async predicate => {
      for (let i = 0; i < 60; i += 1) {
        const value = predicate();
        if (value) return value;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return null;
    };
    const words = Array.from({ length: 24 }, (_, index) => `word${index + 1}`);
    let confirmResponses = [];
    const previousConfirmDeps = confirmRuntime.configureSyncDiagnoseRuntimeDeps({
      showConfirmDialog: async message => {
        confirmMessages.push(String(message || ''));
        return confirmResponses.length ? confirmResponses.shift() : true;
      },
    });
    let generatedBits = null;
    let qrData = null;
    let qrMade = false;
    const enableCalls = [];
    const restoreCalls = [];
    const copied = [];

    try {
      document.querySelectorAll('.modal-overlay').forEach(overlay => overlay.remove());
      clearNotifications();
      confirmResponses = [false];
      await actions.confirmRotateIdentity();
      outcomes.warningCancelStopsBeforeMnemonic = confirmMessages[0]?.includes('Rotate sync identity') === true
        && confirmMessages[0]?.includes('OTHER device') === true
        && !document.querySelector('.modal-overlay');

      clearNotifications();
      confirmResponses = [true];
      window.bip39 = {
        generateMnemonic: async () => {
          throw new Error('entropy unavailable');
        },
      };
      await actions.confirmRotateIdentity();
      outcomes.mnemonicGenerationFailureNotifies = notifications().includes('Mnemonic generation failed: entropy unavailable')
        && !document.querySelector('.modal-overlay');

      clearNotifications();
      window.bip39 = {
        generateMnemonic: async () => 'too few words',
      };
      await actions.confirmRotateIdentity();
      outcomes.malformedMnemonicNotifies = notifications().includes('Generated mnemonic is malformed')
        && !document.querySelector('.modal-overlay');

      window.bip39 = {
        generateMnemonic: async bits => {
          generatedBits = bits;
          return words.join(' ');
        },
      };
      window.qrcode = function qrcodeStub() {
        return {
          addData(value) { qrData = value; },
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
        value: { writeText: async text => copied.push(text) },
      });

      const existing = document.createElement('div');
      existing.className = 'modal-overlay show';
      existing.innerHTML = '<button id="rotate-existing-trigger">Rotate</button>';
      document.body.appendChild(existing);
      const trigger = existing.querySelector('button');
      await actions.confirmRotateIdentity(trigger);

      const overlay = document.querySelector('.modal-overlay.show');
      const applyBtn = overlay?.querySelector('#rotate-apply-btn');
      const check = overlay?.querySelector('#rotate-saved-check');
      const copyBtn = overlay?.querySelector('#rotate-copy-btn');
      outcomes.modalReplacesExistingOverlayAndRendersQr = existing.isConnected === false
        && generatedBits === 256
        && qrData === words.join(' ')
        && qrMade === true
        && overlay?.querySelector('svg[data-sync-identity-qr="1"]') !== null
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
        && enableCalls[0]?.[0]?.skipPush === true
        && restoreCalls[0]?.[0] === words.join(' ')
        && restoreCalls[0]?.[1]?.seedLocal === true
        && applyBtn?.disabled === true
        && applyBtn?.textContent.includes('Applying') === true;
      overlay?.remove();

      window.qrcode = function brokenQRCode() {
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
      const failureOverlay = document.querySelector('.modal-overlay.show');
      const failureApply = failureOverlay?.querySelector('#rotate-apply-btn');
      failureOverlay?.querySelector('#rotate-saved-check')?.click();
      failureApply?.click();
      await waitFor(() => restoreCalls.length === beforeFailureRestoreCalls + 1);
      await waitFor(() => failureApply?.disabled === false && failureApply?.textContent === 'Apply on this device');
      outcomes.restoreFalseSkipsEnableWhenAlreadyEnabled = enableCalls.length === beforeFailureEnableCalls;
      outcomes.restoreFalseCallsRestoreWithSeedLocal = restoreCalls.at(-1)?.[1]?.seedLocal === true;
      outcomes.restoreFalseOmitsQrWhenQrGenerationFails = failureOverlay?.querySelector('svg') === null;
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
      if (saved.bip39 === undefined) delete window.bip39;
      else window.bip39 = saved.bip39;
      if (saved.qrcode === undefined) delete window.qrcode;
      else window.qrcode = saved.qrcode;
      if (saved.clipboard) Object.defineProperty(navigator, 'clipboard', saved.clipboard);
      else delete navigator.clipboard;
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
