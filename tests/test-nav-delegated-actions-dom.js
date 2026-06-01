// test-nav-delegated-actions-dom.js — live sidebar delegate coverage.
//
// Run: fetch('tests/test-nav-delegated-actions-dom.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Sidebar Nav Delegated Actions DOM ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const stateModule = await import('./js/state.js');
  const st = stateModule.state;
  const origDateRangeFilter = st.dateRangeFilter;
  const origCurrentView = st.currentView;
  const origProfiles = st.profiles;
  const origNavigate = window.navigate;
  const origOpenEMF = window.openEMFAssessmentEditor;
  const origOpenLightEnv = window.openLightEnvironmentAssessment;
  const origOpenKB = window.openKnowledgeBaseModal;
  const origOpenCreateMarker = window.openCreateMarkerModal;
  const origOpenClientList = window.openClientList;
  const origIsGroupInAI = window.isGroupInAIContext;
  const origSetGroupInAI = window.setGroupInAIContext;
  const origGroupStorage = localStorage.getItem('labcharts-navgroup-Hormones');

  try {
    const fixtureData = {
      dates: ['2026-05-15'],
      dateLabels: ['May 15'],
      categories: {
        metabolic: {
          label: 'Metabolic',
          markers: {
            glucose: { name: 'Glucose', values: [5.1], refMin: 3.5, refMax: 6.0, unit: 'mmol/L' }
          }
        },
        thyroid: {
          label: 'Hormones: Thyroid',
          group: 'Hormones',
          markers: {
            tsh: { name: 'TSH', values: [2.1], refMin: 0.4, refMax: 4.0, unit: 'mIU/L' }
          }
        }
      }
    };

    st.dateRangeFilter = 'all';
    st.currentView = 'dashboard';
    st.profiles = [{ id: st.currentProfile || 'default', name: 'Demo Client' }];
    localStorage.removeItem('labcharts-navgroup-Hormones');

    const calls = [];
    const aiGroups = new Set();
    window.navigate = route => {
      calls.push(['navigate', route]);
      st.currentView = route;
      window.syncSidebarActive?.(route);
    };
    window.openEMFAssessmentEditor = () => calls.push(['open-emf']);
    window.openLightEnvironmentAssessment = () => calls.push(['open-light-env']);
    window.openKnowledgeBaseModal = () => calls.push(['open-kb']);
    window.openCreateMarkerModal = () => calls.push(['open-custom-marker']);
    window.openClientList = () => calls.push(['open-client-list']);
    window.isGroupInAIContext = group => aiGroups.has(group);
    window.setGroupInAIContext = (group, on) => {
      calls.push(['set-group-ai', group, on]);
      if (on) aiGroups.add(group);
      else aiGroups.delete(group);
    };

    window.buildSidebar(fixtureData);
    window.renderProfileButton();

    const inlineHandler = document.querySelector('#sidebar-nav [onclick], #sidebar-nav [oninput], #sidebar-nav [onkeydown], #profile-selector [onclick]');
    assert('rendered sidebar/profile surfaces have no inline handlers', !inlineHandler, inlineHandler?.outerHTML || '');

    document.querySelector('#sidebar-nav .nav-item[data-category="labs"]')?.click();
    assert('delegated nav item click routes to labs',
      calls.some(c => c[0] === 'navigate' && c[1] === 'labs'));

    const compareItem = document.querySelector('#sidebar-nav .nav-item[data-category="compare"]');
    compareItem?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert('role-button keyboard activation still routes nav items',
      calls.some(c => c[0] === 'navigate' && c[1] === 'compare'));

    const search = document.getElementById('sidebar-search');
    if (search) {
      search.value = 'thyroid';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }
    assert('delegated search input filters non-matching lab categories',
      document.querySelector('#sidebar-nav .nav-item[data-category="metabolic"]')?.style.display === 'none');
    assert('delegated search input keeps matching grouped category visible',
      document.querySelector('#sidebar-nav .nav-item[data-category="thyroid"]')?.style.display !== 'none');

    const groupHeader = document.querySelector('.sidebar-group-header[data-group-name="Hormones"]');
    groupHeader?.click();
    assert('delegated group header click collapses group',
      groupHeader?.classList.contains('collapsed') &&
        document.querySelector('.sidebar-group-items[data-group-items="Hormones"]')?.style.display === 'none' &&
        groupHeader.querySelector('.sidebar-group-toggle')?.getAttribute('aria-expanded') === 'false');
    groupHeader?.click();
    assert('delegated group header click expands group',
      !groupHeader?.classList.contains('collapsed') &&
        document.querySelector('.sidebar-group-items[data-group-items="Hormones"]')?.style.display !== 'none' &&
        groupHeader?.querySelector('.sidebar-group-toggle')?.getAttribute('aria-expanded') === 'true');

    document.querySelector('.sidebar-group-header[data-group-name="Hormones"] .sidebar-ai-toggle')?.click();
    assert('delegated group AI toggle updates group context',
      aiGroups.has('Hormones') &&
        calls.some(c => c[0] === 'set-group-ai' && c[1] === 'Hormones' && c[2] === true));

    document.querySelector('#sidebar-nav .nav-item[data-category="emf"]')?.click();
    document.querySelector('#sidebar-nav .nav-item[data-category="light-env-assessment"]')?.click();
    document.querySelector('#sidebar-nav .nav-item[data-category="knowledge"]')?.click();
    document.querySelector('#sidebar-nav .nav-item[data-category="custom-markers"]')?.click();
    document.querySelector('#sidebar-nav .sidebar-add-marker')?.click();
    document.querySelector('#profile-selector .profile-compact-btn')?.click();
    assert('delegated utility actions call their handlers',
      calls.some(c => c[0] === 'open-emf') &&
        calls.some(c => c[0] === 'open-light-env') &&
        calls.some(c => c[0] === 'open-kb') &&
        calls.filter(c => c[0] === 'open-custom-marker').length >= 2 &&
        calls.some(c => c[0] === 'open-client-list'));
  } finally {
    st.dateRangeFilter = origDateRangeFilter;
    st.currentView = origCurrentView;
    st.profiles = origProfiles;
    window.navigate = origNavigate;
    window.openEMFAssessmentEditor = origOpenEMF;
    window.openLightEnvironmentAssessment = origOpenLightEnv;
    window.openKnowledgeBaseModal = origOpenKB;
    window.openCreateMarkerModal = origOpenCreateMarker;
    window.openClientList = origOpenClientList;
    window.isGroupInAIContext = origIsGroupInAI;
    window.setGroupInAIContext = origSetGroupInAI;
    if (origGroupStorage == null) localStorage.removeItem('labcharts-navgroup-Hormones');
    else localStorage.setItem('labcharts-navgroup-Hormones', origGroupStorage);
    window.buildSidebar?.();
    window.renderProfileButton?.();
  }

  console.log(`\n%c Sidebar Nav Delegated Actions DOM: ${pass} passed, ${fail} failed `, fail > 0 ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS === 'undefined') window.__TEST_RESULTS = {};
  window.__TEST_RESULTS['test-nav-delegated-actions-dom'] = { pass, fail };
})();
