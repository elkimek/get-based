// @ts-check
// pdf-import.js — PDF parsing pipeline, import preview, drop zone, batch import

import { getErrorMessage, getErrorName } from './caught-error.js';
import { state } from './state.js';
import { calculateCost, trackUsage } from './schema.js';
import { showNotification, isDebugMode, isPIIReviewEnabled, hashString } from './utils.js';
import { getAIProvider, getActiveModelId, AI_IMPORT_REQUEST_TIMEOUT_MS, startOpenRouterOAuth } from './api.js';
import { obfuscatePDFText, sanitizeWithOllama, sanitizeWithOllamaStreaming, checkOllamaPII, reviewPIIBeforeSend } from './pii.js';
import { getProfileLocation, getActiveProfileId } from './profile.js';
import { maybeShowEncryptionNudge } from './crypto.js';
import { importDataJSON, loadDemoData } from './export.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import {
  callImportAIWithStreamFallback,
  compactMarkerReference,
  createImportAIProgress,
  getUsageTokens,
  IMPORT_COLLECTION_CONTEXT_PROMPT, IMPORT_JSON_SCHEMA,
  importAIPerfKey, normalizeImportedCollectionContext,
  saveImportAIPerf,
  tryParseJSON,
} from './pdf-import-ai-utils.js';
import { extractXLSXText, isCsvTextFile, isXlsxFile } from './pdf-import-spreadsheet.js';
import { handleCycleImportFile, isCycleImportFile, maybeHandleCycleTextImport } from './cycle-import.js';
import {
  assessTextQuality as assessImportedTextQuality,
  classifyImportFiles as classifyImportFileBuckets,
  extractPDFImages as extractPdfImagesFromFile,
  extractPDFText as extractPdfTextFromFile,
  isPdfByMagic as isPdfFileByMagic,
} from './pdf-import-file-utils.js';
import { runPreflightChecks } from './pdf-import-preflight.js';
import { normalizeParsedImportMarkers } from './pdf-import-marker-normalization.js';
import {
  refreshImportedDataViews,
} from './pdf-import-persistence.js';
import {
  hideImportProgress,
  isImportRunning,
  showBatchImportProgress,
  updateImportProgressPct,
} from './pdf-import-progress.js';
import {
  buildMarkerReference, getExistingImportMarkerKeys,
} from './pdf-import-marker-mapping.js';
import {
  showImportPreviewAsync,
} from './pdf-import-review.js';
import {
  setPdfImportBatchMode,
} from './pdf-import-commit.js';
import { getDnaModuleFunction } from './dna-runtime-bridge.js';
import { getSettingsModuleFunction } from './settings-runtime-bridge.js';
import {
  benchmarkResultPatch,
  captureImportBenchmarkReviewBaseline,
  finishImportBenchmark,
  startImportBenchmark,
  updateImportBenchmark,
} from './import-benchmarks.js';
import {
  configurePdfImportFileHandlers,
  handleImageFileWorkflow,
  handlePDFFileWorkflow,
} from './pdf-import-file-handlers.js';
import { logPrivacyDiagnostic } from './privacy-safe-diagnostics.js';
import { getAssistantFeatureIdentity, hasAssistantFeatureProvider } from './ai-feature-routing.js';

const pdfImportDeps = {
  importDataJSON,
  loadDemoData,
  maybeShowEncryptionNudge,
  startOpenRouterOAuth,
};

configurePdfImportFileHandlers({
  parseLabPDFWithAI,
  parseLabPDFWithAIImages,
  showAINeededDialog,
});

export function configurePdfImportDeps(deps = {}) {
  const previous = { ...pdfImportDeps };
  if (typeof deps.importDataJSON === 'function') pdfImportDeps.importDataJSON = deps.importDataJSON;
  if (typeof deps.loadDemoData === 'function') pdfImportDeps.loadDemoData = deps.loadDemoData;
  if (typeof deps.maybeShowEncryptionNudge === 'function') pdfImportDeps.maybeShowEncryptionNudge = deps.maybeShowEncryptionNudge;
  if (typeof deps.startOpenRouterOAuth === 'function') pdfImportDeps.startOpenRouterOAuth = deps.startOpenRouterOAuth;
  return previous;
}

export { buildMarkerReference, reconcileImportMarkerMappings } from './pdf-import-marker-mapping.js';
export { tryParseJSON } from './pdf-import-ai-utils.js';
export { extractXLSXText } from './pdf-import-spreadsheet.js';
export {
  showImportPreview,
  applyManualImportDate,
  applyManualImportCollectionContext,
  mapUnmatchedMarker,
  mapUnmatchedMarkerInput,
  setImportReviewFilter,
  applyImportReviewFilters,
  toggleImportRow,
  closeImportModal,
  showImportPreviewAsync,
} from './pdf-import-review.js';
export {
  hideImportProgress,
  showBatchImportProgress,
  showImportProgress,
} from './pdf-import-progress.js';
export { handleCycleImportFile } from './cycle-import.js';
export { removeImportedEntry, renameImportedEntryDate } from './pdf-import-persistence.js';
export {
  confirmImport,
  deleteImportSnapshot,
  openImportReviewFromSnapshot,
} from './pdf-import-commit.js';

// ═══════════════════════════════════════════════
// AI-NEEDED DIALOG — contextual fallback when import is invoked without an AI provider.
// Replaces a flash-notification + cold Settings-modal-open. Surfaces three options
// matching the same mental model as the chat-onboarding quiz: easy (OpenRouter
// OAuth), advanced (Settings for paste-a-key), or escape hatch (load demo data).
// ═══════════════════════════════════════════════
export function showAINeededDialog(action = 'import') {
  let overlay = document.getElementById('ai-needed-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ai-needed-overlay';
    overlay.className = 'confirm-overlay';
    document.body.appendChild(overlay);
  }
  const verb = action === 'image'
    ? 'Reading lab values from an image'
    : action === 'csv'
      ? 'Reading lab values from a CSV'
      : action === 'text'
        ? 'Reading lab values from a text file'
        : action === 'xlsx'
          ? 'Reading lab values from an Excel workbook'
          : 'Reading lab values from a PDF';
  overlay.innerHTML = `<div class="confirm-dialog ai-needed-dialog" role="dialog" aria-modal="true" aria-label="AI needed to import">
    <p class="confirm-message"><strong>${verb} needs an AI to parse them.</strong></p>
    <p style="font-size:13px;color:var(--text-muted);margin:0 0 14px">Quickest setup is the &ldquo;card&rdquo; option below &mdash; one-click login, charge to your card, you&rsquo;re done in about 30 seconds.</p>
    <div class="chat-quiz-options" style="margin-bottom:10px">
      <button class="chat-quiz-option chat-quiz-recommended" id="ai-needed-or">
        <span class="chat-quiz-icon" aria-hidden="true">&#128179;</span>
        <span class="chat-quiz-body">
          <strong>Connect with OpenRouter</strong>
          <span>Card payment, one-click login. <em class="chat-quiz-rec">Recommended</em></span>
        </span>
        <span class="chat-quiz-arrow" aria-hidden="true">&rarr;</span>
      </button>
      <button class="chat-quiz-option" id="ai-needed-key">
        <span class="chat-quiz-icon" aria-hidden="true">&#128273;</span>
        <span class="chat-quiz-body">
          <strong>I already have an API key</strong>
          <span>Open Settings &rarr; AI to paste it.</span>
        </span>
        <span class="chat-quiz-arrow" aria-hidden="true">&rarr;</span>
      </button>
      <button class="chat-quiz-option" id="ai-needed-demo">
        <span class="chat-quiz-icon" aria-hidden="true">&#128202;</span>
        <span class="chat-quiz-body">
          <strong>Just exploring? Load demo labs</strong>
          <span>Sample dataset so you can poke around without setup.</span>
        </span>
        <span class="chat-quiz-arrow" aria-hidden="true">&rarr;</span>
      </button>
    </div>
    <div style="text-align:right;margin-top:8px">
      <button class="confirm-btn confirm-btn-cancel" id="ai-needed-cancel">Not now</button>
    </div>
  </div>`;
  openModalOverlay(overlay, { initialFocus: '#ai-needed-or', focusDelay: 50 });
  const close = () => closeModalOverlay(overlay);
  document.getElementById('ai-needed-or')?.addEventListener('click', () => { close(); pdfImportDeps.startOpenRouterOAuth(); });
  document.getElementById('ai-needed-key')?.addEventListener('click', () => {
    close();
    getSettingsModuleFunction('openSettingsModal')?.('ai');
  });
  document.getElementById('ai-needed-demo')?.addEventListener('click', () => {
    close();
    const sex = state.profileSex === 'female' ? 'female' : 'male';
    void pdfImportDeps.loadDemoData(sex);
  });
  document.getElementById('ai-needed-cancel')?.addEventListener('click', close);
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
}

// ═══════════════════════════════════════════════
// AI-POWERED PDF IMPORT
// ═══════════════════════════════════════════════
export async function extractPDFText(file) {
  return extractPdfTextFromFile(file);
}

/**
 * @param {string} pdfText
 * @param {string} fileName
 * @param {((pct: number, stageLabel?: string) => void) | undefined} onProgress
 * @param {{captureRawModelOutput?: boolean, deterministicBenchmark?: boolean}} [options]
 * @returns {Promise<any>}
 */
export async function parseLabPDFWithAI(pdfText, fileName, onProgress, options = {}) {
  const deterministicBenchmark = options.deterministicBenchmark === true;
  const markerRef = buildMarkerReference(deterministicBenchmark
    ? { profileSex: 'male', includeCustomMarkers: false }
    : undefined);
  const country = deterministicBenchmark
    ? 'United States'
    : (getProfileLocation(getActiveProfileId())?.country || '').trim();
  const dateHint = country
    ? `   IMPORTANT — the user's region is ${country}. Disambiguate ambiguous numeric dates like "12/7/2025" using the format common to that region (US, Philippines = MM/DD/YYYY; UK, EU, India, Australia, most of Canada = DD/MM/YYYY). Do not assume MM/DD by default.`
    : `   IMPORTANT — for ambiguous numeric dates like "12/7/2025", look for context (other dates, a printed format like "DD/MM/YYYY" in the report header, or month names elsewhere) before deciding. Do not assume MM/DD by default — most of the world uses DD/MM/YYYY.`;
  const system = `You are a lab report data extraction assistant. You extract biomarker results from lab report text and map them to a known set of marker keys.

Known markers are listed as key|English name|expected unit. Reference ranges must come from the report, never this list:
${compactMarkerReference(markerRef)}

IMPORTANT — The lab report may contain test names in Bulgarian, Czech, German, Russian, Ukrainian, or other languages. Before matching, translate every non-English test name into its English medical equivalent. For example: "Креатинин" → "Creatinine", "Урея" → "Urea", "Мочевая кислота" → "Uric Acid", "АСТ" → "AST", "Glukóza" → "Glucose". Use the English name when searching the known markers list.
IMPORTANT — Use English unit abbreviations only. Do not use Cyrillic or localized unit names, replace them with English instead.
Examples:
- Enzyme activity: U/L (not Ед/л)
- Micromoles per liter: µmol/l (not мкмоль/л)
- Millimoles per liter: mmol/l (not ммоль/л)
- Milligrams per deciliter: mg/dl
- Grams per liter: g/l
- Microkatals per liter: µkat/l

Don't limit yourself just to the examples and languages provided. Always translate the unit names into the English equivalent.

Your task:
1. Find the sample collection date in the text. Return it as YYYY-MM-DD. Look for dates near keywords like "collection", "collected", "date", "odběr", "datum", or similar in any language.
${dateHint}
${IMPORT_COLLECTION_CONTEXT_PROMPT}
2. For each biomarker result found in the text, extract:
   - rawName: the test name exactly as it appears in the PDF
   - value: the numeric result (parse comma as decimal point). For "< X" or "> X" results, use X as the value (the detection limit) — these are still clinically meaningful for trend tracking
   - mappedKey: the matching key from the known markers list (e.g. "biochemistry.glucose"), or null if no match
   - unit: standard English unit abbreviation (e.g., "µg/l", "nmol/l", "U/l", "mg/dl"). Translate all localized or Cyrillic units (like "мкг/л", "нмоль/л", "МЕ/л") to their English equivalents. Never use localized units.
   - refMin: the lower reference range bound EXACTLY as printed on the PDF (number or null). Do NOT copy from the known markers list above — extract from the actual PDF text
   - refMax: the upper reference range bound EXACTLY as printed on the PDF (number or null). Do NOT copy from the known markers list above — extract from the actual PDF text
3. Match based on medical/biochemical equivalence, not just string similarity. For example:
   - "Glukóza" → "biochemistry.glucose" (Czech for glucose)
   - "BUN" or "Blood Urea Nitrogen" → "biochemistry.urea"
   - "Triacylglyceroly" → "lipids.triglycerides"
   - "Trombokrit" / "Plateletcrit" / "PCT" (hematology) → "hematology.pct"
   - CRP: "hs-CRP" / "hsCRP" / "high-sensitivity CRP" / "vysoce senzitivní CRP" → "proteins.hsCRP". Plain "CRP" / "S-CRP" / "C-reaktívny proteín" → "proteins.crp". These are different assays — do not merge them
   - Testosterone: "Testosterone", "Free Testosterone" and "Bioactive Testosterone" are also different assays — do not merge them either.
   - Some similar assays might come in both quantitative and percentage measurement (e.g. Bioactive Testosterone and Bioactive Testosterone Percentage). If they do appear in pair, treat them as separated assays, do not skip any.
   - Use the units and reference ranges to help disambiguate
   - IMPORTANT: Many labs prefix marker names with specimen type codes: S- (serum), P- (plasma), B- (blood), U- (urine), fS- (fasting serum), USED- (urine sediment), F- (fecal), FW (sedimentation). Strip these prefixes when matching to known markers. Keep them in rawName for reference
   - Do NOT map urine-prefixed rows to serum/plasma/blood markers. Example: "S Celk.bílkovina" is serum Total Protein → "proteins.totalProtein", but "U Celková bílkovina" is urine total protein and must be a separate urine marker, not "proteins.totalProtein"
4. Only map to a marker if you're confident it's the correct match
5. For differential WBC: only map absolute count values (marked with # or abs.) to the # markers; percentage values go to the Pct markers
6. Skip non-numeric results (text-only findings, interpretive notes). But EVERY numeric result MUST be included — if it doesn't match a known key, set mappedKey to null and provide suggestedKey/suggestedName/suggestedCategoryLabel. Never silently drop a numeric marker
7. Identify the type of lab test this PDF represents. Return as "testType" field:
   - "blood" for standard blood panels (CBC, metabolic, lipids, hormones, etc.)
   - "OAT" for Organic Acids Tests (Mosaic, Genova, Great Plains)
   - "Metabolomix+" for Genova Metabolomix+ profiles (combo: organic acids + amino acids + fatty acids)
   - "fattyAcids" for standalone fatty acid profile tests. Identify the specific product/lab:
     * Spadia Lab → ALL markers use category prefix "spadiaFA" (e.g., "spadiaFA.epaC20_5"), suggestedCategoryLabel "Spadia", suggestedGroup "Fatty Acids"
     * ZinZino BalanceTest → ALL markers use category prefix "zinzinoFA" (e.g., "zinzinoFA.epaC20_5"), suggestedCategoryLabel "ZinZino", suggestedGroup "Fatty Acids"
     * OmegaQuant (Basic/Plus/Complete) → ALL markers use category prefix "omegaquantFA" (e.g., "omegaquantFA.epaC20_5"), suggestedCategoryLabel "OmegaQuant", suggestedGroup "Fatty Acids"
     * Other fatty acid labs → ALL markers use labNameFA prefix, suggestedCategoryLabel = lab name, suggestedGroup "Fatty Acids"
     IMPORTANT: Put ALL markers from one test into ONE category (the product prefix). Do NOT split by fatty acid type (omega-3, omega-6, saturated, etc.) — those are subsections in the report, not separate categories. Do NOT use the generic "fattyAcids" prefix
   - "DUTCH" for dried urine hormone panels
   - "HTMA" for Hair Tissue Mineral Analysis
   - "GI" for stool tests (GI-MAP, Gut Zoomer)
   - "biostarks" for BioStarks laboratory panels (dried blood spot: amino acids, fatty acids, intracellular minerals, vitamins, hormones, metabolism). BioStarks is a HYBRID test — map standard blood markers (glucose, lipids, testosterone, creatinine, ferritin, vitamin D, B12, vitamin A, copper, HbA1c) to their normal standard keys. Map amino acids to biostarksAmino.* keys, BioStarks fatty acids to biostarksFA.* keys, intracellular minerals (µg/gHb) to biostarksMineral.* keys, cortisol/T:C ratio to biostarksHormone.* keys, and vitamin E to biostarksVitamin.* keys — all from the known markers list
   - Or a descriptive name for other specialty tests. Also return "labName" with the laboratory or exact product name when it is printed on the report (for example "Genova Diagnostics", "Mosaic Diagnostics", or "Mosaic MOAT"). Return null when it cannot be identified. This is required to keep different specialty products in separate histories.
8. CRITICAL for specialty tests (testType ≠ "blood"): You MUST NOT set mappedKey to any standard blood work category key (biochemistry, hormones, electrolytes, lipids, iron, proteins, thyroid, vitamins, diabetes, tumorMarkers, coagulation, hematology, differential, boneMetabolism) or "fattyAcids". Even if a marker name matches (e.g., "Creatinine" in a urine OAT test is NOT "biochemistry.creatinine" which is serum). Even if "fattyAcids.*" keys exist in the known markers list, do NOT match to them — always create new product-specific keys. Always use test-type-prefixed keys from the reference list (oatMicrobial, oatMetabolic, etc.) or set mappedKey to null so it becomes a new custom marker. Different specimen types = different markers.
   EXCEPTION — BioStarks (testType "biostarks"): This is a hybrid test containing both standard blood markers AND specialty markers. DO map its standard blood markers (glucose, lipids, testosterone, creatinine, ferritin, vitamin D, B12, vitamin A, copper, HbA1c) to standard category keys. Only use biostarks-prefixed keys for amino acids, BioStarks fatty acids, intracellular minerals (µg/gHb), cortisol, T/C ratio, and vitamin E.
9. For markers that do NOT match any known key (mappedKey is null), also return:
   - suggestedKey: a "category.camelCaseKey" string. For specialty tests (testType ≠ "blood"), ALWAYS use a test-type-prefixed category (e.g., "oatNutritional", "dutchHormones"). Never use standard blood work categories for specialty test markers. The key part should be a concise camelCase identifier. NEVER use a suggestedKey that already exists in the known markers list above.
   - suggestedName: a clean English display name for the marker
   - suggestedCategoryLabel: short category label (e.g., "Microbial Overgrowth")
   - suggestedGroup: test type group (e.g., "OAT", "DUTCH", "HTMA", "Fatty Acids") — omit for standard blood work
10. FATTY ACID TESTS: ALL markers from one test go into ONE category using the product prefix. Example for OmegaQuant: every marker (EPA, DHA, Palmitic, Oleic, Trans Fat Index, AA:EPA ratio — everything) uses suggestedKey "omegaquantFA.markerName", suggestedCategoryLabel "OmegaQuant", suggestedGroup "Fatty Acids". Do NOT create subcategories like "Omega-3 Fatty Acids" or "Saturated Fatty Acids" — those are report sections, not categories.

Return ONLY valid JSON in this exact format, no other text:
{
  "testType": "blood",
  "date": "YYYY-MM-DD",
  "sampleTime": "08:30",
  "fasting": true,
  "markers": [
    {"rawName": "Test Name", "value": 5.23, "mappedKey": "category.marker", "unit": "mg/dL", "refMin": 70, "refMax": 100},
    {"rawName": "Unknown Test", "value": 1.0, "mappedKey": null, "suggestedKey": "oatMicrobial.someMarker", "suggestedName": "Some Marker", "suggestedCategoryLabel": "Microbial Overgrowth", "suggestedGroup": "OAT", "unit": "mg/l", "refMin": 0.5, "refMax": 3.0},
    {"rawName": "EPA C20:5", "value": 0.46, "mappedKey": null, "suggestedKey": "omegaquantFA.epaC20_5", "suggestedName": "EPA C20:5", "suggestedCategoryLabel": "OmegaQuant", "suggestedGroup": "Fatty Acids", "unit": "%", "refMin": null, "refMax": null}
  ]
}`;

  const featureIdentity = getAssistantFeatureIdentity();
  const provider = featureIdentity.provider;
  const maxTokens = 16384;
  // Include previously imported marker keys so the AI reuses consistent mappings
  const existingKeys = deterministicBenchmark ? new Set() : getExistingImportMarkerKeys();
  const existingKeysNote = existingKeys.size > 0
    ? `\n\nIMPORTANT — These marker keys were used in previous imports for this profile. Reuse them for the same biomarkers to ensure consistency:\n${[...existingKeys].join(', ')}`
    : '';

  // Phase-aware progress: "reading" until the first streamed token, then
  // "writing" driven by generated length (15% → 90%).
  const perfKey = importAIPerfKey();
  const progress = createImportAIProgress({
    perfKey,
    estimatedPromptTokens: Math.ceil((system.length + pdfText.length) / 3),
    onProgress,
  });
  let response, usage, diagnostics, truncated;
  progress.start();
  try {
    ({ text: response, usage, diagnostics, truncated } = await callImportAIWithStreamFallback({
      system: system + existingKeysNote,
      messages: [{ role: 'user', content: `Extract all biomarker results from this lab report${fileName ? ' (file: ' + fileName + ')' : ''}:\n\n${pdfText}` }],
      maxTokens,
      onStream: progress.onStream,
      requestTimeoutMs: AI_IMPORT_REQUEST_TIMEOUT_MS,
      jsonMode: true,
      jsonSchema: IMPORT_JSON_SCHEMA,
      reasoningEffort: 'none',
      temperature: 0,
      minOutputTokens: 2048,
      preferNativeContext: true,
      promptCharsPerToken: 3,
    }, 'PDF text analysis'));
  } finally {
    progress.finish();
  }
  saveImportAIPerf(perfKey, { usage, diagnostics });

  if (truncated) {
    throw new Error('The AI response was cut off before the marker list completed (output limit or context window reached). Increase the model’s context length, or split the report into smaller imports.');
  }

  // Parse JSON from response (handle markdown code blocks, thinking tags, truncated output)
  let jsonStr = (response || '').trim();
  // Strip thinking model tags (e.g. <think>...</think> from DeepSeek, Qwen, etc.)
  jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
  // Strip any leading text before the JSON object
  const jsonStart = jsonStr.indexOf('{');
  if (jsonStart > 0) jsonStr = jsonStr.slice(jsonStart);
  const parsed = tryParseJSON(jsonStr);
  const rawModelResult = options.captureRawModelOutput ? {
    date: parsed.date || null,
    ...normalizeImportedCollectionContext(parsed),
    testType: parsed.testType || 'blood',
    labName: parsed.labName || null,
    markers: Array.isArray(parsed.markers)
      ? parsed.markers.map(marker => ({ ...marker }))
      : [],
  } : null;

  const { testType, markers } = normalizeParsedImportMarkers(parsed, {
    markerRef,
    fileName,
    sourceText: pdfText,
    existingKeys,
    mode: 'text',
    emitDebugLogs: true,
  });
  return {
    date: parsed.date || null,
    ...normalizeImportedCollectionContext(parsed),
    testType,
    markers,
    fileName,
    usage,
    provider,
    modelId: featureIdentity.modelId,
    diagnostics,
    imageMode: false,
    ...(rawModelResult ? { benchmarkRawModelResult: rawModelResult } : {}),
  };
}

// ═══════════════════════════════════════════════
// FILE CLASSIFICATION
// ═══════════════════════════════════════════════
export async function isPdfByMagic(file) {
  return isPdfFileByMagic(file);
}

export async function classifyImportFiles(files) {
  return classifyImportFileBuckets(files, {
    isDNAFile: getDnaModuleFunction('isDNAFile') || undefined,
    isDNAFileByContent: getDnaModuleFunction('isDNAFileByContent') || undefined,
    isCycleImportFile,
  });
}

// ═══════════════════════════════════════════════
// DROP ZONE
// ═══════════════════════════════════════════════
export function setupDropZone() {
  const dropZone = document.getElementById("drop-zone");
  if (!dropZone) return;
  dropZone.addEventListener("click", () => { if (isImportRunning()) return; document.getElementById('pdf-input')?.click(); });
  dropZone.addEventListener("dragover", e => { e.preventDefault(); if (!isImportRunning()) dropZone.classList.add("drag-over"); });
  dropZone.addEventListener("dragleave", e => { e.preventDefault(); dropZone.classList.remove("drag-over"); });
  dropZone.addEventListener("drop", async e => {
    e.preventDefault(); dropZone.classList.remove("drag-over");
    if (isImportRunning()) { showNotification("Import already in progress", "info"); return; }
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;
    const { jsonFiles, pdfFiles, imageFiles, dnaFiles, textFiles, cycleFiles = [], unsupportedCount } = await classifyImportFiles(files);
    if (unsupportedCount > 0 && jsonFiles.length === 0 && pdfFiles.length === 0 && imageFiles.length === 0 && dnaFiles.length === 0 && textFiles.length === 0 && cycleFiles.length === 0) {
      showNotification("Unsupported file type. Use PDF, Excel, text, image, JSON, DNA raw data, or an Apple Health, Drip, Natural Cycles, or Clue export.", "error");
      return;
    }
    for (const f of jsonFiles) await pdfImportDeps.importDataJSON(f);
    if (cycleFiles.length > 0) { for (const f of cycleFiles) await handleCycleImportFile(f); }
    if (dnaFiles.length > 0) {
      for (const f of dnaFiles) {
        const header = await f.slice(0, 1500).text();
        const fmt = getDnaModuleFunction('detectDNAFile')?.(header) || null;
        const handleMtDNAFile = getDnaModuleFunction('handleMtDNAFile');
        const handleDNAFile = getDnaModuleFunction('handleDNAFile');
        if ((fmt === 'mtdna' || fmt === '23andme-mito') && handleMtDNAFile) await handleMtDNAFile(f);
        else if (fmt === '23andme-y') { showNotification('Y-chromosome DNA files are not supported', 'info'); }
        else if (handleDNAFile) await handleDNAFile(f);
      }
    }
    if (textFiles.length > 0) { for (const f of textFiles) await handleTextFile(f); }
    if (imageFiles.length > 0) { for (const f of imageFiles) await handleImageFile(f); }
    if (pdfFiles.length === 1) await handlePDFFile(pdfFiles[0]);
    else if (pdfFiles.length > 1) await handleBatchPDFs(pdfFiles);
  });
}

// ═══════════════════════════════════════════════
// PDF IMAGE FALLBACK (scanned/image-heavy PDFs)
// ═══════════════════════════════════════════════
export function assessTextQuality(text) {
  return assessImportedTextQuality(text);
}

export async function extractPDFImages(file, maxPages = 8) {
  return extractPdfImagesFromFile(file, maxPages);
}

export async function parseLabPDFWithAIImages(images, fileName, onProgress) {
  const markerRef = buildMarkerReference();
  const country = (getProfileLocation(getActiveProfileId())?.country || '').trim();
  const dateHint = country
    ? `   IMPORTANT — the user's region is ${country}. Disambiguate ambiguous numeric dates like "12/7/2025" using the format common to that region (US, Philippines = MM/DD/YYYY; UK, EU, India, Australia, most of Canada = DD/MM/YYYY). Do not assume MM/DD by default.`
    : `   IMPORTANT — for ambiguous numeric dates like "12/7/2025", look for context (other dates, a printed format like "DD/MM/YYYY" in the report header, or month names elsewhere) before deciding. Do not assume MM/DD by default — most of the world uses DD/MM/YYYY.`;
  // Same system prompt as text-based parsing
  const system = `You are a lab report data extraction assistant. You extract biomarker results from lab report images and map them to a known set of marker keys.

Known markers are listed as key|English name|expected unit. Reference ranges must come from the report, never this list:
${compactMarkerReference(markerRef)}

IMPORTANT — The lab report may contain test names in Bulgarian, Czech, German, Russian, Ukrainian, or other languages. Before matching, translate every non-English test name into its English medical equivalent. For example: "Креатинин" → "Creatinine", "Урея" → "Urea", "Мочевая кислота" → "Uric Acid", "АСТ" → "AST", "Glukóza" → "Glucose". Use the English name when searching the known markers list.
IMPORTANT — Use English unit abbreviations only. Do not use Cyrillic or localized unit names, replace them with English instead.
Examples:
- Enzyme activity: U/L (not Ед/л)
- Micromoles per liter: µmol/l (not мкмоль/л)
- Millimoles per liter: mmol/l (not ммоль/л)
- Milligrams per deciliter: mg/dl
- Grams per liter: g/l
- Microkatals per liter: µkat/l

Don't limit yourself just to the examples and languages provided. Always translate the unit names into the English equivalent.

Your task:
1. Read the lab report page images carefully. Find the sample collection date. Return it as YYYY-MM-DD.
${dateHint}
${IMPORT_COLLECTION_CONTEXT_PROMPT}
2. For each biomarker result found, extract:
   - rawName: the test name exactly as it appears
   - value: the numeric result (parse comma as decimal point). For "< X" or "> X" results, use X as the value (the detection limit) — these are still clinically meaningful for trend tracking
   - mappedKey: the matching key from the known markers list (e.g. "biochemistry.glucose"), or null if no match
   - unit: standard English unit abbreviation (e.g., "µg/l", "nmol/l", "U/l", "mg/dl"). Translate all localized or Cyrillic units (like "мкг/л", "нмоль/л", "МЕ/л") to their English equivalents. Never use localized units.
   - refMin: the lower reference range bound EXACTLY as printed on the report (number or null). Do NOT copy from the known markers list above
   - refMax: the upper reference range bound EXACTLY as printed on the report (number or null). Do NOT copy from the known markers list above
3. Match based on medical/biochemical equivalence, not just string similarity. "hs-CRP"/"hsCRP" → "proteins.hsCRP", plain "CRP" → "proteins.crp" (different assays). Strip specimen-type prefixes (S-, P-, B-, U-, fS-, USED-, F-, FW) when matching — keep in rawName. Do NOT map urine-prefixed rows to serum/plasma/blood markers; "U Celková bílkovina" is urine total protein, not serum Total Protein.
4. Only map to a marker if you're confident it's the correct match
5. Identify the type of lab test. Return as "testType" field: "blood", "OAT", "Metabolomix+", "fattyAcids", "biostarks", "DUTCH", "HTMA", "GI", or a descriptive name. Also return "labName" with the laboratory or exact product name printed on the report, or null when unknown. For fatty acid tests: put ALL markers into ONE product-specific category — spadiaFA (Spadia), zinzinoFA (ZinZino), omegaquantFA (OmegaQuant), or labNameFA. Use suggestedCategoryLabel = product name, suggestedGroup = "Fatty Acids". Do NOT split by fatty acid type (omega-3/omega-6/saturated/trans). For BioStarks: map standard blood markers to standard keys, amino acids to biostarksAmino.*, fatty acids to biostarksFA.*, intracellular minerals (µg/gHb) to biostarksMineral.*, cortisol/T:C ratio to biostarksHormone.*, vitamin E to biostarksVitamin.*
6. CRITICAL for specialty tests (testType ≠ "blood"): Do NOT use standard blood work category keys. Use test-type-prefixed keys or set mappedKey to null. EXCEPTION: BioStarks (testType "biostarks") is hybrid — DO map its standard blood markers to standard keys
7. EVERY numeric result MUST be included — never silently drop a marker. If it doesn't match a known key, set mappedKey to null and provide suggestedKey, suggestedName, suggestedCategoryLabel, suggestedGroup

Return ONLY valid JSON in this exact format:
{
  "testType": "blood",
  "date": "YYYY-MM-DD",
  "sampleTime": null,
  "fasting": null,
  "markers": [
    {"rawName": "Test Name", "value": 5.23, "mappedKey": "category.marker", "unit": "mg/dL", "refMin": 70, "refMax": 100}
  ]
}`;

  const featureIdentity = getAssistantFeatureIdentity();
  const provider = featureIdentity.provider;
  const maxTokens = 16384;

  // Build content array with image blocks + text instruction
  // All providers use OpenAI-compatible image format
  const imageBlocks = images.map(img => {
    return { type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.base64}` } };
  });
  const content = [
    ...imageBlocks,
    { type: 'text', text: `Extract all biomarker results from this lab report${fileName ? ' (file: ' + fileName + ')' : ''}. Read every page carefully.` }
  ];

  const perfKey = importAIPerfKey();
  const progress = createImportAIProgress({
    perfKey,
    estimatedPromptTokens: Math.ceil(system.length / 3) + images.length * 1600,
    onProgress,
  });
  let response, usage, diagnostics, truncated;
  progress.start();
  try {
    ({ text: response, usage, diagnostics, truncated } = await callImportAIWithStreamFallback({
      system,
      messages: [{ role: 'user', content }],
      maxTokens,
      onStream: progress.onStream,
      requestTimeoutMs: AI_IMPORT_REQUEST_TIMEOUT_MS,
      jsonMode: true,
      jsonSchema: IMPORT_JSON_SCHEMA,
      reasoningEffort: 'none',
      temperature: 0,
      minOutputTokens: 2048,
      preferNativeContext: true,
      promptCharsPerToken: 3,
    }, 'PDF image analysis'));
  } finally {
    progress.finish();
  }
  saveImportAIPerf(perfKey, { usage, diagnostics });

  if (truncated) {
    throw new Error('The AI response was cut off before the marker list completed (output limit or context window reached). Increase the model’s context length, or import fewer pages at once.');
  }

  let jsonStr = (response || '').trim();
  jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
  const jsonStart = jsonStr.indexOf('{');
  if (jsonStart > 0) jsonStr = jsonStr.slice(jsonStart);
  const parsed = tryParseJSON(jsonStr);

  const { testType, markers } = normalizeParsedImportMarkers(parsed, {
    markerRef,
    fileName,
    sourceText: '',
    mode: 'image',
  });
  return {
    date: parsed.date || null,
    ...normalizeImportedCollectionContext(parsed),
    testType,
    markers,
    fileName,
    usage: usage || {},
    provider,
    modelId: featureIdentity.modelId,
    diagnostics,
    imageMode: true,
  };
}

export async function handlePDFFile(file, forceImageMode = false, preExtractedText = /** @type {string | null} */ (null)) {
  return handlePDFFileWorkflow(file, forceImageMode, preExtractedText);
}

// ═══════════════════════════════════════════════
// BATCH PDF IMPORT
// ═══════════════════════════════════════════════
async function _processBatchFile(file, ollama, fileNum, totalFiles) {
  const benchmarkStarted = performance.now();
  const benchmarkId = startImportBenchmark({ fileName: file.name, fileSize: file.size, importMode: 'text' });
  const finishBatchBenchmark = (status, patch = {}) => finishImportBenchmark(benchmarkId, status, { totalMs: Math.round(performance.now() - benchmarkStarted), ...patch });
  try {
  await showBatchImportProgress(0, file.name, fileNum, totalFiles);
  const pdfText = await extractPDFText(file);
  updateImportBenchmark(benchmarkId, {
    stage: 'preflight',
    inputChars: pdfText.length,
    pageCount: (pdfText.match(/^=== Page \d+ ===$/gm) || []).length,
  }, { persist: false });
  if (!pdfText.trim()) { finishBatchBenchmark('empty'); showNotification(`${file.name}: PDF appears empty`, 'error'); return 'empty'; }

  // Pre-flight checks — before spending tokens
  await showBatchImportProgress(1, file.name, fileNum, totalFiles);
  const preflight = await runPreflightChecks(pdfText, file.name);
  if (!preflight) { finishBatchBenchmark('cancelled', { stage: 'preflight' }); return 'skipped'; }

  // PII obfuscation
  await showBatchImportProgress(2, file.name, fileNum, totalFiles);
  let textForAI = pdfText;
  let privacyMethod = null;
  let privacyReplacements = 0;
  let privacyOriginal = null;
  let piiTime = 0;
  let piiMs = 0;

  if (ollama.available && isPIIReviewEnabled()) {
    // Streaming mode — modal opens immediately, AI streams into it
    const piiStart = performance.now();
    const reviewResult = await reviewPIIBeforeSend(pdfText, {
      streamFn: (onChunk, signal, onThinking) => sanitizeWithOllamaStreaming(pdfText, onChunk, signal, onThinking)
    });
    piiMs = Math.round(performance.now() - piiStart);
    piiTime = Math.round(piiMs / 1000);
    if (reviewResult === 'cancel') { finishBatchBenchmark('cancelled', { stage: 'privacy' }); return 'skipped'; }
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
    } catch (e) {
      logPrivacyDiagnostic('batch-local-sanitizer-fallback', {
        fileIndex: fileNum,
        totalFiles,
        errorName: getErrorName(e) || 'Error',
      });
      try {
        const r = obfuscatePDFText(pdfText);
        textForAI = r.obfuscated; privacyReplacements = r.replacements; privacyOriginal = r.original;
        privacyMethod = 'regex';
      } catch (e2) {
        showNotification(`${file.name}: Privacy protection failed \u2014 skipped`, 'error');
        finishBatchBenchmark('failed', { stage: 'privacy', error: getErrorMessage(e2) }); return 'pii-fail';
      }
    }
  } else {
    try {
      const r = obfuscatePDFText(pdfText);
      textForAI = r.obfuscated; privacyReplacements = r.replacements; privacyOriginal = r.original;
      privacyMethod = 'regex';
    } catch (e) {
      showNotification(`${file.name}: Privacy protection failed \u2014 skipped`, 'error');
      finishBatchBenchmark('failed', { stage: 'privacy', error: getErrorMessage(e) }); return 'pii-fail';
    }
    if (isPIIReviewEnabled()) {
      const reviewResult = await reviewPIIBeforeSend(pdfText, { obfuscatedText: textForAI });
      if (reviewResult === 'cancel') { finishBatchBenchmark('cancelled', { stage: 'privacy' }); return 'skipped'; }
      textForAI = reviewResult;
    }
  }
  logPrivacyDiagnostic('batch-transform-complete', {
    fileIndex: fileNum,
    totalFiles,
    method: privacyMethod || 'unknown',
    durationMs: piiMs,
    replacements: privacyReplacements,
    inputChars: pdfText.length,
    outputChars: textForAI.length,
  });

  await showBatchImportProgress(3, file.name, fileNum, totalFiles);
  const analysisStart = performance.now();
  const result = await parseLabPDFWithAI(textForAI, file.name, updateImportProgressPct);
  const analysisMs = Math.round(performance.now() - analysisStart);
  const analysisTime = Math.round(analysisMs / 1000);
  logPrivacyDiagnostic('batch-analysis-complete', {
    fileIndex: fileNum,
    totalFiles,
    analysisMs,
  });
  result.privacyMethod = privacyMethod;
  result.privacyReplacements = privacyReplacements;
  result.timings = { pii: piiTime, analysis: analysisTime, piiMs, analysisMs };
  const prov = result.provider || getAIProvider();
  const mid = result.modelId || getActiveModelId();
  const tokens = getUsageTokens(result.usage);
  result.costInfo = {
    provider: prov, modelId: mid,
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    cost: calculateCost(prov, mid, tokens.inputTokens, tokens.outputTokens)
  };
  if (prov !== 'codex-agent') trackUsage(prov, mid, tokens.inputTokens, tokens.outputTokens);
  result.importHash = hashString(pdfText);
  result.benchmarkId = benchmarkId;
  captureImportBenchmarkReviewBaseline(result);
  if (isDebugMode()) { result.privacyOriginal = privacyOriginal; result.privacyObfuscated = textForAI; }
  if (result.markers.length === 0) { finishBatchBenchmark('no-markers', benchmarkResultPatch(result, performance.now() - benchmarkStarted)); showNotification(`${file.name}: No markers found`, 'error'); return 'no-markers'; }
  finishBatchBenchmark('preview', benchmarkResultPatch(result, performance.now() - benchmarkStarted));
  await showBatchImportProgress(4, file.name, fileNum, totalFiles);
  const action = await showImportPreviewAsync(result, fileNum, totalFiles);
  return action === 'skip' ? 'skipped' : 'imported';
  } catch (error) {
    finishBatchBenchmark('failed', { stage: 'analysis', error: getErrorMessage(error) });
    throw error;
  }
}

export async function handleBatchPDFs(pdfFiles) {
  if (!hasAssistantFeatureProvider()) {
    showAINeededDialog('import');
    return;
  }
  setPdfImportBatchMode(true);
  const ollama = await checkOllamaPII();
  let imported = 0, skipped = 0, failed = 0;
  const failedFiles = [];
  for (let i = 0; i < pdfFiles.length; i++) {
    const file = pdfFiles[i];
    try {
      const result = await _processBatchFile(file, ollama, i + 1, pdfFiles.length);
      if (result === 'imported') imported++;
      else if (result === 'skipped') skipped++;
      else if (result === 'empty' || result === 'pii-fail' || result === 'no-markers') failed++;
    } catch (err) {
      logPrivacyDiagnostic('batch-import-failed', {
        fileIndex: i + 1,
        totalFiles: pdfFiles.length,
        errorName: getErrorName(err) || 'Error',
      });
      showNotification(`Error: ${file.name} — ${getErrorMessage(err)}`, 'error');
      failedFiles.push({ file, error: getErrorMessage(err) });
    }
  }
  // Retry failed files once (rate limit / API error recovery)
  let retryImported = 0, retryFailed = 0;
  if (failedFiles.length > 0) {
    showNotification(`Retrying ${failedFiles.length} failed file(s)...`, 'info');
    await new Promise(r => setTimeout(r, 5000));
    for (let i = 0; i < failedFiles.length; i++) {
      const { file } = failedFiles[i];
      try {
        const result = await _processBatchFile(file, ollama, i + 1, failedFiles.length);
        if (result === 'imported') { retryImported++; imported++; }
        else if (result === 'skipped') skipped++;
        else failed++;
      } catch (err) {
        logPrivacyDiagnostic('batch-retry-failed', {
          fileIndex: i + 1,
          totalFiles: failedFiles.length,
          errorName: getErrorName(err) || 'Error',
        });
        retryFailed++;
        failed++;
      }
      if (i < failedFiles.length - 1) await new Promise(r => setTimeout(r, 3000));
    }
  }
  setPdfImportBatchMode(false);
  // Refresh UI once after all files processed
  refreshImportedDataViews();
  hideImportProgress();
  const parts = [];
  if (imported > 0) parts.push(`${imported} imported`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (retryImported > 0) parts.push(`${retryImported} recovered on retry`);
  showNotification(`Batch import complete: ${parts.join(', ')}`, imported > 0 ? 'success' : 'info');
  if (imported > 0) pdfImportDeps.maybeShowEncryptionNudge();
}

// ═══════════════════════════════════════════════
// IMAGE FILE IMPORT (JPG/PNG lab reports)
// ═══════════════════════════════════════════════
export async function handleImageFile(file) {
  return handleImageFileWorkflow(file);
}

// ═══════════════════════════════════════════════
// TEXT FILE IMPORT
// ═══════════════════════════════════════════════
export async function handleTextFile(file) {
  const isXlsx = isXlsxFile(file);
  const isCsv = isCsvTextFile(file);
  let text = '';
  try {
    text = isXlsx ? await extractXLSXText(file) : await file.text();
  } catch (err) {
    const message = getErrorMessage(err, String(err));
    showNotification(isXlsx ? `Could not read Excel workbook: ${message}` : `Could not read text file: ${message}`, 'error');
    return;
  }
  const fileKind = isXlsx ? 'Excel workbook' : isCsv ? 'CSV' : 'Text file';
  if (!text.trim()) { showNotification(`${fileKind} is empty`, "error"); return; }
  if (isCsv && await maybeHandleCycleTextImport(file, text)) return;
  await handlePDFFile(file, false, text);
}
