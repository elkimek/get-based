// @vitest-environment jsdom
import {createRequire} from 'node:module';
import {expect, it} from 'vitest';
import {renderMarkerDetailModal} from '../js/marker-detail-modal-presentation.js';
import {renderMarkerDetailBioAge, renderMarkerDetailChrome, renderMarkerDetailNotes} from '../js/marker-detail-complete-presentation.js';
import {projectMarkerDetailAction} from '../js/marker-detail-projection.js';
import {buildMarkerHistoryMetadata} from '../js/marker-detail-history.js';
import type {MarkerDetailModalView, HistoryRow} from '../js/marker-detail-view.js';
import {expectNativeReview} from './helpers/native-review-dom.js';

const load = createRequire(import.meta.url);
const marker = 'synthetic_marker';
const date = '2026-08-25';
const label = '<strong>Recorded marker name</strong>';
const note = '<i>Private collection note</i>';
const privateFile = '/synthetic-private-path/report.pdf';
const action = projectMarkerDetailAction;
const rowId = {id: marker, date, panelId: 'reviewed-sample'};
const manualRowId = {...rowId, panelId: 'different-sample'};

const primary = {
  kind: 'primary-actions',
  manualActions: action('open-manual-entry', {id: marker}),
  askActions: action('ask-ai', {id: marker}),
} as const;

const notes = {
  kind: 'editor', text: note, editLabel: 'Edit note',
  editActions: action('toggle-marker-note-editor', {id: marker}),
  note: {kind: 'text', text: note},
  saveActions: action('save-marker-note', {id: marker}),
  cancelActions: action('toggle-marker-note-editor', {id: marker}),
  delete: {kind: 'delete', actions: action('delete-marker-note', {id: marker})},
} as const;

function markerView(detailed: boolean): MarkerDetailModalView {
  const metadata = buildMarkerHistoryMetadata(
    {specimen: 'plasma', context: {sampleTime: '08:00', fasting: true}, sourceFile: privateFile},
    {snapshotId: 'saved-report', file: privateFile, at: 1}, date,
  );
  const imported: HistoryRow = {
    kind: 'row', status: 'normal', deleteButton: {kind: 'delete-value', actions: action('delete-marker-value', rowId)},
    date: date + ' · Sample 1', dateNote: {kind: 'date-note', text: note, actions: action('toggle-history-note', rowId)},
    source: metadata.sources, valueStatus: 'normal',
    editAttributes: action('edit-marker-value', {...rowId, value: '5'}), value: '5',
    manualBadge: null, badgeStatus: 'normal', statusLabel: 'In range',
    alternate: {kind: 'alternate-value', value: '90', unit: 'mg/dL'},
    phase: {kind: 'phase', phase: 'Follicular', minimum: '4', maximum: '6'},
    collection: metadata.collection,
    valueNote: {kind: 'value-note', text: note, editActions: action('edit-value-note', rowId), deleteActions: action('delete-value-note', rowId)},
  };
  const manual: HistoryRow = {
    ...imported, date: date + ' · Sample 2', value: '7', status: 'high', valueStatus: 'high',
    badgeStatus: 'high', statusLabel: 'Above range', dateNote: null,
    deleteButton: {kind: 'delete-value', actions: action('delete-marker-value', manualRowId)},
    source: [{kind: 'source-edited'}, {kind: 'source-manual'}], editAttributes: null,
    manualBadge: {kind: 'manual-revert', actions: action('revert-marker-value', manualRowId)},
    alternate: null, phase: null, collection: null,
    valueNote: {kind: 'add-note', actions: action('edit-value-note', manualRowId)},
  };
  return {
    header: {
      kind: 'header', name: label, unit: 'mmol/L',
      placement: {currentLabel: 'Synthetic lab group', markerName: label, open: {action: 'open-marker-placement', id: marker},
        native: detailed ? {label: 'Original lab group', restore: {action: 'restore-marker-placement', id: marker}} : null},
      rename: detailed
        ? {kind: 'renamed', renameActions: action('rename-marker', {id: marker}), revertActions: action('revert-marker-name', {id: marker})}
        : {kind: 'rename', actions: action('rename-marker', {id: marker})},
      alternate: detailed ? {kind: 'alternate-unit', unit: 'mg/dL', ranges: [
        {label: 'Reference', range: '72–108', optimal: false},
        {label: 'Optimal', range: '80–90', optimal: true},
      ]} : null,
      pinClass: detailed ? ' pinned' : '', pinPressed: detailed ? 'true' : 'false',
      pinTitle: 'Pin marker', pinActions: action('quick-pin', {id: marker}), pinText: 'Pin',
      statusClass: 'normal', status: 'In range', closeActions: action('close-modal'),
      latestStatus: 'normal', latest: '5', latestUnit: detailed ? {kind: 'latest-unit', unit: 'mmol/L'} : null,
      latestDate: date, latestDelta: '', range: '4–6', rangeLabel: 'Reference',
      secondary: detailed ? {kind: 'secondary-range', label: 'Optimal', range: '4.5–5'} : {kind: 'latest-range'},
      rangeControls: detailed ? {kind: 'range-controls', suggestion: null, controls: [{
        kind: 'edit-control', optimalClass: '', label: 'Reference', currentRange: '4–6',
        actions: action('edit-ref-range', {id: marker}), lowerLabel: 'Lower threshold',
        badge: {kind: 'edited-badge', label: 'Edited', title: 'Restore original range', actions: action('revert-ref-range', {id: marker}), text: 'edited'},
      }]} : null,
      rangeBand: detailed ? {kind: 'band', lowZone: {kind: 'low-zone', width: '20%'},
        highZone: {kind: 'high-zone', left: '80%', width: '20%'},
        optimalZone: {kind: 'optimal-zone', left: '40%', width: '20%'},
        status: 'normal', position: '50%', minimum: '4', maximum: '6'} : null,
    },
    rows: detailed ? [imported, manual] : [imported],
    paging: detailed
      ? {kind: 'more', label: 'Show other samples', actions: action('show-detail-modal', {id: marker, showAllHistory: '1', historyLimit: 40})}
      : {kind: 'last-values', count: '12', actions: action('show-detail-modal', {id: marker, scrollToHistory: '1'})},
    trend: detailed ? {kind: 'trend', direction: 'increased', change: '2', unit: 'mmol/L', sign: '+', percentage: '40',
      firstDate: '2026-08-01', lastDate: date} : null,
    bio: detailed ? {
      kind: 'breakdown', date: {kind: 'panel-date', date},
      warning: {kind: 'warning', issues: 'One source is missing'},
      pheno: {kind: 'component', state: 'present', heading: {kind: 'present-heading', name: 'Component A', value: '44',
        delta: {kind: 'delta', sign: '-', years: '2'}}, inputs: [{kind: 'input', state: 'ok', title: 'Available', glyph: '✓', label: label}]},
      bortz: {kind: 'component', state: 'missing', heading: {kind: 'missing-heading', name: 'Component B', missing: '1', total: '3', noun: 'inputs'},
        inputs: [{kind: 'input', state: 'missing', title: 'Unknown', glyph: '⚠', label: 'No result'}]},
    } : {kind: 'missing', issues: 'A complete review needs more inputs'},
    actions: {kind: 'actions', primary, notes: detailed ? notes : {...notes, note: null, delete: null},
      recommendations: detailed ? {kind: 'recommendations', id: marker} : null},
    deleteMarker: detailed ? {kind: 'delete-marker', actions: action('delete-custom-marker', {id: marker})} : null,
  };
}

it.each([true, false])('keeps native marker review text and actions on the correct sample (full: %s)', async full => {
  const native = load('../js/components/MarkerDetailModal.svelte.native.js') as typeof import('../js/components/MarkerDetailModal.svelte.native.js');
  const view = markerView(full);
  await expectNativeReview(renderMarkerDetailModal(view), host => {
    const owned = native.mount(native.default, {target: host, props: {view}});
    native.flushSync();
    return () => native.unmount(owned);
  }, host => {
    expect(host.querySelector('h3')?.textContent?.trim()).toContain(label);
    expect(host.querySelector('h3 strong,.mv-note-text i')).toBeNull();
    expect(host.querySelector('[data-marker-detail-action="edit-marker-value"]')?.getAttribute('data-marker-detail-panel-id')).toBe('reviewed-sample');
    expect(host.querySelectorAll('.marker-history-row')).toHaveLength(full ? 2 : 1);
    expect(Array.from(host.querySelectorAll('[data-marker-detail-action="delete-marker-value"]'),
      button => button.getAttribute('data-marker-detail-panel-id')))
      .toEqual(full ? ['reviewed-sample', 'different-sample'] : ['reviewed-sample']);
    expect(host.querySelector('.mv-collection-context')?.textContent).toContain('08:00');
  });
});

it('keeps the public separate marker chrome, context and note renderers aligned with their owners', () => {
  const view = markerView(true);
  const reference = document.createElement('div');
  reference.innerHTML = renderMarkerDetailModal(view);
  const separate = document.createElement('div');
  separate.innerHTML = renderMarkerDetailChrome(view.header) + renderMarkerDetailBioAge(view.bio!) + renderMarkerDetailNotes(view.actions.notes);
  expect(separate.querySelector('[data-marker-detail-action="quick-pin"]')?.outerHTML)
    .toBe(reference.querySelector('[data-marker-detail-action="quick-pin"]')?.outerHTML);
  expect(separate.querySelector('.bio-age-breakdown')?.textContent).toBe(reference.querySelector('.bio-age-breakdown')?.textContent);
  expect(separate.querySelector('textarea')?.value).toBe(note);
  expect(separate.querySelector('[data-marker-detail-action="save-marker-note"]')?.getAttribute('data-marker-detail-id')).toBe(marker);
});
