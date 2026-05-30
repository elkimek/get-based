// pdf-import-preflight.js — duplicate/model/specialty checks before PDF AI import

import { state } from './state.js';
import { callClaudeAPI, getActiveModelId, getAIProvider, hasAIProvider, setAIProvider, setCustomApiModel, setOllamaMainModel, setOpenRouterModel, setPpqModel, setRoutstrModel, setVeniceModel } from './api.js';
import { detectProduct, getAdapterByTestType } from './adapters.js';
import { escapeHTML, hashString, isDebugMode } from './utils.js';

function showPreflightConfirm(message, confirmLabel = 'Import Anyway') {
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

// Normalize model IDs for comparison across providers.
// "anthropic/claude-sonnet-4.6" / "claude-sonnet-4-6" / "claude-sonnet-4.6" -> "claude-sonnet-4-6"
export function normalizeImportModelId(id) {
  return id.replace(/^[^/]+\//, '').replace(/-\d{8}$/, '').replace(/\./g, '-');
}

function checkModelMismatch() {
  const provider = getAIProvider();
  const currentModel = getActiveModelId(provider);
  const entries = (state.importedData?.entries || []).filter(e => e.importedWith?.modelId);
  if (entries.length === 0) return null;
  const lastEntry = entries[entries.length - 1];
  if (normalizeImportModelId(lastEntry.importedWith.modelId) === normalizeImportModelId(currentModel)) return null;
  return {
    currentModel,
    prevModel: lastEntry.importedWith.modelId,
    prevProvider: lastEntry.importedWith.provider
  };
}

function tryAutoSwitchModel(prevModel, prevProvider) {
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

function showModelMismatchDialog(mismatch) {
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

/** Cheap AI call to classify test type from first ~2000 chars of PDF text. */
async function classifyTestType(pdfText) {
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
    return null;
  }
}

function showUnsupportedLabDialog(testType) {
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

export async function runPreflightChecks(pdfText, fileName) {
  const dupDate = checkDuplicateHash(pdfText);
  if (dupDate) {
    const dateLabel = new Date(dupDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const proceed = await showPreflightConfirm(
      `This file was already imported (<strong>${dateLabel}</strong>). Importing again will use tokens and may overwrite existing values.`
    );
    if (!proceed) return false;
  }

  const mismatch = checkModelMismatch();
  if (mismatch) {
    const result = await showModelMismatchDialog(mismatch);
    if (result === 'cancel') return false;
  }

  if (hasAIProvider()) {
    const detected = detectProduct(fileName || '', pdfText);
    if (!detected) {
      const classified = await classifyTestType(pdfText);
      if (classified && classified.testType !== 'blood') {
        const adapter = getAdapterByTestType(classified.testType);
        if (!adapter) {
          const label = (classified.labName && classified.testType === 'comprehensive')
            ? `${classified.labName} (${classified.testType})`
            : classified.testType;
          const proceed = await showUnsupportedLabDialog(label);
          if (!proceed) return false;
        }
      }
    }
  }
  return true;
}
