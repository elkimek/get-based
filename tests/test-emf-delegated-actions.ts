#!/usr/bin/env node
import { readRepositorySource } from './helpers/repository-source.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// Static EMF delegated-action source guards.

const emfSrc = readRepositorySource('js/emf.js', 'utf8');
const emfEditorSrc = readRepositorySource('js/emf-editor.js', 'utf8').replace(/if \(action === '(toggle-tag|close-preview)'\) \{\s*(toggleCtxTag\(actionElement\)|closeEMFPreviewModal\(\));\s*return;\s*\}/g, "if (action === '$1') { $2; return; }");
const emfRuntimeSrc = readRepositorySource('js/emf-runtime.js', 'utf8');
const emfInterpretationSrc = readRepositorySource('js/emf-interpretation.js', 'utf8');
const emfInterpretationRuntimeSrc = readRepositorySource('js/emf-interpretation-runtime.js', 'utf8');
const emfInterpretationOwners = `${emfInterpretationSrc}\n${emfInterpretationRuntimeSrc}`;
const emfPresentationSrc = readRepositorySource('js/components/EMFInterpretationModal.svelte', 'utf8') + readRepositorySource('js/components/EMFInterpretationStatus.svelte', 'utf8');

const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

function section(source: string, start: string, end: string) {
  const startIdx = source.indexOf(start);
  const endIdx = source.indexOf(end, startIdx);
  return startIdx >= 0 && endIdx > startIdx ? source.slice(startIdx, endIdx) : '';
}

const editorSrc = section(emfEditorSrc, 'export const emfEditorState', 'export function showEMFImportPreview(parsed)');
const importPreviewSrc = section(emfEditorSrc, 'export function showEMFImportPreview(parsed)', 'function projectComparisonView(sorted)');
const comparisonStart = emfEditorSrc.indexOf('function projectComparisonView(sorted)');
const compareSrc = comparisonStart >= 0 ? emfEditorSrc.slice(comparisonStart) : '';
const comparisonOwnerSrc = readRepositorySource('js/components/EMFComparison.svelte', 'utf8');
const editorOwnerSrc=readRepositorySource('js/components/EMFEditor.svelte','utf8');
const previewOwnerSrc=readRepositorySource('js/components/EMFImportPreview.svelte','utf8');
const genuineEditorOwners=['EMFEditor','EMFAssessmentDetail','EMFRoomContent','EMFImportPreview','EMFMeterRecommendations'].map(name=>readRepositorySource('js/components/'+name+'.svelte','utf8')).join('\n');
function interpretationSection(start: string, end: string) {
  const startIdx = emfInterpretationSrc.indexOf(start);
  const endIdx = emfInterpretationSrc.indexOf(end, startIdx);
  return startIdx >= 0 && endIdx > startIdx ? emfInterpretationSrc.slice(startIdx, endIdx) : '';
}

const interpretationSrc = interpretationSection('function _handleEMFInterpretationMouseDown', 'function _collectMitigationTags');
const closePreviewSrc = section(emfEditorSrc, 'function closeEMFPreviewModal()', 'function closeEMFEditorModal()');
const migratedEditorSurface = `${editorSrc}\n${importPreviewSrc}\n${compareSrc}\n${comparisonOwnerSrc}\n${genuineEditorOwners}`;
const inlineHandlerRe = /\bon(?:click|keydown|submit|change|input)=/;

console.log('=== EMF Delegated Actions ===');

assert('EMF comparison source scope reaches the entire current genuine owner and native snapshot function', compareSrc.length > 0 && compareSrc.includes('beforeDate + beforeLabel') && editorOwnerSrc.includes('<EMFComparison view={view.body.view}/>') && comparisonOwnerSrc.includes('data-emf-action="interpret-comparison"'));

assert('EMF editor migrated surface renders no inline event attributes',
  migratedEditorSurface.length > 0 && !inlineHandlerRe.test(migratedEditorSurface));
assert('EMF interpretation modal renders no inline event attributes',
  interpretationSrc.length > 0 && !inlineHandlerRe.test(interpretationSrc) && !/\son[a-z]+\s*=|\bon:[a-z]+|\{on[a-z]+\}/.test(emfPresentationSrc));
assert('EMF editor imports shared tag toggle instead of inline global handler',
  emfEditorSrc.includes("import { toggleCtxTag } from './context-card-editor-ui.js';") &&
    migratedEditorSurface.includes("if (action === 'toggle-tag') { toggleCtxTag(actionElement); return; }"));
assert('EMF editor genuine owners escape literal data and avoid raw child HTML/action string codecs',
  genuineEditorOwners.includes('data-emf-action="toggle-tag"') && genuineEditorOwners.includes('data-emf-assessment-id={') &&
    !genuineEditorOwners.includes('{@html') && !emfEditorSrc.includes('function emfActionAttrs') &&
    !emfEditorSrc.includes('function emfChangeAttrs'));
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
  !emfInterpretationOwners.includes("from './views-runtime-bridge.js'") &&
    !emfInterpretationOwners.includes('getViewRuntimeFunction') &&
    emfInterpretationSrc.includes('getEMFInterpretationRuntimeDeps().closeModal?.()') &&
    emfInterpretationSrc.includes('getEMFInterpretationRuntimeDeps().openChatPanel?.(message)') &&
    !/\bwindow(?:\.|\s*\[)/.test(emfInterpretationOwners));
assert('EMF interpretation shares one configured dependency holder and preserves its public configure binding',
  emfInterpretationSrc.includes("from './emf-interpretation-runtime.js'") &&
    emfInterpretationSrc.includes('export { configureEMFInterpretationRuntimeDeps };') &&
    !emfInterpretationSrc.includes('const emfInterpretationRuntimeDeps') &&
    emfInterpretationRuntimeSrc.includes('export function configureEMFInterpretationRuntimeDeps(deps = {})') &&
    emfInterpretationRuntimeSrc.includes('export function getEMFInterpretationRuntimeDeps()') &&
    emfInterpretationRuntimeSrc.includes('return emfInterpretationRuntimeDeps;'));
assert('EMF interpretation dependency defaults and patch precedence remain with the shared runtime owner',
  emfInterpretationRuntimeSrc.includes('callClaudeAPI: callAssistantFeatureAI') &&
    emfInterpretationRuntimeSrc.includes('closeModal: null') && emfInterpretationRuntimeSrc.includes('openChatPanel: null') &&
    emfInterpretationRuntimeSrc.includes('const previous = { ...emfInterpretationRuntimeDeps };') &&
    emfInterpretationRuntimeSrc.includes("if (typeof deps.callClaudeAPI === 'function')") &&
    emfInterpretationRuntimeSrc.includes("Object.hasOwn(deps, 'closeModal')") &&
    emfInterpretationRuntimeSrc.includes("Object.prototype.hasOwnProperty.call(deps, 'openChatPanel')") &&
    emfInterpretationRuntimeSrc.includes('return previous;'));
assert('EMF interpretation close registration stays synchronous and cold-safe with one loaded abort and modal owner',
  emfInterpretationSrc.includes('registerEMFInterpretationCloseHandler(closeEMFInterpretation);') &&
    emfInterpretationSrc.includes('_aiAbortController.abort()') && emfInterpretationSrc.includes('removeModalOverlay(overlay)') &&
    emfInterpretationRuntimeSrc.includes('export function registerEMFInterpretationCloseHandler(close)') &&
    emfInterpretationRuntimeSrc.includes('closeLoadedInterpretation = close;') &&
    emfInterpretationRuntimeSrc.includes('closeLoadedInterpretation?.();') &&
    !emfInterpretationRuntimeSrc.includes('import(') && !emfInterpretationRuntimeSrc.includes("'./emf-interpretation.js'") &&
    !emfInterpretationRuntimeSrc.includes('AbortController') && !emfInterpretationRuntimeSrc.includes('removeModalOverlay'));
assert('EMF editor X button uses saving close action',
  editorOwnerSrc.includes('class="modal-close" aria-label="Close" data-emf-action="close-editor"'));
assert('EMF import preview close path returns to the editor without persisting',
  closePreviewSrc.length > 0 &&
    !closePreviewSrc.includes('collectActiveAssessmentState') &&
    !closePreviewSrc.includes('saveImportedData') &&
    closePreviewSrc.includes('renderEMFEditor(modal)') &&
    emfEditorSrc.includes("if (action === 'close-preview') { closeEMFPreviewModal(); return; }") &&
    previewOwnerSrc.includes('data-emf-action="close-preview">Cancel</button>'));
assert('EMF import preview exposes back and X routes to the assessment editor',
  importPreviewSrc.includes('renderEMFImportPreviewPresentation(view)') && previewOwnerSrc.includes('class="context-back-btn" aria-label="Back to EMF assessments"') &&
  previewOwnerSrc.includes('class="modal-close" aria-label="Back to EMF assessments" data-emf-action="close-preview"'));
assert('EMF editor delegates can be explicitly removed',
  emfEditorSrc.includes('function removeEMFEditorDelegates()') &&
    emfEditorSrc.includes("document.removeEventListener('click', handleEMFEditorClick)") &&
    emfEditorSrc.includes("document.removeEventListener('change', handleEMFEditorChange)") &&
    emfEditorSrc.includes("document.removeEventListener('keydown', handleEMFEditorKeydown)"));
assert('EMF interpretation modal installs scoped action delegates',
  emfPresentationSrc.includes('data-emf-interp-action="close"') && emfPresentationSrc.includes('data-emf-interp-action="generate"') &&
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

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
if (legacyAssertions.fail > 0) process.exit(1);
