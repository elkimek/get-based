// test-a11y-phase3.js — accessibility regression tests for v1.5.2.
// Covers: global keyboard delegation, role="button" tabindex on clickable
// divs, modal-close aria-labels, brand-voice copy, settings tablist,
// chart layers ARIA, tour dialog role, chat typing aria-live, progress bar.
//
// Run: fetch('tests/test-a11y-phase3.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let passed = 0, failed = 0;
  const fails = [];
  function assert(name, cond, detail) {
    if (cond) { passed++; console.log(`  %c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { failed++; fails.push(name); console.error(`  %c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }
  console.log('%c Phase 3 A11y Tests ', 'background:#a855f7;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  // ─── 1. Global keyboard delegation ───
  const mainSrc = await fetch('/js/main.js').then(r => r.text());
  assert('main.js installs global Enter/Space delegation for role=button',
    mainSrc.includes("if (e.key !== \"Enter\" && e.key !== \" \") return") &&
    mainSrc.includes("getAttribute('role') !== 'button'"));
  assert('global delegation skips native interactives',
    mainSrc.includes("tag === 'BUTTON' || tag === 'A' || tag === 'INPUT'"));

  // ─── 2. Clickable divs gain role+tabindex ───
  const viewsSrc = await fetch('/js/views.js').then(r => r.text());
  assert('chart-card has role and tabindex',
    viewsSrc.match(/<div class="chart-card" role="button" tabindex="0"/));
  assert('trend-alert-card has role and tabindex',
    viewsSrc.includes('class="trend-alert-card ${cls}" role="button" tabindex="0"'));
  assert('alert-card (critical) has role and tabindex',
    viewsSrc.includes('class="alert-card ${cls}" role="button" tabindex="0"'));
  assert('note-card has role and tabindex',
    viewsSrc.includes('class="note-card" role="button" tabindex="0"'));
  assert('heatmap header td has role+tabindex',
    viewsSrc.includes('<tr><td role="button" tabindex="0"'));
  assert('heatmap cell td has role+tabindex',
    viewsSrc.match(/heatmap-\$\{s\}" role="button" tabindex="0"/));
  assert('fa-card has role+tabindex',
    viewsSrc.includes('class="fa-card" role="button" tabindex="0"'));
  assert('ref-editable span has role+tabindex',
    viewsSrc.includes('class="ref-editable" role="button" tabindex="0"'));
  assert('focus-card refresh has aria-label',
    viewsSrc.includes('class="focus-card-refresh" onclick="refreshFocusCard()" aria-label="Regenerate insight"'));

  const cycleSrc = await fetch('/js/cycle.js').then(r => r.text());
  assert('cycle-prompt has role+tabindex',
    cycleSrc.includes('class="cycle-prompt" role="button" tabindex="0"'));
  assert('cycle-summary has role+tabindex',
    cycleSrc.includes('class="cycle-summary" role="button" tabindex="0"'));

  const suppSrc = await fetch('/js/supplements.js').then(r => r.text());
  assert('supp-bar-row has role+tabindex',
    suppSrc.includes('class="supp-bar-row" role="button" tabindex="0"'));

  // ─── 3. Modal close aria-labels ───
  for (const f of ['/js/views.js', '/js/feedback.js', '/js/changelog.js', '/js/emf.js', '/js/settings.js']) {
    const src = await fetch(f).then(r => r.text());
    const closeButtons = (src.match(/class="modal-close"/g) || []).length;
    const labelled = (src.match(/class="modal-close" aria-label="Close"/g) || []).length;
    assert(`${f}: every modal-close has aria-label`,
      closeButtons === labelled,
      `${labelled}/${closeButtons} labelled`);
  }

  // ─── 4. Brand-voice "we/us" eliminated from key sites ───
  const utilsSrc = await fetch('/js/utils.js').then(r => r.text());
  assert('utils.js analytics consent uses "me" not "us"',
    !utilsSrc.includes('help us improve getbased') && utilsSrc.includes('help me improve getbased'));
  const settingsSrc = await fetch('/js/settings.js').then(r => r.text());
  assert('settings.js privacy copy uses "I" not "we"',
    !settingsSrc.includes('We track cookieless') && settingsSrc.includes('I track cookieless'));
  assert('views.js onboarding drops "us show" framing',
    !viewsSrc.includes('help us show the right reference ranges'));
  const importSrc = await fetch('/js/pdf-import.js').then(r => r.text());
  assert('pdf-import dialog drops "We don\'t fully" / "We\'d love"',
    !importSrc.includes("We don't fully support") && !importSrc.includes("We'd love to support"));

  // ─── 5. Settings tablist wiring ───
  assert('settings-tabs-bar has role=tablist',
    settingsSrc.includes('class="settings-tabs-bar" role="tablist"'));
  // 6 tabs each with runtime aria-selected expression
  const ariaSelMatches = (settingsSrc.match(/aria-selected="\$\{_activeSettingsTab/g) || []).length;
  assert('all 6 settings tabs have runtime aria-selected', ariaSelMatches === 6, `found ${ariaSelMatches}`);
  assert('view-toggle (Charts/Table/Heatmap) is a tablist',
    viewsSrc.includes('class="view-toggle" role="tablist"'));

  // ─── 6. Chart layers dropdown ARIA ───
  const dataSrc = await fetch('/js/data.js').then(r => r.text());
  assert('chart-layers-trigger has aria-haspopup + aria-controls',
    dataSrc.includes('class="view-btn chart-layers-trigger" aria-haspopup="true"') &&
    dataSrc.includes('aria-controls="chart-layers-dropdown"'));
  assert('chart-layers-dropdown has role=menu',
    dataSrc.includes('class="chart-layers-dropdown" id="chart-layers-dropdown" role="menu"'));
  assert('toggle handler updates aria-expanded',
    dataSrc.includes("trigger.setAttribute('aria-expanded', String(!isOpen))"));
  assert('toggle handler closes on Escape',
    dataSrc.includes("if (ev.key === 'Escape')"));

  // ─── 7. Tour dialog role ───
  const tourSrc = await fetch('/js/tour.js').then(r => r.text());
  assert('tour tooltip has role=dialog + aria-modal',
    tourSrc.includes("setAttribute('role', 'dialog')") &&
    tourSrc.includes("setAttribute('aria-modal', 'true')") &&
    tourSrc.includes("setAttribute('aria-labelledby', 'tour-tooltip-heading')"));
  assert('tour heading has matching id',
    tourSrc.includes('id="tour-tooltip-heading"'));

  // ─── 8. Chat typing indicator aria-live ───
  const chatSrc = await fetch('/js/chat.js').then(r => r.text());
  const ariaLiveCount = (chatSrc.match(/typingEl\.setAttribute\('aria-live', 'polite'\)/g) || []).length;
  assert('both typing-indicator sites have aria-live=polite',
    ariaLiveCount >= 2,
    `found ${ariaLiveCount}`);

  // ─── 9. Progress bar ARIA ───
  assert('import-progress-bar declares role=progressbar',
    importSrc.includes('class="import-progress-bar" role="progressbar"'));
  assert('import-progress updates aria-valuenow',
    importSrc.includes("bar.setAttribute('aria-valuenow', String(pct))"));

  // ─── 10. import-fab focus-visible ───
  const cssSrc = await fetch('/styles.css').then(r => r.text());
  assert('.import-fab has :focus-visible outline',
    cssSrc.includes('.import-fab:focus-visible { outline: 2px solid var(--accent)'));

  // ─── 11. theme-color light variant + footer emoji removed ───
  const indexSrc = await fetch('/index.html').then(r => r.text());
  assert('theme-color has light-mode variant',
    indexSrc.includes('media="(prefers-color-scheme: light)"'));
  assert('footer drops the heart emoji',
    !indexSrc.includes('Built with ❤️') && indexSrc.includes('Built by'));

  // ─── 12. Weight input respects unit system ───
  const wearSrc = await fetch('/js/wearables.js').then(r => r.text());
  assert('weight log inputs respect state.unitSystem',
    wearSrc.includes("state.unitSystem === 'US' ? 'lb' : 'kg'"));

  // ─── 12b. Light-device browse modals close on backdrop click ───
  // Browse-style modals (Add device, picker) close on backdrop; form-input
  // modals (Log device session) require explicit Cancel/Save so accidental
  // taps don't lose typed values.
  const lightDevSrc = await fetch('/js/light-devices.js').then(r => r.text());
  // Two browse modals each get a backdrop-close listener guarded by
  // `e.target === overlay` so child clicks don't bubble out.
  const backdropMatches = lightDevSrc.match(/overlay\.addEventListener\('click', \(e\) => \{\s*if \(e\.target === overlay\) overlay\.remove\(\);/g) || [];
  assert('Add-device + device-picker modals each have backdrop-click close',
    backdropMatches.length >= 2,
    `found ${backdropMatches.length} backdrop-close listeners`);
  // openDeviceSessionDialog is a form modal — must NOT have backdrop-close
  // (would lose typed duration/distance/notes on stray click).
  const sessionDialogStart = lightDevSrc.indexOf('export async function openDeviceSessionDialog');
  const sessionDialogEnd = lightDevSrc.indexOf('export', sessionDialogStart + 1);
  const sessionDialogBody = lightDevSrc.slice(sessionDialogStart, sessionDialogEnd > 0 ? sessionDialogEnd : undefined);
  assert('openDeviceSessionDialog (form modal) has NO backdrop-close listener',
    !/overlay\.addEventListener\('click'/.test(sessionDialogBody));

  // ─── 13. Light-page channel pill drill-down a11y ───
  // Pills are <button>s (native focusable + Enter/Space) with aria-expanded
  // toggling between false/true and aria-controls pointing at the panel.
  // The detail panel is role=region with aria-label; close button has its
  // own aria-label. Hidden text in .sr-only carries the qualitative tier
  // for screen readers since the dots are aria-hidden.
  assert('pill is a <button> with aria-expanded + aria-controls',
    /class="light-pill light-pill-tier-\$\{t7\} light-pill-interactive"[\s\S]{0,300}aria-expanded="false"[\s\S]{0,300}aria-controls="\$\{detailId\}"/.test(viewsSrc));
  assert('pill sparkline is aria-hidden (qualitative info already in sr-only span)',
    viewsSrc.includes('class="light-pill-sparkline"') &&
    /<svg class="light-pill-sparkline"[^>]*aria-hidden="true"/.test(viewsSrc));
  assert('pill carries sr-only tier + day-count label for assistive tech',
    /class="sr-only">\$\{tlabel\(t7\)\}, \$\{dc\.n\} of 7 days hit target/.test(viewsSrc));
  assert('detail panel is role=region with aria-label',
    /class="light-channel-detail"[\s\S]{0,200}role="region" aria-label="\$\{escapeHTML\(meta\.label/.test(viewsSrc));
  assert('detail close button has aria-label',
    /class="light-channel-detail-close" aria-label="Close \$\{escapeAttr\(meta\.label/.test(viewsSrc));
  assert('_toggleChannelDetail flips aria-expanded on the active pill',
    /p\.setAttribute\('aria-expanded', 'true'\)/.test(viewsSrc) &&
    /p\.setAttribute\('aria-expanded', 'false'\)/.test(viewsSrc));
  assert('_toggleChannelDetail moves focus into the opened panel',
    viewsSrc.includes('panel.focus(') && /tabindex.*-1/.test(viewsSrc));

  console.log(`%c Phase 3 A11y: ${passed} passed, ${failed} failed `,
    failed === 0 ? 'background:#22c55e;color:#fff;padding:4px 12px;border-radius:4px;font-weight:bold' : 'background:#ef4444;color:#fff;padding:4px 12px;border-radius:4px;font-weight:bold');
  if (failed > 0) console.error('Failures:', fails);
  return { passed, failed, fails };
})();
