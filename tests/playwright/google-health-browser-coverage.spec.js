import { expect, test } from './coverage-fixture.js';

test('Google Health stays optional/direct-first and uses the browser credential vault', async ({ page }) => {
  await page.route('**/google-health-browser-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body></body></html>',
  }));
  await page.route('**/api/proxy', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ overrides: {}, configured: { google_health: false } }),
  }));
  await page.goto('/google-health-browser-coverage', { waitUntil: 'load' });

  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const {
      applyOAuthConfigured,
      applyOAuthOverrides,
      visibleAdapters,
    } = await import('/js/wearable-adapters.js');
    const {
      GOOGLE_HEALTH_CONNECT_DISCLOSURE,
      renderWearablesSettingsSection,
      wearableSettingsActionHandlers,
    } = await import('/js/wearables-settings-panel.js');
    const settingsRuntime = await import('/js/wearables-settings-runtime.js');
    const {
      saveWearableCredentials,
      loadWearableCredentials,
      deleteWearableCredentials,
    } = await import('/js/wearables-credential-vault.js');
    const {
      deleteWearablesDB,
      getDailyRange,
      getDailyRangeRaw,
      getMeta,
      upsertDailyBatch,
    } = await import('/js/wearables-store.js');
    const { computeWearableSummary } = await import('/js/wearables-summary.js');

    const profileId = `google-health-browser-${Date.now()}-${crypto.randomUUID()}`;
    localStorage.setItem('labcharts-active-profile', profileId);
    state.currentProfile = profileId;
    state.importedData = {
      entries: [],
      wearableConnections: {},
      wearableSummary: null,
    };

    const consentMessages = [];
    const previousSettingsRuntime = settingsRuntime.configureWearableSettingsRuntimeDeps({
      showConfirmDialog: async message => {
        consentMessages.push(message);
        return false;
      },
    });
    await wearableSettingsActionHandlers.handleWearableConnect('google_health');
    const unconfiguredSkippedDisclosure = consentMessages.length === 0;

    const visible = visibleAdapters([]).map(adapter => adapter.id);
    const legacyVisible = visibleAdapters(['fitbit']).map(adapter => adapter.id);
    const html = renderWearablesSettingsSection();
    state.importedData.wearableConnections.fitbit = {
      accessToken: 'legacy-fitbit-token',
      connectedAt: '2026-07-01T00:00:00.000Z',
      lastSyncAt: 1,
      account: { email: 'legacy-fitbit@example.test' },
    };
    const migrationHtml = renderWearablesSettingsSection();
    delete state.importedData.wearableConnections.fitbit;

    applyOAuthOverrides({ google_health: 'self-host-google-client' });
    applyOAuthConfigured({ google_health: true });
    const configuredHtml = renderWearablesSettingsSection();
    await wearableSettingsActionHandlers.handleWearableConnect('google_health');
    settingsRuntime.configureWearableSettingsRuntimeDeps(previousSettingsRuntime);
    const cancelledBeforeOAuth = !sessionStorage.getItem('google_health-oauth-pending');

    await saveWearableCredentials(profileId, 'google_health', {
      accessToken: 'browser-access-secret',
      refreshToken: 'browser-refresh-secret',
    });
    const credentials = await loadWearableCredentials(profileId, 'google_health');
    const record = await getMeta(profileId, 'credential-vault-record:v1:google_health');
    const key = await getMeta(profileId, 'credential-vault-key:v1');
    await upsertDailyBatch(profileId, [{
      source: 'google_health',
      date: '2026-07-31',
      hrv_rmssd: 39,
      steps: 9123,
    }]);
    const rawGoogleRows = await getDailyRangeRaw(profileId, 'google_health', '2026-07-31', '2026-07-31');
    const readableGoogleRows = await getDailyRange(profileId, 'google_health', '2026-07-31', '2026-07-31');

    const rows = {
      google_health: [{ source: 'google_health', date: '2026-07-31', hrv_rmssd: 39 }],
      oura: [{ source: 'oura', date: '2026-07-31', hrv_rmssd: 43 }],
    };
    const connected = {
      google_health: { connectedSince: '2026-07-01', lastSyncAt: 1 },
      oura: { connectedSince: '2026-07-01', lastSyncAt: 1 },
    };
    const primary = computeWearableSummary(rows, connected).metrics.hrv_rmssd.primarySource;

    await deleteWearableCredentials(profileId, 'google_health');
    const afterDelete = await loadWearableCredentials(profileId, 'google_health');
    await deleteWearablesDB(profileId);

    return {
      visible,
      legacyVisible,
      hasGoogleRow: html.includes('data-adapter="google_health"'),
      hasOptionalCopy: html.includes('When enabled by a self-hosted deployment')
        && html.includes('Fitbit and Pixel Watch')
        && html.includes('Independent direct integrations remain available'),
      hasSelfHostCopy: html.includes('self-host only')
        && html.includes('not offered by this hosted deployment')
        && !html.includes('aria-label="Connect Google Health"'),
      unconfiguredSkippedDisclosure,
      consentDisclosureIsComplete: consentMessages.length === 1
        && consentMessages[0] === GOOGLE_HEALTH_CONNECT_DISCLOSURE
        && consentMessages[0].includes('No write access is requested')
        && consentMessages[0].includes('cloud AI or agent')
        && consentMessages[0].includes('Disconnecting deletes'),
      cancelledBeforeOAuth,
      hasLegacyMigrationAction: migrationHtml.includes('migration required')
        && migrationHtml.includes('self-host only')
        && !migrationHtml.includes('Connect Google Health</button>')
        && migrationHtml.includes('September 2026'),
      configuredHasConnect: configuredHtml.includes('aria-label="Connect Google Health"'),
      credentials,
      encryptedRecordHasPlaintext: JSON.stringify(record).includes('browser-access-secret'),
      keyIsNonExtractable: key instanceof CryptoKey && key.extractable === false,
      dailyRowIsDeviceEncrypted: rawGoogleRows.length === 1
        && rawGoogleRows[0]._devicePayload?.version === 1
        && rawGoogleRows[0].hrv_rmssd == null
        && !JSON.stringify(rawGoogleRows[0]).includes('9123'),
      dailyRowDecryptsForUse: readableGoogleRows[0]?.hrv_rmssd === 39
        && readableGoogleRows[0]?.steps === 9123,
      primary,
      afterDelete,
    };
  });

  expect(result.hasGoogleRow).toBe(true);
  expect(result.hasOptionalCopy).toBe(true);
  expect(result.hasSelfHostCopy).toBe(true);
  expect(result.unconfiguredSkippedDisclosure).toBe(true);
  expect(result.consentDisclosureIsComplete).toBe(true);
  expect(result.cancelledBeforeOAuth).toBe(true);
  expect(result.hasLegacyMigrationAction).toBe(true);
  expect(result.configuredHasConnect).toBe(true);
  expect(result.visible.indexOf('google_health')).toBeGreaterThan(result.visible.indexOf('polar'));
  expect(result.visible.indexOf('google_health')).toBeLessThan(result.visible.indexOf('manual'));
  expect(result.visible).not.toContain('fitbit');
  expect(result.legacyVisible).toContain('fitbit');
  expect(result.credentials).toEqual({
    accessToken: 'browser-access-secret',
    credentialGeneration: 0,
    refreshToken: 'browser-refresh-secret',
  });
  expect(result.encryptedRecordHasPlaintext).toBe(false);
  expect(result.keyIsNonExtractable).toBe(true);
  expect(result.dailyRowIsDeviceEncrypted).toBe(true);
  expect(result.dailyRowDecryptsForUse).toBe(true);
  expect(result.primary).toBe('oura');
  expect(result.afterDelete).toBeNull();
});

test('Google Health OAuth callback keeps reusable tokens out of profile data', async ({ page }) => {
  await page.route('**/google-health-callback-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body></body></html>',
  }));
  await page.goto('/google-health-callback-coverage', { waitUntil: 'load' });

  const result = await page.evaluate(async () => {
    const profileId = `google-health-callback-${Date.now()}-${crypto.randomUUID()}`;
    const accessToken = 'google-access-secret-must-not-sync';
    const refreshToken = 'google-refresh-secret-must-not-sync';
    localStorage.setItem('labcharts-active-profile', profileId);

    const { state } = await import('/js/state.js');
    state.currentProfile = profileId;
    state.importedData = {
      entries: [],
      wearableConnections: {},
      wearableSummary: null,
    };

    sessionStorage.setItem('google_health-oauth-pending', JSON.stringify({
      state: 'google-callback-state',
      redirectUri: 'http://127.0.0.1:8000/app',
      startedAt: Date.now(),
      clientId: 'google-browser-client',
      profileId,
    }));
    history.replaceState(null, '', `${location.pathname}?code=google-code&state=google-callback-state`);

    const realFetch = window.fetch;
    window.fetch = async (_url, init = {}) => {
      const relay = JSON.parse(String(init.body || '{}'));
      if (relay.google_health_token_exchange) {
        return new Response(JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 3600,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (String(relay.url || '').endsWith('/identity')) {
        return new Response(JSON.stringify({ healthUserId: 'google-health-user' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ dataPoints: [], rollupDataPoints: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const connect = await import('/js/wearables-connect.js');
    const adapters = await import('/js/wearable-adapters.js');
    const { getConfiguredArrayItemId } = await import('/js/data-merge.js');
    const { renderWearablesSettingsSection } = await import('/js/wearables-settings-panel.js');
    const { loadWearableCredentials } = await import('/js/wearables-credential-vault.js');
    const { getDailyRange, getMeta, upsertDailyBatch } = await import('/js/wearables-store.js');
    const handled = await connect.handleOAuthCallbackOnLoad();
    const connection = connect.getConnection('google_health');
    const connectedOnThisDevice = Boolean(connect.listConnectedSources().google_health);
    adapters.applyOAuthOverrides({ google_health: 'google-browser-client' });
    adapters.applyOAuthConfigured({ google_health: true });
    const connectedHtml = renderWearablesSettingsSection();
    const profileJson = JSON.stringify(state.importedData);
    const vaulted = await loadWearableCredentials(profileId, 'google_health');
    await upsertDailyBatch(profileId, [{
      source: 'google_health',
      date: '2026-07-31',
      hrv_rmssd: 44,
    }]);
    state.importedData.wearableSummary = {
      summaryUpdatedAt: new Date().toISOString(),
      sources: { google_health: { coverageDays: 1 } },
      metrics: { hrv_rmssd: { primarySource: 'google_health', latest: 44 } },
    };
    state.importedData.changeHistory = [{
      ts: Date.parse('2026-07-31T12:00:00.000Z'),
      type: 'wearable',
      kind: 'trend-flip',
      source: 'google_health',
      metricId: 'hrv_rmssd',
    }];
    const deletedHistoryId = getConfiguredArrayItemId(
      'changeHistory',
      state.importedData.changeHistory[0],
    );
    localStorage.removeItem(`labcharts-wearable-credential-local:${profileId}:google_health`);
    const connectedWithoutDeviceCredential = Boolean(connect.listConnectedSources().google_health);
    await connect.disconnectWearable('google_health', { deleteData: true });
    const rowsAfterDisconnect = await getDailyRange(profileId, 'google_health', '2026-07-31', '2026-07-31');
    const pendingDisconnect = await getMeta(profileId, 'pending-profile-disconnect:v1:google_health');
    const googleDerivedPurgeState = {
      rowCount: rowsAfterDisconnect.length,
      pendingDisconnect,
      hasWearableSummary: Boolean(state.importedData.wearableSummary),
      changeHistoryCount: state.importedData.changeHistory.length,
      deletedHistoryId,
      changeHistoryTombstones: state.importedData._deleted?.changeHistory || [],
    };
    window.fetch = realFetch;

    return {
      handled,
      connection,
      connectedOnThisDevice,
      usesStandardConnectedActions: connectedHtml.includes('Sync now')
        && connectedHtml.includes('Backfill 90 days')
        && connectedHtml.includes('Disconnect')
        && !connectedHtml.includes('Revoke access everywhere')
        && !connectedHtml.includes('https://myaccount.google.com/connections'),
      connectedWithoutDeviceCredential,
      profileContainsAccessToken: profileJson.includes(accessToken),
      profileContainsRefreshToken: profileJson.includes(refreshToken),
      vaulted,
      googleDerivedPurgeState,
    };
  });

  expect(result.handled).toBe(true);
  expect(result.connectedOnThisDevice).toBe(true);
  expect(result.usesStandardConnectedActions).toBe(true);
  expect(result.connectedWithoutDeviceCredential).toBe(false);
  expect(result.connection).toMatchObject({
    hasStoredCredentials: true,
    dataSourceFamily: 'all-sources',
    account: {
      userId: 'google-health-user',
    },
  });
  expect(result.connection).not.toHaveProperty('accessToken');
  expect(result.connection).not.toHaveProperty('refreshToken');
  expect(result.profileContainsAccessToken).toBe(false);
  expect(result.profileContainsRefreshToken).toBe(false);
  expect(result.googleDerivedPurgeState).toMatchObject({
    rowCount: 0,
    pendingDisconnect: null,
    hasWearableSummary: false,
    changeHistoryCount: 0,
  });
  expect(result.googleDerivedPurgeState.changeHistoryTombstones)
    .toContain(result.googleDerivedPurgeState.deletedHistoryId);
  expect(result.vaulted).toEqual({
    accessToken: 'google-access-secret-must-not-sync',
    credentialGeneration: 0,
    refreshToken: 'google-refresh-secret-must-not-sync',
  });
});
