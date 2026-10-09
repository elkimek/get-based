// @vitest-environment jsdom
import fs from 'node:fs';
import {beforeEach, expect, it, vi} from 'vitest';
import type {PendingImport} from '../js/pdf-import-review-runtime.js';
import type {RecRenderCandidate} from '../types/dashboard-recommendation-widget.js';
import type {ImportUnitMenuOption} from '../js/import-review-presentation.js';
interface Options {debug?: boolean; hideUsage?: boolean; provider?: string; model?: string; batch?: {current: number; total: number}}
interface ReviewInput extends Options {result: PendingImport; duplicateIndices?: number[][]}
type Sample = {kind: string; name: string; html: string; input: Record<string, unknown>; refLookup?: Record<string, unknown>};
const fixture = JSON.parse(fs.readFileSync('tests/fixtures/review-recommendations-original.json', 'utf8')) as {revision: string; samples: Sample[]};
const owned = vi.hoisted(() => ({pending: null as PendingImport | null, refs: {} as Record<string, unknown>, options: {} as Options}));
vi.mock('../js/state.js', () => ({state: {currentProfile: 'default'}}));
vi.mock('../js/pdf-import-review-runtime.js', () => ({
  getPendingImportFromRuntime: () => owned.pending,
  setPendingImportRuntime: (result: PendingImport, refs: Record<string, unknown>) => {owned.pending = result; owned.refs = refs;},
  getPendingImportRefLookup: () => owned.refs,
  getBatchImportContext: () => owned.options.batch || null,
  hasBatchImportContext: () => !!owned.options.batch,
  parseImportDatasetIndex: (value: unknown) => {const index = Number(value); return value !== '' && Number.isInteger(index) && index >= 0 ? index : null;},
  markImportReviewDelegatesBound: () => false,
  clearPendingImportRuntime: () => {owned.pending = null;}, confirmImportFromRuntime: () => {}, showPIIDiffViewerFromRuntime: () => {},
  startBatchImport: () => {}, takeBatchImportResolve: () => null,
}));
vi.mock('../js/pdf-import-marker-mapping.js', async original => ({...await original<Record<string, unknown>>(), buildMarkerReference: () => owned.refs}));
vi.mock('../js/utils.js', async original => ({...await original<Record<string, unknown>>(), isDebugMode: () => !!owned.options.debug, showNotification: () => {}}));
vi.mock('../js/app-extension-runtime.js', () => ({shouldHideAppExtensionAIUsage: () => !!owned.options.hideUsage}));
vi.mock('../js/api.js', () => ({
  getAIProvider: () => owned.options.provider || 'openrouter',
  getOllamaMainModel: () => owned.options.model || 'Model', getVeniceModelDisplay: () => owned.options.model || 'Model',
  getOpenRouterModelDisplay: () => owned.options.model || 'Model', getActiveModelDisplay: () => owned.options.model || 'Model', getOllamaPIIModel: () => '<pii-model>',
}));
vi.mock('../js/import-review-draft.js', () => ({clearImportReviewDraft: () => {}, persistImportReviewDraft: () => {}, readImportReviewDraft: () => null}));
vi.mock('../js/import-benchmarks.js', () => ({finishImportBenchmark: () => {}}));
import {closeModalOverlay} from '../js/modal-lifecycle.js';
import {showImportPreview, mapUnmatchedMarkerInput, toggleImportRow, setImportReviewFilter, applyImportReviewFilters} from '../js/pdf-import-review.js';
import {renderUnitSelect} from '../js/pdf-import-review-formatting.js';
import {renderImportMapInput, renderImportExcludeButton, setImportExcludeButtonState} from '../js/import-review-row-actions.js';
import {renderHTML as menuHTML} from '../js/components/ImportUnitMenu.svelte.html.js';
import {projectImportUnitMenu} from '../js/import-review-presentation.js';
import {importReviewClasses} from '../js/import-review-classes.js';
import {renderHTML as recHTML} from '../js/components/RecommendationPresentation.svelte.html.js';
import {projectRecommendationCard, projectRecommendationEmpty, projectRecommendationList} from '../js/recommendation-presentation.js';

beforeEach(() => {
  closeModalOverlay('import-modal-overlay');
  document.body.innerHTML = '<div id="drop-zone"></div><div id="import-modal-overlay" class="modal-overlay"><div id="import-modal"></div></div>';
  document.body.style.overflow = ''; owned.pending = null; owned.refs = {}; owned.options = {};
});
function review(sample: Sample): string {
  const input = sample.input as unknown as ReviewInput;
  owned.options = input; owned.refs = sample.refLookup!;
  const result = structuredClone(input.result);
  for (const indices of input.duplicateIndices || []) for (const index of indices.slice(1)) result.markers[index] = result.markers[indices[0]!]!;
  showImportPreview(result);
  if (sample.kind === 'review-incremental') {
    if (sample.name === 'map' || sample.name === 'clear') {
      const button = document.querySelector('[data-marker-idx="2"][data-import-review-action="open-map-modal"]') as unknown as HTMLInputElement;
      button.value = 'iron.ferritin'; mapUnmatchedMarkerInput(button);
      if (sample.name === 'clear') {button.value = ''; mapUnmatchedMarkerInput(button);}
    } else if (['exclude', 'restore', 'filter-excluded'].includes(sample.name)) {
      const button = document.querySelector('[data-import-idx="0"] .import-exclude-btn') as HTMLElement;
      toggleImportRow(button);
      if (sample.name === 'restore') toggleImportRow(button);
      if (sample.name === 'filter-excluded') setImportReviewFilter(document.querySelector('[data-filter="excluded"]') as HTMLElement);
    } else {
      (document.getElementById('import-review-search') as HTMLInputElement).value = 'no-such-marker'; applyImportReviewFilters();
    }
  }
  return document.getElementById('import-modal')!.outerHTML;
}
function authored(sample: Sample): string {
  if (sample.kind.startsWith('review')) return review(sample);
  const input = sample.input;
  if (sample.kind === 'unit') return renderUnitSelect(input.marker as PendingImport['markers'][number], input.idx as number);
  if (sample.kind === 'map-control') return renderImportMapInput(input.marker as PendingImport['markers'][number], input.idx as number);
  if (sample.kind === 'exclude') {
    const root = document.createElement('div'); root.innerHTML = renderImportExcludeButton(input.markerName as string);
    if (input.excluded) setImportExcludeButtonState(root.querySelector('button')!, true);
    return root.innerHTML;
  }
  if (sample.kind === 'unit-menu') {
    const menu = document.createElement('div');
    for (const [name, value] of Object.entries(input.attributes as Record<string, string>)) menu.setAttribute(name, value);
    menu.className = importReviewClasses('import-unit-menu'); menu.dataset.importReviewView = '';
    menu.innerHTML = menuHTML({options: projectImportUnitMenu(input.options as ImportUnitMenuOption[])});
    return menu.outerHTML;
  }
  if (sample.kind === 'recommendation-card') return recHTML({view: {kind: 'card', card: projectRecommendationCard(input.candidate as RecRenderCandidate, input.compact)}});
  if (sample.kind === 'recommendation-empty') return recHTML({view: {kind: 'empty', empty: projectRecommendationEmpty(input.message)}});
  if (sample.kind === 'recommendation-list') return recHTML({view: {kind: 'list', cards: projectRecommendationList(input.candidates as RecRenderCandidate[], input.compact)}});
  if (sample.kind === 'recommendation-widget') {
    if (input.enabled === false) return recHTML({view: {kind: 'disabled'}});
    if (input.loading) return recHTML({view: {kind: 'loading'}});
    const candidates = (input.candidates as RecRenderCandidate[]).slice(0, 3);
    return candidates.length ? recHTML({view: {kind: 'widget', cards: projectRecommendationList(candidates, true)}}) : recHTML({view: {kind: 'empty', empty: projectRecommendationEmpty()}});
  }
  throw new Error('Unknown fixture owner ' + sample.kind);
}
function structure(html: string): unknown {
  const root = document.createElement('div'); root.innerHTML = html;
  function element(node: Element): unknown {
    const attrs = Object.fromEntries([...node.attributes].filter(attr => !['class', 'data-import-review-view', 'data-recommendation-cards-view'].includes(attr.name)).map(attr => [attr.name, attr.value]).sort(([a], [b]) => a!.localeCompare(b!)));
    return {tag: node.tagName, attrs, text: [...node.childNodes].filter(child => child.nodeType === Node.TEXT_NODE).map(child => child.textContent).join('').replace(/\s+/g, ' ').trim(), children: [...node.children].map(element)};
  }
  return [...root.children].map(element);
}
it.each(fixture.samples)('preserves original $kind/$name complete structure, control state and literal text', sample => {
  const frozen = JSON.stringify(sample), current = authored(sample);
  expect(structure(current)).toEqual(structure(sample.html));
  expect(JSON.stringify(sample)).toBe(frozen);
  const before = document.createElement('div'); before.innerHTML = sample.html;
  const after = document.createElement('div'); after.innerHTML = current;
  const originals = [...before.querySelectorAll('*')], actuals = [...after.querySelectorAll('*')];
  expect(actuals.length).toBe(originals.length);
  originals.forEach((node, index) => {
    for (const className of node.classList) expect(actuals[index]!.classList.contains(className), `${sample.name}/${index}/${className}`).toBe(true);
    if (node instanceof HTMLInputElement || node instanceof HTMLSelectElement || node instanceof HTMLButtonElement) {
      const actual = actuals[index] as HTMLInputElement;
      expect({value: actual.value, disabled: actual.disabled}).toEqual({value: node.value, disabled: node.disabled});
      if (node instanceof HTMLInputElement) expect(actual.checked).toBe(node.checked);
    }
  });
});
it('keeps original duplicate identity indices, strict warning thresholds, capped recommendations and shared styles explicit', () => {
  expect(fixture.revision).toBe('0eb601355732fa87331c0a94bf27a991adc21f8e');
  const original = (name: string) => fixture.samples.find(sample => sample.kind === 'review' && sample.name === name)!.html;
  expect(original('duplicate-identity').match(/data-import-idx="0"/g)).toHaveLength(2);
  expect(original('warning-over')).toContain('A large portion');
  expect(original('warning-exact-count')).not.toContain('A large portion');
  expect(original('warning-exact-ratio')).not.toContain('A large portion');
  const populated = fixture.samples.find(sample => sample.kind === 'recommendation-widget' && (sample.input.candidates as unknown[]).length > 3)!;
  expect(populated.html.match(/<article/g)).toHaveLength(3);
});
it('owns migrated markup in literal components and retires the original private renderers', () => {
  for (const component of ['ImportReviewPresentation', 'ImportReviewRow', 'ImportUnitControl', 'ImportMapControl', 'ImportReviewRowAction', 'ImportExcludeContent', 'ImportReviewStatus', 'ImportUnitMenu', 'RecommendationPresentation', 'RecommendationCard']) expect(fs.readFileSync(`js/components/${component}.svelte`, 'utf8')).not.toContain('{@html');
  expect(fs.readFileSync('js/pdf-import-review.ts', 'utf8')).not.toContain('const pad = status');
  expect(fs.readFileSync('js/dashboard-recommendation-widget.ts', 'utf8')).not.toContain('const savedClass =');
});
