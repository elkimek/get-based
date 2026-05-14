#!/usr/bin/env node
// test-sun-correlations.js — Pearson coefficient + weekly binning + cache
// invalidation for the per-channel × biomarker engine.
//
// Run: node tests/test-sun-correlations.js  (or via npm test)

import './_node-shim.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Sun Correlations Tests ===\n');

// state.js initializes window._labState; importing it loads the wiring.
await import('../js/state.js');
const mod = await import('../js/sun-correlations.js');
const { computeSunCorrelations, getSunCorrelations } = mod;

  // Stash and restore importedData around the run so we don't pollute the
  // host page's profile state.
  const orig = window._labState.importedData;

  // Helper — build a session record at the given week-offset (0 = this week).
  // Sessions are bucketed by `endedAt` against now.
  const now = Date.now();
  const W = 7 * 86400 * 1000;
  function session(weekOffset, doses) {
    return {
      id: `t-${weekOffset}-${Math.random().toString(36).slice(2,7)}`,
      // Subtract a few seconds so week-offset 0 stays inside [now-W, now)
      // — adding any positive offset overshoots `endMs = now` and the
      // session falls outside every bucket.
      endedAt: now - weekOffset * W - 5000,
      doses,
    };
  }
  function entry(weekOffset, vitamin_d) {
    const d = new Date(now - weekOffset * W - 86400 * 1000);
    return {
      date: d.toISOString().slice(0, 10),
      // Entries use a flat dotted-key map, NOT nested. v1.7.20 fixed the
      // implementation; the test fixture was using the same wrong shape
      // (`values.vitamins.vitamin_d_25oh`) so both broke in lockstep.
      markers: { 'vitamins.vitaminD': vitamin_d },
    };
  }

  // ─── 1. Empty-state contract ──────────────────────────────────────────
  console.log('%c 1. Empty-state contract ', 'font-weight:bold;color:#f59e0b');

  window._labState.importedData = { sunSessions: [], deviceSessions: [], entries: [] };
  const empty = computeSunCorrelations({ weeks: 12 });
  assert('Empty session set → empty pairs', Array.isArray(empty.pairs) && empty.pairs.length === 0);
  assert('Empty result still carries computedAt', typeof empty.computedAt === 'number');

  // ─── 2. Insufficient data → skip pairs ────────────────────────────────
  console.log('%c 2. n<4 weeks → skip ', 'font-weight:bold;color:#f59e0b');

  window._labState.importedData = {
    sunSessions: [
      session(0, { vitamin_d: 5 }),
      session(1, { vitamin_d: 4 }),
      session(2, { vitamin_d: 6 }),
    ],
    deviceSessions: [],
    entries: [
      entry(0, 60), entry(1, 55), entry(2, 65),
    ],
  };
  const tooFew = computeSunCorrelations({ weeks: 12 });
  assert('Only 3 overlapping weeks → no pairs emitted', tooFew.pairs.length === 0);

  // ─── 3. Strong positive correlation surfaces ──────────────────────────
  console.log('%c 3. Strong positive correlation ', 'font-weight:bold;color:#f59e0b');

  // Vitamin-D dose ↑ alongside vitamin_d_25oh ↑ across 6 weeks
  window._labState.importedData = {
    sunSessions: [
      session(0, { vitamin_d: 8 }),
      session(1, { vitamin_d: 7 }),
      session(2, { vitamin_d: 5 }),
      session(3, { vitamin_d: 4 }),
      session(4, { vitamin_d: 3 }),
      session(5, { vitamin_d: 1 }),
    ],
    deviceSessions: [],
    entries: [
      entry(0, 80), entry(1, 75), entry(2, 65),
      entry(3, 55), entry(4, 45), entry(5, 35),
    ],
  };
  const strong = computeSunCorrelations({ weeks: 12 });
  const vdPair = strong.pairs.find(p => p.channel === 'vitamin_d' && p.biomarkerKey === 'vitamins.vitaminD');
  assert('vitamin_d × 25-OH vitamin D pair surfaces', !!vdPair);
  assert('Pearson r ≈ +1 for monotonic positive series',
    vdPair && vdPair.r > 0.95, `r=${vdPair?.r?.toFixed(4)}`);
  assert('Pair includes overlap count n', vdPair && vdPair.n >= 4);
  assert('Pairs sorted by |r| descending',
    strong.pairs.every((p, i) => i === 0 || Math.abs(strong.pairs[i-1].r) >= Math.abs(p.r)));

  // ─── 4. Strong negative correlation ───────────────────────────────────
  console.log('%c 4. Strong negative correlation ', 'font-weight:bold;color:#f59e0b');

  // Inverse: dose climbs while marker falls
  window._labState.importedData = {
    sunSessions: [
      session(0, { vitamin_d: 1 }),
      session(1, { vitamin_d: 2 }),
      session(2, { vitamin_d: 4 }),
      session(3, { vitamin_d: 6 }),
      session(4, { vitamin_d: 8 }),
    ],
    deviceSessions: [],
    entries: [
      entry(0, 90), entry(1, 80), entry(2, 60), entry(3, 40), entry(4, 30),
    ],
  };
  const neg = computeSunCorrelations({ weeks: 12 });
  const negPair = neg.pairs.find(p => p.channel === 'vitamin_d' && p.biomarkerKey === 'vitamins.vitaminD');
  assert('Inverse series → r < 0', negPair && negPair.r < -0.9, `r=${negPair?.r?.toFixed(4)}`);

  // ─── 5. Constant series → no correlation (skip) ──────────────────────
  console.log('%c 5. Zero-variance skip ', 'font-weight:bold;color:#f59e0b');

  window._labState.importedData = {
    sunSessions: [
      session(0, { vitamin_d: 5 }),
      session(1, { vitamin_d: 5 }),
      session(2, { vitamin_d: 5 }),
      session(3, { vitamin_d: 5 }),
      session(4, { vitamin_d: 5 }),
    ],
    deviceSessions: [],
    entries: [entry(0,60),entry(1,55),entry(2,70),entry(3,50),entry(4,65)],
  };
  const flat = computeSunCorrelations({ weeks: 12 });
  const flatVD = flat.pairs.find(p => p.channel === 'vitamin_d' && p.biomarkerKey === 'vitamins.vitaminD');
  assert('Constant channel series → pair skipped (denominator 0)', !flatVD);

  // ─── 6. Device sessions accumulate alongside sun sessions ─────────────
  console.log('%c 6. Device + sun sessions accumulate ', 'font-weight:bold;color:#f59e0b');

  window._labState.importedData = {
    sunSessions: [
      session(0, { vitamin_d: 3 }), session(1, { vitamin_d: 2 }),
      session(2, { vitamin_d: 1 }), session(3, { vitamin_d: 0 }),
    ],
    deviceSessions: [
      session(0, { vitamin_d: 5 }), session(1, { vitamin_d: 3 }),
      session(2, { vitamin_d: 2 }), session(3, { vitamin_d: 1 }),
    ],
    entries: [entry(0,80),entry(1,60),entry(2,50),entry(3,35)],
  };
  const merged = computeSunCorrelations({ weeks: 12 });
  const mPair = merged.pairs.find(p => p.channel === 'vitamin_d' && p.biomarkerKey === 'vitamins.vitaminD');
  assert('Combined sun+device sessions correlate with biomarker',
    mPair && mPair.r > 0.9, `r=${mPair?.r?.toFixed(4)}`);

  // ─── 7. Cache invalidation via getSunCorrelations ─────────────────────
  console.log('%c 7. Cache key respects session/entry counts ', 'font-weight:bold;color:#f59e0b');

  window._labState.importedData = {
    sunSessions: [
      session(0, { vitamin_d: 1 }), session(1, { vitamin_d: 2 }),
      session(2, { vitamin_d: 3 }), session(3, { vitamin_d: 4 }),
    ],
    deviceSessions: [],
    entries: [entry(0,40),entry(1,50),entry(2,60),entry(3,70)],
  };
  const first = getSunCorrelations();
  // Same fixture → cache should return the same object reference
  const second = getSunCorrelations();
  assert('Identical state → cached result returned (same reference)', first === second);

  // Mutating fixture (extra session) must invalidate cache
  window._labState.importedData.sunSessions.push(session(4, { vitamin_d: 5 }));
  window._labState.importedData.entries.push(entry(4, 80));
  const third = getSunCorrelations();
  assert('New session → cache invalidated (fresh result)', first !== third);

  // ─── 8. Channel set covers all 6 spectrum channels ────────────────────
  console.log('%c 8. Channel coverage ', 'font-weight:bold;color:#f59e0b');

  // Build a fixture exercising every channel listed in the producer
  const allChannels = ['vitamin_d','pomc','no_cv','violet_eye','circadian','nir_solar'];
  const synthDose = {};
  allChannels.forEach((c, i) => { synthDose[c] = 1 + i; });
  window._labState.importedData = {
    sunSessions: [0,1,2,3,4,5].map(w => session(w, Object.fromEntries(allChannels.map(c => [c, 1 + Math.random()])))),
    deviceSessions: [],
    entries: [entry(0,60),entry(1,55),entry(2,70),entry(3,50),entry(4,65),entry(5,58)],
  };
  const broad = computeSunCorrelations({ weeks: 12 });
  const channelsSeen = new Set(broad.pairs.map(p => p.channel));
  for (const ch of allChannels) {
    assert(`Channel '${ch}' represented in pairs output`, channelsSeen.has(ch));
  }

  // ─── 9. Result schema ────────────────────────────────────────────────
  console.log('%c 9. Pair schema ', 'font-weight:bold;color:#f59e0b');

  if (broad.pairs.length > 0) {
    const sample = broad.pairs[0];
    for (const k of ['channel','biomarker','biomarkerKey','r','n','lag']) {
      assert(`Pair has '${k}'`, k in sample);
    }
    assert('Pair r is numeric', typeof sample.r === 'number' && !Number.isNaN(sample.r));
    assert('Pair r in [-1, 1]', sample.r >= -1 && sample.r <= 1);
    assert('Pair n >= 4 (engine\'s minimum overlap)', sample.n >= 4);
    assert('biomarkerKey shape: <category>.<marker>', /^[a-z_]+\.[A-Za-z0-9_]+$/.test(sample.biomarkerKey));
  }

  // Restore
  window._labState.importedData = orig;

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
