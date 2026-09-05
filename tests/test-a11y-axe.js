// test-a11y-axe.js — Runtime accessibility scan via axe-core 4.13.
//
// Complements test-a11y-phase3.js, which asserts that specific aria-*
// attributes appear in the source. This file renders selected core pages,
// settings tabs, and modals, then runs axe.run() against the live DOM, catching the
// long tail no source-grep can see: contrast ratios, focus order,
// landmark structure, mislabeled custom widgets.
//
// Severity policy (matches axe-core's `impact` field):
//   • critical / serious   → test FAILS
//   • moderate / minor     → logged as info, doesn't fail (too easy to
//                             over-block on rules where axe is opinionated)
//
// axe-core is injected from the pinned local dev dependency. If that runtime
// is missing or mismatched, the test fails instead of silently skipping.
//
// State pollution: this test runs DURING a session where many other tests
// have left arbitrary state. We snapshot the importedData reference up
// front and restore it in `finally` so downstream tests see what they
// expected — earlier draft of this file crashed mid-flight and left the
// profile pointed at a half-initialised demo, which broke test-supplements
// and the catalog probe further down the queue.

return (async () => {
  let pass = 0, fail = 0, info = 0;
  const assert = (name, cond, detail) => {
    if (cond) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  };
  const note = (msg) => { info++; console.log(`%c INFO %c ${msg}`, 'background:#0ea5e9;color:#fff;padding:2px 6px;border-radius:3px', ''); };

  console.log('%c A11y (axe-core) ', 'background:#7c3aed;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const { state } = await import('/js/state.js');
  const { loadDemoData } = await import('/js/export.js');
  const viewsModule = await import('/js/views.js');
  const settingsModule = await (await import('/js/settings-loader.js')).loadSettingsModule();
  // Capture full state shape so we can restore even if we mutate
  // currentProfile / importedData / markerRegistry / etc along the way.
  const snapshot = {
    currentProfile: state.currentProfile,
    importedData: state.importedData,
    currentView: state.currentView,
    markerRegistry: state.markerRegistry,
  };

  try {
    // ── 1. Verify the locally injected axe-core runtime ─────────────────
    // Pinned version. The baseline file's `_axeVersion` field is asserted
    // against this string below — a mismatched bump (e.g. 4.11) would
    // surface a rule rename as a false regression. If you bump axe, also
    // bump _axeVersion in tests/.a11y-baseline.json.
    const PINNED_AXE_VERSION = '4.13.0';
    if (typeof window.axe?.run !== 'function') {
      throw new Error('local axe-core failed to expose axe.run');
    }
    if (window.axe.version !== PINNED_AXE_VERSION) {
      throw new Error(
        `local axe-core version ${window.axe.version || 'unknown'} does not match pinned ${PINNED_AXE_VERSION}`,
      );
    }
    assert(`local axe-core ${PINNED_AXE_VERSION} loaded`, true);

    // ── 2. Demo data ────────────────────────────────────────────────────
    // Only load if the dashboard would otherwise be empty. loadDemoData is
    // async + side-effecty (creates a profile, switches to it); we wait
    // longer than feels necessary because subsequent renderViews assume
    // markerRegistry has been populated by buildSidebar.
    if (!state.importedData?.entries?.length) {
      try { await loadDemoData('male'); } catch (e) { assert('demo data loaded', false, e.message); }
      await new Promise(r => setTimeout(r, 3000));
    }
    if (!state.markerRegistry || Object.keys(state.markerRegistry).length === 0) {
      note('markerRegistry empty after demo load — some scans may render placeholders');
    }

    // ── 3. Helpers ──────────────────────────────────────────────────────
    const allViolations = new Map();
    async function safeNav(view) {
      try { await viewsModule.navigate(view); } catch (e) { assert(`navigate(${view})`, false, e.message); }
      await new Promise(r => setTimeout(r, 700));
    }
    function clearTransientUi() {
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
    }
    async function scan(stopName) {
      clearTransientUi();
      let result;
      try {
        result = await window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        });
      } catch (e) {
        assert(`scan "${stopName}" completed`, false, e.message);
        return;
      }
      const cnt = result.violations.length;
      note(`scan "${stopName}" — ${cnt} violation rule${cnt === 1 ? '' : 's'}, ${result.passes.length} passing`);
      for (const v of result.violations) {
        const prev = allViolations.get(v.id) || { impact: v.impact, help: v.help, helpUrl: v.helpUrl, nodes: [] };
        for (const n of v.nodes) {
          prev.nodes.push({ stop: stopName, target: n.target.join(' '), html: n.html.slice(0, 200) });
        }
        allViolations.set(v.id, prev);
      }
    }
    async function safeOp(label, fn) {
      try { await fn(); } catch (e) { assert(label, false, e.message); }
    }

    // ── 4. Scan stops — every step defensive so one failure doesn't ────
    // poison the rest. All transitions wrapped in safeOp / safeNav.
    await safeNav('dashboard');
    await scan('dashboard');

    await safeNav('sun');
    await scan('light-sun');

    await safeNav('correlations');
    await scan('correlations');

    await safeNav('compare');
    await scan('compare-dates');

    // Detail modal
    await safeNav('dashboard');
    await safeOp('open detail modal', async () => {
      if (typeof viewsModule.showDetailModal === 'function') {
        viewsModule.showDetailModal('hormones_insulin');
        await new Promise(r => setTimeout(r, 600));
      }
    });
    await scan('detail-modal');
    await safeOp('close detail modal', () => viewsModule.closeModal());

    // Use the production module entry point; the legacy window helper no
    // longer exists. A missing panel must not silently scan the page behind it.
    await safeOp('open settings', async () => {
      await settingsModule.openSettingsModal('display');
      await new Promise(r => setTimeout(r, 400));
    });
    for (const tab of ['display', 'ai', 'voice', 'privacy', 'data', 'wearables', 'agent']) {
      await safeOp(`switch to settings/${tab}`, async () => {
        await settingsModule.switchSettingsTab(tab);
        await new Promise(r => setTimeout(r, 250));
      });
      assert(`settings/${tab} is actually open`, Boolean(document.querySelector(
        `#settings-modal-overlay.show [data-tab-panel="${tab}"].active`,
      )));
      await scan(`settings-${tab}`);
    }
    await safeOp('close settings', () => settingsModule.closeSettingsModal());

    // EMF assessment editor
    await safeOp('open EMF editor', async () => {
      const { openEMFAssessmentEditor } = await import('/js/emf-runtime.js');
      await openEMFAssessmentEditor();
      await new Promise(r => setTimeout(r, 400));
    });
    await scan('emf-editor');
    await safeOp('close EMF editor', () => viewsModule.closeModal());

    // ── 5. Report aggregated violations ────────────────────────────────
    const byImpact = { critical: [], serious: [], moderate: [], minor: [], unknown: [] };
    for (const [id, v] of allViolations) {
      (byImpact[v.impact] || byImpact.unknown).push({ id, ...v });
    }
    // Surface findings via "▶ " prefix — the Playwright wrapper
    // only relays console.log lines that start with U+25B6, contain
    // "passed"/"Results", or look like FAIL. Without the prefix our %c-styled
    // headers get swallowed and the test fails with no actionable detail.
    for (const impact of ['critical', 'serious', 'moderate', 'minor']) {
      const rules = byImpact[impact];
      if (!rules.length) continue;
      const total = rules.reduce((s, r) => s + r.nodes.length, 0);
      console.log(`▶ [a11y/${impact}] ${rules.length} rule${rules.length === 1 ? '' : 's'}, ${total} node${total === 1 ? '' : 's'}`);
      for (const r of rules) {
        console.log(`▶   [${r.id}] ${r.help} (${r.nodes.length})`);
        for (const n of r.nodes.slice(0, 20)) console.log(`▶     at "${n.stop}": ${n.target}`);
        if (r.nodes.length > 20) console.log(`▶     ... ${r.nodes.length - 20} more`);
        console.log(`▶     docs: ${r.helpUrl}`);
      }
    }

    // ── 6. Baseline-relative gate ──────────────────────────────────────
    // Real-world a11y gating is "no regression from current state", not
    // "zero violations" — the latter blocks every PR forever the first time
    // a codebase adopts axe. We persist a baseline under data-*; tests pass
    // when current ≤ baseline per rule. New rules with non-zero counts ARE
    // a regression (the suite never saw them before). Refresh the baseline
    // intentionally via A11Y_REBASELINE=1, e.g. after a wave of fixes.
    //
    // Storage: window.localStorage isn't a fit (the page can clear it). We
    // stash JSON under document.body's data-a11y-baseline attribute via a
    // fetch+POST is overkill for a test runner. Simplest reliable channel:
    // fetch a static file from the dev server. The dev-server already
    // serves /tests/.a11y-baseline.json if it exists; missing-file → 404
    // is treated as "no baseline yet, write one".
    const BASELINE_URL = '/tests/.a11y-baseline.json';
    let baseline = null;
    try {
      const r = await fetch(BASELINE_URL, { cache: 'no-store' });
      if (r.ok) baseline = await r.json();
    } catch (_) {}
    // A missing or mismatched version can make the count comparison
    // misleading. Explicit rebaseline mode may repair old metadata.
    if (baseline && !window.A11Y_REBASELINE
        && baseline._axeVersion !== window.axe.version) {
      throw new Error(
        `accessibility baseline pins axe ${baseline._axeVersion || 'missing'}; runtime is ${window.axe.version}`,
      );
    }

    const current = { critical: {}, serious: {}, moderate: {}, minor: {} };
    for (const impact of Object.keys(current)) {
      for (const rule of byImpact[impact] || []) current[impact][rule.id] = rule.nodes.length;
    }

    // First run / explicit rebaseline: stash current counts to a global
    // window var. The test runner doesn't have a write channel to disk by
    // default, so we surface the JSON in a "▶ ..." log line that the user
    // can pipe into the file by hand. CI sets A11Y_REBASELINE=1 only on
    // intentional baseline refresh.
    if (!baseline || window.A11Y_REBASELINE) {
      const generatedBaseline = { _axeVersion: PINNED_AXE_VERSION, ...current };
      console.log('▶ [a11y/baseline] No baseline file found OR A11Y_REBASELINE=1.');
      console.log('▶ [a11y/baseline] Write this JSON to tests/.a11y-baseline.json to lock the gate:');
      console.log('▶ ' + JSON.stringify(generatedBaseline));
      assert('a11y baseline established (no regression check possible on first run)', true);
      return generatedBaseline;
    }

    // Regression check: per impact tier, per rule, current must be ≤ baseline.
    // New rules in `current` that aren't in `baseline` count as regressions.
    let regressions = 0, improvements = 0;
    for (const impact of ['critical', 'serious', 'moderate', 'minor']) {
      const cur = current[impact] || {};
      const base = baseline[impact] || {};
      for (const rule of new Set([...Object.keys(cur), ...Object.keys(base)])) {
        const c = cur[rule] || 0, b = base[rule] || 0;
        if (c > b) {
          console.log(`▶ [a11y/regress] ${impact}/${rule}: ${b} → ${c} (+${c - b})`);
          regressions += (c - b);
        } else if (c < b) {
          console.log(`▶ [a11y/improve] ${impact}/${rule}: ${b} → ${c} (-${b - c}) ✓`);
          improvements += (b - c);
        }
      }
    }

    // We block ONLY on critical or serious regressions. Moderate/minor
    // changes get logged but don't fail — too easy to over-block on axe's
    // opinion-grade rules during routine UI work.
    let blockingRegress = 0;
    for (const impact of ['critical', 'serious']) {
      const cur = current[impact] || {}, base = baseline[impact] || {};
      for (const rule of Object.keys(cur)) {
        const delta = (cur[rule] || 0) - (base[rule] || 0);
        if (delta > 0) blockingRegress += delta;
      }
    }
    assert(
      `no critical/serious a11y regressions vs baseline (got +${blockingRegress})`,
      blockingRegress === 0,
      blockingRegress ? 'run with A11Y_REBASELINE=1 to refresh, or fix the regressions above' : null);
    if (improvements > 0) {
      note(`${improvements} a11y issue${improvements === 1 ? '' : 's'} resolved vs baseline — consider refreshing with A11Y_REBASELINE=1`);
    }

  } finally {
    // Always restore state so downstream tests aren't poisoned.
    if (snapshot.currentProfile) state.currentProfile = snapshot.currentProfile;
    if (snapshot.importedData) state.importedData = snapshot.importedData;
    if (snapshot.currentView) state.currentView = snapshot.currentView;
    if (snapshot.markerRegistry) state.markerRegistry = snapshot.markerRegistry;
    // Close any overlay we may have left open so the next test starts clean.
    try { viewsModule.closeModal(); } catch (_) {}
    // Re-navigate to dashboard so the DOM matches state.currentView.
    try { viewsModule.navigate('dashboard'); } catch (_) {}
  }

  console.log(`\n%c Axe Result: ${pass} passed, ${fail} failed, ${info} info `,
    `background:${fail ? '#ef4444' : '#22c55e'};color:#fff;font-size:13px;padding:3px 10px;border-radius:3px`);
})();
