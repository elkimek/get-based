#!/usr/bin/env node
import {parse} from 'svelte/compiler';
import {JSDOM} from 'jsdom';
import {projectMarkerDetailAction} from '../js/marker-detail-projection.js';
import {renderMarkerDetailHistory, renderMarkerDetailRange} from '../js/marker-detail-results-presentation.js';
import { readRepositorySource, readAuthoredRepositorySource } from './helpers/repository-source.js';
import { readServiceWorkerSource } from '../scripts/service-worker-source.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// Static marker-detail delegated-action source guards.

const modalFacadeSrc = readRepositorySource('js/marker-detail-modal.js', 'utf8');
const modalImplSrc = readRepositorySource('js/marker-detail-modal-impl.js', 'utf8');
const manualEntrySrc = readRepositorySource('js/marker-detail-manual-entry.js', 'utf8');
const customMarkersSrc = readAuthoredRepositorySource('js/marker-detail-custom-markers.js', 'utf8');
const customPresentationSrc = readAuthoredRepositorySource('js/custom-marker-presentation.js', 'utf8');
const placementSrc = readAuthoredRepositorySource('js/marker-detail-placement.js', 'utf8');
const placementPresentationSrc = readAuthoredRepositorySource('js/marker-placement-presentation.js', 'utf8');
const modalSrc = `${modalImplSrc}\n${manualEntrySrc}\n${customMarkersSrc}\n${placementSrc}\n${placementPresentationSrc}\n${customPresentationSrc}`;
const projectedOwners = {
  range: readRepositorySource('js/components/MarkerDetailRange.svelte'),
  editor: readRepositorySource('js/components/MarkerReferenceEditor.svelte'),
  chrome: readRepositorySource('js/components/MarkerDetailChrome.svelte'),
  history: readRepositorySource('js/components/MarkerDetailHistory.svelte'),
  notes: readRepositorySource('js/components/MarkerDetailNotes.svelte'),
  placement: readRepositorySource('js/components/MarkerPlacementForm.svelte'),
  placementSummary: readRepositorySource('js/components/MarkerPlacementSummary.svelte'),
  manual: readRepositorySource('js/components/ManualMarkerEntry.svelte'),
  custom: readRepositorySource('js/components/CustomMarkerForm.svelte'),
};
const manualPresentationSrc = readAuthoredRepositorySource('js/manual-marker-entry-presentation.js');

interface ActionCoordinate {start: number; end: number}

/** Qualify the precise discriminated-union branch, then its complete element. */
function actionCoordinates(source: string, action: string, fields: Record<string, string>, branch?: string): ActionCoordinate[] {
  const ast = parse(source, {modern: true});
  const scopes: unknown[] = [];
  function collectBranches(value: unknown): void {
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(collectBranches);
      return;
    }
    const node = value as Record<string, unknown>;
    if (node.type === 'IfBlock') {
      const test = node.test as {
        type?: string; operator?: string;
        left?: {type?: string; object?: {type?: string; name?: string}; property?: {type?: string; name?: string}};
        right?: {type?: string; value?: unknown};
      };
      if (test.type === 'BinaryExpression' && test.operator === '==='
          && test.left?.type === 'MemberExpression' && test.left.object?.type === 'Identifier'
          && test.left.object.name === 'node' && test.left.property?.type === 'Identifier'
          && test.left.property.name === 'kind' && test.right?.type === 'Literal' && test.right.value === branch) {
        scopes.push(node.consequent);
      }
    }
    Object.values(node).forEach(collectBranches);
  }
  if (branch === undefined) scopes.push(ast.fragment);
  else collectBranches(ast.fragment);
  if (scopes.length !== 1) return [];

  function attributeValue(value: unknown): string | null {
    if (Array.isArray(value) && value.length !== 1) return null;
    const part = (Array.isArray(value) ? value[0] : value) as {type?: string; data?: string; expression?: {start: number; end: number}} | null;
    if (!part || typeof part !== 'object') return null;
    if (part.type === 'Text') return typeof part.data === 'string' ? JSON.stringify(part.data) : null;
    return part.expression ? source.slice(part.expression.start, part.expression.end) : null;
  }
  const matches: ActionCoordinate[] = [];
  function visit(value: unknown): void {
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Record<string, unknown>;
    if (node.type === 'RegularElement' && Array.isArray(node.attributes)) {
      const attributes = new Map<string, {start: number; end: number; value: string | null}>();
      for (const value of node.attributes) {
        const attribute = value as {type?: string; name?: string; value?: unknown; start: number; end: number};
        if (attribute.type === 'Attribute' && attribute.name) {
          attributes.set(attribute.name, {...attribute, value: attributeValue(attribute.value)});
        }
      }
      const actionAttribute = attributes.get('data-marker-detail-action');
      if (actionAttribute?.value === action
          && Object.entries(fields).every(([name, expression]) => attributes.get(`data-marker-detail-${name}`)?.value === expression)) {
        matches.push({start: actionAttribute.start, end: actionAttribute.end});
      }
    }
    Object.values(node).forEach(visit);
  }
  visit(scopes[0]);
  return matches;
}

function hasActionElement(source: string, action: string, fields: Record<string, string>, branch?: string): boolean {
  return actionCoordinates(source, action, fields, branch).length === 1;
}

/** Removing this branch's action must fail even while all sibling branches remain. */
function guardedActionElement(source: string, action: string, fields: Record<string, string>, branch?: string): boolean {
  const matches = actionCoordinates(source, action, fields, branch);
  if (matches.length !== 1) return false;
  const target = matches[0]!;
  const corrupted = source.slice(0, target.start) + source.slice(target.end);
  return !hasActionElement(corrupted, action, fields, branch);
}

const dateNote = JSDOM.fragment(renderMarkerDetailHistory({
  kind: 'date-note', text: 'Controlled note', actions: projectMarkerDetailAction('toggle-history-note'),
})).querySelector('button.mv-note');
const revertedRange = JSDOM.fragment(renderMarkerDetailRange({
  kind: 'edited-badge', label: 'Revert range', title: 'Controlled range', text: 'edited',
  actions: projectMarkerDetailAction('revert-ref-range', {id: 'controlled-marker', type: 'ref'}),
})).querySelector('.ref-edited-badge');
const editableRange = JSDOM.fragment(renderMarkerDetailRange({
  kind: 'edit-control', optimalClass: '', label: 'Reference', currentRange: '1–2', lowerLabel: 'reference', badge: null,
  actions: projectMarkerDetailAction('edit-ref-range', {id: 'controlled-marker', type: 'ref'}),
})).querySelector('button.ref-editable');

const editingSrc = readRepositorySource('js/marker-detail-editing.js', 'utf8');
const actionSrc = readRepositorySource('js/marker-detail-actions.js', 'utf8');
const runtimeSrc = readRepositorySource('js/marker-detail-runtime.js', 'utf8');
const dashboardSrc = readRepositorySource('js/dashboard-view-composition.js', 'utf8');
const swSrc = readServiceWorkerSource(relative => readRepositorySource(relative, 'utf8'));

const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

console.log('=== Marker Detail Delegated Actions ===');

const inlineHandlerRe = /\bon(?:click|keydown|submit|change|input)=/g;
const inlineHandlers = modalSrc.match(inlineHandlerRe) || [];
const editingInlineHandlers = editingSrc.match(inlineHandlerRe) || [];

assert('marker-detail-modal renders no inline event attributes',
  inlineHandlers.length === 0 && Object.values(projectedOwners).every(source => !/\bon(?:click|keydown|submit|change|input)\s*=/.test(source)),
  `found ${inlineHandlers.length}`);
assert('marker-detail-editing renders no inline event attributes',
  editingInlineHandlers.length === 0,
  `found ${editingInlineHandlers.length}`);
assert('marker-detail-modal imports and installs the delegated action helper',
  modalSrc.includes("from './marker-detail-actions.js'") &&
    modalSrc.includes('installMarkerDetailActionDelegates({') &&
    modalSrc.includes('markerDetailActionAttrs'));
assert('marker-detail-actions defines one shared action attribute helper',
  (actionSrc.match(/\bfunction\s+markerDetailActionAttrs\b/g) || []).length === 1 &&
    actionSrc.includes('data-marker-detail-action=') &&
    actionSrc.includes('data-marker-detail-${escapeAttr(dataAttrName(name))}=') &&
    actionSrc.includes("replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)") &&
    actionSrc.includes("value !== false"));
assert('marker-detail-actions installs idempotent click and keyboard delegates',
  actionSrc.includes('const markerDetailActionDelegates = new WeakMap();') &&
    actionSrc.includes('Object.assign(installedActions, actions)') &&
    actionSrc.includes("root.addEventListener('click', event => handleMarkerDetailClick(event, delegatedActions))") &&
    actionSrc.includes("root.addEventListener('keydown', event => handleMarkerDetailKeydown(event, delegatedActions))") &&
    actionSrc.includes("root.addEventListener('change', event => handleMarkerDetailChange(event, delegatedActions))"));
assert('marker-detail facade bridges delegated card clicks before the implementation loads',
  modalFacadeSrc.includes("import { installMarkerDetailActionDelegates } from './marker-detail-actions.js'") &&
    modalFacadeSrc.includes('installMarkerDetailActionDelegates({ showDetailModal, openManualEntryForm });'));
assert('marker-detail delegated actions are scoped to the installed root',
  actionSrc.includes("event.currentTarget.contains(actionEl)"));
assert('marker-detail open manual entry action preserves optional prefill date',
  actionSrc.includes('actions.openManualEntryForm?.(id, date || undefined)'));
assert('marker-detail keyboard delegate supports role-button spans and ignores form controls',
  actionSrc.includes("event.target?.closest?.('button, a, input, textarea, select')") &&
    actionSrc.includes("actionEl.getAttribute('role') !== 'button'")
    && dateNote?.getAttribute('data-marker-detail-action') === 'toggle-history-note'
    && revertedRange?.getAttribute('data-marker-detail-action') === 'revert-ref-range'
    && revertedRange?.getAttribute('data-marker-detail-id') === 'controlled-marker'
    && revertedRange?.getAttribute('data-marker-detail-type') === 'ref'
    && editableRange?.getAttribute('data-marker-detail-action') === 'edit-ref-range'
    && editableRange?.getAttribute('data-marker-detail-id') === 'controlled-marker'
    && editableRange?.getAttribute('data-marker-detail-type') === 'ref'
    && !hasActionElement(projectedOwners.editor.replace('data-marker-detail-field={node.clearMinimum.field??undefined}', ''),
      'node.clearMinimum.action', {field: 'node.clearMinimum.field??undefined'}, 'reference')
    && !hasActionElement(projectedOwners.history.replace('data-marker-detail-date={node.editAttributes?.date??undefined}', ''),
      'node.editAttributes?.action', {date: 'node.editAttributes?.date??undefined'}, 'row'));
assert('history note toggle no longer depends on brittle parentElement chaining',
  actionSrc.includes("actionEl.closest('.marker-history-row')?.querySelector('.mv-note-text')?.classList.toggle('show')") &&
    !modalSrc.includes("this.parentElement.parentElement.querySelector('.mv-note-text')"));
assert('dashboard passes the quick-marker pin dependency instead of relying on an inline window handler',
  dashboardSrc.includes('toggleDashboardQuickMarkerPin, showEmojiPicker') &&
    modalSrc.includes("projectMarkerDetailAction('quick-pin', { id })") && hasActionElement(projectedOwners.chrome, 'node.pinActions.action', {id: 'node.pinActions.id??undefined'}, 'header'));
assert('dashboard composition injects marker detail UI callbacks without runtime lookups',
  dashboardSrc.includes('configureMarkerDetailRuntime({') &&
    /configureMarkerDetailRuntime\(\{\s*isDashboardQuickMarkerPinned,\s*navigate,\s*showEmojiPicker,\s*toggleDashboardQuickMarkerPin,\s*\}\)/.test(dashboardSrc));
assert('service worker precaches marker-detail-actions.js',
  swSrc.includes("'/js/marker-detail-actions.js'"));
assert('service worker precaches marker-detail-runtime.js',
  swSrc.includes("'/js/marker-detail-runtime.js'"));
assert('service worker precaches marker-detail-placement.js',
  swSrc.includes("'/js/marker-detail-placement.js'"));
assert('marker-detail-modal delegates browser globals through runtime adapter',
  modalSrc.includes("from './marker-detail-runtime.js'") &&
    !/\bwindow(?:\.|\s*\[)/.test(modalSrc) &&
    runtimeSrc.includes('export function navigateMarkerDetailRuntime') &&
    runtimeSrc.includes('export function hasRecommendationSectionRendererRuntime') &&
    runtimeSrc.includes('export async function renderRecommendationSectionRuntime') &&
    !runtimeSrc.includes("from './views-runtime-bridge.js'"));
assert('marker-detail-editing delegates browser shell hooks through runtime adapter',
  editingSrc.includes("from './marker-detail-runtime.js'") &&
    editingSrc.includes('buildMarkerDetailSidebarRuntime') &&
    editingSrc.includes('navigateMarkerDetailRuntime') &&
    editingSrc.includes('buildSidebar: buildMarkerDetailSidebarRuntime') &&
    !/\bwindow(?:\.|\s*\[)/.test(editingSrc));
assert('marker-detail-modal only creates recommendation placeholders when renderer can fill them',
  modalSrc.includes('const shouldRenderRecommendations = isProductRecsEnabledRuntime() && hasRecommendationSectionRendererRuntime();') &&
    modalSrc.includes('if (shouldRenderRecommendations)'));

[
  'close-modal',
  'clear-ref-edit-field',
  'save-ref-range',
  'quick-pin',
  'edit-ref-range',
  'revert-ref-range',
  'rename-marker',
  'revert-marker-name',
  'open-marker-placement',
  'save-marker-placement',
  'restore-marker-placement',
  'toggle-history-note',
  'edit-marker-value',
  'delete-marker-value',
  'revert-marker-value',
  'edit-value-note',
  'delete-value-note',
  'show-detail-modal',
  'open-manual-entry',
  'ask-ai',
  'toggle-marker-note-editor',
  'save-marker-note',
  'delete-marker-note',
  'delete-custom-marker',
  'save-manual-entry',
  'save-and-add-manual-entry',
  'toggle-custom-marker-category',
  'pick-new-cat-icon',
  'save-custom-marker',
].forEach(action => {
  assert(`marker detail action ${action} is handled`,
    actionSrc.includes(`action === '${action}'`));
});

[
  "markerDetailActionAttrs('revert-ref-range', { id, type })",
  "markerDetailActionAttrs('edit-ref-range', { id, type })",
  "markerDetailActionAttrs('clear-ref-edit-field', { field: 'min' })",
  "markerDetailActionAttrs('clear-ref-edit-field', { field: 'max' })",
  "markerDetailActionAttrs('save-ref-range', { id, type })",
  "markerDetailActionAttrs('revert-marker-name', { id })",
  "markerDetailActionAttrs('rename-marker', { id })",
  "markerDetailActionAttrs('open-marker-placement', { id })",
  "markerDetailActionAttrs('save-marker-placement', { id })",
  "markerDetailActionAttrs('restore-marker-placement', { id })",
  "markerDetailActionAttrs('quick-pin', { id })",
  "markerDetailActionAttrs('close-modal')",
  "markerDetailActionAttrs('toggle-history-note')",
  "markerDetailActionAttrs('delete-marker-value', { id, date: actionDate })",
  "markerDetailActionAttrs('edit-marker-value', { id, date: actionDate, value: v })",
  "markerDetailActionAttrs('edit-value-note', { id, date: actionDate })",
  "markerDetailActionAttrs('delete-value-note', { id, date: actionDate })",
  "markerDetailActionAttrs('show-detail-modal', { id, showAllHistory: true, historyLimit: nextHistoryLimit, scrollToHistory: true })",
  "markerDetailActionAttrs('open-manual-entry', { id })",
  "markerDetailActionAttrs('ask-ai', { id })",
  "markerDetailActionAttrs('toggle-marker-note-editor', { dotKey })",
  "markerDetailActionAttrs('save-marker-note', { dotKey, id })",
  "markerDetailActionAttrs('delete-marker-note', { dotKey, id })",
  "markerDetailActionAttrs('delete-custom-marker', { id })",
  "markerDetailActionAttrs('save-manual-entry', { id })",
  "markerDetailActionAttrs('save-and-add-manual-entry', { id })",
  "markerDetailActionAttrs('toggle-custom-marker-category')",
  "markerDetailActionAttrs('pick-new-cat-icon')",
  "markerDetailActionAttrs('save-custom-marker')",
].forEach(renderedAction => {
  const action = renderedAction.match(/^markerDetailActionAttrs\('([^']+)'/)?.[1];
  type Coordinate = readonly [keyof typeof projectedOwners, string, Record<string, string>, string];
  const coordinates: Record<string, Coordinate> = {
    'revert-ref-range': ['range', 'node.actions.action', {id: 'node.actions.id??undefined', type: 'node.actions.type??undefined'}, 'edited-badge'],
    'edit-ref-range': ['range', 'node.actions.action', {id: 'node.actions.id??undefined', type: 'node.actions.type??undefined'}, 'edit-control'],
    'clear-ref-edit-field': ['editor', renderedAction.includes("'min'") ? 'node.clearMinimum.action' : 'node.clearMaximum.action', {
      field: renderedAction.includes("'min'") ? 'node.clearMinimum.field??undefined' : 'node.clearMaximum.field??undefined',
    }, 'reference'],
    'save-ref-range': ['editor', 'node.saveActions.action', {id: 'node.saveActions.id??undefined', type: 'node.saveActions.type??undefined'}, 'reference'],
    'revert-marker-name': ['chrome', 'node.revertActions.action', {id: 'node.revertActions.id??undefined'}, 'renamed'],
    'rename-marker': ['chrome', 'node.renameActions.action', {id: 'node.renameActions.id??undefined'}, 'renamed'],
    'quick-pin': ['chrome', 'node.pinActions.action', {id: 'node.pinActions.id??undefined'}, 'header'],
    'close-modal': ['chrome', 'node.closeActions.action', {}, 'header'],
    'toggle-history-note': ['history', 'node.actions.action', {}, 'date-note'],
    'delete-marker-value': ['history', 'node.actions.action', {id: 'node.actions.id??undefined', date: 'node.actions.date??undefined'}, 'delete-value'],
    'edit-marker-value': ['history', 'node.editAttributes?.action', {id: 'node.editAttributes?.id??undefined', date: 'node.editAttributes?.date??undefined', value: 'node.editAttributes?.value??undefined'}, 'row'],
    'edit-value-note': ['history', 'node.editActions.action', {id: 'node.editActions.id??undefined', date: 'node.editActions.date??undefined'}, 'value-note'],
    'delete-value-note': ['history', 'node.deleteActions.action', {id: 'node.deleteActions.id??undefined', date: 'node.deleteActions.date??undefined'}, 'value-note'],
    'show-detail-modal': ['history', 'node.actions.action', {id: 'node.actions.id??undefined', 'show-all-history': 'node.actions.showAllHistory??undefined', 'history-limit': 'node.actions.historyLimit??undefined', 'scroll-to-history': 'node.actions.scrollToHistory??undefined'}, 'more'],
    'open-manual-entry': ['chrome', 'node.manualActions.action', {id: 'node.manualActions.id??undefined'}, 'primary-actions'],
    'ask-ai': ['chrome', 'node.askActions.action', {id: 'node.askActions.id??undefined'}, 'primary-actions'],
    'toggle-marker-note-editor': ['notes', 'node.editActions.action', {'dot-key': 'node.editActions.dotKey??undefined'}, 'editor'],
    'save-marker-note': ['notes', 'node.saveActions.action', {'dot-key': 'node.saveActions.dotKey??undefined', id: 'node.saveActions.id??undefined'}, 'editor'],
    'delete-marker-note': ['notes', 'node.actions.action', {'dot-key': 'node.actions.dotKey??undefined', id: 'node.actions.id??undefined'}, 'delete'],
    'delete-custom-marker': ['chrome', 'node.actions.action', {id: 'node.actions.id??undefined'}, 'delete-marker'],
  };
  const coordinate = action ? coordinates[action] : undefined;
  const projectedCall = renderedAction.replace('markerDetailActionAttrs(', 'projectMarkerDetailAction(');
  let currentContract = coordinate !== undefined
    && (modalSrc.includes(projectedCall) || editingSrc.includes(projectedCall))
    && guardedActionElement(projectedOwners[coordinate[0]], coordinate[1], coordinate[2], coordinate[3]);

  if (action === 'open-marker-placement' || action === 'save-marker-placement' || action === 'restore-marker-placement') {
    const owner = action === 'open-marker-placement' ? projectedOwners.placementSummary : projectedOwners.placement;
    const field = action === 'open-marker-placement' ? 'view.open' : action === 'save-marker-placement' ? 'view.save' : 'view.restore';
    currentContract = placementPresentationSrc.includes(`action('${action}',id)`)
      && guardedActionElement(owner, `${field}.action`, {id: `${field}.id??undefined`})
      && placementSrc.includes('modal.innerHTML = renderPlacementForm(id,context,currentLabel,nativeLabel,moved)');
  }
  if (action === 'save-manual-entry' || action === 'save-and-add-manual-entry') {
    const field = action === 'save-manual-entry' ? 'save' : 'add';
    const authoredManual = readAuthoredRepositorySource('js/marker-detail-manual-entry.js');
    currentContract = authoredManual.includes(`${field}Action: () => ({action:'${action}',id})`)
      && manualPresentationSrc.includes(`action(input.${field}Action(),'${action}')`)
      && guardedActionElement(projectedOwners.manual, `view.${field}.action`, {id: `view.${field}.id`});
  }
  if (action === 'toggle-custom-marker-category' || action === 'pick-new-cat-icon' || action === 'save-custom-marker') {
    currentContract = guardedActionElement(projectedOwners.custom, JSON.stringify(action), {})
      && customPresentationSrc.includes("from './components/CustomMarkerForm.svelte.html.js'")
      && customMarkersSrc.includes('modal.innerHTML = renderCustomMarkerForm(data.categories)');
  }
  assert(`marker detail renders ${renderedAction}`, currentContract);
});

[
  'openManualEntryForm',
  'askAIAboutMarker',
  'deleteMarkerValue',
  'editMarkerValue',
  'editValueNote',
  'deleteValueNote',
  'toggleMarkerNoteEditor',
  'saveMarkerNote',
  'deleteMarkerNote',
  'saveManualEntry',
  'saveAndAddAnotherManualEntry',
  'deleteCustomMarker',
].forEach(fnName => {
  assert(`marker-detail-modal has no inline onclick ${fnName} call`,
    !modalSrc.includes(`onclick="${fnName}`) &&
      !modalSrc.includes(`onclick="event.stopPropagation();${fnName}`) &&
      !modalSrc.includes(`onclick="event.preventDefault();event.stopPropagation();${fnName}`));
});

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
if (legacyAssertions.fail > 0) process.exit(1);
