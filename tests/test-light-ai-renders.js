#!/usr/bin/env node
// test-light-ai-renders.js — smoke coverage for the 9 feature-specific
// AI modules. Engine-level contract is covered by test-ai-verdict-engine.js;
// this file verifies the consumer render functions.
//
// Run: node tests/test-light-ai-renders.js  (or via npm test)

import './_node-shim.js';

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Light AI Render Smoke Tests ===\n');

await import('../js/state.js');
  const origImported = window._labState.importedData;
  const origProvider = localStorage.getItem('labcharts-ai-provider');
  const origPaused = localStorage.getItem('labcharts-ai-paused');

  function withProvider() {
    localStorage.removeItem('labcharts-ai-paused');
    localStorage.setItem('labcharts-ai-provider', 'ollama');
  }
  function withoutProvider() {
    localStorage.setItem('labcharts-ai-paused', 'true');
  }
  function reset(seed = {}) {
    window._labState.importedData = Object.assign({
      entries: [],
      sunSessions: [],
      deviceSessions: [],
      lightDevices: [],
      lightMeasurements: [],
      lightEnvironment: { rooms: [], screens: [] },
      lightAudits: [],
      sunDefaults: { fitzpatrick: 'III' },
    }, seed);
  }

  const okVerdict = (dot = 'green') => ({
    dot, tip: 'tip-text', detail: 'detail-text',
    fingerprint: 'fp', status: 'ok', generatedAt: Date.now(),
  });
  const xssVerdict = () => ({
    dot: 'green',
    tip: '<img src=x onerror=alert(1)>',
    detail: '<script>alert(2)</script>',
    fingerprint: 'fp', status: 'ok', generatedAt: Date.now(),
  });

  // ─── 1. Light Devices session ──────────────────────────────────────
  console.log('%c 1. Device session render ', 'font-weight:bold;color:#0ea5e9');
  {
    const mod = await import('../js/light-device-ai-analysis.js');
    const sess = { id: 's1', endedAt: Date.now() - 60000, durationMin: 20, doses: { vitamin_d: 0 } };

    withoutProvider();
    assert('device inline returns "" without provider',
      mod.renderDeviceSessionAIInline(sess) === '');

    withProvider();
    const idle = mod.renderDeviceSessionAIInline(sess);
    assert('device inline renders idle CTA when no aiAnalysis',
      idle.includes('sun-session-ai-idle') && idle.includes('Analyze this session'));

    sess.aiAnalysis = okVerdict('green');
    const ok = mod.renderDeviceSessionAIInline(sess);
    assert('device inline renders green dot when status=ok',
      ok.includes('sun-session-ai-dot-green') && ok.includes('tip-text'));

    sess.aiAnalysis = xssVerdict();
    const xssRender = mod.renderDeviceSessionAIInline(sess);
    assert('device inline escapes XSS in tip',
      xssRender.includes('&lt;img') && !xssRender.includes('<img src=x'));

    sess.aiAnalysis = { status: 'analyzing', fingerprint: 'old' };
    const orphaned = mod.renderDeviceSessionAIInline(sess);
    assert('device inline recovers orphaned analyzing → idle',
      orphaned.includes('sun-session-ai-idle'));
  }

  // ─── 2. Light Tools measurement ────────────────────────────────────
  console.log('%c 2. Tool measurement render ', 'font-weight:bold;color:#0ea5e9');
  {
    const mod = await import('../js/light-tools-ai-analysis.js');
    const m = { id: 'm1', tool: 'lux', value: 350, capturedAt: Date.now(), confidence: 0.7 };

    withoutProvider();
    assert('measurement render returns "" without provider',
      mod.renderMeasurementAIInline(m) === '');

    withProvider();
    const idle = mod.renderMeasurementAIInline(m);
    assert('measurement render idle CTA says "Get AI verdict" (not "Interpret")',
      idle.includes('Get AI verdict') && !idle.includes('Interpret'));

    // Audit-aggregate row → returns '' (skipped by design)
    const auditMeas = { id: 'm2', tool: 'audit', value: 3 };
    assert('measurement render skips audit-aggregate row',
      mod.renderMeasurementAIInline(auditMeas) === '');

    m.aiAnalysis = okVerdict('yellow');
    const ok = mod.renderMeasurementAIInline(m);
    assert('measurement render shows yellow dot on ok',
      ok.includes('sun-session-ai-dot-yellow') && ok.includes('tip-text'));
  }

  // ─── 3. Light Env Room ─────────────────────────────────────────────
  console.log('%c 3. Room verdict render ', 'font-weight:bold;color:#0ea5e9');
  {
    const mod = await import('../js/light-env-ai-analysis.js');
    const r = { id: 'r1', name: 'Bedroom', primarySource: 'led-cool', hoursOccupiedPerDay: 8 };

    withoutProvider();
    assert('room block returns "" without provider',
      mod.renderRoomAIBlock(r) === '');

    withProvider();
    const idle = mod.renderRoomAIBlock(r);
    assert('room block renders compact idle AI read row',
      idle.includes('light-env-room-ai-idle') && idle.includes('AI read') && idle.includes('Analyze'));

    // Fingerprint must match the room's current shape — post-2026-05-08
    // renderRoomAIBlock detects stale verdicts and surfaces a shimmer
    // for re-analysis, so a placeholder 'fp' won't render the red dot.
    const realRoomFp = mod.getRoomFingerprint ? mod.getRoomFingerprint(r) : 'fp';
    r.aiAnalysis = { ...okVerdict('red'), fingerprint: realRoomFp };
    const ok = mod.renderRoomAIBlock(r);
    assert('room block renders red dot in compact AI read row',
      ok.includes('sun-session-ai-dot-red') && ok.includes('light-env-room-ai-red') && ok.includes('AI read'));

    // Verify _safeText bounds on prompt context (P0 prompt-injection fix).
    // _safeText collapses whitespace + caps length — it doesn't strip the
    // injected token text (which would be censorship and break legitimate
    // names like "Bedroom [Master]"). Instead it (a) prevents newline-
    // based prompt structure breakouts, (b) caps length so a 10kB pasted
    // name can't bloat the prompt budget.
    reset({
      lightEnvironment: {
        rooms: [{
          id: 'r-inj', name: 'Bedroom\n[INJECT]\n' + 'X'.repeat(200),
          primarySource: 'led-cool', hoursOccupiedPerDay: 8,
        }],
        screens: [],
      },
    });
    const ctx = mod.buildRoomContext(window._labState.importedData.lightEnvironment.rooms[0]);
    // Newlines collapsed to single spaces — no \n[INJECT]\n breakout
    assert('room context collapses newlines in user-supplied name',
      !ctx.includes('Bedroom\n[INJECT]'));
    // Length cap at 80 → 200-X tail is truncated, never lands as a 200-char run
    assert('room context truncates 200-X overrun to ≤80 chars',
      !ctx.includes('X'.repeat(100)));
  }

  // ─── 4. Light Today daily hero ─────────────────────────────────────
  console.log('%c 4. Daily hero render ', 'font-weight:bold;color:#0ea5e9');
  {
    const mod = await import('../js/light-today-ai.js');
    reset();

    withoutProvider();
    assert('hero returns "" without provider',
      mod.renderLightTodayHero() === '');

    withProvider();
    // No light activity yet → hero is still rendered but in idle CTA mode
    const idle = mod.renderLightTodayHero();
    assert('hero renders with "Today\'s light" header',
      idle.includes("Today's light"));

    // Add a session so auto-fire gating allows analysis. Use the REAL
    // current-day fingerprint on the cached verdict — post-2026-05-08
    // the renderers detect fingerprint mismatch and surface a shimmer
    // for re-analysis, so a placeholder 'fp' fingerprint would (correctly)
    // not render the green dot.
    reset({ sunSessions: [{ id: 'sx', endedAt: Date.now() - 60000, durationMin: 20 }] });
    const today = new Date().toISOString().slice(0, 10);
    const verdicts = window._labState.importedData.lightDailyVerdicts = {};
    const realFp = mod.getDayFingerprint
      ? mod.getDayFingerprint({ key: today, date: new Date(), isLightTodayTarget: true })
      : 'fp';
    verdicts[today] = { ...okVerdict('green'), fingerprint: realFp };
    const ok = mod.renderLightTodayHero();
    assert('hero renders green dot when verdict cached',
      ok.includes('sun-session-ai-dot-green'));

    // Dashboard chip
    const chip = mod.renderLightTodayDashboardChip();
    assert('dashboard chip renders with cached verdict',
      chip.includes('light-today-dash-ai') && chip.includes('tip-text'));
  }

  // ─── 5. Per-screen ─────────────────────────────────────────────────
  console.log('%c 5. Screen verdict render ', 'font-weight:bold;color:#0ea5e9');
  {
    const mod = await import('../js/light-screen-ai-analysis.js');
    reset();
    const s = { id: 'scr1', device: 'phone', hoursPerDay: 4, eveningUseAfterSunset: 2, blueBlockerEnabled: false };

    withoutProvider();
    assert('screen block returns "" without provider',
      mod.renderScreenAIBlock(s) === '');

    withProvider();
    const idle = mod.renderScreenAIBlock(s);
    assert('screen block renders "Analyze screen" CTA',
      idle.includes('Analyze screen'));

    // Match real fingerprint to bypass the post-2026-05-08 stale check.
    const realScreenFp = mod.getScreenFingerprint ? mod.getScreenFingerprint(s) : 'fp';
    s.aiAnalysis = { ...okVerdict('red'), fingerprint: realScreenFp };
    const ok = mod.renderScreenAIBlock(s);
    assert('screen block renders red dot for hostile pattern',
      ok.includes('sun-session-ai-dot-red'));
  }

  // ─── 6. Per-audit ──────────────────────────────────────────────────
  console.log('%c 6. Audit verdict render ', 'font-weight:bold;color:#0ea5e9');
  {
    const mod = await import('../js/light-audit-ai-analysis.js');
    const a = { id: 'a1', date: '2026-05-06', label: 'Test', rooms: [], screens: [], measurements: [] };

    withoutProvider();
    assert('audit block returns "" without provider',
      mod.renderAuditAIBlock(a) === '');

    withProvider();
    const idle = mod.renderAuditAIBlock(a);
    assert('audit block renders idle CTA',
      idle.includes('Analyze audit'));

    a.aiAnalysis = okVerdict('green');
    const ok = mod.renderAuditAIBlock(a);
    const dot = mod.renderAuditAIDot(a);
    assert('audit block renders verdict on ok',
      ok.includes('tip-text'));
    assert('audit dot returns colored dot for at-a-glance',
      dot.includes('sun-session-ai-dot-green') && dot.includes('light-audit-ai-dot'));

    // Audit dot returns '' when no aiAnalysis
    delete a.aiAnalysis;
    assert('audit dot returns "" when no verdict',
      mod.renderAuditAIDot(a) === '');
  }

  // ─── 7. Indoor-burden summary ──────────────────────────────────────
  console.log('%c 7. Burden verdict render ', 'font-weight:bold;color:#0ea5e9');
  {
    const mod = await import('../js/light-burden-ai-analysis.js');
    reset({
      lightEnvironment: { rooms: [{ id: 'r1', name: 'Office', hoursOccupiedPerDay: 8, primarySource: 'incandescent' }], screens: [] },
    });
    const burden = { interp: 'fallback heuristic text', tier: 1, color: 'orange' };

    withoutProvider();
    const noAi = mod.renderBurdenInterp(burden);
    assert('burden render falls back to heuristic without provider',
      noAi.includes('fallback heuristic text'));

    withProvider();
    const idle = mod.renderBurdenInterp(burden);
    assert('burden render shows CTA + heuristic when no AI verdict',
      idle.includes('Get AI verdict') && idle.includes('fallback heuristic text'));

    window._labState.importedData.lightEnvironment.burdenAI = okVerdict('yellow');
    // Fingerprint won't match (different by design), so the render
    // shows stale-CTA. Recompute fingerprint match by setting it
    // explicitly to whatever the module computes.
    const currentFp = mod.getBurdenFingerprint();
    window._labState.importedData.lightEnvironment.burdenAI.fingerprint = currentFp;
    const ok = mod.renderBurdenInterp(burden);
    assert('burden render shows yellow verdict on fingerprint match',
      ok.includes('sun-session-ai-dot-yellow') && ok.includes('tip-text'));
  }

  // ─── 8. Channel-mix synthesis ──────────────────────────────────────
  console.log('%c 8. Channel-mix render ', 'font-weight:bold;color:#0ea5e9');
  {
    const mod = await import('../js/light-channels-ai-analysis.js');
    reset();
    const fallback = '<div class="static-fallback">static suggestion</div>';

    withoutProvider();
    assert('channel-mix render returns fallback without provider',
      mod.renderChannelMixVerdict(fallback) === fallback);

    withProvider();
    const idle = mod.renderChannelMixVerdict(fallback);
    assert('channel-mix render shows CTA + fallback when no verdict',
      idle.includes('Get AI synthesis') && idle.includes('static-fallback'));

    window._labState.importedData.channelMixAI = okVerdict('green');
    const currentFp = mod.getChannelMixFingerprint();
    window._labState.importedData.channelMixAI.fingerprint = currentFp;
    const ok = mod.renderChannelMixVerdict(fallback);
    assert('channel-mix render shows verdict on fingerprint match',
      ok.includes('sun-session-ai-dot-green'));
  }

  // ─── 9. Onboarding plan ────────────────────────────────────────────
  console.log('%c 9. Onboarding render ', 'font-weight:bold;color:#0ea5e9');
  {
    const mod = await import('../js/sun-onboarding-ai.js');
    reset({ sunDefaults: { fitzpatrick: 'III', completedAt: Date.now() } });

    withoutProvider();
    assert('onboarding block returns "" without provider',
      mod.renderOnboardingAIBlock() === '');

    withProvider();
    const idle = mod.renderOnboardingAIBlock();
    assert('onboarding block renders idle CTA',
      idle.includes('Generate plan'));

    // Test the actions[] custom field via parseExtraFields
    window._labState.importedData.sunDefaults.aiAnalysis = Object.assign(okVerdict('yellow'), {
      actions: ['Walk outside within 10 min of waking', 'Avoid screens past 9 pm', 'Change bedroom bulb to incandescent'],
    });
    const ok = mod.renderOnboardingAIBlock();
    assert('onboarding render shows actions[] list',
      ok.includes('<ul class="light-setup-ai-actions">') && ok.includes('Walk outside'));

    // Skip rendering when setup not completed
    delete window._labState.importedData.sunDefaults.completedAt;
    delete window._labState.importedData.sunDefaults.aiAnalysis;
    assert('onboarding render returns "" when setup not completed',
      mod.renderOnboardingAIBlock() === '');
  }

  // Cleanup
  if (origProvider != null) localStorage.setItem('labcharts-ai-provider', origProvider);
  else localStorage.removeItem('labcharts-ai-provider');
  if (origPaused != null) localStorage.setItem('labcharts-ai-paused', origPaused);
  else localStorage.removeItem('labcharts-ai-paused');
  window._labState.importedData = origImported;

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
