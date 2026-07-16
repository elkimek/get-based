import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?providerModelControlsEdgeCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('provider model controls edge coverage handles pricing updates guards and manual validation', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ controlsUrl }) => {
    const controls = await import(controlsUrl);
    const chatRuntime = await import('/js/chat-runtime.js');
    const failures = [];
    const check = (name, condition, detail = '') => {
      if (!condition) failures.push(detail ? `${name}: ${detail}` : name);
    };
    const storageKeys = [
      'labcharts-venice-model',
      'labcharts-venice-models',
      'labcharts-venice-pricing',
      'labcharts-venice-e2ee',
      'labcharts-venice-e2ee-models',
      'labcharts-venice-model-regular',
      'labcharts-venice-model-e2ee',
      'labcharts-openrouter-model',
      'labcharts-routstr-model',
      'labcharts-routstr-pricing',
      'labcharts-ppq-model',
      'labcharts-ppq-pricing',
      'labcharts-custom-model',
    ];
    const oldStorage = {};
    for (const key of storageKeys) oldStorage[key] = localStorage.getItem(key);
    const oldGlobals = {
      clearE2EESession: window.clearE2EESession,
    };
    let clearCount = 0;
    let headerRefreshes = 0;
    let webSearchRefreshes = 0;
    let previousChatRuntime = null;

    try {
      for (const key of storageKeys) localStorage.removeItem(key);
      window.clearE2EESession = () => { clearCount += 1; };
      previousChatRuntime = chatRuntime.configureChatRuntimeCallbacks({
        updateChatHeaderModel: () => { headerRefreshes += 1; },
        refreshWebSearchToggle: () => { webSearchRefreshes += 1; },
      });

      document.body.insertAdjacentHTML('beforeend', `
        <section id="provider-controls-edge-fixture">
          <div id="venice-model-area"></div>
          <div id="venice-e2ee-indicator" style="display:none"></div>
          <div id="openrouter-model-area"></div>
          <div id="routstr-model-area"></div>
          <div id="ppq-model-area"></div>
          <div id="custom-model-area"></div>
        </section>
      `);

      localStorage.setItem('labcharts-venice-pricing', JSON.stringify({
        'venice-a': { input: 2, output: 8 },
        'venice-b': { input: 4, output: 12 },
      }));
      localStorage.setItem('labcharts-venice-model', 'venice-a');
      localStorage.setItem('labcharts-venice-e2ee', 'off');
      controls.updateVeniceModelPricing('missing-before-render');
      controls.renderVeniceModelDropdown([
        { id: 'venice-a', name: 'Venice A' },
        { id: 'venice-b', name: 'Venice B' },
      ]);
      const veniceRenderedInitial = document.getElementById('venice-model-select')?.value === 'venice-a'
        && (document.getElementById('venice-model-pricing')?.textContent || '').includes('$2.00/M in');
      controls.onVeniceModelDropdownChange('venice-b');
      const veniceDropdownChangeUpdatesRegularModel = localStorage.getItem('labcharts-venice-model') === 'venice-b'
        && localStorage.getItem('labcharts-venice-model-regular') === 'venice-b'
        && (document.getElementById('venice-model-pricing')?.textContent || '').includes('$4.00/M in')
        && clearCount === 1;
      controls.onVeniceModelDropdownChange('venice-b');
      const veniceSameModelDoesNotClearAgain = clearCount === 1;

      localStorage.setItem('labcharts-venice-e2ee', 'on');
      controls.onVeniceModelDropdownChange('e2ee-b');
      const veniceDropdownChangeUsesE2EEKey = localStorage.getItem('labcharts-venice-model-e2ee') === 'e2ee-b'
        && clearCount === 2;

      localStorage.setItem('labcharts-venice-model', 'e2ee-old');
      localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([
        { id: 'e2ee-b', name: 'Secure B' },
      ]));
      controls.toggleVeniceE2EE(true);
      const veniceToggleRendersRestoredE2EEList = document.getElementById('venice-model-select')?.value === 'e2ee-b'
        && document.getElementById('venice-e2ee-indicator')?.style.display === ''
        && headerRefreshes >= 1
        && webSearchRefreshes >= 1;

      localStorage.setItem('labcharts-venice-e2ee-models', '{not json');
      controls.toggleVeniceE2EE(true);
      const veniceToggleHandlesBadModelCache = document.getElementById('venice-e2ee-indicator')?.style.display === '';

      controls.renderOpenRouterModelDropdown([]);
      controls.renderRoutstrModelDropdown([]);
      controls.renderPpqModelDropdown([]);
      controls.updateRoutstrModelPricing();
      controls.updatePpqModelPricing('missing-before-render');
      controls.updateCustomModelPricing();
      const emptyGuardsDoNotRenderControls = !document.getElementById('openrouter-model-select')
        && !document.getElementById('routstr-model-select')
        && !document.getElementById('ppq-model-select');

      localStorage.setItem('labcharts-routstr-pricing', JSON.stringify({
        'routstr-b': { input: 0.75, output: 2.25 },
      }));
      localStorage.setItem('labcharts-routstr-model', 'routstr-b');
      controls.renderRoutstrModelDropdown([
        { id: 'routstr-a', name: 'Routstr A' },
        { id: 'routstr-b', name: 'Routstr B' },
      ]);
      controls.updateRoutstrModelPricing('routstr-b');
      const routstrPricingUpdatesRenderedHint = document.getElementById('routstr-model-select')?.value === 'routstr-b'
        && (document.getElementById('routstr-model-pricing')?.textContent || '').includes('$0.75/M in');

      localStorage.setItem('labcharts-ppq-pricing', JSON.stringify({
        'ppq-edge': { input: 1.25, output: 2.5 },
      }));
      controls.renderPpqModelDropdown([{ id: 'ppq-edge', name: 'PPQ Edge' }]);
      controls.updatePpqModelPricing('ppq-edge');
      const ppqPricingUpdatesRenderedHint = (document.getElementById('ppq-model-pricing')?.textContent || '').includes('$1.25/M in');

      localStorage.setItem('labcharts-custom-model', 'known-model');
      controls.renderCustomApiModelDropdown([
        { id: 'known-model', name: 'Known Model' },
        { id: 'second-model', name: 'Second Model' },
      ]);
      const customKnownModelUsesDropdown = document.getElementById('custom-model-select')?.value === 'known-model'
        && document.getElementById('custom-manual-model')?.value === '';
      const customInput = document.getElementById('custom-manual-model');
      customInput.value = '   ';
      controls.applyCustomApiManualModel();
      const customManualEmptyIsRejected = localStorage.getItem('labcharts-custom-model') === 'known-model';

      customInput.value = 'typed-edge-model';
      controls.applyCustomApiManualModel();
      const customManualTypedAppliesAndPrices = localStorage.getItem('labcharts-custom-model') === 'typed-edge-model'
        && (document.getElementById('custom-model-pricing')?.textContent || '') === '';

      return {
        veniceRenderedInitial,
        veniceDropdownChangeUpdatesRegularModel,
        veniceSameModelDoesNotClearAgain,
        veniceDropdownChangeUsesE2EEKey,
        veniceToggleRendersRestoredE2EEList,
        veniceToggleHandlesBadModelCache,
        emptyGuardsDoNotRenderControls,
        routstrPricingUpdatesRenderedHint,
        ppqPricingUpdatesRenderedHint,
        customKnownModelUsesDropdown,
        customManualEmptyIsRejected,
        customManualTypedAppliesAndPrices,
      };
    } finally {
      window.clearE2EESession = oldGlobals.clearE2EESession;
      if (previousChatRuntime) chatRuntime.configureChatRuntimeCallbacks(previousChatRuntime);
      for (const key of storageKeys) {
        if (oldStorage[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, oldStorage[key]);
      }
      document.getElementById('provider-controls-edge-fixture')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
    }
  }, { controlsUrl: moduleUrl('/js/provider-model-controls.js') });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
