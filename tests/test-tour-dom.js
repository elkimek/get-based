// test-tour-dom.js — DOM-runtime sections extracted from test-tour.js
// (3 window-export checks + 4-12, 15-17). Stays in the puppeteer runner:
// startTour() builds a live #tour-overlay/#tour-spotlight/#tour-tooltip,
// step navigation re-renders them, z-index assertions read getComputedStyle,
// and the walkthrough drives _tourGoToStep against real DOM. The
// source-inspection checks (tour.js structure, TOUR_STEPS content, clamping
// math, CSS, wiring) live in test-tour.js (Vitest).
//
// Run: fetch('tests/test-tour-dom.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
  function firstVisible(selector) {
    return Array.from(document.querySelectorAll(selector)).find(el => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 &&
        rect.height > 0 &&
        rect.right > 0 &&
        rect.left < window.innerWidth &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0';
    }) || null;
  }

  console.log('%c Guided Tour DOM Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  // Clean up any existing tour state before tests
  const profileId = localStorage.getItem('labcharts-active-profile') || 'default';
  const emptyTourKey = `labcharts-${profileId}-emptyTour`;
  const tourKey = `labcharts-${profileId}-tour`;
  const savedEmptyTourState = localStorage.getItem(emptyTourKey);
  const savedTourState = localStorage.getItem(tourKey);
  localStorage.removeItem(emptyTourKey);
  localStorage.removeItem(tourKey);
  ['tour-overlay', 'tour-spotlight', 'tour-tooltip'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  // ═══════════════════════════════════════
  // 3. Window exports callable
  // ═══════════════════════════════════════
  console.log('%c 3. Window Exports ', 'font-weight:bold;color:#f59e0b');

  assert('window.startEmptyTour is a function', typeof window.startEmptyTour === 'function');
  assert('window.startTour is a function', typeof window.startTour === 'function');
  assert('window.startGuidedTour is a function', typeof window.startGuidedTour === 'function');
  assert('window.endTour is a function', typeof window.endTour === 'function');
  assert('window._tourGoToStep is a function', typeof window._tourGoToStep === 'function');

  // ═══════════════════════════════════════
  // 4. Tour start — DOM creation
  // ═══════════════════════════════════════
  console.log('%c 4. Tour Start — DOM Creation ', 'font-weight:bold;color:#f59e0b');

  window.startEmptyTour(false);
  await wait(50);

  const overlay = document.getElementById('tour-overlay');
  const spotlight = document.getElementById('tour-spotlight');
  const tooltip = document.getElementById('tour-tooltip');

  assert('#tour-overlay created', !!overlay);
  assert('#tour-spotlight created', !!spotlight);
  assert('#tour-tooltip created', !!tooltip);
  assert('Overlay displayed as block', overlay && overlay.style.display === 'block');

  // ═══════════════════════════════════════
  // 5. Step 0 — Welcome (centered, no target)
  // ═══════════════════════════════════════
  console.log('%c 5. Step 0 — Welcome ', 'font-weight:bold;color:#f59e0b');

  assert('Spotlight hidden on welcome step', spotlight && spotlight.style.display === 'none');
  assert('Tooltip centered horizontally (left: 50%)', tooltip && tooltip.style.left === '50%');
  assert('Tooltip centered vertically (top: 50%)', tooltip && tooltip.style.top === '50%');
  assert('Tooltip centering transform', tooltip && tooltip.style.transform === 'translate(-50%, -50%)');

  assert('Tooltip has title h4', !!tooltip.querySelector('h4'));
  assert('Title is "Welcome to getbased"', tooltip.querySelector('h4')?.textContent === 'Welcome to getbased');
  assert('Tooltip has description p', !!tooltip.querySelector('p'));
  assert('Description mentions fresh profile framing', tooltip.querySelector('p')?.textContent.includes('fresh profile'));

  const dots = tooltip.querySelectorAll('.tour-dot');
  assert('5 progress dots rendered', dots.length === 5);
  assert('First dot is active', dots[0]?.classList.contains('active'));
  assert('Other dots are inactive', !dots[1]?.classList.contains('active') && !dots[4]?.classList.contains('active'));

  const btns = tooltip.querySelectorAll('.tour-btn');
  assert('Two buttons on welcome step', btns.length === 2);
  assert('First button is Skip (secondary)', btns[0]?.textContent.trim() === 'Skip' && btns[0]?.classList.contains('tour-btn-secondary'));
  assert('Second button is Next (primary)', btns[1]?.textContent.trim() === 'Next' && btns[1]?.classList.contains('tour-btn-primary'));
  assert('Skip calls endTour()', btns[0]?.getAttribute('onclick')?.includes('endTour'));
  assert('Next calls _tourGoToStep(1)', btns[1]?.getAttribute('onclick')?.includes('_tourGoToStep(1)'));

  // ═══════════════════════════════════════
  // 6. Step navigation — Next
  // ═══════════════════════════════════════
  console.log('%c 6. Step Navigation — Next ', 'font-weight:bold;color:#f59e0b');

  window._tourGoToStep(1);
  await wait(100);

  const tooltip2 = document.getElementById('tour-tooltip');
  assert('Step 1 title is "Start Guided Chat"', tooltip2?.querySelector('h4')?.textContent === 'Start Guided Chat');

  const dots2 = tooltip2.querySelectorAll('.tour-dot');
  assert('Second dot active on step 1', dots2[1]?.classList.contains('active'));
  assert('First dot inactive on step 1', !dots2[0]?.classList.contains('active'));

  const btns2 = tooltip2.querySelectorAll('.tour-btn');
  assert('Back button on step 1', btns2[0]?.textContent.trim() === 'Back');
  assert('Next button on step 1', btns2[1]?.textContent.trim() === 'Next');
  assert('Back calls _tourGoToStep(0)', btns2[0]?.getAttribute('onclick')?.includes('_tourGoToStep(0)'));
  assert('Next calls _tourGoToStep(2)', btns2[1]?.getAttribute('onclick')?.includes('_tourGoToStep(2)'));

  const sl2 = document.getElementById('tour-spotlight');
  assert('Spotlight visible on step 1', sl2 && sl2.style.display === 'block');

  const startTarget = firstVisible('.welcome-primary-panel');
  if (startTarget) {
    startTarget.scrollIntoView({ behavior: 'instant', block: 'nearest' });
    window._tourGoToStep(1);
    await wait(150);
    const fabRect = startTarget.getBoundingClientRect();
    const slLeft = parseFloat(sl2.style.left);
    const slTop = parseFloat(sl2.style.top);
    assert('Spotlight left near start target', Math.abs(slLeft - (fabRect.left - 8)) < 2, `sl=${slLeft} target=${fabRect.left - 8}`);
    assert('Spotlight top near start target', Math.abs(slTop - (fabRect.top - 8)) < 2, `sl=${slTop} target=${fabRect.top - 8}`);
    assert('Spotlight width = start target + 16px padding', Math.abs(parseFloat(sl2.style.width) - (fabRect.width + 16)) < 2);
    assert('Spotlight height = start target + 16px padding', Math.abs(parseFloat(sl2.style.height) - (fabRect.height + 16)) < 2);
  } else {
    assert('Visible start target exists for spotlight test', false, 'no visible .welcome-primary-panel or #drop-zone');
  }

  // ═══════════════════════════════════════
  // 7. Step navigation — Back
  // ═══════════════════════════════════════
  console.log('%c 7. Step Navigation — Back ', 'font-weight:bold;color:#f59e0b');

  window._tourGoToStep(0);
  await wait(50);

  const tooltip3 = document.getElementById('tour-tooltip');
  assert('Back to step 0 shows Welcome title', tooltip3?.querySelector('h4')?.textContent === 'Welcome to getbased');
  const dots3 = tooltip3.querySelectorAll('.tour-dot');
  assert('First dot active again after going back', dots3[0]?.classList.contains('active'));
  assert('Spotlight hidden again on welcome step', document.getElementById('tour-spotlight')?.style.display === 'none');

  // ═══════════════════════════════════════
  // 8. Last step — Done button
  // ═══════════════════════════════════════
  console.log('%c 8. Last Step — Done ', 'font-weight:bold;color:#f59e0b');

  window._tourGoToStep(4);
  await wait(100);

  const tooltip4 = document.getElementById('tour-tooltip');
  assert('Step 4 title is "Settings & Connections"', tooltip4?.querySelector('h4')?.textContent === 'Settings & Connections');

  const btns4 = tooltip4.querySelectorAll('.tour-btn');
  assert('Last step has Back button', btns4[0]?.textContent.trim() === 'Back');
  assert('Last step has Done button (not Next)', btns4[1]?.textContent.trim() === 'Done');
  assert('Done calls endTour()', btns4[1]?.getAttribute('onclick')?.includes('endTour'));
  assert('Back calls _tourGoToStep(3)', btns4[0]?.getAttribute('onclick')?.includes('_tourGoToStep(3)'));

  const dots4 = tooltip4.querySelectorAll('.tour-dot');
  assert('Last dot (5th) is active on step 4', dots4[4]?.classList.contains('active'));

  // ═══════════════════════════════════════
  // 9. End tour — cleanup
  // ═══════════════════════════════════════
  console.log('%c 9. End Tour — Cleanup ', 'font-weight:bold;color:#f59e0b');

  window.endTour();
  await wait(50);

  assert('#tour-overlay removed from DOM', !document.getElementById('tour-overlay'));
  assert('#tour-spotlight removed from DOM', !document.getElementById('tour-spotlight'));
  assert('#tour-tooltip removed from DOM', !document.getElementById('tour-tooltip'));
  assert('localStorage empty tour key set to "completed"', localStorage.getItem(emptyTourKey) === 'completed');

  // ═══════════════════════════════════════
  // 10. Auto-trigger guard
  // ═══════════════════════════════════════
  console.log('%c 10. Auto-Trigger Guard ', 'font-weight:bold;color:#f59e0b');

  window.startEmptyTour(true);
  await wait(50);

  assert('startEmptyTour(true) no-ops: no overlay', !document.getElementById('tour-overlay'));
  assert('startEmptyTour(true) no-ops: no spotlight', !document.getElementById('tour-spotlight'));
  assert('startEmptyTour(true) no-ops: no tooltip', !document.getElementById('tour-tooltip'));

  localStorage.setItem(emptyTourKey, 'v1:legacy-ciphertext:completed');
  window.startEmptyTour(true);
  await wait(50);

  assert('Legacy encrypted empty tour flag no-ops auto tour', !document.getElementById('tour-overlay'));
  assert('Legacy encrypted empty tour flag normalizes to completed', localStorage.getItem(emptyTourKey) === 'completed');

  // ═══════════════════════════════════════
  // 11. Re-trigger (startEmptyTour(false) ignores completion)
  // ═══════════════════════════════════════
  console.log('%c 11. Re-Trigger (Skip Completion Check) ', 'font-weight:bold;color:#f59e0b');

  window.startEmptyTour(false);
  await wait(50);

  assert('startEmptyTour(false) creates overlay despite completion', !!document.getElementById('tour-overlay'));
  assert('startEmptyTour(false) creates tooltip despite completion', !!document.getElementById('tour-tooltip'));

  window.endTour();
  await wait(50);

  // ═══════════════════════════════════════
  // 12. Z-index layering (computed styles)
  // ═══════════════════════════════════════
  console.log('%c 12. Z-Index Layering ', 'font-weight:bold;color:#f59e0b');

  localStorage.removeItem(emptyTourKey);
  window.startEmptyTour(false);
  await wait(50);

  const oCS = getComputedStyle(document.getElementById('tour-overlay'));
  const sCS = getComputedStyle(document.getElementById('tour-spotlight'));
  const tCS = getComputedStyle(document.getElementById('tour-tooltip'));

  assert('Overlay z-index = 500', oCS.zIndex === '500');
  assert('Spotlight z-index = 501', sCS.zIndex === '501');
  assert('Tooltip z-index = 502', tCS.zIndex === '502');
  assert('Overlay position: fixed', oCS.position === 'fixed');
  assert('Spotlight position: fixed', sCS.position === 'fixed');
  assert('Tooltip position: fixed', tCS.position === 'fixed');
  assert('Spotlight pointer-events: none', sCS.pointerEvents === 'none');
  assert('Overlay pointer-events: auto', oCS.pointerEvents === 'auto');

  window.endTour();
  await wait(50);

  // ═══════════════════════════════════════
  // 15. Tooltip stays within viewport (live check)
  // ═══════════════════════════════════════
  console.log('%c 15. Tooltip In Viewport (Live) ', 'font-weight:bold;color:#f59e0b');

  window.startEmptyTour(false);
  window._tourGoToStep(1);
  await wait(100);

  const ttRect = document.getElementById('tour-tooltip').getBoundingClientRect();
  assert('Tooltip left >= 0', ttRect.left >= 0);
  assert('Tooltip top >= 0', ttRect.top >= 0);
  assert('Tooltip right <= viewport width', ttRect.right <= window.innerWidth + 1);
  assert('Tooltip bottom <= viewport height', ttRect.bottom <= window.innerHeight + 1);

  window.endTour();
  await wait(50);

  // ═══════════════════════════════════════
  // 16. Tour step targets exist in DOM
  // ═══════════════════════════════════════
  console.log('%c 16. Tour Step Targets in DOM ', 'font-weight:bold;color:#f59e0b');

  assert('Empty start target exists', !!document.querySelector('.welcome-primary-panel, #drop-zone'));
  assert('Empty demo cards target exists', !!document.querySelector('.demo-cards'));
  assert('Empty context details are not shown as a first-run task', !document.querySelector('.welcome-context-summary'));
  assert('.profile-compact-btn exists', !!document.querySelector('.profile-compact-btn'));
  assert('.settings-btn exists', !!document.querySelector('.settings-btn'));

  // ═══════════════════════════════════════
  // 17. Empty tour full walkthrough (all 5 titles + dots)
  // ═══════════════════════════════════════
  console.log('%c 17. Empty Tour Full Walkthrough (Steps 0-4) ', 'font-weight:bold;color:#f59e0b');

  const expectedTitles = [
    'Welcome to getbased', 'Start Guided Chat', 'Try a Populated Profile',
    'Profiles Stay Separate', 'Settings & Connections'
  ];

  localStorage.removeItem(emptyTourKey);
  window.startEmptyTour(false);
  await wait(50);

  for (let i = 0; i < expectedTitles.length; i++) {
    window._tourGoToStep(i);
    await wait(100);
    const tt = document.getElementById('tour-tooltip');
    const title = tt?.querySelector('h4')?.textContent;
    assert(`Step ${i}: title = "${expectedTitles[i]}"`, title === expectedTitles[i], `got "${title}"`);
    const activeDots = tt?.querySelectorAll('.tour-dot.active');
    assert(`Step ${i}: exactly 1 active dot`, activeDots?.length === 1);
  }

  window.endTour();
  await wait(50);

  // Restore original tour state
  if (savedEmptyTourState) localStorage.setItem(emptyTourKey, savedEmptyTourState);
  else localStorage.removeItem(emptyTourKey);
  if (savedTourState) localStorage.setItem(tourKey, savedTourState);
  else localStorage.removeItem(tourKey);

  console.log(`\n%c Guided Tour DOM: ${pass} passed, ${fail} failed `, fail > 0 ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS === 'undefined') window.__TEST_RESULTS = {};
  window.__TEST_RESULTS['test-tour-dom'] = { pass, fail };
})();
