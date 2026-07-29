// @ts-check
// pdf-import-file-handlers.js — single-file PDF and image import workflows

import { getErrorName } from './caught-error.js';
import { state } from './state.js';
import { calculateCost, trackUsage } from './schema.js';
import { showNotification, showConfirmDialog, isDebugMode, isPIIReviewEnabled, hashString } from './utils.js';
import { hasAIProvider, getAIProvider, getActiveModelId } from './api.js';
import { obfuscatePDFText, sanitizeWithOllama, sanitizeWithOllamaStreaming, checkOllamaPII, reviewPIIBeforeSend } from './pii.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import {
  assessTextQuality,
  extractPDFImages,
  extractPDFText,
} from './pdf-import-file-utils.js';
import { runPreflightChecks } from './pdf-import-preflight.js';
import {
  hideImportProgress,
  showImportProgress,
  updateImportProgressPct,
} from './pdf-import-progress.js';
import { isCsvTextFile, isTextImportFile, isXlsxFile } from './pdf-import-spreadsheet.js';
import { getUsageTokens, formatImportError } from './pdf-import-ai-utils.js';
import { showImportPreview } from './pdf-import-review.js';
import {
  benchmarkResultPatch,
  captureImportBenchmarkReviewBaseline,
  finishImportBenchmark,
  startImportBenchmark,
  updateImportBenchmark,
} from './import-benchmarks.js';
import { logPrivacyDiagnostic } from './privacy-safe-diagnostics.js';

const fileHandlerDeps = {
  parseLabPDFWithAI: /** @type {((text: string, fileName: string, onProgress?: (pct: number) => void) => Promise<any>) | null} */ (null),
  parseLabPDFWithAIImages: /** @type {((images: any[], fileName: string, onProgress?: (pct: number) => void) => Promise<any>) | null} */ (null),
  showAINeededDialog: /** @type {((action?: string) => void) | null} */ (null),
};

/**
 * @param {{
 *   parseLabPDFWithAI?: (text: string, fileName: string, onProgress?: (pct: number) => void) => Promise<any>,
 *   parseLabPDFWithAIImages?: (images: any[], fileName: string, onProgress?: (pct: number) => void) => Promise<any>,
 *   showAINeededDialog?: (action?: string) => void,
 * }} [deps]
 */
export function configurePdfImportFileHandlers(deps = {}) {
  if (typeof deps.parseLabPDFWithAI === 'function') fileHandlerDeps.parseLabPDFWithAI = deps.parseLabPDFWithAI;
  if (typeof deps.parseLabPDFWithAIImages === 'function') fileHandlerDeps.parseLabPDFWithAIImages = deps.parseLabPDFWithAIImages;
  if (typeof deps.showAINeededDialog === 'function') fileHandlerDeps.showAINeededDialog = deps.showAINeededDialog;
}

async function _showImageModeDialog() {
  return new Promise(resolve => {
    const overlay = document.getElementById('confirm-dialog-overlay');
    const dialog = document.getElementById('confirm-dialog');
    if (!overlay || !dialog) { resolve('cancel'); return; }
    dialog.innerHTML = `
      <div style="font-size:14px;font-weight:600;margin-bottom:8px">Limited text extracted</div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:16px">
        This PDF appears to be scanned or image-heavy. Text extraction found very little content.<br><br>
        <strong>Image mode</strong> sends page screenshots to the AI instead. This skips PII obfuscation — the AI will see the full page images including any personal information.
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn" style="padding:7px 16px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);cursor:pointer">Cancel</button>
        <button class="btn" style="padding:7px 16px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);cursor:pointer">Try text anyway</button>
        <button class="btn" style="padding:7px 16px;border-radius:6px;border:none;background:var(--accent-gradient);color:white;cursor:pointer;font-weight:500">Use image mode</button>
      </div>`;
    let settled = false;
    const closeWithChoice = (choice) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey);
      closeModalOverlay(overlay);
      resolve(choice);
    };
    const onKey = (e) => { if (e.key === 'Escape') closeWithChoice('cancel'); };
    document.addEventListener('keydown', onKey, { once: true });
    dialog.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.textContent?.trim();
        if (action === 'Cancel') closeWithChoice('cancel');
        else if (action === 'Try text anyway') closeWithChoice('text');
        else closeWithChoice('image');
      }, { once: true });
    });
    openModalOverlay(overlay, { initialFocus: 'button', focusDelay: 50 });
  });
}

export async function handlePDFFileWorkflow(file, forceImageMode = false, preExtractedText = /** @type {string | null} */ (null)) {
  const { parseLabPDFWithAI, parseLabPDFWithAIImages, showAINeededDialog } = fileHandlerDeps;
  if (!parseLabPDFWithAI || !parseLabPDFWithAIImages || !showAINeededDialog) {
    throw new Error('PDF import file handler dependencies are not configured');
  }
  const _startProfileId = state.currentProfile;
  const benchmarkStarted = performance.now();
  const benchmarkId = startImportBenchmark({ fileName: file.name, fileSize: file.size, importMode: forceImageMode ? 'image' : 'text' });
  let benchmarkFinished = false;
  let benchmarkStage = 'extract';
  const setBenchmarkStage = (stage, patch = {}) => {
    benchmarkStage = stage;
    updateImportBenchmark(benchmarkId, { stage, ...patch }, { persist: false });
  };
  const finishBenchmark = (status, patch = {}) => {
    if (benchmarkFinished) return;
    benchmarkFinished = true;
    finishImportBenchmark(benchmarkId, status, { stage: benchmarkStage, ...patch });
  };
  const hasPreExtractedText = preExtractedText !== null;
  const isCsvImport = isCsvTextFile(file);
  const isXlsxImport = isXlsxFile(file);
  const isTextFileImport = isTextImportFile(file);
  const textImportKind = isXlsxImport ? 'Excel workbook' : isCsvImport ? 'CSV' : isTextFileImport ? 'text file' : 'PDF';
  const textAction = isXlsxImport ? 'xlsx' : isCsvImport ? 'csv' : isTextFileImport ? 'text' : 'import';
  try {
    await showImportProgress(0, file.name);
    const pdfText = hasPreExtractedText ? preExtractedText : await extractPDFText(file);
    const textQuality = hasPreExtractedText ? 'good' : assessTextQuality(pdfText);
    setBenchmarkStage('mode-selection', {
      inputChars: pdfText.length,
      pageCount: (pdfText.match(/^=== Page \d+ ===$/gm) || []).length,
      textQuality,
    });

    let useImageMode = forceImageMode;
    if (!forceImageMode && (textQuality === 'empty' || textQuality === 'poor')) {
      const choice = await _showImageModeDialog();
      if (choice === 'cancel') { hideImportProgress(); return; }
      useImageMode = choice === 'image';
      updateImportBenchmark(benchmarkId, { importMode: useImageMode ? 'image' : 'text' }, { persist: false });
      logPrivacyDiagnostic('import-mode-selected', { mode: choice, quality: textQuality });
    }

    if (useImageMode) {
      if (!hasAIProvider()) {
        hideImportProgress('error');
        showAINeededDialog('image');
        return;
      }
      await showImportProgress(3, file.name);
      const images = await extractPDFImages(file);
      if (images.length === 0) { hideImportProgress('error'); showNotification("Could not render PDF pages", "error"); return; }
      await showImportProgress(3, file.name);
      const analysisStart = performance.now();
      setBenchmarkStage('analysis', { importMode: 'image', pageCount: images.length });
      const result = await parseLabPDFWithAIImages(images, file.name, updateImportProgressPct);
      const analysisMs = Math.round(performance.now() - analysisStart);
      const analysisTime = Math.round(analysisMs / 1000);
      logPrivacyDiagnostic('image-analysis-complete', { analysisMs });
      result.privacyMethod = 'none (image mode)';
      result.timings = { pii: 0, analysis: analysisTime, piiMs: 0, analysisMs };
      const prov = result.provider || getAIProvider();
      const mid = getActiveModelId();
      const tokens = getUsageTokens(result.usage);
      result.costInfo = {
        provider: prov, modelId: mid,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        cost: calculateCost(prov, mid, tokens.inputTokens, tokens.outputTokens)
      };
      trackUsage(prov, mid, tokens.inputTokens, tokens.outputTokens);
      result.importHash = hashString(images.map(image => image.base64).join('|'));
      result.benchmarkId = benchmarkId;
      captureImportBenchmarkReviewBaseline(result);
      result._importProfileId = _startProfileId;
      if (!result.date) showNotification("Could not find collection date in PDF", "error");
      if (result.markers.length === 0) { finishBenchmark('no-markers', benchmarkResultPatch(result, performance.now() - benchmarkStarted)); hideImportProgress('error'); showNotification("No biomarkers found in PDF images", "error"); return; }
      finishBenchmark('preview', benchmarkResultPatch(result, performance.now() - benchmarkStarted));
      await showImportProgress(4, file.name);
      showImportPreview(result);
      hideImportProgress();
      return;
    }

    if (!pdfText.trim()) { hideImportProgress('error'); showNotification(`${textImportKind} appears empty — no text extracted`, "error"); return; }

    if (!hasAIProvider()) {
      hideImportProgress('error');
      showAINeededDialog(textAction);
      return;
    }

    await showImportProgress(1, file.name);
    setBenchmarkStage('preflight');
    const preflight = await runPreflightChecks(pdfText, file.name);
    if (!preflight) { hideImportProgress('cancel'); return; }

    await showImportProgress(2, file.name);
    setBenchmarkStage('privacy');
    let textForAI = pdfText;
    let privacyMethod = null;
    let privacyReplacements = 0;
    let privacyOriginal = null;
    let piiTime = 0;
    let piiMs = 0;
    const ollama = await checkOllamaPII();

    if (ollama.available && isPIIReviewEnabled()) {
      const piiStart = performance.now();
      const reviewResult = await reviewPIIBeforeSend(pdfText, {
        streamFn: (onChunk, signal, onThinking) => sanitizeWithOllamaStreaming(pdfText, onChunk, signal, onThinking)
      });
      piiMs = Math.round(performance.now() - piiStart);
      piiTime = Math.round(piiMs / 1000);
      if (reviewResult === 'cancel') { hideImportProgress('cancel'); showNotification('Import cancelled.', 'info'); return; }
      textForAI = reviewResult;
      privacyMethod = 'ollama+review';
      privacyOriginal = pdfText;
    } else if (ollama.available) {
      try {
        const piiStart = performance.now();
        textForAI = await sanitizeWithOllama(pdfText);
        piiMs = Math.round(performance.now() - piiStart);
        piiTime = Math.round(piiMs / 1000);
        privacyMethod = 'ollama';
        privacyOriginal = pdfText;
        logPrivacyDiagnostic('local-sanitizer-complete', { durationMs: piiMs });
      } catch (e) {
        logPrivacyDiagnostic('local-sanitizer-fallback', {
          errorName: getErrorName(e) || 'Error',
        });
        try {
          const result = obfuscatePDFText(pdfText);
          textForAI = result.obfuscated;
          privacyReplacements = result.replacements;
          privacyOriginal = result.original;
          privacyMethod = 'regex';
        } catch (e2) {
          hideImportProgress('error');
          showNotification('Privacy protection failed \u2014 PDF not sent to AI. Try again or check Settings.', 'error');
          return;
        }
      }
    } else {
      try {
        const result = obfuscatePDFText(pdfText);
        textForAI = result.obfuscated;
        privacyReplacements = result.replacements;
        privacyOriginal = result.original;
        privacyMethod = 'regex';
      } catch (e) {
        hideImportProgress('error');
        showNotification('Privacy protection failed \u2014 PDF not sent to AI. Try again or check Settings.', 'error');
        return;
      }
      if (isPIIReviewEnabled()) {
        const reviewResult = await reviewPIIBeforeSend(pdfText, { obfuscatedText: textForAI });
        if (reviewResult === 'cancel') { hideImportProgress('cancel'); showNotification('Import cancelled.', 'info'); return; }
        textForAI = reviewResult;
      }
    }
    logPrivacyDiagnostic('transform-complete', {
      method: privacyMethod || 'unknown',
      durationMs: piiMs,
      replacements: privacyReplacements,
      inputChars: pdfText.length,
      outputChars: textForAI.length,
    });

    await showImportProgress(3, file.name);
    setBenchmarkStage('analysis');
    const analysisStart = performance.now();
    const result = await parseLabPDFWithAI(textForAI, file.name, updateImportProgressPct);
    const analysisMs = Math.round(performance.now() - analysisStart);
    const analysisTime = Math.round(analysisMs / 1000);
    logPrivacyDiagnostic('analysis-complete', { analysisMs });
    result.privacyMethod = privacyMethod;
    result.privacyReplacements = privacyReplacements;
    result.timings = { pii: piiTime, analysis: analysisTime, piiMs, analysisMs };
    const prov = result.provider || getAIProvider();
    const mid = getActiveModelId();
    const tokens = getUsageTokens(result.usage);
    result.costInfo = {
      provider: prov, modelId: mid,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      cost: calculateCost(prov, mid, tokens.inputTokens, tokens.outputTokens)
    };
    trackUsage(prov, mid, tokens.inputTokens, tokens.outputTokens);
    result.importHash = hashString(pdfText);
    result.benchmarkId = benchmarkId;
    captureImportBenchmarkReviewBaseline(result);
    result._importProfileId = _startProfileId;
    if (isDebugMode()) { result.privacyOriginal = privacyOriginal; result.privacyObfuscated = textForAI; }
    if (!result.date) { showNotification(`Could not find collection date in ${textImportKind}`, "error"); }
    if (result.markers.length === 0) { finishBenchmark('no-markers', benchmarkResultPatch(result, performance.now() - benchmarkStarted)); hideImportProgress('error'); showNotification(`No biomarkers found in ${textImportKind}`, "error"); return; }
    finishBenchmark('preview', benchmarkResultPatch(result, performance.now() - benchmarkStarted));
    await showImportProgress(4, file.name);
    showImportPreview(result);
    hideImportProgress();
  } catch (err) {
    finishBenchmark('failed', { error: formatImportError(err), totalMs: Math.round(performance.now() - benchmarkStarted) });
    hideImportProgress('error');
    logPrivacyDiagnostic('parse-failed', {
      stage: benchmarkStage,
      errorName: getErrorName(err) || 'Error',
    });
    showNotification("Error parsing PDF: " + formatImportError(err), "error", 10000);
  } finally {
    if (!benchmarkFinished) finishBenchmark('stopped', { reason: benchmarkStage, totalMs: Math.round(performance.now() - benchmarkStarted) });
  }
}

export async function handleImageFileWorkflow(file) {
  const { parseLabPDFWithAIImages, showAINeededDialog } = fileHandlerDeps;
  if (!parseLabPDFWithAIImages || !showAINeededDialog) {
    throw new Error('PDF import image handler dependencies are not configured');
  }
  if (!hasAIProvider()) {
    showAINeededDialog('image');
    return;
  }
  if (!await showConfirmDialog(
    'This image will be sent directly to the configured AI server or provider. Personal details visible in the image cannot be scrubbed before upload. Continue?'
  )) return;
  const _startProfileId = state.currentProfile;
  const benchmarkStarted = performance.now();
  const benchmarkId = startImportBenchmark({ fileName: file.name, fileSize: file.size, importMode: 'image', pageCount: 1 });
  try {
    await showImportProgress(3, file.name);
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const mediaType = file.type || (file.name.match(/\.png$/i) ? 'image/png' : file.name.match(/\.webp$/i) ? 'image/webp' : 'image/jpeg');
    const images = [{ base64, mediaType, page: 1 }];
    const analysisStart = performance.now();
    updateImportBenchmark(benchmarkId, { stage: 'analysis', pageCount: 1 }, { persist: false });
    const result = await parseLabPDFWithAIImages(images, file.name, updateImportProgressPct);
    const analysisMs = Math.round(performance.now() - analysisStart);
    const analysisTime = Math.round(analysisMs / 1000);
    logPrivacyDiagnostic('image-analysis-complete', { analysisMs });
    result.privacyMethod = 'none (image mode)';
    result.timings = { pii: 0, analysis: analysisTime, piiMs: 0, analysisMs };
    const prov = result.provider || getAIProvider();
    const mid = getActiveModelId();
    const tokens = getUsageTokens(result.usage);
    result.costInfo = {
      provider: prov, modelId: mid,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      cost: calculateCost(prov, mid, tokens.inputTokens, tokens.outputTokens)
    };
    trackUsage(prov, mid, tokens.inputTokens, tokens.outputTokens);
    result.importHash = hashString(base64);
    result.benchmarkId = benchmarkId;
    captureImportBenchmarkReviewBaseline(result);
    result._importProfileId = _startProfileId;
    if (!result.date) showNotification("Could not find collection date in image", "error");
    if (result.markers.length === 0) {
      finishImportBenchmark(benchmarkId, 'no-markers', benchmarkResultPatch(result, performance.now() - benchmarkStarted));
      hideImportProgress('error');
      showNotification("No biomarkers found in image", "error");
      return;
    }
    finishImportBenchmark(benchmarkId, 'preview', benchmarkResultPatch(result, performance.now() - benchmarkStarted));
    await showImportProgress(4, file.name);
    showImportPreview(result);
    hideImportProgress();
  } catch (err) {
    finishImportBenchmark(benchmarkId, 'failed', {
      stage: 'analysis',
      error: formatImportError(err),
      totalMs: Math.round(performance.now() - benchmarkStarted),
    });
    logPrivacyDiagnostic('image-import-failed', {
      errorName: getErrorName(err) || 'Error',
    });
    hideImportProgress('error');
    showNotification(`Import failed: ${formatImportError(err)}`, 'error');
  }
}
