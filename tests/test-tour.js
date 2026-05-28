#!/usr/bin/env node
// test-tour.js — Guided tour (spotlight walkthrough). Source-inspection of
// tour.js (structure, TOUR_STEPS content, target-not-found skip logic,
// viewport-clamping math), app shell CSS, main.js, views.js, settings.js,
// service-worker.js.
//
// Run: node tests/test-tour.js  (or via npm test)
//
// DOM-runtime sections (3 window-export checks + 4-12/15-17 — live tour
// overlay/spotlight/tooltip creation, step navigation, z-index computed
// styles, walkthrough) live in tests/test-tour-dom.js on the puppeteer
// runner. This file is pure source-inspection — no module import.

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

console.log('=== Guided Tour Tests ===\n');

// ═══════════════════════════════════════
// 1. Source: tour.js structure
// ═══════════════════════════════════════
console.log('1. Source Inspection');

const tourSrc = read('js/tour.js');

assert('tour.js has startTour export', tourSrc.includes('export function startTour'));
assert('tour.js has endTour export', tourSrc.includes('export function endTour'));
assert('tour.js has goToStep function', tourSrc.includes('function goToStep'));
assert('tour.js has positionTooltip function', tourSrc.includes('function positionTooltip'));
assert('tour.js has isTourCompleted function', tourSrc.includes('function isTourCompleted'));
assert('tour.js has visible target helper', tourSrc.includes('function getTourTargetElement'));
assert('tour.js has EMPTY_TOUR_STEPS array', tourSrc.includes('const EMPTY_TOUR_STEPS'));
assert('tour.js has TOUR_STEPS array', tourSrc.includes('const TOUR_STEPS'));
assert('tour.js imports state', tourSrc.includes("import { state } from './state.js'"));
assert('tour.js imports profileStorageKey', tourSrc.includes("import { profileStorageKey } from './profile.js'"));
assert('tour.js has window exports', tourSrc.includes('Object.assign(window,') && tourSrc.includes('startEmptyTour') && tourSrc.includes('startTour') && tourSrc.includes('startGuidedTour') && tourSrc.includes('endTour'));
assert('tour.js exposes _tourGoToStep on window', tourSrc.includes('window._tourGoToStep = goToStep'));
assert('startTour respects auto flag', tourSrc.includes('if (auto && isTourCompleted(') && tourSrc.includes(') return'));
assert('startTour returns whether tour opened', tourSrc.includes('return runTour(TOUR_STEPS') && tourSrc.includes('return true'));
assert('startEmptyTour returns whether empty tour opened', tourSrc.includes('return runTour(EMPTY_TOUR_STEPS') && tourSrc.includes("profileKey('emptyTour')"));
assert('startGuidedTour routes by visible empty state', tourSrc.includes('export function startGuidedTour') && tourSrc.includes("getTourTargetElement('.welcome-primary-panel')"));
assert('endTour stores completed in localStorage', tourSrc.includes("'completed'"));
assert('Overlay click dismisses tour', tourSrc.includes('if (e.target === overlay) endTour()'));

// ═══════════════════════════════════════
// 2. EMPTY_TOUR_STEPS content
// ═══════════════════════════════════════
console.log('2. Empty Tour Steps Content');

assert('Empty step 1: Welcome (null target)', tourSrc.includes("target: null, title: 'Welcome to getbased'"));
assert('Empty step 2: Guided chat panel', tourSrc.includes("target: '.welcome-primary-panel', title: 'Start Guided Chat'"));
assert('Empty step 3: Demo cards', tourSrc.includes("target: '.demo-cards', title: 'Try a Populated Profile'"));
assert('Empty step 4: Profile button', tourSrc.includes("target: '.profile-compact-btn', title: 'Profiles Stay Separate'"));
assert('Empty step 5: Settings', tourSrc.includes("target: '.settings-btn', title: 'Settings & Connections'"));
assert('Empty tour opens chat after completion', tourSrc.includes("activeTour?.storageKey === profileKey('emptyTour')") && tourSrc.includes('window.openChatPanel?.()'));

const emptyStepsStart = tourSrc.indexOf('const EMPTY_TOUR_STEPS');
const appStepsStart = tourSrc.indexOf('const TOUR_STEPS');
const emptyStepsSection = emptyStepsStart >= 0 && appStepsStart > emptyStepsStart
  ? tourSrc.slice(emptyStepsStart, appStepsStart)
  : tourSrc.slice(emptyStepsStart, emptyStepsStart + 2000);
const emptyStepMatches = emptyStepsSection.match(/\{ target:/g);
assert('Exactly 5 steps in EMPTY_TOUR_STEPS', emptyStepMatches && emptyStepMatches.length === 5, `found ${emptyStepMatches ? emptyStepMatches.length : 0}`);

// ═══════════════════════════════════════
// 2b. TOUR_STEPS content (data dashboard, 9 entries checked below)
// ═══════════════════════════════════════
console.log('2b. Data Tour Steps Content');

assert('Step 1: Welcome (null target)', tourSrc.includes("target: null, title: 'Welcome to getbased'"));
assert('Step 2: Import controls', tourSrc.includes("target: '.header-import-btn, #drop-zone', title: 'Import Health Data'"));
assert('Step 3: Profile button', tourSrc.includes("target: '.profile-compact-btn', title: 'Profiles & Demo Data'"));
assert('Step 4: Lens navigation', tourSrc.includes("target: '.nav-item[data-category=\"labs\"], #sidebar-toggle, .m-tabbar', title: 'Five Lenses'"));
assert('Step 5: Dashboard overview', tourSrc.includes("target: '.dashboard-greeting', title: 'Dashboard Overview'"));
assert('Step 6: Widget customization', tourSrc.includes("target: '.dashboard-sticky-actions', title: 'Customize Widgets'"));
assert('Step 7: Display tweaks', tourSrc.includes("target: '.tweaks-btn', title: 'Display Tweaks'"));
assert('Step 8: Settings', tourSrc.includes("target: '.settings-btn', title: 'Settings & Connections'"));
assert('Step 9: Chat targets', tourSrc.includes("target: '#chat-fab, .m-chat-fab, #chat-panel.open', title: 'Ask AI'"));

const tourStepsStart = tourSrc.indexOf('const TOUR_STEPS');
const cycleStepsStart = tourSrc.indexOf('const CYCLE_TOUR_STEPS');
const tourStepsSection = tourStepsStart >= 0 && cycleStepsStart > tourStepsStart
  ? tourSrc.slice(tourStepsStart, cycleStepsStart)
  : tourSrc.slice(tourStepsStart, tourStepsStart + 2000);
const stepMatches = tourStepsSection.match(/\{ target:/g);
assert('Exactly 9 steps in TOUR_STEPS', stepMatches && stepMatches.length === 9, `found ${stepMatches ? stepMatches.length : 0}`);

// Section 3 (window-export checks) + sections 4-12, 15-17 (live DOM tour
// overlay/spotlight/tooltip creation, step navigation, z-index computed
// styles, viewport clamping, walkthrough) live in test-tour-dom.js.

// ═══════════════════════════════════════
// 13. Target not found — skip behavior
// ═══════════════════════════════════════
console.log('13. Target Not Found — Skip Behavior');

assert('Skips to next step when target missing', tourSrc.includes('if (!isLast) goToStep(index + 1)'));
assert('Ends tour if last step target missing', tourSrc.includes('else endTour()'));
assert('Uses scrollIntoView on target', tourSrc.includes('scrollIntoView'));
assert('Filters hidden/offscreen targets', tourSrc.includes('getTourTargetElement(s.target)') && tourSrc.includes('rect.right > 0'));

// ═══════════════════════════════════════
// 14. Viewport clamping logic
// ═══════════════════════════════════════
console.log('14. Viewport Clamping');

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
// 18. CSS styles
// ═══════════════════════════════════════
console.log('18. CSS Styles');

const cssSrc = read('styles.css') + '\n' + read('css/app-shell.css');

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
assert('CSS has mobile/coarse tour button touch target', cssSrc.includes('.tour-btn') && cssSrc.includes('min-height: 44px'));

// ═══════════════════════════════════════
// 19. main.js wiring
// ═══════════════════════════════════════
console.log('19. main.js Wiring');

const mainSrc = read('js/main.js');
const appFeatureModulesSrc = read('js/app-feature-modules.js');
const appUiShellModulesSrc = read('js/app-ui-shell-modules.js');
const appEventsSrc = read('js/app-event-listeners.js');

assert('main.js imports app-feature-modules.js', mainSrc.includes("import './app-feature-modules.js'"));
assert('app-feature-modules.js delegates UI shell modules', appFeatureModulesSrc.includes("import './app-ui-shell-modules.js'"));
assert('app-ui-shell-modules.js imports tour.js', appUiShellModulesSrc.includes("import './tour.js'"));
assert('app-event-listeners.js Escape checks #tour-overlay', appEventsSrc.includes('tour-overlay'));
assert('app-event-listeners.js Escape calls window.endTour()', appEventsSrc.includes('window.endTour()'));
const tourEscIdx = appEventsSrc.indexOf('tour-overlay');
const confirmEscIdx = appEventsSrc.indexOf('confirm-dialog-overlay');
assert('Tour Escape check before confirm dialog', tourEscIdx > 0 && tourEscIdx < confirmEscIdx);

// ═══════════════════════════════════════
// 20. dashboard-page-view.js auto-trigger
// ═══════════════════════════════════════
console.log('20. dashboard-page-view.js Auto-Trigger');

const dashboardPageViewSrc = read('js/dashboard-page-view.js');

assert('dashboard-page-view.js calls window.startTour(true)', dashboardPageViewSrc.includes('window.startTour(true)'));
assert('dashboard-page-view.js guards with if (window.startTour)', dashboardPageViewSrc.includes('if (window.startTour)'));
assert('dashboard-page-view.js calls window.startEmptyTour(true)', dashboardPageViewSrc.includes('window.startEmptyTour?.(true)'));
assert('Empty first visit starts empty tour before chat onboarding',
  dashboardPageViewSrc.includes("const shouldAutoStartEmptyTour = !!window.startEmptyTour && !localStorage.getItem(profileStorageKey(state.currentProfile, 'emptyTour'))") &&
  dashboardPageViewSrc.includes("setTimeout(() => window.startEmptyTour?.(true), 100)") &&
  dashboardPageViewSrc.includes('if (!shouldAutoStartEmptyTour && state.chatHistory.length === 0)'));
const setupIdx = dashboardPageViewSrc.indexOf('setupDropZone()');
const emptyTourIdx = dashboardPageViewSrc.indexOf('startEmptyTour');
const tourIdx = dashboardPageViewSrc.indexOf('startTour(true)');
assert('startEmptyTour called after setupDropZone', setupIdx > 0 && emptyTourIdx > setupIdx);
assert('startTour called after setupDropZone', setupIdx > 0 && tourIdx > setupIdx);

// ═══════════════════════════════════════
// 21. settings.js — Take a Tour button
// ═══════════════════════════════════════
console.log('21. Settings — Take a Tour');

const settingsSrc = read('js/settings.js');

assert('settings.js has "Guided Tour" button', settingsSrc.includes('Guided Tour'));
assert('settings.js calls startGuidedTour(false)', settingsSrc.includes('startGuidedTour(false)'));
assert('settings.js closes modal before tour', settingsSrc.includes('closeSettingsModal()'));
assert('settings.js uses setTimeout for delay', settingsSrc.includes('setTimeout(()=>startGuidedTour(false)'));
assert('Tour button in Display tab panel', /tab-panel="display"[\s\S]*?Guided Tour/s.test(settingsSrc));

// ═══════════════════════════════════════
// 22. service-worker.js
// ═══════════════════════════════════════
console.log('22. Service Worker');

const swSrc = read('service-worker.js');

assert('SW APP_SHELL includes /js/tour.js', swSrc.includes("'/js/tour.js'"));
assert('SW uses importScripts for version', swSrc.includes("importScripts('/version.js')"));
assert('SW CACHE_NAME uses semver', swSrc.includes('`labcharts-v${self.APP_VERSION}`'));

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
