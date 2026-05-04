// test-light-devices.js — Light therapy device library + session log:
// addDeviceFromPreset / deleteDevice / logDeviceSession / deleteDeviceSession
// / rollingDeviceTotals.
// Run: fetch('tests/test-light-devices.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Light Devices Tests ', 'background:#f59e0b;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const dev = await import('/js/light-devices.js?bust=' + Date.now());
  const {
    getDevices, getDeviceSessions,
    addDeviceFromPreset, deleteDevice,
    logDeviceSession, deleteDeviceSession,
    rollingDeviceTotals,
  } = dev;

  const orig = window._labState.importedData;
  function reset(seed = {}) {
    window._labState.importedData = Object.assign({ entries: [] }, seed);
  }

  // ─── 1. Lazy init ────────────────────────────────────────────────────
  console.log('%c 1. Lazy init ', 'font-weight:bold;color:#f59e0b');

  reset();
  assert('getDevices lazily initializes empty list',
    Array.isArray(getDevices()) && getDevices().length === 0);
  assert('getDeviceSessions lazily initializes empty list',
    Array.isArray(getDeviceSessions()) && getDeviceSessions().length === 0);

  // ─── 2. addDeviceFromPreset ──────────────────────────────────────────
  console.log('%c 2. addDeviceFromPreset ', 'font-weight:bold;color:#f59e0b');

  // mitochondriak-pulse exists in data/light-device-presets.json
  const dPulse = await addDeviceFromPreset('mitochondriak-pulse');
  assert('Returns the persisted device object',
    dPulse && dPulse.id && dPulse.id.startsWith('dev_'));
  assert('Preset metadata threaded through (brand/model/type)',
    dPulse.brand === 'Mitochondriak' &&
    dPulse.model === 'Pulse' &&
    dPulse.type === 'pbm-targeted');
  assert('Preset peakWavelengths copied',
    Array.isArray(dPulse.peakWavelengths) && dPulse.peakWavelengths.length > 0);
  assert('Preset irradiance copied',
    dPulse.mwPerCm2At15cm === 50);
  assert('catalogSlug preserved for affiliate-link surface',
    dPulse.catalogSlug === 'mitochondriak-pulse');
  assert('Device shows up in getDevices',
    getDevices().length === 1 && getDevices()[0].id === dPulse.id);

  // Unknown preset → null, no insert
  const dNope = await addDeviceFromPreset('does-not-exist');
  assert('Unknown preset → null',
    dNope === null && getDevices().length === 1);

  // Overrides path
  const dCustom = await addDeviceFromPreset('mitochondriak-pulse', { brand: 'Custom', notes: 'mine' });
  assert('Overrides patch the preset (brand=Custom)',
    dCustom.brand === 'Custom' && dCustom.notes === 'mine');

  // ─── 3. deleteDevice ─────────────────────────────────────────────────
  console.log('%c 3. deleteDevice ', 'font-weight:bold;color:#f59e0b');

  const removed = await deleteDevice(dCustom.id);
  assert('deleteDevice → true on hit', removed === true);
  assert('Device removed from list', getDevices().length === 1);
  assert('deleteDevice on unknown id → false',
    (await deleteDevice('dev_nope')) === false);

  // ─── 4. logDeviceSession (lux fallback path) ─────────────────────────
  console.log('%c 4. logDeviceSession lux fallback (SAD lamps) ', 'font-weight:bold;color:#f59e0b');

  // Add a fake SAD-style device manually (no peakWavelengths, lux only)
  // by sidestepping the preset path. The lux-only path is the legacy
  // fallback for Verilux/Carex/Lumie devices that don't declare per-band
  // irradiance.
  const sadDev = {
    id: 'dev_sad', brand: 'Verilux', model: 'HappyLight',
    type: 'sad', peakWavelengths: [], mwPerCm2At15cm: null,
    lux: 10000, recommendedDistanceCm: 30, channels: ['circadian'],
  };
  getDevices().push(sadDev);

  // Eyes-NOT-protected → circadian dose accrues; eyes-PROTECTED → 0
  const sLux = await logDeviceSession({
    deviceId: sadDev.id, durationMin: 30,
    distanceCm: 30, bodyArea: 'face', eyesProtected: false,
  });
  assert('logDeviceSession returns a stamped session',
    sLux && sLux.id && sLux.id.startsWith('devsess_'));
  assert('SAD lux fallback assigns circadian dose (lux × seconds / 100)',
    Math.abs(sLux.doses.circadian - (10000 * 30 * 60 / 100)) < 1e-6,
    `got ${sLux.doses.circadian}`);
  assert('Session carries duration + distance + bodyArea + eyesProtected',
    sLux.durationMin === 30 && sLux.distanceCm === 30 &&
    sLux.bodyArea === 'face' && sLux.eyesProtected === false);

  // Eyes protected on SAD lamp → no circadian (lux-only path requires open eyes)
  const sLuxEyes = await logDeviceSession({
    deviceId: sadDev.id, durationMin: 30, eyesProtected: true,
  });
  assert('SAD lamp + eyes-protected → no circadian dose accrues',
    !sLuxEyes.doses.circadian || sLuxEyes.doses.circadian === 0);

  // ─── 5. logDeviceSession on unknown device → null ────────────────────
  console.log('%c 5. logDeviceSession edge cases ', 'font-weight:bold;color:#f59e0b');

  const sBad = await logDeviceSession({ deviceId: 'dev_nope', durationMin: 10 });
  assert('Unknown deviceId → null', sBad === null);

  // Device record gets `lastSession` stamped for prefill on next dialog
  const refresh = getDevices().find(d => d.id === sadDev.id);
  assert('Device gets lastSession stamped (prefill on next log)',
    refresh.lastSession && refresh.lastSession.durationMin === 30);
  assert('Device gets updatedAt stamped (cross-device merge)',
    Number.isFinite(refresh.updatedAt));

  // ─── 6. deleteDeviceSession ──────────────────────────────────────────
  console.log('%c 6. deleteDeviceSession ', 'font-weight:bold;color:#f59e0b');

  const sessCountBefore = getDeviceSessions().length;
  const removedSess = await deleteDeviceSession(sLux.id);
  assert('deleteDeviceSession → true on hit', removedSess === true);
  assert('Device session removed', getDeviceSessions().length === sessCountBefore - 1);
  assert('deleteDeviceSession on unknown id → false',
    (await deleteDeviceSession('devsess_nope')) === false);

  // ─── 7. rollingDeviceTotals ──────────────────────────────────────────
  console.log('%c 7. rollingDeviceTotals ', 'font-weight:bold;color:#f59e0b');

  reset();
  // Two sessions in window, one outside
  const inWindow1 = {
    id: 'd1', deviceId: 'X',
    startedAt: Date.now() - 86400 * 1000,
    endedAt: Date.now() - 86400 * 1000 + 60000,
    doses: { pbm_red: 1000, pbm_nir: 500 },
  };
  const inWindow2 = {
    id: 'd2', deviceId: 'X',
    startedAt: Date.now() - 3 * 86400 * 1000,
    endedAt: Date.now() - 3 * 86400 * 1000 + 60000,
    doses: { pbm_red: 2000, circadian: 5000 },
  };
  const outOfWindow = {
    id: 'd3', deviceId: 'X',
    startedAt: Date.now() - 30 * 86400 * 1000,
    endedAt: Date.now() - 30 * 86400 * 1000 + 60000,
    doses: { pbm_red: 9999 },
  };
  if (!Array.isArray(window._labState.importedData.deviceSessions))
    window._labState.importedData.deviceSessions = [];
  window._labState.importedData.deviceSessions.push(inWindow1, inWindow2, outOfWindow);

  const tot7 = rollingDeviceTotals(7);
  assert('rollingDeviceTotals(7) sums in-window pbm_red (1000+2000)',
    Math.abs(tot7.pbm_red - 3000) < 1e-9, `got ${tot7.pbm_red}`);
  assert('rollingDeviceTotals(7) sums circadian (5000)',
    tot7.circadian === 5000);
  assert('rollingDeviceTotals(7) sums pbm_nir (500)',
    tot7.pbm_nir === 500);
  // 30-day window picks up the third session
  const tot30 = rollingDeviceTotals(30);
  assert('rollingDeviceTotals(30) picks up the 30d-old session (pbm_red >= 12000)',
    tot30.pbm_red >= 12000);

  // Tolerates session with null doses
  window._labState.importedData.deviceSessions.push({
    id: 'd4', deviceId: 'X',
    startedAt: Date.now() - 1 * 86400 * 1000,
    endedAt: Date.now() - 1 * 86400 * 1000 + 60000,
    doses: null,
  });
  const totSafe = rollingDeviceTotals(7);
  assert('rollingDeviceTotals tolerant of null doses (no NaN)',
    Number.isFinite(totSafe.pbm_red));

  // Restore
  window._labState.importedData = orig;

  // ─── peakShares: hybrid panels split power non-uniformly ─────────────
  // A device with `peakShares: [0.05, 0.95]` for [297nm UVB, 660nm red]
  // delivers ~5% of irradiance at 297 (UVB → vit-D action) and 95% at
  // 660 (red → pbm_red). Without honoring shares the equal-split heuristic
  // over-attributes vitamin_d ~10× on hybrid devices.
  console.log('%c peakShares — hybrid power weighting ', 'font-weight:bold;color:#f59e0b');
  if (typeof window.synthesizeDeviceSpectrum === 'function') {
    const equalSplit = window.synthesizeDeviceSpectrum({
      peakWavelengths: [297, 660],
      mwPerCm2At15cm: 100,
    });
    const heavyRed = window.synthesizeDeviceSpectrum({
      peakWavelengths: [297, 660],
      mwPerCm2At15cm: 100,
      peakShares: [0.05, 0.95],
    });
    // Find indices nearest to 297 nm and 660 nm
    const idx297 = equalSplit.wavelengths.findIndex(nm => nm === 295);
    const idx660 = equalSplit.wavelengths.findIndex(nm => nm === 660);
    if (idx297 >= 0 && idx660 >= 0) {
      const equal297 = equalSplit.irradiance[idx297];
      const heavy297 = heavyRed.irradiance[idx297];
      assert('peakShares=[0.05,0.95] cuts 297nm irradiance ~10× vs equal split',
        heavy297 < equal297 * 0.20 && heavy297 > 0,
        `equal=${equal297.toExponential(2)} heavy=${heavy297.toExponential(2)}`);
      assert('peakShares=[0.05,0.95] amplifies 660nm irradiance ~1.9× vs equal split',
        heavyRed.irradiance[idx660] > equalSplit.irradiance[idx660] * 1.4);
      // Total integrated power approximately preserved. Exact equality
      // doesn't hold here because the 297nm Gaussian's lower tail is
      // truncated at the WAVELENGTHS array's 280nm floor (only ~1.3σ of
      // headroom); shifting power from 297→660 recovers some of that
      // truncated energy, so sumHeavy is slightly larger than sumEqual.
      // 5% tolerance accommodates this without masking real bugs.
      const sumEqual = equalSplit.irradiance.reduce((a, b) => a + b, 0);
      const sumHeavy = heavyRed.irradiance.reduce((a, b) => a + b, 0);
      assert('peakShares preserves total integrated power (within Gaussian-clip tolerance)',
        Math.abs(sumEqual - sumHeavy) / sumEqual < 0.05);
    }
  }

  console.log(`%c Light Devices: ${pass} passed, ${fail} failed `,
    `background:${fail ? '#ef4444' : '#22c55e'};color:#fff;font-weight:bold;padding:4px 12px;border-radius:3px`);
})();
