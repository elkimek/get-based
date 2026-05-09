// test-wearables-manual.js — manual entry as a first-class wearable source
// Run: fetch('tests/test-wearables-manual.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Manual-as-wearable-source Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const manual = await import('../js/wearables-manual.js');
  const store = await import('../js/wearables-store.js');
  const adapters = await import('../js/wearable-adapters.js');

  // ═══════════════════════════════════════
  // 1. Module exports
  // ═══════════════════════════════════════
  console.log('%c 1. Module Exports ', 'font-weight:bold;color:#f59e0b');

  assert('logManualMetric exported', typeof manual.logManualMetric === 'function');
  assert('logManualBP exported', typeof manual.logManualBP === 'function');
  assert('migrateBiometricsToManual exported', typeof manual.migrateBiometricsToManual === 'function');
  assert('hasManualData exported', typeof manual.hasManualData === 'function');
  assert('ensureManualConnection exported', typeof manual.ensureManualConnection === 'function');
  assert('MANUAL_METRICS exported', Array.isArray(manual.MANUAL_METRICS));
  assert('MANUAL_METRICS covers weight/bp/rhr',
    manual.MANUAL_METRICS.includes('weight') &&
    manual.MANUAL_METRICS.includes('bp_systolic') &&
    manual.MANUAL_METRICS.includes('bp_diastolic') &&
    manual.MANUAL_METRICS.includes('rhr'));
  assert('MANUAL_TAGS exported', Array.isArray(manual.MANUAL_TAGS));
  assert('MANUAL_TAGS includes core context set',
    manual.MANUAL_TAGS.includes('resting') &&
    manual.MANUAL_TAGS.includes('morning-fasted') &&
    manual.MANUAL_TAGS.includes('post-workout') &&
    manual.MANUAL_TAGS.includes('stress'));
  assert('deleteManualMetric exported', typeof manual.deleteManualMetric === 'function');
  assert('refreshManualSummary exported', typeof manual.refreshManualSummary === 'function');

  // Dashboard strip inline-log form wiring (Phase 3). These are window
  // globals defined in wearables.js; the onclick attrs on empty cards call
  // them directly. Regression-guard the names so a future refactor can't
  // break the attrs silently.
  assert('openManualLogForm on window', typeof window.openManualLogForm === 'function');
  assert('saveManualLog on window', typeof window.saveManualLog === 'function');
  assert('cancelManualLog on window', typeof window.cancelManualLog === 'function');

  // Source-level check that the empty-card state is wired up.
  const wearablesSrc = await fetch('js/wearables.js').then(r => r.text());
  assert('wearables.js renders empty manual cards',
    wearablesSrc.includes('renderEmptyManualCard') && wearablesSrc.includes('wearable-card-empty'));
  assert('wearables.js MANUAL_EMPTY_METRICS covers weight/bp/rhr',
    /MANUAL_EMPTY_METRICS\s*=\s*\[[^\]]*weight[^\]]*bp_systolic[^\]]*rhr/.test(wearablesSrc));

  // Phase 4 retired the Edit Client modal's weight/BP/pulse inputs — the
  // dashboard strip is now the single entry point. Regression-guard that
  // the old form elements are gone and the "go to Health Metrics" link
  // replaced them. BMI calc must read weight from the wearables summary,
  // not from the legacy biometrics store.
  const clSrc = await fetch('js/client-list.js').then(r => r.text());
  assert('Edit Client modal no longer renders the cl-bio-weight container',
    !clSrc.includes('id="cl-bio-weight"'));
  assert('Edit Client modal no longer renders the cl-bio-bp container',
    !clSrc.includes('id="cl-bio-bp"'));
  assert('Edit Client modal no longer renders the cl-bio-pulse container',
    !clSrc.includes('id="cl-bio-pulse"'));
  assert('Edit Client modal links out to Health Metrics on the dashboard',
    clSrc.includes('_clGoToHealthMetrics'));
  assert('_clUpdateBMI reads weight from wearableSummary (single source of truth)',
    clSrc.includes('wearableSummary?.metrics?.weight'));

  // ═══════════════════════════════════════
  // 2. 'manual' adapter registered
  // ═══════════════════════════════════════
  console.log('%c 2. Adapter Registry ', 'font-weight:bold;color:#f59e0b');

  const manualAdapter = adapters.ADAPTERS.find(a => a.id === 'manual');
  assert('manual adapter present in ADAPTERS', manualAdapter != null);
  assert('manual authType = "manual"', manualAdapter?.authType === 'manual');
  assert('manual has weight metric', !!manualAdapter?.metrics?.weight);
  assert('manual has bp_systolic metric', !!manualAdapter?.metrics?.bp_systolic);
  assert('manual has bp_diastolic metric', !!manualAdapter?.metrics?.bp_diastolic);
  assert('manual has rhr metric', !!manualAdapter?.metrics?.rhr);
  assert('manual has no apiHost', manualAdapter?.apiHost === null);

  // ═══════════════════════════════════════
  // 3. logManualMetric writes to IDB + flips connection
  // ═══════════════════════════════════════
  console.log('%c 3. logManualMetric ', 'font-weight:bold;color:#f59e0b');

  const TEST_PROFILE = 'test-manual-' + Math.random().toString(36).slice(2, 8);
  // Temporarily point state at the test profile so ensureManualConnection
  // writes to a safe slot and doesn't pollute the live profile.
  const origProfile = window._labState.currentProfile;
  const origImported = window._labState.importedData;
  window._labState.currentProfile = TEST_PROFILE;
  window._labState.importedData = { wearableConnections: {} };

  try {
    await manual.logManualMetric(TEST_PROFILE, 'weight', { date: '2026-04-24', value: 82.1 });
    const row = await store.getDaily(TEST_PROFILE, 'manual', '2026-04-24');
    assert('weight row written with source=manual', row?.source === 'manual');
    assert('weight row has correct date', row?.date === '2026-04-24');
    assert('weight row has correct value', row?.weight === 82.1);
    assert('ensureManualConnection populated wearableConnections.manual',
      window._labState.importedData.wearableConnections?.manual != null);
    assert('manual connection has connectedAt',
      !!window._labState.importedData.wearableConnections.manual.connectedAt);

    // ═══════════════════════════════════════
    // 4. logManualBP writes combined row
    // ═══════════════════════════════════════
    console.log('%c 4. logManualBP ', 'font-weight:bold;color:#f59e0b');

    await manual.logManualBP(TEST_PROFILE, { date: '2026-04-24', systolic: 118, diastolic: 76, pulse: 64 });
    const bpRow = await store.getDaily(TEST_PROFILE, 'manual', '2026-04-24');
    assert('BP row merges with same-day weight row',
      bpRow?.weight === 82.1 && bpRow?.bp_systolic === 118);
    assert('BP row has diastolic', bpRow?.bp_diastolic === 76);
    assert('BP row has pulse (rhr)', bpRow?.rhr === 64);

    // BP logging with only partial data
    await manual.logManualBP(TEST_PROFILE, { date: '2026-04-25', systolic: 120 });
    const partialBP = await store.getDaily(TEST_PROFILE, 'manual', '2026-04-25');
    assert('partial BP (syst only) writes just that field', partialBP?.bp_systolic === 120 && partialBP?.bp_diastolic == null);

    // Validation
    let threw = false;
    try { await manual.logManualMetric(TEST_PROFILE, 'bogus_metric', { value: 1 }); }
    catch { threw = true; }
    assert('logManualMetric rejects unknown metric', threw);

    threw = false;
    try { await manual.logManualMetric(TEST_PROFILE, 'weight', { value: NaN }); }
    catch { threw = true; }
    assert('logManualMetric rejects NaN', threw);

    // ═══════════════════════════════════════
    // 5. hasManualData
    // ═══════════════════════════════════════
    console.log('%c 5. hasManualData ', 'font-weight:bold;color:#f59e0b');

    const has = await manual.hasManualData(TEST_PROFILE);
    assert('hasManualData returns true after log', has === true);

    const MISSING_PROFILE = 'test-missing-' + Math.random().toString(36).slice(2, 8);
    const hasNone = await manual.hasManualData(MISSING_PROFILE);
    assert('hasManualData returns false for empty profile', hasNone === false);

    // ═══════════════════════════════════════
    // 6. migrateBiometricsToManual — idempotent + shape
    // ═══════════════════════════════════════
    console.log('%c 6. Biometrics Migration ', 'font-weight:bold;color:#f59e0b');

    const MIGRATE_PROFILE = 'test-mig-' + Math.random().toString(36).slice(2, 8);
    // Switch state's profile so ensureManualConnection inside migration
    // writes to the correct slot.
    window._labState.currentProfile = MIGRATE_PROFILE;
    window._labState.importedData = { wearableConnections: {} };
    const legacyBiometrics = {
      weight: [
        { date: '2026-04-20', value: 82.5, unit: 'kg', source: 'manual' },
        { date: '2026-04-22', value: 81.9, unit: 'kg', source: 'manual' },
        { date: '2026-04-23', value: 180, unit: 'lb', source: 'manual' }, // lb → kg
      ],
      bp: [
        { date: '2026-04-22', systolic: 120, diastolic: 78, source: 'manual' },
      ],
      pulse: [
        { date: '2026-04-22', value: 68, source: 'manual' },
      ],
    };
    const result = await manual.migrateBiometricsToManual(MIGRATE_PROFILE, legacyBiometrics);
    assert('migration runs (not skipped)', result.migrated === true);
    assert('migration counted 3 weight + 1 bp + 1 pulse entries',
      result.counts.weight === 3 && result.counts.bp === 1 && result.counts.pulse === 1);
    assert('migration wrote 3 rows (by-date dedup)', result.counts.rows === 3);

    const migRow22 = await store.getDaily(MIGRATE_PROFILE, 'manual', '2026-04-22');
    assert('migrated 04-22 row has weight + BP + pulse merged',
      migRow22?.weight === 81.9 && migRow22?.bp_systolic === 120 && migRow22?.rhr === 68);

    const migRow23 = await store.getDaily(MIGRATE_PROFILE, 'manual', '2026-04-23');
    const lbInKg = 180 / 2.20462;
    assert('lb → kg unit conversion on migration',
      Math.abs((migRow23?.weight || 0) - lbInKg) < 0.01);

    // Idempotence — re-running should be a no-op
    const rerun = await manual.migrateBiometricsToManual(MIGRATE_PROFILE, legacyBiometrics);
    assert('migration is idempotent (second run skipped)', rerun.skipped === 'already-migrated');

    // No biometrics at all
    const EMPTY_PROFILE = 'test-empty-' + Math.random().toString(36).slice(2, 8);
    const emptyRes = await manual.migrateBiometricsToManual(EMPTY_PROFILE, null);
    assert('migration handles null biometrics', emptyRes.skipped === 'no-biometrics');

    // ═══════════════════════════════════════
    // 7. deleteManualMetric
    // ═══════════════════════════════════════
    console.log('%c 7. deleteManualMetric ', 'font-weight:bold;color:#f59e0b');

    const DEL_PROFILE = 'test-del-' + Math.random().toString(36).slice(2, 8);
    window._labState.currentProfile = DEL_PROFILE;
    window._labState.importedData = { wearableConnections: {} };
    // Seed: weight + BP + pulse on same date
    await manual.logManualMetric(DEL_PROFILE, 'weight', { date: '2026-04-24', value: 82 });
    await manual.logManualBP(DEL_PROFILE, { date: '2026-04-24', systolic: 118, diastolic: 76, pulse: 64 });

    // Delete just weight — BP + pulse must remain
    await manual.deleteManualMetric(DEL_PROFILE, 'weight', '2026-04-24');
    const afterWeightDel = await store.getDaily(DEL_PROFILE, 'manual', '2026-04-24');
    assert('weight deleted but row kept (BP remains)',
      afterWeightDel?.weight == null && afterWeightDel?.bp_systolic === 118);

    // Delete remaining metrics — last delete should nuke the row outright
    // (not stub it) so IDB quota + summary coverageDays stay accurate.
    // Tags on the row are also gone — they annotated a reading that no
    // longer exists.
    await manual.deleteManualMetric(DEL_PROFILE, 'bp_systolic', '2026-04-24');
    await manual.deleteManualMetric(DEL_PROFILE, 'bp_diastolic', '2026-04-24');
    await manual.deleteManualMetric(DEL_PROFILE, 'rhr', '2026-04-24');
    const afterAllDel = await store.getDaily(DEL_PROFILE, 'manual', '2026-04-24');
    assert('all-metrics-deleted row is removed from IDB (no stub)',
      afterAllDel == null);

    // Unknown-metric and no-row cases
    let threwDel = false;
    try { await manual.deleteManualMetric(DEL_PROFILE, 'bogus', '2026-04-24'); }
    catch { threwDel = true; }
    assert('deleteManualMetric rejects unknown metric', threwDel);
    await manual.deleteManualMetric(DEL_PROFILE, 'weight', '2099-01-01'); // no-op
    assert('deleteManualMetric on missing date is a no-op', true);

    // ═══════════════════════════════════════
    // 8. Context tags
    // ═══════════════════════════════════════
    console.log('%c 8. Context Tags ', 'font-weight:bold;color:#f59e0b');

    const TAG_PROFILE = 'test-tags-' + Math.random().toString(36).slice(2, 8);
    window._labState.currentProfile = TAG_PROFILE;
    window._labState.importedData = { wearableConnections: {} };
    await manual.logManualBP(TAG_PROFILE, {
      date: '2026-04-24', systolic: 145, diastolic: 92,
      tags: ['post-workout', 'stress']
    });
    const taggedRow = await store.getDaily(TAG_PROFILE, 'manual', '2026-04-24');
    assert('BP row persists tags array', Array.isArray(taggedRow?.tags));
    assert('tags contain post-workout + stress',
      taggedRow?.tags?.includes('post-workout') && taggedRow?.tags?.includes('stress'));

    // Unknown / typo'd tags get silently stripped — never throw, just don't persist them.
    await manual.logManualMetric(TAG_PROFILE, 'weight', {
      date: '2026-04-25', value: 81,
      tags: ['morning-fasted', 'bogus-tag', 'resting', 'post-workout']
    });
    const weightRow = await store.getDaily(TAG_PROFILE, 'manual', '2026-04-25');
    assert('unknown tags are filtered out',
      !weightRow?.tags?.includes('bogus-tag'));
    assert('valid tags survive the filter',
      weightRow?.tags?.includes('morning-fasted') &&
      weightRow?.tags?.includes('resting') &&
      weightRow?.tags?.includes('post-workout'));

    // Dashboard strip form wiring for chips
    assert('wearables.js renders tag chips on bp form', wearablesSrc.includes('_renderTagChips'));
    assert('toggleManualLogChip on window', typeof window.toggleManualLogChip === 'function');

    // Detail-modal save/delete handlers must re-render the dashboard strip,
    // not just the modal. Before the audit fix, they only re-opened the
    // detail modal — the strip card stayed stale until the user happened to
    // re-navigate. Regression guard with a source-grep scoped to each
    // function so a future refactor can't silently drop the render call.
    const saveFn = wearablesSrc.match(/async function saveManualEntryFromDetail[\s\S]*?\n\}/)?.[0] || '';
    const delFn = wearablesSrc.match(/async function deleteManualEntryFromDetail[\s\S]*?\n\}/)?.[0] || '';
    assert('saveManualEntryFromDetail re-renders dashboard strip',
      /window\.navigate\([^)]*\)/.test(saveFn) && /['"]dashboard['"]/.test(saveFn));
    assert('deleteManualEntryFromDetail re-renders dashboard strip',
      /window\.navigate\([^)]*\)/.test(delFn) && /['"]dashboard['"]/.test(delFn));
    assert('deleteManualEntryFromDetail closes modal when last reading is removed',
      /closeModal/.test(delFn));

    // showConfirmDialog is promise-based (returns Promise<boolean>). The v1.24.1
    // regression (537bec4) was caused by a 4-arg call where the body string
    // landed in the onConfirm slot. Both call sites now use await showConfirmDialog().
    const handleDisconnectFn = wearablesSrc.match(/async function handleManualDisconnect[\s\S]*?\n\}\s*\n/)?.[0] || '';
    assert('deleteManualEntryFromDetail uses promise-style showConfirmDialog',
      /await\s+window\.showConfirmDialog\(/.test(delFn));
    assert('handleManualDisconnect uses promise-style showConfirmDialog',
      /await\s+window\.showConfirmDialog\(/.test(handleDisconnectFn));

  } finally {
    // Restore live profile
    window._labState.currentProfile = origProfile;
    window._labState.importedData = origImported;
  }

  // ═══════════════════════════════════════
  // Results
  // ═══════════════════════════════════════
  console.log(`\n%c Tests complete: ${pass} passed, ${fail} failed `, fail ? 'background:#ef4444;color:#fff;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS !== 'undefined') window.__TEST_RESULTS = { pass, fail };
})();
