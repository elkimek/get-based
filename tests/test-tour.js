// test-tour.js — Verify guided tour (spotlight walkthrough) implementation
// Run: fetch('tests/test-tour.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  console.log('%c Guided Tour Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  // Clean up any existing tour state before tests
  const profileId = localStorage.getItem('labcharts-active-profile') || 'default';
  const tourKey = `labcharts-${profileId}-tour`;
  const savedTourState = localStorage.getItem(tourKey);
  localStorage.removeItem(tourKey);
  // Clean up any leftover tour DOM
  ['tour-overlay', 'tour-spotlight', 'tour-tooltip'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  // ═══════════════════════════════════════
  // 1. Source: tour.js structure
  // ═══════════════════════════════════════
  console.log('%c 1. Source Inspection ', 'font-weight:bold;color:#f59e0b');

  const tourSrc = await fetchWithRetry('js/tour.js');

  assert('tour.js has startTour export', tourSrc.includes('export function startTour'));
  assert('tour.js has endTour export', tourSrc.includes('export function endTour'));
  assert('tour.js has goToStep function', tourSrc.includes('function goToStep'));
  assert('tour.js has positionTooltip function', tourSrc.includes('function positionTooltip'));
  assert('tour.js has isTourCompleted function', tourSrc.includes('function isTourCompleted'));
  assert('tour.js has TOUR_STEPS array', tourSrc.includes('const TOUR_STEPS'));
  assert('tour.js imports state', tourSrc.includes("import { state } from './state.js'"));
  assert('tour.js imports profileStorageKey', tourSrc.includes("import { profileStorageKey } from './profile.js'"));
  assert('tour.js has window exports', tourSrc.includes('Object.assign(window,') && tourSrc.includes('startTour') && tourSrc.includes('endTour'));
  assert('tour.js exposes _tourGoToStep on window', tourSrc.includes('window._tourGoToStep = goToStep'));
  assert('startTour respects auto flag', tourSrc.includes('if (auto && isTourCompleted(') && tourSrc.includes(') return'));
  assert('endTour stores completed in localStorage', tourSrc.includes("'completed'"));
  assert('Overlay click dismisses tour', tourSrc.includes('if (e.target === overlay) endTour()'));

  // ═══════════════════════════════════════
  // 2. TOUR_STEPS content (7 steps)
  // ═══════════════════════════════════════
  console.log('%c 2. Tour Steps Content ', 'font-weight:bold;color:#f59e0b');

  assert('Step 1: Welcome (null target)', tourSrc.includes("target: null, title: 'Welcome to getbased'"));
  assert('Step 2: Import FAB', tourSrc.includes("target: '#import-fab', title: 'Import More Labs'"));
  assert('Step 3: Profile button', tourSrc.includes("target: '.profile-compact-btn', title: 'Your Profile'"));
  assert('Step 4: Sidebar nav', tourSrc.includes("target: '#sidebar-nav', title: 'Category Navigation'"));
  assert('Step 5: Context cards', tourSrc.includes("target: '.profile-context-cards', title: 'Lifestyle Context'"));
  assert('Step 6: Settings', tourSrc.includes("target: '.settings-btn', title: 'Settings'"));
  assert('Step 7: Feedback', tourSrc.includes("target: '.feedback-btn', title: 'Send Feedback'"));
  assert('Step 8: Chat FAB', tourSrc.includes("target: '#chat-fab', title: 'Ask AI'"));

  // Count only within TOUR_STEPS (before CYCLE_TOUR_STEPS)
  const tourStepsStart = tourSrc.indexOf('const TOUR_STEPS');
  const cycleStepsStart = tourSrc.indexOf('const CYCLE_TOUR_STEPS');
  const tourStepsSection = tourStepsStart >= 0 && cycleStepsStart > tourStepsStart
    ? tourSrc.slice(tourStepsStart, cycleStepsStart)
    : tourSrc.slice(tourStepsStart, tourStepsStart + 2000);
  const stepMatches = tourStepsSection.match(/\{ target:/g);
  assert('Exactly 9 steps in TOUR_STEPS', stepMatches && stepMatches.length === 9, `found ${stepMatches ? stepMatches.length : 0}`);

  // ═══════════════════════════════════════
  // 3. Window exports callable
  // ═══════════════════════════════════════
  console.log('%c 3. Window Exports ', 'font-weight:bold;color:#f59e0b');

  assert('window.startTour is a function', typeof window.startTour === 'function');
  assert('window.endTour is a function', typeof window.endTour === 'function');
  assert('window._tourGoToStep is a function', typeof window._tourGoToStep === 'function');

  // ═══════════════════════════════════════
  // 4. Tour start — DOM creation
  // ═══════════════════════════════════════
  console.log('%c 4. Tour Start — DOM Creation ', 'font-weight:bold;color:#f59e0b');

  window.startTour(false);
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
  assert('Description mentions five lenses framing', tooltip.querySelector('p')?.textContent.includes('five lenses on your biology'));

  // Progress dots
  const dots = tooltip.querySelectorAll('.tour-dot');
  assert('8 progress dots rendered', dots.length === 8);
  assert('First dot is active', dots[0]?.classList.contains('active'));
  assert('Other dots are inactive', !dots[1]?.classList.contains('active') && !dots[7]?.classList.contains('active'));

  // Buttons: Skip + Next on first step
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
  assert('Step 1 title is "Import More Labs"', tooltip2?.querySelector('h4')?.textContent === 'Import More Labs');

  const dots2 = tooltip2.querySelectorAll('.tour-dot');
  assert('Second dot active on step 1', dots2[1]?.classList.contains('active'));
  assert('First dot inactive on step 1', !dots2[0]?.classList.contains('active'));

  // Buttons: Back + Next on middle step
  const btns2 = tooltip2.querySelectorAll('.tour-btn');
  assert('Back button on step 1', btns2[0]?.textContent.trim() === 'Back');
  assert('Next button on step 1', btns2[1]?.textContent.trim() === 'Next');
  assert('Back calls _tourGoToStep(0)', btns2[0]?.getAttribute('onclick')?.includes('_tourGoToStep(0)'));
  assert('Next calls _tourGoToStep(2)', btns2[1]?.getAttribute('onclick')?.includes('_tourGoToStep(2)'));

  // Spotlight should be visible and positioned over #import-fab
  const sl2 = document.getElementById('tour-spotlight');
  assert('Spotlight visible on step 1', sl2 && sl2.style.display === 'block');

  const importFab = document.getElementById('import-fab');
  if (importFab) {
    // Make visible for positioning test (normally hidden until data loaded)
    importFab.classList.remove('hidden');
    importFab.scrollIntoView({ behavior: 'instant', block: 'nearest' });
    window._tourGoToStep(1);
    await wait(150);
    const fabRect = importFab.getBoundingClientRect();
    const slLeft = parseFloat(sl2.style.left);
    const slTop = parseFloat(sl2.style.top);
    assert('Spotlight left near import-fab', Math.abs(slLeft - (fabRect.left - 8)) < 2, `sl=${slLeft} fab=${fabRect.left - 8}`);
    assert('Spotlight top near import-fab', Math.abs(slTop - (fabRect.top - 8)) < 2, `sl=${slTop} fab=${fabRect.top - 8}`);
    assert('Spotlight width = import-fab + 16px padding', Math.abs(parseFloat(sl2.style.width) - (fabRect.width + 16)) < 2);
    assert('Spotlight height = import-fab + 16px padding', Math.abs(parseFloat(sl2.style.height) - (fabRect.height + 16)) < 2);
  } else {
    assert('Import FAB exists for spotlight test', false, '#import-fab not found');
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

  window._tourGoToStep(7);
  await wait(100);

  const tooltip4 = document.getElementById('tour-tooltip');
  assert('Step 7 title is "Ask AI"', tooltip4?.querySelector('h4')?.textContent === 'Ask AI');

  const btns4 = tooltip4.querySelectorAll('.tour-btn');
  assert('Last step has Back button', btns4[0]?.textContent.trim() === 'Back');
  assert('Last step has Done button (not Next)', btns4[1]?.textContent.trim() === 'Done');
  assert('Done calls endTour()', btns4[1]?.getAttribute('onclick')?.includes('endTour'));
  assert('Back calls _tourGoToStep(6)', btns4[0]?.getAttribute('onclick')?.includes('_tourGoToStep(6)'));

  const dots4 = tooltip4.querySelectorAll('.tour-dot');
  assert('Last dot (8th) is active on step 7', dots4[7]?.classList.contains('active'));

  // ═══════════════════════════════════════
  // 9. End tour — cleanup
  // ═══════════════════════════════════════
  console.log('%c 9. End Tour — Cleanup ', 'font-weight:bold;color:#f59e0b');

  window.endTour();
  await wait(50);

  assert('#tour-overlay removed from DOM', !document.getElementById('tour-overlay'));
  assert('#tour-spotlight removed from DOM', !document.getElementById('tour-spotlight'));
  assert('#tour-tooltip removed from DOM', !document.getElementById('tour-tooltip'));
  assert('localStorage tour key set to "completed"', localStorage.getItem(tourKey) === 'completed');

  // ═══════════════════════════════════════
  // 10. Auto-trigger guard
  // ═══════════════════════════════════════
  console.log('%c 10. Auto-Trigger Guard ', 'font-weight:bold;color:#f59e0b');

  window.startTour(true);
  await wait(50);

  assert('startTour(true) no-ops: no overlay', !document.getElementById('tour-overlay'));
  assert('startTour(true) no-ops: no spotlight', !document.getElementById('tour-spotlight'));
  assert('startTour(true) no-ops: no tooltip', !document.getElementById('tour-tooltip'));

  // ═══════════════════════════════════════
  // 11. Re-trigger (startTour(false) ignores completion)
  // ═══════════════════════════════════════
  console.log('%c 11. Re-Trigger (Skip Completion Check) ', 'font-weight:bold;color:#f59e0b');

  window.startTour(false);
  await wait(50);

  assert('startTour(false) creates overlay despite completion', !!document.getElementById('tour-overlay'));
  assert('startTour(false) creates tooltip despite completion', !!document.getElementById('tour-tooltip'));

  window.endTour();
  await wait(50);

  // ═══════════════════════════════════════
  // 12. Z-index layering (computed styles)
  // ═══════════════════════════════════════
  console.log('%c 12. Z-Index Layering ', 'font-weight:bold;color:#f59e0b');

  localStorage.removeItem(tourKey);
  window.startTour(false);
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
  // 13. Target not found — skip behavior
  // ═══════════════════════════════════════
  console.log('%c 13. Target Not Found — Skip Behavior ', 'font-weight:bold;color:#f59e0b');

  assert('Skips to next step when target missing', tourSrc.includes('if (!isLast) goToStep(index + 1)'));
  assert('Ends tour if last step target missing', tourSrc.includes('else endTour()'));
  assert('Uses scrollIntoView on target', tourSrc.includes('scrollIntoView'));

  // ═══════════════════════════════════════
  // 14. Viewport clamping logic
  // ═══════════════════════════════════════
  console.log('%c 14. Viewport Clamping ', 'font-weight:bold;color:#f59e0b');

  assert('Clamps left >= 12px', tourSrc.includes('Math.max(12, Math.min(left'));
  assert('Clamps top >= 12px', tourSrc.includes('Math.max(12, Math.min(top'));
  assert('Clamps right to vw - tw - 12', tourSrc.includes('vw - tw - 12'));
  assert('Clamps bottom to vh - th - 12', tourSrc.includes('vh - th - 12'));
  assert('Handles bottom position', tourSrc.includes("position === 'bottom'"));
  assert('Handles right position', tourSrc.includes("position === 'right'"));
  assert('Handles left position', tourSrc.includes("position === 'left'"));
  assert('Handles top position', tourSrc.includes("position === 'top'"));
  assert('Has fallback placement', tourSrc.includes('Fallback: place below'));

  // ═══════════════════════════════════════
  // 15. Tooltip stays within viewport (live check)
  // ═══════════════════════════════════════
  console.log('%c 15. Tooltip In Viewport (Live) ', 'font-weight:bold;color:#f59e0b');

  window.startTour(false);
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

  assert('#drop-zone exists', !!document.getElementById('drop-zone'));
  assert('#sidebar-nav exists', !!document.getElementById('sidebar-nav'));
  assert('.settings-btn exists', !!document.querySelector('.settings-btn'));
  assert('.feedback-btn exists', !!document.querySelector('.feedback-btn'));
  assert('#chat-fab exists', !!document.getElementById('chat-fab'));
  assert('.profile-context-cards exists', !!document.querySelector('.profile-context-cards'));

  // ═══════════════════════════════════════
  // 17. Full walkthrough (all 7 titles + dots)
  // ═══════════════════════════════════════
  console.log('%c 17. Full Walkthrough (Steps 0-6) ', 'font-weight:bold;color:#f59e0b');

  const expectedTitles = [
    'Welcome to getbased', 'Import More Labs', 'Your Profile', 'Category Navigation',
    'Lifestyle Context', 'Settings', 'Send Feedback', 'Ask AI'
  ];

  localStorage.removeItem(tourKey);
  window.startTour(false);
  await wait(50);

  for (let i = 0; i < 7; i++) {
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

  // ═══════════════════════════════════════
  // 18. CSS styles
  // ═══════════════════════════════════════
  console.log('%c 18. CSS Styles ', 'font-weight:bold;color:#f59e0b');

  const cssSrc = await fetchWithRetry('styles.css');

  assert('CSS has #tour-overlay rule', cssSrc.includes('#tour-overlay'));
  assert('CSS overlay: z-index 500', cssSrc.includes('z-index: 500'));
  assert('CSS has #tour-spotlight rule', cssSrc.includes('#tour-spotlight'));
  assert('CSS spotlight: z-index 501', /tour-spotlight[\s\S]*?z-index:\s*501/.test(cssSrc));
  assert('CSS spotlight: box-shadow 9999px dimming', cssSrc.includes('box-shadow: 0 0 0 9999px'));
  assert('CSS spotlight: transition for smooth movement', /tour-spotlight[\s\S]*?transition/.test(cssSrc));
  assert('CSS spotlight: pointer-events none', /tour-spotlight[\s\S]*?pointer-events:\s*none/.test(cssSrc));
  assert('CSS has #tour-tooltip rule', cssSrc.includes('#tour-tooltip'));
  assert('CSS tooltip: z-index 502', /tour-tooltip[\s\S]*?z-index:\s*502/.test(cssSrc));
  assert('CSS tooltip: max-width 340px', cssSrc.includes('max-width: 340px'));
  assert('CSS tooltip h4: font-family var(--font-display)', cssSrc.includes('#tour-tooltip h4'));
  assert('CSS tooltip p: color var(--text-secondary)', cssSrc.includes('#tour-tooltip p'));
  assert('CSS has .tour-nav', cssSrc.includes('.tour-nav'));
  assert('CSS has .tour-dots', cssSrc.includes('.tour-dots'));
  assert('CSS has .tour-dot (8px circle)', cssSrc.includes('.tour-dot {'));
  assert('CSS has .tour-dot.active', cssSrc.includes('.tour-dot.active'));
  assert('CSS has .tour-btns', cssSrc.includes('.tour-btns'));
  assert('CSS has .tour-btn base', cssSrc.includes('.tour-btn {'));
  assert('CSS has .tour-btn-primary (gradient)', cssSrc.includes('.tour-btn-primary'));
  assert('CSS has .tour-btn-secondary (transparent)', cssSrc.includes('.tour-btn-secondary'));
  assert('CSS has mobile tooltip override (480px)', cssSrc.includes('#tour-tooltip { max-width: calc(100vw - 32px)'));

  // ═══════════════════════════════════════
  // 19. main.js wiring
  // ═══════════════════════════════════════
  console.log('%c 19. main.js Wiring ', 'font-weight:bold;color:#f59e0b');

  const mainSrc = await fetchWithRetry('js/main.js');

  assert('main.js imports tour.js', mainSrc.includes("import './tour.js'"));
  assert('main.js Escape checks #tour-overlay', mainSrc.includes('tour-overlay'));
  assert('main.js Escape calls window.endTour()', mainSrc.includes('window.endTour()'));
  // Tour escape should be checked before other modals
  const tourEscIdx = mainSrc.indexOf('tour-overlay');
  const confirmEscIdx = mainSrc.indexOf('confirm-dialog-overlay');
  assert('Tour Escape check before confirm dialog', tourEscIdx > 0 && tourEscIdx < confirmEscIdx);

  // ═══════════════════════════════════════
  // 20. views.js auto-trigger
  // ═══════════════════════════════════════
  console.log('%c 20. views.js Auto-Trigger ', 'font-weight:bold;color:#f59e0b');

  const viewsSrc = await fetchWithRetry('js/views.js');

  assert('views.js calls window.startTour(true)', viewsSrc.includes('window.startTour(true)'));
  assert('views.js guards with if (window.startTour)', viewsSrc.includes('if (window.startTour)'));
  // Should be called after setupDropZone
  const setupIdx = viewsSrc.indexOf('setupDropZone()');
  const tourIdx = viewsSrc.indexOf('startTour(true)');
  assert('startTour called after setupDropZone', setupIdx > 0 && tourIdx > setupIdx);

  // ═══════════════════════════════════════
  // 21. settings.js — Take a Tour button
  // ═══════════════════════════════════════
  console.log('%c 21. Settings — Take a Tour ', 'font-weight:bold;color:#f59e0b');

  const settingsSrc = await fetchWithRetry('js/settings.js');

  assert('settings.js has "Guided Tour" button', settingsSrc.includes('Guided Tour'));
  assert('settings.js calls startTour(false)', settingsSrc.includes('startTour(false)'));
  assert('settings.js closes modal before tour', settingsSrc.includes('closeSettingsModal()'));
  assert('settings.js uses setTimeout for delay', settingsSrc.includes('setTimeout(()=>startTour(false)'));
  assert('Tour button in Display tab panel', /tab-panel="display"[\s\S]*?Guided Tour/s.test(settingsSrc));

  // ═══════════════════════════════════════
  // 22. service-worker.js
  // ═══════════════════════════════════════
  console.log('%c 22. Service Worker ', 'font-weight:bold;color:#f59e0b');

  const swSrc = await fetchWithRetry('service-worker.js');

  assert('SW APP_SHELL includes /js/tour.js', swSrc.includes("'/js/tour.js'"));
  assert('SW uses importScripts for version', swSrc.includes("importScripts('/version.js')"));
  assert('SW CACHE_NAME uses semver', swSrc.includes('`labcharts-v${self.APP_VERSION}`'));

  // ═══════════════════════════════════════
  // Restore original tour state
  // ═══════════════════════════════════════
  if (savedTourState) localStorage.setItem(tourKey, savedTourState);
  else localStorage.removeItem(tourKey);

  // ═══════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════
  console.log(`\n%c Results: ${pass} passed, ${fail} failed `, fail > 0 ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
})();
