#!/usr/bin/env node
// Static EMF delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const emfSrc = fs.readFileSync(path.join(root, 'js/emf.js'), 'utf8');
const emfEditorSrc = fs.readFileSync(path.join(root, 'js/emf-editor.js'), 'utf8');
const emfRuntimeSrc = fs.readFileSync(path.join(root, 'js/emf-runtime.js'), 'utf8');
const emfInterpretationSrc = fs.readFileSync(path.join(root, 'js/emf-interpretation.js'), 'utf8');

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

function section(source, start, end) {
  const startIdx = source.indexOf(start);
  const endIdx = source.indexOf(end, startIdx);
  return startIdx >= 0 && endIdx > startIdx ? source.slice(startIdx, endIdx) : '';
}

const editorSrc = section(emfEditorSrc, 'export const emfEditorState', 'export function showEMFImportPreview(parsed)');
const importPreviewSrc = section(emfEditorSrc, 'export function showEMFImportPreview(parsed)', 'function renderComparisonView(sorted)');
const compareSrc = section(emfEditorSrc, 'function renderComparisonView(sorted)', 'return html;\n}');
function interpretationSection(start, end) {
  const startIdx = emfInterpretationSrc.indexOf(start);
  const endIdx = emfInterpretationSrc.indexOf(end, startIdx);
  return startIdx >= 0 && endIdx > startIdx ? emfInterpretationSrc.slice(startIdx, endIdx) : '';
}

const interpretationSrc = interpretationSection('function _handleEMFInterpretationMouseDown', 'function _collectMitigationTags');
const closePreviewSrc = section(emfEditorSrc, 'function closeEMFPreviewModal()', 'function closeEMFEditorModal()');
const migratedEditorSurface = `${editorSrc}\n${importPreviewSrc}\n${compareSrc}`;
const inlineHandlerRe = /\bon(?:click|keydown|submit|change|input)=/;

console.log('=== EMF Delegated Actions ===');

assert('EMF editor migrated surface renders no inline event attributes',
  migratedEditorSurface.length > 0 && !inlineHandlerRe.test(migratedEditorSurface));
assert('EMF interpretation modal renders no inline event attributes',
  interpretationSrc.length > 0 && !inlineHandlerRe.test(interpretationSrc));
assert('EMF editor imports shared tag toggle instead of inline global handler',
  emfEditorSrc.includes("import { toggleCtxTag } from './context-card-editor-ui.js';") &&
    migratedEditorSurface.includes("if (action === 'toggle-tag') { toggleCtxTag(actionElement); return; }"));
assert('EMF editor uses escaped data-action helpers',
  emfEditorSrc.includes('function emfActionAttrs') &&
    emfEditorSrc.includes('function emfChangeAttrs') &&
    emfEditorSrc.includes('escapeAttr(String(value))'));
assert('EMF editor installs idempotent click change and keydown delegates',
  emfEditorSrc.includes('let emfEditorDelegatesInstalled = false') &&
    emfEditorSrc.includes("document.addEventListener('click', handleEMFEditorClick)") &&
    emfEditorSrc.includes("document.addEventListener('change', handleEMFEditorChange)") &&
    emfEditorSrc.includes("document.addEventListener('keydown', handleEMFEditorKeydown)") &&
    emfEditorSrc.includes('installEMFEditorDelegates();'));
assert('EMF editor delegates are scoped to #detail-modal',
  emfEditorSrc.includes("return !!element.closest('#detail-modal');") &&
    emfEditorSrc.includes('!isEMFEditorTarget(actionElement)'));
assert('EMF editor close path preserves save and lightbox cleanup',
  emfEditorSrc.includes('function closeEMFEditorModal()') &&
    emfEditorSrc.includes('emfEditorDeps.collectActiveAssessmentState?.();') &&
    emfEditorSrc.includes("document.querySelectorAll('.emf-lightbox').forEach(element => removeModalOverlay(element));") &&
    emfEditorSrc.includes('removeEMFEditorDelegates();') &&
    emfEditorSrc.includes('emfEditorDeps.closeModal?.();'));
assert('EMF editor runtime hooks avoid counted direct window globals',
  !emfSrc.includes("from './views-runtime-bridge.js'") &&
    !emfEditorSrc.includes("from './views-runtime-bridge.js'") &&
    !emfSrc.includes('getViewRuntimeFunction') &&
    !emfEditorSrc.includes('getViewRuntimeFunction') &&
    emfSrc.includes('closeModal: () => emfRuntimeDeps.closeModal?.()') &&
    emfRuntimeSrc.includes('mod.configureEMFRuntimeDeps(emfRuntimeDeps);') &&
    !emfRuntimeSrc.includes("import('./emf.js')") &&
    emfSrc.includes("showPromptDialog('Room name:'") &&
    !/\bwindow(?:\.|\s*\[)/.test(`${emfSrc}\n${emfEditorSrc}`));
assert('EMF interpretation runtime hooks avoid counted direct window globals',
  !emfInterpretationSrc.includes("from './views-runtime-bridge.js'") &&
    !emfInterpretationSrc.includes('getViewRuntimeFunction') &&
    emfInterpretationSrc.includes('emfInterpretationRuntimeDeps.closeModal?.()') &&
    emfInterpretationSrc.includes('emfInterpretationRuntimeDeps.openChatPanel?.(message)') &&
    !/\bwindow(?:\.|\s*\[)/.test(emfInterpretationSrc));
assert('EMF editor X button uses saving close action',
  editorSrc.includes('class="modal-close" aria-label="Close" ${emfActionAttrs(\'close-editor\')}'));
assert('EMF import preview close path returns to the editor without persisting',
  closePreviewSrc.length > 0 &&
    !closePreviewSrc.includes('collectActiveAssessmentState') &&
    !closePreviewSrc.includes('saveImportedData') &&
    closePreviewSrc.includes('renderEMFEditor(modal)') &&
    emfEditorSrc.includes("if (action === 'close-preview') { closeEMFPreviewModal(); return; }") &&
    emfEditorSrc.includes("${emfActionAttrs('close-preview')}>Cancel</button>"));
assert('EMF import preview exposes back and X routes to the assessment editor',
  importPreviewSrc.includes('class="context-back-btn" aria-label="Back to EMF assessments"') &&
  importPreviewSrc.includes('class="modal-close" aria-label="Back to EMF assessments" ${emfActionAttrs(\'close-preview\')}'));
assert('EMF editor delegates can be explicitly removed',
  emfEditorSrc.includes('function removeEMFEditorDelegates()') &&
    emfEditorSrc.includes("document.removeEventListener('click', handleEMFEditorClick)") &&
    emfEditorSrc.includes("document.removeEventListener('change', handleEMFEditorChange)") &&
    emfEditorSrc.includes("document.removeEventListener('keydown', handleEMFEditorKeydown)"));
assert('EMF interpretation modal installs scoped action delegates',
  emfInterpretationSrc.includes('function emfInterpActionAttrs') &&
    interpretationSrc.includes('data-emf-interp-action') &&
    interpretationSrc.includes('installEMFInterpretationDelegates(overlay);') &&
    interpretationSrc.includes("overlay.addEventListener('mousedown', _handleEMFInterpretationMouseDown)") &&
    interpretationSrc.includes("overlay.addEventListener('click', _handleEMFInterpretationClick)") &&
    interpretationSrc.includes("if (action === 'close')") &&
    interpretationSrc.includes("if (action === 'discuss')") &&
    interpretationSrc.includes("if (action === 'generate')"));
assert('EMF interpretation streamed discuss button uses delegated action',
  interpretationSrc.includes("querySelector('[data-emf-interp-action=\"discuss\"]')") &&
    interpretationSrc.includes("dataset.emfInterpAction = 'discuss'") &&
    !interpretationSrc.includes('discussBtn.onclick'));

[
  'close-editor',
  'close-preview',
  'add-assessment',
  'trigger-pdf-import',
  'toggle-compare',
  'toggle-assessment',
  'select-room',
  'add-room',
  'remove-room',
  'save',
  'interpret-assessment',
  'delete-assessment',
  'toggle-tag',
  'view-photo',
  'remove-photo',
  'interpret-comparison',
].forEach(action => {
  assert(`EMF click action ${action} is handled`, emfEditorSrc.includes(`action === '${action}'`));
});

[
  'pdf-input',
  'field',
  'room-dropdown',
  'room-field',
  'measurement',
  'meter',
  'photos',
].forEach(action => {
  assert(`EMF change action ${action} is handled`, emfEditorSrc.includes(`action === '${action}'`));
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
