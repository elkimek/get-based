// @ts-check
// Independent photo workspace and navigation for the meal model benchmark.

import { mealAnalysisFiles } from './nutrition-analysis.js';
import { exitComparisonPresentation, mountNutritionComparison, rememberNutritionComparisonWorkspace, resetNutritionComparisonSource, updateComparisonControls } from './nutrition-comparison-ui.js';
import { hasSuspendedNutritionEditor, restoreSuspendedNutritionEditor, suspendNutritionEditor } from './nutrition-editor-navigation.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { ensureNutritionStylesheet, renderNutritionBenchmarkModal } from './nutrition-render.js';
import { escapeAttr, showNotification } from './utils.js';

/** @type {any} */
let benchmarkDeps = {
  selectedPhotos: () => [],
  getExistingImages: () => [],
  getConsumption: () => ({ amount: 1, unit: 'servings' }),
  getUserContext: () => '',
  getAnalysisKind: () => 'meal-photo',
  isAnalysisRunning: () => false,
  openEditor: () => false,
  updateCorrectionState: () => {},
};
/** @type {{files: File[], existingImages: any[], consumption: {amount: number, unit: string}, userContext: string, analysisKind: 'meal-photo'|'nutrition-label', fromEditor: boolean}|null} */
let benchmarkSource = null;
let benchmarkPreviewUrls = [];

export function configureNutritionBenchmarkWorkspace(deps = {}) {
  benchmarkDeps = { ...benchmarkDeps, ...deps };
}

export function clearNutritionBenchmarkPreviewUrls() {
  for (const url of benchmarkPreviewUrls) URL.revokeObjectURL(url);
  benchmarkPreviewUrls = [];
}

export function resetNutritionBenchmarkWorkspace() {
  clearNutritionBenchmarkPreviewUrls();
  benchmarkSource = null;
}

export function hasNutritionBenchmarkSource() {
  return !!benchmarkSource;
}

function captureBenchmarkSource() {
  const files = benchmarkDeps.selectedPhotos();
  const existingImages = [...benchmarkDeps.getExistingImages()];
  return {
    files,
    existingImages,
    consumption: benchmarkDeps.getConsumption(),
    userContext: benchmarkDeps.getUserContext(),
    analysisKind: benchmarkDeps.getAnalysisKind(),
    fromEditor: files.length > 0 || existingImages.length > 0,
  };
}

function renderBenchmarkPhotoPreview() {
  const preview = document.getElementById('nutrition-benchmark-photo-preview');
  const status = document.getElementById('nutrition-benchmark-photo-status');
  const clearButton = /** @type {HTMLButtonElement | null} */ (document.querySelector('[data-nutrition-action="clear-benchmark-photos"]'));
  if (!preview || !benchmarkSource) return;
  clearNutritionBenchmarkPreviewUrls();
  benchmarkPreviewUrls = benchmarkSource.files.map(file => URL.createObjectURL(file));
  const storedUrls = benchmarkSource.existingImages
    .map(image => String(image?.thumbnailUrl || image?.dataUrl || ''))
    .filter(Boolean);
  const urls = [...benchmarkPreviewUrls, ...storedUrls].slice(0, 4);
  if (urls.length) {
    preview.innerHTML = `<span class="nutrition-benchmark-photo-grid">${urls.map((url, index) => `<img src="${escapeAttr(url)}" alt="Benchmark meal view ${index + 1}">`).join('')}</span><span class="nutrition-benchmark-photo-change">${urls.length} view${urls.length === 1 ? '' : 's'} · replace</span>`;
  } else {
    preview.innerHTML = '<span aria-hidden="true">＋</span><strong>Add benchmark photos</strong><small>Up to 4 views</small>';
  }
  if (status) status.textContent = urls.length
    ? benchmarkSource.fromEditor
      ? `Using ${urls.length} view${urls.length === 1 ? '' : 's'} copied from Log meal. Replacing them here will not change the meal draft.`
      : `${urls.length} benchmark view${urls.length === 1 ? '' : 's'} ready. Log meal remains unchanged.`
    : 'Choose photos here; no Log meal attachment is required.';
  if (clearButton) clearButton.hidden = !urls.length;
  updateComparisonControls();
}

export function handleNutritionBenchmarkPhotoSelection(input) {
  const files = Array.from(input.files || []);
  if (files.length > 4) {
    input.value = '';
    showNotification('Choose no more than four photos for one benchmark.', 'info');
    return;
  }
  if (!benchmarkSource) benchmarkSource = captureBenchmarkSource();
  benchmarkSource.files = files;
  benchmarkSource.existingImages = [];
  benchmarkSource.fromEditor = false;
  resetNutritionComparisonSource();
  renderBenchmarkPhotoPreview();
}

export function clearNutritionBenchmarkPhotos() {
  if (!benchmarkSource) return;
  benchmarkSource.files = [];
  benchmarkSource.existingImages = [];
  benchmarkSource.fromEditor = false;
  resetNutritionComparisonSource();
  renderBenchmarkPhotoPreview();
}

export async function openNutritionBenchmark() {
  await ensureNutritionStylesheet();
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return false;
  if (benchmarkDeps.isAnalysisRunning()) {
    showNotification('Wait for the active meal request to finish before switching modes.', 'info');
    return false;
  }
  if (!benchmarkSource) benchmarkSource = captureBenchmarkSource();
  if (!hasSuspendedNutritionEditor() && !suspendNutritionEditor()) return false;
  modal.innerHTML = renderNutritionBenchmarkModal();
  modal.scrollTop = 0;
  modal.className = 'modal nutrition-modal nutrition-benchmark-modal';
  overlay.setAttribute('data-modal-dismiss-protected', '');
  if (!mountNutritionComparison()) {
    restoreNutritionMealEntry();
    return false;
  }
  renderBenchmarkPhotoPreview();
  openModalOverlay(overlay, { initialFocus: '[data-nutrition-action="return-editor"]', focusDelay: 30 });
  return true;
}

export function restoreNutritionMealEntry() {
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  rememberNutritionComparisonWorkspace();
  exitComparisonPresentation();
  clearNutritionBenchmarkPreviewUrls();
  if (!modal || !overlay || !restoreSuspendedNutritionEditor()) return benchmarkDeps.openEditor();
  openModalOverlay(overlay, { initialFocus: '[data-nutrition-action="toggle-comparison"]', focusDelay: 30 });
  benchmarkDeps.updateCorrectionState();
  return true;
}

export function nutritionBenchmarkAnalysisFiles() {
  return benchmarkSource ? mealAnalysisFiles(benchmarkSource.files, benchmarkSource.existingImages) : [];
}

export function nutritionBenchmarkHasPhotos() {
  return benchmarkSource
    ? benchmarkSource.files.length > 0 || benchmarkSource.existingImages.length > 0
    : benchmarkDeps.selectedPhotos().length > 0 || benchmarkDeps.getExistingImages().length > 0;
}

export function nutritionBenchmarkContext() {
  return {
    consumption: benchmarkSource?.consumption || benchmarkDeps.getConsumption(),
    userContext: benchmarkSource?.userContext || benchmarkDeps.getUserContext(),
    analysisKind: benchmarkSource?.analysisKind || benchmarkDeps.getAnalysisKind(),
  };
}
