#!/usr/bin/env node
// test-audit.js — Pre-release audit fixes. Source-inspection across data.js,
// views.js, chat.js, markdown.js, utils.js, schema.js, api.js, export.js,
// pdf-import.js, nav.js, main.js, cycle.js, context-cards.js, charts.js,
// lab-context.js, constants.js, styles.css, index.html, vercel.json,
// service-worker.js — plus the innerHTML sanitizer sweep.
//
// Run: node tests/test-audit.js  (or via npm test)
//
// The section-3b *functional* block (proving safeMarkerId guards no-op on
// adversarial input at runtime) needs a live DOM + populated state — it
// lives in tests/test-audit-dom.js on the puppeteer runner. The section-3b
// *source-inspection* asserts (guard wiring present) stay here.

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Pre-Release Audit Tests ===\n');

// ═══════════════════════════════════════
// 1. PhenoAge SI coefficients (CRITICAL)
// ═══════════════════════════════════════
console.log('1. PhenoAge SI Coefficients');

const dataSrc = read('js/data.js');
assert('PhenoAge uses SI albumin directly', dataSrc.includes('0.0336  * albumin_si'));
assert('PhenoAge uses SI creatinine directly', dataSrc.includes('0.0095  * creatinine_si'));
assert('PhenoAge uses SI glucose directly', dataSrc.includes('0.1953  * glucose_si'));
assert('PhenoAge uses SI lymphocytes directly', dataSrc.includes('0.0120  * lymphPct_si'));
assert('PhenoAge uses SI ALP directly', dataSrc.includes('0.00188 * alp_si'));

// ═══════════════════════════════════════
// 2. Service Worker registration (CRITICAL)
// ═══════════════════════════════════════
console.log('2. Service Worker Registration');

// Original test fetched '/app' (dev-server alias for index.html).
const indexSrc = read('index.html');
assert('SW registration uses absolute path', indexSrc.includes("'/service-worker.js'") || indexSrc.includes('"/service-worker.js"'));
assert('SW registration has catch handler', indexSrc.includes('.catch('));
assert('SW has explicit dev-host offline test opt-in',
  indexSrc.includes('dev-sw=1') && indexSrc.includes("(!_isDevHost || _allowDevSW)"));
const swAuditSrc = read('service-worker.js');
assert('SW uses importScripts for version', swAuditSrc.includes("importScripts('/version.js')"));
assert('SW CACHE_NAME uses semver', swAuditSrc.includes('`labcharts-v${self.APP_VERSION}`'));
assert('Umami analytics script present (self-hosted)', indexSrc.includes('umami-iota-olive.vercel.app/script.js'));
assert('Umami blocked on file:// protocol', /location\.protocol\s*!==\s*['"]file:['"]/.test(indexSrc));

// ═══════════════════════════════════════
// 3. XSS: escapeHTML in views/dashboard renderer surfaces
// ═══════════════════════════════════════
console.log('3. XSS Prevention');

const viewsSrc = read('js/views.js');
const dashboardPageViewSrc = read('js/dashboard-page-view.js');
const lensPageShellSrc = read('js/lens-page-shell.js');
const categoryPageViewSrc = read('js/category-page-view.js');
const categoryViewRenderersSrc = read('js/category-view-renderers.js');
const categoryCustomizationSrc = read('js/category-customization.js');
const focusCardSrc = read('js/focus-card.js');
const compareCorrelationsSrc = read('js/compare-correlations.js');
const markerDetailSrc = read('js/marker-detail-modal.js');
const lightSessionsViewSrc = read('js/light-sessions-view.js');
const lightPageViewSrc = read('js/light-page-view.js');
const lightChannelViewSrc = read('js/light-channel-view.js');
const dashboardWidgetsSrc = read('js/dashboard-widgets.js');
const dashboardRenderersSrc = read('js/dashboard-widget-renderers.js');
assert('Trend alert name escaped', dashboardRenderersSrc.includes('escapeHTML(alert.name)'));
assert('Trend alert category escaped', dashboardRenderersSrc.includes('escapeHTML(alert.category)'));
assert('Flagged marker name escaped', /escapeHTML\(f\.name\)/.test(dashboardRenderersSrc));
assert('Category label escaped in header', categoryPageViewSrc.includes('escapeHTML(cat.label)'));
assert('marker.unit escaped in detail modal', /escapeHTML\(marker\.unit\)/.test(markerDetailSrc));
assert('Correlation option names escaped', /escapeHTML\(marker\.name\)/.test(compareCorrelationsSrc));
assert('Light channel device names escaped before next-move HTML',
  /const dev = matchingDevice \? escapeHTML\(`\$\{matchingDevice\.brand\} \$\{matchingDevice\.model\}`\) : ''/.test(lightChannelViewSrc));

const chatSrc = read('js/chat.js');
const chatPromptContextSrc = read('js/chat-prompt-context.js');
const markdownSrc = read('js/markdown.js');
assert('Markdown URL has quote escaping', markdownSrc.includes('.replace(/"/g, \'&quot;\')'));
assert('Clipboard has navigator.clipboard guard', chatSrc.includes('if (!navigator.clipboard)'));

// ═══════════════════════════════════════
// 3b. Marker-key allowlist guards (source-inspection)
// ═══════════════════════════════════════
// PDF AI extraction is sanitized at the parse boundary by _sanitizeAIMarker,
// but legacy data and sync pulls can still feed unsafe keys into category
// views — five entry points interpolate keys into onclick="…('${id}')" handlers.
// safeMarkerId in utils.js gates each one. The *functional* proof that the
// guards no-op on adversarial input lives in test-audit-dom.js (needs a
// live DOM); here we pin the guard *wiring*.
console.log('3b. Marker-key allowlist guards');

const utilsXssSrc = read('js/utils.js');
assert('utils.js exports safeMarkerId',
  /export\s+function\s+safeMarkerId\s*\(/.test(utilsXssSrc));
assert('safeMarkerId proto-pollution guard set covers __proto__/constructor/prototype',
  /_PROTO_PARTS\s*=\s*new\s+Set\s*\(\s*\[\s*['"]__proto__['"]\s*,\s*['"]constructor['"]\s*,\s*['"]prototype['"]\s*\]\s*\)/.test(utilsXssSrc));
assert('category-page-view.js imports safeMarkerId from utils',
  /import\s*\{[^}]*\bsafeMarkerId\b[^}]*\}\s*from\s*['"]\.\/utils\.js['"]/.test(categoryPageViewSrc));
assert('category-view-renderers.js imports safeMarkerId from utils',
  /import\s*\{[^}]*\bsafeMarkerId\b[^}]*\}\s*from\s*['"]\.\/utils\.js['"]/.test(categoryViewRenderersSrc));
assert('showCategory guards on safeMarkerId(categoryKey) at function entry',
  /export function showCategory[^{]*\{[\s\S]{0,400}if\s*\(\s*!safeMarkerId\(categoryKey\)\s*\)\s*return/.test(categoryPageViewSrc));
assert('switchView guards on safeMarkerId(categoryKey) at function entry',
  /export function switchView[^{]*\{[\s\S]{0,400}if\s*\(\s*!safeMarkerId\(categoryKey\)\s*\)\s*return/.test(categoryPageViewSrc));
assert('showDetailModal guards on safeMarkerId(id) at function entry',
  /export function showDetailModal[^{]*\{[\s\S]{0,400}if\s*\(\s*!safeMarkerId\(id\)\s*\)\s*return/.test(markerDetailSrc));
assert('renderChartCard returns "" on unsafe id (chokepoint for dashboard + category)',
  /export function renderChartCard[^{]*\{[\s\S]{0,400}if\s*\(\s*!safeMarkerId\(id\)\s*\)\s*return\s*''/.test(categoryViewRenderersSrc));
assert('renderFattyAcidsView returns "" on unsafe categoryKey',
  /export function renderFattyAcidsView[^{]*\{[\s\S]{0,400}if\s*\(\s*!safeMarkerId\(categoryKey\)\s*\)\s*return\s*''/.test(categoryViewRenderersSrc));
assert('showCategory chart-cards loop skips legacy customMarkers with unsafe keys',
  /for\s*\(\s*const\s*\[\s*key\s*,\s*marker\s*\]\s+of\s+withData\s*\)\s*\{\s*[\s\S]{0,200}if\s*\(\s*!safeMarkerId\(key\)\s*\)\s*continue/.test(categoryPageViewSrc));
assert('category-customization.js owns rename/icon helpers',
  /export async function renameCategory/.test(categoryCustomizationSrc) &&
  /export async function renameMarker/.test(categoryCustomizationSrc) &&
  /export function changeCategoryIcon/.test(categoryCustomizationSrc) &&
  /export function showEmojiPicker/.test(categoryCustomizationSrc));
assert('category rename rejects whitespace-only labels after trim',
  /export async function renameCategory[^{]*\{[\s\S]{0,700}const trimmed = newLabel\.trim\(\);\s*if\s*\(\s*!trimmed\s*\)\s*return/.test(categoryCustomizationSrc));
assert('marker rename rejects whitespace-only labels after trim',
  /export async function renameMarker[^{]*\{[\s\S]{0,700}const trimmed = newName\.trim\(\);\s*if\s*\(\s*!trimmed\s*\)\s*return/.test(categoryCustomizationSrc));
assert('category customization refreshes the active view with fresh data',
  /function _refreshActiveView[^{]*\{[\s\S]{0,300}const data = getActiveData\(\);[\s\S]{0,200}window\.buildSidebar\?\.\(data\);[\s\S]{0,200}_navigate\(opts\.forceRoute \|\| state\.currentView \|\| fallbackRoute, data\)/.test(categoryCustomizationSrc));
assert('marker rename refreshes the backing view before reopening modal',
  /export async function renameMarker[^{]*\{[\s\S]{0,900}await saveImportedData\(\);\s*_refreshActiveView\(catKey\);\s*showDetailModal\(id\)/.test(categoryCustomizationSrc));

// ═══════════════════════════════════════
// 3c. Sweep guard — every innerHTML site in production JS is sanitized
// ═══════════════════════════════════════
// CodeQL's js/xss-through-dom is excluded repo-wide (.github/workflows/
// codeql.yml) because it doesn't model escapeHTML() / safeMarkerId().
// This sweep replaces that signal locally across every production JS
// file with innerHTML usage — a future PR adding an unsanitized site
// fires immediately, before review.
console.log('3c. innerHTML sanitizer sweep');

const _SANITIZER_RE = /(escapeHTML|safeMarkerId|escapeAttr|applyInlineMarkdown|renderMarkdown)\s*\(/;
const _SAFE_HELPERS = new Set([
  // views.js + category-page-view.js + category-view-renderers.js
  'renderChartCard', 'renderTableView', 'renderHeatmapView',
  'renderFattyAcidsView', 'renderCompareTable', 'renderChannelDetailPanel',
  'renderChannelPills', 'renderConditionsHTML', 'renderLightTools',
  // chat.js (escapeHTML returns sanitized text directly; renderMarkdown
  // is the markdown.js sanitized full renderer)
  'escapeHTML', 'renderMarkdown',
]);
const _SWEEP_FILES = ['views.js', 'dashboard-page-view.js', 'category-page-view.js', 'category-view-renderers.js', 'category-customization.js', 'focus-card.js', 'marker-detail-modal.js', 'dashboard-widget-renderers.js', 'light-conditions-now.js', 'light-page-view.js', 'light-channel-view.js', 'light-sessions-view.js', 'compare-correlations.js', 'mobile-dashboard.js', 'chat.js', 'charts.js'];

function _sweepInnerHTML(filename, src) {
  const lines = src.split('\n');
  const sites = [];
  for (let i = 0; i < lines.length; i++) {
    if (/\.innerHTML\s*\+?=/.test(lines[i])) sites.push({ lineNo: i + 1, line: lines[i] });
  }
  const unguarded = [];
  for (const { lineNo, line } of sites) {
    const _bare = line.replace(/\s*\/\/.*$/, '');
    // (a) Empty/clear
    if (/\.innerHTML\s*\+?=\s*(['"])\1\s*;?\s*$/.test(_bare)) continue;
    // (b) Single-line static literal (no `${` interpolation)
    if (/\.innerHTML\s*\+?=\s*(['"`])[^`$]*\1\s*;?\s*$/.test(_bare) && !_bare.includes('${')) continue;
    // (c) Direct helper-function-call result, helper in the audited whitelist
    const _fnCallMatch = _bare.match(/\.innerHTML\s*\+?=\s*(?:window\.|_)?([a-zA-Z][\w]*)\s*\(/);
    if (_fnCallMatch && _SAFE_HELPERS.has(_fnCallMatch[1])) continue;
    // (d) Otherwise — sanitizer within ±100 lines (covers "build html
    //     across many lines, assign at end" + "h is callback param" patterns).
    //     Heuristic limitation: the proximity window can theoretically
    //     associate a sanitizer with a different interpolation in the same
    //     scope — a function that escapes one variable then writes a
    //     different, unescaped one to innerHTML would pass if both lines
    //     fall within the window. A full per-`${...}` interpolation analysis
    //     would close that path but adds significant complexity; the
    //     tradeoff is documented in PR #188 review threads. This sweep is a
    //     regression detector, not a complete proof — Greptile + manual
    //     review remain the primary defense for the
    //     unsafe-`${...}`-in-otherwise-safe-file class.
    const start = Math.max(0, (lineNo - 1) - 100);
    const end = Math.min(lines.length, lineNo + 100);
    const win = lines.slice(start, end).join('\n');
    if (_SANITIZER_RE.test(win)) continue;
    unguarded.push(`${filename}:L${lineNo} — ${line.trim().slice(0, 100)}`);
  }
  return { siteCount: sites.length, unguarded };
}

const _allUnguarded = [];
let _totalSites = 0;
for (const filename of _SWEEP_FILES) {
  const src = read(`js/${filename}`);
  const { siteCount, unguarded } = _sweepInnerHTML(filename, src);
  _totalSites += siteCount;
  _allUnguarded.push(...unguarded);
}
assert(`production JS innerHTML sites tracked across ${_SWEEP_FILES.length} files (${_totalSites} found)`,
  _totalSites > 0);
assert(
  'every production JS innerHTML site is sanitized (escapeHTML/safeMarkerId/escapeAttr/applyInlineMarkdown/renderMarkdown) or a static-literal/helper-call',
  _allUnguarded.length === 0,
  _allUnguarded.length ? `${_allUnguarded.length} unguarded:\n  ${_allUnguarded.slice(0, 8).join('\n  ')}` : ''
);

// ═══════════════════════════════════════
// 4. Division by zero guards (utils.js)
// ═══════════════════════════════════════
console.log('4. Division by Zero Guards');

const utilsSrc = read('js/utils.js');
assert('getRangePosition guards refMax === refMin', utilsSrc.includes('refMax === refMin'));
assert('getTrend guards prev === 0', utilsSrc.includes('prev === 0'));

// ═══════════════════════════════════════
// 5. CSS variable fixes
// ═══════════════════════════════════════
console.log('5. CSS Variable Fixes');

const cssSrc = read('styles.css');
const sunSrc = read('js/sun.js');
const lightDevicesSrc = read('js/light-devices.js');
assert('No var(--card-bg) reference', !cssSrc.includes('var(--card-bg)'));
assert('No var(--text) without suffix', !/(var\(--text\))(?!-)/.test(cssSrc));
assert('Dead overview-grid CSS removed', !cssSrc.includes('.overview-grid'));
assert('Dead overview-card CSS removed', !cssSrc.includes('.overview-card'));
assert('Light page uses scoped layout wrapper', lightPageViewSrc.includes('class="light-page"'));
const dashboardWidgetsBlock = (dashboardWidgetsSrc.match(/const dashboardWidgets = \[([\s\S]*?)\];/) || [null, ''])[1];
const lightSessionLogStart = lightPageViewSrc.indexOf('function renderLightSessionLogActions');
const lightSessionLogEnd = lightPageViewSrc.indexOf('function renderLightWidgetPrompt', lightSessionLogStart);
const lightSessionLogBlock = lightSessionLogStart >= 0 && lightSessionLogEnd > lightSessionLogStart
  ? lightPageViewSrc.slice(lightSessionLogStart, lightSessionLogEnd)
  : '';
assert('Light page renders as a reorderable page widget route',
  lightPageViewSrc.includes("renderLensPageWidgets('light', widgets)") &&
  lightPageViewSrc.includes("id: 'light-conditions-now'") &&
  lightPageViewSrc.includes("id: 'light-session-log'") &&
  lightPageViewSrc.includes("id: 'light-setup'") &&
  lightPageViewSrc.includes("id: 'light-channels'") &&
  lightPageViewSrc.includes("id: 'light-devices'") &&
  lightPageViewSrc.includes("id: 'light-environment'") &&
  lightPageViewSrc.includes("id: 'light-tools'") &&
  lightPageViewSrc.includes("id: 'light-methods'") &&
  !lightPageViewSrc.includes("id: 'light-workbench'") &&
  !lightPageViewSrc.includes("id: 'light-now-log'"));
assert('Light page uses full workspace width',
  /\.light-page\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*none;/.test(cssSrc));
assert('Light page grid uses zero-min track for mobile',
  /\.light-page\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*min-width:\s*0;/.test(cssSrc) &&
  /\.light-page > \*\s*\{[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*100%;/.test(cssSrc));
assert('Light page splits conditions, logging, and setup into separate widgets',
  !lightPageViewSrc.includes('class="light-top-grid"') &&
  lightPageViewSrc.indexOf("id: 'light-conditions-now'") < lightPageViewSrc.indexOf("id: 'light-session-log'") &&
  lightPageViewSrc.indexOf("id: 'light-session-log'") < lightPageViewSrc.indexOf("id: 'light-setup'"));
assert('Light dashboard registry exposes only dashboard-safe Light widgets',
  dashboardWidgetsBlock.includes("id: 'light-today'") &&
  dashboardWidgetsBlock.includes("id: 'light-conditions-now'") &&
  dashboardWidgetsBlock.includes("id: 'light-session-log'") &&
  dashboardWidgetsBlock.includes("id: 'light-channels'") &&
  !dashboardWidgetsBlock.includes("id: 'light-setup'") &&
  !dashboardWidgetsBlock.includes("id: 'light-guidance'") &&
  !dashboardWidgetsBlock.includes("id: 'light-sessions'") &&
  !dashboardWidgetsBlock.includes("id: 'light-devices'") &&
  !dashboardWidgetsBlock.includes("id: 'light-environment'") &&
  !dashboardWidgetsBlock.includes("id: 'light-tools'") &&
  !dashboardWidgetsBlock.includes("id: 'light-methods'"));
assert('Dashboard Light Today uses the same hero surface as the Light page',
  dashboardRenderersSrc.includes('function renderDashboardLightTodayWidget()') &&
  dashboardRenderersSrc.includes('window.renderLightTodayHero()') &&
  /id: 'light-today'[\s\S]*?render: renderers\.renderDashboardLightTodayWidget/.test(dashboardWidgetsBlock) &&
  !/id: 'light-today'[\s\S]*?render:\s*\(\)\s*=>\s*renderLightTodayStrip\(\)/.test(dashboardWidgetsBlock));
assert('Dashboard Light Today stays separate from Conditions Now',
  dashboardRenderersSrc.includes('return heroHtml;') &&
  !dashboardRenderersSrc.includes('cond-now-dashboard-light-today-widget') &&
  !cssSrc.includes('.dashboard-widget[data-widget-id="light-today"] .light-conditions-now-wrap'));
assert('Dashboard Conditions Now uses the full Light page timeline layout',
  dashboardRenderersSrc.includes("renderLightConditionsWidgetBody({ variant: 'full', slotId: 'cond-now-dashboard-widget' })") &&
  /id: 'light-conditions-now'[\s\S]*?size: 'full'/.test(dashboardWidgetsBlock));
assert('Light page dashboard toggles are explicitly scoped',
  lightPageViewSrc.includes("opts: { source: 'Light', dashboardId: 'light-today' }") &&
  lightPageViewSrc.includes("opts: { source: 'Light', dashboardId: 'light-conditions-now' }") &&
  lightPageViewSrc.includes("opts: { source: 'Light', dashboardId: 'light-session-log' }") &&
  lightPageViewSrc.includes("opts: { source: 'Light', dashboardId: 'light-channels' }") &&
  /id: 'light-setup'[\s\S]*?dashboardId: ''/.test(lightPageViewSrc) &&
  /id: 'light-guidance'[\s\S]*?dashboardId: ''/.test(lightPageViewSrc) &&
  /id: 'light-sessions'[\s\S]*?dashboardId: ''/.test(lightPageViewSrc) &&
  /id: 'light-devices'[\s\S]*?dashboardId: ''/.test(lightPageViewSrc) &&
  /id: 'light-environment'[\s\S]*?dashboardId: ''/.test(lightPageViewSrc) &&
  /id: 'light-tools'[\s\S]*?dashboardId: ''/.test(lightPageViewSrc) &&
  /id: 'light-methods'[\s\S]*?dashboardId: ''/.test(lightPageViewSrc) &&
  lensPageShellSrc.includes("Object.prototype.hasOwnProperty.call(opts, 'dashboardId')"));
assert('Light operation widgets deframe nested operation surfaces',
  /\.dashboard-widget\[data-widget-id="light-conditions-now"\] \.light-conditions-now-wrap,[\s\S]*\.dashboard-widget\[data-widget-id="light-session-log"\] \.light-quicklog-row,[\s\S]*\.light-page \.dashboard-widget\[data-widget-id="light-setup"\] \.light-setup-card,[\s\S]*\.light-page \.dashboard-widget\[data-widget-id="light-setup"\] \.light-setup-summary\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/.test(cssSrc));
assert('Light page workbench is split into page-only redesigned widgets',
  lightPageViewSrc.includes("id: 'light-devices'") &&
  lightPageViewSrc.includes("id: 'light-environment'") &&
  lightPageViewSrc.includes("id: 'light-tools'") &&
  lightPageViewSrc.includes("id: 'light-methods'") &&
  lightPageViewSrc.includes('renderLightWidgetPrompt') &&
  cssSrc.includes('.light-widget-prompt') &&
  cssSrc.includes('.light-setup-fields-grid') &&
  lightSessionLogBlock.includes('dashboard-action-btn') &&
  !lightSessionLogBlock.includes('import-btn') &&
  !lightPageViewSrc.includes('function renderCollapsedSubsection'));
assert('Light conditions grid stays compact on phones',
  /@media \(max-width:\s*600px\)\s*\{[\s\S]*\.conditions-now-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/.test(cssSrc) &&
  /\.conditions-now-cell-hero\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1;/.test(cssSrc));
assert('Light page sun data source avoids inline card styling',
  lightPageViewSrc.includes('class="light-data-source-details"') &&
  !lightPageViewSrc.includes('light-data-source-details" style='));
assert('Light channel pills use redesigned channel tile treatment',
  /\.light-channels-section \.light-pills-row\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(174px,\s*100%\),\s*1fr\)\);/.test(cssSrc) &&
  /\.light-channels-section \.light-pill\s*\{[\s\S]*grid-template-areas:[\s\S]*"icon label count"[\s\S]*"icon spark spark";[\s\S]*box-shadow:\s*inset 3px 0 0/.test(cssSrc) &&
  cssSrc.includes('.light-channels-section .light-pill[data-channel="violet_eye"] { --channel-accent: var(--purple); }'));
assert('Light channel detail charts inherit activated channel accent',
  lightChannelViewSrc.includes('class="light-channel-detail" data-channel="${escapeAttr(channelKey)}"') &&
  lightChannelViewSrc.includes("return 'var(--channel-accent, var(--accent))';") &&
  /\.light-channel-detail\s*\{[\s\S]*--channel-accent:\s*var\(--accent\);[\s\S]*border:\s*1px solid color-mix\(in srgb, var\(--channel-accent\)/.test(cssSrc) &&
  cssSrc.includes('.light-channel-detail[data-channel="violet_eye"] { --channel-accent: var(--purple); }') &&
  /\.light-channel-weekchart\s*\{[\s\S]*color-mix\(in srgb, var\(--channel-accent\) 8%, transparent\)/.test(cssSrc));
assert('Light recent session rows and modals use session/channel accents',
  sunSrc.includes('class="sun-session light-session-row light-session-sun"') &&
  lightSessionsViewSrc.includes('function _renderLightSessionChannelChips') &&
  lightSessionsViewSrc.includes('${_renderLightSessionChannelChips(sess.doses, sess.durationMin || 0)}') &&
  sunSrc.includes('class="modal sun-detail-modal" data-session-kind="sun"') &&
  lightDevicesSrc.includes('class="modal sun-detail-modal" data-session-kind="device"') &&
  /sun-detail-channel-row sun-detail-channel-row-clickable sun-chip-tier-\$\{t\}" data-channel="\$\{escapeAttr\(k\)\}"/.test(sunSrc) &&
  /sun-detail-channel-row sun-detail-channel-row-clickable sun-chip-tier-\$\{t\}" data-channel="\$\{escapeAttr\(k\)\}"/.test(lightDevicesSrc) &&
  /\.light-session-row\s*\{[\s\S]*--session-accent:\s*var\(--orange\);[\s\S]*box-shadow:[\s\S]*inset 3px 0 0/.test(cssSrc) &&
  /\.sun-detail-channel-row\s*\{[\s\S]*--channel-accent:\s*var\(--accent\);[\s\S]*grid-template-columns:[\s\S]*box-shadow:\s*inset 3px 0 0/.test(cssSrc));
assert('Light context setup mirror is not double-framed',
  /\.ctx-lightsetup-mirror\s*\{[\s\S]*background:\s*transparent;[\s\S]*border:\s*0;[\s\S]*padding:\s*0;/.test(cssSrc));
assert('Light setup AI context wrapper is not double-framed',
  /\.light-setup-ai-block\s*\{[\s\S]*padding:\s*0;[\s\S]*background:\s*transparent;[\s\S]*border:\s*0;/.test(cssSrc) &&
  /\.light-setup-ai-block-green,[\s\S]*\.light-setup-ai-block-yellow,[\s\S]*\.light-setup-ai-block-red\s*\{\s*border-left:\s*0;\s*\}/.test(cssSrc));
assert('Light page surfaces use shared card/theme tokens',
  cssSrc.includes('.light-page') &&
  /\.light-channels-section\s*\{[\s\S]*background:\s*color-mix\(in srgb, var\(--bg-card\)/.test(cssSrc) &&
  /\.light-setup-card\s*\{[\s\S]*border-top:\s*3px solid var\(--accent\)/.test(cssSrc));
assert('Light page status chips use theme tokens instead of legacy blue fallbacks',
  !cssSrc.includes('var(--accent-bg, rgba(96,165,250,0.10))') &&
  cssSrc.includes('background: color-mix(in srgb, var(--accent) 10%, transparent);') &&
  cssSrc.includes('.conditions-uvi-extreme   .conditions-now-value { color: var(--purple); }'));
assert('Mobile hides closed chat panel so it cannot widen pages',
  /@media \(max-width:\s*768px\)\s*\{[\s\S]*\.chat-panel:not\(\.open\)\s*\{[\s\S]*display:\s*none;/.test(cssSrc));
const quickMarkerBaseIndex = cssSrc.indexOf('.db-quick-marker-grid {\n  display: grid;');
const quickMarkerMobileIndex = cssSrc.indexOf('@media (max-width: 640px)', quickMarkerBaseIndex);
assert('Mobile quick marker grid override comes after base grid',
  quickMarkerBaseIndex !== -1 &&
  quickMarkerMobileIndex !== -1 &&
  /\.db-quick-marker-grid\s*\{[\s\S]*grid-template-columns:\s*1fr;/.test(cssSrc.slice(quickMarkerMobileIndex, quickMarkerMobileIndex + 1800)));
assert('Mobile compare tables scroll instead of clipping columns',
  /@media \(max-width:\s*768px\)\s*\{[\s\S]*\.data-table-wrapper,\s*[\s\S]*\.compare-table-wrapper,\s*[\s\S]*\.heatmap-wrapper\s*\{[\s\S]*overflow-x:\s*auto;[\s\S]*overflow-y:\s*clip;/.test(cssSrc) &&
  compareCorrelationsSrc.includes('class="compare-date-field"'));
assert('Compare and correlations headings are text-only',
  compareCorrelationsSrc.includes('<h2>Compare Dates</h2>') &&
  compareCorrelationsSrc.includes('<h2>Correlations</h2>') &&
  !compareCorrelationsSrc.includes('<h2>\\u2194 Compare Dates</h2>') &&
  !compareCorrelationsSrc.includes('<h2>\\uD83D\\uDCC8 Correlations</h2>'));
const themesExtraSrc = read('themes-extra.css');
assert('Glass theme includes Light page surfaces',
  themesExtraSrc.includes('[data-theme="glass"] .light-setup-card') &&
  themesExtraSrc.includes('[data-theme="glass"] .light-conditions-now-wrap'));

// ═══════════════════════════════════════
// 6. Data integrity fixes
// ═══════════════════════════════════════
console.log('6. Data Integrity');

assert('Ferritin lookup uses iron category', dataSrc.includes("'iron','ferritin'") && !dataSrc.includes("'hematology','ferritin'"));
assert('Unit conversion guards null refMin', dataSrc.includes('if (marker.refMin != null) marker.refMin = parseFloat'));
assert('Unit conversion guards null refMax', dataSrc.includes('if (marker.refMax != null) marker.refMax = parseFloat'));

const schemaSrc = read('js/schema.js');
const apoMatch = schemaSrc.match(/lipids\.apoAI.*?optimalMax:\s*([\d.]+)/);
if (apoMatch) {
  const apoOptMax = parseFloat(apoMatch[1]);
  assert('apoAI optimalMax <= refMax (1.70)', apoOptMax <= 1.70, `optimalMax = ${apoOptMax}`);
}

// ═══════════════════════════════════════
// 7. Error handling
// ═══════════════════════════════════════
console.log('7. Error Handling');

const apiSrc = read('js/api.js');
assert('Venice models JSON.parse guarded', apiSrc.includes("try { cached = JSON.parse(localStorage.getItem('labcharts-venice-models')"));
assert('OpenRouter models JSON.parse guarded', apiSrc.includes("try { cached = JSON.parse(localStorage.getItem('labcharts-openrouter-models')"));
assert('OpenRouter pricing JSON.parse guarded', apiSrc.includes("try { cached = JSON.parse(localStorage.getItem('labcharts-openrouter-pricing')"));

const exportSrc = read('js/export.js');
assert('PDF report null popup guard', exportSrc.includes('if (!win)'));
assert('PDF report context serialization', exportSrc.includes('fmtCtx'));

const pdfSrc = read('js/pdf-import.js');
assert('NaN markers filtered out', pdfSrc.includes('filter(m => !isNaN(m.value))'));

// ═══════════════════════════════════════
// 8. Duplicate code cleanup
// ═══════════════════════════════════════
console.log('8. Code Cleanup');

assert('pdf-import.js imports formatCost from schema', pdfSrc.includes('formatCost') && pdfSrc.includes("from './schema.js'"));
const localFormatCost = pdfSrc.match(/^function formatCost/m);
assert('pdf-import.js no local formatCost', !localFormatCost);

// ═══════════════════════════════════════
// 9. OpenRouter curated prefixes
// ═══════════════════════════════════════
console.log('9. OpenRouter Curated List');

const curatedMatch = apiSrc.match(/OPENROUTER_CURATED\s*=\s*\[([\s\S]*?)\]/);
if (curatedMatch) {
  const curated = curatedMatch[1];
  assert('Curated uses anthropic/claude- prefix (no dots in version)', !curated.includes('claude-sonnet-4.6') && !curated.includes('claude-opus-4.6'));
  assert('Curated has anthropic prefix', curated.includes('anthropic/'));
  assert('Curated has google prefix', curated.includes('google/'));
  assert('Curated has x-ai prefix', curated.includes('x-ai/'));
}

// ═══════════════════════════════════════
// 10. Accessibility
// ═══════════════════════════════════════
console.log('10. Accessibility');

assert('Skip-to-content link exists', indexSrc.includes('class="skip-link"'));
assert('Skip link targets #main-content', indexSrc.includes('href="#main-content"'));
assert('Skip link CSS', cssSrc.includes('.skip-link'));

const navSrc = read('js/nav.js');
assert('Nav items have tabindex', navSrc.includes('tabindex="0"'));
assert('Nav items have role=button', navSrc.includes('role="button"'));
assert('Nav items have keyboard handler', navSrc.includes('onkeydown'));
assert('Category labels escaped in sidebar', navSrc.includes('escapeHTML(label)') || navSrc.includes('escapeHTML(cat.label)'));

const appEventsSrc = read('js/app-event-listeners.js');
assert('Focus trap for modals', appEventsSrc.includes('e.key === "Tab"') && appEventsSrc.includes('focusable'));

// ═══════════════════════════════════════
// 11. Event listener leak fix
// ═══════════════════════════════════════
console.log('11. Event Listener Leak Fix');

const ctxSrc = read('js/context-cards.js');
assert('Diagnoses editor removes old listener before adding', ctxSrc.includes("document.removeEventListener('click', closeSuggestionsOnClickOutside)"));

// ═══════════════════════════════════════
// 12. Cycle stats NaN guard
// ═══════════════════════════════════════
console.log('12. Cycle Stats Guard');

const cycleSrc = read('js/cycle.js');
assert('Cycle stats filters periods with endDate', cycleSrc.includes('filter(p => p.endDate)'));
assert('Period length guards empty array', cycleSrc.includes('if (periodLengths.length > 0)'));
assert('Cycle renderer no longer uses supplement UI classes',
  !/supp-(timeline-header|add-btn|form-row|form-field|list)/.test(cycleSrc));
assert('Cycle renderer avoids inline style attributes', !cycleSrc.includes('style='));
assert('Cycle editor uses dedicated modal shell', cycleSrc.includes("modal.className = 'modal cycle-modal'"));
assert('Cycle cards use semantic buttons',
  cycleSrc.includes('<button type="button" class="cycle-prompt"') &&
  cycleSrc.includes('<button type="button" class="cycle-summary-card"'));
assert('Cycle mobile modal uses full-height layout',
  cssSrc.includes('.cycle-modal') && cssSrc.includes('height: calc(100dvh - 24px)'));
const themeExtraSrc = read('themes-extra.css');
assert('Cycle glass modal has opaque readability override',
  themeExtraSrc.includes('[data-theme="glass"] .cycle-modal') && themeExtraSrc.includes('0.96'));

// ═══════════════════════════════════════
// 13. Security Headers (CSP)
// ═══════════════════════════════════════
console.log('13. Security Headers');

const vercelSrc = read('vercel.json');
assert('CSP header in vercel.json', vercelSrc.includes('Content-Security-Policy'));
assert('CSP has no external CDN beyond jsdelivr (for transformers.js)',
  !vercelSrc.includes('fonts.googleapis.com') && !vercelSrc.includes('unpkg.com'));
assert('CSP allows cdn.jsdelivr.net in script-src (transformers.js)',
  vercelSrc.includes('https://cdn.jsdelivr.net'));
assert('CSP script-src includes blob: (required by ORT proxy worker)',
  /script-src[^;]*\bblob:/.test(vercelSrc));
assert('Vercel sends Cross-Origin-Opener-Policy: same-origin',
  /"Cross-Origin-Opener-Policy"\s*:\s*"same-origin"/.test(vercelSrc));
assert('Vercel sends Cross-Origin-Embedder-Policy: credentialless',
  /"Cross-Origin-Embedder-Policy"\s*:\s*"credentialless"/.test(vercelSrc));
assert('No Permissions-Policy header (matches dev-server)',
  !/"Permissions-Policy"/.test(vercelSrc));
assert('CSP connect-src allows https: (decentralized nodes)', vercelSrc.includes("connect-src 'self' https:"));
assert('CSP allows localhost for Local AI', vercelSrc.includes('localhost:*'));
assert('X-Frame-Options DENY', vercelSrc.includes('DENY'));
assert('X-Content-Type-Options nosniff', vercelSrc.includes('nosniff'));

// ═══════════════════════════════════════
// 14. Aria-live & Screen Reader
// ═══════════════════════════════════════
console.log('14. Aria-live & Screen Reader');

assert('Notification container has aria-live', indexSrc.includes('aria-live="polite"'));
assert('Notification container has role=status', indexSrc.includes('role="status"'));
const utilsSrc2 = read('js/utils.js');
assert('Error toasts get role=alert', utilsSrc2.includes("role', 'alert'"));
assert('Confirm dialog has role=alertdialog', utilsSrc2.includes('role="alertdialog"'));

// ═══════════════════════════════════════
// 15. Colorblind Accessibility
// ═══════════════════════════════════════
console.log('15. Colorblind Accessibility');

assert('Chart card val-high has ::before arrow', cssSrc.includes('.chart-value-num.val-high::before'));
assert('Chart card val-low has ::before arrow', cssSrc.includes('.chart-value-num.val-low::before'));
assert('Table val-high has ::before arrow', cssSrc.includes('.data-table .value-cell.val-high::before'));
assert('Table val-low has ::before arrow', cssSrc.includes('.data-table .value-cell.val-low::before'));
assert('Heatmap high has ::before', cssSrc.includes('.heatmap-high::before'));
assert('Heatmap low has ::before', cssSrc.includes('.heatmap-low::before'));
assert('Compare improved has ::before', cssSrc.includes('.compare-improved::before'));
assert('Compare worsened has ::before', cssSrc.includes('.compare-worsened::before'));
assert('Range bar high has glow', cssSrc.includes('.range-bar-marker.marker-high') && cssSrc.includes('box-shadow'));
assert('Health dot yellow has glow', cssSrc.includes('.ctx-health-dot-yellow') && cssSrc.includes('box-shadow'));
assert('Health dot red has glow', cssSrc.includes('.ctx-health-dot-red') && cssSrc.includes('box-shadow'));

const chartsSrc = read('js/charts.js');
assert('Chart.js pointStyle per status', chartsSrc.includes('ptStyles') && chartsSrc.includes('pointStyle'));

const ctxSrc2 = read('js/context-cards.js');
assert('Health dots have title attribute', ctxSrc2.includes('dot.title'));
assert('Health dots have aria-label', ctxSrc2.includes("dot.setAttribute('aria-label'"));
assert('AI tips have severity prefix', ctxSrc2.includes('prefixes'));

const exportSrc2 = read('js/export.js');
assert('PDF report values have status prefix', exportSrc2.includes('sPrefix'));

// ═══════════════════════════════════════
// 16. Context Assembly Pipeline
// ═══════════════════════════════════════
console.log('16. Context Assembly Pipeline');

const labCtxSrc = read('js/lab-context.js');

assert('buildLabContext has age computation', labCtxSrc.includes('Math.floor((new Date() - new Date(state.profileDob))'));
assert('buildLabContext has today ISO date', labCtxSrc.includes("new Date().toISOString().slice(0, 10)"));
assert('buildLabContext has unit system label', labCtxSrc.includes("unit system: ${unitLabel}"));
assert('buildLabContext has fmtDate helper', labCtxSrc.includes("const fmtDate = d => new Date(d + 'T00:00:00')"));

assert('Health Goals section before Diet section', labCtxSrc.indexOf('## Health Goals') < labCtxSrc.indexOf('## Diet'));
assert('Interpretive Lens before lab values', labCtxSrc.indexOf('Interpretive Lens') < labCtxSrc.indexOf('${cat.label}'));

assert('buildLabContext has global staleness daysSince', labCtxSrc.includes('daysSince'));
assert('buildLabContext has global staleness months ago', labCtxSrc.includes('months ago'));
assert('buildLabContext has per-category staleness', labCtxSrc.includes('catDaysSince') && labCtxSrc.includes('catMonthsAgo'));
assert('Per-category staleness uses warning marker', labCtxSrc.includes('⚠ Last tested'));
assert('buildFocusContext has last labs date', focusCardSrc.includes('last labs'));

const hccCount = (labCtxSrc.match(/hasCardContent\(/g) || []).length;
assert('lab-context.js uses hasCardContent for 7 card gates', hccCount >= 7, `found ${hccCount}`);
assert('lab-context.js imports hasCardContent', labCtxSrc.includes('hasCardContent') && labCtxSrc.includes("from './utils.js'"));
assert('Diagnoses uses hasCardContent', labCtxSrc.includes('hasCardContent(diag)'));
assert('Diet uses hasCardContent', labCtxSrc.includes('hasCardContent(diet)'));
assert('Exercise uses hasCardContent', labCtxSrc.includes('hasCardContent(ex)'));
assert('Sleep uses hasCardContent', labCtxSrc.includes('hasCardContent(sl)'));
assert('Stress uses hasCardContent', labCtxSrc.includes('hasCardContent(st)'));
assert('LoveLife uses hasCardContent', labCtxSrc.includes('hasCardContent(ll)'));
assert('Environment uses hasCardContent', labCtxSrc.includes('hasCardContent(env)'));
assert('Light still uses lc || autoLat gate', labCtxSrc.includes('lc || autoLat'));
const utilsSrc3 = read('js/utils.js');
assert('hasCardContent exported from utils.js', utilsSrc3.includes('export function hasCardContent'));

const constSrc = read('js/constants.js');
assert('System prompt has per-category staleness instruction', constSrc.includes('stale data') && constSrc.includes('recommend retesting'));
assert('System prompt has absent field instruction', constSrc.includes('did not provide'));
assert('System prompt has absent section instruction', constSrc.includes('has not filled in'));
assert('System prompt has Core Rules section', constSrc.includes('## Core Rules'));
assert('System prompt has Priority Context section', constSrc.includes('## Priority Context'));
assert('System prompt has Lifestyle Context section', constSrc.includes('## Lifestyle Context'));
assert('System prompt has cortisol cross-cutting note', constSrc.includes('cortisol/HPA axis'));
assert('System prompt has Style section', constSrc.includes('## Style'));
assert('Health goals at top of Priority Context', constSrc.indexOf('Health goals:') < constSrc.indexOf('Medical conditions:'));

assert('chat.js delegates prompt assembly to chat-prompt-context', chatSrc.includes('buildChatSystemPrompt'));
assert('Persona placed after lab data', chatPromptContextSrc.includes("'\\n\\nCurrent lab data:\\n' + labContext + personalityPrompt"));

assert('buildFocusContext exists in focus-card.js', focusCardSrc.includes('function buildFocusContext()'));
assert('views.js imports focus card module', viewsSrc.includes("from './focus-card.js'"));
assert('Focus card uses buildFocusContext', focusCardSrc.includes('buildFocusContext()'));
assert('Focus card context-aware system prompt', focusCardSrc.includes("this person's goals/conditions"));

assert('askAIAboutMarker uses marker.refMin/refMax', chatSrc.includes('${marker.refMin}') && chatSrc.includes('${marker.refMax}'));
assert('askAIAboutMarker has trend direction', chatSrc.includes("Trend: ${dir}"));

assert('Health dots JSON.parse has try-catch', ctxSrc.includes('try { parsed = JSON.parse(jsonMatch[0])'));

assert('WBC rule at position 5 (before Skip non-numeric)', pdfSrc.indexOf('differential WBC') < pdfSrc.indexOf('Skip non-numeric'));
assert('PDF import includes filename in user message', pdfSrc.includes("(file: ' + fileName"));

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
