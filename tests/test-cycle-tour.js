#!/usr/bin/env node
// test-cycle-tour.js — Cycle tour feature tests
//
// Run: node tests/test-cycle-tour.js  (or via npm test)

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

console.log('=== Cycle Tour Tests ===\n');

// tour.js exposes window.startTour / startCycleTour / endTour / _tourGoToStep
// via Object.assign(window, ...) at module load.
await import('../js/state.js');
await import('../js/tour.js');

  // --- 1. TOUR_STEPS structure ---
  console.log('%c[1] App tour steps', 'font-weight:bold');
  const tourSrc = read('/js/tour.js');
  const appStepCount = (tourSrc.match(/const TOUR_STEPS\s*=\s*\[([\s\S]*?)\];/)||[])[1];
  const appSteps = appStepCount ? appStepCount.split('{ target:').length - 1 : 0;
  assert('App tour has 9 steps', appSteps === 9, `found ${appSteps}`);

  // --- 2. CYCLE_TOUR_STEPS structure ---
  console.log('%c[2] Cycle tour steps', 'font-weight:bold');
  const cycleStepBlock = (tourSrc.match(/const CYCLE_TOUR_STEPS\s*=\s*\[([\s\S]*?)\];/)||[])[1];
  const cycleSteps = cycleStepBlock ? cycleStepBlock.split('{ target:').length - 1 : 0;
  assert('Cycle tour has 8 steps', cycleSteps === 8, `found ${cycleSteps}`);

  // --- 3. Cycle tour step targets ---
  console.log('%c[3] Cycle tour targets', 'font-weight:bold');
  assert('Step 1 is welcome (null target)', /target:\s*null.*Cycle-Aware/.test(cycleStepBlock), 'no null/center step');
  assert('Has .cycle-summary target', cycleStepBlock.includes('.cycle-summary'));
  assert('Has .cycle-draw-date target', cycleStepBlock.includes('.cycle-draw-date'));
  assert('Has .cycle-draw-phases target', cycleStepBlock.includes('.cycle-draw-phases'));
  assert('Has .cycle-period-log target', cycleStepBlock.includes('.cycle-period-log'));
  assert('Has .cycle-alert target', cycleStepBlock.includes('.cycle-alert'));
  assert('Has .chart-layers-wrapper target', cycleStepBlock.includes('.chart-layers-wrapper'));
  assert('Has #chat-fab target', cycleStepBlock.includes('#chat-fab'));

  // --- 4. Generic engine: runTour function ---
  console.log('%c[4] Generic tour engine', 'font-weight:bold');
  assert('runTour function exists', tourSrc.includes('function runTour('));
  assert('runTour accepts steps, storageKey, auto', /runTour\(\s*steps\s*,\s*storageKey\s*,\s*auto\s*\)/.test(tourSrc));
  assert('activeTour object used', tourSrc.includes('activeTour'));
  assert('activeTour stores steps/storageKey/currentStep', /activeTour\s*=\s*\{[^}]*steps[^}]*storageKey[^}]*currentStep/.test(tourSrc));

  // --- 5. startTour delegates to runTour ---
  console.log('%c[5] startTour delegates', 'font-weight:bold');
  assert('startTour calls runTour with TOUR_STEPS', /startTour.*\{[\s\S]*?runTour\(\s*TOUR_STEPS/.test(tourSrc));

  // --- 6. startCycleTour delegates to runTour ---
  console.log('%c[6] startCycleTour delegates', 'font-weight:bold');
  assert('startCycleTour calls runTour with CYCLE_TOUR_STEPS', /startCycleTour.*\{[\s\S]*?runTour\(\s*CYCLE_TOUR_STEPS/.test(tourSrc));
  assert('startCycleTour uses cycleTour storage key', tourSrc.includes("profileKey('cycleTour')"));

  // --- 7. Window exports ---
  console.log('%c[7] Window exports', 'font-weight:bold');
  assert('window.startTour exists', typeof window.startTour === 'function');
  assert('window.startCycleTour exists', typeof window.startCycleTour === 'function');
  assert('window.endTour exists', typeof window.endTour === 'function');
  assert('window._tourGoToStep exists', typeof window._tourGoToStep === 'function');

  // --- 8. runTour filters missing targets ---
  console.log('%c[8] Step filtering', 'font-weight:bold');
  assert('runTour filters steps with missing targets', /filteredSteps\s*=\s*steps\.filter/.test(tourSrc));
  assert('Null targets are kept (center steps)', /s\.target\s*===\s*null\s*\|\|/.test(tourSrc));

  // --- 9. endTour uses activeTour.storageKey ---
  console.log('%c[9] endTour storage', 'font-weight:bold');
  assert('endTour reads storageKey from activeTour', /activeTour\.storageKey/.test(tourSrc));
  assert('endTour nulls activeTour', /activeTour\s*=\s*null/.test(tourSrc));

  // --- 10. Auto-trigger in saveMenstrualCycle ---
  console.log('%c[10] Auto-trigger in saveMenstrualCycle', 'font-weight:bold');
  const cycleSrc = read('/js/cycle.js');
  assert('saveMenstrualCycle calls startCycleTour(true)', cycleSrc.includes('startCycleTour(true)'));
  assert('setTimeout delay for DOM readiness', /setTimeout\s*\(\s*\(\)\s*=>\s*\{[^}]*startCycleTour\(true\)[^}]*\}\s*,\s*600\s*\)/.test(cycleSrc));

  // --- 11. Tour button in renderMenstrualCycleSection ---
  console.log('%c[11] Tour button in cycle section', 'font-weight:bold');
  assert('Renders .cycle-tour-btn', cycleSrc.includes('cycle-tour-btn'));
  assert('Button calls startCycleTour(false)', cycleSrc.includes('startCycleTour(false)'));
  assert('Button only shown when mc exists', /\$\{mc\s*\?\s*`<button class="cycle-tour-btn"/.test(cycleSrc));
  assert('Button has ? text', /cycle-tour-btn[^>]*>(\?)<\/button>/.test(cycleSrc));

  // --- 12. CSS rule for .cycle-tour-btn ---
  console.log('%c[12] CSS rule', 'font-weight:bold');
  const cssSrc = read('/styles.css');
  assert('.cycle-tour-btn rule exists', cssSrc.includes('.cycle-tour-btn'));
  assert('24px width', /\.cycle-tour-btn\s*\{[^}]*width:\s*24px/.test(cssSrc));
  assert('border-radius: 50%', /\.cycle-tour-btn\s*\{[^}]*border-radius:\s*50%/.test(cssSrc));
  assert('Hover rule exists', cssSrc.includes('.cycle-tour-btn:hover'));

  // --- 13. Profile delete cleanup ---
  console.log('%c[13] Profile delete cleanup', 'font-weight:bold');
  const profileSrc = read('/js/profile.js');
  assert('deleteProfile removes tour key', profileSrc.includes("-tour`"));
  assert('deleteProfile removes cycleTour key', profileSrc.includes("-cycleTour`"));
  assert('deleteProfile removes phaseOverlay key', profileSrc.includes("-phaseOverlay`"));

  // --- 14. Service worker cache version ---
  console.log('%c[14] Service worker cache', 'font-weight:bold');
  const swSrc = read('/service-worker.js');
  assert('SW uses importScripts for version', swSrc.includes("importScripts('/version.js')"));
  assert('SW CACHE_NAME uses semver', swSrc.includes('`labcharts-v${self.APP_VERSION}`'));

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
