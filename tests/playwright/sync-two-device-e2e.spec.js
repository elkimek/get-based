// Two-device sync E2E regression harness.
//
// Uses two isolated browser contexts to model device A and device B. The
// relay/Evolu transport is not exercised here; instead, the test drives the
// same post-merge active-profile refresh path that sync-pull.js calls after a
// pull, plus the real merge helper for stale-pull protection.

import { startPageCoverage, stopPageCoverage, test } from './coverage-fixture.js';

const PORT = process.env.PORT || 8000;
const BASE_URL = `http://localhost:${PORT}/app`;
const PROFILE_ID = `sync-e2e-${Date.now().toString(36)}`;
const LAB_DATE = '2026-05-01';
const MARKER_ID = 'hormones_insulin';
const MARKER_KEY = 'hormones.insulin';
const MIRROR_MARKER_KEY = 'diabetes.insulin_d';
const ORIGINAL_MARKER_VALUE = 8;
const EDITED_MARKER_VALUE = 11;
const SUN_SESSION_ID = 'sun-e2e-duration';
const DEVICE_ID = 'device-e2e-panel';
const DEVICE_SESSION_ID = 'devsess-e2e-duration';
const BASE_AT = Date.parse('2026-05-01T08:00:00.000Z');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildImportedData() {
  return {
    entries: [{
      date: LAB_DATE,
      sourceFile: 'baseline-labs.pdf',
      markers: {
        [MARKER_KEY]: ORIGINAL_MARKER_VALUE,
        [MIRROR_MARKER_KEY]: ORIGINAL_MARKER_VALUE,
        'biochemistry.glucose': 5,
        'diabetes.homaIR': 1.78,
      },
      markerSources: {
        [MARKER_KEY]: { file: 'baseline-labs.pdf', at: BASE_AT },
        [MIRROR_MARKER_KEY]: { file: 'baseline-labs.pdf', at: BASE_AT },
        'biochemistry.glucose': { file: 'baseline-labs.pdf', at: BASE_AT },
      },
      updatedAt: BASE_AT,
    }],
    manualValues: {},
    markerValueNotes: {},
    sunSessions: [{
      id: SUN_SESSION_ID,
      startedAt: BASE_AT,
      endedAt: BASE_AT + 20 * 60000,
      durationMin: 20,
      bodyExposure: { preset: 'face_hands', fraction: 0.08, regions: [], sunscreenSPF: null, glassBetween: false, rotatedSides: false },
      eyeExposure: { mode: 'direct', lensTint: 'clear', durationSec: 1200 },
      posture: 'standing',
      surfaceAlbedo: 'grass',
      location: null,
      atmosphere: { uvIndex: 5, source: 'manual' },
      doses: { vitamin_d: 400, circadian: 12000, no_cv: 50 },
      safety: { medFraction: 0.2, fitzpatrick: 'III' },
      updatedAt: BASE_AT,
    }],
    lightDevices: [{
      id: DEVICE_ID,
      brand: 'E2E',
      model: 'Panel',
      type: 'red-light',
      peakWavelengths: [660, 850],
      mwPerCm2At15cm: 40,
      recommendedDistanceCm: 15,
      addedAt: BASE_AT,
      updatedAt: BASE_AT,
    }],
    deviceSessions: [{
      id: DEVICE_SESSION_ID,
      deviceId: DEVICE_ID,
      startedAt: BASE_AT,
      endedAt: BASE_AT + 12 * 60000,
      durationMin: 12,
      distanceCm: 15,
      bodyArea: 'torso',
      bodyAreas: null,
      eyesProtected: true,
      doses: { pbm_red: 10, pbm_nir: 8 },
      notes: '',
      updatedAt: BASE_AT,
    }],
    lightEnvironment: { rooms: [], screens: [] },
    lightMeasurements: [],
    wearableSummary: null,
    changeHistory: [],
  };
}

async function makeContext(browser) {
  return browser.newContext({ serviceWorkers: 'block' });
}

async function makePage(browser, label, importedData, recordPageError, testInfo) {
  const context = await makeContext(browser);
  const page = await context.newPage();
  try {
    page.setDefaultTimeout(15000);
    page.on('pageerror', err => {
      recordPageError(label, err);
    });
    await startPageCoverage(page);
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.evaluate(async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) await reg.unregister();
      } catch (_) {}
    });
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForFunction(
      async () => {
        const { state } = await import('/js/state.js');
        return !!state
          && typeof (await import('/js/sun-session-ui.js')).openSunSessionDetail === 'function'
          && typeof (await import('/js/light-devices.js')).openDeviceSessionDetail === 'function';
      },
      null,
      { timeout: 15000 }
    );
    const helperBust = `syncE2E=${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await page.addScriptTag({
      type: 'module',
      content: `
        import { mergePulledImportedData, persistPulledImportedData } from '/js/sync-pull-merge.js?${helperBust}';
        import { refreshActiveProfileAfterPull } from '/js/sync-pull-active-refresh.js?${helperBust}';
        import * as syncMessenger from '/js/sync-messenger.js';
        import { applyAISettings } from '/js/sync-apply.js';
        import { applyChatData } from '/js/sync-chat-apply.js';
        import { collectChatData } from '/js/sync-payload-collectors.js';
        import * as personaStorage from '/js/chat-personality-storage.js';
        import * as cryptoStore from '/js/crypto.js';
        import { getRoutstrKey } from '/js/api-provider-storage.js';
        window.__syncE2EMergePulledImportedData = mergePulledImportedData;
        window.__syncE2EPersistPulledImportedData = persistPulledImportedData;
        window.__syncE2ERefreshActiveProfileAfterPull = refreshActiveProfileAfterPull;
        window.__syncE2EMessenger = syncMessenger;
        window.__syncE2EApplyAISettings = applyAISettings;
        window.__syncE2EApplyChatData = applyChatData;
        window.__syncE2ECollectChatData = collectChatData;
        window.__syncE2EPersonaStorage = personaStorage;
        window.__syncE2ECrypto = cryptoStore;
        window.__syncE2EGetRoutstrKey = getRoutstrKey;
      `,
    });
    await page.waitForFunction(
      () => typeof window.__syncE2EMergePulledImportedData === 'function'
        && typeof window.__syncE2EPersistPulledImportedData === 'function'
        && typeof window.__syncE2ERefreshActiveProfileAfterPull === 'function'
        && typeof window.__syncE2EMessenger?.disableMessengerTokenLocal === 'function'
        && typeof window.__syncE2EApplyAISettings === 'function'
        && typeof window.__syncE2EApplyChatData === 'function'
        && typeof window.__syncE2ECollectChatData === 'function'
        && typeof window.__syncE2EPersonaStorage?.saveCustomPersonalitiesToStorage === 'function'
        && typeof window.__syncE2ECrypto?._setTestSessionKey === 'function'
        && typeof window.__syncE2EGetRoutstrKey === 'function',
      null,
      { timeout: 15000 }
    );
    await page.evaluate(async ({ profileId, imported }) => {
      const [{ state }, { saveImportedData }] = await Promise.all([
        import('/js/state.js'),
        import('/js/data.js'),
      ]);
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('labcharts-active-profile', profileId);
      state.currentProfile = profileId;
      state.currentView = 'dashboard';
      state.importedData = JSON.parse(JSON.stringify(imported));
      state.markerRegistry = {};
      state._activeDetailMarkerId = null;
      document.querySelectorAll('.modal-overlay').forEach(el => {
        if (el.id) el.classList.remove('show');
        else el.remove();
      });
      await saveImportedData({ immediate: true });
      (await import('/js/views.js')).navigate('dashboard');
    }, { profileId: PROFILE_ID, imported: importedData });
    return { context, page, label };
  } catch (error) {
    await stopPageCoverage(page, testInfo, `device-${label.toLowerCase()}`).catch(() => {});
    await context.close().catch(() => {});
    throw error;
  }
}

async function getImportedData(page) {
  return page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return JSON.parse(JSON.stringify(state.importedData));
  });
}

async function pullRemoteImportedData(page, remoteImportedData) {
  return page.evaluate(async ({ profileId, remote }) => {
    const { state } = await import('/js/state.js');
    const result = await window.__syncE2EMergePulledImportedData(profileId, JSON.parse(JSON.stringify(remote)), {
      debug: () => {},
    });
    await window.__syncE2EPersistPulledImportedData(result.localKey, profileId, result.merged, Date.now());
    window.__syncE2ERefreshActiveProfileAfterPull({
      profileId,
      merged: result.merged,
      chatApplied: false,
      remoteBroughtNewRows: result.remoteBroughtNewRows,
      localDataChanged: result.localDataChanged,
      debug: () => {},
    });
    return {
      needsRebroadcast: result.needsRebroadcast,
      remoteBroughtNewRows: result.remoteBroughtNewRows,
      localDataChanged: result.localDataChanged,
      merged: JSON.parse(JSON.stringify(state.importedData)),
    };
  }, { profileId: PROFILE_ID, remote: remoteImportedData });
}

async function applyMergedImportedData(page, mergedImportedData, remoteBroughtNewRows = true) {
  return page.evaluate(async ({ profileId, merged, remoteBroughtNewRows: broughtRows }) => {
    const { state } = await import('/js/state.js');
    window.__syncE2ERefreshActiveProfileAfterPull({
      profileId,
      merged: JSON.parse(JSON.stringify(merged)),
      chatApplied: false,
      remoteBroughtNewRows: broughtRows,
      debug: () => {},
    });
    return JSON.parse(JSON.stringify(state.importedData));
  }, { profileId: PROFILE_ID, merged: mergedImportedData, remoteBroughtNewRows });
}

async function openMarkerModal(page) {
  await page.evaluate(async ({ markerId }) => {
    const viewsModule = await import('/js/views.js');
    viewsModule.showDetailModal(markerId);
  }, { markerId: MARKER_ID });
  await page.waitForFunction(
    () => document.getElementById('modal-overlay')?.classList?.contains('show')
      && document.getElementById('detail-modal')?.classList?.contains('marker-detail-modal'),
    null,
    { timeout: 5000 }
  );
}

async function editOpenMarkerValue(page, newValue) {
  await page.evaluate(async ({ markerId, date, markerKey, mirrorKey, next }) => {
    const [{ state }, viewsModule] = await Promise.all([
      import('/js/state.js'),
      import('/js/views.js'),
    ]);
    const waitFor = async (fn, timeoutMs = 2500) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (fn()) return;
        await new Promise(r => setTimeout(r, 25));
      }
      throw new Error('Timed out waiting for marker edit');
    };
    const valueEl = Array.from(document.querySelectorAll('#detail-modal .mv-value'))
      .find(el => /\d/.test(el.textContent || ''));
    if (!valueEl) throw new Error('No marker history value element found');
    const current = parseFloat(valueEl.textContent);
    viewsModule.editMarkerValue(markerId, date, current, { target: valueEl });
    const input = valueEl.querySelector('input.ref-edit-input');
    if (!input) throw new Error('Marker edit input did not render');
    input.value = String(next);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await waitFor(() => {
      const entry = state.importedData.entries?.find(e => e.date === date);
      return entry?.markers?.[markerKey] === next
        && entry?.markers?.[mirrorKey] === next
        && !document.querySelector('#detail-modal input.ref-edit-input');
    });
  }, {
    markerId: MARKER_ID,
    date: LAB_DATE,
    markerKey: MARKER_KEY,
    mirrorKey: MIRROR_MARKER_KEY,
    next: newValue,
  });
}

async function clickManualRevertBadge(page) {
  await page.evaluate(async ({ date, markerKey, mirrorKey, originalValue }) => {
    const { state } = await import('/js/state.js');
    const waitFor = async (fn, timeoutMs = 5000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (fn()) return;
        await new Promise(r => setTimeout(r, 25));
      }
      throw new Error('Timed out waiting for manual revert');
    };

    const manualRevertBadge = () => Array.from(document.querySelectorAll('#detail-modal .ref-edited-badge'))
      .find(el => /manual/.test(el.textContent || '') && /\u00d7|x/i.test(el.textContent || ''));
    const modalShowsOriginalValue = () => Array.from(document.querySelectorAll('#detail-modal .marker-history-row .mv-value'))
      .some(el => {
        const text = (el.textContent || '').trim();
        return text.startsWith(String(originalValue)) && !/manual/.test(text);
      });

    const badge = manualRevertBadge();
    if (!badge) throw new Error('Manual revert badge not found');
    badge.click();
    await waitFor(() => {
      const entry = state.importedData.entries?.find(e => e.date === date);
      return entry?.markers?.[markerKey] === originalValue
        && entry?.markers?.[mirrorKey] === originalValue
        && state.importedData.manualValues?.[`${markerKey}:${date}`] === null
        && state.importedData.manualValues?.[`${mirrorKey}:${date}`] === null
        && !manualRevertBadge()
        && modalShowsOriginalValue();
    });
  }, {
    date: LAB_DATE,
    markerKey: MARKER_KEY,
    mirrorKey: MIRROR_MARKER_KEY,
    originalValue: ORIGINAL_MARKER_VALUE,
  });
}

async function markerModalSnapshot(page) {
  return page.evaluate(async ({ date, markerKey, mirrorKey }) => {
    const { state } = await import('/js/state.js');
    const modal = document.getElementById('detail-modal');
    const entry = state.importedData.entries?.find(e => e.date === date);
    return {
      open: !!document.getElementById('modal-overlay')?.classList?.contains('show'),
      modalClass: modal?.className || '',
      text: modal?.textContent || '',
      badges: Array.from(modal?.querySelectorAll('.ref-edited-badge') || []).map(el => el.textContent.trim()),
      marker: entry?.markers?.[markerKey],
      mirror: entry?.markers?.[mirrorKey],
      manualValue: state.importedData.manualValues?.[`${markerKey}:${date}`],
      mirrorManualValue: state.importedData.manualValues?.[`${mirrorKey}:${date}`],
    };
  }, {
    date: LAB_DATE,
    markerKey: MARKER_KEY,
    mirrorKey: MIRROR_MARKER_KEY,
  });
}

async function navigateLight(page) {
  await page.evaluate(async () => (await import('/js/views.js')).navigate('light'));
  await page.waitForFunction(async () => (await import('/js/state.js')).state.currentView === 'light', null, { timeout: 5000 });
}

async function openSunSessionModal(page) {
  await navigateLight(page);
  await page.evaluate(async ({ id }) => {
    const { openSunSessionDetail } = await import('/js/sun-session-ui.js');
    openSunSessionDetail(id);
  }, { id: SUN_SESSION_ID });
  await page.waitForFunction(
    () => document.querySelector('.modal-overlay.show .sun-detail-modal[data-session-kind="sun"]'),
    null,
    { timeout: 5000 }
  );
}

async function openDeviceSessionModal(page) {
  await navigateLight(page);
  await page.evaluate(async ({ id }) => {
    const { openDeviceSessionDetail } = await import('/js/light-devices.js');
    openDeviceSessionDetail(id);
  }, { id: DEVICE_SESSION_ID });
  await page.waitForFunction(
    () => document.querySelector('.modal-overlay.show .sun-detail-modal[data-session-kind="device"]'),
    null,
    { timeout: 5000 }
  );
}

async function updateSunDuration(page, durationMin) {
  await page.evaluate(async ({ id, duration }) => {
    const { updateSession } = await import('/js/sun-sessions-store.js');
    await updateSession(id, { durationMin: duration });
  }, { id: SUN_SESSION_ID, duration: durationMin });
}

async function updateDeviceDuration(page, durationMin) {
  await page.evaluate(async ({ id, duration }) => {
    const { updateDeviceSession } = await import('/js/light-devices-store.js');
    await updateDeviceSession(id, { durationMin: duration });
  }, { id: DEVICE_SESSION_ID, duration: durationMin });
}

async function sessionModalSnapshot(page, kind) {
  return page.evaluate(async ({ kind, sunSessionId, deviceSessionId }) => {
    const { state } = await import('/js/state.js');
    const modal = document.querySelector(`.modal-overlay.show .sun-detail-modal[data-session-kind="${kind}"]`);
    const source = kind === 'sun'
      ? state.importedData.sunSessions?.find(s => s.id === sunSessionId)
      : state.importedData.deviceSessions?.find(s => s.id === deviceSessionId);
    return {
      open: !!modal,
      text: modal?.textContent || '',
      durationMin: source?.durationMin,
      endedAt: source?.endedAt,
    };
  }, {
    kind,
    sunSessionId: SUN_SESSION_ID,
    deviceSessionId: DEVICE_SESSION_ID,
  });
}

async function closeFloatingModals(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.modal-overlay').forEach(el => {
      if (el.id) el.classList.remove('show');
      else el.remove();
    });
  });
}

async function enableAgentAccessForSync(page) {
  return page.evaluate(async () => {
    const [{ state }, { saveImportedData }] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
    ]);
    const token = 'syncagent'.padEnd(64, 'a');
    const contextKey = `gbctx_v1_${'S'.repeat(43)}`;
    const now = Date.now();
    state.importedData.agentAccess = {
      version: 1,
      enabled: true,
      token,
      contextKey,
      credentialCreatedAt: now,
      revokedAt: null,
      updatedAt: now,
    };
    state.importedData.agentAccessWearableSeriesDays = 30;
    localStorage.removeItem('labcharts-messenger-token');
    localStorage.removeItem('labcharts-agent-context-key');
    await saveImportedData({ immediate: true });
    return JSON.parse(JSON.stringify(state.importedData));
  });
}

async function agentAccessSnapshot(page) {
  return page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const messenger = window.__syncE2EMessenger;
    if (!messenger) throw new Error('sync-messenger helper module not loaded');
    return {
      enabled: messenger.isMessengerEnabled(),
      token: messenger.getMessengerToken(),
      contextKey: messenger.getMessengerContextKey(),
      state: JSON.parse(JSON.stringify(state.importedData.agentAccess || null)),
      seriesDays: state.importedData.agentAccessWearableSeriesDays,
      legacyToken: localStorage.getItem('labcharts-messenger-token'),
      legacyContextKey: localStorage.getItem('labcharts-agent-context-key'),
    };
  });
}

async function disableAgentAccessForSync(page) {
  return page.evaluate(async () => {
    const [{ state }, { saveImportedData }] = await Promise.all([
      import('/js/state.js'),
      import('/js/data.js'),
    ]);
    const messenger = window.__syncE2EMessenger;
    if (!messenger) throw new Error('sync-messenger helper module not loaded');
    const previousToken = messenger.disableMessengerTokenLocal();
    await saveImportedData({ immediate: true });
    return {
      previousToken,
      imported: JSON.parse(JSON.stringify(state.importedData)),
    };
  });
}

async function run(browser, testInfo) {
  let pass = 0;
  let fail = 0;
  const failures = [];
  const contexts = [];
  const devices = [];
  function assert(name, condition, detail = '') {
    if (condition) {
      pass++;
      console.log(`  PASS ${name}`);
    } else {
      fail++;
      const msg = `${name}${detail ? ` -- ${detail}` : ''}`;
      failures.push(msg);
      console.error(`  FAIL ${msg}`);
    }
  }
  function recordPageError(label, err) {
    failures.push(`${label} page error: ${err.message}`);
    fail++;
    console.error(`  FAIL ${label} page error -- ${err.message}`);
  }

  try {
    console.log('=== Two-Device Sync E2E Tests ===\n');
    const base = buildImportedData();
    const deviceA = await makePage(browser, 'A', clone(base), recordPageError, testInfo);
    devices.push(deviceA);
    contexts.push(deviceA.context);
    const deviceB = await makePage(browser, 'B', clone(base), recordPageError, testInfo);
    devices.push(deviceB);
    contexts.push(deviceB.context);
    const { page: pageA } = deviceA;
    const { page: pageB } = deviceB;

    const routstrSync = await pageB.evaluate(async () => {
      window.__WEARABLES_TEST = true;
      localStorage.setItem('labcharts-encryption-enabled', 'true');
      await window.__syncE2ECrypto._setTestSessionKey('RoutstrSyncE2EPass1!');
      await window.__syncE2EApplyAISettings({
        'labcharts-routstr-key': 'sk-local-zero-balance',
        'labcharts-routstr-node': 'https://node.routstr.e2e/',
        'labcharts-routstr-session-updated-at': '100',
      });
      sessionStorage.setItem('labcharts-ai-settings-local-lock-until', String(Date.now() + 60_000));
      await window.__syncE2EApplyAISettings({
        'labcharts-routstr-key': 'sk-routstr-two-device',
        'labcharts-routstr-node': 'https://node.routstr.e2e/',
        'labcharts-routstr-session-updated-at': '200',
      });
      await window.__syncE2EApplyAISettings({
        'labcharts-routstr-key': 'sk-legacy-other-profile',
        'labcharts-routstr-node': 'https://legacy-node.routstr.e2e/',
      });
      return {
        rawKey: localStorage.getItem('labcharts-routstr-key'),
        usableKey: window.__syncE2EGetRoutstrKey(),
        node: localStorage.getItem('labcharts-routstr-node'),
        updatedAt: localStorage.getItem('labcharts-routstr-session-updated-at'),
      };
    });
    assert('Device B immediately uses encrypted Routstr session pulled from A',
      routstrSync.rawKey?.startsWith('v1:')
        && routstrSync.rawKey !== routstrSync.usableKey
        && routstrSync.usableKey === 'sk-routstr-two-device'
        && routstrSync.node === 'https://node.routstr.e2e/'
        && routstrSync.updatedAt === '200',
      JSON.stringify(routstrSync));

    const savePersonas = (page, personalities) => page.evaluate(async ({ profileId, items }) => {
      await window.__syncE2EPersonaStorage.saveCustomPersonalitiesToStorage(items, profileId);
    }, { profileId: PROFILE_ID, items: personalities });
    const collectChat = page => page.evaluate(profileId =>
      window.__syncE2ECollectChatData(profileId), PROFILE_ID);
    const applyChat = (page, chatData) => page.evaluate(({ profileId, payload }) =>
      window.__syncE2EApplyChatData(profileId, payload), {
      profileId: PROFILE_ID,
      payload: chatData,
    });
    const personaSnapshot = page => page.evaluate(async profileId => {
      const storage = window.__syncE2EPersonaStorage;
      return {
        items: await storage.loadCustomPersonalitiesFromStorage(profileId),
        tombstones: await storage.loadCustomPersonalityTombstones(profileId),
        rawItems: localStorage.getItem(storage.customPersonalityStorageKey(profileId)),
        rawTombstones: localStorage.getItem(storage.customPersonalityTombstoneStorageKey(profileId)),
      };
    }, PROFILE_ID);

    const personaA = {
      id: 'custom_device_a', name: 'Device A Voice', icon: 'A', promptText: 'Created on A.',
      createdAt: '2026-08-08T10:00:00.000Z', updatedAt: '2026-08-08T10:00:00.000Z',
    };
    const personaB = {
      id: 'custom_device_b', name: 'Device B Voice', icon: 'B', promptText: 'Created on B.',
      createdAt: '2026-08-08T10:01:00.000Z', updatedAt: '2026-08-08T10:01:00.000Z',
    };
    await savePersonas(pageA, [personaA]);
    await savePersonas(pageB, [personaB]);
    const initialA = await collectChat(pageA);
    const initialB = await collectChat(pageB);
    await applyChat(pageA, initialB);
    await applyChat(pageB, initialA);
    let personasA = await personaSnapshot(pageA);
    let personasB = await personaSnapshot(pageB);
    assert('Two devices union independently-created personas across encrypted storage modes',
      personasA.items.length === 2
        && personasB.items.length === 2
        && personasA.items.some(item => item.id === personaA.id)
        && personasA.items.some(item => item.id === personaB.id)
        && personasB.rawItems?.startsWith('v1:'),
      JSON.stringify({ personasA, personasB }));

    await savePersonas(pageA, personasA.items.map(item => item.id === personaA.id ? {
      ...item, name: 'Newest A Edit', updatedAt: '2026-08-08T10:05:00.000Z',
    } : item));
    await savePersonas(pageB, personasB.items.map(item => item.id === personaA.id ? {
      ...item, name: 'Older B Edit', updatedAt: '2026-08-08T10:04:00.000Z',
    } : item));
    const editedA = await collectChat(pageA);
    const editedB = await collectChat(pageB);
    await applyChat(pageA, editedB);
    await applyChat(pageB, editedA);
    personasA = await personaSnapshot(pageA);
    personasB = await personaSnapshot(pageB);
    assert('Concurrent persona edits converge on the per-item newer version',
      personasA.items.find(item => item.id === personaA.id)?.name === 'Newest A Edit'
        && personasB.items.find(item => item.id === personaA.id)?.name === 'Newest A Edit',
      JSON.stringify({ personasA, personasB }));

    await pageB.evaluate(async ({ profileId, personaId, deletedAt }) => {
      const storage = window.__syncE2EPersonaStorage;
      const items = await storage.loadCustomPersonalitiesFromStorage(profileId);
      await storage.saveCustomPersonalitiesToStorage(items.filter(item => item.id !== personaId), profileId);
      await storage.recordCustomPersonalityDeletion(personaId, profileId, deletedAt);
      localStorage.setItem(`labcharts-${profileId}-chatPersonality`, personaId);
    }, {
      profileId: PROFILE_ID,
      personaId: personaA.id,
      deletedAt: Date.parse('2026-08-08T10:06:00.000Z'),
    });
    await applyChat(pageA, await collectChat(pageB));
    await applyChat(pageB, await collectChat(pageA));
    personasA = await personaSnapshot(pageA);
    personasB = await personaSnapshot(pageB);
    const activeA = await pageA.evaluate(profileId =>
      localStorage.getItem(`labcharts-${profileId}-chatPersonality`), PROFILE_ID);
    assert('Persona deletion tombstones propagate without resurrection and reject deleted active selection',
      !personasA.items.some(item => item.id === personaA.id)
        && !personasB.items.some(item => item.id === personaA.id)
        && Number(personasA.tombstones[personaA.id]) > 0
        && Number(personasB.tombstones[personaA.id]) > 0
        && personasB.rawTombstones?.startsWith('v1:')
        && activeA === 'default',
      JSON.stringify({ personasA, personasB, activeA }));

    const staleB = await getImportedData(pageB);

    await openMarkerModal(pageA);
    await editOpenMarkerValue(pageA, EDITED_MARKER_VALUE);
    let snapA = await markerModalSnapshot(pageA);
    assert('Device A manual edit updates marker + insulin mirror',
      snapA.marker === EDITED_MARKER_VALUE
        && snapA.mirror === EDITED_MARKER_VALUE
        && snapA.manualValue === ORIGINAL_MARKER_VALUE
        && snapA.mirrorManualValue === ORIGINAL_MARKER_VALUE,
      JSON.stringify(snapA));

    const stalePull = await pullRemoteImportedData(pageA, staleB);
    snapA = await markerModalSnapshot(pageA);
    assert('Stale pull from B does not clobber A manual edit',
      snapA.marker === EDITED_MARKER_VALUE
        && snapA.mirror === EDITED_MARKER_VALUE
        && snapA.manualValue === ORIGINAL_MARKER_VALUE
        && stalePull.needsRebroadcast === true,
      JSON.stringify({ snapA, stalePull: { needsRebroadcast: stalePull.needsRebroadcast, remoteBroughtNewRows: stalePull.remoteBroughtNewRows } }));

    await openMarkerModal(pageB);
    await pullRemoteImportedData(pageB, await getImportedData(pageA));
    let snapB = await markerModalSnapshot(pageB);
    assert('Device B open marker modal refreshes to pulled manual value',
      snapB.open
        && snapB.marker === EDITED_MARKER_VALUE
        && snapB.mirror === EDITED_MARKER_VALUE
        && snapB.badges.some(text => /manual/.test(text) && /\u00d7|x/i.test(text))
        && new RegExp(`\\b${EDITED_MARKER_VALUE}\\b`).test(snapB.text),
      JSON.stringify(snapB));

    await clickManualRevertBadge(pageB);
    snapB = await markerModalSnapshot(pageB);
    assert('Device B manual revert restores imported value locally',
      snapB.marker === ORIGINAL_MARKER_VALUE
        && snapB.mirror === ORIGINAL_MARKER_VALUE
        && snapB.manualValue === null
        && !snapB.badges.some(text => /manual/.test(text) && /\u00d7|x/i.test(text)),
      JSON.stringify(snapB));

    await applyMergedImportedData(pageA, await getImportedData(pageB), true);
    snapA = await markerModalSnapshot(pageA);
    assert('Device A open marker modal refreshes to pulled manual revert',
      snapA.open
        && snapA.marker === ORIGINAL_MARKER_VALUE
        && snapA.mirror === ORIGINAL_MARKER_VALUE
        && snapA.manualValue === null
        && !snapA.badges.some(text => /manual/.test(text) && /\u00d7|x/i.test(text))
        && new RegExp(`\\b${ORIGINAL_MARKER_VALUE}\\b`).test(snapA.text),
      JSON.stringify(snapA));

    await closeFloatingModals(pageA);
    await closeFloatingModals(pageB);

    await openSunSessionModal(pageB);
    await updateSunDuration(pageA, 33);
    await pullRemoteImportedData(pageB, await getImportedData(pageA));
    const sunSnap = await sessionModalSnapshot(pageB, 'sun');
    assert('Device B open sun session modal refreshes pulled duration',
      sunSnap.open && sunSnap.durationMin === 33 && /\b33 min\b/.test(sunSnap.text),
      JSON.stringify(sunSnap));

    await closeFloatingModals(pageB);

    await openDeviceSessionModal(pageB);
    await updateDeviceDuration(pageA, 18);
    await pullRemoteImportedData(pageB, await getImportedData(pageA));
    const deviceSnap = await sessionModalSnapshot(pageB, 'device');
    assert('Device B open device session modal refreshes pulled duration',
      deviceSnap.open && deviceSnap.durationMin === 18 && deviceSnap.text.includes('18 min'),
      JSON.stringify(deviceSnap));

    const agentEnabledRemote = await enableAgentAccessForSync(pageA);
    await pullRemoteImportedData(pageB, agentEnabledRemote);
    const agentSnapB = await agentAccessSnapshot(pageB);
    assert('Device B pull enables Agent Access from synced profile state',
      agentSnapB.enabled === true
        && agentSnapB.token === 'syncagent'.padEnd(64, 'a')
        && agentSnapB.contextKey === `gbctx_v1_${'S'.repeat(43)}`
        && agentSnapB.seriesDays === 30
        && agentSnapB.legacyToken === null
        && agentSnapB.legacyContextKey === null,
      JSON.stringify(agentSnapB));

    const agentDisabledRemote = await disableAgentAccessForSync(pageB);
    await pullRemoteImportedData(pageA, agentDisabledRemote.imported);
    const agentSnapA = await agentAccessSnapshot(pageA);
    assert('Device A pull receives Agent Access revoke from synced profile state',
      agentDisabledRemote.previousToken === 'syncagent'.padEnd(64, 'a')
        && agentSnapA.enabled === false
        && agentSnapA.token === null
        && agentSnapA.contextKey === null
        && agentSnapA.state?.revokedAt
        && agentSnapA.legacyToken === null
        && agentSnapA.legacyContextKey === null,
      JSON.stringify({ agentDisabledRemote, agentSnapA }));
  } finally {
    for (const device of devices) {
      await stopPageCoverage(device.page, testInfo, `device-${device.label.toLowerCase()}`).catch(() => {});
    }
    for (const context of contexts) {
      try {
        await context?.close();
      } catch (_) {}
    }
  }

  console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
  if (fail) {
    console.error('\nFailures:');
    for (const f of failures) console.error(`  - ${f}`);
    throw new Error(`Two-device sync E2E failed: ${fail} failed`);
  }
}

test('two-device sync E2E', async ({ browser }, testInfo) => {
  testInfo.setTimeout(90_000);
  await run(browser, testInfo);
});
