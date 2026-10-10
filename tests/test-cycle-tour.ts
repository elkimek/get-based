#!/usr/bin/env node
import { readRepositorySource } from './helpers/repository-source.js';
import { readServiceWorkerSource } from '../scripts/service-worker-source.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// test-cycle-tour.js — Cycle tour feature tests
//
// Run: node tests/test-cycle-tour.js  (or via npm test)

import './_node-shim.js';
import postcss from 'postcss';
import {cycleSharedUtilities} from '../js/cycle-shared-classes.js';

const read = (rel: string) => readRepositorySource(rel.replace(/^\//, ''), 'utf-8');
const CSS_FILES = ['styles.css', 'css/cycle.css'];
const readCycleCss = () => CSS_FILES.map(read).join('\n');

const { assert, results: legacyAssertions } = createLegacyAssertions();

console.log('=== Cycle Tour Tests ===\n');

await import('../js/state.js');
const tour = await import('../js/tour.js');

  // --- 1. TOUR_STEPS structure ---
  console.log('%c[1] App tour steps', 'font-weight:bold');
  const tourSrc = read('/js/tour.js');
  const appStepCount = (tourSrc.match(/const TOUR_STEPS\s*=\s*\[([\s\S]*?)\];/)||[])[1];
  const appSteps = appStepCount ? appStepCount.split('{ target:').length - 1 : 0;
  assert('App tour has 9 steps', appSteps === 9, `found ${appSteps}`);

  // --- 2. EMPTY_TOUR_STEPS structure ---
  console.log('%c[2] Empty app tour steps', 'font-weight:bold');
  const emptyStepBlock = (tourSrc.match(/const EMPTY_TOUR_STEPS\s*=\s*\[([\s\S]*?)\];/)||[])[1];
  const emptySteps = emptyStepBlock ? emptyStepBlock.split('{ target:').length - 1 : 0;
  assert('Empty app tour has 5 steps', emptySteps === 5, `found ${emptySteps}`);
  assert('startEmptyTour uses emptyTour storage key', tourSrc.includes("profileKey('emptyTour')"));

  // --- 3. CYCLE_TOUR_STEPS structure ---
  console.log('%c[3] Cycle tour steps', 'font-weight:bold');
  const cycleStepBlock = (tourSrc.match(/const CYCLE_TOUR_STEPS\s*=\s*\[([\s\S]*?)\];/)||[])[1]!;
  const cycleSteps = cycleStepBlock ? cycleStepBlock.split('{ target:').length - 1 : 0;
  assert('Cycle tour has 8 steps', cycleSteps === 8, `found ${cycleSteps}`);

  // --- 4. Cycle tour step targets ---
  console.log('%c[4] Cycle tour targets', 'font-weight:bold');
  assert('Step 1 is welcome (null target)', /target:\s*null.*Cycle-Aware/.test(cycleStepBlock), 'no null/center step');
  assert('Has .cycle-summary-card target', cycleStepBlock.includes('.cycle-summary-card'));
  assert('Has .cycle-draw-date target', cycleStepBlock.includes('.cycle-draw-date'));
  assert('Has .cycle-draw-phases target', cycleStepBlock.includes('.cycle-draw-phases'));
  assert('Has .cycle-period-log target', cycleStepBlock.includes('.cycle-period-log'));
  assert('Has .cycle-alert target', cycleStepBlock.includes('.cycle-alert'));
  assert('Has .chart-layers-wrapper target', cycleStepBlock.includes('.chart-layers-wrapper'));
  assert('Has #chat-fab target', cycleStepBlock.includes('#chat-fab'));

  // --- 5. Generic engine: runTour function ---
  console.log('%c[5] Generic tour engine', 'font-weight:bold');
  assert('runTour function exists', tourSrc.includes('function runTour('));
  assert('runTour accepts steps, storageKey, auto', /runTour\(\s*steps\s*,\s*storageKey\s*,\s*auto\s*\)/.test(tourSrc));
  assert('activeTour object used', tourSrc.includes('activeTour'));
  assert('activeTour stores steps/storageKey/currentStep', /activeTour\s*=\s*\{[^}]*steps[^}]*storageKey[^}]*currentStep/.test(tourSrc));

  // --- 6. startTour delegates to runTour ---
  console.log('%c[6] startTour delegates', 'font-weight:bold');
  assert('startTour calls runTour with TOUR_STEPS', /startTour.*\{[\s\S]*?runTour\(\s*TOUR_STEPS/.test(tourSrc));
  assert('startEmptyTour calls runTour with EMPTY_TOUR_STEPS', /startEmptyTour.*\{[\s\S]*?runTour\(\s*EMPTY_TOUR_STEPS/.test(tourSrc));
  assert('startGuidedTour delegates to the current visible tour', tourSrc.includes('export function startGuidedTour') && tourSrc.includes('startEmptyTour(auto)') && tourSrc.includes('startTour(auto)'));

  // --- 7. startCycleTour delegates to runTour ---
  console.log('%c[7] startCycleTour delegates', 'font-weight:bold');
  assert('startCycleTour calls runTour with CYCLE_TOUR_STEPS', /startCycleTour.*\{[\s\S]*?runTour\(\s*CYCLE_TOUR_STEPS/.test(tourSrc));
  assert('startCycleTour uses cycleTour storage key', tourSrc.includes("profileKey('cycleTour')"));
  const cycleSurfaceBlock = (tourSrc.match(/const CYCLE_SURFACE_TARGETS\s*=\s*\[([\s\S]*?)\];/)||[])[1] || '';
  assert('startCycleTour requires a visible cycle surface', /startCycleTour.*\{[\s\S]*?CYCLE_SURFACE_TARGETS\.some/.test(tourSrc));
  assert('Cycle surface guard does not count chat-only fallback', cycleSurfaceBlock && !cycleSurfaceBlock.includes('#chat-fab'));
  assert('Automatic tours wait while a modal is open', tourSrc.includes("auto && document.querySelector('.modal-overlay.show')"));

  // --- 8. Module exports ---
  console.log('%c[8] Module exports', 'font-weight:bold');
  assert('tour.startEmptyTour exists', typeof tour.startEmptyTour === 'function');
  assert('tour.startTour exists', typeof tour.startTour === 'function');
  assert('tour.startGuidedTour exists', typeof tour.startGuidedTour === 'function');
  assert('tour.startCycleTour exists', typeof tour.startCycleTour === 'function');
  assert('tour.endTour exists', typeof tour.endTour === 'function');
  assert('tour.goToTourStep exists', typeof tour.goToTourStep === 'function');
  assert('tour API is not published on window', typeof (window as Window & { startTour?: unknown }).startTour !== 'function' && typeof (window as Window & { _tourGoToStep?: unknown })._tourGoToStep !== 'function');

  // --- 9. runTour filters missing targets ---
  console.log('%c[9] Step filtering', 'font-weight:bold');
  assert('runTour filters steps with missing targets', /filteredSteps\s*=\s*steps\.filter/.test(tourSrc));
  assert('Null targets are kept (center steps)', /s\.target\s*===\s*null\s*\|\|/.test(tourSrc));

  // --- 10. endTour uses activeTour.storageKey ---
  console.log('%c[10] endTour storage', 'font-weight:bold');
  assert('endTour reads storageKey from activeTour', /activeTour\.storageKey/.test(tourSrc));
  assert('endTour nulls activeTour', /activeTour\s*=\s*null/.test(tourSrc));

  // --- 11. Auto-trigger in saveMenstrualCycle ---
  console.log('%c[11] Auto-trigger in saveMenstrualCycle', 'font-weight:bold');
  const cycleSrc = read('/js/cycle.js');
  assert('cycle.js imports startCycleTour', cycleSrc.includes("import { startCycleTour } from './tour.js'"));
  assert('saveMenstrualCycle calls startCycleTour(true)', cycleSrc.includes('startCycleTour(true)'));
  assert('setTimeout delay for DOM readiness', /setTimeout\s*\(\s*\(\)\s*=>\s*\{[^}]*startCycleTour\(true\)[^}]*\}\s*,\s*600\s*\)/.test(cycleSrc));

  // --- 12. Tour button in renderMenstrualCycleSection ---
  console.log('%c[12] Tour button in cycle section', 'font-weight:bold');
  const overviewHeader = read('/js/components/CycleOverviewHeader.svelte');
  const overview = read('/js/components/CycleOverviewPresentation.svelte');
  assert('Authored overview renders the shared tour icon button', overviewHeader.includes("class={c('cycle-icon-btn')}") && overviewHeader.includes('<CycleIcon name="help"/>'));
  assert('Tour button uses delegated start action', overviewHeader.includes('data-cycle-action="start-tour"') && cycleSrc.includes('startCycleTour(false)'));
  assert('Tour button only shown with a profile and visible header', overview.includes('{#if view.showHeader}') && overview.includes('showTour={view.hasProfile}') && /\{#if showTour\}<button type=\"button\" class=\{c\('cycle-icon-btn'\)\}/.test(overviewHeader));
  assert('Button has accessible tour label', overviewHeader.includes('aria-label="Take the cycle feature tour"'));

  // --- 13. CSS rule for cycle buttons ---
  console.log('%c[13] CSS rule', 'font-weight:bold');
  const cssSrc = readCycleCss();
  const rules: postcss.Rule[] = [];
  postcss.parse(cssSrc).walkRules(rule => { rules.push(rule); });
  const decode = (selector: string) => selector.replace(/\\([0-9a-f]{1,6}) ?|\\(.)/gi, (_match, hex: string | undefined, character: string | undefined) => hex ? String.fromCodePoint(parseInt(hex, 16)) : character!);
  const iconTokens = cycleSharedUtilities('cycle-icon-btn').split(/\s+/);
  const matchingRules = (token: string) => rules.filter(rule => decode(rule.selector).includes('.' + token) && ['editor','import','overview'].every(area => rule.selector.includes(`[data-cycle-${area}-view]`)));
  const media = (rule: postcss.Rule) => {
    const result: string[] = [];
    for (let parent: postcss.Rule['parent'] | postcss.Document = rule.parent; parent; parent = parent.parent) if (parent.type === 'atrule' && parent.name === 'media') result.unshift(parent.params.replace(/\s+/g, ''));
    return result;
  };
  const minimum = (variant: 'wide' | 'phone', value: string) => ['min-width','min-height'].every(property => {
    const token = `gb:cycle-shared-ui:cycle-shared-${variant}:[${property}:${value}]`;
    return iconTokens.includes(token) && matchingRules(token).some(rule => media(rule).join('') === (variant === 'wide' ? 'notalland(max-width:768px)' : '(max-width:768px)') && rule.nodes.some(node => node.type === 'decl' && node.prop === property && node.value === value && !node.important));
  });
  assert('Shared tour controls have generated ownership with no ordinary native icon rule', iconTokens.length > 20 && iconTokens.every(token => matchingRules(token).length > 0) && !rules.some(rule => rule.selectors.includes('.cycle-icon-btn')));
  assert('touch-sized desktop controls retain exact owned 36px minima', minimum('wide', '36px'));
  assert('touch-sized mobile controls retain exact inclusive 40px minima', minimum('phone', '40px'));
  const hoverTokens = iconTokens.filter(token => /\[&:hover(?:\]|:)/.test(token));
  assert('Shared icon hover remains direct and device independent', hoverTokens.length === 3 && hoverTokens.every(token => matchingRules(token).some(rule => /(?<!\\):hover/.test(rule.selector) && media(rule).length === 0)));

  // --- 14. Profile delete cleanup ---
  console.log('%c[14] Profile delete cleanup', 'font-weight:bold');
  const profileSrc = read('/js/profile.js');
  const profileCleanupSrc = read('/js/profile-storage-cleanup.js');
  assert('deleteProfile delegates complete profile storage cleanup',
    profileSrc.includes('await clearProfileStorage(profileId)'));
  assert('profile cleanup removes emptyTour through the standard profile prefix',
    profileCleanupSrc.includes('const standardPrefix = `labcharts-${profileId}-`'));
  assert('profile cleanup removes tour through the standard profile prefix',
    profileCleanupSrc.includes('key.startsWith(standardPrefix)'));
  assert('profile cleanup removes cycleTour through the standard profile prefix',
    profileCleanupSrc.includes('key.startsWith(standardPrefix)'));
  assert('profile cleanup removes phaseOverlay through the standard profile prefix',
    profileCleanupSrc.includes('key.startsWith(standardPrefix)'));

  // --- 15. Service worker cache version ---
  console.log('%c[15] Service worker cache', 'font-weight:bold');
  const swSrc = readServiceWorkerSource(relative => read('/' + relative));
  assert('SW uses importScripts for version', swSrc.includes("importScripts('/version.js')"));
  assert('SW CACHE_NAME uses semver', swSrc.includes('`labcharts-v${self.APP_VERSION}`'));

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
process.exit(legacyAssertions.fail > 0 ? 1 : 0);
