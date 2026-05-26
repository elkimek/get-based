// supplements.js — Supplement/medication editor and dashboard section

import { state } from './state.js';
import { escapeHTML, showNotification, hashString, isDebugMode } from './utils.js';
import { saveImportedData, getActiveData } from './data.js';
import { callClaudeAPI, hasAIProvider, supportsVision } from './api.js';
import { resizeImage, isValidImageType, formatImageBlock, buildVisionContent } from './image-utils.js';
import { profileStorageKey } from './profile.js';
import { scanSupplementsForWarnings, humanizeEffect } from './supplement-warnings.js';

export function getSupplementPeriods(s) {
  if (s.periods && s.periods.length > 0) return s.periods;
  return [{ start: s.startDate, end: s.endDate }];
}

function _parseHttpUrl(raw) {
  const value = (raw || '').trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed : null;
  } catch {
    return null;
  }
}

function _sourceUrlParts(raw) {
  const parsed = _parseHttpUrl(raw);
  if (!parsed) return null;
  return {
    url: parsed.toString(),
    host: parsed.hostname.replace(/^www\./, '')
  };
}

export function renderSupplementsSection() {
  const supps = state.importedData.supplements || [];
  let html = `<div class="supp-timeline-section">
    <div class="supp-timeline-header">
      <span class="context-section-title">Supplements & Medications</span>
      <button class="supp-add-btn" onclick="openSupplementsEditor()">+ Add</button>
    </div>`;
  if (supps.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    let allDates = [];
    for (const s of supps) {
      for (const p of getSupplementPeriods(s)) {
        if (p.start) allDates.push(p.start);
        allDates.push(p.end || today);
      }
    }
    if (state.importedData.entries) {
      for (const e of state.importedData.entries) {
        if (e.date) allDates.push(e.date);
      }
    }
    // Drop empty / unparseable dates before sort — a supplement with
    // startDate:"" ("under discussion, not started yet") would otherwise
    // sort to position 0 and yield NaN in the toISOString below, crashing
    // the whole dashboard render.
    allDates = allDates.filter(d => d && !isNaN(new Date(d + 'T00:00:00').getTime()));
    if (allDates.length === 0) {
      // Edge case: every supplement is start-less and no entries yet.
      // Anchor to today so the timeline still renders something.
      allDates.push(today);
    }
    allDates.sort();
    const minDate = allDates[0];
    const maxDate = allDates[allDates.length - 1];
    const minT = new Date(minDate + 'T00:00:00').getTime();
    const maxT = new Date(maxDate + 'T00:00:00').getTime();
    const range = maxT - minT || 1;
    const fmtAxis = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const midDate = new Date((minT + maxT) / 2).toISOString().slice(0, 10);
    html += `<div class="supp-timeline">
      <div class="supp-timeline-axis">
        <span>${fmtAxis(minDate)}</span><span>${fmtAxis(midDate)}</span><span>${fmtAxis(maxDate)}</span>
      </div>`;
    for (let i = 0; i < supps.length; i++) {
      const s = supps[i];
      const isMed = s.type === 'medication';
      const typeCls = isMed ? 'supp-bar-medication' : 'supp-bar-supplement';
      const pds = getSupplementPeriods(s);
      let barsHtml = '';
      for (let pi = 0; pi < pds.length; pi++) {
        const p = pds[pi];
        const sT = new Date(p.start + 'T00:00:00').getTime();
        const eT = new Date((p.end || today) + 'T00:00:00').getTime();
        const leftPct = ((sT - minT) / range * 100).toFixed(2);
        const widthPct = (((eT - sT) / range) * 100).toFixed(2);
        const ongoingCls = !p.end ? ' supp-bar-ongoing' : '';
        // Gap marker between periods
        if (pi > 0 && pds[pi - 1].end) {
          const gapStart = new Date(pds[pi - 1].end + 'T00:00:00').getTime();
          const gapLeft = ((gapStart - minT) / range * 100).toFixed(2);
          const gapWidth = (((sT - gapStart) / range) * 100).toFixed(2);
          if (parseFloat(gapWidth) > 0.3) {
            barsHtml += `<div class="supp-bar-gap" style="left:${gapLeft}%;width:${gapWidth}%"></div>`;
          }
        }
        barsHtml += `<div class="supp-bar ${typeCls}${ongoingCls}" style="left:${leftPct}%;width:${Math.max(parseFloat(widthPct), 0.5)}%"></div>`;
      }
      const fullLabel = s.name + (s.dosage ? ' · ' + s.dosage : '');
      const shortName = s.name.replace(/,?\s*\d+\s*x?\s*(?:ml|g|kg|oz|fl\.?\s*oz|caps(?:ules?)?|tabs?|tablets?|softgels?|ct)\b.*$/i, '').trim() || s.name;
      html += `<div class="supp-bar-row" role="button" tabindex="0" aria-label="Edit ${escapeHTML(fullLabel)}" onclick="openSupplementsEditor(${i})">
        <span class="supp-bar-label" title="${escapeHTML(fullLabel)}">${escapeHTML(shortName)}</span>
        <div class="supp-bar-track">${barsHtml}</div>
      </div>`;
    }
    html += `</div>`;
    // Mitochondrial harm warnings (only flags harmful effects, not protective)
    const mitoWarnings = scanSupplementsForWarnings(supps);
    if (mitoWarnings.length > 0) {
      html += `<div class="supp-mitotox">`;
      html += `<div class="supp-mitotox-header">Mitochondrial effects \u2014 <span class="supp-mitotox-ask" onclick="askAIMitoContext()">ask AI for context</span></div>`;
      for (const w of mitoWarnings) {
        const top = w.effects.slice(0, 2).map(e => humanizeEffect(e, { showContext: true })).join(' and ');
        html += `<div class="supp-mitotox-item">\u26A0\uFE0F <strong>${escapeHTML(w.match)}</strong>: ${escapeHTML(top)} <a href="${w.url}" target="_blank" rel="noopener" class="supp-mitotox-link">primary study</a> <a href="${w.searchUrl}" target="_blank" rel="noopener" class="supp-mitotox-link">more studies</a></div>`;
      }
      html += `</div>`;
    }
  } else {
    html += `<div class="supp-timeline"><div class="supp-empty">No supplements or medications tracked yet</div></div>`;
  }
  html += `</div>`;
  return html;
}

// Extract numeric value + unit from amount strings like "890mg", "500 IU", "25 mcg", "5,4 mg".
// Handles both dot and comma decimal separators. Returns null for pure text ("once daily").
export function parseAmount(str) {
  if (!str || typeof str !== 'string') return null;
  const match = str.trim().match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-Zµμ]+)?/);
  if (!match) return null;
  const value = parseFloat(match[1].replace(',', '.'));
  if (!isFinite(value)) return null;
  const unit = (match[2] || '').trim();
  return { value, unit };
}

// Effective timesPerDay for an ingredient: row override wins, else the supp-level default.
export function effectiveTimesPerDay(ing, supp) {
  if (ing && (ing.timesPerDay === 0 || ing.timesPerDay)) return Number(ing.timesPerDay);
  if (supp && (supp.timesPerDay === 0 || supp.timesPerDay)) return Number(supp.timesPerDay);
  return null;
}

// Compute daily total when amount is parseable and there's an effective timesPerDay.
export function ingredientDailyTotal(ing, supp) {
  const times = effectiveTimesPerDay(ing, supp);
  if (!ing || !times) return null;
  const parsed = parseAmount(ing.amount);
  if (!parsed) return null;
  const total = parsed.value * times;
  if (!isFinite(total)) return null;
  return { value: total, unit: parsed.unit, times };
}

function _formatTotal(total) {
  if (!total) return '';
  const v = total.value % 1 === 0 ? total.value.toString() : total.value.toFixed(2).replace(/\.?0+$/, '');
  return `${v}${total.unit ? ' ' + total.unit : ''}/day`;
}

function _ingredientRowHtml(idx, name = '', amount = '', timesPerDay = '', outerTimes = '') {
  const rowTimes = timesPerDay === 0 || timesPerDay ? String(timesPerDay) : '';
  const effective = rowTimes || outerTimes;
  const total = effective ? ingredientDailyTotal({ amount, timesPerDay: effective }) : null;
  return `<div class="supp-ingredient-row" data-idx="${idx}">
    <input type="text" class="supp-ing-name" placeholder="Ingredient" value="${escapeHTML(name)}">
    <input type="text" class="supp-ing-amount" placeholder="Per dose" value="${escapeHTML(amount)}" oninput="updateIngTotal(this)">
    <input type="number" class="supp-ing-times" placeholder="×/day" min="0" max="99" step="0.5" value="${escapeHTML(rowTimes)}" oninput="updateIngTotal(this)">
    <span class="supp-ing-total">${total ? escapeHTML(_formatTotal(total)) : ''}</span>
    <button class="supp-ing-remove" onclick="removeIngredientRow(this)" title="Remove">&times;</button>
  </div>`;
}

function _getOuterTimesFromForm() {
  const el = document.getElementById('supp-times');
  return el && el.value ? el.value.trim() : '';
}

function updateIngTotal(inputEl) {
  const row = inputEl.closest('.supp-ingredient-row');
  if (!row) return;
  const amount = row.querySelector('.supp-ing-amount')?.value || '';
  const rowTimes = row.querySelector('.supp-ing-times')?.value || '';
  const totalEl = row.querySelector('.supp-ing-total');
  if (!totalEl) return;
  const effective = rowTimes || _getOuterTimesFromForm();
  const total = effective ? ingredientDailyTotal({ amount, timesPerDay: effective }) : null;
  totalEl.textContent = total ? _formatTotal(total) : '';
}

function updateAllIngTotals() {
  const rows = document.querySelectorAll('#supp-ingredients .supp-ingredient-row');
  for (const row of rows) {
    const amountInput = row.querySelector('.supp-ing-amount');
    if (amountInput) updateIngTotal(amountInput);
  }
}

function addIngredientRow() {
  const container = document.getElementById('supp-ingredients');
  if (!container) return;
  const idx = container.children.length;
  container.insertAdjacentHTML('beforeend', _ingredientRowHtml(idx, '', '', '', _getOuterTimesFromForm()));
  const rows = container.querySelectorAll('.supp-ing-name');
  if (rows.length) rows[rows.length - 1].focus();
}

function removeIngredientRow(btn) {
  btn.closest('.supp-ingredient-row')?.remove();
}

function _periodRowHtml(idx, start = '', end = '', showRemove = true) {
  return `<div class="supp-period-row" data-idx="${idx}">
    <input type="date" class="supp-period-start" value="${start}">
    <span class="supp-period-arrow">&rarr;</span>
    <input type="date" class="supp-period-end" value="${end}" placeholder="ongoing">
    <button class="supp-period-remove" onclick="removePeriodRow(this)" title="Remove"${showRemove ? '' : ' style="display:none"'}>&times;</button>
  </div>`;
}

function addPeriodRow() {
  const container = document.getElementById('supp-periods');
  if (!container) return;
  const idx = container.children.length;
  container.insertAdjacentHTML('beforeend', _periodRowHtml(idx));
  // Show all remove buttons when 2+ rows
  for (const btn of container.querySelectorAll('.supp-period-remove')) btn.style.display = '';
}

function removePeriodRow(btn) {
  const container = document.getElementById('supp-periods');
  if (!container) return;
  btn.closest('.supp-period-row')?.remove();
  const rows = container.querySelectorAll('.supp-period-row');
  if (rows.length === 1) {
    const rem = rows[0].querySelector('.supp-period-remove');
    if (rem) rem.style.display = 'none';
  }
}

function _collectPeriods() {
  const rows = document.querySelectorAll('#supp-periods .supp-period-row');
  const periods = [];
  for (const row of rows) {
    const start = row.querySelector('.supp-period-start')?.value;
    const end = row.querySelector('.supp-period-end')?.value || null;
    if (start) periods.push({ start, end });
  }
  return periods;
}

function _collectIngredients() {
  const rows = document.querySelectorAll('#supp-ingredients .supp-ingredient-row');
  const ingredients = [];
  for (const row of rows) {
    const name = row.querySelector('.supp-ing-name')?.value.trim();
    const amount = row.querySelector('.supp-ing-amount')?.value.trim();
    const timesRaw = row.querySelector('.supp-ing-times')?.value.trim();
    if (!name) continue;
    const ing = { name, amount };
    const times = timesRaw ? parseFloat(timesRaw) : NaN;
    if (isFinite(times) && times > 0) ing.timesPerDay = times;
    ingredients.push(ing);
  }
  return ingredients.length > 0 ? ingredients : undefined;
}

async function scanSupplementLabel(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file || !isValidImageType(file.type)) { showNotification('Please select an image (JPG, PNG, WebP)', 'error'); return; }
  const scanBtn = document.querySelector('.supp-scan-label');
  if (scanBtn) { scanBtn.textContent = 'Scanning...'; scanBtn.disabled = true; }
  try {
    const { base64, mediaType } = await resizeImage(file, 1024, 0.85);
    const imageBlock = formatImageBlock(base64, mediaType);
    const content = buildVisionContent([imageBlock], 'Extract product name and active ingredients from this supplement/medication label. Reply with ONLY JSON: {"product":"product name","dosage":"serving size e.g. 2 capsules/day","ingredients":[{"name":"ingredient","amount":"per serving"},...]}\nOnly active ingredients — skip fillers, excipients, binders, coatings, flavors, sweeteners. No other text.');
    const result = await callClaudeAPI({ messages: [{ role: 'user', content }], maxTokens: 2000 });
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { showNotification('Could not parse label from image', 'error'); return; }
    _applyParsedSupplement(JSON.parse(jsonMatch[0]));
  } catch (e) {
    if (isDebugMode()) console.warn('[scanLabel]', e);
    showNotification('Failed to scan label: ' + (e.message || 'Unknown error'), 'error');
  } finally {
    if (scanBtn) { scanBtn.textContent = 'Scan label'; scanBtn.disabled = false; }
  }
}

function _applyParsedSupplement(parsed) {
  const ingredients = parsed.ingredients || parsed;
  if (Array.isArray(ingredients) && ingredients.length > 0) {
    const container = document.getElementById('supp-ingredients');
    if (container) {
      container.innerHTML = '';
      for (let i = 0; i < ingredients.length; i++) {
        const ing = ingredients[i];
        container.insertAdjacentHTML('beforeend', _ingredientRowHtml(i, ing.name || '', ing.amount || '', '', _getOuterTimesFromForm()));
      }
    }
    showNotification(`${ingredients.length} ingredients extracted`, 'success');
  }
  const _valid = v => v && !/not (specified|found|available|provided)/i.test(v) && !/n\/?a/i.test(v);
  const nameInput = document.getElementById('supp-name');
  if (nameInput && !nameInput.value.trim() && _valid(parsed.product)) nameInput.value = parsed.product;
  const dosageInput = document.getElementById('supp-dosage');
  if (dosageInput && !dosageInput.value.trim() && _valid(parsed.dosage)) dosageInput.value = parsed.dosage;
}

async function fetchSupplementFromURL() {
  const urlInput = document.getElementById('supp-url');
  const rawUrl = urlInput?.value.trim();
  if (!rawUrl) { showNotification('Paste a product URL first', 'error'); return; }
  const parsedUrl = _parseHttpUrl(rawUrl);
  if (!parsedUrl) { showNotification('Product URL must be http or https', 'error'); return; }
  const url = parsedUrl.toString();
  const btn = document.querySelector('.supp-url-fetch');
  if (btn) { btn.textContent = 'Fetching...'; btn.disabled = true; }
  try {
    // Fetch page HTML — use /api/fetch-page on localhost, proxy GET on hosted
    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    let html;
    if (isLocal) {
      const res = await fetch('/api/fetch-page?url=' + encodeURIComponent(url));
      const json = await res.json();
      html = json.html;
    } else {
      const res = await fetch('/api/proxy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, method: 'GET', headers: {} })
      });
      html = await res.text();
    }
    if (!html || html.length < 100) { showNotification('Could not fetch page content', 'error'); return; }
    // Extract JSON-LD structured data (has product description with dosage/ingredients)
    const ldMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    let ldText = '';
    for (const m of ldMatches) {
      const inner = m.replace(/<script[^>]*>|<\/script>/gi, '').trim();
      if (/ingredient|supplement|serving|dosage|vitamin|capsule|tablet|složení|dávkování/i.test(inner)) ldText += inner + '\n';
    }
    // Strip non-content elements to plain text
    const plainText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ');
    // Extract paragraphs near supplement-relevant keywords to capture ingredient tables
    const kwPattern = /(.{0,300}(?:ingredient|supplement.fact|serving size|složení|dávkování|výživové|nutritional|active).{0,500})/gi;
    const kwMatches = plainText.match(kwPattern) || [];
    const kwText = kwMatches.join('\n');
    // Combine: JSON-LD + keyword-adjacent text + beginning of page (product name/description)
    const trimmed = (ldText + '\n' + kwText + '\n' + plainText.slice(0, 5000)).slice(0, 15000);
    const result = await callClaudeAPI({
      system: 'Extract supplement/medication info from this product page. Reply with ONLY JSON: {"product":"name","dosage":"serving size e.g. 2 capsules/day","ingredients":[{"name":"ingredient","amount":"per serving"},...]}\nOnly active ingredients — skip fillers, excipients, binders, coatings, flavors, sweeteners. Use null for fields not found. No other text.',
      messages: [{ role: 'user', content: trimmed }],
      maxTokens: 2000
    });
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { showNotification('Could not parse product info', 'error'); return; }
    _applyParsedSupplement(JSON.parse(jsonMatch[0]));
  } catch (e) {
    if (isDebugMode()) console.warn('[fetchURL]', e);
    showNotification('Failed to fetch: ' + (e.message || 'Unknown error'), 'error');
  } finally {
    if (btn) { btn.textContent = 'Fetch'; btn.disabled = false; }
  }
}

function _suppFormHtml(editIdx, s) {
  const editing = !!s;
  const ingredients = editing && s.ingredients ? s.ingredients : [];
  const periods = editing ? getSupplementPeriods(s) : [{ start: new Date().toISOString().slice(0, 10), end: null }];
  const sourceUrl = editing && s.sourceUrl ? s.sourceUrl : '';
  return `<div class="supp-form" id="supp-form-panel">
    <div class="supp-form-row supp-url-row">
      <div class="supp-form-field" style="flex:1"><label>Product URL <span style="font-weight:normal;color:var(--text-muted)">(saved for reference${hasAIProvider() ? '; Fetch auto-fills' : ''})</span></label>
        <div class="supp-url-input-row">
          <input type="url" id="supp-url" placeholder="https://..." autocomplete="off" value="${escapeHTML(sourceUrl)}">
          ${hasAIProvider() ? `<button class="supp-url-fetch" onclick="fetchSupplementFromURL()">Fetch</button>` : ''}
        </div>
      </div>
    </div>
    <div class="supp-form-row">
      <div class="supp-form-field"><label>Name</label>
        <input type="text" id="supp-name" placeholder="e.g. Creatine, Metformin" value="${editing ? escapeHTML(s.name) : ''}">
      </div>
      <div class="supp-form-field"><label>Dosage <span style="font-weight:normal;color:var(--text-muted)">(free text)</span></label>
        <input type="text" id="supp-dosage" placeholder="e.g. with food, before bed" value="${editing ? escapeHTML(s.dosage || '') : ''}">
      </div>
      <div class="supp-form-field" style="flex:0 0 100px"><label>Doses/day</label>
        <input type="number" id="supp-times" placeholder="e.g. 2" min="0" max="99" step="0.5" value="${editing && s.timesPerDay != null ? escapeHTML(String(s.timesPerDay)) : ''}" oninput="updateAllIngTotals()">
      </div>
    </div>
    <div class="supp-form-row">
      <div class="supp-form-field"><label>Type</label>
        <select id="supp-type">
          <option value="supplement"${editing && s.type === 'medication' ? '' : ' selected'}>Supplement</option>
          <option value="medication"${editing && s.type === 'medication' ? ' selected' : ''}>Medication</option>
        </select>
      </div>
      <div class="supp-form-field" style="flex:2"><label>Periods <span style="font-weight:normal;color:var(--text-muted)">(blank end = ongoing)</span></label>
        <div id="supp-periods">${periods.map((p, i) => _periodRowHtml(i, p.start, p.end || '', periods.length > 1)).join('')}</div>
        <div class="supp-period-actions"><button class="supp-period-add" onclick="addPeriodRow()">+ Add period</button></div>
      </div>
    </div>
    <div class="supp-form-row">
      <div class="supp-form-field" style="flex:1"><label>Ingredients</label>
        <div id="supp-ingredients">${ingredients.map((ing, i) => _ingredientRowHtml(i, ing.name, ing.amount, ing.timesPerDay, editing && s.timesPerDay ? s.timesPerDay : '')).join('')}</div>
        <div class="supp-ingredient-actions">
          <button class="supp-ingredient-add" onclick="addIngredientRow()">+ Add</button>
          ${hasAIProvider() && supportsVision() ? `<button class="supp-ingredient-add supp-scan-label" onclick="document.getElementById('supp-label-input').click()">Scan label</button>
          <input type="file" id="supp-label-input" accept="image/*" capture="environment" style="display:none" onchange="scanSupplementLabel(this)">` : ''}
        </div>
      </div>
    </div>
    <div class="supp-form-row">
      <div class="supp-form-field" style="flex:1"><label>Note / Reason</label>
        <input type="text" id="supp-note" placeholder="e.g. For low vitamin D, recommended by Dr. Smith" value="${editing ? escapeHTML(s.note || '') : ''}">
      </div>
    </div>
    <div class="note-editor-actions">
      <button class="import-btn import-btn-primary" onclick="saveSupplement(${editIdx})">${editing ? 'Update' : 'Add'}</button>
      ${editing ? `<button class="import-btn import-btn-secondary" style="color:var(--danger,#ef4444);border-color:var(--danger,#ef4444)" onclick="deleteSupplement(${editIdx})">Delete</button>` : ''}
      <button class="import-btn import-btn-secondary" onclick="${editing ? `toggleSuppAccordion(${editIdx})` : 'showAddSuppForm()'}">Cancel</button>
    </div>
  </div>`;
}

export function toggleSuppAccordion(idx) {
  // Close the "Add New" form if open to prevent duplicate IDs
  const addArea = document.getElementById('supp-add-form-area');
  if (addArea) addArea.innerHTML = '';
  const existing = document.querySelector('.supp-list-expanded');
  const clickedRow = document.querySelector(`.supp-list-item[data-idx="${idx}"]`);
  // Collapse currently expanded
  if (existing) {
    const oldIdx = parseInt(existing.dataset.expandedIdx);
    existing.remove();
    const oldRow = document.querySelector(`.supp-list-item[data-idx="${oldIdx}"]`);
    if (oldRow) oldRow.classList.remove('supp-list-item-active');
    if (oldIdx === idx) return; // toggle off
  }
  if (!clickedRow) return;
  clickedRow.classList.add('supp-list-item-active');
  const supps = state.importedData.supplements || [];
  const s = supps[idx];
  if (!s) return;
  const expandedHtml = `<div class="supp-list-expanded" data-expanded-idx="${idx}">
    ${renderSupplementImpact(s, idx)}
    ${_suppFormHtml(idx, s)}
  </div>`;
  clickedRow.insertAdjacentHTML('afterend', expandedHtml);
  // Scroll the expanded panel into view
  const panel = document.querySelector('.supp-list-expanded');
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function openSupplementsEditor(editIdx) {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const supps = state.importedData.supplements || [];
  const isEdit = typeof editIdx === 'number' && !!supps[editIdx];
  let html = `<button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>Supplements & Medications</h3>
    <div class="modal-unit">Track what you're taking and when. Click a supplement to edit it.</div>`;
  if (supps.length > 0) {
    html += `<div class="supp-list">`;
    const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    for (let i = 0; i < supps.length; i++) {
      const s = supps[i];
      const isMed = s.type === 'medication';
      const icon = isMed ? '\uD83D\uDC8A' : '\uD83D\uDCA7';
      const pds = getSupplementPeriods(s);
      const dateRange = pds.length === 1
        ? `${fmtDate(pds[0].start)} \u2192 ${pds[0].end ? fmtDate(pds[0].end) : 'ongoing'}`
        : pds.map(p => `${fmtDate(p.start)}\u2192${p.end ? fmtDate(p.end) : 'now'}`).join(' \u00b7 ');
      const source = _sourceUrlParts(s.sourceUrl);
      html += `<div class="supp-list-item${isEdit && editIdx === i ? ' supp-list-item-active' : ''}" data-idx="${i}" onclick="toggleSuppAccordion(${i})">
        <span class="supp-list-icon">${icon}</span>
        <div class="supp-list-info">
          <div class="supp-list-name">${escapeHTML(s.name)}${s.dosage ? ` <span class="supp-list-meta">${escapeHTML(s.dosage)}</span>` : ''}</div>
          <div class="supp-list-meta">${dateRange}${source ? ` &middot; <a href="${escapeHTML(source.url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="supp-list-source">${escapeHTML(source.host)} ↗</a>` : ''}</div>
          ${s.ingredients?.length ? `<div class="supp-list-ingredients">${s.ingredients.map(ing => {
            const total = ingredientDailyTotal(ing, s);
            const times = effectiveTimesPerDay(ing, s);
            const timesStr = times && times > 1 ? ` × ${times}/day` : '';
            const totalStr = total ? ` → ${_formatTotal(total)}` : '';
            return `<span class="supp-ing-pill">${escapeHTML(ing.name)}${ing.amount ? ` ${escapeHTML(ing.amount)}` : ''}${escapeHTML(timesStr)}${escapeHTML(totalStr)}</span>`;
          }).join('')}</div>` : ''}
          ${s.note ? `<div class="supp-list-note">${escapeHTML(s.note)}</div>` : ''}
        </div>
      </div>`;
      // If this row should be pre-expanded (clicked from dashboard)
      if (isEdit && editIdx === i) {
        html += `<div class="supp-list-expanded" data-expanded-idx="${i}">
          ${renderSupplementImpact(s, i)}
          ${_suppFormHtml(i, s)}
        </div>`;
      }
    }
    html += `</div>`;
  }
  // Add New button — opens form at end
  html += `<div class="supp-add-section">
    <button class="supp-add-btn" onclick="showAddSuppForm()">+ Add New</button>
    <div id="supp-add-form-area"></div>
  </div>`;
  modal.innerHTML = html;
  overlay.classList.add("show");
  if (isEdit) {
    const expanded = document.querySelector('.supp-list-expanded');
    if (expanded) setTimeout(() => expanded.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
  }
}

export function showAddSuppForm() {
  const area = document.getElementById('supp-add-form-area');
  if (!area) return;
  if (area.innerHTML.trim()) { area.innerHTML = ''; return; } // toggle off
  // Collapse any open accordion to prevent duplicate IDs
  const existing = document.querySelector('.supp-list-expanded');
  if (existing) {
    const oldIdx = parseInt(existing.dataset.expandedIdx);
    existing.remove();
    const oldRow = document.querySelector(`.supp-list-item[data-idx="${oldIdx}"]`);
    if (oldRow) oldRow.classList.remove('supp-list-item-active');
  }
  area.innerHTML = _suppFormHtml(-1, null);
  setTimeout(() => {
    const nameInput = document.getElementById('supp-name');
    if (nameInput) nameInput.focus();
    area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 50);
}

export function saveSupplement(idx) {
  const name = document.getElementById('supp-name').value.trim();
  const dosage = document.getElementById('supp-dosage').value.trim();
  const type = document.getElementById('supp-type').value;
  if (!name) { showNotification('Name is required', 'error'); return; }
  const collectedPeriods = _collectPeriods();
  if (collectedPeriods.length === 0) { showNotification('At least one period is required', 'error'); return; }
  for (const p of collectedPeriods) {
    if (!p.start) { showNotification('Each period needs a start date', 'error'); return; }
    if (p.end && p.end < p.start) { showNotification('Period end must be after start', 'error'); return; }
  }
  const sorted = [...collectedPeriods].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 0; i < sorted.length - 1; i++) {
    if ((sorted[i].end || '9999-12-31') > sorted[i + 1].start) { showNotification('Periods must not overlap', 'error'); return; }
  }
  const startDate = sorted[0].start;
  const endDate = sorted[sorted.length - 1].end;
  const note = document.getElementById('supp-note').value.trim();
  const ingredients = _collectIngredients();
  const timesRaw = document.getElementById('supp-times')?.value.trim();
  const timesNum = timesRaw ? parseFloat(timesRaw) : NaN;
  const sourceUrlRaw = document.getElementById('supp-url')?.value.trim() || '';
  let parsedSourceUrl = null;
  if (sourceUrlRaw) {
    try {
      parsedSourceUrl = new URL(sourceUrlRaw);
      if (parsedSourceUrl.protocol !== 'http:' && parsedSourceUrl.protocol !== 'https:') {
        showNotification('Product URL must be http or https', 'error');
        return;
      }
    } catch {
      showNotification('Invalid product URL', 'error');
      return;
    }
  }
  if (!state.importedData.supplements) state.importedData.supplements = [];
  const entry = { name, dosage, startDate, endDate, type, note };
  if (sorted.length > 1) entry.periods = sorted;
  if (ingredients) entry.ingredients = ingredients;
  if (isFinite(timesNum) && timesNum > 0) entry.timesPerDay = timesNum;
  if (parsedSourceUrl) entry.sourceUrl = parsedSourceUrl.toString();
  if (idx >= 0) {
    state.importedData.supplements[idx] = entry;
  } else {
    state.importedData.supplements.push(entry);
  }
  saveImportedData();
  showNotification(idx >= 0 ? 'Supplement updated' : 'Supplement added', 'success');
  // Re-render dashboard supplements section
  const el = document.querySelector('.supp-timeline-section');
  if (el) el.outerHTML = renderSupplementsSection();
  // Re-render modal with the saved supplement expanded
  const savedIdx = idx >= 0 ? idx : state.importedData.supplements.length - 1;
  openSupplementsEditor(savedIdx);
}

export function deleteSupplement(idx) {
  if (!state.importedData.supplements || !state.importedData.supplements[idx]) return;
  const name = state.importedData.supplements[idx].name;
  state.importedData.supplements.splice(idx, 1);
  saveImportedData();
  showNotification(`"${name}" removed`, 'info');
  // Re-render dashboard supplements section
  const el = document.querySelector('.supp-timeline-section');
  if (el) el.outerHTML = renderSupplementsSection();
  // Re-render the modal with remaining supplements
  if (state.importedData.supplements.length > 0) {
    openSupplementsEditor();
  } else {
    window.closeModal();
    const activeNav = document.querySelector(".nav-item.active");
    window.navigate(activeNav ? activeNav.dataset.category : "dashboard");
  }
}

function askAIMitoContext() {
  document.querySelector('[aria-label="Ask AI"]')?.click();
  setTimeout(() => {
    const ta = document.querySelector('textarea.chat-input');
    if (ta) {
      ta.value = 'Explain the mitochondrial effects of my current supplements and medications. Which ones should I be concerned about and why?';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
    }
  }, 500);
}

// ═══════════════════════════════════════════════
// Supplement-Biomarker Impact Analysis
// ═══════════════════════════════════════════════

export function computeSupplementImpact(supplement, markerKey, markerName, unit, values, dates, refMin, refMax) {
  if (!values || !dates || values.length !== dates.length) return null;
  const pds = getSupplementPeriods(supplement);
  const sortedPds = [...pds].sort((a, b) => a.start.localeCompare(b.start));
  const firstStart = sortedPds[0].start;
  const isInPeriod = (date) => sortedPds.some(p => date >= p.start && (!p.end || date <= p.end));
  const beforeValues = [], afterValues = [];
  for (let i = 0; i < dates.length; i++) {
    if (values[i] === null) continue;
    if (dates[i] < firstStart) {
      beforeValues.push(values[i]);
    } else if (isInPeriod(dates[i])) {
      afterValues.push(values[i]);
    }
  }
  if (beforeValues.length === 0 && afterValues.length === 0) return null;
  const mean = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
  const beforeMean = beforeValues.length > 0 ? mean(beforeValues) : null;
  const afterMean = afterValues.length > 0 ? mean(afterValues) : null;
  let pctChange = null, direction = 'stable';
  if (beforeMean !== null && afterMean !== null && beforeMean !== 0) {
    pctChange = ((afterMean - beforeMean) / Math.abs(beforeMean)) * 100;
    direction = Math.abs(pctChange) < 1 ? 'stable' : pctChange > 0 ? 'up' : 'down';
  }
  let confidence = 'low';
  if (beforeValues.length >= 3 && afterValues.length >= 3) confidence = 'high';
  else if (beforeValues.length >= 2 && afterValues.length >= 2) confidence = 'moderate';
  return {
    marker: markerKey, markerName, unit,
    beforeMean, afterMean, pctChange, direction, confidence,
    nBefore: beforeValues.length, nAfter: afterValues.length,
    refMin, refMax
  };
}

export function computeAllImpacts(supplement, data) {
  if (!data || !data.categories || !data.dates) return [];
  const results = [];
  for (const [catKey, cat] of Object.entries(data.categories)) {
    for (const [mKey, marker] of Object.entries(cat.markers)) {
      const dotKey = catKey + '.' + mKey;
      const impact = computeSupplementImpact(
        supplement, dotKey, marker.name, marker.unit,
        marker.values, data.dates, marker.refMin, marker.refMax
      );
      if (impact && impact.pctChange !== null && Math.abs(impact.pctChange) >= 1) {
        results.push(impact);
      }
    }
  }
  results.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));
  return results;
}

function getOverlappingSupplements(supplement, supps) {
  const sPds = getSupplementPeriods(supplement);
  return supps.filter(s => {
    if (s === supplement) return false;
    const oPds = getSupplementPeriods(s);
    return sPds.some(sp => oPds.some(op => {
      const sEnd = sp.end || '9999-12-31';
      const oEnd = op.end || '9999-12-31';
      return sp.start <= oEnd && op.start <= sEnd;
    }));
  });
}

// Per-supplement fingerprint: changes when that supp's edit-visible fields or lab dates change.
// Editing dosage/ingredients/periods for one supp invalidates only that supp's cache entry.
function getSuppFingerprint(supp, data) {
  const labPart = (data.dates || []).join(',');
  const pds = getSupplementPeriods(supp);
  const ings = (supp.ingredients || []).map(i => `${i.name}:${i.amount || ''}:${i.timesPerDay || ''}`).join(',');
  const suppPart = `${supp.name}|${supp.dosage || ''}|${supp.timesPerDay || ''}|${supp.type || ''}|${ings}|${pds.map(p => p.start + '~' + (p.end || '')).join(',')}`;
  return hashString(labPart + '||' + suppPart);
}

function getImpactCache() {
  try {
    const key = profileStorageKey(state.currentProfile, 'suppImpact');
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    // Migrate old batch-fingerprint schema (values without `fp` field) by discarding
    for (const k of Object.keys(parsed)) {
      if (!parsed[k] || typeof parsed[k] !== 'object' || typeof parsed[k].fp !== 'string') delete parsed[k];
    }
    return parsed;
  } catch { return {}; }
}

function setImpactCache(cache) {
  try {
    const key = profileStorageKey(state.currentProfile, 'suppImpact');
    localStorage.setItem(key, JSON.stringify(cache));
  } catch { /* quota exceeded */ }
}

// Debounced queue: coalesces multiple render calls into a single AI request for only the stale/missing supps.
let _pendingAnalyses = new Map(); // suppName → { supplement, editIdx }
let _analyzeTimer = null;
let _batchPromise = null;

export function renderSupplementImpact(supplement, editIdx) {
  const hasAI = hasAIProvider();
  const data = getActiveData();
  if (!data || !data.dates || data.dates.length < 2) {
    return `<div class="supp-impact-section"><div class="supp-impact-header"><span class="ctx-health-dot ctx-health-dot-gray"></span><span>Impact Analysis</span></div><div class="supp-impact-hint">Needs at least 2 lab dates to compare</div></div>`;
  }
  const impacts = computeAllImpacts(supplement, data);
  if (impacts.length === 0) {
    const hasAfter = data.dates.some(d => d >= supplement.startDate);
    const hasBefore = data.dates.some(d => d < supplement.startDate);
    const hint = !hasBefore ? 'No lab results from before this supplement was started'
      : !hasAfter ? 'No lab results since starting this supplement'
      : 'No significant marker changes detected yet';
    return `<div class="supp-impact-section"><div class="supp-impact-header"><span class="ctx-health-dot ctx-health-dot-gray"></span><span>Impact Analysis</span></div><div class="supp-impact-hint">${hint}</div></div>`;
  }

  const fp = getSuppFingerprint(supplement, data);
  const cache = getImpactCache();
  const entry = cache[supplement.name];
  const cached = (entry && entry.fp === fp) ? entry : null;

  const dotColor = cached ? `ctx-health-dot-${cached.dot}` : (hasAI ? 'ctx-health-dot-shimmer' : 'ctx-health-dot-gray');
  const summaryClass = cached ? `supp-impact-summary-visible supp-impact-summary-${cached.dot}` : '';
  const summaryText = cached ? escapeHTML(cached.summary) : (hasAI ? '' : 'Set up an AI provider for impact insights');

  const html = `<div class="supp-impact-section">
    <div class="supp-impact-header">
      <span class="ctx-health-dot ${dotColor}" id="supp-impact-dot-${editIdx}"></span>
      <span>Impact Analysis</span>
      ${cached && hasAI ? `<button class="supp-impact-refresh" onclick="refreshSupplementImpact(${editIdx})" title="Re-analyze with current data">refresh</button>` : ''}
    </div>
    <div class="supp-impact-summary ${summaryClass}" id="supp-impact-summary-${editIdx}">${summaryText}</div>
  </div>`;

  // Auto-fire only if fingerprint mismatch (edit) or missing entirely — scoped to this supp only.
  if (!cached && hasAI) scheduleAnalyze(supplement, editIdx, data);
  return html;
}

function scheduleAnalyze(supplement, editIdx, data) {
  _pendingAnalyses.set(supplement.name, { supplement, editIdx });
  if (_analyzeTimer) return;
  _analyzeTimer = setTimeout(() => { _analyzeTimer = null; flushAnalyses(data); }, 50);
}

async function flushAnalyses(data) {
  const pending = [..._pendingAnalyses.values()];
  _pendingAnalyses.clear();
  if (pending.length === 0) return;
  if (_batchPromise) await _batchPromise;
  await loadImpactsForSupps(pending, data);
}

async function loadImpactsForSupps(pending, data) {
  const allSupps = state.importedData.supplements || [];
  const suppEntries = [];
  for (const { supplement: s, editIdx } of pending) {
    const impacts = computeAllImpacts(s, data);
    if (impacts.length === 0) continue;
    suppEntries.push({ supplement: s, impacts, editIdx });
  }
  if (suppEntries.length === 0) return;

  const fmtVal = v => v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  let ctx = `Analyze ${suppEntries.length} supplement${suppEntries.length === 1 ? '' : 's'}:\n`;
  for (const { supplement: s, impacts } of suppEntries) {
    const top = impacts.slice(0, 5);
    const overlapping = getOverlappingSupplements(s, allSupps);
    const pds = getSupplementPeriods(s);
    const pdStr = pds.length === 1
      ? `since ${pds[0].start}${pds[0].end ? ' until ' + pds[0].end : ''}`
      : `CYCLING: ${pds.map(p => p.start + ' to ' + (p.end || 'ongoing')).join('; ')}`;
    ctx += `\n[${s.name}] ${s.dosage || ''} (${s.type}) ${pdStr}`;
    if (s.ingredients?.length) ctx += ` ingredients: ${s.ingredients.map(ing => {
      const total = ingredientDailyTotal(ing, s);
      const times = effectiveTimesPerDay(ing, s);
      if (total) return `${ing.name} ${ing.amount} × ${times}/day = ${_formatTotal(total)}`;
      if (times) return `${ing.name}${ing.amount ? ' ' + ing.amount : ''} × ${times}/day`;
      return `${ing.name}${ing.amount ? ' ' + ing.amount : ''}`;
    }).join(', ')}`;
    if (overlapping.length > 0) ctx += ` (also taking: ${overlapping.map(o => o.name).join(', ')})`;
    ctx += `\n`;
    for (const imp of top) {
      ctx += `  ${imp.markerName}: ${fmtVal(imp.beforeMean)}→${fmtVal(imp.afterMean)} ${imp.unit} (${imp.pctChange > 0 ? '+' : ''}${imp.pctChange.toFixed(0)}%)`;
      if (imp.refMin != null || imp.refMax != null) ctx += ` ref ${imp.refMin ?? ''}–${imp.refMax ?? ''}`;
      ctx += `\n`;
    }
  }

  const names = suppEntries.map(e => `"${e.supplement.name}"`).join(', ');
  const system = `ONLY JSON, no thinking, no explanation: {${names}: {"dot":"green|yellow|red|gray","summary":"max 20 words"}, ...}
green=beneficial, yellow=mixed, red=concerning, gray=insufficient data. Mention key markers.`;

  _batchPromise = (async () => {
    try {
      const result = await callClaudeAPI({ system, messages: [{ role: 'user', content: ctx }], maxTokens: 300 * suppEntries.length + 1000 });
      const cleaned = result.text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;
      const parsed = JSON.parse(jsonMatch[0]);

      const cache = getImpactCache();
      for (const { supplement: s, editIdx } of suppEntries) {
        const entry = parsed[s.name];
        if (!entry || typeof entry !== 'object') continue;
        const record = {
          fp: getSuppFingerprint(s, data),
          dot: ['green', 'yellow', 'red', 'gray'].includes(entry.dot) ? entry.dot : 'gray',
          summary: typeof entry.summary === 'string' ? entry.summary.slice(0, 150) : ''
        };
        cache[s.name] = record;
        applyImpactToDOM(editIdx, record);
      }
      // Cap cache at 50 entries (one per supp)
      const keys = Object.keys(cache);
      if (keys.length > 50) { for (const k of keys.slice(0, keys.length - 50)) delete cache[k]; }
      setImpactCache(cache);
    } catch (e) { if (isDebugMode()) console.warn('[suppImpact] AI failed:', e.message || e); }
  })();

  await _batchPromise;
  _batchPromise = null;
}

function refreshSupplementImpact(editIdx) {
  const supps = state.importedData.supplements || [];
  const s = supps[editIdx];
  if (!s) return;
  const data = getActiveData();
  if (!data) return;
  const cache = getImpactCache();
  delete cache[s.name];
  setImpactCache(cache);
  const dotEl = document.getElementById(`supp-impact-dot-${editIdx}`);
  if (dotEl) dotEl.className = 'ctx-health-dot ctx-health-dot-shimmer';
  const sumEl = document.getElementById(`supp-impact-summary-${editIdx}`);
  if (sumEl) { sumEl.textContent = ''; sumEl.className = 'supp-impact-summary'; }
  const refreshBtn = dotEl?.closest('.supp-impact-header')?.querySelector('.supp-impact-refresh');
  if (refreshBtn) refreshBtn.remove();
  scheduleAnalyze(s, editIdx, data);
}

function applyImpactToDOM(editIdx, cached) {
  if (!cached) return;
  const dotEl = document.getElementById(`supp-impact-dot-${editIdx}`);
  if (dotEl) dotEl.className = `ctx-health-dot ctx-health-dot-${cached.dot}`;
  const sumEl = document.getElementById(`supp-impact-summary-${editIdx}`);
  if (sumEl) {
    sumEl.textContent = cached.summary;
    sumEl.className = `supp-impact-summary supp-impact-summary-visible supp-impact-summary-${cached.dot}`;
  }
}

Object.assign(window, { renderSupplementsSection, openSupplementsEditor, toggleSuppAccordion, showAddSuppForm, saveSupplement, deleteSupplement, askAIMitoContext, computeAllImpacts, getSupplementPeriods, addIngredientRow, removeIngredientRow, addPeriodRow, removePeriodRow, scanSupplementLabel, fetchSupplementFromURL, refreshSupplementImpact, updateIngTotal, updateAllIngTotals, ingredientDailyTotal });
