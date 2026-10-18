// Original native private protocol regression oracle; genuine current Marker behavior is verified separately.
// @vitest-environment jsdom
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {isDeepStrictEqual} from 'node:util';
import {escapeHTML, escapeAttr} from '../js/utils.js';
import projections from './fixtures/marker-detail-complete-projections.json' with {type: 'json'};
import {restoreCompleteController} from './marker-detail-complete-receipts.js';
import {renderMarkerDetailChrome, renderMarkerDetailBioAge, renderMarkerDetailNotes} from './fixtures/archived-native-ui/marker-detail-complete-presentation.js';

function run(row: typeof projections[number], original: boolean, sample: number, failAt = -1) {
  const calls: unknown[] = [];
  const record = (value: unknown) => {
    calls.push(value);
    if (calls.length === failAt) throw new Error('controlled projection failure ' + failAt);
  };
  function observe<T extends object>(target: T, path: string): T {
    return new Proxy(target, {get(value, key, receiver) {
      record(['get', path, String(key)]);
      const child: unknown = Reflect.get(value, key, receiver);
      return child && typeof child === 'object' ? observe(child, path + '.' + String(key)) : child;
    }});
  }
  const hostile = '<script>literal & "quoted"</script>';
  const text = sample === 2 ? hostile : 'Controlled';
  const present = sample !== 1;
  const context = vm.createContext({
    renderMarkerDetailChrome, renderMarkerDetailBioAge, renderMarkerDetailNotes,
    escapeHTML: (value: unknown) => {record(['escapeHTML', value]); return escapeHTML(value);},
    escapeAttr: (value: unknown) => {record(['escapeAttr', value]); return escapeAttr(value);},
    markerDetailActionAttrs: (action: string, fields?: object) => {
      record(['action', action, fields ? Object.entries(fields) : []]);
      return 'data-marker-detail-action="' + action + '"';
    },
    renderMarkerPlacementSummary: (id: unknown, marker: unknown, categories: unknown) => {
      record(['placement', id, typeof marker, typeof categories]); return '<div class="gb-detail-category-row">owned placement</div>';
    },
    altRange: (min: unknown, max: unknown) => {record(['alternate', min, max]); return '4 – 8';},
    formatValue: (value: unknown) => {record(['format', value]); return '' + value;},
    renderInputGrid: (status: unknown) => {record(['inputs', typeof status]); return '<span class="bio-age-input">owned input</span>';},
    componentRow: (name: unknown, value: unknown, status: unknown) => {
      record(['component', name, value, typeof status]); return '<div class="bio-age-component">owned component</div>';
    },
    id: 'controlled', marker: observe({name: text, unit: 'mmol/L'}, 'marker'), data: observe({categories: {}}, 'data'),
    altUnit: 'mg/dL', altRanges: ' &middot; Reference: 4 – 8', optimalRange: observe({min: 4, max: 8}, 'optimal'),
    renameLink: '', altUnitInfo: '', quickMarkerPinned: present, quickMarkerPinTitle: text, quickMarkerPinText: 'Pin',
    latestStatus: 'normal', statusText: 'In range', latestDisplay: text, latestUnit: 'mmol/L', latestDateLabel: '2001-02-01',
    deltaFromPrev: sample === 1 ? null : -2, rangeMainDisplay: '4 – 8', rangeMainLabel: 'Reference',
    rangeSecondaryDisplay: sample === 1 ? '' : '5 – 7', rangeSecondaryLabel: 'Optimal', hasLatestPhaseRange: true,
    latestContextRange: null, rangeCardControls: '', rangeSuggestionLink: '', rangeBandHtml: '',
    s: observe({kind: sample === 1 ? 'profile' : 'marker', present, label: text}, 'input'), title: text,
    value: sample === 1 ? null : 40, usableAge: 30, name: text, delta: '', missing: present ? [] : [1],
    status: observe([{present, label: text}], 'status'), noun: 'input', klass: 'bio-age-component-ok', header: 'owned heading',
    refDateLabel: text, breakdownIssues: [text, 'second'], issues: ['missing age'], dateNote: '', issueNote: '',
    pheno: 40, phenoStatus: [], bortz: null, bortzStatus: [], markerNote: sample === 1 ? '' : text, dotKey: 'controlled.marker',
  });
  let html: string | null = null, error: string | null = null;
  try {
    html = new vm.Script('(' + (original ? row.original : row.currentCall) + ')').runInContext(context) as string;
    if (original && row.kind === 'header') html = html.slice(0, -'\n    <div class="modal-values-grid marker-history-list">'.length);
    if (original && row.kind === 'primary-actions') html = html.slice('<div class="gb-detail-actions">'.length);
  } catch (caught) {error = (caught as Error).message;}
  return {calls, html, error};
}

describe('Marker Detail original projection and controller boundaries', () => {
  it('preserves every original controller/calculation/async/lifecycle byte outside finite presentation edits', () => {
    const candidate = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), './fixtures/archived-native-ui/marker-detail-modal-impl.ts.txt'), 'utf8');
    const original = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), './fixtures/marker-detail-complete-original-controller.ts.txt'), 'utf8');
    expect(restoreCompleteController(candidate) === original).toBe(true);
    expect(candidate.split('\n').length - 1).toBeLessThan(800);
    expect(() => restoreCompleteController(candidate.replace('}, 50);', '}, 51);'))).not.toThrow();
    expect(restoreCompleteController(candidate.replace('}, 50);', '}, 51);')) === original).toBe(false);
  });
  for (const row of projections) it('preserves native expression/getter/coercion/throw chronology: ' + row.kind, () => {
    for (let sample = 0; sample < 3; sample++) {
      const baseline = run(row, true, sample);
      expect(baseline.error, 'valid complete original projection fixture').toBe(null);
      for (let fault = -1; fault <= baseline.calls.length; fault++) {
        expect(isDeepStrictEqual(run(row, false, sample, fault), run(row, true, sample, fault)),
          'complete original reads/helpers/errors/raw fragment at fault ' + fault).toBe(true);
      }
    }
  });
  it('retains complete history/actions wrapper order and prepared child identity', () => {
    const rows = '<div class="modal-value-card">owned history</div>';
    expect(renderMarkerDetailChrome({kind: 'history', rows})).toBe('\n    <div class="modal-values-grid marker-history-list">' + rows + '</div>');
    const primary = '<div class="gb-detail-action-row">owned actions</div>', notes = '<div class="marker-note-section">owned note</div>', recommendations = '<div id="rec-modal-controlled"></div>';
    expect(renderMarkerDetailChrome({kind: 'actions', primary, notes, recommendations})).toBe('<div class="gb-detail-actions">' + primary + notes + recommendations + '</div>');
  });
});
