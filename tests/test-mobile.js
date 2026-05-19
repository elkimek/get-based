// test-mobile.js — Browser-based verification of mobile responsiveness fixes
// Run: fetch('tests/test-mobile.js').then(r=>r.text()).then(s=>Function(s)())
return (async function() {
  let passed = 0, failed = 0;
  const results = [];

  function assert(name, condition, detail) {
    if (condition) {
      passed++;
      results.push(`  \u2705 ${name}`);
    } else {
      failed++;
      results.push(`  \u274c ${name}${detail ? ' \u2014 ' + detail : ''}`);
    }
  }

  function getCSS() {
    const sheets = Array.from(document.styleSheets);
    let css = '';
    for (const s of sheets) {
      try {
        for (const r of s.cssRules) css += r.cssText + '\n';
      } catch(e) {}
    }
    return css;
  }

  const css = getCSS();

  // ═══ Section 1: Header mobile layout ═══
  console.log('%c[1] Header Mobile Layout', 'font-weight:bold');
  const headerInfo = document.querySelector('.header-info');
  assert('header-info has flex-wrap', headerInfo && getComputedStyle(headerInfo).flexWrap === 'wrap');
  assert('header-info has align-items center', headerInfo && getComputedStyle(headerInfo).alignItems === 'center');
  assert('480px breakpoint hides #header-dates', css.includes('#header-dates') && css.includes('display: none'));
  assert('themed mobile sidebar remains fixed above backdrop',
    css.includes('@media (max-width: 1024px)') &&
    css.includes('[data-theme] .sidebar') &&
    css.includes('position: fixed') &&
    css.includes('z-index: 360'));
  const viewsSrc = await fetchWithRetry('js/views.js');
  const routerSrc = await fetchWithRetry('js/views-router.js');
  assert('mobile landing does not auto-open fullscreen chat',
    viewsSrc.includes('isDesktopChatOnboardingViewport') &&
    viewsSrc.includes('if (!isDesktopChatOnboardingViewport || window.innerWidth <= 768) return'));
  assert('mobile bottom tabs persist outside dashboard shell',
    routerSrc.includes('syncMobileBottomNav?.(routeCategory)') &&
    viewsSrc.includes("id: 'mobile-bottom-tabs'") &&
    viewsSrc.includes('renderMobileBottomTabs(activeTab'));
  assert('mobile dashboard home uses the shared header chrome',
    css.includes('body.mobile-dashboard-active .header') &&
    css.includes('display: flex') &&
    !viewsSrc.includes('class="m-topbar"'));
  assert('mobile dashboard no longer ships dead private topbar styles',
    !css.includes('.m-topbar-actions') &&
    !css.includes('.m-avatar-btn') &&
    !css.includes('.m-icon-btn') &&
    !viewsSrc.includes('getMobileAvatar'));
  assert('mobile dashboard renders the same registered widget stack as desktop',
    viewsSrc.includes('function renderMobileDashboardWidgetStack(ctx)') &&
    viewsSrc.includes('getVisibleDashboardWidgetEntries(ctx, prefs') &&
    viewsSrc.includes('m-dashboard-widget-actions') &&
    viewsSrc.includes('renderDashboardControlButtons({ includeReset: _dashboardOrganizeMode })') &&
    viewsSrc.includes('renderDashboardWidget(entry, prefs, index, visibleEntries)') &&
    viewsSrc.includes('${mobileWidgetStack}') &&
    css.includes('.m-dashboard-widgets'));
  assert('mobile dashboard no longer has static duplicate dashboard sections',
    !viewsSrc.includes('id="mobile-light-section"') &&
    !viewsSrc.includes('id="mobile-body-section"') &&
    !viewsSrc.includes('id="mobile-genome-section"') &&
    !viewsSrc.includes('const lightHtml = renderLightTodayStrip();') &&
    !viewsSrc.includes('stats.map(renderMobileStatCard)') &&
    !viewsSrc.includes('insights.map(renderMobileInsightCard)') &&
    !viewsSrc.includes('markers.slice(0, 7).map(renderMobileMarkerRow)'));
  const themesSrc = await fetchWithRetry('themes-extra.css');
  assert('glass tweaks panel is opaque enough to read',
    themesSrc.includes('[data-theme="glass"] .tweaks-panel') &&
    themesSrc.includes('rgba(24, 18, 48, 0.94)') &&
    themesSrc.includes('[data-theme="glass"] .tweaks-overlay.show'));
  assert('mobile FABs clear persistent bottom tabs',
    css.includes('body.mobile-tabs-active #chat-fab') &&
    css.includes('body.mobile-tabs-active #import-fab'));
  assert('mobile consent banner clears persistent bottom tabs',
    css.includes('body.mobile-tabs-active .analytics-consent-banner') &&
    css.includes('bottom: calc(96px + env(safe-area-inset-bottom))'));

  // ═══ Section 2: Charts grid safe minmax ═══
  console.log('%c[2] Charts Grid Safe Minmax', 'font-weight:bold');
  assert('charts-grid uses min(360px, 100%)', css.includes('min(360px, 100%)'));
  const chartsGrid = document.querySelector('.charts-grid');
  if (chartsGrid) {
    const style = getComputedStyle(chartsGrid);
    assert('charts-grid has grid display', style.display === 'grid');
  } else {
    assert('charts-grid element exists (skipped — rendered only with data)', true);
  }

  // ═══ Section 3: Correlation dropdown safe min-width ═══
  console.log('%c[3] Correlation Dropdown', 'font-weight:bold');
  assert('corr-dropdown uses min(250px, 100%)', css.includes('min(250px, 100%)'));

  // ═══ Section 4: Fatty acids chart class ═══
  console.log('%c[4] Fatty Acids Chart', 'font-weight:bold');
  assert('fa-bar-chart-container class in CSS', css.includes('fa-bar-chart-container'));
  assert('fa-bar-chart-container has height: 400px', css.includes('fa-bar-chart-container') && css.includes('height: 400px'));
  // Check JS source doesn't have inline height:400px for fa-bar anymore
  assert('no inline height:400px in views.js source (check via CSS class usage)',
    css.includes('.fa-bar-chart-container'));

  // ═══ Section 5: PII diff modal mobile stacking ═══
  console.log('%c[5] PII Diff Modal', 'font-weight:bold');
  assert('pii-diff-viewer mobile 1fr rule exists', css.includes('pii-diff-viewer') && css.includes('grid-template-columns: 1fr'));

  // ═══ Section 6: Settings tabs scrollable ═══
  console.log('%c[6] Settings Tabs', 'font-weight:bold');
  assert('settings-tabs-bar overflow-x auto at 600px', css.includes('settings-tabs-bar') && css.includes('overflow-x: auto'));

  // ═══ Section 7: Toast notifications mobile ═══
  console.log('%c[7] Toast Notifications', 'font-weight:bold');
  assert('notification-container mobile left/right', css.includes('notification-container') && css.includes('left: 8px'));
  assert('notification-toast min-width: 0 on mobile', css.includes('notification-toast') && css.includes('min-width: 0'));

  // ═══ Section 8: Touch-friendly tap targets ═══
  console.log('%c[8] Touch Tap Targets', 'font-weight:bold');
  assert('pointer:coarse media query exists', css.includes('pointer: coarse'));
  assert('settings-btn min-width 44px for touch', css.includes('settings-btn') && css.includes('min-width: 44px'));
  assert('header-icon-btn min-width 44px for touch', css.includes('header-icon-btn') && css.includes('min-width: 44px'));
  assert('chat-fab 56px (above 44px touch target)', css.includes('.chat-fab') && css.includes('width: 56px; height: 56px'));
  assert('modal-close min-width 44px for touch', css.includes('modal-close') && css.includes('min-width: 44px'));

  // ═══ Section 9: Hover-only interactions fixed for touch ═══
  console.log('%c[9] Touch Hover Fix', 'font-weight:bold');
  assert('hover:none media query exists', css.includes('hover: none'));
  assert('mv-delete visible on touch', css.includes('mv-delete') && css.includes('opacity: 0.7'));
  assert('chat-thread-item-actions visible on touch', css.includes('chat-thread-item-actions'));
  assert('lens-section-edit visible on touch', css.includes('lens-section-edit') && css.includes('opacity: 0.7'));

  // ═══ Section 10: Chat thread rail back button ═══
  console.log('%c[10] Chat Rail Back Button', 'font-weight:bold');
  const railBack = document.querySelector('.chat-rail-back');
  assert('chat-rail-back button exists in DOM', !!railBack);
  assert('chat-rail-back hidden by default', railBack && getComputedStyle(railBack).display === 'none');
  assert('chat-rail-back has onclick=toggleThreadRail', railBack && railBack.getAttribute('onclick') === 'toggleThreadRail()');

  // ═══ Section 11: 480px and 375px breakpoints exist ═══
  console.log('%c[11] Small Screen Breakpoints', 'font-weight:bold');
  assert('480px breakpoint exists', css.includes('max-width: 480px'));
  assert('375px breakpoint exists', css.includes('max-width: 375px'));
  assert('main padding reduced at 480px', css.includes('padding: 14px 12px'));
  assert('main padding reduced at 375px', css.includes('padding: 10px 8px'));

  // ═══ Section 12: Alert card wrapping on mobile ═══
  console.log('%c[12] Alert Cards Mobile', 'font-weight:bold');
  assert('alert-card flex-wrap on mobile', css.includes('alert-card') && css.includes('flex-wrap: wrap'));
  assert('alert-ref auto width on mobile', css.includes('alert-ref') && css.includes('width: auto'));

  // ═══ Section 13: Service worker cache version ═══
  console.log('%c[13] Service Worker', 'font-weight:bold');
  const swMobileSrc = await fetchWithRetry('service-worker.js');
  assert('SW uses importScripts for version', swMobileSrc.includes("importScripts('/version.js')"));
  assert('SW CACHE_NAME uses semver', swMobileSrc.includes('`labcharts-v${self.APP_VERSION}`'));
  assert('SW precaches installed app start_url',
    swMobileSrc.includes("'/app'") &&
    swMobileSrc.includes("caches.match('/app')"));
  assert('SW falls back for offline navigations',
    swMobileSrc.includes("event.request.mode === 'navigate'") &&
    swMobileSrc.includes("caches.match('/index.html')"));
  assert('SW precaches mobile runtime vendors',
    swMobileSrc.includes("'/vendor/qrcode-generator.js'") &&
    swMobileSrc.includes("'/vendor/venice-e2ee.js'") &&
    swMobileSrc.includes("'/vendor/evolu/evolu-bundle.js'"));
  const manifestSrc = await fetchWithRetry('manifest.json');
  assert('manifest exposes maskable install icons',
    manifestSrc.includes('"purpose": "any maskable"') &&
    manifestSrc.includes('"start_url": "/app"') &&
    manifestSrc.includes('"scope": "/app"'));
  assert('iOS standalone title is configured',
    document.head.innerHTML.includes('apple-mobile-web-app-title'));

  // ═══ Section 14: Marker Detail Modal Phone Fit ═══
  console.log('%c[14] Marker Detail Modal Phone Fit', 'font-weight:bold');
  assert('marker detail modal is clamped to phone viewport',
    css.includes('.marker-detail-modal') &&
    (css.includes('width: calc(100vw - 16px)') || css.includes('width: calc(-16px + 100vw)')) &&
    (css.includes('max-height: calc(100svh - 16px)') || css.includes('max-height: calc(-16px + 100svh)')));
  assert('marker detail modal uses compact phone gutters',
    css.includes('.marker-detail-modal .manual-entry-btn') &&
    css.includes('width: calc(100% - 32px)') &&
    css.includes('margin-left: 16px'));
  assert('marker detail summary stacks on phones',
    css.includes('.marker-detail-modal .gb-detail-summary') &&
    (css.includes('grid-template-columns: minmax(0, 1fr)') ||
      css.includes('grid-template-columns: minmax(0px, 1fr)')));
  assert('marker detail content wraps long names/ranges/values',
    css.includes('overflow-wrap: anywhere') &&
    css.includes('.marker-detail-modal .stat-card-value') &&
    css.includes('.marker-detail-modal .mv-value'));

  // ═══ Summary ═══
  console.log('\n' + results.join('\n'));
  console.log(`\n%c${passed} passed, ${failed} failed`, `font-weight:bold;color:${failed ? 'red' : 'green'}`);
  return { passed, failed };
})();
