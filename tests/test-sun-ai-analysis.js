#!/usr/bin/env node
// test-sun-ai-analysis.js — per-session AI verdict module: fingerprint
// stability, context-build correctness, render-state machine.
//
// Run: node tests/test-sun-ai-analysis.js  (or via npm test)

import './_node-shim.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Sun AI Analysis Tests ===\n');

await import('../js/state.js');
await import('../js/sun.js');
// sun-uvdata.js exposes solarZenithAngle on window for solar-phase lines.
await import('../js/sun-uvdata.js');
const mod = await import('../js/sun-ai-analysis.js');
const {
  getSessionFingerprint,
  buildSingleSessionContext,
  renderSessionAIInline,
  renderSessionAIDetail,
  maybeAnalyzeSessionAfterFinish,
  refreshSessionAIAnalysis,
} = mod;
  const origImported = window._labState.importedData;
  const origProvider = localStorage.getItem('labcharts-ai-provider');
  const origPaused = localStorage.getItem('labcharts-ai-paused');

  function reset(seed = {}) {
    window._labState.importedData = Object.assign({
      entries: [],
      sunSessions: [],
      sunDefaults: { fitzpatrick: 'III' },
    }, seed);
  }

  // Fixed reference start so two makeSess() calls produce identical
  // session shapes — letting the fingerprint tests measure only the
  // override under test, not Date.now() drift between calls.
  const REF_START = 1746518400000; // 2025-05-06 08:00:00 UTC, deterministic
  function makeSess(overrides = {}) {
    return Object.assign({
      id: 'sun_test_' + Math.random().toString(36).slice(2, 8),
      startedAt: REF_START,
      endedAt: REF_START + 25 * 60000,
      durationMin: 25,
      bodyExposure: { preset: 'shorts_top_off', fraction: 0.45, glassBetween: false, sunscreenSPF: null, rotatedSides: false, regions: [] },
      eyeExposure: { mode: 'direct', lensTint: 'clear', durationSec: 1500 },
      atmosphere: { uvIndex: 6.2, ozoneDU: 305, cloudCover: 12 },
      doses: { vitamin_d: 3200, circadian: 38000, no_cv: 0.42, nir_solar: 0.18, pomc: 0.31, violet_eye: 0.07 },
      safety: { medFraction: 0.42, fitzpatrick: 'III' },
    }, overrides);
  }

  function disableAI() {
    localStorage.setItem('labcharts-ai-paused', 'true');
  }
  function enableAI() {
    localStorage.removeItem('labcharts-ai-paused');
    localStorage.setItem('labcharts-ai-provider', 'ollama'); // optimistic-true
  }

  // ─── 1. Fingerprint ─────────────────────────────────────────────────
  console.log('%c 1. Fingerprint stability ', 'font-weight:bold;color:#f59e0b');

  reset();
  const a = makeSess();
  const fp1 = getSessionFingerprint(a);
  const fp2 = getSessionFingerprint(makeSess({ id: 'sun_other', startedAt: a.startedAt - 10000 })); // id+start differ but same body/dose
  assert('fingerprint stable across id/startedAt change',
    fp1 === fp2,
    `${fp1} vs ${fp2}`);

  // 25.04 → Math.round(250.4) = 250 → 25.0, same bucket as 25
  const fp3 = getSessionFingerprint(makeSess({ durationMin: 25.04 }));
  assert('fingerprint quantizes durationMin to 0.1 (jitter under bucket)',
    fp3 === fp1,
    `${fp3} vs ${fp1}`);

  const fp4 = getSessionFingerprint(makeSess({ doses: { ...a.doses, vitamin_d: 5000 } }));
  assert('fingerprint changes when vitamin_d dose changes',
    fp4 !== fp1, `${fp4} vs ${fp1}`);

  const fp5 = getSessionFingerprint(makeSess({ safety: { medFraction: 0.99, fitzpatrick: 'III' } }));
  assert('fingerprint changes when MED fraction changes',
    fp5 !== fp1);

  const fp6 = getSessionFingerprint(makeSess({ bodyExposure: { ...a.bodyExposure, glassBetween: true } }));
  assert('fingerprint changes when glassBetween toggles',
    fp6 !== fp1);

  const fp7 = getSessionFingerprint(makeSess({ atmosphere: { ...a.atmosphere, uvIndex: 6.21 } }));
  assert('fingerprint quantizes uvIndex to 0.1',
    fp7 === fp1);

  // ─── 1b. Solar-phase classification ─────────────────────────────────
  console.log('%c 1b. Solar phase context ', 'font-weight:bold;color:#f59e0b');

  // Build a sunrise-session fixture: startedAt below horizon, endedAt above.
  // Need a real location so window.solarZenithAngle resolves; the test harness
  // loads sun-spectrum.js which exports it on window.
  reset({ sunDefaults: { fitzpatrick: 'III' } });
  // 2026-04-15 06:30 UTC at lat=50, lon=14 — elevation around -3° at 06:30,
  // climbing past 0° by 07:00 (sunrise crossing). Numbers are illustrative;
  // assertion just checks the phase line is emitted.
  const sunrise = makeSess({
    startedAt: Date.parse('2026-04-15T04:25:00Z'),  // local ~06:25 in CEST
    endedAt:   Date.parse('2026-04-15T05:10:00Z'),
    durationMin: 45,
    location: { lat: 50.08, lon: 14.42, altitudeM: 250 },
    atmosphere: { uvIndex: 0.3, ozoneDU: 320, cloudCover: 10 },
    safety: { medFraction: 0.02, fitzpatrick: 'III' },
    eyeExposure: { mode: 'direct', lensTint: 'clear', durationSec: 2700 },
  });
  const sunriseCtx = buildSingleSessionContext(sunrise);
  assert('sunrise context emits "Solar elevation:" line',
    /Solar elevation:.*°.*at start.*→.*°.*at end/.test(sunriseCtx),
    sunriseCtx);
  assert('sunrise context emits "Solar phase:" line',
    /Solar phase:/.test(sunriseCtx),
    sunriseCtx);

  const noon = makeSess({
    startedAt: Date.parse('2026-04-15T11:30:00Z'),
    endedAt:   Date.parse('2026-04-15T12:00:00Z'),
    location: { lat: 50.08, lon: 14.42, altitudeM: 250 },
    atmosphere: { uvIndex: 6, ozoneDU: 320, cloudCover: 0 },
  });
  const noonCtx = buildSingleSessionContext(noon);
  assert('midday context still includes Solar phase line',
    /Solar phase:/.test(noonCtx),
    noonCtx);
  assert('midday context does NOT mention sunrise/UVA-onset',
    !/sunrise|UVA-onset|civil dawn/i.test(noonCtx.split('Solar phase:')[1]?.split('\n')[0] || ''),
    noonCtx);

  // ─── 2. Context builder ─────────────────────────────────────────────
  console.log('%c 2. Single-session context ', 'font-weight:bold;color:#f59e0b');

  reset({
    sunDefaults: { fitzpatrick: 'II', dailyVitDTargetIU: 4000 },
    healthGoals: { goals: 'Restore vit-D status, reduce winter SAD' },
    lightCircadian: { skinType: 'II — fair' },
  });
  const ctx = buildSingleSessionContext(makeSess());
  assert('context is non-empty', ctx.length > 100, `len=${ctx.length}`);
  assert('context includes Session header', ctx.includes('### Session'));
  assert('context includes User profile section', ctx.includes('### User profile'));
  assert('context references skin type', /Fitzpatrick II/i.test(ctx));
  assert('context references vit-D target', ctx.includes('4000 IU'));
  // Doses go through formatChannelUnit (real-world units, IU/J·cm²/M-EDI lux)
  // Earlier code passed raw "channelAu" labelled as IU — caused a ~37×
  // under-report. Now matches modal display.
  assert('context emits "Doses (as displayed to user):" preamble',
    ctx.includes('Doses (as displayed to user):'));
  assert('context references human-formatted vit-D (IU output)',
    /Vitamin D:.*IU/i.test(ctx) || /Vitamin D:.*minimal/i.test(ctx) || /Vitamin D:.*below UVI/i.test(ctx),
    ctx);
  assert('context references MED %', ctx.includes('Burn dose: 42%'));
  assert('context references body fraction', ctx.includes('45%'));
  assert('context references UV index', ctx.includes('UV index: 6.2'));
  assert('context references health goals', ctx.includes('Restore vit-D status'));

  // 7-day rollup with prior sessions. Anchor prior endedAt to REF_START
  // so the rollup window is deterministic regardless of when the test
  // runs.
  reset({
    sunDefaults: { fitzpatrick: 'III' },
    sunSessions: [
      makeSess({ id: 'p1', endedAt: REF_START - 2 * 86400000, durationMin: 18, doses: { vitamin_d: 1500, circadian: 20000 } }),
      makeSess({ id: 'p2', endedAt: REF_START - 4 * 86400000, durationMin: 30, doses: { vitamin_d: 4500, circadian: 40000 } }),
    ],
  });
  const ctx2 = buildSingleSessionContext(makeSess({ id: 'current' }));
  assert('rollup section appears with prior sessions', ctx2.includes('### Last 7 days'));
  // Cumulative IU is now computed via window.vitaminDIU on each session,
  // not by summing raw channelAu values. Just assert the line exists with
  // a non-zero IU number — the exact value depends on the spectrum model.
  assert('rollup line includes a numeric Vit-D total in IU',
    /Vit-D total: ~\d+ IU/.test(ctx2),
    ctx2);

  // ─── 3. Inline render — gating + states ─────────────────────────────
  console.log('%c 3. Inline render states ', 'font-weight:bold;color:#f59e0b');

  reset();
  disableAI();
  const inlineNoProvider = renderSessionAIInline(makeSess());
  assert('inline render returns "" without AI provider',
    inlineNoProvider === '', JSON.stringify(inlineNoProvider).slice(0, 60));

  enableAI();
  const inlineNoAnalysis = renderSessionAIInline(makeSess());
  assert('inline render shows idle "Analyze" CTA when never analyzed',
    inlineNoAnalysis.includes('sun-session-ai-idle') && inlineNoAnalysis.includes('Analyze this session'),
    inlineNoAnalysis.slice(0, 200));
  assert('inline idle render does NOT show shimmer (would mislead user)',
    !inlineNoAnalysis.includes('shimmer'));

  // Orphaned legacy state: a row with `status: 'analyzing'` from a
  // pre-fix run that died mid-flight. The new render must recover by
  // treating it as idle, NOT as a perpetual shimmer.
  const inlineOrphaned = renderSessionAIInline(makeSess({
    aiAnalysis: { status: 'analyzing', fingerprint: 'x' },
  }));
  assert('inline render recovers orphaned legacy "analyzing" status to idle',
    inlineOrphaned.includes('sun-session-ai-idle') && !inlineOrphaned.includes('shimmer'),
    inlineOrphaned.slice(0, 200));

  const inlineGreen = renderSessionAIInline(makeSess({
    aiAnalysis: { dot: 'green', tip: 'Solid 25-min midday hit, 42% MED.', detail: '...', status: 'ok', fingerprint: 'x', generatedAt: Date.now() },
  }));
  assert('inline render emits green dot when status ok', inlineGreen.includes('sun-session-ai-dot-green'));
  assert('inline render emits tip text escaped',
    inlineGreen.includes('Solid 25-min midday hit, 42% MED.'),
    inlineGreen);
  assert('inline render includes refresh button', inlineGreen.includes('refreshSessionAIAnalysis'));

  const inlineRed = renderSessionAIInline(makeSess({
    aiAnalysis: { dot: 'red', tip: 'Over MED at 105%.', status: 'ok', fingerprint: 'x', generatedAt: Date.now() },
  }));
  assert('inline render emits red dot for red verdict', inlineRed.includes('sun-session-ai-dot-red'));

  const inlineErr = renderSessionAIInline(makeSess({
    aiAnalysis: { status: 'error', fingerprint: 'x', errorMessage: 'Analysis timed out after 60s' },
  }));
  assert('inline render shows error message', inlineErr.includes('Analysis failed'));
  assert('inline render surfaces errorMessage detail', inlineErr.includes('timed out after 60s'));

  // active session (no endedAt) → no AI line
  const inlineActive = renderSessionAIInline(makeSess({ endedAt: null }));
  assert('inline render returns "" for active (no endedAt) session',
    inlineActive === '');

  // Verify XSS escaping
  const inlineXSS = renderSessionAIInline(makeSess({
    aiAnalysis: { dot: 'green', tip: '<img src=x onerror=alert(1)>', status: 'ok', fingerprint: 'x' },
  }));
  assert('inline render escapes tip HTML', !inlineXSS.includes('<img src=x'),
    'rendered: ' + inlineXSS.slice(0, 200));
  assert('inline render keeps escaped form',
    inlineXSS.includes('&lt;img'),
    inlineXSS.slice(0, 200));

  // ─── 4. Detail render — gating + states ─────────────────────────────
  console.log('%c 4. Detail render states ', 'font-weight:bold;color:#f59e0b');

  disableAI();
  assert('detail render returns "" without AI provider',
    renderSessionAIDetail(makeSess()) === '');

  enableAI();
  const detailIdle = renderSessionAIDetail(makeSess());
  assert('detail render shows idle CTA when uncached',
    detailIdle.includes('sun-detail-ai-idle') && detailIdle.includes('Analyze now'));

  // Same orphaned-legacy recovery as the inline path.
  const detailOrphaned = renderSessionAIDetail(makeSess({
    aiAnalysis: { status: 'analyzing', fingerprint: 'x' },
  }));
  assert('detail render recovers orphaned legacy "analyzing" to idle',
    detailOrphaned.includes('sun-detail-ai-idle') && !detailOrphaned.includes('sun-detail-ai-loading'));

  const detailGreen = renderSessionAIDetail(makeSess({
    aiAnalysis: { dot: 'green', tip: 'Quick verdict', detail: 'A two-sentence detail explaining the why.', status: 'ok', fingerprint: 'x' },
  }));
  assert('detail render emits sun-detail-ai-green class', detailGreen.includes('sun-detail-ai-green'));
  assert('detail render shows tip in head', detailGreen.includes('Quick verdict'));
  assert('detail render shows detail in body', detailGreen.includes('two-sentence detail'));

  // ─── 5. Gating: maybeAnalyzeSessionAfterFinish ──────────────────────
  console.log('%c 5. Auto-analyze gating ', 'font-weight:bold;color:#f59e0b');

  // No-op without endedAt
  let crashed = false;
  try { maybeAnalyzeSessionAfterFinish({ id: 'x' }); } catch (e) { crashed = true; }
  assert('maybeAnalyze noops on session without endedAt', !crashed);

  // No-op with AI paused
  disableAI();
  try { maybeAnalyzeSessionAfterFinish(makeSess()); } catch (e) { crashed = true; }
  assert('maybeAnalyze noops with AI paused', !crashed);

  // ─── 6. refresh path — exercise getTarget / canAnalyze / setAIAnalysis ───
  // The engine adapters wired into createAIVerdict (getTarget, canAnalyze,
  // setAIAnalysis) only fire on the analyze() path. maybeAnalyze short-
  // circuits at hasAIProvider() before reaching them; refresh(id) with a
  // real provider + stubbed fetch flows all the way through to the catch
  // block, which invokes setAIAnalysis with an error sidecar.
  console.log('%c 6. refresh adapter coverage ', 'font-weight:bold;color:#f59e0b');

  enableAI();
  const sess = makeSess({ id: 'sun_refresh_target' });
  reset({ sunSessions: [sess] });
  const origFetch = window.fetch;
  window.fetch = () => Promise.reject(new Error('test stub: provider unreachable'));
  try { await refreshSessionAIAnalysis('sun_refresh_target'); } catch (_) {}
  window.fetch = origFetch;
  const after = window._labState.importedData.sunSessions.find(s => s.id === 'sun_refresh_target');
  assert('refresh resolved id via getTarget (target intact)', !!after);
  assert('refresh reached setAIAnalysis via catch (error sidecar written)',
    !!after?.aiAnalysis && (after.aiAnalysis.status === 'error' || !!after.aiAnalysis.lastErrorMessage),
    JSON.stringify(after?.aiAnalysis || null).slice(0, 200));

  let nullRefreshThrew = false;
  try { await refreshSessionAIAnalysis('not-a-session'); }
  catch (_) { nullRefreshThrew = true; }
  assert('refresh on missing id returns cleanly (no throw)', !nullRefreshThrew);

  // Cleanup
  if (origProvider != null) localStorage.setItem('labcharts-ai-provider', origProvider);
  else localStorage.removeItem('labcharts-ai-provider');
  if (origPaused != null) localStorage.setItem('labcharts-ai-paused', origPaused);
  else localStorage.removeItem('labcharts-ai-paused');
  window._labState.importedData = origImported;

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
