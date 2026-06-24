#!/usr/bin/env node
// test-light-env.js — Light Environment math + CRUD: rooms, screens,
// computeRoomSeverity, computeScreenStatus, computeIndoorBurden,
// computeDeficitAxes, isActiveToday auto-reset, light audits.
//
// Run: node tests/test-light-env.js  (or via npm test)

import './_node-shim.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Light Environment Tests ===\n');

await import('../js/state.js');
// sun-context.js exposes buildSunContext via window. Two test sections
// below gate on `typeof window.buildSunContext === 'function'`; without
// this import they'd silently skip in Node.
await import('../js/sun-context.js');
const env = await import('../js/light-env.js');
const model = await import('../js/light-env-model.js');
const {
  PRIMARY_SOURCES, SCREEN_DEVICES,
  getEnvironment,
  addRoom, updateRoom, deleteRoom, nextDefaultRoomName,
  addScreen, updateScreen, deleteScreen, getScreensForRoom,
  isActiveToday, setTodayActive,
  getRoomEveningHoursAfterSunset, roomUsesEveningAfterSunset,
  computeRoomSeverity, computeScreenStatus,
  computeIndoorBurden, computeDeficitAxes,
  getLightAudits, saveLightAudit, updateLightAudit, deleteLightAudit,
  renderEnvironmentAssessmentSummary, renderEnvironmentSection,
  openLightEnvironmentAssessment, closeLightEnvironmentAssessment,
  refreshLightEnvironmentAssessment,
  configureLightEnv, lightEnvActionHandlers,
} = env;
const {
  computeRoomSeverityForRoom,
  computeDeficitAxesForEnvironment,
  computeIndoorBurdenForEnvironment,
} = model;

  const orig = window._labState.importedData;
  function reset(seed = {}) {
    window._labState.importedData = Object.assign({ entries: [] }, seed);
  }

  // ─── 1. Constant shape ───────────────────────────────────────────────
  console.log('%c 1. Source / device option lists ', 'font-weight:bold;color:#f59e0b');

  assert('PRIMARY_SOURCES is non-empty array', Array.isArray(PRIMARY_SOURCES) && PRIMARY_SOURCES.length >= 8);
  for (const s of PRIMARY_SOURCES) {
    assert(`PRIMARY_SOURCE '${s.key}' has label`,
      typeof s.key === 'string' && typeof s.label === 'string' && s.label.length > 0);
  }
  assert('PRIMARY_SOURCES contains the canonical led-cool / led-warm / fluorescent',
    PRIMARY_SOURCES.some(s => s.key === 'led-cool') &&
    PRIMARY_SOURCES.some(s => s.key === 'led-warm') &&
    PRIMARY_SOURCES.some(s => s.key === 'fluorescent'));
  assert('light-env re-exports option lists from the model module',
    model.PRIMARY_SOURCES === PRIMARY_SOURCES &&
    model.SCREEN_DEVICES === SCREEN_DEVICES);

  // Loosened: at least 5 entries, canonical keys present. Adding e-reader
  // / wearable display would be safe and shouldn't break this test.
  const REQUIRED_DEVICES = ['phone', 'laptop', 'monitor', 'tablet', 'tv'];
  const deviceKeys = SCREEN_DEVICES.map(d => d.key);
  const missingDevices = REQUIRED_DEVICES.filter(k => !deviceKeys.includes(k));
  assert('SCREEN_DEVICES has phone / laptop / monitor / tablet / tv',
    SCREEN_DEVICES.length >= 5 &&
    missingDevices.length === 0 &&
    SCREEN_DEVICES.every(d => typeof d.label === 'string'),
    missingDevices.length ? `missing: ${missingDevices.join(',')}` : '');

  // ─── 2. getEnvironment lazy init ─────────────────────────────────────
  console.log('%c 2. getEnvironment lazy init ', 'font-weight:bold;color:#f59e0b');

  reset();
  const e = getEnvironment();
  assert('getEnvironment seeds rooms[] + screens[]',
    e && Array.isArray(e.rooms) && Array.isArray(e.screens));

  window._labState.importedData = null;
  assert('getEnvironment returns null when importedData missing',
    getEnvironment() === null);

  // ─── 3. Room CRUD + nextDefaultRoomName ──────────────────────────────
  console.log('%c 3. Room CRUD + name picker ', 'font-weight:bold;color:#f59e0b');

  reset();
  assert('nextDefaultRoomName starts at "Bedroom"', nextDefaultRoomName() === 'Bedroom');

  await addRoom('Bedroom');
  assert('addRoom adds with name', getEnvironment().rooms.length === 1 &&
    getEnvironment().rooms[0].name === 'Bedroom');
  assert('addRoom seeds id, hoursOccupiedPerDay, primarySource, eveningHoursAfterSunset',
    getEnvironment().rooms[0].id &&
    typeof getEnvironment().rooms[0].hoursOccupiedPerDay === 'number' &&
    'eveningHoursAfterSunset' in getEnvironment().rooms[0] &&
    !('eveningUseAfterSunset' in getEnvironment().rooms[0]) &&
    getEnvironment().rooms[0].primarySource);
  assert('Bedroom default hours seeded high (8)', getEnvironment().rooms[0].hoursOccupiedPerDay === 8);

  assert('nextDefaultRoomName cycles to "Living room" after Bedroom used',
    nextDefaultRoomName() === 'Living room');
  // Case-insensitive match
  await addRoom('living room');
  assert('Case-insensitive name match prevents duplicate "Living room"',
    nextDefaultRoomName() === 'Kitchen');

  const roomId = getEnvironment().rooms[0].id;
  await updateRoom(roomId, { primarySource: 'fluorescent', hoursOccupiedPerDay: 5 });
  assert('updateRoom patches fields', getEnvironment().rooms[0].primarySource === 'fluorescent');
  assert('updateRoom stamps updatedAt', getEnvironment().rooms[0].updatedAt > 0);

  reset({
    lightEnvironment: {
      rooms: [{ id: 'legacy-evening-room', name: 'Legacy', eveningUseAfterSunset: true }],
      screens: [],
    },
  });
  const legacyRoom = getEnvironment().rooms[0];
  assert('getEnvironment migrates legacy room evening boolean to numeric hours',
    legacyRoom.eveningHoursAfterSunset === 2 &&
    !('eveningUseAfterSunset' in legacyRoom));
  assert('Canonical room evening helpers read migrated rows',
    getRoomEveningHoursAfterSunset(legacyRoom) === 2 &&
    roomUsesEveningAfterSunset(legacyRoom) === true);
  await updateRoom('legacy-evening-room', { eveningUseAfterSunset: false });
  assert('updateRoom accepts legacy room evening patch but stores only canonical field',
    getEnvironment().rooms[0].eveningHoursAfterSunset === 0 &&
    !('eveningUseAfterSunset' in getEnvironment().rooms[0]));

  // delete clears + tombstones
  await deleteRoom('legacy-evening-room');
  assert('deleteRoom removes from list', !getEnvironment().rooms.find(r => r.id === 'legacy-evening-room'));

  // ─── 4. Screen CRUD ──────────────────────────────────────────────────
  console.log('%c 4. Screen CRUD ', 'font-weight:bold;color:#f59e0b');

  reset();
  await addRoom('Office');
  const officeId = getEnvironment().rooms[0].id;

  await addScreen('phone'); // portable (no roomId)
  await addScreen('laptop', officeId);
  assert('addScreen creates two screens', getEnvironment().screens.length === 2);

  const portable = getScreensForRoom(null);
  const inOffice = getScreensForRoom(officeId);
  assert('getScreensForRoom(null) returns portable screens',
    portable.length === 1 && portable[0].device === 'phone');
  assert('getScreensForRoom(officeId) returns the laptop',
    inOffice.length === 1 && inOffice[0].device === 'laptop');

  const phoneId = portable[0].id;
  await updateScreen(phoneId, { hoursPerDay: 4, eveningUseAfterSunset: 2, blueBlockerEnabled: true });
  assert('updateScreen patches fields',
    getEnvironment().screens.find(s => s.id === phoneId).blueBlockerEnabled === true);

  await deleteScreen(phoneId);
  assert('deleteScreen removes screen', getEnvironment().screens.length === 1);

  // ─── 5. computeRoomSeverity ──────────────────────────────────────────
  console.log('%c 5. computeRoomSeverity ', 'font-weight:bold;color:#f59e0b');

  // Empty signal → "Needs setup" (gray)
  const empty = computeRoomSeverity({ id: 'r-empty', name: 'X', primarySource: null, hoursOccupiedPerDay: null });
  assert('Room with no signals → tier 0 "Needs setup" (incomplete state, distinct from green)',
    empty.tier === 0 && empty.color === 'incomplete');

  // Friendly source = green (tier 0)
  const friendly = computeRoomSeverity({ id: 'r1', name: 'Living', primarySource: 'incandescent', hoursOccupiedPerDay: 2 });
  assert('Incandescent + 2 hr → tier 0 (sleep-friendly)',
    friendly.tier === 0 && friendly.color === 'green');

  // Cool LED only → tier 1
  const coolLED = computeRoomSeverity({ id: 'r2', name: 'Office', primarySource: 'led-cool', hoursOccupiedPerDay: 8 });
  assert('Cool LED → tier ≥ 1 (mild)', coolLED.tier >= 1);

  // Fluorescent → tier ≥ 2
  const fluo = computeRoomSeverity({ id: 'r3', name: 'Lab', primarySource: 'fluorescent', hoursOccupiedPerDay: 8 });
  assert('Fluorescent → tier ≥ 2 (moderate)', fluo.tier >= 2);

  // Cool LED + after-sunset use → escalates to ≥ 2
  const coolEvening = computeRoomSeverity({
    id: 'r4', name: 'Bedroom',
    primarySource: 'led-cool',
    eveningHoursAfterSunset: 3,
    hoursOccupiedPerDay: 4,
  });
  assert('Cool LED + 3 hr evening → tier ≥ 2 (blue contamination)',
    coolEvening.tier >= 2);

  // Severe flicker measurement = tier 4
  const severeFlicker = computeRoomSeverity(
    { id: 'r5', name: 'Lab', primarySource: 'fluorescent', hoursOccupiedPerDay: 8 },
    [{ tool: 'flicker', value: 3, capturedAt: Date.now() }]
  );
  assert('Severe flicker measurement → tier 4 (red)',
    severeFlicker.tier === 4 && severeFlicker.color === 'red');

  // Bedroom-specific: light leak measurement bumps severity
  const bedLightLeak = computeRoomSeverity(
    { id: 'r6', name: 'Bedroom', primarySource: 'led-warm', hoursOccupiedPerDay: 8 },
    [{ tool: 'darkness', value: 5, capturedAt: Date.now() }]
  );
  assert('Bedroom with 5 lux dark reading → tier ≥ 3 (concerning, melatonin-blocking)',
    bedLightLeak.tier >= 3);

  // Low daytime lux on a long-occupancy room
  const lowLux = computeRoomSeverity(
    { id: 'r7', name: 'Office', primarySource: 'led-warm', hoursOccupiedPerDay: 8 },
    [{ tool: 'lux', value: 80, capturedAt: Date.now() }]
  );
  assert('Office at 80 lux for 8 hr → tier ≥ 1 (lower than office-bright)',
    lowLux.tier >= 1);

  // Room with no inputs at all returns the defined default (no crash)
  const noInput = computeRoomSeverity(null);
  assert('computeRoomSeverity(null) returns safe default',
    noInput.tier === 0 && typeof noInput.label === 'string');

  reset({
    lightEnvironment: {
      rooms: [{ id: 'r-screen', name: 'Bedroom', primarySource: 'led-warm', hoursOccupiedPerDay: 8 }],
      screens: [{ id: 's-screen', roomId: 'r-screen', device: 'phone', eveningUseAfterSunset: 3, blueBlockerEnabled: false }],
    },
  });
  const screenHeavyRoom = computeRoomSeverity(getEnvironment().rooms[0], []);
  assert('Room severity wrapper includes active screens assigned to that room',
    screenHeavyRoom.tier >= 3 && /evening screen exposure/.test(screenHeavyRoom.reason));
  await setTodayActive('screen', 's-screen', false);
  const skippedScreenRoom = computeRoomSeverity(getEnvironment().rooms[0], []);
  assert('Room severity wrapper ignores screens skipped today',
    skippedScreenRoom.tier < 3 && !/evening screen exposure/.test(skippedScreenRoom.reason));
  assert('Model room severity scorer has an explicit state-free name',
    typeof computeRoomSeverityForRoom === 'function' &&
    model.computeRoomSeverity === undefined);

  // ─── 6. computeScreenStatus ──────────────────────────────────────────
  console.log('%c 6. computeScreenStatus ', 'font-weight:bold;color:#f59e0b');

  assert('Daytime-only screen → green',
    computeScreenStatus({ device: 'phone', eveningUseAfterSunset: 0, blueBlockerEnabled: false }).color === 'green');
  assert('Blue blocker enabled → green (mitigated, regardless of hours)',
    computeScreenStatus({ device: 'phone', eveningUseAfterSunset: 5, blueBlockerEnabled: true }).color === 'green');
  assert('0.5 hr evening, no blocker → tier 1 yellow',
    computeScreenStatus({ device: 'phone', eveningUseAfterSunset: 0.5 }).tier === 1);
  assert('2 hr evening, no blocker → tier 2 orange',
    computeScreenStatus({ device: 'laptop', eveningUseAfterSunset: 2 }).tier === 2);
  assert('5 hr evening, no blocker → tier 3 red',
    computeScreenStatus({ device: 'tv', eveningUseAfterSunset: 5 }).tier === 3);
  assert('null screen → safe default', computeScreenStatus(null).color === 'green');

  // ─── 7. isActiveToday + setTodayActive auto-reset ────────────────────
  console.log('%c 7. isActiveToday + setTodayActive ', 'font-weight:bold;color:#f59e0b');

  // No override → active by default
  assert('item with no override is active today',
    isActiveToday({ id: 'a' }) === true);

  // Today override active=false → skipped
  reset();
  await addRoom('Bedroom');
  const rid = getEnvironment().rooms[0].id;
  await setTodayActive('room', rid, false);
  assert('setTodayActive(room, false) marks as skipped today',
    isActiveToday(getEnvironment().rooms[0]) === false);

  // Stale override (yesterday) is ignored — auto-reset
  const yesterday = new Date(Date.now() - 86400 * 1000);
  const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  getEnvironment().rooms[0].todayOverride = { date: yKey, active: false };
  assert('Yesterday\'s skip override is auto-cleared (is active again today)',
    isActiveToday(getEnvironment().rooms[0]) === true);

  // ─── 8. computeDeficitAxes ───────────────────────────────────────────
  console.log('%c 8. computeDeficitAxes ', 'font-weight:bold;color:#f59e0b');

  reset();
  // Empty world → 0/0
  let axes = computeDeficitAxes();
  assert('Empty environment → d2=0, d3=0', axes.d2 === 0 && axes.d3 === 0);

  // Single LED-cool room, 10 hr/day, evening use
  await addRoom('Office');
  await updateRoom(getEnvironment().rooms[0].id, {
    primarySource: 'led-cool',
    hoursOccupiedPerDay: 10,
    eveningHoursAfterSunset: 2,
  });
  axes = computeDeficitAxes();
  assert('LED-cool room 10hr → d2 includes the 10 indoor hours',
    axes.d2 === 10);
  // 10 hr * 0.6 LED penalty + 1 evening bonus = 7
  assert('LED-cool + evening → d3 ≈ 7 (10*0.6 + 1)',
    Math.abs(axes.d3 - 7) < 1e-9, `got d3=${axes.d3}`);

  // Skipped today → not counted
  await setTodayActive('room', getEnvironment().rooms[0].id, false);
  axes = computeDeficitAxes();
  assert('Skipped-today room contributes nothing to d2/d3',
    axes.d2 === 0 && axes.d3 === 0);
  const modelAxes = computeDeficitAxesForEnvironment({
    rooms: [
      { id: 'active-room', primarySource: 'led-cool', hoursOccupiedPerDay: 10, eveningHoursAfterSunset: 2 },
      { id: 'skipped-room', primarySource: 'led-cool', hoursOccupiedPerDay: 10, eveningHoursAfterSunset: 2 },
    ],
    screens: [{ id: 'active-screen', eveningUseAfterSunset: 2, blueBlockerEnabled: false }],
  }, {
    isActiveToday: item => item.id !== 'skipped-room',
  });
  assert('Model deficit axes are state-free and accept today filtering',
    modelAxes.d2 === 10 && Math.abs(modelAxes.d3 - 8) < 1e-9,
    `got d2=${modelAxes.d2}, d3=${modelAxes.d3}`);

  // ─── 9. computeIndoorBurden ──────────────────────────────────────────
  console.log('%c 9. computeIndoorBurden ', 'font-weight:bold;color:#f59e0b');

  reset();
  // Nothing mapped → light load with empty interp pointing user to add
  let burden = computeIndoorBurden();
  assert('Empty env → tier 0 light load with mapping hint',
    burden.tier === 0 && burden.color === 'green' &&
    /add a room|add a screen/i.test(burden.interp));
  window._labState.importedData.lightEnvironment.burdenAI = {
    status: 'ok',
    dot: 'yellow',
    tip: 'stale moderate verdict',
    detail: 'stale detail',
    fingerprint: 'old-env',
  };
  const emptyLoadHtml = renderEnvironmentSection({ embedded: true });
  assert('Empty environment ignores stale burdenAI and stays Light load',
    emptyLoadHtml.includes('light-env-summary-green') &&
    emptyLoadHtml.includes('Light load') &&
    !emptyLoadHtml.includes('Moderate load') &&
    !emptyLoadHtml.includes('stale moderate verdict'));
  const restoredBurdenRenderer = configureLightEnv({
    renderBurdenInterp: b => `<p class="light-env-summary-interp injected-burden">${b.interp}</p>`,
  });
  const injectedLoadHtml = renderEnvironmentSection({ embedded: true });
  assert('Burden summary uses injected renderer instead of window lookup',
    injectedLoadHtml.includes('injected-burden') &&
    injectedLoadHtml.toLowerCase().includes('add a room'));
  configureLightEnv(restoredBurdenRenderer);

  reset();
  await addRoom('Bedroom');
  const injectedRoom = getEnvironment().rooms[0];
  await updateRoom(injectedRoom.id, {
    primarySource: 'led-warm',
    hoursOccupiedPerDay: 8,
    eveningHoursAfterSunset: 1,
  });
  await addScreen('phone', injectedRoom.id);
  const injectedScreen = getEnvironment().screens[0];
  lightEnvActionHandlers.toggleLightEnvScreenExpanded(injectedScreen.id);
  const injectedMeasurement = {
    id: 'm-injected',
    roomId: injectedRoom.id,
    tool: 'lux',
    value: 120,
    capturedAt: Date.now(),
    confidence: 0.9,
  };
  const restoredRenderDeps = configureLightEnv({
    getMeasurementsForRoom: roomId => roomId === injectedRoom.id ? [injectedMeasurement] : [],
    renderMeasurementAIInline: m => `<div class="injected-measurement-ai">${m.id}</div>`,
    renderRoomAIBlock: r => `<div class="injected-room-ai">${r.id}</div>`,
    renderScreenAIBlock: s => `<div class="injected-screen-ai">${s.id}</div>`,
  });
  const injectedRenderHtml = renderEnvironmentSection({ embedded: true });
  assert('Room measurement and AI renderers use injected Light environment deps',
    injectedRenderHtml.includes('120 lux') &&
    injectedRenderHtml.includes('injected-measurement-ai') &&
    injectedRenderHtml.includes('m-injected') &&
    injectedRenderHtml.includes('injected-room-ai') &&
    injectedRenderHtml.includes(injectedRoom.id) &&
    injectedRenderHtml.includes('injected-screen-ai') &&
    injectedRenderHtml.includes(injectedScreen.id));
  configureLightEnv(restoredRenderDeps);

  // Heavy indoor + heavy evening → tier 2
  reset();
  await addRoom('Office');
  await updateRoom(getEnvironment().rooms[0].id, {
    primarySource: 'led-cool',
    hoursOccupiedPerDay: 10,
    eveningHoursAfterSunset: 2,
  });
  await addRoom('Living');
  await updateRoom(getEnvironment().rooms[1].id, {
    primarySource: 'led-cool',
    hoursOccupiedPerDay: 6,
    eveningHoursAfterSunset: 2,
  });
  burden = computeIndoorBurden();
  assert('Two heavy LED rooms → tier 2 (heavy load) red',
    burden.tier === 2 && burden.color === 'red');
  assert('Burden interp is non-empty advice copy',
    typeof burden.interp === 'string' && burden.interp.length > 20);
  assert('Burden parts list mentions both indoor + blue-after-sunset',
    burden.parts.some(p => /indoors/.test(p)) &&
    burden.parts.some(p => /blue-after-sunset/.test(p)));
  const modelBurden = computeIndoorBurdenForEnvironment({ rooms: [], screens: [] });
  assert('Model indoor burden distinguishes empty mapped exposure',
    modelBurden.tier === 0 &&
    /add a room|add a screen/i.test(modelBurden.interp));

  // ─── 10. Light Audits ────────────────────────────────────────────────
  console.log('%c 10. Light audits CRUD ', 'font-weight:bold;color:#f59e0b');

  reset();
  await addRoom('Bedroom');
  // Drop a measurement so saveLightAudit has something to snapshot.
  if (!Array.isArray(window._labState.importedData.lightMeasurements))
    window._labState.importedData.lightMeasurements = [];
  window._labState.importedData.lightMeasurements.push({
    id: 'lm_x', tool: 'lux', value: 200, capturedAt: Date.now(),
    roomId: getEnvironment().rooms[0].id,
  }, {
    id: 'lm_unmapped', tool: 'cct', value: 5000, capturedAt: Date.now(),
    roomId: null,
  });

  const audit = await saveLightAudit('Initial baseline');
  assert('saveLightAudit returns the audit object', audit && audit.id);
  assert('Audit captures label', audit.label === 'Initial baseline');
  assert('Audit snapshots only room-mapped measurements',
    audit.measurements.length === 1 && audit.measurements[0].id === 'lm_x');
  assert('Audit appears in getLightAudits',
    getLightAudits().some(a => a.id === audit.id));

  await updateLightAudit(audit.id, { label: 'Renamed' });
  assert('updateLightAudit patches label',
    getLightAudits().find(a => a.id === audit.id).label === 'Renamed');

  await deleteLightAudit(audit.id);
  assert('deleteLightAudit removes from list',
    !getLightAudits().some(a => a.id === audit.id));
  const auditModule = await import('../js/light-env-audits.js');
  reset({
    lightEnvironment: {
      rooms: [{ id: 'r1', name: 'Bedroom', primarySource: 'led-warm', hoursOccupiedPerDay: 8 }],
      screens: [],
    },
    lightMeasurements: [],
    lightAudits: [
      { id: 'a1', date: '2026-05-01', label: 'Oldest hidden', rooms: [{ id: 'r1', name: 'Bedroom' }], measurements: [] },
      { id: 'a2', date: '2026-05-02', label: 'Older hidden', rooms: [{ id: 'r1', name: 'Bedroom' }], measurements: [] },
      { id: 'a3', date: '2026-05-03', label: 'Second visible', rooms: [{ id: 'r1', name: 'Bedroom' }], measurements: [] },
      { id: 'a4', date: '2026-05-04', label: 'Latest visible', rooms: [{ id: 'r1', name: 'Bedroom' }], measurements: [] },
    ],
  });
  const compactAudits = auditModule.renderLightAuditsBlock();
  assert('Audit list shows only the latest two snapshots by default',
    compactAudits.includes('Latest visible') &&
    compactAudits.includes('Second visible') &&
    compactAudits.includes('data-id="a4"') &&
    !compactAudits.includes('Older hidden') &&
    !compactAudits.includes('Oldest hidden') &&
    compactAudits.includes('Show 2 older audits'));
  auditModule.lightEnvAuditActionHandlers.toggleLightAuditHistory();
  const expandedAudits = auditModule.renderLightAuditsBlock();
  assert('Audit history can expand older snapshots inline',
    expandedAudits.includes('Latest visible') &&
    expandedAudits.includes('Older hidden') &&
    expandedAudits.includes('Oldest hidden') &&
    expandedAudits.includes('Show only latest 2 audits'));
  auditModule.lightEnvAuditActionHandlers.toggleLightAuditHistory();
  auditModule.lightEnvAuditActionHandlers.setLightAuditsBlockOpen(true);
  const manuallyOpenAudits = auditModule.renderLightAuditsBlock();
  assert('Audit block can stay open without an expanded audit card',
    manuallyOpenAudits.includes('class="light-env-block light-audits-block" open') &&
    manuallyOpenAudits.includes('data-light-env-action="set-audits-block-open"') &&
    !manuallyOpenAudits.includes('ontoggle='));
  auditModule.lightEnvAuditActionHandlers.setLightAuditsBlockOpen(false);
  const manuallyClosedAudits = auditModule.renderLightAuditsBlock();
  assert('Audit block open state can be manually collapsed',
    manuallyClosedAudits.includes('class="light-env-block light-audits-block"') &&
    !manuallyClosedAudits.includes('class="light-env-block light-audits-block" open'));

  // ─── 11. Assessment surface renderers ───────────────────────────────
  console.log('%c 11. Assessment surface renderers ', 'font-weight:bold;color:#f59e0b');

  const summaryHtml = renderEnvironmentAssessmentSummary();
  assert('Light page uses compact assessment summary shell',
    summaryHtml.includes('light-env-assessment-summary') &&
    summaryHtml.includes('Open assessment') &&
    !summaryHtml.includes('light-env-room-disclosure'));
  const fullHtml = renderEnvironmentSection();
  assert('Full environment section remains available for the assessment workspace',
    fullHtml.includes('class="light-env-head"') &&
    fullHtml.includes('light-env-room-disclosure'));
  const embeddedHtml = renderEnvironmentSection({ embedded: true });
  assert('Embedded assessment section suppresses duplicate page header',
    embeddedHtml.includes('light-env-section-embedded') &&
    !embeddedHtml.includes('class="light-env-head"'));
  assert('Assessment modal functions stay module exports instead of window facade',
    typeof openLightEnvironmentAssessment === 'function' &&
    typeof closeLightEnvironmentAssessment === 'function' &&
    typeof refreshLightEnvironmentAssessment === 'function' &&
    window.openLightEnvironmentAssessment === undefined &&
    window.closeLightEnvironmentAssessment === undefined &&
    window.refreshLightEnvironmentAssessment === undefined);
  assert('Internal Light environment action handlers are module-scoped instead of public window API',
    typeof lightEnvActionHandlers.addLightEnvRoom === 'function' &&
    typeof lightEnvActionHandlers.deleteLightEnvScreenConfirm === 'function' &&
    window.addLightEnvRoom === undefined &&
    window.deleteLightEnvScreenConfirm === undefined &&
    window.computeLightDeficitAxes === undefined);

  const beforeModalSyncData = window._labState.importedData;
  const originalCreateElement = document.createElement;
  const originalGetElementById = document.getElementById;
  const originalBodyAppendChild = document.body.appendChild;
  try {
    let storedOverlay = null;
    let dirtyModal = false;
    const modalEl = {
      scrollTop: 33,
      querySelector: () => null,
      querySelectorAll: () => dirtyModal
        ? [{ disabled: false, tagName: 'INPUT', type: 'text', value: 'local edit', defaultValue: '' }]
        : [],
    };
    const overlayEl = {
      id: '',
      className: '',
      style: {},
      dataset: {},
      _html: '',
      classList: {
        add(cls) { if (!overlayEl.className.includes(cls)) overlayEl.className += `${overlayEl.className ? ' ' : ''}${cls}`; },
        remove(cls) { overlayEl.className = overlayEl.className.split(/\s+/).filter(x => x && x !== cls).join(' '); },
        contains(cls) { return overlayEl.className.split(/\s+/).includes(cls); },
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelector: (sel) => sel === '.light-env-assessment-modal' ? modalEl : null,
      querySelectorAll: () => [],
      remove() { if (storedOverlay === overlayEl) storedOverlay = null; },
      set innerHTML(value) { overlayEl._html = String(value); },
      get innerHTML() { return overlayEl._html; },
    };
    document.createElement = tag => tag === 'div' ? overlayEl : originalCreateElement.call(document, tag);
    document.body.appendChild = el => { storedOverlay = el; return el; };
    document.getElementById = id => id === 'light-env-assessment-overlay' ? storedOverlay : originalGetElementById.call(document, id);

    window._labState.importedData = {
      lightEnvironment: { rooms: [{ id: 'sync-room', name: 'Office', hoursOccupiedPerDay: 8 }], screens: [] },
      lightMeasurements: [],
    };
    openLightEnvironmentAssessment();
    const initialModalHtml = storedOverlay?.innerHTML || '';
    window._labState.importedData.lightEnvironment.rooms[0].name = 'Bedroom';
    window.dispatchEvent({ type: 'labcharts-sync-applied' });
    assert('Open Light Environment modal refreshes clean content on sync',
      initialModalHtml.includes('light-env-room-disclosure-name">Office') &&
      storedOverlay?.innerHTML.includes('light-env-room-disclosure-name">Bedroom') &&
      !storedOverlay?.innerHTML.includes('light-env-room-disclosure-name">Office'));

    dirtyModal = true;
    const cleanSyncedHtml = storedOverlay.innerHTML;
    window._labState.importedData.lightEnvironment.rooms[0].name = 'Kitchen';
    window.dispatchEvent({ type: 'labcharts-sync-applied' });
    assert('Open Light Environment modal skips sync refresh while form is dirty',
      storedOverlay?.innerHTML === cleanSyncedHtml &&
      !storedOverlay?.innerHTML.includes('light-env-room-disclosure-name">Kitchen'));
    closeLightEnvironmentAssessment();
  } finally {
    document.createElement = originalCreateElement;
    document.getElementById = originalGetElementById;
    document.body.appendChild = originalBodyAppendChild;
    window._labState.importedData = beforeModalSyncData;
  }

  const envSrc = await (await import('node:fs/promises')).readFile(new URL('../js/light-env.js', import.meta.url), 'utf8');
  const modelSrc = await (await import('node:fs/promises')).readFile(new URL('../js/light-env-model.js', import.meta.url), 'utf8');
  assert('Assessment modal uses user-facing indoor assessment copy',
    envSrc.includes('Indoor Light Assessment') &&
    envSrc.includes('Save audit snapshots before and after changes') &&
    !envSrc.includes('The Light page keeps the summary'));
  assert('Light environment deterministic model is isolated from rendering/storage',
    envSrc.includes("from './light-env-model.js'") &&
    modelSrc.includes('export function computeRoomSeverityForRoom') &&
    !modelSrc.includes('export function computeRoomSeverity(') &&
    modelSrc.includes('export function computeDeficitAxesForEnvironment') &&
    modelSrc.includes('export function computeIndoorBurdenForEnvironment') &&
    !modelSrc.includes('saveImportedData') &&
    !modelSrc.includes('renderEnvironmentSection') &&
    !envSrc.includes('function _hasAnyRoomSignal'));
  const fs = await import('node:fs/promises');
  const auditSrc = await fs.readFile(new URL('../js/light-env-audits.js', import.meta.url), 'utf8');
  const burdenSrc = await fs.readFile(new URL('../js/light-burden-ai-analysis.js', import.meta.url), 'utf8');
  const appLightSunSrc = await fs.readFile(new URL('../js/app-light-sun-modules.js', import.meta.url), 'utf8');
  const appUiShellSrc = await fs.readFile(new URL('../js/app-ui-shell-modules.js', import.meta.url), 'utf8');
  const appEventSrc = await fs.readFile(new URL('../js/app-event-listeners.js', import.meta.url), 'utf8');
  const aiSaveHooksSrc = await fs.readFile(new URL('../js/light-ai-save-hooks.js', import.meta.url), 'utf8');
  const globalsSrc = await fs.readFile(new URL('../types/globals.d.ts', import.meta.url), 'utf8');
  const lightEnvShellHooksSrc = await fs.readFile(new URL('../js/light-env-shell-hooks.js', import.meta.url), 'utf8');
  const navSrc = await fs.readFile(new URL('../js/nav.js', import.meta.url), 'utf8');
  const screenUiSrc = await fs.readFile(new URL('../js/light-env-screen-ui.js', import.meta.url), 'utf8');
  const roomAiSrc = await fs.readFile(new URL('../js/light-env-ai-analysis.js', import.meta.url), 'utf8');
  assert('Light audit renderer emits no inline event attributes',
    !/\bon(?:click|keydown|change|input|submit|blur|toggle)=/.test(auditSrc));
  assert('Light environment render/data helpers stay module exports, not window facade',
    !envSrc.includes('Object.assign(window, {') &&
    !envSrc.includes('getLightEnvironment: getEnvironment') &&
    !envSrc.includes('renderEnvironmentSection,') &&
    !envSrc.includes('renderEnvironmentAssessmentSummary,') &&
    !envSrc.includes('isLightEnvActiveToday: isActiveToday') &&
    !globalsSrc.includes('renderEnvironmentAssessmentSummary') &&
    !globalsSrc.includes('computeDeficitAxes') &&
    !globalsSrc.includes('computeIndoorBurden') &&
    !globalsSrc.includes('suggestRoomSourceFromSpectrum'));
  assert('Light audit storage/rendering lives in its own module',
    auditSrc.includes('configureLightEnvAudits') &&
    auditSrc.includes('export const lightEnvAuditActionHandlers = Object.freeze({') &&
    auditSrc.includes('renderLightAuditsBlock') &&
    auditSrc.includes('saveLightAuditFromUI') &&
    auditSrc.includes('scrollAnchor: LIGHT_AUDITS_ANCHOR') &&
    auditSrc.includes('fallbackScrollAnchor: LIGHT_AUDITS_ANCHOR') &&
    auditSrc.includes('_auditsBlockOpen = true') &&
    auditSrc.includes('setLightAuditsBlockOpen') &&
    auditSrc.includes('deletingExpandedAudit') &&
    auditSrc.includes('sortAuditsNewestFirst(getLightAudits())[0]?.id') &&
    envSrc.includes('modal.scrollTop') &&
    envSrc.includes('...lightEnvAuditActionHandlers') &&
    !auditSrc.includes('Object.assign(window, {') &&
    !auditSrc.includes('window.getLightAudits') &&
    !envSrc.includes('globalThis.saveLightAuditFromUI') &&
    !envSrc.includes('globalThis.toggleLightAudit') &&
    !envSrc.includes('globalThis.updateLightAuditField') &&
    !auditSrc.includes('window.openChatPanel') &&
    !globalsSrc.includes('saveLightAuditFromUI') &&
    !envSrc.includes('function renderLightAuditCompare'));
  assert('Light audit AI hooks route through startup wiring',
    !auditSrc.includes('window.maybeAnalyzeAuditAfterSave') &&
    !auditSrc.includes('window.renderAuditAIBlock') &&
    !auditSrc.includes('window.renderAuditAIDot') &&
    !auditSrc.includes('window.hasAIProvider') &&
    aiSaveHooksSrc.includes("import { configureLightEnvAudits } from './light-env-audits.js';") &&
    aiSaveHooksSrc.includes("import { hasAIProvider } from './api.js';") &&
    aiSaveHooksSrc.includes("import { openChatPanel } from './chat-panel.js';") &&
    aiSaveHooksSrc.includes("import { maybeAnalyzeAuditAfterSave, renderAuditAIBlock, renderAuditAIDot } from './light-audit-ai-analysis.js';") &&
    aiSaveHooksSrc.includes('configureLightEnvAudits({ hasAIProvider, maybeAnalyzeAuditAfterSave, renderAuditAIBlock, renderAuditAIDot, openChatPanel })') &&
    appLightSunSrc.includes("import './light-ai-save-hooks.js';"));
  assert('Burden AI renderer routes through light-env configuration instead of window lookup',
    envSrc.includes('export function configureLightEnv') &&
    envSrc.includes('renderBurdenInterp: null') &&
    envSrc.includes('lightEnvDeps.renderBurdenInterp') &&
    !envSrc.includes('globalThis.renderBurdenInterp') &&
    !burdenSrc.includes('Object.assign(window, {') &&
    !burdenSrc.includes('window.refreshBurdenAIAnalysis') &&
    !burdenSrc.includes('window.analyzeBurdenAI') &&
    !burdenSrc.includes('window.renderBurdenInterp') &&
    burdenSrc.includes("import { computeDeficitAxes, computeIndoorBurden, configureLightEnv, isActiveToday } from './light-env.js';") &&
    burdenSrc.includes('configureLightEnv({ renderBurdenInterp });'));
  assert('Room, measurement, and screen AI renderers route through Light environment configuration',
    envSrc.includes('getMeasurementsForRoom: null') &&
    envSrc.includes('renderMeasurementAIInline: null') &&
    envSrc.includes('renderRoomAIBlock: null') &&
    envSrc.includes('renderScreenAIBlock: null') &&
    envSrc.includes('lightEnvDeps.getMeasurementsForRoom') &&
    envSrc.includes('lightEnvDeps.renderMeasurementAIInline') &&
    envSrc.includes('lightEnvDeps.renderRoomAIBlock') &&
    screenUiSrc.includes('opts.renderScreenAIBlock') &&
    screenUiSrc.includes('renderScreenAIBlock(s)') &&
    aiSaveHooksSrc.includes("import { addRoom, configureLightEnv, getRooms, refreshLightEnvironmentAssessment, suggestRoomSourceFromSpectrum } from './light-env.js';") &&
    aiSaveHooksSrc.includes("import { configureLightTools, getMeasurementsForRoom } from './light-tools.js';") &&
    aiSaveHooksSrc.includes("import { maybeAnalyzeMeasurementAfterSave, renderMeasurementAIInline } from './light-tools-ai-analysis.js';") &&
    aiSaveHooksSrc.includes("import { renderRoomAIBlock } from './light-env-ai-analysis.js';") &&
    aiSaveHooksSrc.includes("import { renderScreenAIBlock } from './light-screen-ai-analysis.js';") &&
    aiSaveHooksSrc.includes('configureLightEnv({ getMeasurementsForRoom, renderMeasurementAIInline, renderRoomAIBlock, renderScreenAIBlock })') &&
    !roomAiSrc.includes('Object.assign(window, {') &&
    !roomAiSrc.includes('window.refreshRoomAIAnalysis') &&
    !roomAiSrc.includes('window.analyzeRoomAI') &&
    !roomAiSrc.includes('window.renderRoomAIBlock') &&
    !globalsSrc.includes('renderRoomAIBlock') &&
    !envSrc.includes('globalThis.getMeasurementsForRoom') &&
    !envSrc.includes('globalThis.renderMeasurementAIInline') &&
    !envSrc.includes('globalThis.renderRoomAIBlock') &&
    !screenUiSrc.includes('globalThis.renderScreenAIBlock'));
  assert('Light assessment modal shell actions route through startup wiring instead of window lookup',
    appUiShellSrc.includes("import './light-env-shell-hooks.js';") &&
    lightEnvShellHooksSrc.includes("import { configureAppEventListeners } from './app-event-listeners.js';") &&
    lightEnvShellHooksSrc.includes("import { openLightEnvironmentAssessment, closeLightEnvironmentAssessment } from './light-env.js';") &&
    lightEnvShellHooksSrc.includes("import { configureNavActions } from './nav.js';") &&
    navSrc.includes("typeof value === 'function'") &&
    appEventSrc.includes("typeof value === 'function'") &&
    !appEventSrc.includes('window.closeLightEnvironmentAssessment') &&
    !globalsSrc.includes('openLightEnvironmentAssessment') &&
    !globalsSrc.includes('closeLightEnvironmentAssessment') &&
    !globalsSrc.includes('refreshLightEnvironmentAssessment'));
  const swSrc = await fs.readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
  const cssSrc = [
    await fs.readFile(new URL('../css/light-sun.css', import.meta.url), 'utf8'),
    await fs.readFile(new URL('../css/light-env.css', import.meta.url), 'utf8'),
  ].join('\n');
  assert('Service worker precaches the light environment model module',
    swSrc.includes("'/js/light-env-model.js'") &&
    swSrc.includes("'/js/light-env-screen-ui.js'") &&
    swSrc.includes("'/js/light-ai-save-hooks.js'"));
  assert('Light assessment is linked from sidebar Analysis tools',
    navSrc.includes("label: 'Light assessment'") &&
    navSrc.includes("key: 'light-env-assessment'") &&
    navSrc.indexOf('Analysis tools') < navSrc.indexOf("label: 'Light assessment'") &&
    !navSrc.includes('window.openLightEnvironmentAssessment'));
  assert('Light assessment sidebar badge reflects saved audit snapshots',
    navSrc.includes('lightAuditCount') &&
    navSrc.includes('lightRoomCount') &&
    !navSrc.includes('lightEnvItems'));
  const modalCss = cssSrc.match(/\.light-env-assessment-modal\s*\{[^}]+\}/)?.[0] || '';
  assert('Assessment modal owns vertical scrolling',
    /max-height:\s*calc\(100dvh - 48px\)/.test(modalCss) &&
    /overflow-y:\s*auto/.test(modalCss));
  const beforeEmptyAssessment = window._labState.importedData;
  window._labState.importedData = {
    lightEnvironment: { rooms: [], screens: [] },
    lightMeasurements: [{ id: 'orphan-reading', tool: 'lux', roomId: null, value: 50, takenAt: Date.now() }],
    lightAudits: [{ id: 'old-audit', date: '2026-05-01', label: 'Old room' }],
  };
  const emptySummaryHtml = renderEnvironmentAssessmentSummary();
  const emptyAssessmentHtml = renderEnvironmentSection({ embedded: true });
  assert('Assessment summary hides orphan readings and audits when no rooms are mapped',
    !emptySummaryHtml.includes('Readings') &&
    !emptySummaryHtml.includes('Audits') &&
    emptySummaryHtml.includes('Start assessment'));
  assert('Assessment workspace hides orphan readings and audits until a room is mapped',
    !emptyAssessmentHtml.includes('Portable readings') &&
    !emptyAssessmentHtml.includes('Light audits'));
  assert('Room and portable-screen empty states share header actions plus quick-picks',
    emptyAssessmentHtml.includes('+ Room') &&
    emptyAssessmentHtml.includes('+ Screen') &&
    emptyAssessmentHtml.includes('Start with') &&
    emptyAssessmentHtml.includes('Bedroom') &&
    emptyAssessmentHtml.includes('📱 Phone') &&
    !emptyAssessmentHtml.includes('+ Bedroom') &&
    !emptyAssessmentHtml.includes('+ 📱 Phone'));
  window._labState.importedData = {
    lightEnvironment: { rooms: [{ id: 'mapped-room', name: 'Bedroom' }], screens: [] },
    lightMeasurements: [
      { id: 'unmapped-reading', tool: 'lux', roomId: null, value: 50, takenAt: Date.now() },
      { id: 'stale-room-reading', tool: 'cct', roomId: 'deleted-room', value: 5000, takenAt: Date.now() },
    ],
    lightAudits: [],
  };
  const unmappedSummaryHtml = renderEnvironmentAssessmentSummary();
  const unmappedAssessmentHtml = renderEnvironmentSection({ embedded: true });
  assert('Assessment summary counts only readings mapped to existing rooms',
    /light-env-assessment-metric-label">Readings<\/span>\s*<strong>0<\/strong>/.test(unmappedSummaryHtml));
  assert('Assessment workspace hides unmapped portable readings',
    !unmappedAssessmentHtml.includes('Portable readings') &&
    !unmappedAssessmentHtml.includes('not matched to a room'));
  window._labState.importedData = beforeEmptyAssessment;

  const beforeDisclosureState = window._labState.importedData;
  const beforeDisclosureView = window._labState.currentView;
  let savedActiveRoom = null;
  try { savedActiveRoom = localStorage.getItem('labcharts-light-env-active-room'); localStorage.removeItem('labcharts-light-env-active-room'); } catch (_) {}
  window._labState.currentView = 'dashboard';
  window._labState.importedData = {
    lightEnvironment: { rooms: [{ id: 'room_single', name: 'Bedroom', hoursOccupiedPerDay: 8 }], screens: [] },
    lightMeasurements: [],
  };
  const singleRoomInitial = renderEnvironmentSection({ embedded: true });
  assert('Single room auto-expands on first render',
    singleRoomInitial.includes('aria-expanded="true"') &&
    singleRoomInitial.includes('light-env-room-disclosure-body'));
  lightEnvActionHandlers.toggleLightEnvRoomExpanded('room_single');
  const singleRoomCollapsed = renderEnvironmentSection({ embedded: true });
  assert('Single room can be explicitly collapsed',
    singleRoomCollapsed.includes('aria-expanded="false"') &&
    !singleRoomCollapsed.includes('light-env-room-disclosure-body'));
  lightEnvActionHandlers.toggleLightEnvRoomExpanded('room_single');
  const singleRoomExpandedAgain = renderEnvironmentSection({ embedded: true });
  assert('Single room expands again after explicit collapse',
    singleRoomExpandedAgain.includes('aria-expanded="true"') &&
    singleRoomExpandedAgain.includes('light-env-room-disclosure-body'));
  window._labState.importedData = beforeDisclosureState;
  window._labState.currentView = beforeDisclosureView;
  try {
    if (savedActiveRoom === null) localStorage.removeItem('labcharts-light-env-active-room');
    else localStorage.setItem('labcharts-light-env-active-room', savedActiveRoom);
  } catch (_) {}

  const beforeScreenToggleState = window._labState.importedData;
  const beforeScreenToggleView = window._labState.currentView;
  const beforeNavigate = window.navigate;
  let screenNavCall = null;
  let screenPrevented = false;
  let screenStopped = false;
  window._labState.currentView = 'light';
  window.navigate = (route, data) => { screenNavCall = { route, data }; };
  window._labState.importedData = {
    lightEnvironment: { rooms: [], screens: [{ id: 'screen_single', device: 'phone', roomId: null }] },
    lightMeasurements: [],
  };
  lightEnvActionHandlers.toggleLightEnvScreenExpanded('screen_single', {
    preventDefault() { screenPrevented = true; },
    stopPropagation() { screenStopped = true; },
  });
  assert('Screen disclosure toggles prevent bubbling/default navigation side effects',
    screenPrevented && screenStopped);
  assert('Screen disclosure refresh pins scroll to the screen card',
    screenNavCall?.route === 'light' &&
    screenNavCall?.data?.scrollAnchor === '.light-env-screen-card[data-id="screen_single"]',
    JSON.stringify(screenNavCall));
  window.navigate = beforeNavigate;
  window._labState.currentView = beforeScreenToggleView;
  window._labState.importedData = beforeScreenToggleState;

  // ─── deleteRoom orphan cleanup ─────────────────────────────────────
  // Earlier deleteRoom dropped the room but left measurements + screens
  // pointing at the dead id. Room-bound measurements are now deleted
  // with the room; screens are kept but become portable.
  console.log('%c deleteRoom orphan cleanup ', 'font-weight:bold;color:#f59e0b');
  window._labState.importedData = {
    lightEnvironment: {
      rooms: [{ id: 'r-orphan', name: 'Bedroom' }],
      screens: [{ id: 's-orphan', device: 'phone', roomId: 'r-orphan' }],
    },
    lightMeasurements: [
      { id: 'm-orphan-1', roomId: 'r-orphan', tool: 'lux', value: 50, takenAt: Date.now() },
      { id: 'm-orphan-2', roomId: 'other-room', tool: 'lux', value: 200, takenAt: Date.now() },
    ],
  };
  await deleteRoom('r-orphan');
  const measurementsAfter = window._labState.importedData.lightMeasurements;
  const screensAfter = window._labState.importedData.lightEnvironment.screens;
  assert('deleteRoom removes linked measurements',
    !measurementsAfter.find(m => m.id === 'm-orphan-1'));
  assert('deleteRoom tombstones linked measurements for sync',
    window._labState.importedData._deleted?.lightMeasurements?.includes('m-orphan-1'));
  assert('deleteRoom leaves measurements pointing at OTHER rooms untouched',
    measurementsAfter.find(m => m.id === 'm-orphan-2').roomId === 'other-room');
  assert('deleteRoom nulls roomId on linked screens',
    screensAfter.find(s => s.id === 's-orphan').roomId === null);

  // Restore
  window._labState.importedData = orig;

  // ─── lightEnvironmentBlock surfaces in AI context ──────────────────
  console.log('%c AI context — light environment block ', 'font-weight:bold;color:#f59e0b');
  if (typeof window.buildSunContext === 'function') {
    const beforeCtx = window._labState.importedData;
    window._labState.importedData = {
      sunSessions: [],
      deviceSessions: [],
      lightEnvironment: {
        rooms: [
          { id: 'r1', name: 'Bedroom', eveningHoursAfterSunset: 2, blueBlocker: false },
          { id: 'r2', name: 'Office', eveningHoursAfterSunset: 4, blueBlocker: true },
        ],
        screens: [
          { id: 's1', device: 'phone', eveningUseAfterSunset: 2, blueBlocker: false },
        ],
      },
      lightAudits: [{ id: 'a1', label: 'Pre', savedAt: Date.now() }],
    };
    // Even with zero outdoor sessions and zero device sessions, an
    // active light environment should still produce AI context — the
    // earlier gate dropped device-only AND environment-only users.
    const ctx = window.buildSunContext({ tier: 'always' });
    assert('AI context rendered for environment-only users (rooms/screens/audits with 0 sessions)',
      typeof ctx === 'string' && ctx.length > 0);
    assert('AI context mentions Indoor light environment section',
      ctx.includes('Indoor light environment'));
    assert('AI context counts rooms (2)',
      /Rooms tracked: 2/.test(ctx));
    assert('AI context counts screens (1)',
      /Screens tracked: 1/.test(ctx));
    assert('AI context surfaces no-blue-blocker after-sunset screens',
      /without blue-blocker/.test(ctx));
    window._labState.importedData = beforeCtx;
  }

  // ─── addRoom returns the new room's id ──────────────────────────────
  // Tool 8 Eye-Level Audit chains addRoom → saveMeasurement; without
  // a return value the binding silently fails and pause-detected lux
  // never reaches the room cards.
  console.log('%c addRoom return value ', 'font-weight:bold;color:#f59e0b');
  window._labState.importedData = { lightEnvironment: { rooms: [], screens: [] } };
  const newId = await addRoom('Office');
  assert('addRoom returns the created room id (string starting with room_)',
    typeof newId === 'string' && newId.startsWith('room_'),
    `got ${typeof newId} ${newId}`);
  assert('addRoom-returned id matches the new room in env.rooms',
    window._labState.importedData.lightEnvironment.rooms.find(r => r.id === newId)?.name === 'Office');

  // ─── AI context surfaces tool-measurement warnings ─────────────────
  if (typeof window.buildSunContext === 'function') {
    console.log('%c AI context — tool warnings ', 'font-weight:bold;color:#f59e0b');
    const beforeCtx = window._labState.importedData;
    window._labState.importedData = {
      sunSessions: [],
      deviceSessions: [],
      lightEnvironment: { rooms: [{ id: 'r1', name: 'Bedroom' }], screens: [] },
      lightAudits: [],
      lightMeasurements: [
        { id: 'm-flicker', tool: 'flicker', value: 3, takenAt: Date.now(), roomId: 'r1' },
        { id: 'm-darkness', tool: 'darkness', value: 8.5, takenAt: Date.now(), roomId: 'r1' },
        // CCT after-sunset hour — set takenAt to 22:00 UTC today
        { id: 'm-cct', tool: 'cct', value: 4500, takenAt: (() => { const d = new Date(); d.setHours(22, 0, 0, 0); return d.getTime(); })(), roomId: 'r1' },
        // CCT before sunset (12:00) — should NOT trigger the warning
        { id: 'm-cct-day', tool: 'cct', value: 5500, takenAt: (() => { const d = new Date(); d.setHours(12, 0, 0, 0); return d.getTime(); })(), roomId: 'r1' },
      ],
    };
    const ctx = window.buildSunContext({ tier: 'always' });
    assert('AI sees flicker score ≥ 2 warning',
      /flicker score 3/.test(ctx));
    assert('AI sees bedroom-too-bright warning (>1 lux at the pillow)',
      /bedroom too bright/.test(ctx) || /melatonin/.test(ctx));
    assert('AI sees after-sunset CCT > 3500K warning',
      /after-sunset CCT 4500K/.test(ctx));
    assert('AI does NOT flag CCT readings taken before sunset',
      !/CCT 5500K/.test(ctx));
    window._labState.importedData = beforeCtx;
  }

  // Restore
  window._labState.importedData = orig;

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
