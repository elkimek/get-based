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
      () => window._labState
        && typeof window.saveImportedData === 'function'
        && typeof window.showDetailModal === 'function'
        && typeof window.navigate === 'function'
        && typeof window.openSunSessionDetail === 'function'
        && typeof window.openDeviceSessionDetail === 'function',
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
        window.__syncE2EMergePulledImportedData = mergePulledImportedData;
        window.__syncE2EPersistPulledImportedData = persistPulledImportedData;
        window.__syncE2ERefreshActiveProfileAfterPull = refreshActiveProfileAfterPull;
        window.__syncE2EMessenger = syncMessenger;
      `,
    });
    await page.waitForFunction(
      () => typeof window.__syncE2EMergePulledImportedData === 'function'
        && typeof window.__syncE2EPersistPulledImportedData === 'function'
        && typeof window.__syncE2ERefreshActiveProfileAfterPull === 'function'
        && typeof window.__syncE2EMessenger?.disableMessengerTokenLocal === 'function',
      null,
      { timeout: 15000 }
    );
    await page.evaluate(async ({ profileId, imported }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('labcharts-active-profile', profileId);
      window._labState.currentProfile = profileId;
      window._labState.currentView = 'dashboard';
      window._labState.importedData = JSON.parse(JSON.stringify(imported));
      window._labState.markerRegistry = {};
      window._labState._activeDetailMarkerId = null;
      document.querySelectorAll('.modal-overlay').forEach(el => {
        if (el.id) el.classList.remove('show');
        else el.remove();
      });
      await window.saveImportedData({ immediate: true });
      window.navigate('dashboard');
    }, { profileId: PROFILE_ID, imported: importedData });
    return { context, page, label };
  } catch (error) {
    await stopPageCoverage(page, testInfo, `device-${label.toLowerCase()}`).catch(() => {});
    await context.close().catch(() => {});
    throw error;
  }
}

async function getImportedData(page) {
  return page.evaluate(() => JSON.parse(JSON.stringify(window._labState.importedData)));
}

async function pullRemoteImportedData(page, remoteImportedData) {
  return page.evaluate(async ({ profileId, remote }) => {
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
      merged: JSON.parse(JSON.stringify(window._labState.importedData)),
    };
  }, { profileId: PROFILE_ID, remote: remoteImportedData });
}

async function applyMergedImportedData(page, mergedImportedData, remoteBroughtNewRows = true) {
  return page.evaluate(async ({ profileId, merged, remoteBroughtNewRows: broughtRows }) => {
    window.__syncE2ERefreshActiveProfileAfterPull({
      profileId,
      merged: JSON.parse(JSON.stringify(merged)),
      chatApplied: false,
      remoteBroughtNewRows: broughtRows,
      debug: () => {},
    });
    return JSON.parse(JSON.stringify(window._labState.importedData));
  }, { profileId: PROFILE_ID, merged: mergedImportedData, remoteBroughtNewRows });
}

async function openMarkerModal(page) {
  await page.evaluate(({ markerId }) => {
    window.showDetailModal(markerId);
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
    window.editMarkerValue(markerId, date, current, { target: valueEl });
    const input = valueEl.querySelector('input.ref-edit-input');
    if (!input) throw new Error('Marker edit input did not render');
    input.value = String(next);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await waitFor(() => {
      const entry = window._labState.importedData.entries?.find(e => e.date === date);
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
      const entry = window._labState.importedData.entries?.find(e => e.date === date);
      return entry?.markers?.[markerKey] === originalValue
        && entry?.markers?.[mirrorKey] === originalValue
        && window._labState.importedData.manualValues?.[`${markerKey}:${date}`] === null
        && window._labState.importedData.manualValues?.[`${mirrorKey}:${date}`] === null
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
  return page.evaluate(({ date, markerKey, mirrorKey }) => {
    const modal = document.getElementById('detail-modal');
    const entry = window._labState.importedData.entries?.find(e => e.date === date);
    return {
      open: !!document.getElementById('modal-overlay')?.classList?.contains('show'),
      modalClass: modal?.className || '',
      text: modal?.textContent || '',
      badges: Array.from(modal?.querySelectorAll('.ref-edited-badge') || []).map(el => el.textContent.trim()),
      marker: entry?.markers?.[markerKey],
      mirror: entry?.markers?.[mirrorKey],
      manualValue: window._labState.importedData.manualValues?.[`${markerKey}:${date}`],
      mirrorManualValue: window._labState.importedData.manualValues?.[`${mirrorKey}:${date}`],
    };
  }, {
    date: LAB_DATE,
    markerKey: MARKER_KEY,
    mirrorKey: MIRROR_MARKER_KEY,
  });
}

async function navigateLight(page) {
  await page.evaluate(() => window.navigate('light'));
  await page.waitForFunction(() => window._labState.currentView === 'light', null, { timeout: 5000 });
}

async function openSunSessionModal(page) {
  await navigateLight(page);
  await page.evaluate(({ id }) => window.openSunSessionDetail(id), { id: SUN_SESSION_ID });
  await page.waitForFunction(
    () => document.querySelector('.modal-overlay.show .sun-detail-modal[data-session-kind="sun"]'),
    null,
    { timeout: 5000 }
  );
}

async function openDeviceSessionModal(page) {
  await navigateLight(page);
  await page.evaluate(({ id }) => window.openDeviceSessionDetail(id), { id: DEVICE_SESSION_ID });
  await page.waitForFunction(
    () => document.querySelector('.modal-overlay.show .sun-detail-modal[data-session-kind="device"]'),
    null,
    { timeout: 5000 }
  );
}

async function updateSunDuration(page, durationMin) {
  await page.evaluate(async ({ id, duration }) => {
    await window.updateSession(id, { durationMin: duration });
  }, { id: SUN_SESSION_ID, duration: durationMin });
}

async function updateDeviceDuration(page, durationMin) {
  await page.evaluate(async ({ id, duration }) => {
    await window.updateDeviceSession(id, { durationMin: duration });
  }, { id: DEVICE_SESSION_ID, duration: durationMin });
}

async function sessionModalSnapshot(page, kind) {
  return page.evaluate(({ kind, sunSessionId, deviceSessionId }) => {
    const modal = document.querySelector(`.modal-overlay.show .sun-detail-modal[data-session-kind="${kind}"]`);
    const source = kind === 'sun'
      ? window._labState.importedData.sunSessions?.find(s => s.id === sunSessionId)
      : window._labState.importedData.deviceSessions?.find(s => s.id === deviceSessionId);
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
    const token = 'syncagent'.padEnd(64, 'a');
    const contextKey = `gbctx_v1_${'S'.repeat(43)}`;
    const now = Date.now();
    window._labState.importedData.agentAccess = {
      version: 1,
      enabled: true,
      token,
      contextKey,
      credentialCreatedAt: now,
      revokedAt: null,
      updatedAt: now,
    };
    window._labState.importedData.agentAccessWearableSeriesDays = 30;
    localStorage.removeItem('labcharts-messenger-token');
    localStorage.removeItem('labcharts-agent-context-key');
    await window.saveImportedData({ immediate: true });
    return JSON.parse(JSON.stringify(window._labState.importedData));
  });
}

async function agentAccessSnapshot(page) {
  return page.evaluate(async () => {
    const messenger = window.__syncE2EMessenger;
    if (!messenger) throw new Error('sync-messenger helper module not loaded');
    return {
      enabled: messenger.isMessengerEnabled(),
      token: messenger.getMessengerToken(),
      contextKey: messenger.getMessengerContextKey(),
      state: JSON.parse(JSON.stringify(window._labState.importedData.agentAccess || null)),
      seriesDays: window._labState.importedData.agentAccessWearableSeriesDays,
      legacyToken: localStorage.getItem('labcharts-messenger-token'),
      legacyContextKey: localStorage.getItem('labcharts-agent-context-key'),
    };
  });
}

async function disableAgentAccessForSync(page) {
  return page.evaluate(async () => {
    const messenger = window.__syncE2EMessenger;
    if (!messenger) throw new Error('sync-messenger helper module not loaded');
    const previousToken = messenger.disableMessengerTokenLocal();
    await window.saveImportedData({ immediate: true });
    return {
      previousToken,
      imported: JSON.parse(JSON.stringify(window._labState.importedData)),
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
