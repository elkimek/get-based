// test-manual-entry-flow.js — manual-entry quality-of-life pass
// Covers: range sanity check, duplicate-date confirm, Save & Add Another,
// session-last-date, inline-edit Escape cancel flag, no-change short-circuit,
// navigate() rebuild after edit/revert, and the Add Value Manually placement
// (above Note section).
// Run: fetch('tests/test-manual-entry-flow.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Manual Entry Flow Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const viewsSrc = await fetch('js/views.js').then(r => r.text());

  // ═══════════════════════════════════════
  // 1. saveManualEntry is async (we await dialogs)
  // ═══════════════════════════════════════
  console.log('%c 1. Async save flow ', 'font-weight:bold;color:#f59e0b');

  assert('saveManualEntry signature is async with opts arg',
    /export async function saveManualEntry\(id, opts = \{\}\)/.test(viewsSrc));
  assert('saveAndAddAnotherManualEntry wraps saveManualEntry with keepOpen: true',
    /saveAndAddAnotherManualEntry\(id\)[\s\S]{0,200}saveManualEntry\(id, \{ keepOpen: true \}\)/.test(viewsSrc));
  assert('saveAndAddAnotherManualEntry bound to window',
    viewsSrc.includes('saveAndAddAnotherManualEntry,'));

  // ═══════════════════════════════════════
  // 2. Range sanity check
  // ═══════════════════════════════════════
  console.log('%c 2. Range sanity check ', 'font-weight:bold;color:#f59e0b');

  // The regex accepts any var prefixed onto refMax / refMin so the multi-unit
  // feature (which introduces checkRefMax/checkRefMin to shadow with alt-unit
  // ranges) doesn't break pattern pins. Intent is unchanged: a > 10x guard.
  assert('Sanity check triggers when value > refMax * 10',
    /value > \w*[Rr]ef[Mm]ax \* 10/.test(viewsSrc));
  // Greptile P2: without `> 0` guard, `refMax === 0` makes the multiplication
  // zero and every positive value triggers the warning.
  assert('Sanity check is guarded against refMax === 0 (no spurious warn)',
    /(\w*[Rr]ef[Mm]ax) != null && \1 > 0 && value > \1 \* 10/.test(viewsSrc));
  assert('Sanity check triggers when value < refMin / 10 (and refMin > 0)',
    /(\w*[Rr]ef[Mm]in) > 0 && value < \1 \/ 10/.test(viewsSrc));
  assert('Sanity check rejects negative values',
    /value < 0\)\s*warn\s*=/.test(viewsSrc) || /if \(value < 0\)/.test(viewsSrc));
  assert('Sanity-warn message mentions unit confusion',
    /Did you enter the right unit\?/.test(viewsSrc));
  assert('Sanity check awaits showConfirmDialog and bails on cancel',
    /if \(warn && !await showConfirmDialog\(`\$\{warn\}/.test(viewsSrc));
  assert('Sanity check uses marker.refMin/refMax (with optional alt-unit overlay)',
    /marker\.refMin[\s\S]{0,200}marker\.refMax/.test(viewsSrc));

  // ═══════════════════════════════════════
  // 3. Duplicate-date confirm
  // ═══════════════════════════════════════
  console.log('%c 3. Duplicate-date confirm ', 'font-weight:bold;color:#f59e0b');

  assert('Duplicate check inspects existing entry for the chosen date',
    /existingEntry\s*=\s*state\.importedData\.entries\?\.find\(e => e\.date === date\)/.test(viewsSrc));
  assert('Confirm dialog message includes existing value + unit + date',
    /already exists for \$\{date\}\. Overwrite\?/.test(viewsSrc));
  assert('Duplicate check uses display-unit value (marker.values[dateIdx]) not raw SI',
    /const dateIdx = data\.dates\.indexOf\(date\)[\s\S]{0,300}marker\.values\[dateIdx\]/.test(viewsSrc));

  // ═══════════════════════════════════════
  // 4. Save & Add Another flow
  // ═══════════════════════════════════════
  console.log('%c 4. Save & Add Another ', 'font-weight:bold;color:#f59e0b');

  assert('keepOpen branch re-opens the manual-entry form with same id + date',
    /if \(keepOpen\)\s*\{[\s\S]{0,300}openManualEntryForm\(id, date\)/.test(viewsSrc));
  assert('keepOpen branch still navigate()s to refresh the underlying page',
    /if \(keepOpen\)\s*\{[\s\S]{0,200}navigate\(navCat\)/.test(viewsSrc));
  assert('Save & Add Another button rendered in form actions',
    /Save\s*&amp;\s*Add Another|Save & Add Another/.test(viewsSrc));
  assert('Save & Add Another button onclick calls saveAndAddAnotherManualEntry',
    /onclick="saveAndAddAnotherManualEntry\('\$\{id\}'\)"/.test(viewsSrc));

  // ═══════════════════════════════════════
  // 5. Session-remembered last date
  // ═══════════════════════════════════════
  console.log('%c 5. Session last-date ', 'font-weight:bold;color:#f59e0b');

  assert('saveManualEntry writes the chosen date to sessionStorage',
    /sessionStorage\.setItem\('labcharts-last-manual-date', date\)/.test(viewsSrc));
  assert('Write wrapped in try/catch (private-mode browsers)',
    /try \{ sessionStorage\.setItem\('labcharts-last-manual-date'/.test(viewsSrc));
  assert('openManualEntryForm reads sessionLast and validates the format',
    /sessionStorage\.getItem\('labcharts-last-manual-date'\)/.test(viewsSrc) &&
    /\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(raw\)/.test(viewsSrc));
  assert('Date fallback chain: prefillDate → sessionLast → today',
    /typeof prefillDate === 'string' && [\s\S]{0,200}sessionLast \|\| today/.test(viewsSrc));

  // Live behavior: write → openManualEntryForm reads.
  try {
    sessionStorage.setItem('labcharts-last-manual-date', '2099-05-12');
    // We can't easily invoke openManualEntryForm without a real marker; just
    // verify the read shape on a hand-crafted clone of the logic.
    const raw = sessionStorage.getItem('labcharts-last-manual-date');
    assert('sessionStorage round-trip works for last-manual-date', raw === '2099-05-12');
    sessionStorage.removeItem('labcharts-last-manual-date');
  } catch (_) { /* private mode — skip */ }

  // ═══════════════════════════════════════
  // 6. Inline edit — Escape cancel flag + no-change short-circuit
  // ═══════════════════════════════════════
  console.log('%c 6. Inline edit cancel + no-change ', 'font-weight:bold;color:#f59e0b');

  assert('editMarkerValue declares a cancelled flag',
    /let cancelled = false/.test(viewsSrc) ||
    /editMarkerValue[\s\S]{0,1500}cancelled\s*=\s*false/.test(viewsSrc));
  assert('save() short-circuits when cancelled is true',
    /const save = \(\) => \{[\s\S]{0,200}if \(cancelled\) return/.test(viewsSrc));
  assert('Escape handler sets cancelled = true before re-rendering',
    /else if \(e\.key === 'Escape'\) \{ cancelled = true; showDetailModal/.test(viewsSrc));
  assert("No-change save short-circuits (no manual flip on a same-value edit)",
    /newValue === parseFloat\(currentValue\)\)/.test(viewsSrc));
  assert('editMarkerValue calls navigate() to rebuild Table/Heatmap after save',
    /editMarkerValue[\s\S]{0,2500}window\.navigate\(state\.currentView \|\| 'dashboard'\)/.test(viewsSrc));
  assert('revertMarkerValue also calls navigate() to rebuild the underlying view',
    /revertMarkerValue[\s\S]{0,800}window\.navigate\(state\.currentView \|\| 'dashboard'\)/.test(viewsSrc));

  // ═══════════════════════════════════════
  // 7. Input width fix
  // ═══════════════════════════════════════
  console.log('%c 7. Input width fix ', 'font-weight:bold;color:#f59e0b');

  assert('Edit input uses width:100% with max-width:140px (replaces width:80px)',
    /editMarkerValue[\s\S]{0,1500}width:100%;max-width:140px/.test(viewsSrc));
  assert('Old width:80px input style removed from editMarkerValue',
    !/editMarkerValue[\s\S]{0,1500}width:80px/.test(viewsSrc));

  // ═══════════════════════════════════════
  // 8. Add Value Manually placement (above Note) + rename
  // ═══════════════════════════════════════
  console.log('%c 8. Add Value Manually placement ', 'font-weight:bold;color:#f59e0b');

  assert('Add Value Manually button rendered BEFORE the marker-note-section',
    (() => {
      const idxBtn = viewsSrc.indexOf('+ Add Value Manually');
      const idxNote = viewsSrc.indexOf('<div class="marker-note-section">');
      return idxBtn > 0 && idxNote > 0 && idxBtn < idxNote;
    })());
  assert("Button rename: '+ Add Value' → '+ Add Value Manually'",
    viewsSrc.includes('+ Add Value Manually'));

  // ═══════════════════════════════════════
  // 9. Manual entry form polish — Enter-to-save, max=today, midpoint placeholder
  // ═══════════════════════════════════════
  console.log('%c 9. Form polish ', 'font-weight:bold;color:#f59e0b');

  assert('Date input gains max="${today}" (no future dates)',
    /<input type="date" id="me-date" value="\$\{dateValue\}" max="\$\{today\}"/.test(viewsSrc));
  assert('Placeholder hint uses midpoint of refMin/refMax when known',
    /placeholderHint = `e\.g\. \$\{formatValue\(\(marker\.refMin \+ marker\.refMax\) \/ 2\)\}`/.test(viewsSrc));
  assert('Enter-to-save / Esc-to-cancel handlers on the value input',
    /Enter-to-save \/ Esc-to-cancel/.test(viewsSrc) &&
    /if \(e\.key === 'Enter'\) \{ e\.preventDefault\(\); saveManualEntry\(id\)/.test(viewsSrc));

  // ═══════════════════════════════════════
  // 10. activeNav sweep — verify the 10-site fix
  // ═══════════════════════════════════════
  console.log('%c 10. activeNav sweep ', 'font-weight:bold;color:#f59e0b');

  const dataSrc = await fetch('js/data.js').then(r => r.text());
  assert('switchUnitSystem uses state.currentView (no .nav-item.active query)',
    /switchUnitSystem[\s\S]{0,400}window\.navigate\(state\.currentView \|\| 'dashboard'/.test(dataSrc) &&
    !/switchUnitSystem[\s\S]{0,400}document\.querySelector\(".nav-item\.active"\)/.test(dataSrc));
  assert('switchRangeMode uses state.currentView (no .nav-item.active query)',
    /switchRangeMode[\s\S]{0,400}window\.navigate\(state\.currentView \|\| 'dashboard'/.test(dataSrc) &&
    !/switchRangeMode[\s\S]{0,400}document\.querySelector\(".nav-item\.active"\)/.test(dataSrc));
  assert('setDateRange uses state.currentView',
    /setDateRange[\s\S]{0,1500}navigate\(state\.currentView \|\| 'dashboard'/.test(dataSrc));

  const cryptoSrc = await fetch('js/crypto.js').then(r => r.text());
  assert('BroadcastChannel cross-tab reload uses state.currentView',
    /state\.currentView \|\| 'dashboard'/.test(cryptoSrc));

  const mainSrc = await fetch('js/main.js').then(r => r.text());
  assert('registerRefreshCallback uses state.currentView',
    /registerRefreshCallback[\s\S]{0,800}state\.currentView \|\| 'dashboard'/.test(mainSrc));

  const pdfSrc = await fetch('js/pdf-import.js').then(r => r.text());
  assert('pdf-import.js no longer uses the buildSidebar+querySelector(.active) antipattern',
    !/buildSidebar\(\);\s*\n\s*const activeNav = document\.querySelector\('\.nav-item\.active'\)/.test(pdfSrc));

  console.log(`\n%c ${pass} passed, ${fail} failed `, fail === 0 ? 'background:#22c55e;color:#fff;padding:4px 12px' : 'background:#ef4444;color:#fff;padding:4px 12px');
  console.log(`Result: ${pass} passed, ${fail} failed`);
})();
