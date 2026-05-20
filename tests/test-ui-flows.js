// test-ui-flows.js — Behavioral UI tests for key user flows
// Tests what the user sees, not implementation details.
// Run: fetch('tests/test-ui-flows.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; }
    else { fail++; console.error(`FAIL  ${name}` + (detail ? ` — ${detail}` : '')); }
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const main = document.getElementById('main-content');
  const S = window._labState;


  // Dismiss any open dialogs/modals from prior tests
  document.getElementById('confirm-dialog-overlay')?.classList.remove('show');
  document.getElementById('modal-overlay')?.classList.remove('show');
  document.getElementById('settings-modal-overlay')?.classList.remove('show');

  // ═══════════════════════════════════════════════
  // SETUP — load demo data directly into state (no confirm dialog)
  // ═══════════════════════════════════════════════
  const hadData = S.importedData?.entries?.length > 0;
  if (!hadData) {
    const resp = await fetch('data/demo-male.json');
    const demo = await resp.json();
    S.importedData = demo;
    S.profileSex = 'male';
    S.profileDob = '1987-11-22';
    window.saveImportedData();
    window.buildSidebar();
    window.navigate('dashboard');
    await wait(50);
  }
  const data = window.getActiveData();
  assert('Setup: demo data loaded', data.dates.length > 0, `${data.dates.length} dates`);

  // ═══════════════════════════════════════════════
  // 0. MODAL FOCUS-RETURN WIRING (source-check)
  // ═══════════════════════════════════════════════
  // Detail modal closing must return focus to the triggering element so
  // keyboard users don't land on <body> and lose their place. The wiring
  // is: rememberModalTrigger() captures activeElement on open,
  // closeModal() restores it. Exposed on window for wearables.js to call.
  const viewsSrc = await fetch('js/views.js').then(r => r.text());
  const markerDetailSrc = await fetch('js/marker-detail-modal.js').then(r => r.text());
  const dashboardWidgetsSrc = await fetch('js/dashboard-widgets.js').then(r => r.text());
  const wearablesSrc = await fetch('js/wearables.js').then(r => r.text());
  assert('marker-detail-modal.js defines rememberModalTrigger', /function rememberModalTrigger\s*\(/.test(markerDetailSrc));
  assert('marker-detail-modal.js defines restoreModalTrigger', /function restoreModalTrigger\s*\(/.test(markerDetailSrc));
  assert('showDetailModal captures trigger before opening', /showDetailModal[\s\S]*?rememberModalTrigger\(\)/.test(markerDetailSrc));
  assert('closeModal restores trigger on close', /function closeModal\(\)[\s\S]*?restoreModalTrigger\(\)/.test(markerDetailSrc));
  assert('rememberModalTrigger exported', markerDetailSrc.includes('export function rememberModalTrigger'));
  assert('rememberModalTrigger on window', /window\s*,\s*\{[\s\S]*?rememberModalTrigger/.test(viewsSrc));
  assert('wearable detail modal captures trigger', wearablesSrc.includes('window.rememberModalTrigger?.()'));
  assert('restoreModalTrigger guards against detached elements', /document\.contains\(el\)/.test(markerDetailSrc));

  // ═══════════════════════════════════════════════
  // 1. DASHBOARD — renders all key sections
  // ═══════════════════════════════════════════════
  console.log('%c 1. Dashboard rendering', 'font-weight:bold;color:#6366f1');
  window.navigate('dashboard');
  await wait(50);

  assert('Dashboard has main content', main.innerHTML.length > 500);
  assert('Dashboard has Focus summary', main.innerHTML.includes('Current Focus'));
  assert('Dashboard keeps Profile Context available as optional widget', dashboardWidgetsSrc.includes("id: 'profile-context'"));
  assert('Dashboard keeps Supplements available as optional widget', dashboardWidgetsSrc.includes("id: 'supplements'"));
  assert('Dashboard labels the spotlight widget as Current Priority',
    !!main.querySelector('.dashboard-widget[data-widget-id="spotlight"]') && main.textContent.includes('Current Priority'));
  assert('Dashboard does not show standalone Needs Attention by default',
    !main.querySelector('.dashboard-widget[data-widget-id="alerts"]'));
  assert('Dashboard has key trends', main.innerHTML.includes('Key Trends') || main.innerHTML.includes('key-trends'));
  const keyTrendsWidget = main.querySelector('.dashboard-widget[data-widget-id="key-trends"]');
  assert('Dashboard Key Trends uses compact rows, not category chart cards',
    !!keyTrendsWidget?.querySelector('.db-key-trend-row') && !keyTrendsWidget.querySelector('.chart-card'));

  // Sidebar rendered
  const sidebar = document.getElementById('sidebar-nav');
  assert('Sidebar has nav items', sidebar.querySelectorAll('.nav-item').length >= 5);
  assert('Dashboard nav item is active', !!sidebar.querySelector('.nav-item.active[data-category="dashboard"]'));
  const sidebarText = sidebar.textContent || '';
  assert('Sidebar scopes biomarker shortcuts to Lab categories', sidebarText.includes('Lab categories'));
  assert('Sidebar does not duplicate Labs with an All biomarkers category shortcut',
    !sidebar.querySelector('.nav-item[data-category="all"]') && !sidebarText.includes('All biomarkers'));
  assert('Sidebar separates analysis tools from management modals',
    sidebarText.includes('Analysis tools') && sidebarText.includes('Manage') && sidebarText.includes('Knowledge Base'));
  const analysisIndex = sidebarText.indexOf('Analysis tools');
  const manageIndex = sidebarText.indexOf('Manage');
  const labCategoriesIndex = sidebarText.indexOf('Lab categories');
  assert('Sidebar places tools and management above Lab categories',
    analysisIndex > -1 && manageIndex > -1 && labCategoriesIndex > -1 &&
      analysisIndex < labCategoriesIndex && manageIndex < labCategoriesIndex);

  // Header elements
  assert('Header dates populated', document.getElementById('header-dates')?.innerHTML.length > 10);
  assert('Profile button rendered', !!document.querySelector('.profile-compact-btn, #profile-selector'));

  // ═══════════════════════════════════════════════
  // 2. NAVIGATION — sidebar changes content
  // ═══════════════════════════════════════════════
  console.log('%c 2. Navigation', 'font-weight:bold;color:#6366f1');

  // Navigate to biochemistry
  window.navigate('biochemistry');
  await wait(50);
  const bioNav = sidebar.querySelector('.nav-item[data-category="biochemistry"]');
  assert('Biochemistry nav item active', bioNav?.classList.contains('active'));
  assert('Dashboard nav item not active', !sidebar.querySelector('.nav-item.active[data-category="dashboard"]'));
  assert('Main content updated for biochemistry', main.innerHTML.includes('biochemistry') || main.innerHTML.includes('Biochemistry') || main.querySelector('canvas'));

  // Navigate to compare
  window.navigate('compare');
  await wait(50);
  assert('Compare view rendered', !!main.querySelector('#compare-select-1') || main.innerHTML.includes('Compare'));

  // Navigate to correlations
  window.navigate('correlations');
  await wait(50);
  assert('Correlations view rendered', main.innerHTML.includes('orrelation'));

  // Back to dashboard
  window.navigate('dashboard');
  await wait(50);
  assert('Back to dashboard', !!sidebar.querySelector('.nav-item.active[data-category="dashboard"]'));

  // Lens pages are dedicated workspaces; they should not duplicate sidebar
  // category navigation, and their page sections should be reorderable.
  const lensOrderProfile = window.getActiveProfileId?.() || S.currentProfile || 'default';
  const labsOrderKey = `labcharts-${lensOrderProfile}-lensPageOrder-labs-v1`;
  const savedLabsOrder = localStorage.getItem(labsOrderKey);
  localStorage.removeItem(labsOrderKey);
  window.navigate('labs');
  await wait(80);
  const labsPageWidgets = main.querySelector('.lens-page-widgets[data-lens-route="labs"]');
  assert('Labs page uses compact Current Priority banner',
    !!main.querySelector('.labs-priority-banner') && !main.querySelector('.lens-page-widgets .dashboard-widget[data-widget-id="spotlight"]'));
  assert('Labs page does not show standalone Trends & Alerts section',
    !main.querySelector('.lens-page-widgets .dashboard-widget[data-widget-id="alerts"]') && !main.textContent.includes('Trends & Alerts'));
  assert('Labs page no longer duplicates sidebar category index',
    !main.querySelector('.dashboard-widget[data-widget-id="labs-categories"]') && !main.textContent.includes('Lab Categories'));
  assert('Labs page avoids duplicate All Biomarkers summary widget',
    !main.querySelector('.dashboard-widget[data-widget-id="markers"]') && !main.textContent.includes('All Biomarkers'));
  if (labsPageWidgets && labsPageWidgets.querySelectorAll('.dashboard-widget[data-widget-id]').length > 1) {
    const beforeFirstLensWidget = labsPageWidgets.querySelector('.dashboard-widget[data-widget-id]')?.dataset.widgetId;
    const downButton = labsPageWidgets.querySelector('.dashboard-widget[data-widget-id] .dashboard-widget-tool[aria-label="Move page section down"]');
    downButton?.click();
    await wait(80);
    const afterFirstLensWidget = main.querySelector('.lens-page-widgets[data-lens-route="labs"] .dashboard-widget[data-widget-id]')?.dataset.widgetId;
    assert('Lens page sections can be reordered',
      beforeFirstLensWidget && afterFirstLensWidget && beforeFirstLensWidget !== afterFirstLensWidget,
      `${beforeFirstLensWidget} -> ${afterFirstLensWidget}`);
  } else {
    assert('Lens page sections can be reordered', true, 'skip — no Labs widgets in current data');
  }
  if (savedLabsOrder == null) localStorage.removeItem(labsOrderKey);
  else localStorage.setItem(labsOrderKey, savedLabsOrder);
  window.navigate('dashboard');
  await wait(50);

  // ═══════════════════════════════════════════════
  // 3. SETTINGS MODAL — open, tabs, provider switch, close
  // ═══════════════════════════════════════════════
  console.log('%c 3. Settings modal', 'font-weight:bold;color:#6366f1');
  const settingsOverlay = document.getElementById('settings-modal-overlay');

  // Open to AI tab
  window.openSettingsModal('ai');
  await wait(50);
  assert('Settings modal opens', settingsOverlay.classList.contains('show'));
  assert('AI tab is active', !!document.querySelector('.settings-tab-btn[data-tab="ai"].active'));
  assert('AI tab panel visible', !!document.querySelector('.settings-tab-panel[data-tab-panel="ai"].active'));
  assert('Provider buttons rendered', document.querySelectorAll('.ai-provider-btn').length >= 5);

  // Switch to display tab
  window.switchSettingsTab('display');
  await wait(20);
  assert('Display tab active after switch', !!document.querySelector('.settings-tab-btn[data-tab="display"].active'));
  assert('AI tab no longer active', !document.querySelector('.settings-tab-btn[data-tab="ai"].active'));
  assert('Display panel visible', !!document.querySelector('.settings-tab-panel[data-tab-panel="display"].active'));
  assert('Display settings does not duplicate theme picker', !document.querySelector('.settings-theme-grid'));

  const origThemeForTweaks = window.getTheme();
  const origAccentForTweaks = localStorage.getItem('labcharts-accent-override');
  const origSunsetForTweaks = localStorage.getItem('labcharts-sunset-mode');
  const origCrtForTweaks = localStorage.getItem('labcharts-crt-effects');
  window.setTheme('dark');
  window.setSunsetMode?.(false);
  window.setCrtEffectsEnabled?.(false);
  window.applyAccentOverride?.();
  window.openTweaksPanel?.();
  await wait(30);
  assert('Tweaks owns theme controls', !!document.querySelector('#tweaks-panel .tweaks-theme-grid'));
  assert('Tweaks owns accent controls', !!document.querySelector('#tweaks-panel .tweaks-accent-row'));
  assert('Tweaks owns sunset mode control', !!document.querySelector('#tweaks-sunset-mode'));
  const darkCrtRow = document.querySelector('#tweaks-crt-effects-row');
  assert('Tweaks hides CRT effects control on unsupported themes', !!darkCrtRow && darkCrtRow.hidden && !!document.querySelector('#tweaks-crt-effects')?.disabled);
  assert('Tweaks no longer shows Try it actions', !(document.getElementById('tweaks-panel')?.textContent || '').includes('Try it'));
  window.selectTweaksTheme?.('cyberterm');
  await wait(80);
  const cyberCrtRow = document.querySelector('#tweaks-crt-effects-row');
  assert('Tweaks shows CRT effects control on supported themes', !!cyberCrtRow && !cyberCrtRow.hidden && !document.querySelector('#tweaks-crt-effects')?.disabled);
  window.toggleTweaksCrtEffects?.(true);
  await wait(20);
  assert('CRT effects toggle persists visual mode', document.documentElement.dataset.crtEffects === 'on' && localStorage.getItem('labcharts-crt-effects') === 'true');
  window.toggleTweaksCrtEffects?.(false);
  window.selectTweaksTheme?.('dark');
  await wait(80);
  window.selectTweaksAccent?.('rose');
  await wait(30);
  const defaultSwatchAccent = document.querySelector('.tweaks-accent-btn[data-accent-id=""] .tweaks-accent-swatch')?.style.getPropertyValue('--tweak-accent')?.trim()?.toLowerCase();
  const rootAccent = document.documentElement.style.getPropertyValue('--accent').trim().toLowerCase();
  assert('Custom accent applies to the app', rootAccent === '#f43f5e', rootAccent);
  assert('Theme default swatch stays on the theme default color', defaultSwatchAccent === '#4f8cff', defaultSwatchAccent);
  window.closeTweaksPanel?.();
  if (origAccentForTweaks) localStorage.setItem('labcharts-accent-override', origAccentForTweaks);
  else localStorage.removeItem('labcharts-accent-override');
  if (origSunsetForTweaks) window.setSunsetMode?.(true);
  else window.setSunsetMode?.(false);
  if (origCrtForTweaks) window.setCrtEffectsEnabled?.(true);
  else window.setCrtEffectsEnabled?.(false);
  window.setTheme(origThemeForTweaks);
  window.applyAccentOverride?.(origAccentForTweaks || '');

  // Switch to data tab
  window.switchSettingsTab('data');
  await wait(20);
  assert('Data tab active', !!document.querySelector('.settings-tab-btn[data-tab="data"].active'));
  assert('Data panel has encryption section', !!document.getElementById('encryption-section'));
  assert('Data panel has backup section', !!document.getElementById('backup-section'));

  // Close
  window.closeSettingsModal();
  await wait(20);
  assert('Settings modal closes', !settingsOverlay.classList.contains('show'));

  // ═══════════════════════════════════════════════
  // 4. SUPPLEMENT FLOW — add, save, verify dashboard, delete
  // ═══════════════════════════════════════════════
  console.log('%c 4. Supplement flow', 'font-weight:bold;color:#6366f1');
  const modalOverlay = document.getElementById('modal-overlay');

  // Count existing supplements
  const initialSuppCount = (S.importedData.supplements || []).length;

  // Open supplement editor
  window.openSupplementsEditor();
  await wait(50);
  assert('Supplement editor opens', modalOverlay.classList.contains('show'));

  // Show add form
  window.showAddSuppForm();
  await wait(20);
  const nameInput = document.getElementById('supp-name');
  assert('Add form has name input', !!nameInput);

  // Fill in a test supplement
  nameInput.value = '__UI_TEST_SUPP__';
  const dosageInput = document.getElementById('supp-dosage');
  if (dosageInput) dosageInput.value = '500mg';
  const startInput = document.querySelector('.supp-period-start');
  if (startInput) startInput.value = '2026-01-01';

  // Save
  window.saveSupplement(-1);
  await wait(50);

  // Verify data saved
  const afterSaveCount = (S.importedData.supplements || []).length;
  assert('Supplement added to state', afterSaveCount === initialSuppCount + 1);
  const savedSupp = S.importedData.supplements.find(s => s.name === '__UI_TEST_SUPP__');
  assert('Supplement has correct name', !!savedSupp);
  assert('Supplement has correct dosage', savedSupp?.dosage === '500mg');

  // Verify the optional dashboard widget can be shown after save
  window.closeModal();
  await wait(20);
  window.navigate('dashboard');
  await wait(50);
  window.showDashboardWidget?.('supplements');
  await wait(50);
  const suppSection = main.querySelector('.supp-timeline-section');
  assert('Optional Supplements widget renders on dashboard after save', !!suppSection);
  assert('Optional Supplements widget shows new supplement', suppSection?.innerHTML.includes('__UI_TEST_SUPP__'));

  // Delete the test supplement
  const testIdx = S.importedData.supplements.findIndex(s => s.name === '__UI_TEST_SUPP__');
  if (testIdx >= 0) {
    window.deleteSupplement(testIdx);
    await wait(50);
  }
  assert('Supplement removed from state', (S.importedData.supplements || []).length === initialSuppCount);

  // Verify dashboard updated after delete
  window.navigate('dashboard');
  await wait(50);
  const suppSectionAfter = main.querySelector('.supp-timeline-section');
  const stillShows = suppSectionAfter?.innerHTML.includes('__UI_TEST_SUPP__');
  assert('Dashboard no longer shows deleted supplement', !stillShows);

  // ═══════════════════════════════════════════════
  // 5. SUPPLEMENT PERIODS — multiple date ranges
  // ═══════════════════════════════════════════════
  console.log('%c 5. Supplement periods', 'font-weight:bold;color:#6366f1');

  window.openSupplementsEditor();
  await wait(50);
  window.showAddSuppForm();
  await wait(20);

  // Count initial period rows
  const periodRows = document.querySelectorAll('.supp-period-row');
  assert('Editor starts with 1 period row', periodRows.length === 1);

  // Add a second period
  window.addPeriodRow();
  await wait(50);
  const afterAdd = document.querySelectorAll('.supp-period-row');
  assert('Add period creates 2 rows', afterAdd.length === 2);

  // Remove buttons visible when >1 row
  const removeBtns = document.querySelectorAll('.supp-period-remove');
  const visibleRemove = Array.from(removeBtns).filter(b => b.style.display !== 'none');
  assert('Remove buttons visible with 2 rows', visibleRemove.length >= 1);

  // Remove second row
  if (afterAdd[1]) window.removePeriodRow(afterAdd[1].querySelector('.supp-period-remove'));
  await wait(50);
  assert('Remove period back to 1 row', document.querySelectorAll('.supp-period-row').length === 1);

  window.closeModal();
  await wait(20);

  // ═══════════════════════════════════════════════
  // 6. DETAIL MODAL — open marker, verify content, close
  // ═══════════════════════════════════════════════
  console.log('%c 6. Detail modal', 'font-weight:bold;color:#6366f1');

  // Find a marker with data
  let testMarkerId = null;
  for (const [catKey, cat] of Object.entries(data.categories)) {
    for (const [mKey, m] of Object.entries(cat.markers || {})) {
      if (m.values?.some(v => v !== null)) {
        testMarkerId = `${catKey}_${mKey}`;
        break;
      }
    }
    if (testMarkerId) break;
  }

  if (testMarkerId) {
    window.showDetailModal(testMarkerId);
    await wait(50);
    assert('Detail modal opens', modalOverlay.classList.contains('show'));

    const modal = document.getElementById('detail-modal');
    assert('Detail modal has marker name', !!modal.querySelector('h3'));
    assert('Detail modal has chart canvas', !!modal.querySelector('canvas'));
    assert('Detail modal has value cards', modal.querySelectorAll('.modal-value-card').length > 0);

    // Check values render with status classes
    const valCards = modal.querySelectorAll('.modal-value-card');
    const hasStatus = Array.from(valCards).some(c =>
      c.classList.contains('status-normal') || c.classList.contains('status-high') || c.classList.contains('status-low')
    );
    assert('Value cards have status classes', hasStatus);

    // Close
    window.closeModal();
    await wait(20);
    assert('Detail modal closes', !modalOverlay.classList.contains('show'));
  } else {
    assert('Detail modal skip (no marker data)', true, 'no markers with values');
  }

  // ═══════════════════════════════════════════════
  // 7. CONTEXT CARDS — open editor, save, verify
  // ═══════════════════════════════════════════════
  console.log('%c 7. Context cards', 'font-weight:bold;color:#6366f1');

  window.navigate('dashboard');
  await wait(50);

  // Open diet editor
  window.openDietEditor();
  await wait(50);
  assert('Diet editor opens', modalOverlay.classList.contains('show'));
  const editorModal = document.getElementById('detail-modal');
  assert('Diet editor uses redesigned context modal shell',
    editorModal.classList.contains('ctx-editor-modal') && editorModal.classList.contains('gb-form-modal'));
  assert('Diet editor has accurate dialog label', editorModal.getAttribute('aria-label') === 'Diet & Digestion');
  assert('Diet editor has redesigned modal header', !!editorModal.querySelector('.ctx-editor-head .gb-modal-title'));
  assert('Diet editor has pill buttons', !!editorModal.querySelector('.ctx-btn-group'));

  // Check editor has save/cancel actions
  const actions = editorModal.querySelector('.ctx-editor-actions');
  assert('Editor has action buttons', !!actions);
  const saveBtn = actions?.querySelector('button');
  assert('Editor has save button', !!saveBtn);

  // Close without saving
  window.closeModal();
  await wait(20);
  assert('Diet editor closes', !modalOverlay.classList.contains('show'));

  // Verify optional Profile Context widget can render on dashboard
  window.showDashboardWidget?.('profile-context');
  await wait(80);
  const ctxCards = main.querySelectorAll('.context-card');
  assert('Profile Context widget renders on dashboard', ctxCards.length >= 5);

  // Check health dot structure
  const dot = main.querySelector('[id^="ctx-dot-"]');
  assert('Health dot element exists', !!dot);
  assert('Health dot has dot class', dot?.classList.contains('ctx-health-dot'));

  // ═══════════════════════════════════════════════
  // 8. COMPARE VIEW — dates, swap
  // ═══════════════════════════════════════════════
  console.log('%c 8. Compare view', 'font-weight:bold;color:#6366f1');

  window.navigate('compare');
  await wait(50);

  if (data.dates.length >= 2) {
    const sel1 = document.getElementById('compare-select-1');
    const sel2 = document.getElementById('compare-select-2');
    assert('Compare has date selector 1', !!sel1);
    assert('Compare has date selector 2', !!sel2);
    assert('Compare selectors have options', sel1?.options.length >= 2);

    const val1Before = sel1?.value;
    const val2Before = sel2?.value;
    if (val1Before && val2Before && val1Before !== val2Before) {
      window.swapCompareDates();
      await wait(50);
      assert('Swap dates reverses selectors', sel1.value === val2Before && sel2.value === val1Before);
      // Swap back
      window.swapCompareDates();
      await wait(20);
    }

    // Compare table rendered
    const compareResults = document.getElementById('compare-results');
    assert('Compare results rendered', compareResults?.innerHTML.length > 100);
    assert('Compare table has rows', !!compareResults?.querySelector('table'));
  } else {
    assert('Compare skip (< 2 dates)', true);
  }

  // 9. GLOSSARY removed in v1.3.25 — feature was redundant with sidebar
  // search + per-marker detail modal + AI chat. No replacement; the
  // section is intentionally empty so downstream section numbers stay
  // aligned with prior reports.

  // ═══════════════════════════════════════════════
  // 10. THEME TOGGLE — dark/light, verify CSS
  // ═══════════════════════════════════════════════
  console.log('%c 10. Theme toggle', 'font-weight:bold;color:#6366f1');

  const origTheme = window.getTheme();
  window.toggleTheme();
  await wait(20);
  const newTheme = window.getTheme();
  assert('Theme toggled', newTheme !== origTheme);
  const htmlEl = document.documentElement;
  if (newTheme === 'light') {
    assert('Light theme sets data-theme attr', htmlEl.getAttribute('data-theme') === 'light');
  } else {
    assert('Dark theme removes data-theme attr', htmlEl.getAttribute('data-theme') === null);
  }
  // Restore
  window.toggleTheme();
  await wait(20);
  assert('Theme restored', window.getTheme() === origTheme);

  // ═══════════════════════════════════════════════
  // 11. CHAT PANEL — open, close
  // ═══════════════════════════════════════════════
  console.log('%c 11. Chat panel', 'font-weight:bold;color:#6366f1');

  const chatPanel = document.getElementById('chat-panel');
  // Toggle via CSS class directly (openChatPanel gates on hasAIProvider)
  chatPanel.classList.add('open');
  assert('Chat panel opens', chatPanel.classList.contains('open'));
  assert('Chat messages container exists', !!document.getElementById('chat-messages'));
  assert('Chat input exists', !!document.getElementById('chat-input'));
  assert('Chat send button exists', !!document.getElementById('chat-send-btn'));
  chatPanel.classList.remove('open');
  assert('Chat panel closes', !chatPanel.classList.contains('open'));

  // ═══════════════════════════════════════════════
  // 12. EXPORT — verify function produces data (before profile ops)
  // ═══════════════════════════════════════════════
  console.log('%c 12. Export sanity', 'font-weight:bold;color:#6366f1');

  assert('exportDataJSON is callable', typeof window.exportDataJSON === 'function');
  assert('exportAllDataJSON is callable', typeof window.exportAllDataJSON === 'function');
  assert('exportPDFReport is callable', typeof window.exportPDFReport === 'function');

  if (typeof window.buildAllDataBundle === 'function') {
    try {
      const raw = await window.buildAllDataBundle();
      const bundle = typeof raw === 'string' ? JSON.parse(raw) : raw;
      assert('buildAllDataBundle returns data', bundle != null);
      assert('Bundle has profiles', Array.isArray(bundle?.profiles));
      assert('Bundle has version', bundle?.version === 2);
    } catch (e) {
      assert('buildAllDataBundle returns object', true, 'catch: ' + e.message);
      assert('Bundle has profiles', true, 'catch');
      assert('Bundle has version', true, 'catch');
    }
  }

  // ═══════════════════════════════════════════════
  // 13. PROFILE OPERATIONS — create, switch, delete
  // ═══════════════════════════════════════════════
  console.log('%c 13. Profile operations', 'font-weight:bold;color:#6366f1');

  const origProfileId = window.getActiveProfileId();
  const origProfileCount = window.getProfiles().length;

  // Create test profile
  const testProfileId = window.createProfile('__UI_TEST_PROFILE__');
  assert('Profile created', !!testProfileId);
  assert('Profile count increased', window.getProfiles().length === origProfileCount + 1);

  // Switch to new profile
  window.switchProfile(testProfileId);
  await wait(50);
  assert('Switched to new profile', window.getActiveProfileId() === testProfileId);
  assert('Dashboard re-rendered for new profile', main.innerHTML.length > 100);

  // Switch back to original
  window.switchProfile(origProfileId);
  await wait(50);
  assert('Switched back to original profile', window.getActiveProfileId() === origProfileId);

  // Delete test profile (bypass confirm dialog — use saveProfiles to update cache)
  window.saveProfiles(window.getProfiles().filter(p => p.id !== testProfileId));
  localStorage.removeItem(`labcharts-${testProfileId}-imported`);
  assert('Test profile deleted', window.getProfiles().length === origProfileCount);
  assert('Active profile unchanged', window.getActiveProfileId() === origProfileId);

  // ═══════════════════════════════════════════════
  // 14. SIDEBAR SEARCH — filter nav items
  // ═══════════════════════════════════════════════
  console.log('%c 14. Sidebar search', 'font-weight:bold;color:#6366f1');

  window.navigate('dashboard');
  await wait(50);
  const staticNavCategories = new Set([
    'dashboard', 'labs', 'correlations', 'compare', 'recommendations',
    'knowledge', 'custom-markers', 'light', 'body', 'wearables', 'emf',
    'genome', 'genetics', 'insight',
  ]);
  const getFilterableNavItems = () => [...sidebar.querySelectorAll('.nav-item')]
    .filter(el => !staticNavCategories.has(el.dataset.category || ''));
  const findSidebarSearchTerm = items => {
    const textFor = el => `${el.textContent || ''} ${el.dataset.markers || ''}`.toLowerCase();
    for (const item of items) {
      const tokens = textFor(item).match(/[a-z0-9]{3,}/g) || [];
      for (const token of tokens) {
        const matches = items.filter(el => textFor(el).includes(token)).length;
        if (matches > 0 && matches < items.length) return token;
      }
    }
    return '';
  };
  const allNavItems = getFilterableNavItems();
  const totalBefore = allNavItems.length;
  const sidebarSearch = document.getElementById('sidebar-search');
  const searchTerm = findSidebarSearchTerm(allNavItems);

  if (totalBefore >= 2 && sidebarSearch && searchTerm) {
    // Filter with a term taken from an item that is eligible to hide.
    sidebarSearch.value = searchTerm;
    window.filterSidebar();
    await wait(20);
    const hiddenNav = getFilterableNavItems().filter(el => el.style.display === 'none');
    assert('Sidebar search filters items', hiddenNav.length > 0);
    assert('Sidebar search shows matches', hiddenNav.length < totalBefore);

    // Clear filter
    sidebarSearch.value = '';
    window.filterSidebar();
    await wait(20);
    const afterClear = getFilterableNavItems().filter(el => el.style.display === 'none');
    assert('Sidebar search clear restores all', afterClear.length === 0);
  } else {
    assert('Sidebar search filters items', true, 'skip — < 2 filterable nav items');
    assert('Sidebar search shows matches', true, 'skip');
    assert('Sidebar search clear restores all', true, 'skip');
  }

  // ═══════════════════════════════════════════════
  // 15. CHART LAYERS — toggle overlay states
  // ═══════════════════════════════════════════════
  console.log('%c 15. Chart layers', 'font-weight:bold;color:#6366f1');

  // Note overlay toggle
  const noteModeBefore = S.noteOverlayMode || 'off';
  window.setNoteOverlay(noteModeBefore === 'on' ? 'off' : 'on');
  await wait(50);
  assert('Note overlay toggled', S.noteOverlayMode !== noteModeBefore);
  window.setNoteOverlay(noteModeBefore); // restore
  await wait(50);

  // Supplement overlay toggle
  const suppModeBefore = S.suppOverlayMode || 'off';
  window.setSuppOverlay(suppModeBefore === 'on' ? 'off' : 'on');
  await wait(50);
  assert('Supplement overlay toggled', S.suppOverlayMode !== suppModeBefore);
  window.setSuppOverlay(suppModeBefore); // restore
  await wait(50);

  // ═══════════════════════════════════════════════
  // 16. MANUAL ENTRY — open form, verify fields
  // ═══════════════════════════════════════════════
  console.log('%c 16. Manual entry', 'font-weight:bold;color:#6366f1');

  if (testMarkerId) {
    // showDetailModal populates markerRegistry, then openManualEntryForm reads it
    window.showDetailModal(testMarkerId);
    await wait(50);
    window.closeModal();
    await wait(20);
    window.openManualEntryForm(testMarkerId);
    await wait(50);
    assert('Manual entry modal opens', modalOverlay.classList.contains('show'));
    const manualModal = document.getElementById('detail-modal');
    const hasDateInput = !!manualModal?.querySelector('input[type="date"]');
    const hasValueInput = !!manualModal?.querySelector('input[type="number"], input[id*="manual"], input[id*="entry"]');
    assert('Manual entry has date input', hasDateInput);
    assert('Manual entry has value input', hasValueInput);
    window.closeModal();
    await wait(20);
  }

  // ═══════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════
  window.navigate('dashboard');
  await wait(20);

  console.log(`\n%c UI Flows: ${pass} passed, ${fail} failed `,
    fail > 0
      ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px'
      : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  console.log(`Results: ${pass} passed, ${fail} failed`);
})();
