#!/usr/bin/env node
// test-a11y-phase3.js — accessibility regression tests for v1.5.2.
// Covers: global keyboard delegation, role="button" tabindex on clickable
// divs, modal-close aria-labels, brand-voice copy, settings tablist,
// chart layers ARIA, tour dialog role, chat typing aria-live, progress bar.
//
// Static source inspection only — fs.readFileSync instead of HTTP fetch.
//
// Run: node tests/test-a11y-phase3.js  (or via npm test)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');

let passed = 0, failed = 0;
const fails = [];
function assert(name, cond, detail) {
  if (cond) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; fails.push(name); console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}
console.log('=== Phase 3 A11y Tests ===\n');
  // ─── 1. Global keyboard delegation ───
  const appEventsSrc = read('/js/app-event-listeners.js');
  assert('app-event-listeners.js installs global Enter/Space delegation for role=button',
    appEventsSrc.includes("if (e.key !== \"Enter\" && e.key !== \" \") return") &&
    appEventsSrc.includes("getAttribute('role') !== 'button'"));
  assert('global delegation skips native interactives',
    appEventsSrc.includes("tag === 'BUTTON' || tag === 'A' || tag === 'INPUT'"));

  // ─── 2. Clickable divs gain role+tabindex ───
  const viewsSrc = read('/js/views.js');
  const categoryPageViewSrc = read('/js/category-page-view.js');
  const lightChannelViewSrc = read('/js/light-channel-view.js');
  const categoryViewRenderersSrc = read('/js/category-view-renderers.js');
  const focusCardSrc = read('/js/focus-card.js');
  const onboardingViewSrc = read('/js/onboarding-view.js');
  const markerDetailSrc = read('/js/marker-detail-modal.js');
  const dashboardRenderersSrc = read('/js/dashboard-widget-renderers.js');
  assert('chart-card has role and tabindex',
    categoryViewRenderersSrc.match(/<div class="chart-card[^"]*" role="button" tabindex="0"/));
  assert('trend-alert-card has role and tabindex',
    dashboardRenderersSrc.includes('class="trend-alert-card ${cls}" role="button" tabindex="0"'));
  assert('alert-card (critical) has role and tabindex',
    dashboardRenderersSrc.includes('class="alert-card ${cls}" role="button" tabindex="0"'));
  assert('note-card has role and tabindex',
    dashboardRenderersSrc.includes('class="note-card" role="button" tabindex="0"'));
  assert('heatmap header td has role+tabindex',
    categoryViewRenderersSrc.includes('<tr><td role="button" tabindex="0"'));
  assert('heatmap cell td has role+tabindex',
    categoryViewRenderersSrc.match(/heatmap-\$\{s\}" role="button" tabindex="0"/));
  assert('fa-card has role+tabindex',
    categoryViewRenderersSrc.includes('class="fa-card" role="button" tabindex="0"'));
  assert('ref-editable span has role+tabindex',
    markerDetailSrc.includes('class="ref-editable" role="button" tabindex="0"'));
  assert('focus-card refresh has aria-label',
    focusCardSrc.includes('class="focus-card-refresh" onclick="refreshFocusCard()" aria-label="Regenerate insight"'));

  const cycleSrc = read('/js/cycle.js');
  assert('cycle-prompt is a semantic button',
    cycleSrc.includes('<button type="button" class="cycle-prompt"'));
  assert('cycle-summary is a semantic button',
    cycleSrc.includes('<button type="button" class="cycle-summary-card"'));
  assert('cycle editable cards keep keyboard activation handler',
    cycleSrc.includes('CYCLE_KEY_ACTIVATE_EDITOR'));

  const suppSrc = read('/js/supplements.js');
  assert('supp-bar-row has role+tabindex',
    suppSrc.includes('class="supp-bar-row" role="button" tabindex="0"'));

  // ─── 3. Modal close aria-labels ───
  for (const f of ['/js/views.js', '/js/feedback.js', '/js/changelog.js', '/js/emf.js', '/js/settings.js']) {
    const src = read(f);
    const closeButtons = (src.match(/class="modal-close"/g) || []).length;
    const labelled = (src.match(/class="modal-close" aria-label="Close"/g) || []).length;
    assert(`${f}: every modal-close has aria-label`,
      closeButtons === labelled,
      `${labelled}/${closeButtons} labelled`);
  }

  // ─── 4. Brand-voice "we/us" eliminated from key sites ───
  const utilsSrc = read('/js/utils.js');
  assert('utils.js analytics consent uses "me" not "us"',
    !utilsSrc.includes('help us improve getbased') && utilsSrc.includes('help me improve getbased'));
  const settingsSrc = read('/js/settings.js');
  assert('settings.js privacy copy uses "I" not "we"',
    !settingsSrc.includes('We track cookieless') && settingsSrc.includes('I track cookieless'));
  assert('onboarding-view.js drops "us show" framing',
    !onboardingViewSrc.includes('help us show the right reference ranges'));
  const importSrc = read('/js/pdf-import.js');
  assert('pdf-import dialog drops "We don\'t fully" / "We\'d love"',
    !importSrc.includes("We don't fully support") && !importSrc.includes("We'd love to support"));

  // ─── 5. Settings tablist wiring ───
  assert('settings-tabs-bar has role=tablist',
    settingsSrc.includes('class="settings-tabs-bar" role="tablist"'));
  // 6 tabs each with runtime aria-selected expression
  const ariaSelMatches = (settingsSrc.match(/aria-selected="\$\{_activeSettingsTab/g) || []).length;
  assert('all 6 settings tabs have runtime aria-selected', ariaSelMatches === 6, `found ${ariaSelMatches}`);
  assert('view-toggle (Charts/Table/Heatmap) is a tablist',
    categoryPageViewSrc.includes('class="view-toggle" role="tablist"'));

  // ─── 6. Chart layers dropdown ARIA ───
  const dataSrc = read('/js/data.js');
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
  const tourSrc = read('/js/tour.js');
  assert('tour tooltip has role=dialog + aria-modal',
    tourSrc.includes("setAttribute('role', 'dialog')") &&
    tourSrc.includes("setAttribute('aria-modal', 'true')") &&
    tourSrc.includes("setAttribute('aria-labelledby', 'tour-tooltip-heading')"));
  assert('tour heading has matching id',
    tourSrc.includes('id="tour-tooltip-heading"'));

  // ─── 8. Chat typing indicator aria-live ───
  const chatSrc = read('/js/chat.js');
  const chatDiscussionSrc = read('/js/chat-discussion.js');
  const ariaLiveCount = (
    chatSrc.match(/typingEl\.setAttribute\('aria-live', 'polite'\)/g) || []
  ).length + (
    chatDiscussionSrc.match(/typingEl\.setAttribute\('aria-live', 'polite'\)/g) || []
  ).length;
  assert('both typing-indicator sites have aria-live=polite',
    ariaLiveCount >= 2,
    `found ${ariaLiveCount}`);

  // ─── 9. Progress bar ARIA ───
  assert('import-progress-bar declares role=progressbar',
    importSrc.includes('class="import-progress-bar" role="progressbar"'));
  assert('import-progress updates aria-valuenow',
    importSrc.includes("bar.setAttribute('aria-valuenow', String(pct))"));

  // ─── 10. Header import button remains the import entry point ───
  const cssSrc = read('/styles.css');

  // ─── 11. theme-color light variant + footer emoji removed ───
  const indexSrc = read('/index.html');
  assert('header import button is present and floating import FAB is removed',
    indexSrc.includes('class="header-icon-btn header-import-btn"') &&
    !indexSrc.includes('id="import-fab"'));
  assert('theme-color has light-mode variant',
    indexSrc.includes('media="(prefers-color-scheme: light)"'));
  assert('saved theme applies browser chrome color before app boot',
    indexSrc.includes("'synth-sunrise': '#0d0524'") &&
    indexSrc.includes("document.documentElement.style.colorScheme") &&
    indexSrc.includes("document.querySelectorAll('meta[name=\"theme-color\"]')"),
    'mobile system bars should not wait for main.js to pick up the stored app theme');
  const themeSrc = read('/js/theme.js');
  assert('runtime theme changes update browser chrome color scheme',
    themeSrc.includes('function applyThemeChrome') &&
    themeSrc.includes('getThemeColorScheme') &&
    themeSrc.includes('document.documentElement.style.colorScheme'),
    'custom dark themes need dark system controls after switching themes');
  assert('document root defaults to dark browser controls outside light theme',
    /html\s*\{[^}]*background:\s*var\(--bg-primary\)[^}]*color-scheme:\s*dark/.test(cssSrc) &&
    /\[data-theme="light"\]\s*\{[^}]*color-scheme:\s*light/.test(cssSrc));
  assert('footer drops the heart emoji',
    !indexSrc.includes('Built with ❤️') && indexSrc.includes('Built by'));
  assert('header brand wordmark keeps theme gradient like footer',
    /\.brand-mark,[\s\S]*?\.header h1\.brand-mark[\s\S]*?background:\s*var\(--accent-gradient\)[\s\S]*?-webkit-text-fill-color:\s*transparent/.test(cssSrc));
  const themesSrc = read('/themes-extra.css');
  assert('cyberterm brand prompt stays visible over gradient wordmark',
    /\[data-theme="cyberterm"\] \.brand-mark::before[\s\S]*?-webkit-text-fill-color:\s*var\(--text-muted\)/.test(themesSrc));
  const synthPrimaryHoverRule = themesSrc.match(/\[data-theme="synth-sunrise"\]\s+\.dashboard-action-btn-primary:hover,[\s\S]*?\{[^}]*color:\s*#fff/);
  assert('synth sunrise primary button hovers use white text',
    !!synthPrimaryHoverRule &&
    synthPrimaryHoverRule[0].includes('.light-today-cta:not(.light-today-cta-secondary):hover') &&
    synthPrimaryHoverRule[0].includes('.sun-session-ctl-stop:hover') &&
    synthPrimaryHoverRule[0].includes('.import-btn-primary:hover'));

  // ─── 12. Weight input respects unit system ───
  const wearSrc = read('/js/wearables.js');
  assert('weight log inputs respect state.unitSystem',
    wearSrc.includes("state.unitSystem === 'US' ? 'lb' : 'kg'"));

  // ─── 12b. Light-device browse modals close on backdrop click ───
  // Browse-style modals (Add device, picker) close on backdrop; form-input
  // modals (Log device session) require explicit Cancel/Save so accidental
  // taps don't lose typed values.
  const lightDevSrc = read('/js/light-devices.js');
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
    /class="light-pill light-pill-tier-\$\{t7\} light-pill-interactive"[\s\S]{0,300}aria-expanded="false"[\s\S]{0,300}aria-controls="\$\{detailId\}"/.test(lightChannelViewSrc));
  assert('pill sparkline is aria-hidden (qualitative info already in sr-only span)',
    lightChannelViewSrc.includes('class="light-pill-sparkline"') &&
    /<svg class="light-pill-sparkline"[^>]*aria-hidden="true"/.test(lightChannelViewSrc));
  assert('pill carries sr-only tier + day-count label for assistive tech',
    /class="sr-only">\$\{tlabel\(t7\)\}, \$\{dc\.n\} of 7 days hit target/.test(lightChannelViewSrc));
  assert('detail panel is role=region with aria-label',
    /class="light-channel-detail"[\s\S]{0,200}role="region" aria-label="\$\{escapeHTML\(meta\.label/.test(lightChannelViewSrc));
  assert('detail close button has aria-label',
    /class="light-channel-detail-close" aria-label="Close \$\{escapeAttr\(meta\.label/.test(lightChannelViewSrc));
  assert('_toggleChannelDetail flips aria-expanded on the active pill',
    /p\.setAttribute\('aria-expanded', 'true'\)/.test(lightChannelViewSrc) &&
    /p\.setAttribute\('aria-expanded', 'false'\)/.test(lightChannelViewSrc));
  assert('_toggleChannelDetail moves focus into the opened panel',
    lightChannelViewSrc.includes('panel.focus(') && /tabindex.*-1/.test(lightChannelViewSrc));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) console.log('Failures:', fails);
process.exit(failed > 0 ? 1 : 0);
