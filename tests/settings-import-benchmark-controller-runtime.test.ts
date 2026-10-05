// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

type SnapshotFixture = {id: string; benchmarkLocked: boolean; benchmarkKind: string; referenceFixtureId?: string; comparable: boolean; input: string; model: string; fileName: string};
const benchmarkRuntime = vi.hoisted(() => ({
  deleteImportBenchmarks: vi.fn(),
  getSnapshots: vi.fn(),
  runReference: vi.fn(),
  showConfirmDialog: vi.fn(async () => true),
  showNotification: vi.fn(),
  snapshots: [] as SnapshotFixture[],
  updateSelection: vi.fn(),
}));

function benchmarkBody() {
  return `
    <button data-import-benchmarks-action="close">Close</button>
    <button data-import-benchmarks-action="run-reference">Run</button>
    <button data-import-benchmarks-action="select-latest">Latest</button>
    <button data-import-benchmarks-action="clear-selection">Clear</button>
    <button data-import-benchmarks-action="delete-selected">Delete selected</button>
    <button data-import-benchmark-review="candidate">Review</button>
    <button data-import-benchmark-differences-close>Close review</button>
    <button data-import-benchmark-delete="candidate">Delete candidate</button>
    <input type="checkbox" data-import-benchmark-select="candidate">
    <input type="checkbox" data-import-benchmark-select="incompatible">
    <div data-import-benchmark-difference-review hidden></div>
    <div data-import-reference-progress hidden></div>
    <div class="import-reference-progress-track" aria-valuenow="0">
      <div data-import-reference-progress-fill></div>
    </div>
    <div data-import-reference-progress-copy></div>
  `;
}

vi.mock('../js/import-benchmarks.js', () => ({
  deleteImportBenchmarks: benchmarkRuntime.deleteImportBenchmarks,
}));
vi.mock('../js/import-reference-benchmark.js', () => ({
  IMPORT_REFERENCE_FIXTURE: { id: 'fixture-1' },
  runBundledImportReferenceBenchmark: benchmarkRuntime.runReference,
}));
vi.mock('../js/modal-lifecycle.js', () => ({
  openAppendedModalOverlay(overlay: HTMLElement) {
    document.body.appendChild(overlay);
    overlay.classList.add('show');
  },
  removeModalOverlay(overlay: HTMLElement) {
    overlay.remove();
  },
}));
vi.mock('../js/settings-data.js', () => ({
  getImportBenchmarkSnapshots: benchmarkRuntime.getSnapshots,
  importBenchmarkModelIdentity: (snapshot: SnapshotFixture) => snapshot.model || '',
  importBenchmarkStorageId: (snapshot: SnapshotFixture) => snapshot.id,
  importBenchmarksUseSameInput: (baseline: SnapshotFixture | undefined, candidate: SnapshotFixture | undefined) => baseline?.input === candidate?.input,
  isImportBenchmarkComparable: (snapshot: SnapshotFixture) => snapshot.comparable !== false,
  latestCompatibleModelTests: (snapshots: SnapshotFixture[]) => snapshots.filter((snapshot: SnapshotFixture) => !snapshot.benchmarkLocked).slice(-2),
  referenceDifferenceLabel: (count: number) => count === 1 ? 'difference' : 'differences',
  renderImportBenchmarksBody: () => benchmarkBody(),
  renderReferenceDiscrepancyDetails: (snapshot: SnapshotFixture) => `<strong>${snapshot.fileName}</strong>`,
  updateImportBenchmarkSelection: benchmarkRuntime.updateSelection,
}));
vi.mock('../js/utils.js', () => ({
  isDebugMode: () => false,
  showConfirmDialog: benchmarkRuntime.showConfirmDialog,
  showNotification: benchmarkRuntime.showNotification,
}));

const {
  closeImportBenchmarksModal,
  openImportBenchmarksModal,
  renderImportBenchmarksEntrySection,
} = await import('../js/settings-import-benchmark-controller.js');

function click(selector: string) {
  const element = document.querySelector<HTMLElement>(selector)!;
  expect(element).not.toBeNull();
  element.click();
  return element;
}

describe('model import benchmark controller runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    benchmarkRuntime.snapshots = [
      {
        id: 'gold',
        benchmarkLocked: true,
        benchmarkKind: 'reference',
        referenceFixtureId: 'fixture-1',
        comparable: true,
        input: 'fixture-input',
        model: 'gold-model',
        fileName: 'Gold standard',
      },
      {
        id: 'latest',
        benchmarkLocked: false,
        benchmarkKind: 'reference',
        referenceFixtureId: 'fixture-1',
        comparable: true,
        input: 'fixture-input',
        model: 'model-a',
        fileName: 'Latest model',
      },
      {
        id: 'candidate',
        benchmarkLocked: false,
        benchmarkKind: 'upload',
        comparable: true,
        input: 'fixture-input',
        model: 'model-b',
        fileName: 'Candidate model',
      },
      {
        id: 'incompatible',
        benchmarkLocked: false,
        benchmarkKind: 'upload',
        comparable: true,
        input: 'another-report',
        model: 'model-c',
        fileName: 'Different report',
      },
    ];
    benchmarkRuntime.getSnapshots.mockImplementation(() => benchmarkRuntime.snapshots);
    benchmarkRuntime.deleteImportBenchmarks.mockImplementation(async (ids: string[]) => {
      benchmarkRuntime.snapshots = benchmarkRuntime.snapshots.filter((snapshot: SnapshotFixture) => !ids.includes(snapshot.id));
      return ids.length;
    });
    benchmarkRuntime.runReference.mockImplementation(async ({ onProgress }: {onProgress: NonNullable<Parameters<typeof import('../js/import-reference-benchmark.js').runBundledImportReferenceBenchmark>[0]>['onProgress']}) => {
      onProgress!(45, 'Model is reading report');
      onProgress!(95, 'Checking exact markers');
      const completed = {
        benchmarkId: 'completed',
        manifest: { id: 'fixture-1' },
        score: {
          referenceExactMarkerCount: 9,
          referenceExpectedMarkerCount: 10,
          referenceExactMatch: false,
          referenceF1Percent: 96,
          referenceDiscrepancyCount: 1,
        },
      };
      benchmarkRuntime.snapshots.push({
        id: completed.benchmarkId,
        benchmarkLocked: false,
        benchmarkKind: 'reference',
        referenceFixtureId: 'fixture-1',
        comparable: true,
        input: 'fixture-input',
        model: 'model-d',
        fileName: 'Completed model',
      });
      return completed;
    });
    globalThis.requestAnimationFrame = callback => {
      callback(0);
      return 1;
    };
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('runs, compares, selects, refreshes, and deletes model benchmarks through one modal lifecycle', async () => {
    expect(openImportBenchmarksModal()).toBe(true);
    const overlay = (document.getElementById('import-benchmarks-overlay') as HTMLElement);
    expect(overlay).not.toBeNull();
    expect(benchmarkRuntime.updateSelection).toHaveBeenCalled();

    click('[data-import-benchmark-review="candidate"]');
    const reviewPanel = document.querySelector<HTMLElement>('[data-import-benchmark-difference-review]')!;
    expect(reviewPanel.hidden).toBe(false);
    expect(reviewPanel.textContent).toContain('Candidate model');
    expect(document.querySelector<HTMLElement>('[data-import-benchmark-review="candidate"]')!.getAttribute('aria-expanded')).toBe('true');
    click('[data-import-benchmark-differences-close]');
    expect(reviewPanel.hidden).toBe(true);

    const incompatible = document.querySelector<HTMLInputElement>('[data-import-benchmark-select="incompatible"]')!;
    incompatible.checked = true;
    incompatible.click();
    incompatible.checked = true;
    incompatible.dispatchEvent(new Event('click', { bubbles: true }));
    expect(incompatible.checked).toBe(false);
    expect(benchmarkRuntime.showNotification).toHaveBeenCalledWith(
      'Choose model tests that used the same report.',
      'info',
    );

    const candidate = document.querySelector<HTMLInputElement>('[data-import-benchmark-select="candidate"]')!;
    candidate.checked = true;
    candidate.dispatchEvent(new Event('click', { bubbles: true }));
    expect(benchmarkRuntime.updateSelection).toHaveBeenCalled();

    click('[data-import-benchmarks-action="run-reference"]');
    await vi.waitFor(() => expect(benchmarkRuntime.runReference).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(benchmarkRuntime.showNotification).toHaveBeenCalledWith(
      'Model test scored 9/10 exact markers with 96% F1. 1 difference saved for review.',
      'info',
    ));

    click('[data-import-benchmarks-action="select-latest"]');
    click('[data-import-benchmarks-action="clear-selection"]');

    click('[data-import-benchmark-delete="candidate"]');
    await vi.waitFor(() => expect(benchmarkRuntime.deleteImportBenchmarks).toHaveBeenCalledWith(['candidate']));
    expect(benchmarkRuntime.showConfirmDialog).toHaveBeenCalledWith(
      'Delete this model test for "Candidate model"? Your imported health data will not be changed.',
    );
    expect(benchmarkRuntime.showNotification).toHaveBeenCalledWith(
      '1 model test deleted.',
      'success',
    );

    const entry = renderImportBenchmarksEntrySection();
    expect(entry).toContain('3 saved tests');
    expect(entry).toContain('across 3 model setups');

    expect(closeImportBenchmarksModal()).toBe(true);
    expect((document.getElementById('import-benchmarks-overlay') as HTMLElement)).toBeNull();
  });
});
