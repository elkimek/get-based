import { JSDOM } from 'jsdom';
import type { MarkerDetailActionName, MarkerDetailActionView, MarkerDetailChromeView } from '../../js/marker-detail-view.js';

export interface AuditMarkupCheck {
  selector: string;
  text?: string;
  ownText?: string;
  attribute?: { name: string; value: string };
}
/** Security assertions concern decoded text/attribute values and forbidden
 * executable markup. Complete genuine HTML is retained in each witness. */
export function auditMarkupSafe(html: string, checks: readonly AuditMarkupCheck[]): boolean {
  const browser = new JSDOM('<!doctype html><body></body>');
  try {
    const body = browser.window.document.body;
    body.innerHTML = html;
    if (body.querySelector('script,img,iframe,object,[data-audit-injected]')) return false;
    if ([...body.querySelectorAll('*')].some(element => [...element.attributes].some(attribute => /^on/i.test(attribute.name)))) return false;
    return checks.every(check => {
      const element = body.querySelector(check.selector);
      if (!element) return false;
      if (check.text !== undefined && element.textContent !== check.text) return false;
      if (check.ownText !== undefined && [...element.childNodes]
        .filter(node => node.nodeType === browser.window.Node.TEXT_NODE)
        .map(node => node.textContent).join('').trim() !== check.ownText) return false;
      return !check.attribute || element.getAttribute(check.attribute.name) === check.attribute.value;
    });
  } finally {
    browser.window.close();
  }
}

export async function auditMigrationWitnesses() {
  const [lab, category, detail, correlations, sidebar, focus, compareDates, categoryRenderers, stateModule] = await Promise.all([
    import('../../js/dashboard-lab-summary-presentation.js'),
    import('../../js/category-page-presentation.js'),
    import('../../js/components/MarkerDetailChrome.svelte.html.js'),
    import('../../js/correlations-selection-presentation.js'),
    import('../../js/components/SidebarCategoryItem.svelte.html.js'),
    import('../../js/focus-card-presentation.js'),
    import('../../js/compare-dates-presentation.js'),
    import('../../js/category-view-renderers.js'),
    import('../../js/state.js'),
  ]);
  const hostile = 'audit <img data-audit-injected="yes" src=x onerror="alert(1)"> & "quoted" \'single\' <!-- hostile --> <script>alert(1)</script>';
  const name = 'Trend ' + hostile;
  const categoryName = 'Category ' + hostile;
  const flag = 'Flag ' + hostile;
  const unit = 'Unit ' + hostile;
  const reason = 'Could not load insight — ' + hostile;
  const alerts = lab.renderDashboardLabSummary({
    kind: 'alerts', total: 2,
    trends: [{ tone: 'trend-alert-warning', arrow: '↗', label: 'Rising', accessibleLabel: name,
      id: 'audit_marker', name, category: categoryName, spark: '1 → 2' }],
    critical: [{ tone: 'alert-high', label: 'CRITICAL', accessibleLabel: flag, route: 'audit',
      name: flag, value: '2', unit: '', minimum: '0', maximum: '1' }],
  });
  const categoryHTML = category.renderCategoryPagePresentation({
    key: 'audit', glyph: { code: 'A', large: false }, label: categoryName, countLabel: '0 markers',
    range: { ranges: [], showScope: false, scope: '' }, layers: null, body: { kind: 'empty-charts' },
  });
  const action = (name: MarkerDetailActionName): MarkerDetailActionView => ({
    action: name, id: 'audit_marker', date: null, type: null, field: null, value: null,
    dotKey: null, showAllHistory: null, historyLimit: null, scrollToHistory: null,
  });
  const header: MarkerDetailChromeView = {
    kind: 'header', placement: { currentLabel: 'Audit', markerName: 'Audit',
      open: { action: 'open-marker-placement', id: 'audit_marker' }, native: null },
    name: 'Audit', rename: { kind: 'rename', actions: action('rename-marker') }, unit,
    alternate: null, pinClass: '', pinPressed: 'false', pinTitle: 'Pin', pinActions: action('quick-pin'),
    pinText: 'Pin', statusClass: 'normal', status: 'Normal', closeActions: action('close-modal'),
    latestStatus: 'normal', latest: '1', latestUnit: null, latestDate: '', latestDelta: '',
    range: '0–2', rangeLabel: 'Reference', secondary: null, rangeControls: null, rangeBand: null,
  };
  const detailHTML = detail.renderHTML({ view: header });
  const optionHTML = correlations.renderCorrelationsOptions([
    correlations.projectCorrelationMarkerOption(false, 'audit_marker', { name, values: [1] }, { label: categoryName, markers: {} }, 1),
  ]);
  const sidebarHTML = sidebar.renderHTML({ view: {
    category: 'audit', markerNames: name, group: 'audit', action: { name: 'navigate', route: 'audit' },
    label: categoryName, badge: { kind: 'count', text: '1' },
  } });
  const focusHTML = focus.renderFocusCardView({ body: { kind: 'message', text: reason } });
  const compareHTML = compareDates.renderCompareDatesPage({ kind: 'dates', first: [], second: [] });
  const correlationsHTML = correlations.renderCorrelationsPage({ kind: 'page', presets: [] });
  const witnesses = {
    trendName: { html: alerts, checks: [{ selector: '.trend-alert-name', text: name + ' ' + categoryName }] },
    trendCategory: { html: alerts, checks: [{ selector: '.trend-alert-cat', text: categoryName }] },
    flaggedName: { html: alerts, checks: [{ selector: '.alert-name', text: flag }] },
    categoryLabel: { html: categoryHTML, checks: [{ selector: '.category-title-text', text: categoryName }] },
    markerUnit: { html: detailHTML, checks: [{ selector: '.modal-unit', text: unit }] },
    correlationName: { html: optionHTML, checks: [
      { selector: '.corr-option', ownText: name, attribute: { name: 'data-name', value: name } },
      { selector: '.opt-cat', text: categoryName + ' · 1 results' },
    ] },
    sidebarLabel: { html: sidebarHTML, checks: [
      { selector: '.nav-item-label', text: categoryName },
      { selector: '.nav-item', attribute: { name: 'data-markers', value: name } },
    ] },
    focusReason: { html: focusHTML, checks: [{ selector: '.focus-card-text', text: reason }] },
    navTabindex: { html: sidebarHTML, checks: [{ selector: '.nav-item', attribute: { name: 'tabindex', value: '0' } }] },
    navRole: { html: sidebarHTML, checks: [{ selector: '.nav-item', attribute: { name: 'role', value: 'button' } }] },
    compareHeading: { html: compareHTML, checks: [{ selector: 'h2', text: 'Compare Dates' }] },
    correlationsHeading: { html: correlationsHTML, checks: [{ selector: 'h2', text: 'Correlations' }] },
  } satisfies Record<string, { html: string; checks: AuditMarkupCheck[] }>;
  const contracts = Object.fromEntries(Object.entries(witnesses)
    .map(([key, witness]) => [key, auditMarkupSafe(witness.html, witness.checks)])) as Record<keyof typeof witnesses, boolean>;

  const invalidIds = ['bad<key', 'bad key', 'bad/key', '__proto__', 'constructor', 'prototype', 'audit.__proto__', 'audit.constructor', 'audit.prototype'];
  let markerReads = 0;
  let categoryReads = 0;
  const forbiddenMarker = new Proxy({} as Parameters<typeof categoryRenderers.renderChartCard>[1], {
    get() { markerReads++; throw new Error('Unsafe chart id reached marker reads'); },
  });
  const forbiddenCategory = new Proxy({} as Parameters<typeof categoryRenderers.renderFattyAcidsView>[0], {
    get() { categoryReads++; throw new Error('Unsafe category id reached category reads'); },
  });
  const unsafeChart = invalidIds.map(id => categoryRenderers.renderChartCard(id, forbiddenMarker, []));
  const unsafeFatty = invalidIds.map(id => categoryRenderers.renderFattyAcidsView(forbiddenCategory, id));
  const validId = 'audit_marker';
  const registry = stateModule.state.markerRegistry;
  const originalMarker = Object.getOwnPropertyDescriptor(registry, validId);
  let validChart: string;
  let validFatty: string;
  try {
    const marker = { name: 'Audit marker', unit: 'unit', values: [1], refMin: 0, refMax: 2 };
    validChart = categoryRenderers.renderChartCard(validId, marker, ['Jan 1'], ['2026-01-01']);
    validFatty = categoryRenderers.renderFattyAcidsView({ markers: { marker } }, 'audit');
  } finally {
    if (originalMarker) Object.defineProperty(registry, validId, originalMarker);
    else delete registry[validId];
  }
  return {
    contracts, witnesses, invalidIds, unsafeChart, unsafeFatty, markerReads, categoryReads,
    chartGuard: unsafeChart.every(html => html === '') && markerReads === 0 && validChart.length > 0,
    fattyGuard: unsafeFatty.every(html => html === '') && categoryReads === 0 && validFatty.length > 0,
    validChart, validFatty,
  };
}
