#!/usr/bin/env node
// test-a11y-phase3.ts — accessibility regression tests for v1.5.2.
// Covers: global keyboard delegation, role="button" tabindex on clickable
// divs, modal-close aria-labels, brand-voice copy, settings tablist,
// chart layers ARIA, tour dialog role, chat stream status, progress bar.
//
// Source and synchronous authored-markup contracts; no HTTP fetch.
//
// Run: node tests/test-a11y-phase3.ts  (or via npm test)

import { deviceSetupClasses } from '../js/light-device-setup-classes.js';
import { setupClasses } from '../js/light-setup-classes.js';
import { lightSetupUtilityRecipes } from '../scripts/style-recipes/light-setup.mjs';
import { projectChannelPill, projectChannelDetail } from '../js/light-channel-presentation.js';
import { renderHTML as renderChannelPills } from '../js/components/LightChannelPills.svelte.html.js';
import { renderHTML as renderChannelDetail } from '../js/components/LightChannelDetail.svelte.html.js';
import { renderImportProgress } from '../js/import-progress-rendering.js';
import { projectCycleOverviewPresentation } from '../js/cycle-overview-presentation.js';
import { renderHTML as renderCycleOverview } from '../js/components/CycleOverviewPresentation.svelte.html.js';
import { JSDOM } from 'jsdom';
import {projectMarkerDetailAction} from '../js/marker-detail-projection.js';
import { renderMarkerDetailRange } from '../js/marker-detail-results-presentation.js';
import { renderSupplementRow } from '../js/supplement-dashboard-presentation.js';
import { renderAnalyticsConsentBody } from '../js/analytics-consent-rendering.js';
import { readAuthoredRepositorySource } from './helpers/repository-source.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');
const CSS_FILES = ['styles.css', 'css/app-shell.css', 'css/import.css', 'css/emf.css', 'css/modal-shared.css', 'css/dashboard-core.css', 'css/dashboard-widgets.css', 'css/dashboard-welcome.css', 'css/dashboard-data.css', 'css/category-views.css', 'css/context-profile.css', 'css/genetics.css', 'css/data-protection.css', 'css/settings.css', 'css/mobile-dashboard.css', 'css/cycle.css', 'css/marker-detail-modal.css', 'css/recommendations.css', 'css/client-list.css', 'css/wearables.css', 'css/light-sun.css', 'css/light-channels.css', 'css/light-devices.css', 'css/light-conditions-now.css', 'css/light-setup.css', 'css/light-tools.css', 'css/light-env.css', 'css/chat-panel.css', 'css/chat-panel-open.css', 'css/chat-personality.css', 'css/chat-messages.css', 'css/chat-composer.css', 'css/chat-onboarding.css', 'css/chat-responsive.css', 'css/chat-actions.css', 'css/chat-mobile.css', 'css/redesign-shell.css', 'css/chat-redesign.css', 'css/chat-redesign-open.css'];
const readCssBundle = () => CSS_FILES.map(read).join('\n');

let passed = 0, failed = 0;
const fails: string[] = [];
function assert(name: string, cond: unknown, detail?: unknown) {
  if (cond) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; fails.push(name); console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}
console.log('=== Phase 3 A11y Tests ===\n');
  // ─── 1. Global keyboard delegation ───
  const appEventsSrc = readAuthoredRepositorySource('js/app-event-listeners.js');
  assert('app-event-listeners.js installs global Enter/Space delegation for role=button',
    appEventsSrc.includes("if (e.key !== \"Enter\" && e.key !== \" \") return") &&
    appEventsSrc.includes("getAttribute('role') !== 'button'"));
  assert('global delegation skips native interactives',
    appEventsSrc.includes("tag === 'BUTTON' || tag === 'A' || tag === 'INPUT'"));

  // ─── 2. Clickable divs gain role+tabindex ───
  read('/js/views.js');
  const categoryPageViewSrc = read('/js/category-page-view.js');
  const lightChannelViewSrc = read('/js/light-channel-view.js');
  const categoryViewRenderersSrc = read('/js/category-view-renderers.js');
  const focusCardSrc = read('/js/components/FocusCard.svelte');
  const chartCardMarkup = read('/js/components/CategoryChartCard.svelte');
  const heatmapMarkup = read('/js/components/CategoryHeatmapRows.svelte');
  const fattyMarkup = read('/js/components/CategoryFattyAcids.svelte');
  const alertsMarkup = read('/js/components/DashboardAlerts.svelte');
  const notesMarkup = read('/js/components/DashboardLabNotes.svelte');
  const onboardingViewSrc = read('/js/onboarding-view.js');
  const dashboardLabRenderersSrc = read('/js/dashboard-lab-widget-renderers.js');
  assert('chart-card body has role and tabindex without nesting the Tips control',
    chartCardMarkup.includes('class="chart-card-main" role="button" tabindex="0"') && categoryViewRenderersSrc.includes('renderCategoryChartCard(projectCategoryChartCard(')
      && chartCardMarkup.includes('class="chart-card-tips-host"') && chartCardMarkup.indexOf('chart-card-tips-host') < chartCardMarkup.indexOf('chart-card-main'));
  assert('trend-alert-card has role and tabindex',
    alertsMarkup.includes('class={`trend-alert-card ${alert.tone}`} role="button" tabindex="0"') && alertsMarkup.includes('data-dashboard-widget-id={alert.id ?? undefined}') && dashboardLabRenderersSrc.includes('renderDashboardLabSummary(projectDashboardAlertsWidget(ctx))'));
  assert('alert-card (critical) has role and tabindex',
    alertsMarkup.includes('class={`alert-card ${flag.tone}`} role="button" tabindex="0"') && alertsMarkup.includes('data-dashboard-widget-route={flag.route ?? undefined}'));
  assert('note-card has role and tabindex',
    notesMarkup.includes('class="note-card" role="button" tabindex="0"') && notesMarkup.includes('data-dashboard-widget-index={note.index}'));
  assert('heatmap header td has role+tabindex',
    heatmapMarkup.includes('<tr><td role="button" tabindex="0"') && heatmapMarkup.includes('data-marker-detail-id={row.id}'));
  assert('heatmap cell td has role+tabindex',
    heatmapMarkup.includes('class="heatmap-{cell.status}" role="button" tabindex="0"') && heatmapMarkup.includes('aria-label={cell.label}'));
  assert('fa-card has role+tabindex',
    fattyMarkup.includes('class="fa-card" role="button" tabindex="0"') && fattyMarkup.includes('data-marker-detail-id={card.id}'));
  const rangeEdit = JSDOM.fragment(renderMarkerDetailRange({kind: 'edit-control',
    optimalClass: '', label: 'Reference', currentRange: '1–2',
    actions: projectMarkerDetailAction('edit-ref-range',{id:'controlled',type:'ref'}), lowerLabel: 'reference', badge: null,
  })).querySelector('.ref-editable');
  assert('range edit control is a native button',
    rangeEdit?.tagName === 'BUTTON' && rangeEdit.getAttribute('type') === 'button'
      && rangeEdit.getAttribute('aria-label') === 'Edit Reference range, currently 1–2'
      && rangeEdit.getAttribute('data-marker-detail-action') === 'edit-ref-range'
      && readAuthoredRepositorySource('js/marker-detail-modal-impl.js').includes('return ({ kind: "edit-control"'));
  assert('focus-card refresh has aria-label and delegated action',
    focusCardSrc.includes('class="focus-card-refresh"') &&
    focusCardSrc.includes('aria-label="Regenerate insight"') &&
    focusCardSrc.includes('data-focus-card-action'));

  const cycleSrc = readAuthoredRepositorySource('js/cycle.js');
  const cycleView = (summary: Parameters<typeof projectCycleOverviewPresentation>[0]['summary']) =>
    projectCycleOverviewPresentation({
      compact: false, showHeader: false, hasProfile: summary !== null, summary,
      drawDescription: null, phases: [], phaseOverflow: 0, periods: [], alerts: [],
    });
  const cyclePrompt = JSDOM.fragment(renderCycleOverview({view: cycleView(null)})).querySelector('.cycle-prompt');
  const cycleSummary = JSDOM.fragment(renderCycleOverview({view: cycleView({
    primary: '28-day cycle', aria: '28-day cycle', meta: ['regular', 'moderate flow'],
  })})).querySelector('.cycle-summary-card');
  assert('cycle-prompt is a semantic button',
    cyclePrompt?.tagName === 'BUTTON' && cyclePrompt.getAttribute('type') === 'button'
      && cyclePrompt.getAttribute('aria-label') === 'Set up cycle tracking');
  assert('cycle-summary is a semantic button',
    cycleSummary?.tagName === 'BUTTON' && cycleSummary.getAttribute('type') === 'button'
      && cycleSummary.getAttribute('aria-label') === 'Edit cycle: 28-day cycle');
  assert('cycle editable cards use delegated button actions',
    cyclePrompt?.getAttribute('data-cycle-action') === 'open-editor'
      && cycleSummary?.getAttribute('data-cycle-action') === 'open-editor'
      && /function handleCycleClick\(event: MouseEvent\) \{\s*const actionEl = closestCycleElement\(event\.target, '\[data-cycle-action\]'\);/.test(cycleSrc)
      && /switch \(actionEl\.dataset\.cycleAction \|\| ''\) \{/.test(cycleSrc)
      && /case 'open-editor':\s*openMenstrualCycleEditor\(\);\s*break;/.test(cycleSrc)
      && cycleSrc.includes("document.addEventListener('click', handleCycleClick);")
      && cycleSrc.includes('return renderCycleOverviewPresentation({view: projectMenstrualCycleSection(data, opts)});') && cycleSrc.includes('function projectMenstrualCycleSection')
      && !cycleSrc.includes('CYCLE_KEY_ACTIVATE_EDITOR'));

  const suppSrc = readAuthoredRepositorySource('js/supplement-dashboard.js');
  const suppRow = JSDOM.fragment(renderSupplementRow(3, 'Zinc · 10 mg', 'Zinc', [])).querySelector('.supp-bar-row');
  assert('supp-bar-row has role+tabindex and retained native delegated action',
    suppRow?.getAttribute('role') === 'button' && suppRow.getAttribute('tabindex') === '0'
      && suppRow.getAttribute('aria-label') === 'Edit Zinc · 10 mg'
      && suppRow.getAttribute('data-supp-action') === 'open-editor'
      && suppRow.getAttribute('data-supp-index') === '3'
      && suppSrc.includes('rows.push(supplementRow(index, fullLabel, shortName, bars));'));

  // ─── 3. Modal close aria-labels ───
  for (const f of ['/js/views.js', '/js/emf-editor.js', '/js/settings.js']) {
    const src = read(f);
    const closeButtons = src.match(/<button\b[^>]*class="[^"]*\bmodal-close\b[^"]*"[^>]*>/g) || [];
    const labelled = closeButtons.filter(button => /\baria-label="[^"]+"/.test(button)).length;
    assert(`${f}: every modal-close has aria-label`,
      closeButtons.length === labelled,
      `${labelled}/${closeButtons.length} labelled`);
  }
  // Feedback markup has an authored Svelte owner; a controller-only regex can pass 0/0.
  const feedbackPresentationSrc = read('/js/components/FeedbackPresentation.svelte');
  const feedbackCloseButtons = feedbackPresentationSrc.match(/<button\b[^>]*class="modal-close"[^>]*>/g) || [];
  assert('Feedback authored close button has native type, label and delegated action',
    feedbackCloseButtons.length === 1
      && /\btype="button"/.test(feedbackCloseButtons[0]!)
      && /\baria-label="Close"/.test(feedbackCloseButtons[0]!)
      && /\bdata-feedback-action="close"/.test(feedbackCloseButtons[0]!));
  const feedbackRenderingSrc = readAuthoredRepositorySource('js/feedback-rendering.js');
  const feedbackSrc = readAuthoredRepositorySource('js/feedback.js');
  assert('Feedback facade clones native template content and controller consumes the clone',
    feedbackRenderingSrc.includes("from './components/FeedbackPresentation.svelte.html.js'")
      && /const template = document\.createElement\('template'\);\s*template\.innerHTML = renderHTML\(\);\s*return template\.content\.cloneNode\(true\);/.test(feedbackRenderingSrc)
      && feedbackSrc.includes("from './feedback-rendering.js'")
      && feedbackSrc.includes('modal.replaceChildren(renderFeedbackForm());')
      && !feedbackSrc.includes('modal.innerHTML = renderFeedbackForm()'));
  const changelogSrc = read('/js/changelog-impl.js');
  const changelogPresentationSrc = read('/js/components/ChangelogPresentation.svelte');
  const changelogCloseButtons = changelogPresentationSrc.match(/<button\b[^>]*class="modal-close"[^>]*>/g) || [];
  assert('Changelog authored close button has native type, label and delegated action',
    changelogCloseButtons.length === 1
      && /\btype="button"/.test(changelogCloseButtons[0]!)
      && /\baria-label="Close"/.test(changelogCloseButtons[0]!)
      && /\bdata-changelog-action="close"/.test(changelogCloseButtons[0]!));
  const changelogRenderingSrc = readAuthoredRepositorySource('js/changelog-rendering.js');
  const changelogControllerSrc = readAuthoredRepositorySource('js/changelog-impl.js');
  assert('Changelog controller parses its actual authored presentation synchronously',
    changelogControllerSrc.includes("from './changelog-rendering.js'")
      && changelogControllerSrc.includes('modal.innerHTML = renderChangelog(projectChangelogView(entries, renderChangelogItem));')
      && changelogRenderingSrc.includes("from './components/ChangelogPresentation.svelte.html.js'")
      && changelogRenderingSrc.includes('return renderHTML({ view });'));
  assert('feedback modal uses shared overlay lifecycle helpers',
    feedbackSrc.includes("from './modal-lifecycle.js'")
      && feedbackSrc.includes('openModalOverlay(')
      && feedbackSrc.includes('closeModalOverlay('));
  assert('changelog modal uses shared overlay lifecycle helpers',
    changelogSrc.includes("from './modal-lifecycle.js'")
      && changelogSrc.includes('openModalOverlay(')
      && changelogSrc.includes('closeModalOverlay('));

  // ─── 4. Hosted-product copy avoids personal-maintainer framing ───
  const utilsSrc = readAuthoredRepositorySource('js/utils.js');
  const analyticsConsent = JSDOM.fragment(renderAnalyticsConsentBody()).textContent || '';
  assert('utils.js analytics consent uses product-level wording',
    !utilsSrc.includes('help me improve getbased') && !analyticsConsent.includes('help me improve getbased')
      && analyticsConsent.includes('help improve getbased')
      && utilsSrc.includes('banner.innerHTML = renderAnalyticsConsentBody();'));
  const settingsSrc = `${read('/js/settings.js')}\n${read('/js/settings-privacy.js')}\n${read('/js/components/PrivacySettings.svelte')}`;
  assert('settings.js privacy copy identifies Umami without personal framing',
    !settingsSrc.includes('I track cookieless') && settingsSrc.includes('Umami analytics service'));
  assert('onboarding-view.js drops "us show" framing',
    !onboardingViewSrc.includes('help us show the right reference ranges'));
  const importSrc = read('/js/pdf-import.js');
  const importPreflightSrc = read('/js/pdf-import-preflight.js');
  const importProgressSrc = read('/js/pdf-import-progress.js');
  assert('pdf-import dialogs drop "We don\'t fully" / "We\'d love"',
    !importSrc.includes("We don't fully support")
    && !importSrc.includes("We'd love to support")
    && !importPreflightSrc.includes("We don't fully support")
    && !importPreflightSrc.includes("We'd love to support"));

  // ─── 5. Settings tablist wiring ───
  const settingsShellSrc = read('/js/components/SettingsShell.svelte');
  const settingsContractSrc = readAuthoredRepositorySource('js/settings-shell-contract.js');
  assert('settings-tabs-bar has role=tablist',
    settingsShellSrc.includes('settings-tabs-bar') && settingsShellSrc.includes('role="tablist"'));
  // Each of the seven core definitions uses the component's reactive selection.
  const ariaSelMatches = (settingsContractSrc.match(/id: '/g) || []).length;
  assert('all 7 settings tabs have runtime aria-selected', ariaSelMatches === 7 && settingsShellSrc.includes('aria-selected={activeTab === tab.id}')
    && settingsShellSrc.includes("tabindex={activeTab === tab.id ? 0 : -1}"), `found ${ariaSelMatches}`);
  assert('view-toggle (Charts/Table/Heatmap) is a tablist',
    read('/js/components/CategoryPageChrome.svelte').includes('class="view-toggle" role="tablist"') && categoryPageViewSrc.includes('renderCategoryPagePresentation'));

  // ─── 6. Chart layers dropdown ARIA ───
  const dataSrc = read('/js/data-view-controls.js');
  const chartLayersSrc = read('/js/components/ChartLayersDropdown.svelte');
  assert('chart-layers-trigger has aria-haspopup + aria-controls',
    /<button class="view-btn chart-layers-trigger"[\s\S]{0,220}aria-haspopup="true"[\s\S]{0,220}aria-expanded="false"[\s\S]{0,220}aria-controls="chart-layers-dropdown"/.test(chartLayersSrc));
  assert('chart-layers-dropdown has role=menu',
    chartLayersSrc.includes('class="chart-layers-dropdown" id="chart-layers-dropdown" role="menu"'));
  assert('authored chart layers are wired into the public renderer', dataSrc.includes("from './chart-layers-presentation.js'") && dataSrc.includes('const view = projectChartLayersDropdown()') && dataSrc.includes('renderChartLayersPresentation({ hasNotes: !!view.notes, hasSupps: !!view.supplements, hasCycle: !!view.cycle }') && dataSrc.includes("view.notes?.checked ? 'on' : 'off'") && dataSrc.includes("view.supplements?.checked ? 'on' : 'off'") && dataSrc.includes("view.cycle?.checked ? 'on' : 'off'"));
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
    read('/js/components/TourPresentation.svelte').includes('id="tour-tooltip-heading"'));

  // ─── 8. Chat streaming announcements ───
  const chatSendSrc = read('/js/chat-send.js');
  const chatDiscussionRoundViewSrc = read('/js/chat-discussion-round-view.js');
  const chatThinkingStatusSrc = read('/js/chat-thinking-status.js');
  const chatStreamStatusSrc = read('/js/chat-stream-status.js');
  const chatMarkupSrc = read('/index.html');
  assert('decorative typing indicators stay silent while one shared status announces response phases',
    chatSendSrc.includes('createChatThinkingIndicator')
    && chatDiscussionRoundViewSrc.includes('createChatThinkingIndicator')
    && chatThinkingStatusSrc.includes("components/ChatThinkingStatus.svelte.native.js")
    && read('/js/components/ChatThinkingStatus.svelte').includes('aria-hidden="true"')
    && chatMarkupSrc.includes('id="chat-stream-status" role="status" aria-live="polite" aria-atomic="true"')
    &&  /if\s*\(status\)\s*status\.textContent = message;/.test(chatStreamStatusSrc));

  // ─── 9. Progress bar ARIA ───
  const progressMarkup = renderImportProgress(2, 12, 'Synthetic progress.pdf');
  assert('import-progress-bar declares role=progressbar',
    /class="import-progress-bar [^"]*" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="12" aria-label="Import progress"/.test(progressMarkup)
      && importProgressSrc.includes('return renderImportProgress(step, pct, fileName);'));
  assert('import-progress updates aria-valuenow',
    importProgressSrc.includes("bar.setAttribute('aria-valuenow', String(pct))"));

  // ─── 10. Header import button remains the import entry point ───
  const cssSrc = readCssBundle();

  // ─── 11. theme-color light variant + footer emoji removed ───
  const indexSrc = read('/index.html');
  assert('header import button is present and floating import FAB is removed',
    indexSrc.includes('class="header-icon-btn header-import-btn"') &&
    !indexSrc.includes('id="import-fab"') &&
    !indexSrc.includes('id="import-status-fab"'));
  assert('theme-color has light-mode variant',
    indexSrc.includes('media="(prefers-color-scheme: light)"'));
  const themeBootstrapSrc = read('/js/theme-bootstrap.js');
  assert('saved theme applies browser chrome color before app boot',
    indexSrc.includes('<script src="js/theme-bootstrap.js"></script>') &&
    themeBootstrapSrc.includes("'synth-sunrise': '#0d0524'") &&
    themeBootstrapSrc.includes('document.documentElement.style.colorScheme') &&
    themeBootstrapSrc.includes("document.querySelectorAll('meta[name=\"theme-color\"]')"),
    'mobile system bars should not wait for main.js to pick up the stored app theme');
  const themeSrc = read('/js/theme.js');
  const themeRuntimeSrc = read('/js/theme-runtime.js');
  assert('runtime theme changes update browser chrome color scheme',
    themeSrc.includes('function applyThemeChrome') &&
    themeSrc.includes('getThemeColorScheme') &&
    themeSrc.includes('document.documentElement.style.colorScheme'),
    'custom dark themes need dark system controls after switching themes');
  assert('theme browser hooks stay isolated while theme APIs remain module-only',
    themeSrc.includes("import('./theme-runtime.js')")
      && themeSrc.includes('fallbackThemeRuntime')
      && !/\bwindow\b/.test(themeSrc)
      && themeRuntimeSrc.includes('dispatchThemeChange')
      && !themeSrc.includes('registerThemeRuntimeExports')
      && !themeRuntimeSrc.includes('registerThemeRuntimeExports'));
  assert('document root defaults to dark browser controls outside light theme',
    /html\s*\{[^}]*background:\s*var\(--bg-primary\)[^}]*color-scheme:\s*dark/.test(cssSrc) &&
    /\[data-theme="light"\]\s*\{[^}]*color-scheme:\s*light/.test(cssSrc));
  assert('footer carries current company, founder, and documentation details',
    read('/js/components/AppFooter.svelte').includes('&copy; 2026 getbased s.r.o.')
      && read('/js/components/AppFooter.svelte').includes('Founded and built with &#10084;&#65039; by')
      && read('/js/components/AppFooter.svelte').includes('href="https://docs.getbased.health"')
      && JSDOM.fragment(indexSrc).querySelector('.app-footer-legal')?.textContent?.includes('© 2026 getbased s.r.o.'));
  assert('desktop footer clears the fixed sidebar and returns to full width below the sidebar breakpoint',
    /\.app-footer \{[^}]*margin-left: 260px/.test(cssSrc)
      && /@media \(max-width: 1024px\)[\s\S]*?\.app-footer \{ margin-left: 0; \}/.test(cssSrc));
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
  const darkCtaHoverRule = themesSrc.match(/\[data-theme="cyberterm"\]\s+\.dashboard-action-btn-primary:hover,[\s\S]*?\{[^}]*color:\s*#fff/);
  assert('terminal glass neuromancer primary dashboard CTA hovers use light text',
    !!darkCtaHoverRule &&
    darkCtaHoverRule[0].includes('[data-theme="glass"] .dashboard-action-btn-primary:hover') &&
    darkCtaHoverRule[0].includes('[data-theme="neuromancer"] .dashboard-action-btn-primary:hover'));
  const defaultDarkCtaHoverRule = cssSrc.match(/html:not\(\[data-theme\]\)\s+\.dashboard-action-btn-primary:hover\s*\{[^}]*color:\s*#fff/);
  assert('modern minimal primary dashboard CTA hover uses light text',
    !!defaultDarkCtaHoverRule &&
    cssSrc.includes('White hover text fails against the blue accent during background'));
  const fontsSrc = read('/vendor/fonts/fonts.css');
  assert('VT323 is bundled as local WOFF2 subsets',
    /font-family:\s*'VT323'/.test(fontsSrc) &&
    fontsSrc.includes("url('./vt323-400-3.woff2') format('woff2')") &&
    !fontsSrc.includes('fonts.gstatic.com'));
  const neuromancerDisplayRule = themesSrc.match(/\[data-theme="neuromancer"\] \.brand-mark,[\s\S]*?\{[^}]*font-family:\s*var\(--font-neuromancer-display\)[^}]*\}/);
  const neuromancerDisplayToken = themesSrc.match(/\[data-theme="neuromancer"\]\s*\{[^}]*--font-neuromancer-display:\s*'VT323'/);
  const neuromancerDisplaySelectors = [
    '.dashboard-greeting h1',
    '.m-greeting h1',
    '.welcome-hero h2',
    '.category-header h2',
    '.dashboard-widget-title',
    '.dashboard-widget-picker-title',
    '.empty-state h3',
    '#tour-tooltip h4',
    '.alerts-title',
    '.chart-card-title',
    '.fa-card-name',
    '.marker-detail-modal h3',
    '.m-section-title',
    '.light-section-title',
    '.light-conditions-now-title',
    '.light-setup-title',
    '.light-setup-focus-head h3',
    '.light-setup-ott h4',
    '.light-today-title',
    '.light-channel-detail-title',
    '.cycle-widget-title',
    '.context-section-title',
    '.supp-form-title',
    '.contaminant-section-title',
    '.genetics-empty-stub-title',
    '.genetics-section .section-header > span:first-child',
    '.dna-preview-title',
    '.wearable-strip-title',
    '.wearable-manual-entries-title',
    '.rec-section-header',
    '.cl-title',
    '.cl-section-title',
    '.passphrase-title',
    '.encryption-status-title',
    '.chat-header-title',
    '.chat-thread-rail-title',
    '.chat-saved-summaries-title',
    '.emf-interp-header h3',
    '.gb-modal-title',
    '.modal h3',
  ];
  const neuromancerBaseFontSelectors = [
    '.alert-name',
    '.db-spotlight-name',
    '.db-key-trend-name',
    '.trend-alert-name',
    '.labs-priority-copy strong',
    '.m-marker-main strong',
    '.light-device-name',
    '.light-device-preset-name',
    '.light-device-picker-name',
    '.light-tool-action-name',
    '.wearable-metric-name',
    '.settings-tab-btn',
    '.chat-thread-item-name',
    '.chat-personality-current-name',
    '.chat-personality-opt-name',
  ];
  const ownedChatTitle = read('/js/components/ChatHeader.svelte').match(/class="chat-header-title [^"]*"/)?.[0] || '';
  const ownedChatTitleUsesDisplayFont = ownedChatTitle.includes('gb:header:theme-neuro:[font-family:var(--font-neuromancer-display)]')
    && ownedChatTitle.includes('gb:header:theme-neuro:[font-size-adjust:0.62]');
  const ownedLightTitle = new Map([
    ['.light-setup-title',lightSetupUtilityRecipes['light-setup-title']],
    ['.light-setup-focus-head h3',lightSetupUtilityRecipes['light-setup-focus-head']],
    ['.light-setup-ott h4',lightSetupUtilityRecipes['light-setup-ott']],
  ]);
  assert('neuromancer VT323 stays scoped to display accents',
    !!neuromancerDisplayToken &&
    !!neuromancerDisplayRule &&
    ['light-setup-title', 'light-setup-focus-head', 'light-setup-ott'].every(hook =>
      setupClasses(hook) === `${hook} gb-ls-${hook}`) &&
    neuromancerDisplaySelectors.every(selector => selector === '.chat-header-title'
      ? ownedChatTitleUsesDisplayFont : ownedLightTitle.has(selector)
        ? ownedLightTitle.get(selector)!.includes("[[data-theme='neuromancer']_")
          && ownedLightTitle.get(selector)!.includes('[font-family:var(--font-neuromancer-display)]')
          && ownedLightTitle.get(selector)!.includes('[font-size-adjust:0.62]')
        : neuromancerDisplayRule[0]!.includes(selector)) &&
    neuromancerBaseFontSelectors.every(selector => !neuromancerDisplayRule[0]!.includes(selector)) &&
    neuromancerDisplayRule[0]!.includes('font-size-adjust: 0.62') &&
    !/\[data-theme="neuromancer"\]\s+body\s*\{[^}]*VT323/.test(themesSrc));

  // ─── 12. Weight input respects unit system ───
  const wearSrc = read('/js/wearables.js');
  const wearActionsSrc = read('/js/wearables-strip-actions.js');
  const wearRuntimeSrc = read('/js/wearables-runtime.js');
  assert('weight log inputs respect state.unitSystem',
    wearActionsSrc.includes("state.unitSystem === 'US' ? 'lb' : 'kg'"));
  assert('wearables dashboard browser hooks are isolated in runtime adapter',
    wearSrc.includes("from './wearables-runtime.js'")
      && !/\bwindow\b/.test(wearSrc)
      && wearActionsSrc.includes("from './wearables-runtime.js'")
      && !/\bwindow\b/.test(wearActionsSrc)
      && wearRuntimeSrc.includes('configureWearablesModuleBridge')
      && wearRuntimeSrc.includes('getWearablesModuleFunction')
      && wearRuntimeSrc.includes('getWearablesViewportSize'));

  const importDropZoneSrc = read('/js/import-drop-zone.js');
  const importDropZoneRuntimeSrc = read('/js/import-drop-zone-runtime.js');
  assert('import drop-zone browser hooks are isolated in runtime adapter',
    importDropZoneSrc.includes("from './import-drop-zone-runtime.js'")
      && !/\bwindow\b/.test(importDropZoneSrc)
      && importDropZoneRuntimeSrc.includes('isDropZoneImportRunning')
      && importDropZoneRuntimeSrc.includes('handleDropZoneDNAFile'));

  const chatRenderSrc = read('/js/chat-render.js');
  const chatRenderRuntimeSrc = read('/js/chat-render-runtime.js');
  const chatTranscriptProjectionSrc = read('/js/chat-transcript-presentation.ts');
  assert('chat-render browser hooks are isolated in runtime adapter',
    chatRenderSrc.includes("from './chat-transcript-presentation.js'")
      && chatTranscriptProjectionSrc.includes("from './chat-render-runtime.js'")
      && !/\bwindow(\.|\s*\[)/.test(chatTranscriptProjectionSrc)
      && !/\bwindow(\.|\s*\[)/.test(chatRenderSrc)
      && chatRenderRuntimeSrc.includes('isChatRenderProductRecsEnabled')
      && chatRenderRuntimeSrc.includes('renderChatRecommendationSections'));

  const chatSendRuntimeSrc = read('/js/chat-send-runtime.js');
  assert('chat-send browser hooks are isolated in runtime adapter',
    chatSendSrc.includes("from './chat-send-runtime.js'")
      && !/\bwindow(\.|\s*\[)/.test(chatSendSrc)
      && chatSendRuntimeSrc.includes('getChatSendProviderAttestation')
      && chatSendRuntimeSrc.includes('getChatSendRecommendationRuntime'));

  // ─── 12b. Light-device browse modals close on backdrop click ───
  // Browse-style modals (Add device, picker) close on backdrop; form-input
  // modals (Log device session) require explicit Cancel/Save so accidental
  // taps don't lose typed values.
  const lightDevSrc = read('/js/light-devices.js');
  const lightDevModalLoaderSrc = read('/js/light-device-modal-loader.ts');
  const lightDevSetupSrc = read('/js/light-device-setup-modal.ts');
  const lightDevSessionSrc = read('/js/light-device-session-modal.ts');
  const lightDevPresetsSrc = read('/js/components/LightDevicePresets.svelte');
  assert('light-devices.js lazily delegates session dialog rendering',
    lightDevSrc.includes("from './light-device-modal-loader.js'")
      && !lightDevSrc.includes("from './light-device-session-modal.js'")
      && lightDevModalLoaderSrc.includes("import('./light-device-session-modal.js')"));
  assert('light-devices.js lazily delegates add/custom-device setup rendering',
    lightDevSrc.includes('configureLightDeviceModalLoader({')
      && !lightDevSrc.includes("from './light-device-setup-modal.js'")
      && lightDevModalLoaderSrc.includes("import('./light-device-setup-modal.js')"));
  assert('Add-device preset picker stays inside modal as button rows, not a native dropdown',
    lightDevPresetsSrc.includes("c('light-device-preset-groups')") &&
    lightDevPresetsSrc.includes("c('light-device-preset-row')") &&
    !lightDevPresetsSrc.includes('id="add-device-preset"'));
  assert('Add-device preset picker uses one vertical modal scroller with no horizontal row overflow',
    lightDevSetupSrc.includes("overlay.addEventListener('wheel'") &&
    lightDevSetupSrc.includes('modal.scrollBy({ top: event.deltaY * unit, left: 0') &&
    lightDevPresetsSrc.includes('light-device-add-modal') &&
    deviceSetupClasses('light-device-add-modal').includes('[touch-action:pan-y]') &&
    deviceSetupClasses('modal-body').includes('[overflow-x:hidden]') &&
    deviceSetupClasses('light-device-preset-meta').includes('[word-break:break-word]') &&
    deviceSetupClasses('light-device-preset-groups').includes('[overflow:visible]'));
  assert('custom-device URL extraction checks hosted proxy response status',
    lightDevSetupSrc.includes('if (!res.ok) throw new Error(`Proxy error ${res.status}`);'));
  assert('custom-device async extraction suppresses stale detached-overlay notifications',
    (lightDevSetupSrc.match(/if \(!overlay\.isConnected\) return;/g) || []).length >= 3);
  // Browse modals delegate backdrop close through the shared modal
  // lifecycle helper, so child clicks stay guarded by wireBackdropClose
  // while close buttons and save paths share the same close handler.
  const setupLifecycleMatches = (lightDevSetupSrc.match(/setupDeps\.wireModal\(overlay, closeDialog\)/g) || []).length;
  const devicePickerStart = lightDevSrc.indexOf('function _openDevicePicker');
  const devicePickerBody = lightDevSrc.slice(devicePickerStart);
  assert('Add-device + device-picker modals route close through shared lifecycle',
    setupLifecycleMatches >= 2 &&
      lightDevSetupSrc.includes("import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';") &&
      devicePickerBody.includes('const closeDialog = () => removeModalOverlay(overlay);') &&
      devicePickerBody.includes('_wireModal(overlay, closeDialog)'),
    `setup=${setupLifecycleMatches}`);
  // openDeviceSessionDialog is a form modal; it should not hand-roll an
  // overlay click listener, and should route closure through the same
  // lifecycle close handler as the explicit controls.
  const sessionDialogStart = lightDevSessionSrc.indexOf('export async function openDeviceSessionDialog');
  const sessionDialogEnd = lightDevSessionSrc.indexOf('export', sessionDialogStart + 1);
  const sessionDialogBody = lightDevSessionSrc.slice(sessionDialogStart, sessionDialogEnd > 0 ? sessionDialogEnd : undefined);
  assert('openDeviceSessionDialog routes closure through shared lifecycle handler',
    sessionDialogBody.includes('_wireDeviceSessionModal(overlay, closeDialog)') &&
      !/overlay\.addEventListener\('click'/.test(sessionDialogBody));

  // ─── 13. Light-page channel pill drill-down a11y ───
  // Pills are <button>s (native focusable + Enter/Space) with aria-expanded
  // toggling between false/true and aria-controls pointing at the panel.
  // The detail panel is role=region with aria-label; close button has its
  // own aria-label. Hidden text in .sr-only carries the qualitative tier
  // for screen readers since the dots are aria-hidden.
  const pillMarkup = renderChannelPills({pills:[projectChannelPill('circadian',
    {label:'Circadian',icon:'☀',what:'Daily rhythm'},1,0,
    {n:2,sun:2,device:0,txt:'2 days'},{bars:[]})]});
  const detailMarkup = renderChannelDetail({view:projectChannelDetail({
    channel:'circadian',meta:{label:'Circadian',icon:'☀',what:'Daily rhythm'},sun:1,device:0,
    recentDays:[],chartDays:null,iuDays:null,pbmJoulesPerCm2:null,matchingDevice:false,peakAt:null,peakUV:null,
  })});
  assert('pill is a <button> with aria-expanded + aria-controls',
    /<button type="button"[^>]*aria-expanded="false" aria-controls="light-pill-detail-circadian"/.test(pillMarkup));
  assert('pill sparkline is aria-hidden (qualitative info already in sr-only span)',
    /<svg[^>]*class="light-pill-sparkline [^"]*"[^>]*aria-hidden="true"/.test(pillMarkup));
  assert('pill carries sr-only tier + day-count label for assistive tech',
    pillMarkup.includes('<span class="sr-only">Sunlight logged on 2 days this week</span>'));
  assert('detail panel is role=region with aria-label',
    /id="light-pill-detail-circadian" role="region" aria-label="Circadian detail"/.test(detailMarkup));
  assert('detail close button has aria-label',
    /<button type="button"[^>]*class="light-channel-detail-close [^"]*"[^>]*aria-label="Close Circadian detail"/.test(detailMarkup));
  assert('_toggleChannelDetail flips aria-expanded on the active pill',
    /p\.setAttribute\('aria-expanded', 'true'\)/.test(lightChannelViewSrc) &&
    /p\.setAttribute\('aria-expanded', 'false'\)/.test(lightChannelViewSrc));
  assert('_toggleChannelDetail moves focus into the opened panel',
    lightChannelViewSrc.includes('panel.focus(') && /tabindex.*-1/.test(lightChannelViewSrc));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) console.log('Failures:', fails);
process.exit(failed > 0 ? 1 : 0);
