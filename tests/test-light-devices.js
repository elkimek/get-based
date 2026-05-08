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

  // ─── peakShares: explicit shares override the heuristic ──────────────
  // A device with `peakShares: [0.05, 0.95]` for [297nm UVB, 660nm red]
  // delivers ~5% of irradiance at 297 (UVB → vit-D action) and 95% at
  // 660 (red → pbm_red). Compared to the hybrid-detection heuristic
  // (which gives 5% UVB / 35% red by default for hybrid panels), the
  // explicit shares match UVB but amplify the red peak ~2.7×.
  console.log('%c peakShares — explicit override of heuristic ', 'font-weight:bold;color:#f59e0b');
  if (typeof window.synthesizeDeviceSpectrum === 'function') {
    const heuristicDefault = window.synthesizeDeviceSpectrum({
      peakWavelengths: [297, 660],
      mwPerCm2At15cm: 100,
    });
    const heavyRed = window.synthesizeDeviceSpectrum({
      peakWavelengths: [297, 660],
      mwPerCm2At15cm: 100,
      peakShares: [0.05, 0.95],
    });
    // Find indices nearest to 297 nm and 660 nm
    const idx297 = heuristicDefault.wavelengths.findIndex(nm => nm === 295);
    const idx660 = heuristicDefault.wavelengths.findIndex(nm => nm === 660);
    if (idx297 >= 0 && idx660 >= 0) {
      // For [297, 660] hybrid the heuristic normalizes only-present-bands:
      // raw weights {uvb: 5%, red: 35%} renormalize to [12.5%, 87.5%].
      // Explicit [0.05, 0.95] is more conservative on UVB and slightly
      // heavier on red. So: explicit cuts 297nm ~2.5× vs heuristic, and
      // amplifies 660nm ~1.1× vs heuristic.
      const heuristic297 = heuristicDefault.irradiance[idx297];
      const heavy297 = heavyRed.irradiance[idx297];
      assert('peakShares=[0.05,0.95]: 297nm cut ~2.5× vs hybrid heuristic',
        heavy297 < heuristic297 * 0.6 && heavy297 > 0,
        `heuristic=${heuristic297.toExponential(2)} explicit=${heavy297.toExponential(2)}`);
      assert('peakShares=[0.05,0.95]: 660nm slightly amplified vs hybrid heuristic',
        heavyRed.irradiance[idx660] > heuristicDefault.irradiance[idx660] * 1.05);
      // Total integrated power approximately preserved. Exact equality
      // Total integrated power approximately preserved between heuristic
      // default and explicit shares — both should normalize to the
      // device's rated mwPerCm2At15cm. Gaussian-clip tolerance: the 297nm
      // tail is truncated at the WAVELENGTHS 280nm floor, so a heavier
      // red share recovers some clipped energy.
      const sumHeuristic = heuristicDefault.irradiance.reduce((a, b) => a + b, 0);
      const sumHeavy = heavyRed.irradiance.reduce((a, b) => a + b, 0);
      assert('peakShares preserves total integrated power (within Gaussian-clip tolerance)',
        Math.abs(sumHeuristic - sumHeavy) / sumHeuristic < 0.10);
    }
  }

  // ─── Distance scaling on logDeviceSession e2e ──────────────────────
  // The previous Light Devices commit fixed distance handling for eye
  // channels by folding distFactor into the spectrum amplitude. This
  // test pins the end-to-end behaviour: SAME duration + SAME body area,
  // closer distance = proportionally higher channel-au, capped at 3×
  // (near-field plateau).
  console.log('%c Distance scaling on logDeviceSession e2e ', 'font-weight:bold;color:#f59e0b');
  if (typeof window.logDeviceSession === 'function') {
    const distDevice = {
      id: 'D-dist', brand: 'Test', model: 'PBM',
      peakWavelengths: [660], mwPerCm2At15cm: 50,
      recommendedDistanceCm: 30, peakShares: [1.0],
    };
    window._labState.importedData = { lightDevices: [distDevice], deviceSessions: [] };
    await window.logDeviceSession({ deviceId: 'D-dist', durationMin: 10, distanceCm: 30, bodyArea: 'torso', eyesProtected: true });
    await window.logDeviceSession({ deviceId: 'D-dist', durationMin: 10, distanceCm: 15, bodyArea: 'torso', eyesProtected: true });
    await window.logDeviceSession({ deviceId: 'D-dist', durationMin: 10, distanceCm: 5, bodyArea: 'torso', eyesProtected: true });
    const sess = window._labState.importedData.deviceSessions;
    const at30 = sess[0]?.doses?.pbm_red || 0;
    const at15 = sess[1]?.doses?.pbm_red || 0;
    const at5  = sess[2]?.doses?.pbm_red || 0;
    // Naive inverse-square at 15 cm vs 30 cm spec: (30/15)² = 4.0×.
    // The 3.0× clamp activates whenever the raw factor exceeds 3, so
    // BOTH 15 cm AND 5 cm sessions land at the cap. The test verifies
    // the cap bites, not the inverse-square slope itself.
    assert('Distance scaling: closer-than-spec sessions clamp at 3× cap',
      at30 > 0 && Math.abs(at15 / at30 - 3.0) < 0.2,
      `15cm ratio=${at30 > 0 ? (at15/at30).toFixed(2) : 'n/a'} (expected ≈3.0, clamp active)`);
    assert('Distance scaling: 5 cm (naive 36×) also clamps to ~3×',
      at30 > 0 && Math.abs(at5 / at30 - 3.0) < 0.2,
      `5cm ratio=${at30 > 0 ? (at5/at30).toFixed(2) : 'n/a'} (expected ≈3.0, same cap)`);
  }
  window._labState.importedData = orig;

  // ─── deleteDevice + orphaned-session render ────────────────────────
  // Sessions logged on a device deleted later must remain renderable
  // (the user's history shouldn't vanish), surfacing a "Removed device"
  // label rather than a stale brand reference. Pin the contract.
  console.log('%c deleteDevice + orphan session contract ', 'font-weight:bold;color:#f59e0b');
  if (typeof window.logDeviceSession === 'function' && typeof window.deleteDevice === 'function') {
    const ephemeral = {
      id: 'D-ephemeral', brand: 'Test', model: 'Ephemeral',
      peakWavelengths: [660], mwPerCm2At15cm: 50,
      recommendedDistanceCm: 15, peakShares: [1.0],
    };
    window._labState.importedData = { lightDevices: [ephemeral], deviceSessions: [] };
    await window.logDeviceSession({ deviceId: 'D-ephemeral', durationMin: 10, distanceCm: 15, bodyArea: 'torso', eyesProtected: true });
    const sessId = window._labState.importedData.deviceSessions[0]?.id;
    assert('logDeviceSession persists session with deviceId reference',
      sessId && window._labState.importedData.deviceSessions[0].deviceId === 'D-ephemeral');
    // Now delete the device.
    await window.deleteDevice('D-ephemeral');
    const stillThere = window._labState.importedData.deviceSessions[0];
    assert('Sessions persist after parent device is deleted (no auto-purge)',
      stillThere && stillThere.id === sessId);
    assert('Session retains its dangling deviceId for historical reference',
      stillThere.deviceId === 'D-ephemeral');
    // Tombstone recorded so cross-device sync drops the device on peers.
    const tombs = window._labState.importedData?._deleted?.lightDevices || [];
    assert('deleteDevice records tombstone for cross-device sync',
      tombs.includes('D-ephemeral'));
    window._labState.importedData = orig;
  }

  console.log(`%c Light Devices: ${pass} passed, ${fail} failed `,
    `background:${fail ? '#ef4444' : '#22c55e'};color:#fff;font-weight:bold;padding:4px 12px;border-radius:3px`);
})();
