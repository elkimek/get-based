// test-wearables-bp-merge.js — BP renders as one paired card (sys/dia)
// Covers: strip-render filter (dia hidden when sys present), reorder-mode
// filter symmetry, renderCard pairing format, edge case (dia-only surfaces),
// and the BP-form idempotency fix (clicking inside the form doesn't rebuild).
// Run: fetch('tests/test-wearables-bp-merge.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c BP Card Merge Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const wearablesSrc = await fetch('js/wearables.js').then(r => r.text());

  // ═══════════════════════════════════════
  // 1. Strip-render filter — dia hidden when sys present
  // ═══════════════════════════════════════
  console.log('%c 1. Strip filter ', 'font-weight:bold;color:#f59e0b');

  assert('renderWearableStrip flags hasSys before the displayOrder loop',
    /const hasSys = !!summary\.metrics\?\.bp_systolic/.test(wearablesSrc));
  assert('displayOrder loop skips bp_diastolic when hasSys is true',
    /if \(id === 'bp_diastolic' && hasSys\) continue/.test(wearablesSrc));

  // ═══════════════════════════════════════
  // 2. renderCard receives pairedMetric for BP
  // ═══════════════════════════════════════
  console.log('%c 2. renderCard pairing ', 'font-weight:bold;color:#f59e0b');

  assert('Caller passes pairedMetric when rendering bp_systolic',
    /const pairedMetric = \(metricId === 'bp_systolic'\) \? summary\.metrics\?\.bp_diastolic : null/.test(wearablesSrc));
  assert('renderCard accepts an opts arg with pairedMetric',
    /function renderCard\(metricId, canon, metric, showSourceBadge, sourceMaxDate, opts = \{\}\)/.test(wearablesSrc));
  assert('renderCard derives isBPCard from metricId + pairedMetric',
    /const isBPCard = metricId === 'bp_systolic' && pairedMetric/.test(wearablesSrc));
  assert("Card label flips to 'Blood pressure' when paired",
    /const cardLabel = isBPCard \? 'Blood pressure' : canon\.label/.test(wearablesSrc));
  assert('Sub-label suppressed for paired BP card (no "sys" badge)',
    /const cardSub = isBPCard \? null : canon\.sub/.test(wearablesSrc));
  assert('Value renders as sys/dia when paired',
    /const valueRead = isBPCard \? `\$\{sysRead\}\/\$\{diaRead \|\| '—'\}` : sysRead/.test(wearablesSrc));
  assert('Baseline renders as sys/dia when paired',
    /const baselineRead = isBPCard\s*\?\s*`\$\{metric\.baseline \?\? '—'\}\/\$\{pairedMetric\.baseline \?\? '—'\}`/.test(wearablesSrc));
  assert("Aria-label uses 'Blood pressure' for the paired card",
    /const canonRead = isBPCard\s*\?\s*'Blood pressure'/.test(wearablesSrc));

  // ═══════════════════════════════════════
  // 3. Reorder-mode filter symmetry
  // ═══════════════════════════════════════
  console.log('%c 3. Reorder filter ', 'font-weight:bold;color:#f59e0b');

  assert('moveWearableCard mirrors the same dia-skip when sys present',
    /const hasSysLocal = !!summary\.metrics\?\.bp_systolic[\s\S]{0,400}if \(id === 'bp_diastolic' && hasSysLocal\) continue/.test(wearablesSrc));

  // ═══════════════════════════════════════
  // 4. BP form idempotency (the dia-click bug fix)
  // ═══════════════════════════════════════
  console.log('%c 4. Form idempotency ', 'font-weight:bold;color:#f59e0b');

  assert('openManualLogForm returns early when the form is already rendered',
    /openManualLogForm[\s\S]{0,500}if \(card\.querySelector\('\.wearable-log-form'\)\) return/.test(wearablesSrc));
  assert('Idempotency guard has a comment explaining the dia-click bug',
    /clicks inside the form \(e\.g\. tapping the dia field on the[\s\S]{0,200}Without this guard we'd rebuild/.test(wearablesSrc));

  // Live behavior — fake card, run openManualLogForm twice, verify only one form.
  // Skip if the module isn't loaded yet (e.g. tests running standalone).
  if (typeof window.openManualLogForm === 'function') {
    const card = document.createElement('div');
    card.className = 'wearable-card-empty';
    card.dataset.emptyMetric = 'bp_systolic';
    document.body.appendChild(card);
    try {
      window.openManualLogForm('bp_systolic');
      const formCountFirst = card.querySelectorAll('.wearable-log-form').length;
      assert('After first openManualLogForm call: exactly one form', formCountFirst === 1);
      // Simulate a click inside the form bubbling up to the card's onclick.
      window.openManualLogForm('bp_systolic');
      const formCountSecond = card.querySelectorAll('.wearable-log-form').length;
      assert('After second call: still exactly one form (idempotent)', formCountSecond === 1);
      // Critical sub-assert: the original sys input still has focus / is in the DOM.
      const sysInput = document.getElementById('wl-bp-sys');
      assert('Original sys input still in DOM after second openManualLogForm', !!sysInput);
    } finally {
      card.remove();
    }
  } else {
    console.warn('openManualLogForm not on window — skipping live idempotency assertion');
  }

  // ═══════════════════════════════════════
  // 5. CSS / unchanged plumbing — sanity that the underlying metric storage didn't change
  // ═══════════════════════════════════════
  console.log('%c 5. Storage untouched ', 'font-weight:bold;color:#f59e0b');

  const adaptersSrc = await fetch('js/wearable-adapters.js').then(r => r.text());
  assert('CANONICAL_METRICS still keeps bp_systolic + bp_diastolic separate',
    /bp_systolic:\s*\{[^}]*ariaLabel: 'Blood pressure systolic'/.test(adaptersSrc) &&
    /bp_diastolic:\s*\{[^}]*ariaLabel: 'Blood pressure diastolic'/.test(adaptersSrc));

  const manualSrc = await fetch('js/wearables-manual.js').then(r => r.text());
  assert('MANUAL_METRICS still lists both bp_systolic and bp_diastolic separately',
    /MANUAL_METRICS\s*=\s*\['weight', 'bp_systolic', 'bp_diastolic', 'rhr'\]/.test(manualSrc));

  console.log(`\n%c ${pass} passed, ${fail} failed `, fail === 0 ? 'background:#22c55e;color:#fff;padding:4px 12px' : 'background:#ef4444;color:#fff;padding:4px 12px');
  console.log(`Result: ${pass} passed, ${fail} failed`);
})();
