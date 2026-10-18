import { createBlankPage } from '../helpers/browser-blank-page.js';
import { createModuleUrl } from '../helpers/browser-module-url.js';
import { expect, test } from './coverage-fixture.js';

const moduleUrl = createModuleUrl('dashboardAiCoverage');

const openBlankPage = createBlankPage({
  path: "/dashboard-ai-browser-coverage", routePattern: "**/dashboard-ai-browser-coverage**", body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
});

test('dashboard AI browser coverage exercises CTA rendering picker routing and DNA input', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ dashboardUrl }) => {
    const originalShowDirectoryPicker = (window as unknown as {showDirectoryPicker?: unknown}).showDirectoryPicker;
    const hadShowDirectoryPicker = Object.prototype.hasOwnProperty.call(window, 'showDirectoryPicker');
    (window as unknown as {showDirectoryPicker?: unknown}).showDirectoryPicker = async () => ({ name: 'Coverage Backups' });
    const dashboardAi = (await import(dashboardUrl) as unknown) as Omit<Pick<typeof import('../../js/context-card-dashboard-ai.js'), "configureDashboardAISyncSetup" | "configureDashboardAIDataProtectionDeps" | "renderInterpretiveLensSection" | "renderKnowledgeBaseSection" | "renderDataProtectionCta" | "loadDashboardAIModule" | "openDataProtectionPicker" | "openPersonalizeAIPicker" | "openContextModal" | "triggerDNAFilePicker">, 'loadDashboardAIModule'> & {loadDashboardAIModule: (...args: Parameters<typeof import('../../js/context-card-dashboard-ai.js')['loadDashboardAIModule']>) => unknown};
    const dashboardAiRuntime = await import('/js/context-card-dashboard-ai-runtime.js');
    const aiActionDelegates = await import('/js/ai-action-delegates.js');
    const apiRuntime = await import('/js/api-runtime.js');
    const apiVenice = await import('/js/api-venice.js');
    const lens = await import('/js/lens.js');
    const { state } = await import('/js/state.js');
    const contextCardsRuntime = await import('/js/context-cards-runtime.js');
    const dnaBridge = await import('/js/dna-runtime-bridge.js');
    const outcomes: Record<string, unknown> = {};

    const snapshotStorage = (storage: Storage) => new Map(Array.from({ length: storage.length }, (_: unknown, index: number) => storage.key(index))
      .filter(key => key !== null)
      .map(key => [key, storage.getItem(key)]));
    const restoreStorage = (storage: Storage, snapshot: ReturnType<typeof snapshotStorage>) => {
      storage.clear();
      for (const [key, value] of snapshot) {
        if (value != null) storage.setItem(key, value);
      }
    };

    const savedLocal = snapshotStorage(localStorage);
    const savedImportedData = state.importedData;
    const hadImportedData = Object.prototype.hasOwnProperty.call(state, 'importedData');
    const savedGlobals = {
      showDirectoryPicker: originalShowDirectoryPicker,
      setTimeout: window.setTimeout,
    };
    const hadGlobals: Record<string, boolean> = {};
    for (const name of Object.keys(savedGlobals)) {
      hadGlobals[name] = Object.prototype.hasOwnProperty.call(window, name);
    }
    const originalInputClick = HTMLInputElement.prototype.click;
    const host: HTMLElement|null = document.createElement('div');
    document.body.appendChild(host);

    const calls: unknown[] = [];
    const timers: unknown[] = [];
    let clickedInputId: string|null = null;
    let handledDnaFile: {name: string; textType: string}|null = null;

    dashboardAi.configureDashboardAISyncSetup(() => calls.push('sync'));
    const previousContextStatusHandler = dashboardAiRuntime.configureDashboardAIContextStatus(
      () => calls.push('context-status')
    );
    const previousDataProtectionDeps = dashboardAi.configureDashboardAIDataProtectionDeps({
      pickFolderForBackup: () => calls.push('backup'),
      showEnableEncryptionModal: () => calls.push('encryption'),
    });
    const previousApiRuntime = (apiRuntime.configureApiRuntimeCallbacks as (callbacks: Omit<NonNullable<Parameters<typeof apiRuntime.configureApiRuntimeCallbacks>[0]>, 'showInsufficientBalanceDialog'> & {showInsufficientBalanceDialog?:unknown}) => ReturnType<typeof apiRuntime.configureApiRuntimeCallbacks>)({
      showInsufficientBalanceDialog: null,
    });
    const previousContextCardsRuntime: ReturnType<typeof contextCardsRuntime.configureContextCardsRuntimeCallbacks>|null = contextCardsRuntime.configureContextCardsRuntimeCallbacks({
      openInterpretiveLensEditor: () => calls.push('lens'),
    });
    const previousDnaBridge = dnaBridge.configureDnaModuleBridge({
      handleDNAFile: (file: File) => {
        handledDnaFile = { name: file.name, textType: file.type };
      },
    });

    try {
      (window as unknown as {setTimeout: (fn: (...args:unknown[])=>unknown, delay:number,...args:unknown[])=>number}).setTimeout = (fn: (...args: unknown[]) => unknown, delay: number, ...args: unknown[]) => {
        timers.push(delay);
        if (typeof fn === 'function') Promise.resolve().then(() => fn(...args));
        return timers.length;
      };
      HTMLInputElement.prototype.click = function clickSpy() {
        clickedInputId = this.id;
      };

      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-encryption-enabled', 'false');
      localStorage.setItem('labcharts-sync-enabled', 'false');
      localStorage.setItem('labcharts-lens-key', 'coverage-key');
      localStorage.setItem('labcharts-lens-config', JSON.stringify({
        enabled: true,
        backend: 'external-server',
        url: 'https://kb.example/rag',
        name: 'Research <Vault>',
        multiQuery: true,
      }));
      (state as {importedData:unknown}).importedData = {
        ...(state.importedData || {}),
        interpretiveLens: 'Dr <Lens> & mitochondria',
      };

      const lensHtml = dashboardAi.renderInterpretiveLensSection();
      host.innerHTML = lensHtml;
      outcomes.renderInterpretiveLensEscapesLensAndKb = host.textContent.includes('Dr <Lens> & mitochondria')
        && host.textContent.includes('Research <Vault>')
        && host.textContent.includes('query rewriting on')
        && !lensHtml.includes('Dr <Lens>')
        && !lensHtml.includes('Research <Vault>')
        && host.querySelectorAll<HTMLElement>('.lens-section').length === 2
        && host.querySelector<HTMLElement>('[data-dashboard-ai-action="open-interpretive-lens"]')
        && host.querySelector<HTMLElement>('[data-dashboard-ai-action="open-knowledge-base"]')
        && !host.innerHTML.includes('onclick=')
        && !host.innerHTML.includes('onkeydown=');
      outcomes.renderInterpretiveLensHidesPersonalizeCtaWhenConfigured =
        !host.textContent.includes('Personalize how AI answers');
      outcomes.renderInterpretiveLensIncludesDataProtectionCta =
        !!host.querySelector<HTMLElement>('.dashboard-cta[aria-label="Protect your data"]');

      const kbHtml = dashboardAi.renderKnowledgeBaseSection();
      const kbNative = document.createElement('template'); kbNative.innerHTML = kbHtml;
      outcomes.renderKnowledgeBaseSectionShowsConfiguredExternalLibrary = kbHtml.includes('Knowledge Base')
        // Genuine Svelte text encoding escapes '<'; the native text remains exact.
        && kbHtml.includes('Research &lt;Vault>')
        && kbHtml.includes('query rewriting on')
        && kbNative.content.querySelector('.lens-section-text')?.textContent === 'Research <Vault> · query rewriting on'
        && !kbNative.content.querySelector('vault,script,[onclick]');

      localStorage.setItem('labcharts-lens-config', JSON.stringify({ enabled: false, backend: 'external-server', url: '', name: '' }));
      outcomes.renderKnowledgeBaseSectionHidesWhenUnconfigured = dashboardAi.renderKnowledgeBaseSection() === '';

      const ctaCases = {
        allProtected: dashboardAi.renderDataProtectionCta({
          encryption: true,
          sync: true,
          backup: true,
          backupSupported: true,
        }),
        encryptionOnly: dashboardAi.renderDataProtectionCta({
          encryption: false,
          sync: true,
          backup: true,
          backupSupported: true,
        }),
        syncOnly: dashboardAi.renderDataProtectionCta({
          encryption: true,
          sync: false,
          backup: true,
          backupSupported: true,
        }),
        backupOnly: dashboardAi.renderDataProtectionCta({
          encryption: true,
          sync: true,
          backup: false,
          backupSupported: true,
        }),
        backupUnsupported: dashboardAi.renderDataProtectionCta({
          encryption: true,
          sync: true,
          backup: false,
          backupSupported: false,
        }),
        multipleMissing: dashboardAi.renderDataProtectionCta({
          encryption: false,
          sync: false,
          backup: false,
          backupSupported: true,
        }),
      };
      outcomes.renderDataProtectionCtaCoversStatusMatrix = ctaCases.allProtected === ''
        && ctaCases.encryptionOnly.includes('Enable encryption')
        && ctaCases.encryptionOnly.includes('data-dashboard-ai-action="enable-encryption"')
        && ctaCases.syncOnly.includes('Sync to other devices')
        && ctaCases.syncOnly.includes('data-dashboard-ai-action="setup-sync"')
        && ctaCases.backupOnly.includes('Set up auto-backup')
        && ctaCases.backupOnly.includes('data-dashboard-ai-action="setup-backup"')
        && ctaCases.backupUnsupported === ''
        && ctaCases.multipleMissing.includes('Protect your data')
        && ctaCases.multipleMissing.includes('data-dashboard-ai-action="open-data-protection-picker"')
        && !Object.values(ctaCases).some(html => html.includes('onclick='));

      host.innerHTML = ctaCases.encryptionOnly + ctaCases.syncOnly + ctaCases.backupOnly + ctaCases.multipleMissing;
      host.querySelector<HTMLElement>('[data-dashboard-ai-action="enable-encryption"]')?.click();
      host.querySelector<HTMLElement>('[data-dashboard-ai-action="setup-sync"]')?.click();
      host.querySelector<HTMLElement>('[data-dashboard-ai-action="setup-backup"]')?.click();
      host.querySelector<HTMLElement>('[data-dashboard-ai-action="open-data-protection-picker"]')?.click();
      await dashboardAi.loadDashboardAIModule();
      for (let attempt = 0; attempt < 200 && !document.querySelector('#data-protection-picker-overlay.show'); attempt++) await new Promise(resolve => savedGlobals.setTimeout.call(window, resolve, 10));
      outcomes.dashboardAiDelegatedCtasRouteClicks =
        calls.includes('encryption')
        && calls.includes('sync')
        && calls.includes('backup')
        && !!document.querySelector<HTMLElement>('#data-protection-picker-overlay.show');
      document.querySelector<HTMLElement>('#data-protection-picker-overlay')?.remove();

      const clickPickerCard = async (openPicker: () => unknown, selector: string) => {
        await openPicker();
        await Promise.resolve();
        const overlay = document.querySelector<HTMLElement>('.confirm-overlay.show');
        overlay?.querySelector<HTMLElement>(selector)?.click();
        await Promise.resolve();
        return overlay && !overlay.classList.contains('show');
      };

      outcomes.dataProtectionPickerRoutesAllUnconfiguredActions =
        await clickPickerCard(dashboardAi.openDataProtectionPicker, '[data-pick="encryption"]')
        && await clickPickerCard(dashboardAi.openDataProtectionPicker, '[data-pick="sync"]')
        && await clickPickerCard(dashboardAi.openDataProtectionPicker, '[data-pick="backup"]')
        && calls.includes('encryption')
        && calls.includes('sync')
        && calls.includes('backup');

      const lensPickerClosed = await clickPickerCard(dashboardAi.openPersonalizeAIPicker, '[data-pick="lens"]');
      const kbPickerClosed = await clickPickerCard(dashboardAi.openPersonalizeAIPicker, '[data-pick="kb"]');
      await lens.loadLensKnowledgeBaseUi();
      await Promise.resolve();
      outcomes.personalizePickerRoutesLensAndKnowledgeBase =
        lensPickerClosed
        && kbPickerClosed
        && calls.includes('lens')
        && document.querySelector<HTMLElement>('#kb-modal-overlay.show') !== null;
      lens.closeKnowledgeBaseModal();
      outcomes.pickersScheduleFocusTimers = timers.some(delay => delay === 50);

      await dashboardAi.openContextModal();
      for (let attempt = 0; attempt < 200 && document.querySelector('[data-context-hub-view]')?.getAttribute('data-context-save-state') !== 'idle'; attempt++) await new Promise(resolve => savedGlobals.setTimeout.call(window, resolve, 10));
      const contextToggle = /** @type {HTMLInputElement | null} */ (
        document.querySelector<HTMLElement>('#context-hub-overlay [data-context-toggle]')
      );
      if (contextToggle) {
        (contextToggle as HTMLInputElement).checked = !(contextToggle as HTMLInputElement).checked;
        contextToggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
      for (let attempt = 0; attempt < 200 && document.querySelector('[data-context-hub-view]')?.getAttribute('data-context-save-state') !== 'idle'; attempt++) await new Promise(resolve => savedGlobals.setTimeout.call(window, resolve, 10));
      outcomes.contextToggleUsesConfiguredModuleCallback = calls.includes('context-status')
        && !('updateChatContextStatus' in window);
      document.querySelector<HTMLElement>('#context-hub-overlay')?.remove();
      dashboardAiRuntime.configureDashboardAIContextStatus(null);
      dashboardAiRuntime.notifyDashboardAIContextStatusChanged();
      outcomes.contextStatusRuntimeFallsBackToSafeNoop = true;
      outcomes.unconfiguredApiDialogFallsBackSafely =
        apiRuntime.showOpenRouterInsufficientBalanceDialogRuntime() === false;
      outcomes.unknownAiActionHasNoHandler =
        aiActionDelegates.getRegisteredAIActionHandler('coverage-unknown') === null;
      outcomes.emptyVeniceSessionClearsSafely = apiVenice.clearVeniceE2EESession() === false;
      const seedOwner = await import('/js/wallet-seed-component.js');
      const seedHost = document.createElement('div'); document.body.append(seedHost);
      const seedView = seedOwner.mountWalletSeed(seedHost, { copy: () => {}, create: () => {}, restore: () => {}, continue: () => {} });
      seedView.setMnemonic('alpha <coverage>'); seedView.setState({ mode: 'manage', pending: false, status: { text: '', tone: 'secondary' } });
      seedHost.querySelector<HTMLButtonElement>('#wallet-seed-display')!.click();
      outcomes.walletSeedManagementEscapesSharedImportButtonMarkup = seedHost.innerHTML.includes('alpha &lt;coverage&gt;')
        && seedHost.textContent!.includes('alpha <coverage>') && !seedHost.querySelector('coverage') && !seedHost.querySelector('[data-clipboard-text]');
      seedOwner.disposeWalletSeed(); seedHost.remove();

      dashboardAi.triggerDNAFilePicker();
      const input = document.getElementById('dna-dashboard-input');
      const transfer = new DataTransfer();
      let dnaInputResetCount = 0;
      transfer.items.add(new File(['rsid,genotype'], 'genome.csv', { type: 'text/csv' }));
      if (input) {
        Object.defineProperty(input, 'files', { configurable: true, value: transfer.files });
        const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        if (valueDescriptor?.get && valueDescriptor?.set) {
          Object.defineProperty(input, 'value', {
            configurable: true,
            get() {
              return (valueDescriptor.get)!.call(this);
            },
            set(value: unknown) {
              if (value === '') dnaInputResetCount += 1;
              (valueDescriptor.set)!.call(this, value);
            },
          });
        }
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      outcomes.triggerDNAFilePickerCreatesInputClicksAndDispatchesFile = clickedInputId === 'dna-dashboard-input'
        && (input as HTMLInputElement|null)?.accept === '.txt,.csv'
        && (handledDnaFile as {name:string;textType:string}|null)?.name === 'genome.csv'
        && (handledDnaFile as {name:string;textType:string}|null)?.textType === 'text/csv'
        && dnaInputResetCount === 1;
    } finally {
      host.remove();
      document.querySelectorAll<HTMLElement>('#data-protection-picker-overlay,#ai-personalize-picker-overlay,#dna-dashboard-input')
        .forEach(el => el.remove());
      dashboardAi.configureDashboardAISyncSetup();
      dashboardAiRuntime.configureDashboardAIContextStatus(previousContextStatusHandler);
      dashboardAi.configureDashboardAIDataProtectionDeps(previousDataProtectionDeps);
      apiRuntime.configureApiRuntimeCallbacks(previousApiRuntime);
      contextCardsRuntime.configureContextCardsRuntimeCallbacks(previousContextCardsRuntime);
      dnaBridge.configureDnaModuleBridge({ handleDNAFile: null, ...previousDnaBridge });
      HTMLInputElement.prototype.click = originalInputClick;
      for (const [name, original] of Object.entries(savedGlobals)) {
        if (name === 'showDirectoryPicker' && !hadShowDirectoryPicker) delete (window as unknown as Record<string, unknown>)[name];
        else if (hadGlobals[name]) (window as unknown as Record<string, unknown>)[name] = original;
        else delete (window as unknown as Record<string, unknown>)[name];
      }
      if (hadImportedData) (state as {importedData:unknown}).importedData = savedImportedData;
      else delete (state as {importedData?: unknown}).importedData;
      restoreStorage(localStorage, savedLocal);
    }

    return outcomes;
  }, {
    dashboardUrl: moduleUrl('/js/context-card-dashboard-ai.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
