// pdf-import.js — PDF parsing pipeline, import preview, drop zone, batch import

import { state } from './state.js';
import { MARKER_SCHEMA, SPECIALTY_MARKER_DEFS, calculateCost, formatCost, trackUsage } from './schema.js';
import { IMPORT_STEPS } from './constants.js';
import { escapeHTML, showNotification, isDebugMode, isPIIReviewEnabled, hashString, showPromptDialog } from './utils.js';
import { saveImportedData, recalculateHOMAIR } from './data.js';
import { callClaudeAPI, hasAIProvider, getAIProvider, setAIProvider, setVeniceModel, setOpenRouterModel, getOllamaMainModel, setOllamaMainModel, getVeniceModelDisplay, getOpenRouterModelDisplay, getActiveModelId, getActiveModelDisplay, getOllamaPIIModel, setCustomApiModel, setPpqModel, setRoutstrModel, AI_IMPORT_REQUEST_TIMEOUT_MS } from './api.js';
import { obfuscatePDFText, sanitizeWithOllama, sanitizeWithOllamaStreaming, checkOllamaPII, reviewPIIBeforeSend } from './pii.js';
import { detectProduct, normalizeWithAdapter, getAdapterByTestType } from './adapters.js';
import { getPdfDocument } from './pdfjs-loader.js';
import { getProfileLocation, getActiveProfileId } from './profile.js';
import { clearTombstone, recordTombstone } from './data-merge.js';
import {
  _cleanImportedMarkerDisplayName, _sanitizeAIMarker,
  buildMarkerReference, getExistingImportMarkerKeys,
  normalizeToSI, reconcileImportMarkerMappings,
} from './pdf-import-marker-mapping.js';

export { buildMarkerReference, reconcileImportMarkerMappings } from './pdf-import-marker-mapping.js';

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
  const verb = action === 'image' ? 'Reading lab values from an image' : 'Reading lab values from a PDF';
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
  overlay.classList.add('show');
  const close = () => overlay.classList.remove('show');
  document.getElementById('ai-needed-or').onclick = () => { close(); if (window.startOpenRouterOAuth) window.startOpenRouterOAuth(); };
  document.getElementById('ai-needed-key').onclick = () => { close(); if (window.openSettingsModal) window.openSettingsModal('ai'); };
  document.getElementById('ai-needed-demo').onclick = () => {
    close();
    if (window.loadDemoData) {
      const sex = state.profileSex === 'female' ? 'female' : 'male';
      window.loadDemoData(sex);
    }
  };
  document.getElementById('ai-needed-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  document.getElementById('ai-needed-or').focus();
}

// ═══════════════════════════════════════════════
// PRE-FLIGHT CHECKS (before spending tokens)
// ═══════════════════════════════════════════════
function _showPreflightConfirm(message, confirmLabel = 'Import Anyway') {
  return new Promise(resolve => {
    let overlay = document.getElementById('confirm-dialog-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'confirm-dialog-overlay';
      overlay.className = 'confirm-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<div class="confirm-dialog" role="alertdialog" aria-modal="true">
      <p class="confirm-message">${message}</p>
      <div class="confirm-actions">
        <button class="confirm-btn confirm-btn-cancel" id="confirm-cancel">Cancel</button>
        <button class="confirm-btn confirm-btn-danger" id="confirm-ok">${escapeHTML(confirmLabel)}</button>
      </div></div>`;
    overlay.classList.add('show');
    document.getElementById('confirm-ok').onclick = () => { overlay.classList.remove('show'); resolve(true); };
    document.getElementById('confirm-cancel').onclick = () => { overlay.classList.remove('show'); resolve(false); };
    overlay.onclick = (e) => { if (e.target === overlay) { const d = overlay.querySelector('.confirm-dialog'); if (d) { d.classList.add('modal-nudge'); d.addEventListener('animationend', () => d.classList.remove('modal-nudge'), { once: true }); } } };
  });
}

function checkDuplicateHash(pdfText) {
  const hash = hashString(pdfText);
  for (const e of (state.importedData?.entries || [])) {
    if (e.importHash === hash) return e.date;
  }
  return null;
}

// Normalize model IDs for comparison across providers
// "anthropic/claude-sonnet-4.6" / "claude-sonnet-4-6" / "claude-sonnet-4.6" → "claude-sonnet-4-6"
function normalizeModelId(id) {
  return id.replace(/^[^/]+\//, '').replace(/-\d{8}$/, '').replace(/\./g, '-');
}

function checkModelMismatch() {
  const provider = getAIProvider();
  const currentModel = getActiveModelId();
  // Find the most recent entry with a different model
  const entries = (state.importedData?.entries || []).filter(e => e.importedWith?.modelId);
  if (entries.length === 0) return null;
  const lastEntry = entries[entries.length - 1];
  // Compare normalized IDs to avoid false positives across providers
  if (normalizeModelId(lastEntry.importedWith.modelId) === normalizeModelId(currentModel)) return null;
  return {
    currentModel,
    prevModel: lastEntry.importedWith.modelId,
    prevProvider: lastEntry.importedWith.provider
  };
}

function tryAutoSwitchModel(prevModel, prevProvider) {
  // Try to switch to the previous model/provider combo
  if (prevProvider && prevProvider !== getAIProvider()) {
    setAIProvider(prevProvider);
  }
  const provider = getAIProvider();
  if (provider === 'openrouter') setOpenRouterModel(prevModel);
  else if (provider === 'venice') setVeniceModel(prevModel);
  else if (provider === 'custom') setCustomApiModel(prevModel);
  else if (provider === 'ppq') setPpqModel(prevModel);
  else if (provider === 'routstr') setRoutstrModel(prevModel);
  else if (provider === 'ollama') setOllamaMainModel(prevModel);
}

function _showModelMismatchDialog(mismatch) {
  return new Promise(resolve => {
    let overlay = document.getElementById('confirm-dialog-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'confirm-dialog-overlay';
      overlay.className = 'confirm-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<div class="confirm-dialog" role="alertdialog" aria-modal="true">
      <p class="confirm-message">Previous imports used <strong>${escapeHTML(mismatch.prevModel)}</strong>. Using <strong>${escapeHTML(mismatch.currentModel)}</strong> may cause marker key mismatches and break trend lines.</p>
      <div class="confirm-actions" style="flex-wrap:wrap;gap:8px">
        <button class="confirm-btn confirm-btn-cancel" id="confirm-cancel">Cancel</button>
        <button class="confirm-btn" id="confirm-continue" style="background:var(--yellow);color:#000">Continue Anyway</button>
        <button class="confirm-btn confirm-btn-danger" id="confirm-switch">Switch to ${escapeHTML(mismatch.prevModel.split('/').pop())}</button>
      </div></div>`;
    overlay.classList.add('show');
    document.getElementById('confirm-switch').onclick = () => {
      tryAutoSwitchModel(mismatch.prevModel, mismatch.prevProvider);
      overlay.classList.remove('show');
      resolve('switched');
    };
    document.getElementById('confirm-continue').onclick = () => { overlay.classList.remove('show'); resolve('continue'); };
    document.getElementById('confirm-cancel').onclick = () => { overlay.classList.remove('show'); resolve('cancel'); };
    overlay.onclick = (e) => { if (e.target === overlay) { const d = overlay.querySelector('.confirm-dialog'); if (d) { d.classList.add('modal-nudge'); d.addEventListener('animationend', () => d.classList.remove('modal-nudge'), { once: true }); } } };
  });
}

async function runPreflightChecks(pdfText, fileName) {
  // 1. Duplicate file check (hash-based)
  const dupDate = checkDuplicateHash(pdfText);
  if (dupDate) {
    const dateLabel = new Date(dupDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const proceed = await _showPreflightConfirm(
      `This file was already imported (<strong>${dateLabel}</strong>). Importing again will use tokens and may overwrite existing values.`
    );
    if (!proceed) return false;
  }
  // 2. Model mismatch check
  const mismatch = checkModelMismatch();
  if (mismatch) {
    const result = await _showModelMismatchDialog(mismatch);
    if (result === 'cancel') return false;
    // 'switched' or 'continue' both proceed with import
  }
  // 3. Unsupported specialty test check — cheap AI classify before full analysis
  if (hasAIProvider()) {
    const detected = detectProduct(fileName || '', pdfText);
    if (!detected) {
      const classified = await _classifyTestType(pdfText);
      if (classified && classified.testType !== 'blood') {
        const adapter = getAdapterByTestType(classified.testType);
        if (!adapter) {
          const label = (classified.labName && classified.testType === 'comprehensive')
            ? `${classified.labName} (${classified.testType})`
            : classified.testType;
          const proceed = await _showUnsupportedLabDialog(label);
          if (!proceed) return false;
        }
      }
    }
  }
  return true;
}

/** Cheap AI call to classify test type from first ~2000 chars of PDF text */
async function _classifyTestType(pdfText) {
  const snippet = pdfText.slice(0, 2000);
  try {
    const { text: response } = await callClaudeAPI({
      system: 'You classify lab reports. Respond with ONLY a JSON object, no other text.',
      messages: [{ role: 'user', content: `What type of lab test is this PDF? Look at the header, lab name, and test names.

Respond with ONE of:
- {"testType": "blood"} — standard blood panels: CBC, CMP, BMP, lipid panel, thyroid, hormones, iron studies, liver/kidney panels, vitamins, tumor markers, coagulation, A1C, insulin, PSA. Typically 10–80 markers from a single specimen type.
- {"testType": "OAT"} — Organic Acids Tests (urine)
- {"testType": "fattyAcids"} — fatty acid profiles
- {"testType": "Metabolomix+"} — Genova Metabolomix+
- {"testType": "DUTCH"} — dried urine hormone panels
- {"testType": "HTMA"} — Hair Tissue Mineral Analysis
- {"testType": "GI"} — stool/GI tests
- {"testType": "biostarks", "labName": "BioStarks"} — BioStarks laboratory panels (amino acids + fatty acids + minerals + vitamins + hormones + metabolism from dried blood spot)
- {"testType": "comprehensive", "labName": "HealthierOne"} — comprehensive or functional medicine panels that combine 100+ markers across multiple test types (blood + urine + other), or reports from labs like HealthierOne, Vibrant Wellness, etc. that go far beyond a standard blood panel. Include the lab/product name if identifiable.
- {"testType": "<descriptive name>"} — other specialty tests not listed above

Always include "labName" if you can identify the lab or product name from the text (e.g. "HealthierOne", "Vibrant Wellness", "Diagnostic Solutions", "Genova"). Omit if unclear.

First ~2000 characters of the PDF:
${snippet}` }],
      maxTokens: 80
    });
    const text = (response || '').trim();
    const json = text.match(/\{[^}]*\}/);
    if (!json) return null;
    try {
      const parsed = JSON.parse(json[0]);
      return parsed.testType ? { testType: parsed.testType, labName: parsed.labName || null } : null;
    } catch { }
    const match = text.match(/\{[^}]*"testType"\s*:\s*"([^"]+)"[^}]*\}/);
    return match ? { testType: match[1], labName: null } : null;
  } catch (e) {
    if (isDebugMode()) console.log('[Preflight] Test type classification failed:', e.message);
    return null; // fail open — proceed with import
  }
}

function _showUnsupportedLabDialog(testType) {
  return new Promise(resolve => {
    let overlay = document.getElementById('confirm-dialog-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'confirm-dialog-overlay';
      overlay.className = 'confirm-overlay';
      document.body.appendChild(overlay);
    }
    const displayType = escapeHTML(testType);
    overlay.innerHTML = `<div class="confirm-dialog" role="alertdialog" aria-modal="true" style="max-width:480px">
      <p class="confirm-message" style="margin-bottom:12px">
        <strong>${displayType}</strong> reports like this one aren't fully supported yet. Importing will likely miss markers or map them incorrectly, and the AI costs may not be worth it.
      </p>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;line-height:1.5">
        In the meantime, you can add your markers manually using the <strong>+</strong> button in the sidebar.
        <p style="margin:10px 0 0 0">If you'd like this lab properly supported — <a href="https://github.com/elkimek/get-based/issues" target="_blank" rel="noopener" style="color:var(--accent)">file an issue on GitHub</a>, or ask your lab to reach out.</p>
      </div>
      <div class="confirm-actions">
        <button class="confirm-btn confirm-btn-cancel" id="confirm-cancel">Cancel</button>
        <button class="confirm-btn" id="confirm-ok" style="background:var(--yellow);color:#000">Import Anyway</button>
      </div></div>`;
    overlay.classList.add('show');
    document.getElementById('confirm-ok').onclick = () => { overlay.classList.remove('show'); resolve(true); };
    document.getElementById('confirm-cancel').onclick = () => { overlay.classList.remove('show'); resolve(false); };
    overlay.onclick = (e) => { if (e.target === overlay) { const d = overlay.querySelector('.confirm-dialog'); if (d) { d.classList.add('modal-nudge'); d.addEventListener('animationend', () => d.classList.remove('modal-nudge'), { once: true }); } } };
  });
}

// ═══════════════════════════════════════════════
// AI-POWERED PDF IMPORT
// ═══════════════════════════════════════════════
export async function extractPDFText(file) {
  const arrayBuffer = await readFileArrayBuffer(file);
  const pdf = await getPdfDocument({ data: arrayBuffer });
  let allItems = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    for (const item of textContent.items) {
      if (item.str.trim()) {
        allItems.push({ text: item.str.trim(), x: Math.round(item.transform[4]), y: Math.round(item.transform[5]), page: i });
      }
    }
  }
  // Page-aware row grouping (same logic as old parser — robust geometric approach)
  const sorted = [...allItems].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    const dy = b.y - a.y;
    return Math.abs(dy) > 3 ? dy : a.x - b.x;
  });
  if (sorted.length === 0) return '';
  let text = '';
  let currentPage = sorted[0].page;
  text += `=== Page ${currentPage} ===\n`;
  let currentRow = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].page !== currentPage) {
      text += currentRow.sort((a, b) => a.x - b.x).map(r => r.text).join('  ') + '\n';
      currentPage = sorted[i].page;
      text += `\n=== Page ${currentPage} ===\n`;
      currentRow = [sorted[i]];
    } else if (Math.abs(sorted[i].y - currentRow[0].y) < 3) {
      currentRow.push(sorted[i]);
    } else {
      text += currentRow.sort((a, b) => a.x - b.x).map(r => r.text).join('  ') + '\n';
      currentRow = [sorted[i]];
    }
  }
  if (currentRow.length > 0) {
    text += currentRow.sort((a, b) => a.x - b.x).map(r => r.text).join('  ') + '\n';
  }
  return text;
}

async function readFileArrayBuffer(file) {
  try {
    return await file.arrayBuffer();
  } catch (firstError) {
    if (typeof FileReader === 'undefined') throw firstError;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || firstError);
      reader.onabort = () => reject(firstError);
      reader.readAsArrayBuffer(file);
    });
  }
}

function isAIStreamAbortError(err) {
  const message = String(err?.message || err || '').toLowerCase();
  const name = String(err?.name || '').toLowerCase();
  return message.includes('bodystreambuffer was aborted')
    || message.includes('aborted by user')
    || (message.includes('body') && message.includes('stream') && message.includes('abort'))
    || name === 'aborterror';
}

async function callImportAIWithStreamFallback(request, label) {
  try {
    return await callClaudeAPI(request);
  } catch (err) {
    if (!request.onStream || request.signal?.aborted || !isAIStreamAbortError(err)) throw err;
    if (isDebugMode()) console.warn(`[Import] ${label} stream aborted; retrying without streaming`, err);
    try {
      return await callClaudeAPI({ ...request, onStream: undefined, forceNonStream: true, requestTimeoutMs: AI_IMPORT_REQUEST_TIMEOUT_MS });
    } catch (retryErr) {
      if (isAIStreamAbortError(retryErr)) {
        throw new Error('AI analysis request was aborted after retrying without streaming. The PDF text extracted correctly; try another model/provider if this persists.');
      }
      throw retryErr;
    }
  }
}

function formatImportError(err) {
  if (isAIStreamAbortError(err)) {
    return 'AI analysis request was interrupted after privacy review. Try again, or switch provider/model if it repeats.';
  }
  return err?.message || String(err);
}

export function tryParseJSON(str) {
  try { return JSON.parse(str); } catch {}
  // Try trimming to last complete object (handles truncated output)
  const lastBrace = str.lastIndexOf('}');
  if (lastBrace > 0 && lastBrace < str.length - 1) {
    try { return JSON.parse(str.slice(0, lastBrace + 1)); } catch {}
  }
  // Attempt to repair truncated JSON from local models
  let s = str;
  // Close any unterminated string
  const quotes = (s.match(/"/g) || []).length;
  if (quotes % 2 !== 0) s += '"';
  // Try closing open arrays and objects
  const opens = { '{': 0, '[': 0 };
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"' && (i === 0 || s[i - 1] !== '\\')) { inString = !inString; continue; }
    if (inString) continue;
    if (s[i] === '{') opens['{']++;
    if (s[i] === '}') opens['{']--;
    if (s[i] === '[') opens['[']++;
    if (s[i] === ']') opens['[']--;
  }
  // Remove trailing comma before closing
  s = s.replace(/,\s*$/, '');
  // Close unclosed brackets/braces
  for (let i = 0; i < opens['[']; i++) s += ']';
  for (let i = 0; i < opens['{']; i++) s += '}';
  try {
    const result = JSON.parse(s);
    if (isDebugMode()) console.log('[PDF Parse] Repaired truncated JSON from model');
    return result;
  } catch (e2) {
    throw new Error(`Model returned invalid JSON that could not be repaired. Try a more capable model.`);
  }
}

export async function parseLabPDFWithAI(pdfText, fileName, onProgress) {
  const markerRef = buildMarkerReference();
  const country = (getProfileLocation(getActiveProfileId())?.country || '').trim();
  const dateHint = country
    ? `   IMPORTANT — the user's region is ${country}. Disambiguate ambiguous numeric dates like "12/7/2025" using the format common to that region (US, Philippines = MM/DD/YYYY; UK, EU, India, Australia, most of Canada = DD/MM/YYYY). Do not assume MM/DD by default.`
    : `   IMPORTANT — for ambiguous numeric dates like "12/7/2025", look for context (other dates, a printed format like "DD/MM/YYYY" in the report header, or month names elsewhere) before deciding. Do not assume MM/DD by default — most of the world uses DD/MM/YYYY.`;
  const system = `You are a lab report data extraction assistant. You extract biomarker results from lab report text and map them to a known set of marker keys.

Here is the complete list of known markers with their keys, expected units, and reference ranges:
${JSON.stringify(markerRef)}

Your task:
1. Find the sample collection date in the text. Return it as YYYY-MM-DD. Look for dates near keywords like "collection", "collected", "date", "odběr", "datum", or similar in any language.
${dateHint}
2. For each biomarker result found in the text, extract:
   - rawName: the test name exactly as it appears in the PDF
   - value: the numeric result (parse comma as decimal point). For "< X" or "> X" results, use X as the value (the detection limit) — these are still clinically meaningful for trend tracking
   - mappedKey: the matching key from the known markers list (e.g. "biochemistry.glucose"), or null if no match
   - unit: the unit as shown in the PDF
   - refMin: the lower reference range bound EXACTLY as printed on the PDF (number or null). Do NOT copy from the known markers list above — extract from the actual PDF text
   - refMax: the upper reference range bound EXACTLY as printed on the PDF (number or null). Do NOT copy from the known markers list above — extract from the actual PDF text
3. Match based on medical/biochemical equivalence, not just string similarity. For example:
   - "Glukóza" → "biochemistry.glucose" (Czech for glucose)
   - "BUN" or "Blood Urea Nitrogen" → "biochemistry.urea"
   - "Triacylglyceroly" → "lipids.triglycerides"
   - "Trombokrit" / "Plateletcrit" / "PCT" (hematology) → "hematology.pct"
   - CRP: "hs-CRP" / "hsCRP" / "high-sensitivity CRP" / "vysoce senzitivní CRP" → "proteins.hsCRP". Plain "CRP" / "S-CRP" / "C-reaktívny proteín" → "proteins.crp". These are different assays — do not merge them
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
   - Or a descriptive name for other specialty tests
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
  "markers": [
    {"rawName": "Test Name", "value": 5.23, "mappedKey": "category.marker", "unit": "mg/dL", "refMin": 70, "refMax": 100},
    {"rawName": "Unknown Test", "value": 1.0, "mappedKey": null, "suggestedKey": "oatMicrobial.someMarker", "suggestedName": "Some Marker", "suggestedCategoryLabel": "Microbial Overgrowth", "suggestedGroup": "OAT", "unit": "mg/l", "refMin": 0.5, "refMax": 3.0},
    {"rawName": "EPA C20:5", "value": 0.46, "mappedKey": null, "suggestedKey": "omegaquantFA.epaC20_5", "suggestedName": "EPA C20:5", "suggestedCategoryLabel": "OmegaQuant", "suggestedGroup": "Fatty Acids", "unit": "%", "refMin": null, "refMax": null}
  ]
}`;

  const provider = getAIProvider();
  const maxTokens = 32768;
  // Stream AI response to report real-time progress during analysis (15% → 90%)
  let onStream;
  if (onProgress) {
    let lastPct = -1;
    onStream = (text) => {
      const pct = Math.min(15 + Math.round((text.length / (maxTokens * 3)) * 75), 90);
      if (pct !== lastPct) { lastPct = pct; onProgress(pct); }
    };
  }
  // Include previously imported marker keys so the AI reuses consistent mappings
  const existingKeys = getExistingImportMarkerKeys();
  const existingKeysNote = existingKeys.size > 0
    ? `\n\nIMPORTANT — These marker keys were used in previous imports for this profile. Reuse them for the same biomarkers to ensure consistency:\n${[...existingKeys].join(', ')}`
    : '';

  const { text: response, usage } = await callImportAIWithStreamFallback({
    system: system + existingKeysNote,
    messages: [{ role: 'user', content: `Extract all biomarker results from this lab report${fileName ? ' (file: ' + fileName + ')' : ''}:\n\n${pdfText}` }],
    maxTokens,
    onStream,
    requestTimeoutMs: AI_IMPORT_REQUEST_TIMEOUT_MS
  }, 'PDF text analysis');

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

  // Sanitize AI-supplied keys at the boundary, before any adapter or guard
  // logic runs. Downstream code constructs new keys from the cleaned halves.
  if (Array.isArray(parsed.markers)) parsed.markers.forEach(_sanitizeAIMarker);

  let testType = parsed.testType || 'blood';
  // ── Adapter-based normalization (fatty acids, Metabolomix+, future specialty labs) ──
  // Run adapter normalization when: product detected AND not plain blood, AI says fattyAcids, or testType has a registered adapter
  const detected = detectProduct(fileName, pdfText);
  const adapterForTestType = !detected && testType !== 'blood' ? getAdapterByTestType(testType) : null;
  const needsAdapterNormalize = testType === 'fattyAcids' || (!!detected && testType !== 'blood') || !!adapterForTestType;
  if (needsAdapterNormalize && parsed.markers?.length) {
    const adapter = detected?.adapter || adapterForTestType || getAdapterByTestType('fattyAcids');
    normalizeWithAdapter(adapter, parsed.markers, fileName, pdfText, detected?.product);
    if (isDebugMode()) console.log(`[Import] Adapter ${adapter?.id || 'fattyAcids'} normalized ${parsed.markers.length} markers (testType=${testType})`);
  }
  const standardCats = new Set(Object.keys(MARKER_SCHEMA));
  const _specialtyTypes = ['OAT', 'fattyAcids', 'Metabolomix+', 'DUTCH', 'HTMA', 'GI'];
  const markers = (parsed.markers || []).map(m => {
      let mappedKey = m.mappedKey || null;
      let matched = !!mappedKey;
      // Guard: never allow standard blood work mappings for known specialty tests
      // Only fire for well-defined specialty types — not for mixed/comprehensive reports
      if (matched && _specialtyTypes.includes(testType)) {
        const catKey = mappedKey.split('.')[0];
        if (standardCats.has(catKey)) {
          if (isDebugMode()) console.log(`[Import Guard] Demoted ${mappedKey} — standard category in ${testType} test`);
          // Check if a specialty equivalent exists by marker name AND matching test type group
          const markerPart = mappedKey.split('.')[1];
          const specialtyMatch = Object.keys(SPECIALTY_MARKER_DEFS).find(k => {
            if (k.split('.')[1] !== markerPart || standardCats.has(k.split('.')[0])) return false;
            const sDef = SPECIALTY_MARKER_DEFS[k];
            return sDef.group === testType || sDef.group?.toLowerCase() === testType.toLowerCase();
          });
          if (specialtyMatch) {
            const sDef = SPECIALTY_MARKER_DEFS[specialtyMatch];
            m.suggestedKey = specialtyMatch;
            m.suggestedName = sDef.name;
            m.suggestedCategoryLabel = sDef.categoryLabel;
            m.suggestedGroup = m.suggestedGroup || sDef.group || testType;
          } else if (!m.suggestedKey) {
            const prefix = testType.toLowerCase().replace(/[^a-z]/g, '');
            const originalCat = MARKER_SCHEMA[catKey];
            const catSuffix = catKey.charAt(0).toUpperCase() + catKey.slice(1);
            m.suggestedKey = `${prefix}${catSuffix}.${markerPart}`;
            m.suggestedName = m.suggestedName || (originalCat?.markers?.[markerPart]?.name) || m.rawName;
            m.suggestedCategoryLabel = m.suggestedCategoryLabel || (originalCat?.label) || catSuffix;
            m.suggestedGroup = m.suggestedGroup || testType;
          }
          mappedKey = null;
          matched = false;
        }
      }
      // Guard: even for blood testType, remap to specialty key if adapter detected a product
      // This catches AI misidentifying specialty tests as blood
      if (matched && testType === 'blood' && detected) {
        const catKey = mappedKey.split('.')[0];
        if (standardCats.has(catKey)) {
          const markerPart = mappedKey.split('.')[1];
          // Only match specialty markers whose group aligns with the detected adapter
          const adapterGroup = detected.adapter?.id === 'oat' ? 'OAT' : detected.adapter?.id === 'fattyAcids' ? 'Fatty Acids' : null;
          const specialtyMatch = adapterGroup && Object.keys(SPECIALTY_MARKER_DEFS).find(k => {
            if (k.split('.')[1] !== markerPart || standardCats.has(k.split('.')[0])) return false;
            return SPECIALTY_MARKER_DEFS[k].group === adapterGroup;
          });
          if (specialtyMatch) {
            const sDef = SPECIALTY_MARKER_DEFS[specialtyMatch];
            if (isDebugMode()) console.log(`[Import Guard] Remapped ${mappedKey} → ${specialtyMatch} (adapter detected)`);
            m.suggestedKey = specialtyMatch;
            m.suggestedName = sDef.name;
            m.suggestedCategoryLabel = sDef.categoryLabel;
            m.suggestedGroup = sDef.group || testType;
            mappedKey = null;
            matched = false;
          }
        }
      }
      // Guard: also rewrite suggestedKey if AI used a standard category for specialty test
      if (!matched && m.suggestedKey && testType !== 'blood') {
        const sugCat = m.suggestedKey.split('.')[0];
        if (standardCats.has(sugCat)) {
          const markerPart = m.suggestedKey.split('.')[1] || m.rawName.replace(/[^a-zA-Z0-9]/g, '');
          const prefix = testType.toLowerCase().replace(/[^a-z]/g, '');
          const catSuffix = sugCat.charAt(0).toUpperCase() + sugCat.slice(1);
          if (isDebugMode()) console.log(`[Import Guard] Rewrote suggestedKey ${m.suggestedKey} → ${prefix}${catSuffix}.${markerPart}`);
          m.suggestedKey = `${prefix}${catSuffix}.${markerPart}`;
          m.suggestedCategoryLabel = m.suggestedCategoryLabel || MARKER_SCHEMA[sugCat]?.label || catSuffix;
          m.suggestedGroup = testType;
        }
      }
      return {
        rawName: m.rawName,
        value: typeof m.value === 'number' ? m.value : parseFloat(String(m.value).replace(',', '.')),
        mappedKey,
        matched,
        suggestedKey: m.suggestedKey || null,
        suggestedName: m.suggestedName || null,
        suggestedCategoryLabel: m.suggestedCategoryLabel || null,
        unit: m.unit || null,
        refMin: m.refMin != null ? m.refMin : null,
        refMax: m.refMax != null ? m.refMax : null,
        group: m.suggestedGroup || m.group || (testType !== 'blood' ? testType : null) || null
      };
    }).filter(m => !isNaN(m.value));
  reconcileImportMarkerMappings(markers, { testType, refLookup: markerRef, existingKeys });
  return {
    date: parsed.date || null,
    testType,
    markers,
    fileName,
    usage,
    provider
  };
}

// ═══════════════════════════════════════════════
// IMPORT PREVIEW & CONFIRM
// ═══════════════════════════════════════════════
export function showImportPreview(parseResult) {
  const { date, markers, fileName } = parseResult;
  const modal = document.getElementById("import-modal");
  const overlay = document.getElementById("import-modal-overlay");
  const matched = markers.filter(m => m.matched);
  const newMarkers = markers.filter(m => !m.matched && m.suggestedKey);
  const unmatched = markers.filter(m => !m.matched && !m.suggestedKey);
  const importCount = matched.length + newMarkers.length;
  const batchCtx = window._batchImportContext;
  const batchLabel = batchCtx ? `File ${batchCtx.current} of ${batchCtx.total}` : 'Lab import';
  modal.className = 'modal import-preview-modal';
  let html = `<div class="gb-modal-head import-preview-head">
    <div>
      <div class="gb-modal-kicker">${escapeHTML(batchLabel)}</div>
      <div class="gb-modal-title">Review &amp; Edit Import</div>
    </div>
    <button type="button" class="modal-close" onclick="closeImportModal()" aria-label="Close import review">&times;</button>
  </div>
  <div class="gb-form-body import-review-body">
    <div class="import-review-summary">
      <div class="import-review-file">
        <span class="import-review-label">File</span>
        <strong>${escapeHTML(fileName)}</strong>
      </div>
      <div class="import-review-file">
        <span class="import-review-label">Collection date</span>
        <input type="date" id="import-manual-date" value="${escapeHTML(date || '')}" onchange="applyManualImportDate(this.value)" aria-label="Collection date">
      </div>
      <div class="import-review-stats" aria-label="Import mapping summary">
        <span class="import-review-stat import-review-stat-matched"><strong>${matched.length}</strong> matched</span>
        <span class="import-review-stat import-review-stat-new"><strong>${newMarkers.length}</strong> new</span>
        <span class="import-review-stat import-review-stat-unmatched"><strong>${unmatched.length}</strong> unmatched</span>
      </div>
    </div>`;
  // Quality warning — high unmatched ratio suggests unsupported lab
  const unmatchedRatio = markers.length > 0 ? unmatched.length / markers.length : 0;
  if (unmatchedRatio > 0.4 && unmatched.length > 10) {
    html += `<div class="import-review-warning">
      A large portion of markers couldn't be mapped. This lab report may not be well supported yet — review the results below carefully before importing.
      You can <a href="https://github.com/elkimek/get-based/issues" target="_blank" rel="noopener">request support</a> for this lab on GitHub.</div>`;
  }
  if (!date) {
    html += `<div class="import-review-warning import-review-date-warning">
      Could not extract collection date from PDF. Please set it above before importing.</div>`;
  }
  // Build reference lookup (used for unmatched dropdown + range comparison)
  const refLookup = buildMarkerReference();
  const allKeys = Object.entries(refLookup).map(([key, def]) => ({ key, name: def.name }));
  allKeys.sort((a, b) => a.name.localeCompare(b.name));
  const optionsHtml = allKeys.map(k => {
    const label = `${k.name} (${k.key})`;
    return `<option value="${escapeHTML(k.key)}" label="${escapeHTML(label)}"></option>`;
  }).join('');

  html += `<div class="import-review-controls">
    <div class="import-filter-group" role="group" aria-label="Filter import rows">
      <button type="button" class="import-filter-btn active" data-filter="all" onclick="setImportReviewFilter(this)">All</button>
      <button type="button" class="import-filter-btn" data-filter="matched" onclick="setImportReviewFilter(this)">Matched</button>
      <button type="button" class="import-filter-btn" data-filter="new" onclick="setImportReviewFilter(this)">New</button>
      <button type="button" class="import-filter-btn" data-filter="unmatched" onclick="setImportReviewFilter(this)">Unmatched</button>
      <button type="button" class="import-filter-btn" data-filter="excluded" onclick="setImportReviewFilter(this)">Excluded</button>
    </div>
    <label class="import-review-search-wrap">
      <span class="sr-only">Search import rows</span>
      <input type="search" id="import-review-search" class="import-review-search" placeholder="Search markers" oninput="applyImportReviewFilters()" autocomplete="off">
    </label>
    <span class="import-visible-count" id="import-visible-count" aria-live="polite"></span>
  </div>`;

  html += `<div class="import-table-wrap"><table class="import-table"><thead><tr><th>Status</th><th>Test Name</th><th>Value</th><th>Lab Range</th><th>Maps To</th><th>Action</th></tr></thead><tbody>`;
  for (const m of matched) {
    const origIdx = markers.indexOf(m);
    const labRange = (m.refMin != null || m.refMax != null) ? `${m.refMin ?? '?'}\u2013${m.refMax ?? '?'}` : '';
    html += `<tr data-import-idx="${origIdx}" data-import-status="matched">
      <td class="import-status-cell matched" data-label="Status"><span class="import-status-pill">Matched</span></td>
      <td class="import-name-cell" data-label="Test name">${escapeHTML(m.rawName)}</td>
      <td data-label="Value">${escapeHTML(String(m.value))}</td>
      <td class="import-range-cell" data-label="Lab range">${escapeHTML(labRange || '—')}</td>
      <td class="import-map-cell" data-label="Maps to">${escapeHTML(m.mappedKey)}</td>
      <td class="import-row-action" data-label="Action"><button type="button" class="import-exclude-btn" onclick="toggleImportRow(this)" title="Exclude from import" aria-label="Exclude ${escapeHTML(m.rawName)} from import">Exclude</button></td>
    </tr>`;
  }
  for (const m of newMarkers) {
    const origIdx = markers.indexOf(m);
    const labRange = (m.refMin != null || m.refMax != null) ? `${m.refMin ?? '?'}\u2013${m.refMax ?? '?'}` : '';
    html += `<tr data-import-idx="${origIdx}" data-import-status="new">
      <td class="import-status-cell new-marker" data-label="Status"><span class="import-status-pill">New</span></td>
      <td class="import-name-cell" data-label="Test name">${escapeHTML(m.rawName)}</td>
      <td data-label="Value">${escapeHTML(String(m.value))}</td>
      <td class="import-range-cell" data-label="Lab range">${escapeHTML(labRange || '—')}</td>
      <td class="import-map-cell" data-label="Maps to">${escapeHTML(m.suggestedKey)}</td>
      <td class="import-row-action" data-label="Action"><button type="button" class="import-exclude-btn" onclick="toggleImportRow(this)" title="Exclude from import" aria-label="Exclude ${escapeHTML(m.rawName)} from import">Exclude</button></td>
    </tr>`;
  }
  if (unmatched.length > 0) {
    for (const m of unmatched) {
      const origIdx = markers.indexOf(m);
      const labRange = (m.refMin != null || m.refMax != null) ? `${m.refMin ?? '?'}\u2013${m.refMax ?? '?'}` : '';
      html += `<tr data-import-idx="${origIdx}" data-import-status="unmatched">
        <td class="import-status-cell unmatched" data-label="Status"><span class="import-status-pill">Unmatched</span></td>
        <td class="import-name-cell" data-label="Test name">${escapeHTML(m.rawName)}</td>
        <td data-label="Value">${escapeHTML(String(m.value))}</td>
        <td class="import-range-cell" data-label="Lab range">${escapeHTML(labRange || '—')}</td>
        <td class="import-map-cell" data-label="Maps to">
          <input type="text" class="import-map-input" list="import-marker-options" data-marker-idx="${origIdx}" onchange="mapUnmatchedMarkerInput(this)" placeholder="Search marker" autocomplete="off" aria-label="Map ${escapeHTML(m.rawName)} to an existing marker">
        </td>
        <td class="import-row-action" data-label="Action"><span class="import-skip-note">Skipped unless mapped</span></td>
      </tr>`;
    }
  }
  html += `</tbody></table></div>`;
  if (unmatched.length > 0) {
    html += `<datalist id="import-marker-options">${optionsHtml}</datalist>`;
  }

  // Reference range adoption toggle — count matched markers where PDF ranges differ from current
  let rangesDiffCount = 0;
  for (const m of matched) {
    if (m.refMin == null && m.refMax == null) continue;
    const schemaRef = refLookup[m.mappedKey];
    if (!schemaRef) continue;
    // Normalize PDF ranges to SI for accurate comparison against schema
    const siMin = m.refMin != null ? normalizeToSI(m.mappedKey, m.refMin, m.unit) : null;
    const siMax = m.refMax != null ? normalizeToSI(m.mappedKey, m.refMax, m.unit) : null;
    if ((siMin !== schemaRef.refMin && !(siMin != null && schemaRef.refMin != null && Math.abs(siMin - schemaRef.refMin) < 0.001)) ||
        (siMax !== schemaRef.refMax && !(siMax != null && schemaRef.refMax != null && Math.abs(siMax - schemaRef.refMax) < 0.001))) {
      rangesDiffCount++;
    }
  }
  if (rangesDiffCount > 0) {
    html += `<label class="import-range-option">
      <input type="checkbox" id="import-adopt-ranges">
      <span><strong>Update reference ranges from this report</strong><small>${rangesDiffCount} marker${rangesDiffCount !== 1 ? 's' : ''} differ from the current ranges. Leave off unless you want this lab's ranges to become the active reference.</small></span></label>`;
  }

  // Privacy notice
  if (parseResult.privacyMethod?.startsWith('ollama')) {
    html += `<div class="privacy-notice privacy-notice-success">&#128274; Personal information scrubbed by local AI${parseResult.privacyMethod === 'ollama+review' ? ' (reviewed)' : ''}</div>`;
  } else if (parseResult.privacyMethod === 'regex') {
    html += `<div class="privacy-notice privacy-notice-warning">&#128274; ${parseResult.privacyReplacements} personal detail${parseResult.privacyReplacements !== 1 ? 's' : ''} replaced with fake data`;
    html += `<span class="privacy-notice-detail">Set up Local AI in Settings for comprehensive language-aware protection</span></div>`;
  }
  // Cost info (always visible)
  if (parseResult.costInfo) {
    const ci = parseResult.costInfo;
    const totalTokens = (ci.inputTokens || 0) + (ci.outputTokens || 0);
    const modelLabel = ci.provider === 'ollama' ? getOllamaMainModel() : ci.provider === 'venice' ? getVeniceModelDisplay() : ci.provider === 'openrouter' ? getOpenRouterModelDisplay() : getActiveModelDisplay();
    html += `<div class="import-cost-note">\ud83d\udcca ${escapeHTML(modelLabel)} \u00b7 ${totalTokens.toLocaleString()} tokens \u00b7 ${formatCost(ci.cost)}</div>`;
  }
  // Debug: timings and diff button
  if (isDebugMode()) {
    const t = parseResult.timings;
    if (t) {
      const piiLabel = parseResult.privacyMethod?.startsWith('ollama') ? `PII: ${t.pii}s (${getOllamaPIIModel()})` : `PII: regex`;
      const provider = getAIProvider();
      const modelLabel = provider === 'ollama' ? getOllamaMainModel() : provider === 'venice' ? getVeniceModelDisplay() : provider === 'openrouter' ? getOpenRouterModelDisplay() : getActiveModelDisplay();
      html += `<div class="import-debug-note">&#9202; ${piiLabel} &nbsp;|&nbsp; Analysis: ${t.analysis}s (${modelLabel})</div>`;
    }
    if (parseResult.privacyOriginal && parseResult.privacyObfuscated) {
      html += `<button type="button" class="import-btn import-btn-secondary import-privacy-details-btn" onclick="showPIIDiffViewer(window._pendingImport.privacyOriginal, window._pendingImport.privacyObfuscated)">&#128269; View privacy details</button>`;
    }
  }

  const cancelLabel = batchCtx ? 'Skip' : 'Cancel';
  const importDisabled = !date ? ' disabled' : '';
  html += `</div>
    <div class="import-review-actions">
      <button type="button" class="import-btn import-btn-secondary" onclick="closeImportModal()">${cancelLabel}</button>
      <button type="button" class="import-btn import-btn-primary" id="import-confirm-btn" onclick="confirmImport()"${importDisabled}>Import ${importCount} Marker${importCount !== 1 ? 's' : ''}</button>
    </div>`;
  if (!parseResult._importProfileId) parseResult._importProfileId = state.currentProfile;
  window._pendingImport = parseResult;
  window._pendingImportRefLookup = refLookup;
  modal.innerHTML = html;
  overlay.classList.add("show");
  applyImportReviewFilters();
}

export function mapUnmatchedMarker(selectEl) {
  applyImportMarkerMapping(selectEl, selectEl.value || '');
}

export function mapUnmatchedMarkerInput(inputEl) {
  const raw = inputEl.value.trim();
  const key = resolveImportMarkerKey(raw);
  if (raw && !key) {
    inputEl.value = '';
    showNotification('Choose a marker from the list', 'error');
    applyImportMarkerMapping(inputEl, '');
    return;
  }
  inputEl.value = key || '';
  applyImportMarkerMapping(inputEl, key || '');
}

function resolveImportMarkerKey(raw) {
  if (!raw) return '';
  const refLookup = window._pendingImportRefLookup || buildMarkerReference();
  if (refLookup[raw]) return raw;
  const normalized = raw.toLowerCase();
  for (const [key, def] of Object.entries(refLookup)) {
    const name = String(def.name || '').toLowerCase();
    if (key.toLowerCase() === normalized || name === normalized || `${name} (${key.toLowerCase()})` === normalized) {
      return key;
    }
  }
  return '';
}

function applyImportMarkerMapping(controlEl, key) {
  const result = window._pendingImport;
  if (!result) return;
  const idx = parseInt(controlEl.dataset.markerIdx, 10);
  const marker = result.markers[idx];
  if (!marker) return;
  marker.mappedKey = key || null;
  marker.matched = !!key;
  const row = controlEl.closest('tr');
  if (row) {
    const statusCell = row.querySelector('td:first-child');
    const actionCell = row.querySelector('.import-row-action');
    if (key) {
      row.dataset.importStatus = 'matched';
      if (statusCell) {
        statusCell.className = 'import-status-cell matched';
        statusCell.innerHTML = '<span class="import-status-pill">Matched</span>';
      }
      if (actionCell && !actionCell.querySelector('.import-exclude-btn')) {
        actionCell.innerHTML = '<button type="button" class="import-exclude-btn" onclick="toggleImportRow(this)" title="Exclude from import" aria-label="Exclude from import">Exclude</button>';
      }
    } else {
      row.dataset.importStatus = 'unmatched';
      row.classList.remove('import-excluded');
      if (statusCell) {
        statusCell.className = 'import-status-cell unmatched';
        statusCell.innerHTML = '<span class="import-status-pill">Unmatched</span>';
      }
      if (actionCell) actionCell.innerHTML = '<span class="import-skip-note">Skipped unless mapped</span>';
    }
  }
  updateImportConfirmCount();
  applyImportReviewFilters();
}

function updateImportConfirmCount() {
  const result = window._pendingImport;
  if (!result) return;
  const excludedIdxs = _getExcludedIndices();
  const importCount = result.markers.filter((m, i) => (m.matched || (!m.matched && m.suggestedKey)) && !excludedIdxs.has(i)).length;
  const btn = document.getElementById('import-confirm-btn');
  if (btn) btn.textContent = `Import ${importCount} Marker${importCount !== 1 ? 's' : ''}`;
}

export function setImportReviewFilter(btn) {
  const group = btn.closest('.import-filter-group');
  if (group) {
    for (const item of group.querySelectorAll('.import-filter-btn')) item.classList.toggle('active', item === btn);
  }
  applyImportReviewFilters();
}

export function applyImportReviewFilters() {
  const rows = Array.from(document.querySelectorAll('.import-table tbody tr[data-import-idx]'));
  if (rows.length === 0) return;
  const activeFilter = document.querySelector('.import-filter-btn.active')?.dataset.filter || 'all';
  const query = (document.getElementById('import-review-search')?.value || '').trim().toLowerCase();
  let visible = 0;
  for (const row of rows) {
    const status = row.classList.contains('import-excluded') ? 'excluded' : (row.dataset.importStatus || '');
    const filterMatch = activeFilter === 'all' || activeFilter === status;
    const controlText = Array.from(row.querySelectorAll('input, select')).map(el => el.value).join(' ');
    const searchMatch = !query || `${row.textContent} ${controlText}`.toLowerCase().includes(query);
    const shouldShow = filterMatch && searchMatch;
    row.hidden = !shouldShow;
    if (shouldShow) visible++;
  }
  const count = document.getElementById('import-visible-count');
  if (count) count.textContent = `${visible}/${rows.length} shown`;
}

export function applyManualImportDate(dateStr) {
  const btn = document.getElementById('import-confirm-btn');
  if (!window._pendingImport) return;
  const nextDate = (dateStr || '').trim();
  window._pendingImport.date = nextDate;
  if (btn) {
    btn.disabled = !nextDate;
    btn.style.opacity = '';
    btn.style.cursor = '';
  }
}

export function toggleImportRow(btn) {
  const row = btn.closest('tr');
  if (!row) return;
  const excluded = row.classList.toggle('import-excluded');
  btn.textContent = excluded ? 'Include' : 'Exclude';
  btn.title = excluded ? 'Include in import' : 'Exclude from import';
  btn.setAttribute('aria-label', btn.title);
  updateImportConfirmCount();
  applyImportReviewFilters();
}

function _getExcludedIndices() {
  const excluded = new Set();
  for (const row of document.querySelectorAll('.import-table tr.import-excluded[data-import-idx]')) {
    excluded.add(parseInt(row.dataset.importIdx, 10));
  }
  return excluded;
}

export function closeImportModal() {
  document.getElementById("import-modal-overlay").classList.remove("show");
  window._pendingImport = null;
  window._pendingImportRefLookup = null;
  // Restore batch progress visibility for the next file
  const dropZone = document.getElementById("drop-zone");
  if (dropZone) dropZone.style.display = '';
  if (window._batchImportResolve) {
    const resolve = window._batchImportResolve;
    window._batchImportResolve = null;
    window._batchImportContext = null;
    resolve('skip');
  }
}

function snapshotImportedData() {
  try { return JSON.stringify(state.importedData || {}); } catch { return null; }
}

function restoreImportedDataSnapshot(snapshot) {
  if (!snapshot) return;
  try { state.importedData = JSON.parse(snapshot); } catch {}
}

function isValidISOCalendarDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export async function confirmImport() {
  const result = window._pendingImport;
  if (!result || !result.date) return;
  const confirmBtn = document.getElementById('import-confirm-btn');
  if (confirmBtn) confirmBtn.disabled = true;
  // Guard: if profile changed during async import, abort to prevent saving to wrong profile
  if (result._importProfileId && result._importProfileId !== state.currentProfile) {
    showNotification('Profile changed during import — import cancelled for safety.', 'error');
    window.closeImportModal();
    return;
  }
  const rollback = snapshotImportedData();
  const excludedIdxs = _getExcludedIndices();
  const matched = result.markers.filter((m, i) => m.matched && !excludedIdxs.has(i));
  const newMarkers = result.markers.filter((m, i) => !m.matched && m.suggestedKey && !excludedIdxs.has(i));
  const importCount = matched.length + newMarkers.length;
  if (importCount === 0) {
    showNotification("No markers to import", "error");
    if (confirmBtn) confirmBtn.disabled = false;
    window.closeImportModal();
    return;
  }
  if (!state.importedData.entries) state.importedData.entries = [];
  clearTombstone(state.importedData, 'entries', result.date);
  let entry = state.importedData.entries.find(e => e.date === result.date);
  if (!entry) {
    entry = { date: result.date, markers: {} };
    state.importedData.entries.push(entry);
  }
  entry.importedWith = {
    provider: result.costInfo?.provider || null,
    modelId: result.costInfo?.modelId || null
  };
  if (result.importHash) entry.importHash = result.importHash;
  if (result.fileName) {
    if (!entry.sourceFiles) entry.sourceFiles = entry.sourceFile ? [entry.sourceFile] : [];
    if (!entry.sourceFiles.includes(result.fileName)) entry.sourceFiles.push(result.fileName);
    entry.sourceFile = result.fileName; // backwards compat
  }
  if (!entry.markerSources) entry.markerSources = {};
  const importTs = Date.now();
  entry.updatedAt = importTs;
  for (const m of matched) {
    entry.markers[m.mappedKey] = normalizeToSI(m.mappedKey, m.value, m.unit);
    entry.markerSources[m.mappedKey] = { file: result.fileName || null, at: importTs };
  }
  // For non-blood imports, testType is the authoritative sidebar group for all markers
  const importGroup = (result.testType && result.testType !== 'blood')
    ? (result.testType === 'fattyAcids' ? 'Fatty Acids' : result.testType)
    : null;
  // Auto-create custom markers for matched specialty keys (uses PDF's reference ranges)
  if (!state.importedData.customMarkers) state.importedData.customMarkers = {};
  for (const m of matched) {
    if (SPECIALTY_MARKER_DEFS[m.mappedKey]) {
      const def = SPECIALTY_MARKER_DEFS[m.mappedKey];
      const existing = state.importedData.customMarkers[m.mappedKey];
      const cmDef = existing || {};
      cmDef.name = cmDef.name || def.name;
      cmDef.unit = m.unit || cmDef.unit || def.unit;
      cmDef.refMin = m.refMin != null ? m.refMin : (cmDef.refMin != null ? cmDef.refMin : def.refMin);
      cmDef.refMax = m.refMax != null ? m.refMax : (cmDef.refMax != null ? cmDef.refMax : def.refMax);
      cmDef.icon = cmDef.icon || def.icon;
      if (def.singlePoint) cmDef.singlePoint = true;
      // Always update organizational fields from latest import
      cmDef.categoryLabel = def.categoryLabel;
      cmDef.group = importGroup || def.group || null;
      state.importedData.customMarkers[m.mappedKey] = cmDef;
    }
  }
  // Save new (custom) marker values and definitions
  for (const m of newMarkers) {
    entry.markers[m.suggestedKey] = normalizeToSI(m.suggestedKey, m.value, m.unit);
    entry.markerSources[m.suggestedKey] = { file: result.fileName || null, at: importTs };
    const [catKey] = m.suggestedKey.split('.');
    const schemaCategory = MARKER_SCHEMA[catKey];
    const categoryLabel = schemaCategory ? schemaCategory.label : m.suggestedCategoryLabel || catKey.charAt(0).toUpperCase() + catKey.slice(1);
    const existing = state.importedData.customMarkers[m.suggestedKey];
    const cmDef = existing || {};
    cmDef.name = cmDef.name || _cleanImportedMarkerDisplayName(m.suggestedName || m.rawName);
    cmDef.unit = m.unit || cmDef.unit || '';
    cmDef.refMin = m.refMin != null ? m.refMin : cmDef.refMin;
    cmDef.refMax = m.refMax != null ? m.refMax : cmDef.refMax;
    // Always update organizational fields from latest import
    cmDef.categoryLabel = categoryLabel;
    // FA-normalized markers carry their own group — don't override with testType-based importGroup
    cmDef.group = m.suggestedGroup || importGroup || m.group || cmDef.group || null;
    state.importedData.customMarkers[m.suggestedKey] = cmDef;
  }
  // Mirror insulin between hormones and diabetes categories (AI may map to either)
  if (entry.markers["hormones.insulin"] !== undefined) {
    entry.markers["diabetes.insulin_d"] = entry.markers["hormones.insulin"];
    if (entry.markerSources?.["hormones.insulin"]) entry.markerSources["diabetes.insulin_d"] = entry.markerSources["hormones.insulin"];
  }
  if (entry.markers["diabetes.insulin_d"] !== undefined && entry.markers["hormones.insulin"] === undefined) {
    entry.markers["hormones.insulin"] = entry.markers["diabetes.insulin_d"];
    if (entry.markerSources?.["diabetes.insulin_d"]) entry.markerSources["hormones.insulin"] = entry.markerSources["diabetes.insulin_d"];
  }
  recalculateHOMAIR(entry);
  // Adopt PDF reference ranges if user opted in (skip if range matches schema default)
  const adoptRanges = document.getElementById('import-adopt-ranges');
  if (adoptRanges && adoptRanges.checked) {
    if (!state.importedData.refOverrides) state.importedData.refOverrides = {};
    for (const m of matched) {
      if (m.refMin == null && m.refMax == null) continue;
      const ovr = state.importedData.refOverrides[m.mappedKey] || {};
      // Convert ranges from PDF units to SI (same as marker values)
      const siMin = m.refMin != null ? normalizeToSI(m.mappedKey, m.refMin, m.unit) : null;
      const siMax = m.refMax != null ? normalizeToSI(m.mappedKey, m.refMax, m.unit) : null;
      // Look up schema default to avoid storing redundant overrides
      const [ck, mk] = m.mappedKey.split('.');
      const schemaDef = MARKER_SCHEMA[ck]?.markers?.[mk];
      const sex = state.profileSex || 'male';
      const defMin = schemaDef && sex === 'female' && schemaDef.refMin_f != null ? schemaDef.refMin_f : schemaDef?.refMin;
      const defMax = schemaDef && sex === 'female' && schemaDef.refMax_f != null ? schemaDef.refMax_f : schemaDef?.refMax;
      const approxEq = (a, b) => a != null && b != null && Math.abs(a - b) < Math.max(Math.abs(b) * 0.001, 0.001);
      if (approxEq(siMin, defMin) && approxEq(siMax, defMax)) continue; // matches default — skip
      ovr.refMin = siMin;
      ovr.refMax = siMax;
      ovr.refSource = 'import';
      // Stash lab range so manual edits can revert to it (don't clobber existing stash)
      if (!('labRefMin' in ovr)) { ovr.labRefMin = siMin; ovr.labRefMax = siMax; }
      state.importedData.refOverrides[m.mappedKey] = ovr;
    }
  }
  const saved = await saveImportedData({ immediate: true });
  if (!saved) {
    restoreImportedDataSnapshot(rollback);
    if (confirmBtn) confirmBtn.disabled = false;
    return;
  }
  // Resolve batch promise before closeImportModal (which would resolve with 'skip')
  if (window._batchImportResolve) {
    const resolve = window._batchImportResolve;
    window._batchImportResolve = null;
    window._batchImportContext = null;
    document.getElementById("import-modal-overlay").classList.remove("show");
    window._pendingImport = null;
    // Restore batch progress visibility for the next file
    const dropZone = document.getElementById("drop-zone");
    if (dropZone) dropZone.style.display = '';
    resolve('import');
  } else {
    window.closeImportModal();
  }
  // During batch mode, defer expensive UI refreshes until the batch completes
  if (!_batchMode) {
    window.buildSidebar();
    window.updateHeaderDates();
    // buildSidebar resets .active to Dashboard — use state.currentView
    // (kept in sync by navigate) instead of re-reading the stale DOM.
    window.navigate(state.currentView || "dashboard");
  }
  showNotification(`Imported ${importCount} markers from ${result.date}`, "success");
  if (!_batchMode && typeof window.maybeShowEncryptionNudge === 'function') window.maybeShowEncryptionNudge();
}

export async function removeImportedEntry(date) {
  if (!date) return false;
  const rollback = snapshotImportedData();
  if (!state.importedData.entries) state.importedData.entries = [];
  recordTombstone(state.importedData, 'entries', date);
  state.importedData.entries = state.importedData.entries.filter(e => e.date !== date);
  const saved = await saveImportedData({ immediate: true });
  if (!saved) {
    restoreImportedDataSnapshot(rollback);
    return false;
  }
  window.buildSidebar();
  window.updateHeaderDates();
  // buildSidebar resets .active to Dashboard — use state.currentView.
  window.navigate(state.currentView || "dashboard");
  showNotification(`Removed imported data from ${date}`, "info");
  return true;
}

export async function renameImportedEntryDate(oldDate) {
  const entries = state.importedData?.entries;
  const entry = entries?.find(e => e.date === oldDate);
  if (!entry) return false;
  const newDate = await showPromptDialog(
    `Edit collection date (was ${oldDate})`,
    { defaultValue: oldDate, inputType: 'date', okLabel: 'Save' }
  );
  if (!newDate || newDate === oldDate) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    showNotification('Date must be YYYY-MM-DD', 'error');
    return false;
  }
  // Format-only regex accepts logically invalid dates (Feb 30, month 13).
  // Round-trip through Date to reject those — `<input type="date">` already
  // guards in modern browsers, but free-text fallbacks and programmatic
  // values can still slip through.
  if (!isValidISOCalendarDate(newDate)) {
    showNotification('That date doesn\'t exist on the calendar.', 'error');
    return false;
  }
  if (entries.some(e => e.date === newDate)) {
    showNotification(`Another entry already exists on ${newDate} — remove it first, then try again.`, 'error', 5000);
    return false;
  }
  const rollback = snapshotImportedData();
  recordTombstone(state.importedData, 'entries', oldDate);
  clearTombstone(state.importedData, 'entries', newDate);
  entry.date = newDate;
  entry.updatedAt = Date.now();
  // manualValues are keyed `markerKey:date` — remap to keep manual-vs-imported provenance correct
  const manualValues = state.importedData.manualValues;
  if (manualValues) {
    const suffixOld = ':' + oldDate;
    const suffixNew = ':' + newDate;
    for (const k of Object.keys(manualValues)) {
      if (k.endsWith(suffixOld)) {
        manualValues[k.slice(0, -suffixOld.length) + suffixNew] = manualValues[k];
        delete manualValues[k];
      }
    }
  }
  const saved = await saveImportedData({ immediate: true });
  if (!saved) {
    restoreImportedDataSnapshot(rollback);
    return false;
  }
  window.buildSidebar();
  window.updateHeaderDates();
  // buildSidebar resets .active to Dashboard — use state.currentView.
  window.navigate(state.currentView || "dashboard");
  showNotification(`Date changed from ${oldDate} to ${newDate}`, 'success');
  return true;
}

// ═══════════════════════════════════════════════
// FILE CLASSIFICATION
// ═══════════════════════════════════════════════
// Some browsers / OS file managers (e.g. OCRFeeder on Linux) export PDFs
// with no extension and no MIME hint. Sniff the %PDF magic bytes so
// extension-less files don't fall through to the unsupported branch.
export async function isPdfByMagic(file) {
  try {
    const buf = await file.slice(0, 4).arrayBuffer();
    const b = new Uint8Array(buf);
    return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  } catch { return false; }
}

// Shared classifier for both drop-zone and file-input paths. Returns
// { jsonFiles, pdfFiles, imageFiles, dnaFiles, textFiles, unsupportedCount }.
// The PDF bucket includes magic-byte hits, so extension-less PDFs are
// routed to the import pipeline instead of silently rejected.
export async function classifyImportFiles(files) {
  const jsonFiles = files.filter(f => f.name.endsWith('.json') || f.type === 'application/json');
  const pdfFiles = files.filter(f => f.name.endsWith('.pdf') || f.type === 'application/pdf');
  const imageFiles = files.filter(f => /\.(jpe?g|png|webp)$/i.test(f.name) || f.type?.startsWith('image/'));
  const dnaFiles = files.filter(f => window.isDNAFile && window.isDNAFile(f));
  const textFiles = [];
  const unmatched = files.filter(f => !jsonFiles.includes(f) && !pdfFiles.includes(f) && !imageFiles.includes(f) && !dnaFiles.includes(f));
  for (const f of unmatched) {
    if (/\.(txt|csv)$/i.test(f.name)) {
      if (window.isDNAFileByContent && await window.isDNAFileByContent(f)) dnaFiles.push(f);
      else if (f.name.endsWith('.txt')) textFiles.push(f);
    } else if (await isPdfByMagic(f)) {
      pdfFiles.push(f);
    }
  }
  const unsupportedCount = files.length - jsonFiles.length - pdfFiles.length - imageFiles.length - dnaFiles.length - textFiles.length;
  return { jsonFiles, pdfFiles, imageFiles, dnaFiles, textFiles, unsupportedCount };
}

// ═══════════════════════════════════════════════
// DROP ZONE
// ═══════════════════════════════════════════════
export function setupDropZone() {
  const dropZone = document.getElementById("drop-zone");
  if (!dropZone) return;
  dropZone.addEventListener("click", () => { if (_importStatus.running) return; document.getElementById('pdf-input').click(); });
  dropZone.addEventListener("dragover", e => { e.preventDefault(); if (!_importStatus.running) dropZone.classList.add("drag-over"); });
  dropZone.addEventListener("dragleave", e => { e.preventDefault(); dropZone.classList.remove("drag-over"); });
  dropZone.addEventListener("drop", async e => {
    e.preventDefault(); dropZone.classList.remove("drag-over");
    if (_importStatus.running) { showNotification("Import already in progress", "info"); return; }
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const { jsonFiles, pdfFiles, imageFiles, dnaFiles, textFiles, unsupportedCount } = await classifyImportFiles(files);
    if (unsupportedCount > 0 && jsonFiles.length === 0 && pdfFiles.length === 0 && imageFiles.length === 0 && dnaFiles.length === 0 && textFiles.length === 0) {
      showNotification("Unsupported file type. Use PDF, text, image, JSON, or DNA raw data (.txt/.csv).", "error");
      return;
    }
    for (const f of jsonFiles) window.importDataJSON(f);
    if (dnaFiles.length > 0) {
      for (const f of dnaFiles) {
        const header = await f.slice(0, 1500).text();
        const fmt = window.detectDNAFile ? window.detectDNAFile(header) : null;
        if ((fmt === 'mtdna' || fmt === '23andme-mito') && window.handleMtDNAFile) await window.handleMtDNAFile(f);
        else if (fmt === '23andme-y') { showNotification('Y-chromosome DNA files are not supported', 'info'); }
        else await window.handleDNAFile(f);
      }
    }
    else if (textFiles.length > 0) { for (const f of textFiles) await handleTextFile(f); }
    else if (imageFiles.length > 0) { for (const f of imageFiles) await handleImageFile(f); }
    else if (pdfFiles.length === 1) await handlePDFFile(pdfFiles[0]);
    else if (pdfFiles.length > 1) await handleBatchPDFs(pdfFiles);
  });
}

// Weighted step percentages: text extraction and PII are fast, AI analysis is the bulk
const STEP_START_PCT = [5, 8, 12, 15, 95];

function _updateProgressPct(pct) {
  const bar = document.querySelector('.import-progress-bar');
  const fill = document.querySelector('.import-progress-bar-fill');
  const label = document.querySelector('.import-progress-pct');
  if (bar) bar.setAttribute('aria-valuenow', String(pct));
  if (fill) fill.style.width = pct + '%';
  if (label) label.textContent = pct + '%';
  if (_importStatus.running) _setImportStatus({ pct });
}

function _buildProgressHTML(step, fileName) {
  const pct = STEP_START_PCT[step] || 0;
  let html = `<div class="import-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Import progress"><div class="import-progress-bar-fill" style="width:${pct}%"></div></div>`;
  html += `<div class="import-progress-pct">${pct}%</div>`;
  html += '<div class="import-progress">';
  for (let i = 0; i < IMPORT_STEPS.length; i++) {
    const isDone = i < step;
    const isActive = i === step;
    const cls = isDone ? "done" : isActive ? "active" : "";
    const icon = isDone
      ? '<span class="step-icon">\u2713</span>'
      : isActive
        ? '<span class="step-icon"><span class="progress-spinner"></span></span>'
        : '<span class="step-icon">\u25CB</span>';
    html += `<div class="progress-step ${cls}">${icon}<span>${IMPORT_STEPS[i]}${isActive ? "..." : ""}</span></div>`;
  }
  if (fileName) html += `<div class="import-progress-filename">${escapeHTML(fileName)}</div>`;
  html += '</div>';
  return html;
}

function _ensureDropZone() {
  let dz = document.getElementById("drop-zone");
  if (dz) return dz;
  // Create a floating drop zone if not on dashboard (e.g. FAB import from category view)
  dz = document.createElement('div');
  dz.id = 'drop-zone';
  dz.className = 'drop-zone drop-zone-hidden';
  document.body.appendChild(dz);
  return dz;
}

export async function showImportProgress(step, fileName) {
  if (_statusDismissTimer) { clearTimeout(_statusDismissTimer); _statusDismissTimer = null; }
  _setImportStatus({ running: true, done: false, failed: false, fileName, pct: STEP_START_PCT[step] || 0, batch: null });
  const dropZone = _ensureDropZone();
  dropZone.innerHTML = _buildProgressHTML(step, fileName);
  _observeProgressBar();
  // Yield to browser so it actually paints the progress before heavy work continues
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
}

function _observeProgressBar() {
  if (_progressObserver) _progressObserver.disconnect();
  const bar = document.querySelector('.import-progress-bar');
  if (!bar) { _progressBarVisible = false; _syncStatusFab(); return; }
  // Floating overlay is position:fixed — always "visible" to IntersectionObserver.
  // Only observe the in-page (dashboard) progress bar.
  if (bar.closest('.drop-zone-hidden')) { _progressBarVisible = false; _syncStatusFab(); return; }
  _progressObserver = new IntersectionObserver(([entry]) => {
    _progressBarVisible = entry.isIntersecting;
    _syncStatusFab();
  }, { threshold: 0.1 });
  _progressObserver.observe(bar);
}

export function hideImportProgress(reason = 'success') {
  // Stop observing progress bar
  if (_progressObserver) { _progressObserver.disconnect(); _progressObserver = null; }
  _progressBarVisible = false;
  // Update status FAB state
  if (reason === 'error') {
    _setImportStatus({ running: false, done: false, failed: true });
    _statusDismissTimer = setTimeout(() => { _setImportStatus({ failed: false }); _statusDismissTimer = null; }, 5000);
  } else if (reason === 'cancel') {
    _setImportStatus({ running: false, done: false, failed: false });
  } else {
    _setImportStatus({ running: false, done: true, failed: false });
    _statusDismissTimer = setTimeout(() => { _setImportStatus({ done: false }); _statusDismissTimer = null; }, 5000);
  }
  const dropZone = document.getElementById("drop-zone");
  if (!dropZone) return;
  // Remove dynamically created drop zone (from FAB import on non-dashboard views)
  if (dropZone.parentElement === document.body) { dropZone.remove(); return; }
  if (dropZone.classList.contains('drop-zone-hidden')) {
    dropZone.innerHTML = '';
  } else {
    dropZone.innerHTML = `<div class="drop-zone-icon">\uD83D\uDCC4</div>
      <div class="drop-zone-text">Drop PDF, image, JSON, or DNA raw data file here, or click to browse</div>
      <div class="drop-zone-hint">AI-powered \u2014 works with any lab report (PDF, photo, screenshot) or getbased JSON export</div>`;
  }
}

// ═══════════════════════════════════════════════
// PDF IMAGE FALLBACK (scanned/image-heavy PDFs)
// ═══════════════════════════════════════════════
export function assessTextQuality(text) {
  if (!text || !text.trim()) return 'empty';
  const words = text.trim().split(/\s+/);
  if (words.length < 30) return 'poor';
  // Check for high ratio of non-alpha characters (garbled OCR, encoding junk)
  const alphaChars = text.replace(/[^a-zA-Z\u00C0-\u024F\u0400-\u04FF]/g, '').length;
  const totalChars = text.replace(/\s/g, '').length;
  if (totalChars > 0 && alphaChars / totalChars < 0.15) return 'poor';
  return 'good';
}

export async function extractPDFImages(file, maxPages = 8) {
  const arrayBuffer = await readFileArrayBuffer(file);
  const pdf = await getPdfDocument({ data: arrayBuffer });
  const pages = Math.min(pdf.numPages, maxPages);
  const images = [];
  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x for fine print
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(viewport.width, 2048);
    canvas.height = Math.min(viewport.height, 2048 * (viewport.height / viewport.width));
    const ctx = canvas.getContext('2d');
    const scale = canvas.width / viewport.width;
    await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: 2.0 * scale }) }).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64 = dataUrl.split(',')[1];
    images.push({ base64, mediaType: 'image/jpeg', page: i });
  }
  return images;
}

export async function parseLabPDFWithAIImages(images, fileName, onProgress) {
  const markerRef = buildMarkerReference();
  const country = (getProfileLocation(getActiveProfileId())?.country || '').trim();
  const dateHint = country
    ? `   IMPORTANT — the user's region is ${country}. Disambiguate ambiguous numeric dates like "12/7/2025" using the format common to that region (US, Philippines = MM/DD/YYYY; UK, EU, India, Australia, most of Canada = DD/MM/YYYY). Do not assume MM/DD by default.`
    : `   IMPORTANT — for ambiguous numeric dates like "12/7/2025", look for context (other dates, a printed format like "DD/MM/YYYY" in the report header, or month names elsewhere) before deciding. Do not assume MM/DD by default — most of the world uses DD/MM/YYYY.`;
  // Same system prompt as text-based parsing
  const system = `You are a lab report data extraction assistant. You extract biomarker results from lab report images and map them to a known set of marker keys.

Here is the complete list of known markers with their keys, expected units, and reference ranges:
${JSON.stringify(markerRef)}

Your task:
1. Read the lab report page images carefully. Find the sample collection date. Return it as YYYY-MM-DD.
${dateHint}
2. For each biomarker result found, extract:
   - rawName: the test name exactly as it appears
   - value: the numeric result (parse comma as decimal point). For "< X" or "> X" results, use X as the value (the detection limit) — these are still clinically meaningful for trend tracking
   - mappedKey: the matching key from the known markers list (e.g. "biochemistry.glucose"), or null if no match
   - unit: the unit as shown
   - refMin: the lower reference range bound EXACTLY as printed on the report (number or null). Do NOT copy from the known markers list above
   - refMax: the upper reference range bound EXACTLY as printed on the report (number or null). Do NOT copy from the known markers list above
3. Match based on medical/biochemical equivalence, not just string similarity. "hs-CRP"/"hsCRP" → "proteins.hsCRP", plain "CRP" → "proteins.crp" (different assays). Strip specimen-type prefixes (S-, P-, B-, U-, fS-, USED-, F-, FW) when matching — keep in rawName. Do NOT map urine-prefixed rows to serum/plasma/blood markers; "U Celková bílkovina" is urine total protein, not serum Total Protein.
4. Only map to a marker if you're confident it's the correct match
5. Identify the type of lab test. Return as "testType" field: "blood", "OAT", "fattyAcids", "biostarks", "DUTCH", "HTMA", "GI", or a descriptive name. For fatty acid tests: put ALL markers into ONE product-specific category — spadiaFA (Spadia), zinzinoFA (ZinZino), omegaquantFA (OmegaQuant), or labNameFA. Use suggestedCategoryLabel = product name, suggestedGroup = "Fatty Acids". Do NOT split by fatty acid type (omega-3/omega-6/saturated/trans). For BioStarks: map standard blood markers to standard keys, amino acids to biostarksAmino.*, fatty acids to biostarksFA.*, intracellular minerals (µg/gHb) to biostarksMineral.*, cortisol/T:C ratio to biostarksHormone.*, vitamin E to biostarksVitamin.*
6. CRITICAL for specialty tests (testType ≠ "blood"): Do NOT use standard blood work category keys. Use test-type-prefixed keys or set mappedKey to null. EXCEPTION: BioStarks (testType "biostarks") is hybrid — DO map its standard blood markers to standard keys
7. EVERY numeric result MUST be included — never silently drop a marker. If it doesn't match a known key, set mappedKey to null and provide suggestedKey, suggestedName, suggestedCategoryLabel, suggestedGroup

Return ONLY valid JSON in this exact format:
{
  "testType": "blood",
  "date": "YYYY-MM-DD",
  "markers": [
    {"rawName": "Test Name", "value": 5.23, "mappedKey": "category.marker", "unit": "mg/dL", "refMin": 70, "refMax": 100}
  ]
}`;

  const provider = getAIProvider();
  const maxTokens = 32768;
  let onStream;
  if (onProgress) {
    let lastPct = -1;
    onStream = (text) => {
      const pct = Math.min(15 + Math.round((text.length / (maxTokens * 3)) * 75), 90);
      if (pct !== lastPct) { lastPct = pct; onProgress(pct); }
    };
  }

  // Build content array with image blocks + text instruction
  // All providers use OpenAI-compatible image format
  const imageBlocks = images.map(img => {
    return { type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.base64}` } };
  });
  const content = [
    ...imageBlocks,
    { type: 'text', text: `Extract all biomarker results from this lab report${fileName ? ' (file: ' + fileName + ')' : ''}. Read every page carefully.` }
  ];

  const { text: response, usage } = await callImportAIWithStreamFallback({
    system,
    messages: [{ role: 'user', content }],
    maxTokens,
    onStream,
    requestTimeoutMs: AI_IMPORT_REQUEST_TIMEOUT_MS
  }, 'PDF image analysis');

  let jsonStr = (response || '').trim();
  jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
  const jsonStart = jsonStr.indexOf('{');
  if (jsonStart > 0) jsonStr = jsonStr.slice(jsonStart);
  const parsed = tryParseJSON(jsonStr);

  // Sanitize AI-supplied keys at the boundary, before any adapter or guard
  // logic runs.
  if (Array.isArray(parsed.markers)) parsed.markers.forEach(_sanitizeAIMarker);

  let testType = parsed.testType || 'blood';
  // ── Adapter-based normalization (image pipeline) — same logic as text pipeline ──
  const detected = detectProduct(fileName, '');
  const adapterForTestType = !detected && testType !== 'blood' ? getAdapterByTestType(testType) : null;
  const needsAdapterNormalize = testType === 'fattyAcids' || (!!detected && testType !== 'blood') || !!adapterForTestType;
  if (needsAdapterNormalize && parsed.markers?.length) {
    const adapter = detected?.adapter || adapterForTestType || getAdapterByTestType('fattyAcids');
    normalizeWithAdapter(adapter, parsed.markers, fileName, '', detected?.product);
  }
  const standardCats = new Set(Object.keys(MARKER_SCHEMA));
  const _specialtyTypes = ['OAT', 'fattyAcids', 'Metabolomix+', 'DUTCH', 'HTMA', 'GI'];
  const markers = (parsed.markers || []).map(m => {
      let mappedKey = m.mappedKey || null;
      let matched = !!mappedKey;
      // Guard: never allow standard blood work mappings for known specialty tests
      if (matched && _specialtyTypes.includes(testType)) {
        const catKey = mappedKey.split('.')[0];
        if (standardCats.has(catKey)) {
          const markerPart = mappedKey.split('.')[1];
          const specialtyMatch = Object.keys(SPECIALTY_MARKER_DEFS).find(k => {
            if (k.split('.')[1] !== markerPart || standardCats.has(k.split('.')[0])) return false;
            const sDef = SPECIALTY_MARKER_DEFS[k];
            return sDef.group === testType || sDef.group?.toLowerCase() === testType.toLowerCase();
          });
          if (specialtyMatch) {
            const sDef = SPECIALTY_MARKER_DEFS[specialtyMatch];
            m.suggestedKey = specialtyMatch;
            m.suggestedName = sDef.name;
            m.suggestedCategoryLabel = sDef.categoryLabel;
            m.suggestedGroup = m.suggestedGroup || sDef.group || testType;
          } else if (!m.suggestedKey) {
            const prefix = testType.toLowerCase().replace(/[^a-z]/g, '');
            const catSuffix = catKey.charAt(0).toUpperCase() + catKey.slice(1);
            m.suggestedKey = `${prefix}${catSuffix}.${markerPart}`;
            m.suggestedName = m.suggestedName || m.rawName;
            m.suggestedCategoryLabel = m.suggestedCategoryLabel || MARKER_SCHEMA[catKey]?.label || catSuffix;
            m.suggestedGroup = m.suggestedGroup || testType;
          }
          mappedKey = null;
          matched = false;
        }
      }
      // Guard: even for blood testType, remap to specialty key if adapter detected a product
      if (matched && testType === 'blood' && detected) {
        const catKey = mappedKey.split('.')[0];
        if (standardCats.has(catKey)) {
          const markerPart = mappedKey.split('.')[1];
          const adapterGroup = detected.adapter?.id === 'oat' ? 'OAT' : detected.adapter?.id === 'fattyAcids' ? 'Fatty Acids' : null;
          const specialtyMatch = adapterGroup && Object.keys(SPECIALTY_MARKER_DEFS).find(k => {
            if (k.split('.')[1] !== markerPart || standardCats.has(k.split('.')[0])) return false;
            return SPECIALTY_MARKER_DEFS[k].group === adapterGroup;
          });
          if (specialtyMatch) {
            const sDef = SPECIALTY_MARKER_DEFS[specialtyMatch];
            m.suggestedKey = specialtyMatch;
            m.suggestedName = sDef.name;
            m.suggestedCategoryLabel = sDef.categoryLabel;
            m.suggestedGroup = sDef.group || testType;
            mappedKey = null;
            matched = false;
          }
        }
      }
      if (!matched && m.suggestedKey && testType !== 'blood') {
        const sugCat = m.suggestedKey.split('.')[0];
        if (standardCats.has(sugCat)) {
          const markerPart = m.suggestedKey.split('.')[1] || m.rawName.replace(/[^a-zA-Z0-9]/g, '');
          const prefix = testType.toLowerCase().replace(/[^a-z]/g, '');
          const catSuffix = sugCat.charAt(0).toUpperCase() + sugCat.slice(1);
          m.suggestedKey = `${prefix}${catSuffix}.${markerPart}`;
          m.suggestedCategoryLabel = m.suggestedCategoryLabel || MARKER_SCHEMA[sugCat]?.label || catSuffix;
          m.suggestedGroup = testType;
        }
      }
      return {
        rawName: m.rawName || '',
        value: typeof m.value === 'number' ? m.value : parseFloat(m.value),
        mappedKey,
        matched,
        unit: m.unit || '',
        refMin: m.refMin != null ? m.refMin : null,
        refMax: m.refMax != null ? m.refMax : null,
        suggestedKey: m.suggestedKey || null,
        suggestedName: m.suggestedName || null,
        suggestedCategoryLabel: m.suggestedCategoryLabel || null,
        suggestedGroup: m.suggestedGroup || null,
      };
    }).filter(m => !isNaN(m.value));
  reconcileImportMarkerMappings(markers, { testType, refLookup: markerRef });
  return {
    date: parsed.date || null,
    testType,
    markers,
    usage: usage || {},
    provider,
    imageMode: true,
  };
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
    const onKey = (e) => { if (e.key === 'Escape') { overlay.classList.remove('show'); resolve('cancel'); } };
    document.addEventListener('keydown', onKey, { once: true });
    dialog.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.removeEventListener('keydown', onKey);
        const action = btn.textContent.trim();
        overlay.classList.remove('show');
        if (action === 'Cancel') resolve('cancel');
        else if (action === 'Try text anyway') resolve('text');
        else resolve('image');
      }, { once: true });
    });
    overlay.classList.add('show');
  });
}

export async function handlePDFFile(file, forceImageMode = false, preExtractedText = null) {
  const _startProfileId = state.currentProfile;
  try {
    await showImportProgress(0, file.name);
    const pdfText = preExtractedText || await extractPDFText(file);
    const textQuality = preExtractedText ? 'good' : assessTextQuality(pdfText);

    // Determine import mode — ask user for scanned/empty PDFs
    let useImageMode = forceImageMode;
    if (!forceImageMode && (textQuality === 'empty' || textQuality === 'poor')) {
      const choice = await _showImageModeDialog();
      if (choice === 'cancel') { hideImportProgress(); return; }
      useImageMode = choice === 'image';
      if (isDebugMode()) console.log(`[Import] User chose ${choice} for ${textQuality} text quality`);
    }

    if (useImageMode) {
      // Image mode path — skip PII, render pages as images
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
      const result = await parseLabPDFWithAIImages(images, file.name, _updateProgressPct);
      const analysisTime = Math.round((performance.now() - analysisStart) / 1000);
      if (isDebugMode()) console.log(`[Analysis] Image mode parsed in ${analysisTime}s`);
      result.privacyMethod = 'none (image mode)';
      result.timings = { pii: 0, analysis: analysisTime };
      const prov = result.provider || getAIProvider();
      const mid = getActiveModelId();
      result.costInfo = {
        provider: prov, modelId: mid,
        inputTokens: result.usage?.inputTokens || 0,
        outputTokens: result.usage?.outputTokens || 0,
        cost: calculateCost(prov, mid, result.usage?.inputTokens || 0, result.usage?.outputTokens || 0)
      };
      trackUsage(prov, mid, result.usage?.inputTokens || 0, result.usage?.outputTokens || 0);
      result.importHash = hashString(file.name + file.size);
      result._importProfileId = _startProfileId;
      if (!result.date) showNotification("Could not find collection date in PDF", "error");
      if (result.markers.length === 0) { hideImportProgress('error'); showNotification("No biomarkers found in PDF images", "error"); return; }
      await showImportProgress(4, file.name);
      showImportPreview(result);
      hideImportProgress();
      return;
    }

    // Text mode path (original flow)
    if (!pdfText.trim()) { hideImportProgress('error'); showNotification("PDF appears empty — no text extracted", "error"); return; }

    if (!hasAIProvider()) {
      hideImportProgress('error');
      showAINeededDialog('import');
      return;
    }

    // Pre-flight checks — before spending tokens
    await showImportProgress(1, file.name);
    const preflight = await runPreflightChecks(pdfText, file.name);
    if (!preflight) { hideImportProgress('cancel'); return; }

    // PII obfuscation step
    await showImportProgress(2, file.name);
    let textForAI = pdfText;
    let privacyMethod = null;
    let privacyReplacements = 0;
    let privacyOriginal = null;
    let piiTime = 0;
    const ollama = await checkOllamaPII();

    if (ollama.available && isPIIReviewEnabled()) {
      // Streaming mode — modal opens immediately, AI streams into it
      const piiStart = performance.now();
      const reviewResult = await reviewPIIBeforeSend(pdfText, {
        streamFn: (onChunk, signal, onThinking) => sanitizeWithOllamaStreaming(pdfText, onChunk, signal, onThinking)
      });
      piiTime = Math.round((performance.now() - piiStart) / 1000);
      if (reviewResult === 'cancel') { hideImportProgress('cancel'); showNotification('Import cancelled.', 'info'); return; }
      textForAI = reviewResult;
      privacyMethod = 'ollama+review';
      privacyOriginal = pdfText;
    } else if (ollama.available) {
      // Non-streaming background path (review disabled)
      try {
        const piiStart = performance.now();
        textForAI = await sanitizeWithOllama(pdfText);
        piiTime = Math.round((performance.now() - piiStart) / 1000);
        privacyMethod = 'ollama';
        privacyOriginal = pdfText;
        if (isDebugMode()) console.log(`[PII] Obfuscated via Local AI (${piiTime}s)`);
      } catch (e) {
        if (isDebugMode()) console.warn('[PII] Local AI failed, falling back to regex:', e.message);
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
      // Regex-only path
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
    if (isDebugMode()) { console.log('[PII] Original:', pdfText); console.log('[PII] Obfuscated:', textForAI); }

    await showImportProgress(3, file.name);
    const analysisStart = performance.now();
    const result = await parseLabPDFWithAI(textForAI, file.name, _updateProgressPct);
    const analysisTime = Math.round((performance.now() - analysisStart) / 1000);
    if (isDebugMode()) console.log(`[Analysis] Parsed in ${analysisTime}s`);
    result.privacyMethod = privacyMethod;
    result.privacyReplacements = privacyReplacements;
    result.timings = { pii: piiTime, analysis: analysisTime };
    const prov = result.provider || getAIProvider();
    const mid = getActiveModelId();
    result.costInfo = {
      provider: prov, modelId: mid,
      inputTokens: result.usage?.inputTokens || 0,
      outputTokens: result.usage?.outputTokens || 0,
      cost: calculateCost(prov, mid, result.usage?.inputTokens || 0, result.usage?.outputTokens || 0)
    };
    trackUsage(prov, mid, result.usage?.inputTokens || 0, result.usage?.outputTokens || 0);
    result.importHash = hashString(pdfText);
    result._importProfileId = _startProfileId;
    if (isDebugMode()) { result.privacyOriginal = privacyOriginal; result.privacyObfuscated = textForAI; }
    if (!result.date) { showNotification("Could not find collection date in PDF", "error"); }
    if (result.markers.length === 0) { hideImportProgress('error'); showNotification("No biomarkers found in PDF", "error"); return; }
    await showImportProgress(4, file.name);
    showImportPreview(result);
    hideImportProgress();
  } catch (err) {
    hideImportProgress('error');
    if (isDebugMode()) console.error("PDF parse error:", err);
    showNotification("Error parsing PDF: " + formatImportError(err), "error", 10000);
  }
}

// ═══════════════════════════════════════════════
// BATCH PDF IMPORT
// ═══════════════════════════════════════════════
let _batchMode = false;

// Import status — tracked for the status FAB when progress bar is not visible
const _importStatus = { running: false, pct: 0, failed: false, done: false, fileName: '', batch: null };
let _statusDismissTimer = null;
let _progressBarVisible = false;
let _progressObserver = null;

function _setImportStatus(patch) {
  Object.assign(_importStatus, patch);
  _syncStatusFab();
}

function _handleStatusFabClick() {
  // Import preview modal open — bring it to focus
  const overlay = document.getElementById('import-modal-overlay');
  if (overlay && overlay.classList.contains('show')) {
    overlay.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  // Running — scroll to progress bar if visible, otherwise navigate to dashboard
  if (_importStatus.running) {
    const progressBar = document.querySelector('.import-progress-bar');
    if (progressBar) {
      progressBar.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      window.navigate('dashboard');
    }
    return;
  }
  // Done/failed — dismiss
  _setImportStatus({ done: false, failed: false });
}

function _syncStatusFab() {
  const fab = document.getElementById('import-status-fab');
  if (!fab) return;
  const { running, done, failed, pct, batch } = _importStatus;
  // Hide when: import preview modal is open, or progress bar is visible on screen
  const previewOpen = document.getElementById('import-modal-overlay')?.classList.contains('show');
  const visible = (running || done || failed) && !previewOpen && !_progressBarVisible;
  fab.classList.toggle('hidden', !visible);
  // Hide the floating progress overlay whenever the FAB or preview modal takes over
  const floatingDz = document.querySelector('.drop-zone-hidden');
  if (floatingDz && (visible || previewOpen)) floatingDz.style.display = 'none';
  else if (floatingDz && _importStatus.running && _progressBarVisible) floatingDz.style.display = '';
  if (!visible) return;
  let label = '';
  if (running) {
    label = batch ? `${batch.current}/${batch.total} \u00b7 ${pct}%` : `${pct}%`;
  } else if (done) {
    label = '\u2713';
  } else if (failed) {
    label = '\u2717';
  }
  fab.querySelector('.import-status-label').textContent = label;
  fab.classList.toggle('is-running', running);
  fab.classList.toggle('is-done', done);
  fab.classList.toggle('is-failed', failed);
}

async function _processBatchFile(file, ollama, fileNum, totalFiles) {
  await showBatchImportProgress(0, file.name, fileNum, totalFiles);
  const pdfText = await extractPDFText(file);
  if (!pdfText.trim()) { showNotification(`${file.name}: PDF appears empty`, 'error'); return 'empty'; }

  // Pre-flight checks — before spending tokens
  await showBatchImportProgress(1, file.name, fileNum, totalFiles);
  const preflight = await runPreflightChecks(pdfText, file.name);
  if (!preflight) return 'skipped';

  // PII obfuscation
  await showBatchImportProgress(2, file.name, fileNum, totalFiles);
  let textForAI = pdfText;
  let privacyMethod = null;
  let privacyReplacements = 0;
  let privacyOriginal = null;
  let piiTime = 0;

  if (ollama.available && isPIIReviewEnabled()) {
    // Streaming mode — modal opens immediately, AI streams into it
    const piiStart = performance.now();
    const reviewResult = await reviewPIIBeforeSend(pdfText, {
      streamFn: (onChunk, signal, onThinking) => sanitizeWithOllamaStreaming(pdfText, onChunk, signal, onThinking)
    });
    piiTime = Math.round((performance.now() - piiStart) / 1000);
    if (reviewResult === 'cancel') { return 'skipped'; }
    textForAI = reviewResult;
    privacyMethod = 'ollama+review';
    privacyOriginal = pdfText;
  } else if (ollama.available) {
    try {
      const piiStart = performance.now();
      textForAI = await sanitizeWithOllama(pdfText);
      piiTime = Math.round((performance.now() - piiStart) / 1000);
      privacyMethod = 'ollama';
      privacyOriginal = pdfText;
    } catch (e) {
      if (isDebugMode()) console.warn(`[PII] Local AI failed for ${file.name}, regex fallback:`, e.message);
      try {
        const r = obfuscatePDFText(pdfText);
        textForAI = r.obfuscated; privacyReplacements = r.replacements; privacyOriginal = r.original;
        privacyMethod = 'regex';
      } catch (e2) {
        showNotification(`${file.name}: Privacy protection failed \u2014 skipped`, 'error');
        return 'pii-fail';
      }
    }
  } else {
    try {
      const r = obfuscatePDFText(pdfText);
      textForAI = r.obfuscated; privacyReplacements = r.replacements; privacyOriginal = r.original;
      privacyMethod = 'regex';
    } catch (e) {
      showNotification(`${file.name}: Privacy protection failed \u2014 skipped`, 'error');
      return 'pii-fail';
    }
    if (isPIIReviewEnabled()) {
      const reviewResult = await reviewPIIBeforeSend(pdfText, { obfuscatedText: textForAI });
      if (reviewResult === 'cancel') { return 'skipped'; }
      textForAI = reviewResult;
    }
  }
  if (isDebugMode()) console.log(`[PII] ${file.name} \u2014 method: ${privacyMethod}, ${piiTime}s`);

  await showBatchImportProgress(3, file.name, fileNum, totalFiles);
  const analysisStart = performance.now();
  const result = await parseLabPDFWithAI(textForAI, file.name, _updateProgressPct);
  const analysisTime = Math.round((performance.now() - analysisStart) / 1000);
  if (isDebugMode()) console.log(`[Analysis] ${file.name} parsed in ${analysisTime}s`);
  result.privacyMethod = privacyMethod;
  result.privacyReplacements = privacyReplacements;
  result.timings = { pii: piiTime, analysis: analysisTime };
  const prov = result.provider || getAIProvider();
  const mid = getActiveModelId();
  result.costInfo = {
    provider: prov, modelId: mid,
    inputTokens: result.usage?.inputTokens || 0,
    outputTokens: result.usage?.outputTokens || 0,
    cost: calculateCost(prov, mid, result.usage?.inputTokens || 0, result.usage?.outputTokens || 0)
  };
  trackUsage(prov, mid, result.usage?.inputTokens || 0, result.usage?.outputTokens || 0);
  result.importHash = hashString(pdfText);
  if (isDebugMode()) { result.privacyOriginal = privacyOriginal; result.privacyObfuscated = textForAI; }
  if (result.markers.length === 0) { showNotification(`${file.name}: No markers found`, 'error'); return 'no-markers'; }
  await showBatchImportProgress(4, file.name, fileNum, totalFiles);
  const action = await showImportPreviewAsync(result, file.name, fileNum, totalFiles);
  return action === 'skip' ? 'skipped' : 'imported';
}

export async function handleBatchPDFs(pdfFiles) {
  if (!hasAIProvider()) {
    showAINeededDialog('import');
    return;
  }
  _batchMode = true;
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
      if (isDebugMode()) console.error(`Batch import error (${file.name}):`, err);
      showNotification(`Error: ${file.name} — ${err.message}`, 'error');
      failedFiles.push({ file, error: err.message });
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
        if (isDebugMode()) console.error(`Retry failed (${file.name}):`, err);
        retryFailed++;
        failed++;
      }
      if (i < failedFiles.length - 1) await new Promise(r => setTimeout(r, 3000));
    }
  }
  _batchMode = false;
  // Refresh UI once after all files processed
  window.buildSidebar();
  window.updateHeaderDates();
  // buildSidebar resets .active to Dashboard — use state.currentView.
  window.navigate(state.currentView || "dashboard");
  hideImportProgress();
  const parts = [];
  if (imported > 0) parts.push(`${imported} imported`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (retryImported > 0) parts.push(`${retryImported} recovered on retry`);
  showNotification(`Batch import complete: ${parts.join(', ')}`, imported > 0 ? 'success' : 'info');
  if (imported > 0 && typeof window.maybeShowEncryptionNudge === 'function') window.maybeShowEncryptionNudge();
}

export async function showBatchImportProgress(step, fileName, current, total) {
  if (_statusDismissTimer) { clearTimeout(_statusDismissTimer); _statusDismissTimer = null; }
  _setImportStatus({ running: true, done: false, failed: false, fileName, pct: STEP_START_PCT[step] || 0, batch: { current, total } });
  const dropZone = _ensureDropZone();
  let html = `<div class="batch-progress-counter">Processing file ${current} of ${total}</div>`;
  html += _buildProgressHTML(step, fileName);
  dropZone.innerHTML = html;
  _observeProgressBar();
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
}

export function showImportPreviewAsync(result, fileName, current, total) {
  // Hide batch progress so it doesn't cover the import preview modal
  const dropZone = document.getElementById("drop-zone");
  if (dropZone) dropZone.style.display = 'none';
  return new Promise(resolve => {
    window._batchImportResolve = resolve;
    window._batchImportContext = { current, total };
    showImportPreview(result);
  });
}

// ═══════════════════════════════════════════════
// IMAGE FILE IMPORT (JPG/PNG lab reports)
// ═══════════════════════════════════════════════
export async function handleImageFile(file) {
  if (!hasAIProvider()) {
    showAINeededDialog('image');
    return;
  }
  // PII warning — images cannot be scrubbed
  const provider = getAIProvider();
  if (provider !== 'ollama') {
    if (!await showConfirmDialog(
      'This image will be sent directly to the AI provider. Personal details visible in the image cannot be scrubbed before upload. Continue?'
    )) return;
  }
  const _startProfileId = state.currentProfile;
  try {
    await showImportProgress(3, file.name);
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const mediaType = file.type || (file.name.match(/\.png$/i) ? 'image/png' : file.name.match(/\.webp$/i) ? 'image/webp' : 'image/jpeg');
    const images = [{ base64, mediaType, page: 1 }];
    const analysisStart = performance.now();
    const result = await parseLabPDFWithAIImages(images, file.name, _updateProgressPct);
    const analysisTime = Math.round((performance.now() - analysisStart) / 1000);
    if (isDebugMode()) console.log(`[Analysis] Image file parsed in ${analysisTime}s`);
    result.privacyMethod = 'none (image mode)';
    result.timings = { pii: 0, analysis: analysisTime };
    const prov = result.provider || getAIProvider();
    const mid = getActiveModelId();
    result.costInfo = {
      provider: prov, modelId: mid,
      inputTokens: result.usage?.inputTokens || 0,
      outputTokens: result.usage?.outputTokens || 0,
      cost: calculateCost(prov, mid, result.usage?.inputTokens || 0, result.usage?.outputTokens || 0)
    };
    trackUsage(prov, mid, result.usage?.inputTokens || 0, result.usage?.outputTokens || 0);
    result.importHash = hashString(file.name + file.size);
    result._importProfileId = _startProfileId;
    if (!result.date) showNotification("Could not find collection date in image", "error");
    if (result.markers.length === 0) { hideImportProgress('error'); showNotification("No biomarkers found in image", "error"); return; }
    await showImportProgress(4, file.name);
    showImportPreview(result);
    hideImportProgress();
  } catch (err) {
    if (isDebugMode()) console.error('Image import error:', err);
    hideImportProgress('error');
    showNotification(`Import failed: ${err.message}`, 'error');
  }
}

// ═══════════════════════════════════════════════
// TEXT FILE IMPORT
// ═══════════════════════════════════════════════
export async function handleTextFile(file) {
  const text = await file.text();
  if (!text.trim()) { showNotification("Text file is empty", "error"); return; }
  await handlePDFFile(file, false, text);
}

// ═══════════════════════════════════════════════
// WINDOW EXPORTS
// ═══════════════════════════════════════════════
Object.assign(window, {
  buildMarkerReference,
  reconcileImportMarkerMappings,
  extractPDFText,
  tryParseJSON,
  parseLabPDFWithAI,
  showAINeededDialog,
  showImportPreview,
  applyManualImportDate,
  mapUnmatchedMarker,
  mapUnmatchedMarkerInput,
  setImportReviewFilter,
  applyImportReviewFilters,
  toggleImportRow,
  closeImportModal,
  confirmImport,
  removeImportedEntry,
  renameImportedEntryDate,
  setupDropZone,
  classifyImportFiles,
  isPdfByMagic,
  showImportProgress,
  hideImportProgress,
  assessTextQuality,
  extractPDFImages,
  parseLabPDFWithAIImages,
  handlePDFFile,
  handleImageFile,
  handleTextFile,
  handleBatchPDFs,
  showBatchImportProgress,
  showImportPreviewAsync,
  syncImportStatusFab: _syncStatusFab,
  handleImportStatusClick: _handleStatusFabClick,
  isImportRunning: () => _importStatus.running,
});
