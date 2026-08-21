// @ts-check
// supplement-import-controller.js — URL/photo extraction progress and selective review.

import { getErrorMessage } from './caught-error.js';
import { escapeHTML, isDebugMode, showNotification } from './utils.js';
import { callClaudeAPI, getAIProvider, hasAIProvider } from './api.js';
import { buildVisionContent, formatImageBlock, isValidImageType, resizeImage } from './image-utils.js';
import { suppActionAttrs } from './supplement-action-delegates.js';
import { formatSupplementAmount, getIngredientQuantity } from './supplement-medication-domain.js';
import {
  formatSupplementQualityResult,
  isInformationalActiveIngredientPotencyTest,
  isSupplementQualityIncludedInAI,
  supplementQualityKey,
} from './supplement-quality.js';
import {
  SUPPLEMENT_EXTRACTION_SCHEMA_PROMPT,
  extractSupplementPageFacts,
  mergeSupplementImportDrafts,
  normalizeSupplementImportDraft,
  parseSupplementImportJson,
  supplementImportIngredientKey,
} from './supplement-import-draft.js';
import { getUtilsRuntimeHostname } from './utils-runtime.js';
import {
  getElementValue,
  getFieldValue,
  getFormField,
  getOuterTimesFromForm,
  ingredientRowHtml,
  parseHttpUrl,
  qualityTestRowHtml,
  updateIngTotal,
} from './supplement-form-ui.js';

/** @type {{ draft: any, issues: string[] } | null} */
let pendingSupplementImport = null;
let supplementImportProgressId = 0;
/** @type {{ id: number, phase: number, label: string, startedAt: number, timer: ReturnType<typeof setInterval> | null } | null} */
let supplementImportProgress = null;

export function getPendingSupplementImport() {
  return pendingSupplementImport;
}

export function clearPendingSupplementImport() {
  pendingSupplementImport = null;
}

function importElapsed(startedAt) {
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return seconds < 60 ? `${seconds}s elapsed` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s elapsed`;
}

function renderImportProgress(id, state = 'running') {
  if (!supplementImportProgress || supplementImportProgress.id !== id) return;
  const area = document.getElementById('supp-import-progress');
  if (!area) return;
  const { phase, label, startedAt } = supplementImportProgress;
  const percentages = [0, 18, 43, 72, 92];
  const percent = state === 'success' ? 100 : percentages[Math.max(0, Math.min(4, phase))];
  const slowHint = state === 'running' && Date.now() - startedAt >= 15000
    ? ' · Large pages and COA tables can take longer; the import is still working.' : '';
  area.hidden = false;
  area.className = `supp-import-progress supp-import-progress-${state}`;
  area.innerHTML = `<div class="supp-import-progress-head"><strong>${escapeHTML(label)}</strong><span>${state === 'running' ? `Step ${phase} of 4 · ${importElapsed(startedAt)}${slowHint}` : state === 'success' ? 'Complete' : 'Stopped'}</span></div><div class="supp-import-progress-track" role="progressbar" aria-label="Supplement import progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>`;
}

/** @param {Element | null} activeButton @param {string} label */
function startImportProgress(activeButton, label) {
  if (supplementImportProgress?.timer) clearInterval(supplementImportProgress.timer);
  const id = ++supplementImportProgressId;
  supplementImportProgress = { id, phase: 1, label, startedAt: Date.now(), timer: null };
  for (const button of document.querySelectorAll('.supp-url-fetch')) {
    if (button instanceof HTMLButtonElement) button.disabled = true;
    button.classList.toggle('is-loading', button === activeButton);
  }
  renderImportProgress(id);
  supplementImportProgress.timer = setInterval(() => renderImportProgress(id), 1000);
  return id;
}

function updateImportProgress(id, phase, label) {
  if (!supplementImportProgress || supplementImportProgress.id !== id) return;
  supplementImportProgress.phase = phase;
  supplementImportProgress.label = label;
  renderImportProgress(id);
}

function finishImportProgress(id, success) {
  if (!supplementImportProgress || supplementImportProgress.id !== id) return;
  if (supplementImportProgress.timer) clearInterval(supplementImportProgress.timer);
  supplementImportProgress.timer = null;
  supplementImportProgress.phase = 4;
  supplementImportProgress.label = success ? 'Editable review ready' : 'Import stopped';
  renderImportProgress(id, success ? 'success' : 'error');
  for (const button of document.querySelectorAll('.supp-url-fetch')) {
    if (button instanceof HTMLButtonElement) button.disabled = false;
    button.classList.remove('is-loading');
  }
  setTimeout(() => {
    if (!supplementImportProgress || supplementImportProgress.id !== id) return;
    const area = document.getElementById('supp-import-progress');
    if (area) area.hidden = true;
    supplementImportProgress = null;
  }, success ? 2500 : 6000);
}

export async function scanSupplementLabel(input) {
  const files = Array.from(input.files || []).slice(0, 4);
  input.value = '';
  if (!files.length || files.some(file => !isValidImageType(file.type))) {
    showNotification('Please select an image file (JPG, PNG, WebP; up to 4)', 'error');
    return;
  }
  const progressId = startImportProgress(document.querySelector('.supp-scan-label'), 'Preparing label photos…');
  let completed = false;
  try {
    const provider = getAIProvider();
    const imageBlocks = [];
    for (const file of files) {
      const { base64, mediaType } = await resizeImage(file, 1400, 0.88);
      imageBlocks.push(formatImageBlock(base64, mediaType, provider));
    }
    updateImportProgress(progressId, 2, 'Reading label and quality evidence…');
    const content = buildVisionContent(imageBlocks, `These images may show a front label, Supplement Facts, OTC Drug Facts, prescription label, or directions. Reconcile facts across all images.\n${SUPPLEMENT_EXTRACTION_SCHEMA_PROMPT}`, provider);
    updateImportProgress(progressId, 3, 'Classifying active ingredients and quality results with AI…');
    const result = await callClaudeAPI({ messages: [{ role: 'user', content }], maxTokens: 6000 }, provider);
    updateImportProgress(progressId, 4, 'Preparing selective review…');
    stageParsedSupplement(parseSupplementImportJson(result.text), { kind: 'label photos' });
    completed = true;
  } catch (error) {
    if (isDebugMode()) console.warn('[scanLabel]', error);
    showNotification(`Failed to scan label: ${getErrorMessage(error, 'Unknown error')}`, 'error');
  } finally {
    finishImportProgress(progressId, completed);
  }
}

export function renderPendingImportReview() {
  if (!pendingSupplementImport) return '';
  const { draft, issues } = pendingSupplementImport;
  const applied = draft.source?.reviewed === true;
  const evidence = Array.isArray(draft.source?.evidence) && draft.source.evidence.length
    ? draft.source.evidence : [draft.source];
  const sourceFacts = evidence.map(source => `${source.kind}${source.reviewed ? ' ✓' : ' · pending'}`);
  const facts = [draft.product, draft.genericName, draft.brand, draft.dosageForm,
    draft.servingSize?.value != null ? formatSupplementAmount(draft.servingSize.value, draft.servingSize.unit) : ''].filter(Boolean);
  if (applied) {
    return `<div class="supp-import-review supp-import-review-applied" role="status"><div class="supp-import-review-header"><strong>Selected facts are ready to edit</strong><span>Nothing is saved yet.</span></div><div class="supp-import-review-facts supp-import-review-sources">${sourceFacts.map(fact => `<span>${escapeHTML(fact)}</span>`).join('')}</div><div class="supp-import-review-directions">Review the editable identity, active ingredients, other label ingredients, quality evidence, personal regimen, and dates below. Correct or remove anything before choosing ${document.getElementById('supp-form-panel')?.getAttribute('data-edit-index') === '-1' ? 'Add' : 'Update'}.</div></div>`;
  }
  return `<div class="supp-import-review" role="region" aria-label="Review imported supplement facts">
    <div class="supp-import-review-header"><strong>${evidence.length > 1 ? 'Choose facts from combined evidence' : 'Choose facts to import'}</strong><span>Uncheck anything irrelevant. You will edit selected facts in the form before saving.</span></div>
    <div class="supp-import-review-facts supp-import-review-sources">${sourceFacts.map(fact => `<span>${escapeHTML(fact)}</span>`).join('')}</div>${facts.length ? `<div class="supp-import-review-facts">${facts.map(fact => `<span>${escapeHTML(String(fact))}</span>`).join('')}</div>` : ''}${issues.length ? `<div class="supp-import-review-issues">${issues.map(issue => `<div>Check: ${escapeHTML(issue)}</div>`).join('')}</div>` : ''}
    <div class="supp-import-review-label">Active ingredients</div><div class="supp-import-review-ingredients">${draft.ingredients.length ? draft.ingredients.map((ingredient, index) => `<label class="supp-import-choice"><input type="checkbox" data-supp-import-kind="ingredient" data-supp-import-index="${index}" checked><span><strong>${escapeHTML(ingredient.name)}</strong> ${escapeHTML(ingredient.amount || 'amount not found')} <small>${escapeHTML([ingredient.basis, ...(ingredient.sourceKinds || [])].filter(Boolean).join(' · '))}</small></span></label>`).join('') : '<div>No active ingredients found.</div>'}</div>
    ${draft.inactiveIngredients?.length ? `<div class="supp-import-review-label">Other / inactive label ingredients <small>label or website data; verify against your bottle</small></div><div class="supp-import-review-choices">${draft.inactiveIngredients.map((ingredient, index) => `<label class="supp-import-choice"><input type="checkbox" data-supp-import-kind="inactive" data-supp-import-index="${index}" checked><span>${escapeHTML(ingredient)}</span></label>`).join('')}</div>` : ''}
    ${draft.qualityTests?.length ? `<div class="supp-import-review-label supp-import-review-quality-label"><span>Laboratory & quality results <small>COA lot may not match your bottle · choose which rows to import</small></span><button type="button" class="supp-import-filter-btn" aria-pressed="false" title="Uncheck potency, identity, and other quality rows. No data is saved until you continue and confirm the form." ${suppActionAttrs('quality-safety-only')}>Select only contaminants + microbiology</button></div><div class="supp-import-review-quality">${draft.qualityTests.map((test, index) => {
      const duplicatePotency = isInformationalActiveIngredientPotencyTest(test, draft);
      return `<label class="supp-import-choice"><input type="checkbox" data-supp-import-kind="quality" data-supp-import-category="${escapeHTML(test.category || 'other')}" data-supp-import-index="${index}"${duplicatePotency ? '' : ' checked'}><span><span class="supp-quality-kind">${escapeHTML(test.category)}</span> <strong>${escapeHTML(test.analyte)}</strong> ${escapeHTML(formatSupplementQualityResult(test))}<small>${duplicatePotency ? 'active-ingredient verification · not selected by default · AI context off if kept' : 'eligible for AI context; editable after continuing'}</small></span></label>`;
    }).join('')}</div>` : ''}
    ${draft.labelDirections ? `<div class="supp-import-review-directions"><strong>Label directions:</strong> ${escapeHTML(draft.labelDirections)}</div>` : ''}${draft.warnings?.length ? `<div class="supp-import-review-directions"><strong>Label warnings:</strong> ${draft.warnings.map(warning => escapeHTML(warning)).join(' · ')}</div>` : ''}
    <div class="supp-import-review-actions"><button type="button" class="import-btn import-btn-primary" ${suppActionAttrs('apply-import')}>Continue to editable form</button><button type="button" class="import-btn import-btn-secondary" ${suppActionAttrs('discard-import')}>Discard</button></div></div>`;
}

function showPendingImportReview() {
  const area = document.getElementById('supp-import-review-area');
  if (area) area.innerHTML = renderPendingImportReview();
}

function stageParsedSupplement(parsed, source = {}) {
  try {
    pendingSupplementImport = mergeSupplementImportDrafts(
      pendingSupplementImport,
      normalizeSupplementImportDraft(parsed, source),
    );
    showPendingImportReview();
    const count = pendingSupplementImport.draft.ingredients.length;
    const sourceCount = pendingSupplementImport.draft.source?.evidence?.length || 1;
    showNotification(`${sourceCount > 1 ? 'Combined draft' : 'Draft'} ready${count ? ` with ${count} active ingredient${count === 1 ? '' : 's'}` : ''} — review before applying`, 'success');
  } catch (error) {
    showNotification(`Could not validate extracted product information: ${getErrorMessage(error, 'Unknown error')}`, 'error');
  }
}

function setImportedFieldIfBlank(id, value) {
  const input = getFormField(id);
  if (input && value != null && String(value).trim() && !input.value.trim()) input.value = String(value);
}

function applyImportedIngredient(row, ingredient) {
  const amount = getIngredientQuantity(ingredient);
  const amountInput = row.querySelector('.supp-ing-amount');
  const unitSelect = row.querySelector('.supp-ing-unit');
  const customUnit = row.querySelector('.supp-ing-unit-custom');
  if (amountInput instanceof HTMLInputElement && !amountInput.value.trim() && amount) amountInput.value = String(amount.value);
  if (unitSelect instanceof HTMLSelectElement && !unitSelect.value && amount?.unit) {
    const standard = Array.from(unitSelect.options).some(option => option.value === amount.unit);
    unitSelect.value = standard ? amount.unit : '__custom__';
    if (customUnit instanceof HTMLInputElement) {
      customUnit.hidden = standard;
      customUnit.value = standard ? '' : amount.unit;
    }
  }
  const sourceKinds = Array.isArray(ingredient.sourceKinds) ? ingredient.sourceKinds.join('|') : '';
  if (sourceKinds && row instanceof HTMLElement) row.dataset.importSourceKinds = sourceKinds;
  const totalSource = amountInput instanceof Element ? amountInput : unitSelect;
  if (totalSource instanceof Element) updateIngTotal(totalSource);
}

function applyImportedIngredients(ingredients) {
  const container = document.getElementById('supp-ingredients');
  if (!container || !ingredients.length) return;
  for (const row of container.querySelectorAll('.supp-ingredient-row')) {
    if (!getElementValue(row.querySelector('.supp-ing-name')).trim()) row.remove();
  }
  const rowsByName = new Map();
  for (const row of container.querySelectorAll('.supp-ingredient-row')) {
    const key = supplementImportIngredientKey(getElementValue(row.querySelector('.supp-ing-name')));
    if (key) rowsByName.set(key, row);
  }
  for (const ingredient of ingredients) {
    const key = supplementImportIngredientKey(ingredient.name);
    let row = rowsByName.get(key);
    if (!row) {
      container.insertAdjacentHTML('beforeend', ingredientRowHtml(container.children.length, ingredient.name || '', ingredient.amount || '', '', getOuterTimesFromForm(), ingredient));
      row = container.lastElementChild;
      if (row) rowsByName.set(key, row);
    }
    if (row) applyImportedIngredient(row, ingredient);
  }
}

/** @param {{ test: any, importIndex: number }[]} qualityTests */
function applyImportedQualityTests(qualityTests) {
  const container = document.getElementById('supp-quality-tests');
  if (!container || !qualityTests?.length) return;
  const qualityRowKey = (category, analyte, basis) => [
    category,
    supplementQualityKey(analyte),
    supplementQualityKey(basis),
  ].join('|');
  const rowsByKey = new Map();
  for (const row of container.querySelectorAll('.supp-quality-row')) {
    const analyte = getElementValue(row.querySelector('.supp-quality-analyte')).trim();
    const category = getElementValue(row.querySelector('.supp-quality-category'));
    const basis = getElementValue(row.querySelector('.supp-quality-basis')).trim();
    if (analyte) rowsByKey.set(qualityRowKey(category, analyte, basis), row);
  }
  for (const { test, importIndex } of qualityTests) {
    const key = qualityRowKey(test.category, test.analyte, test.basis);
    const existing = rowsByKey.get(key);
    if (existing) {
      if (existing instanceof HTMLElement) {
        existing.dataset.importIndex = String(importIndex);
        for (const [selector, value] of [
          ['.supp-quality-category', test.category || 'other'],
          ['.supp-quality-analyte', test.analyte || ''],
          ['.supp-quality-result', test.resultText || ''],
          ['.supp-quality-unit', test.unit || ''],
          ['.supp-quality-basis', test.basis || ''],
        ]) {
          const field = existing.querySelector(selector);
          if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) field.value = String(value);
        }
        const aiInput = existing.querySelector('.supp-quality-ai-context');
        if (aiInput instanceof HTMLInputElement) aiInput.checked = test.includeInAIContext !== false;
      }
      continue;
    }
    container.insertAdjacentHTML('beforeend', qualityTestRowHtml(container.children.length, test, -1, importIndex));
    if (container.lastElementChild) rowsByKey.set(key, container.lastElementChild);
  }
}

/** @param {'ingredient'|'inactive'|'quality'} kind @param {any[]} values */
function selectedImportValues(kind, values) {
  const inputs = Array.from(document.querySelectorAll(`[data-supp-import-kind="${kind}"]`));
  if (!inputs.length) return values;
  const selected = new Set(inputs
    .filter(input => input instanceof HTMLInputElement && input.checked)
    .map(input => Number.parseInt(input.getAttribute('data-supp-import-index') || '', 10)));
  return values.filter((_, index) => selected.has(index));
}

export function keepSafetyFocusedImportQuality() {
  const button = document.querySelector('[data-supp-action="quality-safety-only"]');
  const restoreAll = button instanceof HTMLButtonElement && button.dataset.filterMode === 'safety-only';
  for (const input of document.querySelectorAll('[data-supp-import-kind="quality"]')) {
    if (input instanceof HTMLInputElement) input.checked = restoreAll || ['contaminant', 'microbiology'].includes(input.dataset.suppImportCategory || '');
  }
  if (!(button instanceof HTMLButtonElement)) return;
  button.dataset.filterMode = restoreAll ? '' : 'safety-only';
  button.setAttribute('aria-pressed', restoreAll ? 'false' : 'true');
  button.textContent = restoreAll ? 'Select only contaminants + microbiology' : 'Restore all quality results';
  button.title = restoreAll
    ? 'Uncheck potency, identity, and other quality rows. No data is saved until you continue and confirm the form.'
    : 'Select every extracted quality row again.';
}

export function applySupplementImportDraft() {
  if (!pendingSupplementImport) return;
  const { draft } = pendingSupplementImport;
  const ingredients = selectedImportValues('ingredient', draft.ingredients || []);
  const inactiveIngredients = selectedImportValues('inactive', draft.inactiveIngredients || []);
  const qualityTests = selectedImportValues('quality', draft.qualityTests || []).map(test => ({
    test: { ...test, includeInAIContext: isSupplementQualityIncludedInAI(test, { ingredients }) },
    importIndex: draft.qualityTests.indexOf(test),
  }));
  const identityWasBlank = !getFormField('supp-name')?.value.trim();
  applyImportedIngredients(ingredients);
  applyImportedQualityTests(qualityTests);
  const inactiveInput = getFormField('supp-inactive-ingredients');
  if (inactiveInput && !inactiveInput.value.trim() && inactiveIngredients.length) inactiveInput.value = inactiveIngredients.join('\n');
  for (const [id, value] of [
    ['supp-name', draft.product], ['supp-brand', draft.brand], ['supp-dosage-form', draft.dosageForm],
    ['supp-generic-name', draft.genericName], ['supp-route', draft.route], ['supp-label-directions', draft.labelDirections],
    ['supp-serving-value', draft.servingSize?.value], ['supp-serving-unit', draft.servingSize?.unit],
  ]) setImportedFieldIfBlank(id, value);
  const typeInput = getFormField('supp-type');
  if (typeInput && draft.type && identityWasBlank) typeInput.value = draft.type;
  draft.source.reviewed = true;
  if (Array.isArray(draft.source.evidence)) draft.source.evidence.forEach(source => { source.reviewed = true; });
  showPendingImportReview();
  getFormField('supp-name')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  showNotification('Selected facts moved into editable fields. Nothing is saved until you confirm the form.', 'success');
}

export function discardSupplementImportDraft() {
  clearPendingSupplementImport();
  showPendingImportReview();
}

/** @param {Document} pageDocument @param {string} selector @param {number} [limit] */
function collectImportScriptText(pageDocument, selector, limit = 8000) {
  let output = '';
  for (const script of pageDocument.querySelectorAll(selector)) {
    const text = (script.textContent || '').trim();
    if (!text) continue;
    output += `${text.slice(0, Math.max(0, limit - output.length))}\n`;
    if (output.length >= limit) break;
  }
  return output;
}

/** @param {Document} pageDocument */
function collectImportPageText(pageDocument) {
  const body = /** @type {Element | null} */ (pageDocument.body?.cloneNode(true) || null);
  if (!body) return '';
  for (const element of body.querySelectorAll('script, style, noscript, template, nav, footer, header, svg')) {
    element.remove();
  }
  return (body.textContent || '').replace(/\s{2,}/gu, ' ').trim();
}

export async function fetchSupplementFromURL() {
  const rawUrl = getFieldValue('supp-url').trim();
  if (!rawUrl) { showNotification('Paste a product URL first', 'error'); return; }
  const parsedUrl = parseHttpUrl(rawUrl);
  if (!parsedUrl) { showNotification('Product URL must be http or https', 'error'); return; }
  const url = parsedUrl.toString();
  const progressId = startImportProgress(document.querySelector('.supp-url-fetch'), 'Reading product page…');
  let completed = false;
  try {
    const isLocal = ['localhost', '127.0.0.1'].includes(getUtilsRuntimeHostname());
    let html;
    if (isLocal) {
      const response = await fetch(`/api/fetch-page?url=${encodeURIComponent(url)}`);
      const responseText = await response.text();
      let json;
      try { json = JSON.parse(responseText); }
      catch { throw new Error(`Local page fetch returned an invalid response (HTTP ${response.status})`); }
      if (!response.ok || json.error || Number(json.status) >= 400) {
        const upstreamStatus = Number(json.status) >= 400 ? ` (website HTTP ${json.status})` : '';
        const blockedHint = [401, 403, 429].includes(Number(json.status)) ? ' The website blocks automated reading; use label photos for the facts it hides.' : '';
        throw new Error(`${json.error || 'Website did not allow the page to be read'}${upstreamStatus}.${blockedHint}`.trim());
      }
      html = json.html;
    } else {
      const response = await fetch('/api/proxy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxy_purpose: 'public-page', url, method: 'GET', headers: { Accept: 'text/html,application/xhtml+xml' } }),
      });
      const responseText = await response.text();
      if (!response.ok) {
        let message = `Website fetch failed (HTTP ${response.status})`;
        try { message = JSON.parse(responseText).error || message; } catch {}
        const hint = [401, 403, 429].includes(response.status) ? ' The website blocks automated reading; use label photos for the facts it hides.' : '';
        throw new Error(`${message}.${hint}`.trim());
      }
      html = responseText;
    }
    if (!html || html.length < 100) throw new Error('The website returned no readable product content. Try label photos for the missing facts.');
    updateImportProgress(progressId, 2, 'Finding label, ingredient, and COA tables…');
    const pageDocument = new DOMParser().parseFromString(html, 'text/html');
    const structuredPage = extractSupplementPageFacts(html);
    const pageFacts = { ...structuredPage.facts };
    const deterministicFields = [...new Set(structuredPage.deterministicFields)];
    const source = { kind: 'product URL', url, deterministicFields };
    const hasVerifiedIngredients = pageFacts.product && Array.isArray(pageFacts.ingredients) && pageFacts.ingredients.length;
    const hasCoreLabelContext = pageFacts.servingSize?.value != null || pageFacts.labelDirections;
    if (!hasAIProvider()) {
      updateImportProgress(progressId, 4, 'Preparing selective review…');
      stageParsedSupplement(pageFacts, source);
      completed = true;
      if (!hasVerifiedIngredients || !hasCoreLabelContext) showNotification('Verified page facts were staged. Configure AI or add label photos to classify ambiguous tables and fill missing facts.', 'info');
      return;
    }
    const ldText = collectImportScriptText(pageDocument, 'script[type="application/ld+json"]');
    const embeddedText = collectImportScriptText(
      pageDocument,
      'script[type="application/json"], script#__NEXT_DATA__',
    );
    const plainText = structuredPage.evidenceText || collectImportPageText(pageDocument);
    const trimmed = `${ldText.slice(0, 8000)}\n${embeddedText.slice(0, 8000)}\n${plainText.slice(0, 8000)}\n${plainText.slice(-3000)}`.slice(0, 24000);
    updateImportProgress(progressId, 3, 'Classifying active ingredients and quality evidence with AI…');
    const result = await callClaudeAPI({
      system: `Extract supplement or medication label facts from the supplied product page. ${SUPPLEMENT_EXTRACTION_SCHEMA_PROMPT}`,
      messages: [{ role: 'user', content: `${deterministicFields.length ? `Verified page facts (preserve these unless the user reviews a correction): ${JSON.stringify(pageFacts)}\n\n` : ''}${trimmed}` }],
      maxTokens: 6000,
    });
    let parsed;
    try { parsed = parseSupplementImportJson(result.text); }
    catch (error) {
      if (!pageFacts.product && !pageFacts.ingredients?.length) throw error;
      updateImportProgress(progressId, 4, 'Preparing verified fallback review…');
      stageParsedSupplement(pageFacts, source);
      completed = true;
      showNotification('The AI response was not valid JSON, so verified page facts were kept. Add label photos to fill anything missing.', 'info');
      return;
    }
    for (const field of deterministicFields) {
      const value = pageFacts[field];
      if (value && (!Array.isArray(value) || value.length)) parsed[field] = value;
    }
    updateImportProgress(progressId, 4, 'Preparing selective review…');
    stageParsedSupplement(parsed, source);
    completed = true;
  } catch (error) {
    if (isDebugMode()) console.warn('[fetchURL]', error);
    showNotification(`Review link failed: ${getErrorMessage(error, 'Unknown error')}`, 'error');
  } finally {
    finishImportProgress(progressId, completed);
  }
}
