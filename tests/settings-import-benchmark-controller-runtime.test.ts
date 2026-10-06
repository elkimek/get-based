// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsBenchmarkReader } from '../types/settings-data.js';
const runtime = vi.hoisted(() => ({
  remove: vi.fn(), read: vi.fn(), run: vi.fn(), confirm: vi.fn(), notify: vi.fn(),
  snapshots: [] as SettingsBenchmarkReader[],
}));
vi.mock('../js/import-benchmarks.js', () => ({
  deleteImportBenchmarks: runtime.remove,
  getImportBenchmarkProviderLabel: (snap: SettingsBenchmarkReader) => String(snap.provider || 'Local AI'),
}));
vi.mock('../js/import-reference-benchmark.js', () => ({
  IMPORT_REFERENCE_FIXTURE: { id:'fixture-1',version:1,sourcePath:'/sample.pdf' },
  runBundledImportReferenceBenchmark: runtime.run,
  isBundledImportReferenceBenchmarkRunning: () => false,
}));
vi.mock('../js/api.js', () => ({ getAIProvider:() => 'ollama',getActiveModelId:() => 'active-model' }));
vi.mock('../js/settings-data.js', () => ({ getImportBenchmarkSnapshots:runtime.read }));
vi.mock('../js/settings-styles.js', () => ({ loadSettingsStylesheet:async () => document.createElement('link') }));
vi.mock('../js/modal-lifecycle.js', () => ({
  openAppendedModalOverlay(overlay: HTMLElement) { document.body.appendChild(overlay); overlay.classList.add('show'); },
  removeModalOverlay(overlay: HTMLElement) { overlay.remove(); },
}));
vi.mock('../js/utils.js', () => ({ showConfirmDialog:runtime.confirm,showNotification:runtime.notify }));
const { closeImportBenchmarksModal,openImportBenchmarksModal,renderImportBenchmarksEntrySection,disposeImportBenchmarksEntry } = await import('../js/settings-import-benchmark-controller.js');
const { buildBenchmarkDifference,buildBenchmarkComparison,buildBenchmarkSnapshot } = await import('../js/import-benchmark-presentation.js');
const { renderImportBenchmarksBody,updateImportBenchmarkSelection,renderReferenceDiscrepancyDetails } = await import('../js/import-benchmark-facade.js');
const { createImportBenchmarksController } = await import('../js/import-benchmark-controller.js');
const { createBenchmarkRun } = await import('../js/import-benchmark-run.js');
const { mountImportBenchmarks } = await import('../js/import-benchmark-component.js');
function fixture(id: string, extra: SettingsBenchmarkReader = {}): SettingsBenchmarkReader {
  return { id,benchmarkKind:'reference',referenceFixtureId:'fixture-1',referenceFixtureVersion:1,status:'reference-scored',
    modelId:`model-${id}`,fileName:`${id}.pdf`,provider:'ollama',benchmarkAt:1000,
    referenceDiscrepanciesVersion:1,referenceDiscrepancies:[],...extra };
}
function differences() { return [{ scope:'lab-data',markerName:'Glucose',section:'Blood',issues:[{ label:'Value',expected:'90',actual:'95' }] }]; }
function completion() {
  runtime.snapshots.push(fixture('completed'));
  return { benchmarkId:'completed',manifest:{ id:'fixture-1' },score:{ referenceExactMarkerCount:9,referenceExpectedMarkerCount:10,referenceExactMatch:false,referenceF1Percent:96,referenceDiscrepancyCount:1 } };
}
function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing ${selector}`);
  return found;
}
function click(selector: string) { element(selector).click(); }
function selected() { return Array.from(document.querySelectorAll<HTMLInputElement>('[data-import-benchmark-select]:checked'),input => input.dataset.importBenchmarkSelect); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(accept => { resolve = accept; }); return { promise,resolve }; }

describe('owned model-test dialog runtime', () => {
  beforeEach(() => {
    closeImportBenchmarksModal(); disposeImportBenchmarksEntry(); vi.clearAllMocks(); document.body.replaceChildren();
    runtime.snapshots = [fixture('gold',{ benchmarkLocked:true,benchmarkKind:'reference-gold' }),fixture('latest'),fixture('candidate',{ referenceDiscrepancies:differences() }),fixture('incompatible',{ referenceFixtureId:'other-report' })];
    runtime.read.mockImplementation(() => runtime.snapshots);
    runtime.confirm.mockResolvedValue(true);
    runtime.remove.mockImplementation(async (ids: string[]) => { runtime.snapshots = runtime.snapshots.filter(snap => !ids.includes(String(snap.id))); return ids.length; });
    runtime.run.mockImplementation(async ({ onProgress }: { onProgress:(pct:number,label:string)=>void }) => { onProgress(45,'Model is reading report'); onProgress(95,'Checking exact markers'); return completion(); });
    globalThis.requestAnimationFrame = callback => { callback(0); return 1; };
    globalThis.matchMedia = vi.fn().mockReturnValue({ matches:false });
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => { closeImportBenchmarksModal(); disposeImportBenchmarksEntry(); vi.useRealTimers(); });

  it('runs, compares, reviews, selects, refreshes and deletes through the real Svelte view', async () => {
    expect(openImportBenchmarksModal()).toBe(true); expect(selected()).toEqual(['gold','latest']);
    const incompatible = element<HTMLInputElement>('[data-import-benchmark-select="incompatible"]');
    expect(incompatible.disabled).toBe(true); incompatible.click(); expect(incompatible.checked).toBe(false);
    click('[data-import-benchmark-select="candidate"]'); expect(selected()).toEqual(['gold','latest','candidate']);
    click('[data-import-benchmark-review="candidate"]');
    const review = element('[data-import-benchmark-difference-review]');
    expect(review.hidden).toBe(false); expect(review.textContent).toContain('Glucose');
    expect(element('[data-import-benchmark-review="candidate"]').getAttribute('aria-expanded')).toBe('true');
    click('[data-import-benchmark-differences-close]'); expect(review.hidden).toBe(true);
    click('[data-import-benchmarks-action="run-reference"]');
    await vi.waitFor(() => expect(runtime.notify).toHaveBeenCalledWith('Model test scored 9/10 exact markers with 96% F1. 1 difference saved for review.','info'));
    expect(runtime.run).toHaveBeenCalledOnce(); expect(selected()).toEqual(['gold','completed']);
    click('[data-import-benchmarks-action="select-latest"]'); expect(selected()).toEqual(['latest','candidate']);
    click('[data-import-benchmarks-action="clear-selection"]'); expect(selected()).toEqual([]);
    expect(element('[data-import-benchmark-comparison]').hidden).toBe(true);
    click('[data-import-benchmark-delete="candidate"]');
    await vi.waitFor(() => expect(runtime.remove).toHaveBeenCalledWith(['candidate']));
    expect(runtime.confirm).toHaveBeenCalledWith('Delete this model test for "candidate.pdf"? Your imported health data will not be changed.');
    expect(runtime.notify).toHaveBeenCalledWith('1 model test deleted.','success');
    document.body.insertAdjacentHTML('beforeend',renderImportBenchmarksEntrySection()); await Promise.resolve();
    expect(element('[data-import-benchmarks-entry]').textContent).toContain('3 saved tests across 3 model setups');
    expect(closeImportBenchmarksModal()).toBe(true); expect(document.getElementById('import-benchmarks-overlay')).toBeNull();
  });

  it('continues an accepted run after close and preserves a reopened owner’s selection', async () => {
    const done = deferred<ReturnType<typeof completion>>();
    runtime.run.mockImplementation(({ onProgress }: { onProgress:(pct:number,label:string)=>void }) => { onProgress(45,'Model is reading report'); return done.promise; });
    openImportBenchmarksModal(); click('[data-import-benchmarks-action="run-reference"]');
    expect(element<HTMLInputElement>('[data-import-benchmarks-action="run-reference"]').disabled).toBe(true);
    expect(element('.import-reference-progress-track').hasAttribute('aria-valuenow')).toBe(false);
    const old = element('[data-import-reference-progress-copy]'); closeImportBenchmarksModal(); openImportBenchmarksModal();
    expect(element('[data-import-benchmarks-action="run-reference"]').textContent).toBe('Model test running…');
    click('[data-import-benchmarks-action="select-latest"]'); const chosen = selected();
    done.resolve(completion());
    await vi.waitFor(() => expect(element<HTMLInputElement>('[data-import-benchmarks-action="run-reference"]').disabled).toBe(false));
    expect(selected()).toEqual(chosen); expect(old.isConnected).toBe(false);
    expect(element('[data-import-reference-progress]').hidden).toBe(true); expect(runtime.run).toHaveBeenCalledOnce();
  });

  it('rejects a confirmation that resolves after its originating dialog closes', async () => {
    const answer = deferred<boolean>(); runtime.confirm.mockReturnValue(answer.promise);
    openImportBenchmarksModal(); click('[data-import-benchmark-delete="candidate"]');
    closeImportBenchmarksModal(); openImportBenchmarksModal(); answer.resolve(true);
    await Promise.resolve(); await Promise.resolve();
    expect(runtime.remove).not.toHaveBeenCalled(); expect(element('[data-import-benchmark-card="candidate"]')).toBeTruthy();
  });

  it('allows an accepted deletion to finish after close without changing the new view', async () => {
    const removed = deferred<number>(); runtime.remove.mockReturnValue(removed.promise);
    openImportBenchmarksModal(); click('[data-import-benchmark-delete="candidate"]');
    await vi.waitFor(() => expect(runtime.remove).toHaveBeenCalledOnce());
    closeImportBenchmarksModal(); openImportBenchmarksModal(); const chosen = selected(); removed.resolve(1);
    await Promise.resolve(); await Promise.resolve();
    expect(selected()).toEqual(chosen); expect(runtime.notify).not.toHaveBeenCalledWith('1 model test deleted.','success');
  });

  it('keeps deletion retryable after persistence failure and never removes the locked answer key', async () => {
    runtime.remove.mockResolvedValue(0); openImportBenchmarksModal();
    click('[data-import-benchmark-delete="candidate"]');
    await vi.waitFor(() => expect(runtime.notify).toHaveBeenCalledWith('Model tests could not be deleted. Try again.','error'));
    expect(element<HTMLButtonElement>('[data-import-benchmark-delete="candidate"]').disabled).toBe(false);
    expect(document.querySelector('[data-import-benchmark-delete="gold"]')).toBeNull();
    click('[data-import-benchmarks-action="delete-selected"]');
    await vi.waitFor(() => expect(runtime.remove).toHaveBeenLastCalledWith(['latest']));
  });

  it('preserves open disclosure, node identity and focus across selection updates', () => {
    openImportBenchmarksModal();
    const disclosure = element<HTMLDetailsElement>('[data-import-benchmark-card="candidate"] details'); disclosure.open = true;
    const input = element<HTMLInputElement>('[data-import-benchmark-select="candidate"]'); input.focus(); input.click();
    expect(element('[data-import-benchmark-card="candidate"] details')).toBe(disclosure);
    expect(disclosure.open).toBe(true); expect(document.activeElement).toBe(input);
    element<HTMLButtonElement>('[data-import-benchmarks-action="clear-selection"]').focus();
    document.getElementById('import-benchmarks-overlay')!.dispatchEvent(new CustomEvent('import-benchmarks-refresh'));
    expect(disclosure.open).toBe(true); expect(document.activeElement).toBe(element('[data-import-benchmarks-action="clear-selection"]'));
  });

  it('uses the actual entry button and drops callbacks belonging to a disposed Settings owner', async () => {
    const opened = vi.fn(); document.body.innerHTML = renderImportBenchmarksEntrySection(opened); await Promise.resolve();
    const button = element<HTMLButtonElement>('[data-settings-action="open-import-benchmarks"]'); button.click();
    expect(opened).toHaveBeenCalledWith(button); disposeImportBenchmarksEntry(); button.click(); expect(opened).toHaveBeenCalledOnce();
  });

  it('bounds difference rendering and escapes model, file and raw expected values', async () => {
    const unsafe = '<img src=x onerror="throw 1">';
    const snap = fixture('unsafe',{ modelId:unsafe,fileName:unsafe,referenceDiscrepanciesTruncated:true,referenceDiscrepancies:Array.from({ length:101 },() => ({ scope:'lab-data',markerName:unsafe,issues:Array.from({ length:9 },() => ({ expected:unsafe,actual:unsafe,label:'Value' })) })) });
    const projected = buildBenchmarkDifference(snap);
    expect(projected.groups).toHaveLength(100); expect(projected.groups[0]!.issues).toHaveLength(8); expect(projected.count).toBe(900);
    document.body.innerHTML = renderReferenceDiscrepancyDetails(snap,{ showClose:true }); await Promise.resolve();
    expect(document.querySelector('img')).toBeNull(); expect(document.body.textContent).toContain(unsafe);
    expect(document.querySelectorAll('.import-benchmark-difference-issue')).toHaveLength(800);
    expect(document.body.textContent).toContain('more differences'); click('[data-import-benchmark-differences-close]'); expect(document.querySelector('.import-benchmark-difference-details')).toBeNull();
  });

  it('retains public body helpers and selection before and after queued mounting', async () => {
    document.body.innerHTML = renderImportBenchmarksBody(runtime.snapshots);
    const chosen = new Set(['gold','candidate']); updateImportBenchmarkSelection(document.body,runtime.snapshots,chosen); await Promise.resolve();
    expect(selected()).toEqual(['gold','candidate']); expect(document.querySelectorAll('thead th')).toHaveLength(3);
    updateImportBenchmarkSelection(document.body,runtime.snapshots,new Set(['gold','latest']));
    expect(selected()).toEqual(['gold','latest']); click('[data-import-benchmarks-action="clear-selection"]'); expect(selected()).toEqual([]);
  });

  it('preserves percent and percentage-point comparison math and optional missing values', () => {
    const first = fixture('first',{ benchmarkKind:'upload',totalMs:12000,markerCount:34,importedMarkerCount:30,cleanImportedMarkerCount:26,timings:{ analysisMs:8000 },usage:{ outputTokens:400 } });
    const second = fixture('second',{ benchmarkKind:'upload',totalMs:9000,markerCount:34,importedMarkerCount:32,cleanImportedMarkerCount:31,timings:{ analysisMs:6000 },usage:{ outputTokens:500 } });
    const table = buildBenchmarkComparison([first,second])!;
    expect(table.rows.find(row => row.key === 'totalMs')!.cells[1]).toMatchObject({ difference:'-25.0%',tone:'better' });
    expect(table.rows.find(row => row.key === 'acceptedRate')!.cells[1]).toMatchObject({ difference:'+5.9 pp',tone:'better' });
    expect(table.rows.some(row => row.key === 'modelLoadMs')).toBe(false);
    const unknown = buildBenchmarkComparison([first,fixture('unknown')])!;
    expect(unknown.rows.find(row => row.key === 'acceptedRate')!.cells[1]!.text).toBe('—');
  });

  it('guards retained controller callbacks, rejects incompatible input and protects gold IDs', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const noop = () => {};
    const view = mountImportBenchmarks(host,buildBenchmarkSnapshot(runtime.snapshots,{ model:'active',provider:'Local',sampleUrl:'/sample.pdf',running:false },{ selected:new Set() }),{ close:noop,run:noop,select:noop,latest:noop,clear:noop,remove:noop,review:noop,closeReview:noop });
    const controller = createImportBenchmarksController(view,{ read:runtime.read,context:() => ({ model:'active',provider:'Local',sampleUrl:'/sample.pdf',running:false }),fixtureId:'fixture-1',run:createBenchmarkRun({ run:runtime.run,notify:runtime.notify,errorMessage:() => 'failed',now:() => 0 }),confirm:runtime.confirm,remove:runtime.remove,notify:runtime.notify,now:() => 0,close:noop });
    controller.select('incompatible',true); expect(runtime.notify).toHaveBeenCalledWith('Choose model tests that used the same report.','info');
    await controller.remove('gold'); expect(runtime.confirm).not.toHaveBeenCalled();
    controller.dispose(); controller.run(); controller.select('candidate',true); await controller.remove('candidate'); expect(runtime.run).not.toHaveBeenCalled(); expect(runtime.confirm).not.toHaveBeenCalled(); view.dispose();
  });
});
