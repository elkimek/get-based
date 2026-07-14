#!/usr/bin/env node
// Static EMF delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const emfSrc = fs.readFileSync(path.join(root, 'js/emf.js'), 'utf8');
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

function section(start, end) {
  const startIdx = emfSrc.indexOf(start);
  const endIdx = emfSrc.indexOf(end, startIdx);
  return startIdx >= 0 && endIdx > startIdx ? emfSrc.slice(startIdx, endIdx) : '';
}

const editorSrc = section('let _editingAssessmentId = null;', '// ═══════════════════════════════════════════════\n// CRUD OPERATIONS');
const importPreviewSrc = section('function showEMFImportPreview(parsed)', '// ═══════════════════════════════════════════════\n// BEFORE / AFTER COMPARISON');
const compareSrc = section('function renderComparisonView(sorted)', '// ═══════════════════════════════════════════════\n// AI INTERPRETATION');
function interpretationSection(start, end) {
  const startIdx = emfInterpretationSrc.indexOf(start);
  const endIdx = emfInterpretationSrc.indexOf(end, startIdx);
  return startIdx >= 0 && endIdx > startIdx ? emfInterpretationSrc.slice(startIdx, endIdx) : '';
}

const interpretationSrc = interpretationSection('function _handleEMFInterpretationMouseDown', 'function _collectMitigationTags');
const closePreviewSrc = section('function closeEMFPreviewModal()', 'function closeEMFEditorModal()');
const migratedEditorSurface = `${editorSrc}\n${importPreviewSrc}\n${compareSrc}`;
const inlineHandlerRe = /\bon(?:click|keydown|submit|change|input)=/;

console.log('=== EMF Delegated Actions ===');

assert('EMF editor migrated surface renders no inline event attributes',
  migratedEditorSurface.length > 0 && !inlineHandlerRe.test(migratedEditorSurface));
assert('EMF interpretation modal renders no inline event attributes',
  interpretationSrc.length > 0 && !inlineHandlerRe.test(interpretationSrc));
assert('EMF editor imports shared tag toggle instead of inline global handler',
  emfSrc.includes("import { toggleCtxTag } from './context-card-editor-ui.js';") &&
    migratedEditorSurface.includes("if (action === 'toggle-tag') { toggleCtxTag(actionEl); return; }"));
assert('EMF editor uses escaped data-action helpers',
  emfSrc.includes('function emfActionAttrs') &&
    emfSrc.includes('function emfChangeAttrs') &&
    emfSrc.includes('escapeAttr(String(value))'));
assert('EMF editor installs idempotent click change and keydown delegates',
  emfSrc.includes('let emfEditorDelegatesInstalled = false') &&
    emfSrc.includes("document.addEventListener('click', _handleEMFEditorClick)") &&
    emfSrc.includes("document.addEventListener('change', _handleEMFEditorChange)") &&
    emfSrc.includes("document.addEventListener('keydown', _handleEMFEditorKeydown)") &&
    emfSrc.includes('installEMFEditorDelegates();'));
assert('EMF editor delegates are scoped to #detail-modal',
  emfSrc.includes("return !!el.closest('#detail-modal');") &&
    emfSrc.includes('!isEMFEditorTarget(actionEl)'));
assert('EMF editor close path preserves save and lightbox cleanup',
  emfSrc.includes('function closeEMFEditorModal()') &&
    emfSrc.includes('collectActiveAssessmentState();') &&
    emfSrc.includes("document.querySelectorAll('.emf-lightbox').forEach(el => removeModalOverlay(el));") &&
    emfSrc.includes('removeEMFEditorDelegates();') &&
    emfSrc.includes('closeEMFModalRuntime();'));
assert('EMF editor runtime hooks avoid counted direct window globals',
  emfSrc.includes("getEMFRuntimeFunction('closeModal')") &&
    emfSrc.includes('return showPromptDialog(message, options);') &&
    !/\bwindow(?:\.|\s*\[)/.test(emfSrc));
assert('EMF interpretation runtime hooks avoid counted direct window globals',
  emfInterpretationSrc.includes('function getEMFInterpretationRuntimeFunction') &&
    emfInterpretationSrc.includes("getEMFInterpretationRuntimeFunction('closeModal')") &&
    emfInterpretationSrc.includes("getEMFInterpretationRuntimeFunction('openChatPanel')") &&
    !/\bwindow(?:\.|\s*\[)/.test(emfInterpretationSrc));
assert('EMF editor X button uses saving close action',
  editorSrc.includes('class="modal-close" aria-label="Close" ${emfActionAttrs(\'close-editor\')}'));
assert('EMF import preview close path does not persist editor state',
  closePreviewSrc.length > 0 &&
    !closePreviewSrc.includes('collectActiveAssessmentState') &&
    !closePreviewSrc.includes('saveImportedData') &&
    emfSrc.includes("if (action === 'close-preview') { closeEMFPreviewModal(); return; }") &&
    emfSrc.includes("${emfActionAttrs('close-preview')}>Cancel</button>"));
assert('EMF import preview X button uses non-saving close action',
  importPreviewSrc.includes('class="modal-close" aria-label="Close" ${emfActionAttrs(\'close-preview\')}'));
assert('EMF editor delegates can be explicitly removed',
  emfSrc.includes('function removeEMFEditorDelegates()') &&
    emfSrc.includes("document.removeEventListener('click', _handleEMFEditorClick)") &&
    emfSrc.includes("document.removeEventListener('change', _handleEMFEditorChange)") &&
    emfSrc.includes("document.removeEventListener('keydown', _handleEMFEditorKeydown)"));
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
  assert(`EMF click action ${action} is handled`, emfSrc.includes(`action === '${action}'`));
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
  assert(`EMF change action ${action} is handled`, emfSrc.includes(`action === '${action}'`));
});

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
