import { expect, test } from './coverage-fixture.js';

const SHOW_CLASS_TOKEN = /(^|\s)show(\s|$)/;

async function preparePage(page) {
  await page.addInitScript(() => {
    const profileId = localStorage.getItem('labcharts-active-profile') || 'default';
    localStorage.setItem(`labcharts-${profileId}-emptyTour`, 'completed');
    localStorage.setItem(`labcharts-${profileId}-tour`, 'completed');
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.openSettingsModal === 'function');
  await page.evaluate(() => {
    window.endTour?.();
    document.getElementById('tour-overlay')?.remove();
    document.getElementById('tour-spotlight')?.remove();
    document.getElementById('tour-tooltip')?.remove();
    document.getElementById('sync-setup-overlay')?.remove();
  });
}

test('settings browser coverage exercises delegates for themes tweaks privacy usage and sun source', async ({ page }) => {
  await preparePage(page);

  const results = await page.evaluate(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate, label) => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (predicate()) return true;
        await wait(25);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const jsonResponse = body => new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    const state = window._labState;
    const profileId = 'settings-browser-coverage-profile';
    const usageKey = `labcharts-${profileId}-usage`;
    const saved = {
      currentProfile: state.currentProfile,
      profiles: state.profiles,
      fetch: window.fetch,
      initSettingsOllamaCheck: window.initSettingsOllamaCheck,
      initSettingsModelFetch: window.initSettingsModelFetch,
      refreshChartThemeColors: window.refreshChartThemeColors,
      getMeteoConfig: window.getMeteoConfig,
      saveMeteoConfig: window.saveMeteoConfig,
      theme: localStorage.getItem('labcharts-theme'),
      accent: localStorage.getItem('labcharts-accent'),
      timeFormat: localStorage.getItem('labcharts-time-format'),
      sunset: localStorage.getItem('labcharts-sunset-mode'),
      crt: localStorage.getItem('labcharts-crt-effects'),
      piiEnabled: localStorage.getItem('labcharts-ollama-pii-enabled'),
      piiReview: localStorage.getItem('labcharts-pii-review'),
      piiAck: localStorage.getItem('labcharts-pii-review-disable-ack'),
      usage: localStorage.getItem(usageKey),
      globalUsage: localStorage.getItem('labcharts-global-usage'),
    };
    const results = {};
    let meteoConfig = {
      mode: 'auto',
      selfhostUrl: '',
      selfhostBearer: '',
      privacyRounding: 0.1,
    };
    const savedMeteoConfigs = [];

    try {
      window.fetch = async url => {
        const href = typeof url === 'string' ? url : url?.url || '';
        if (href.includes('/v1/models')) return jsonResponse({ data: [{ id: 'pii-coverage-model' }] });
        if (href.endsWith('/api/commit')) return jsonResponse({ sha: 'abcdef1234567890', ref: 'main' });
        return jsonResponse({});
      };
      window.initSettingsOllamaCheck = () => {};
      window.initSettingsModelFetch = () => {};
      window.refreshChartThemeColors = () => {};

      localStorage.removeItem('labcharts-accent');
      localStorage.removeItem('labcharts-sunset-mode');
      localStorage.removeItem('labcharts-crt-effects');
      localStorage.setItem('labcharts-theme', 'dark');
      localStorage.setItem('labcharts-time-format', '24h');
      window.openSettingsModal('display');
      const modal = document.getElementById('settings-modal');
      modal.insertAdjacentHTML('beforeend', '<button type="button" class="settings-theme-btn" data-theme-id="glass" data-settings-action="select-theme">Glass</button>');
      const themeBtn = modal.querySelector('[data-settings-action="select-theme"]');
      themeBtn.click();
      results.scheduleThemeChangeMarksControl = themeBtn.classList.contains('active');
      await waitFor(() => localStorage.getItem('labcharts-theme') === 'glass', 'theme commit');
      results.scheduleThemeChangeCommits = document.documentElement.dataset.theme === 'glass';
      const timeBtn = modal.querySelector('[data-settings-action="set-time-format"][data-timefmt="12h"]');
      if (!timeBtn) throw new Error('time-format 12h button not found in display panel');
      timeBtn.click();
      results.setTimeFormatFromDisplaySettings = localStorage.getItem('labcharts-time-format') === '12h'
        && timeBtn.classList.contains('active')
        && window.formatTime('14:05') === '2:05 PM';

      window.openTweaksPanel();
      const sunsetToggle = document.getElementById('tweaks-sunset-mode');
      sunsetToggle.checked = true;
      sunsetToggle.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(0);
      results.handleTweaksChange = localStorage.getItem('labcharts-sunset-mode') === 'true'
        && document.documentElement.dataset.sunsetMode === 'on';

      localStorage.removeItem('labcharts-pii-review-disable-ack');
      localStorage.setItem('labcharts-pii-review', 'true');
      localStorage.setItem('labcharts-ollama-pii-enabled', 'false');
      window.openSettingsModal('privacy');
      document.querySelector('[data-settings-action="toggle-privacy-configure"]').click();
      const privacyBody = document.getElementById('privacy-configure-body');
      results.togglePrivacyConfigure = privacyBody.style.display === 'block';

      const piiToggle = document.getElementById('pii-local-toggle');
      piiToggle.checked = true;
      piiToggle.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(() => localStorage.getItem('labcharts-ollama-pii-enabled') === 'true', 'PII local toggle');
      results.toggleOllamaPII = privacyBody.style.display === 'block'
        && document.getElementById('privacy-status-title').textContent.length > 0;

      const reviewToggle = document.getElementById('pii-review-toggle');
      reviewToggle.checked = false;
      reviewToggle.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(() => document.getElementById('confirm-ok'), 'disable review confirm');
      const restoredWhileConfirmOpen = reviewToggle.checked === true;
      document.getElementById('confirm-ok').click();
      await waitFor(() => localStorage.getItem('labcharts-pii-review') === 'false', 'review disable commit');
      results.confirmDisablePIIReview = restoredWhileConfirmOpen
        && reviewToggle.checked === false
        && localStorage.getItem('labcharts-pii-review-disable-ack') === '1';

      state.currentProfile = profileId;
      state.profiles = [{ id: profileId, name: 'Coverage profile' }];
      localStorage.setItem(usageKey, JSON.stringify({
        totalCost: 0.012,
        totalInputTokens: 1500,
        totalOutputTokens: 700,
        requestCount: 2,
      }));
      localStorage.setItem('labcharts-global-usage', JSON.stringify({
        totalCost: 0.034,
        totalInputTokens: 5000,
        totalOutputTokens: 1200,
        requestCount: 4,
      }));
      window.openSettingsModal('ai');
      document.querySelector('#ai-usage-section [data-settings-action="reset-profile-usage"]').click();
      await wait(0);
      results.resetCurrentProfileUsage = localStorage.getItem(usageKey) === null
        && document.getElementById('ai-usage-section').textContent.includes('0 requests');

      window.getMeteoConfig = () => ({ ...meteoConfig });
      window.saveMeteoConfig = cfg => {
        meteoConfig = { ...cfg };
        savedMeteoConfigs.push({ ...cfg });
      };
      document.body.insertAdjacentHTML('beforeend', `<section id="sun-source-fixture">${window.renderSunDataSourceSettings()}</section>`);
      const sunSection = document.getElementById('sun-data-source-section');
      const selfhostRadio = sunSection.querySelector('input[value="selfhost"]');
      selfhostRadio.checked = true;
      selfhostRadio.dispatchEvent(new Event('change', { bubbles: true }));
      results.setMeteoMode = meteoConfig.mode === 'selfhost'
        && document.getElementById('meteo-selfhost-fields').style.display === '';

      document.getElementById('meteo-selfhost-url').value = ' https://meteo.example.test ';
      document.getElementById('meteo-selfhost-url').dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('meteo-selfhost-bearer').value = ' token-123 ';
      document.getElementById('meteo-selfhost-bearer').dispatchEvent(new Event('change', { bubbles: true }));
      results.saveMeteoSelfhost = meteoConfig.selfhostUrl === 'https://meteo.example.test'
        && meteoConfig.selfhostBearer === 'token-123';

      const roundingToggle = document.getElementById('meteo-privacy-rounding');
      roundingToggle.checked = false;
      roundingToggle.dispatchEvent(new Event('change', { bubbles: true }));
      results.toggleMeteoRounding = meteoConfig.privacyRounding === 0
        && savedMeteoConfigs.some(cfg => cfg.privacyRounding === 0);

      return results;
    } finally {
      window.fetch = saved.fetch;
      window.initSettingsOllamaCheck = saved.initSettingsOllamaCheck;
      window.initSettingsModelFetch = saved.initSettingsModelFetch;
      window.refreshChartThemeColors = saved.refreshChartThemeColors;
      window.getMeteoConfig = saved.getMeteoConfig;
      window.saveMeteoConfig = saved.saveMeteoConfig;
      state.currentProfile = saved.currentProfile;
      state.profiles = saved.profiles;
      const restoreStorage = (key, value) => {
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      };
      restoreStorage('labcharts-theme', saved.theme);
      restoreStorage('labcharts-accent', saved.accent);
      restoreStorage('labcharts-time-format', saved.timeFormat);
      restoreStorage('labcharts-sunset-mode', saved.sunset);
      restoreStorage('labcharts-crt-effects', saved.crt);
      restoreStorage('labcharts-ollama-pii-enabled', saved.piiEnabled);
      restoreStorage('labcharts-pii-review', saved.piiReview);
      restoreStorage('labcharts-pii-review-disable-ack', saved.piiAck);
      restoreStorage(usageKey, saved.usage);
      restoreStorage('labcharts-global-usage', saved.globalUsage);
      window.closeTweaksPanel?.();
      document.getElementById('sun-source-fixture')?.remove();
      document.getElementById('confirm-dialog-overlay')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      if (saved.theme) window.setTheme?.(saved.theme);
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }

  await expect(page.locator('#settings-modal-overlay')).toHaveClass(SHOW_CLASS_TOKEN);
});

test('settings browser coverage renames imported entry dates through the data section wrapper', async ({ page }) => {
  await preparePage(page);

  const results = await page.evaluate(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate, label) => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (predicate()) return true;
        await wait(25);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };

    const state = window._labState;
    const profileId = 'settings-rename-coverage-profile';
    const saved = {
      importedData: JSON.parse(JSON.stringify(state.importedData || {})),
      currentProfile: state.currentProfile,
      currentView: state.currentView,
      buildSidebar: window.buildSidebar,
      updateHeaderDates: window.updateHeaderDates,
      navigate: window.navigate,
      invalidateLabContextCache: window.invalidateLabContextCache,
      storage: localStorage.getItem(`labcharts-${profileId}-imported`),
    };
    const calls = [];

    try {
      state.currentProfile = profileId;
      state.currentView = 'dashboard';
      state.importedData = {
        entries: [{
          date: '2026-02-01',
          markers: { 'biochemistry.glucose': 5.1 },
          sourceFile: 'coverage.pdf',
        }],
        manualValues: {
          'biochemistry.glucose:2026-02-01': { value: 5.1 },
        },
        changeHistory: [],
      };
      window.buildSidebar = () => calls.push('buildSidebar');
      window.updateHeaderDates = () => calls.push('updateHeaderDates');
      window.navigate = view => calls.push(`navigate:${view}`);
      window.invalidateLabContextCache = () => calls.push('invalidateLabContextCache');

      document.body.insertAdjacentHTML('beforeend', '<section id="data-entries-section"></section>');
      window.refreshDataEntriesSection();

      const renamePromise = window.renameImportedEntryDateFromSettings('2026-02-01');
      await waitFor(() => document.getElementById('prompt-dialog-input'), 'rename prompt');
      const input = document.getElementById('prompt-dialog-input');
      input.value = '2026-02-03';
      document.getElementById('prompt-ok').click();
      await renamePromise;

      return {
        entryRenamed: state.importedData.entries[0].date === '2026-02-03',
        manualValuesMoved: !!state.importedData.manualValues['biochemistry.glucose:2026-02-03']
          && !state.importedData.manualValues['biochemistry.glucose:2026-02-01'],
        sectionRefreshed: document.getElementById('data-entries-section').textContent.includes('Feb 3, 2026'),
        viewsRefreshed: calls.includes('buildSidebar')
          && calls.includes('updateHeaderDates')
          && calls.includes('navigate:dashboard')
          && calls.includes('invalidateLabContextCache'),
      };
    } finally {
      state.importedData = saved.importedData;
      state.currentProfile = saved.currentProfile;
      state.currentView = saved.currentView;
      window.buildSidebar = saved.buildSidebar;
      window.updateHeaderDates = saved.updateHeaderDates;
      window.navigate = saved.navigate;
      window.invalidateLabContextCache = saved.invalidateLabContextCache;
      if (saved.storage == null) localStorage.removeItem(`labcharts-${profileId}-imported`);
      else localStorage.setItem(`labcharts-${profileId}-imported`, saved.storage);
      document.getElementById('data-entries-section')?.remove();
      document.getElementById('prompt-dialog-overlay')?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
    }
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
