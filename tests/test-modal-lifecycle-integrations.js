#!/usr/bin/env node
// Static source guards for modules migrated to shared modal overlay helpers.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const contextCardsSrc = fs.readFileSync(path.join(root, 'js/context-cards.js'), 'utf8');
const contextMedicalSrc = fs.readFileSync(path.join(root, 'js/context-card-medical-history-editor.js'), 'utf8');
const dashboardAiSrc = fs.readFileSync(path.join(root, 'js/context-card-dashboard-ai.js'), 'utf8');
const cycleSrc = fs.readFileSync(path.join(root, 'js/cycle.js'), 'utf8');
const lightEnvSrc = fs.readFileSync(path.join(root, 'js/light-env.js'), 'utf8');
const providerPanelsSrc = fs.readFileSync(path.join(root, 'js/provider-panels.js'), 'utf8');
const recommendationActionsSrc = fs.readFileSync(path.join(root, 'js/recommendation-actions.js'), 'utf8');
const recommendationsSrc = fs.readFileSync(path.join(root, 'js/recommendations.js'), 'utf8');
const supplementsSrc = fs.readFileSync(path.join(root, 'js/supplements.js'), 'utf8');

let passed = 0;
let failed = 0;

function assert(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.log(`  FAIL: ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

console.log('=== Modal Lifecycle Integrations ===');

assert('cycle editor opens through shared overlay lifecycle helper',
  cycleSrc.includes("from './modal-lifecycle.js'") &&
    cycleSrc.includes('openModalOverlay(overlay)') &&
    !cycleSrc.includes('overlay.classList.add("show")'));

assert('supplements editor opens through shared overlay lifecycle helper',
  supplementsSrc.includes("from './modal-lifecycle.js'") &&
    supplementsSrc.includes('openModalOverlay(overlay)') &&
    !supplementsSrc.includes('overlay.classList.add("show")'));

assert('dashboard AI pickers use shared overlay lifecycle helpers',
  dashboardAiSrc.includes("from './modal-lifecycle.js'") &&
    dashboardAiSrc.includes('openModalOverlay(overlay, {') &&
    dashboardAiSrc.includes('closeModalOverlay(overlay)') &&
    !dashboardAiSrc.includes("overlay.classList.add('show')") &&
    !dashboardAiSrc.includes("overlay.classList.remove('show')"));

assert('context medical history and card tips open through shared overlay lifecycle helper',
  contextMedicalSrc.includes("from './modal-lifecycle.js'") &&
    contextCardsSrc.includes("from './modal-lifecycle.js'") &&
    contextMedicalSrc.includes('openModalOverlay(overlay)') &&
    contextCardsSrc.includes('openModalOverlay(overlay)') &&
    !contextMedicalSrc.includes('overlay.classList.add("show")') &&
    !contextCardsSrc.includes("overlay.classList.add('show')"));

assert('card tips modal closes through shared detail modal close path',
  recommendationsSrc.includes('onclick="window.closeModal()"') &&
    recommendationsSrc.includes('event.preventDefault();window.closeModal();setTimeout(()=>window.openEMFAssessmentEditor(),100);') &&
    !recommendationsSrc.includes("document.getElementById('modal-overlay').classList.remove('show')"));

assert('recommendation detail modal opens through shared overlay lifecycle helper',
  recommendationActionsSrc.includes("from './modal-lifecycle.js'") &&
    recommendationActionsSrc.includes('openModalOverlay(overlay)') &&
    !recommendationActionsSrc.includes('overlay.classList.add("show")'));

assert('OpenRouter balance dialog uses shared overlay lifecycle helpers',
  providerPanelsSrc.includes("from './modal-lifecycle.js'") &&
    providerPanelsSrc.includes("openModalOverlay(overlay, { initialFocus: '#or-add-credits', focusDelay: 50 })") &&
    providerPanelsSrc.includes('closeModalOverlay(overlay)') &&
    !providerPanelsSrc.includes("overlay.classList.add('show')") &&
    !providerPanelsSrc.includes("overlay.classList.remove('show')"));

assert('light environment assessment uses shared overlay lifecycle before removal',
  lightEnvSrc.includes("from './modal-lifecycle.js'") &&
    lightEnvSrc.includes("const wasOpen = overlay?.classList?.contains('show') === true;") &&
    lightEnvSrc.includes("overlay.className = 'modal-overlay light-env-assessment-overlay'") &&
    lightEnvSrc.includes("openModalOverlay(overlay, wasOpen ? {} : { initialFocus: '.modal-close', focusDelay: 50 })") &&
    lightEnvSrc.includes('closeModalOverlay(overlay)') &&
    lightEnvSrc.includes('overlay.remove()') &&
    !lightEnvSrc.includes("overlay.className = 'modal-overlay show light-env-assessment-overlay'") &&
    !lightEnvSrc.includes("overlay.classList.add('show')"));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
