// biometrics-view.js — category view + detail modal for weight/BP/pulse

import { state } from './state.js';
import { escapeHTML, showNotification } from './utils.js';
import { saveImportedData } from './data.js';
import { createLineChart } from './charts.js';

function ensureBio() {
  if (!state.importedData) state.importedData = { entries: [] };
  if (!state.importedData.biometrics) state.importedData.biometrics = { weight: [], bp: [], pulse: [] };
  const b = state.importedData.biometrics;
  if (!Array.isArray(b.weight)) b.weight = [];
  if (!Array.isArray(b.bp)) b.bp = [];
  if (!Array.isArray(b.pulse)) b.pulse = [];
  return b;
}

function sortByDateAsc(arr) {
  return [...arr].sort((a, b) => a.date.localeCompare(b.date));
}

function filterRowsByRange(rows, range = 'all') {
  if (!rows.length || range === 'all') return rows;
  const months = range === '1m' ? 1 : range === '3m' ? 3 : range === '9m' ? 9 : 0;
  if (!months) return rows;
  const end = new Date(rows[rows.length - 1].date + 'T00:00:00');
  const start = new Date(end);
  start.setMonth(start.getMonth() - months);
  const min = start.toISOString().slice(0, 10);
  return rows.filter(r => r.date >= min);
}

function markerFor(type, range = 'all') {
  const b = ensureBio();
  if (type === 'weight') {
    const rows = filterRowsByRange(sortByDateAsc(b.weight || []), range);
    const values = rows.map(e => {
      if (state.unitSystem === 'US') return e.unit === 'lbs' ? e.value : e.value * 2.205;
      return e.unit === 'lbs' ? e.value / 2.205 : e.value;
    });
    return {
      type,
      name: 'Weight',
      unit: state.unitSystem === 'US' ? 'lbs' : 'kg',
      values,
      chartDates: rows.map(e => e.date),
      dateLabels: rows.map(e => new Date(e.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })),
      refMin: null,
      refMax: null,
    };
  }
  if (type === 'bp') {
    const rows = filterRowsByRange(sortByDateAsc(b.bp || []), range);
    return {
      type,
      name: 'Blood Pressure',
      unit: 'mmHg',
      values: rows.map(e => e.sys),
      chartDates: rows.map(e => e.date),
      dateLabels: rows.map(e => new Date(e.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })),
      refMin: 90,
      refMax: 120,
    };
  }
  const rows = filterRowsByRange(sortByDateAsc(b.pulse || []), range);
  return {
    type,
    name: 'Pulse',
    unit: 'bpm',
    values: rows.map(e => e.value),
    chartDates: rows.map(e => e.date),
    dateLabels: rows.map(e => new Date(e.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })),
    refMin: 50,
    refMax: 90,
  };
}

function latestLabel(type) {
  const b = ensureBio();
  if (type === 'weight') {
    if (!b.weight.length) return '—';
    const x = [...b.weight].sort((a, c) => c.date.localeCompare(a.date))[0];
    return `${x.value} ${x.unit}`;
  }
  if (type === 'bp') {
    if (!b.bp.length) return '—';
    const x = [...b.bp].sort((a, c) => c.date.localeCompare(a.date))[0];
    return `${x.sys}/${x.dia}`;
  }
  if (!b.pulse.length) return '—';
  const x = [...b.pulse].sort((a, c) => c.date.localeCompare(a.date))[0];
  return `${x.value}`;
}

function cardHtml(type, title, unit, latest) {
  return `<div class="chart-card" onclick="showBiometricDetailModal('${type}')">
    <div class="chart-card-header"><div>
      <div class="chart-card-title">${title}</div>
      <div class="chart-card-unit">${unit}</div></div>
      <div><span class="chart-card-status">${escapeHTML(String(latest))}</span></div></div>
    <div class="chart-container"><canvas id="chart-bio-${type}"></canvas></div>
  </div>`;
}

export function renderBiometricsCategoryView() {
  const b = ensureBio();
  const hasAny = b.weight.length || b.bp.length || b.pulse.length;
  if (!hasAny) {
    return `<div class="empty-state"><div class="empty-state-icon">🩺</div>
      <h3>No biometrics data yet</h3><p>Import biometrics or sync from Withings in Settings to see trends here.</p></div>`;
  }

  const range = window._bioCategoryRange || 'all';
  const w = markerFor('weight', range);
  const bp = markerFor('bp', range);
  const p = markerFor('pulse', range);

  const rangeBtns = `<div class="date-range-filter" style="margin:0 0 12px">
    <button class="range-btn${range==='1m'?' active':''}" onclick="setBiometricsCategoryRange('1m')">1M</button>
    <button class="range-btn${range==='3m'?' active':''}" onclick="setBiometricsCategoryRange('3m')">3M</button>
    <button class="range-btn${range==='9m'?' active':''}" onclick="setBiometricsCategoryRange('9m')">9M</button>
    <button class="range-btn${range==='all'?' active':''}" onclick="setBiometricsCategoryRange('all')">All</button>
  </div>`;

  const html = `${rangeBtns}<div class="charts-grid charts-grid-4col">
    ${cardHtml('weight', 'Weight', state.unitSystem === 'US' ? 'lbs' : 'kg', latestLabel('weight'))}
    ${cardHtml('bp', 'Blood Pressure', 'mmHg', latestLabel('bp'))}
    ${cardHtml('pulse', 'Pulse', 'bpm', latestLabel('pulse'))}
  </div>`;

  setTimeout(() => {
    if (w.values.length) createLineChart('bio-weight', w, w.dateLabels, w.chartDates, null);
    if (bp.values.length) createLineChart('bio-bp', bp, bp.dateLabels, bp.chartDates, null);
    if (p.values.length) createLineChart('bio-pulse', p, p.dateLabels, p.chartDates, null);
  }, 0);

  return html;
}

export function setBiometricsCategoryRange(range) {
  window._bioCategoryRange = range;
  window.navigate?.('biometrics');
}

export function showBiometricDetailModal(type, range = (window._bioModalRange || 'all')) {
  window._bioModalRange = range;
  renderBioModal(type, range);
}

function renderBioModal(type, range = 'all') {
  const marker = markerFor(type, range);
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;

  const b = ensureBio();
  const rows = sortByDateAsc(type === 'weight' ? b.weight : type === 'bp' ? b.bp : b.pulse);
  const today = new Date().toISOString().slice(0, 10);

  let rowsHtml = '';
  for (const r of [...rows].reverse()) {
    const dateLabel = new Date(r.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const val = type === 'weight' ? `${r.value} ${r.unit}` : type === 'bp' ? `${r.sys}/${r.dia} mmHg` : `${r.value} bpm`;
    rowsHtml += `<div class="modal-value-card">
      <button class="mv-delete" onclick="event.stopPropagation();deleteBiometricEntry('${type}','${r.date}')" title="Remove this value">&times;</button>
      <div class="mv-date">${dateLabel}</div>
      <div class="mv-value" onclick="event.stopPropagation();editBiometricEntry('${type}','${r.date}',event)" title="Click to edit" style="cursor:pointer">${escapeHTML(val)}</div>
      <div class="mv-status">${escapeHTML(r.source || 'manual')}</div>
    </div>`;
  }

  let addFields = '';
  if (type === 'weight') {
    addFields = `<div class="manual-entry-form">
      <div class="me-field"><label>Date</label><input type="date" id="bio-date" value="${today}"></div>
      <div class="me-field"><label>Weight</label><input type="number" id="bio-val" step="0.1" placeholder="value"></div>
      <div class="me-field"><label>Unit</label><select id="bio-unit"><option value="kg">kg</option><option value="lbs">lbs</option></select></div>
    </div>`;
  } else if (type === 'bp') {
    addFields = `<div class="manual-entry-form">
      <div class="me-field"><label>Date</label><input type="date" id="bio-date" value="${today}"></div>
      <div class="me-field"><label>Systolic</label><input type="number" id="bio-sys" placeholder="sys"></div>
      <div class="me-field"><label>Diastolic</label><input type="number" id="bio-dia" placeholder="dia"></div>
    </div>`;
  } else {
    addFields = `<div class="manual-entry-form">
      <div class="me-field"><label>Date</label><input type="date" id="bio-date" value="${today}"></div>
      <div class="me-field"><label>Pulse (bpm)</label><input type="number" id="bio-val" placeholder="bpm"></div>
    </div>`;
  }

  const rangeBtns = `<div class="date-range-filter" style="margin:8px 0 10px">
    <button class="range-btn${range==='1m'?' active':''}" onclick="showBiometricDetailModal('${type}','1m')">1M</button>
    <button class="range-btn${range==='3m'?' active':''}" onclick="showBiometricDetailModal('${type}','3m')">3M</button>
    <button class="range-btn${range==='9m'?' active':''}" onclick="showBiometricDetailModal('${type}','9m')">9M</button>
    <button class="range-btn${range==='all'?' active':''}" onclick="showBiometricDetailModal('${type}','all')">All</button>
  </div>`;

  modal.innerHTML = `<button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${escapeHTML(marker.name)}</h3>
    <div class="modal-unit">${escapeHTML(marker.unit)}</div>
    ${rangeBtns}
    <div class="modal-chart"><canvas id="chart-modal"></canvas></div>
    <div class="modal-values-grid">${rowsHtml || '<div style="color:var(--text-muted)">No entries yet</div>'}</div>
    ${addFields}
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="import-btn import-btn-primary" onclick="saveBiometricEntry('${type}')">Save</button>
      <button class="import-btn import-btn-secondary" onclick="closeModal()">Close</button>
    </div>`;

  overlay.classList.add('show');
  setTimeout(() => {
    createLineChart('modal', marker, marker.dateLabels, marker.chartDates, null);
  }, 50);
}

export function saveBiometricEntry(type) {
  const b = ensureBio();
  const date = document.getElementById('bio-date')?.value;
  if (!date) { showNotification('Enter date', 'error'); return; }

  if (type === 'weight') {
    const v = parseFloat(document.getElementById('bio-val')?.value);
    const unit = document.getElementById('bio-unit')?.value || 'kg';
    if (!v || v <= 0) { showNotification('Enter valid weight', 'error'); return; }
    b.weight = b.weight.filter(e => e.date !== date || e.source === 'withings');
    b.weight.push({ date, value: v, unit, source: 'manual' });
    b.weight.sort((a, c) => a.date.localeCompare(c.date));
  } else if (type === 'bp') {
    const sys = parseInt(document.getElementById('bio-sys')?.value, 10);
    const dia = parseInt(document.getElementById('bio-dia')?.value, 10);
    if (!sys || !dia || sys <= 0 || dia <= 0) { showNotification('Enter valid BP values', 'error'); return; }
    b.bp = b.bp.filter(e => e.date !== date);
    b.bp.push({ date, sys, dia, source: 'manual' });
    b.bp.sort((a, c) => a.date.localeCompare(c.date));
  } else {
    const v = parseInt(document.getElementById('bio-val')?.value, 10);
    if (!v || v <= 0) { showNotification('Enter valid pulse', 'error'); return; }
    b.pulse = b.pulse.filter(e => e.date !== date);
    b.pulse.push({ date, value: v, source: 'manual' });
    b.pulse.sort((a, c) => a.date.localeCompare(c.date));
  }

  if (window.recordChange) window.recordChange('biometrics');
  saveImportedData();
  window.buildSidebar?.();
  showBiometricDetailModal(type, window._bioModalRange || 'all');
}

export function deleteBiometricEntry(type, date) {
  const b = ensureBio();
  if (type === 'weight') b.weight = b.weight.filter(e => e.date !== date || e.source === 'withings');
  else if (type === 'bp') b.bp = b.bp.filter(e => e.date !== date);
  else b.pulse = b.pulse.filter(e => e.date !== date);
  if (window.recordChange) window.recordChange('biometrics');
  saveImportedData();
  window.buildSidebar?.();
  showBiometricDetailModal(type, window._bioModalRange || 'all');
}

export function editBiometricEntry(type, date, event) {
  const b = ensureBio();
  const el = event?.target?.closest('.mv-value');
  if (!el || el.querySelector('input')) return;

  const saveAll = () => {
    if (window.recordChange) window.recordChange('biometrics');
    saveImportedData();
    window.buildSidebar?.();
    showBiometricDetailModal(type, window._bioModalRange || 'all');
  };

  if (type === 'weight') {
    const row = (b.weight || []).find(e => e.date === date);
    if (!row) return;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.1';
    input.value = row.value;
    input.className = 'ref-edit-input';
    input.style.cssText = 'width:100px;text-align:center;font-size:inherit';
    el.textContent = '';
    el.appendChild(input);
    input.focus();
    input.select();
    const save = () => {
      const v = parseFloat(input.value);
      if (!v || v <= 0) { showBiometricDetailModal(type, window._bioModalRange || 'all'); return; }
      row.value = v;
      row.source = 'manual';
      saveAll();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') input.blur();
      else if (e.key === 'Escape') showBiometricDetailModal(type, window._bioModalRange || 'all');
    });
    return;
  }

  if (type === 'bp') {
    const row = (b.bp || []).find(e => e.date === date);
    if (!row) return;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:6px;align-items:center;justify-content:center';
    const sys = document.createElement('input');
    sys.type = 'number';
    sys.value = row.sys;
    sys.className = 'ref-edit-input';
    sys.style.cssText = 'width:58px;text-align:center;font-size:inherit';
    const sep = document.createElement('span');
    sep.textContent = '/';
    const dia = document.createElement('input');
    dia.type = 'number';
    dia.value = row.dia;
    dia.className = 'ref-edit-input';
    dia.style.cssText = 'width:58px;text-align:center;font-size:inherit';
    wrap.appendChild(sys); wrap.appendChild(sep); wrap.appendChild(dia);
    el.textContent = '';
    el.appendChild(wrap);
    sys.focus();
    sys.select();

    let done = false;
    const finish = (cancel = false) => {
      if (done) return;
      done = true;
      if (cancel) { showBiometricDetailModal(type, window._bioModalRange || 'all'); return; }
      const s = parseInt(sys.value, 10);
      const d = parseInt(dia.value, 10);
      if (!s || !d || s <= 0 || d <= 0) { showBiometricDetailModal(type, window._bioModalRange || 'all'); return; }
      row.sys = s;
      row.dia = d;
      row.source = 'manual';
      saveAll();
    };

    sys.addEventListener('keydown', e => {
      if (e.key === 'Enter') dia.focus();
      else if (e.key === 'Escape') finish(true);
    });
    dia.addEventListener('keydown', e => {
      if (e.key === 'Enter') finish(false);
      else if (e.key === 'Escape') finish(true);
    });
    sys.addEventListener('blur', () => setTimeout(() => {
      if (!el.contains(document.activeElement)) finish(false);
    }, 0));
    dia.addEventListener('blur', () => setTimeout(() => {
      if (!el.contains(document.activeElement)) finish(false);
    }, 0));
    return;
  }

  const row = (b.pulse || []).find(e => e.date === date);
  if (!row) return;
  const input = document.createElement('input');
  input.type = 'number';
  input.value = row.value;
  input.className = 'ref-edit-input';
  input.style.cssText = 'width:100px;text-align:center;font-size:inherit';
  el.textContent = '';
  el.appendChild(input);
  input.focus();
  input.select();
  const save = () => {
    const v = parseInt(input.value, 10);
    if (!v || v <= 0) { showBiometricDetailModal(type, window._bioModalRange || 'all'); return; }
    row.value = v;
    row.source = 'manual';
    saveAll();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') input.blur();
    else if (e.key === 'Escape') showBiometricDetailModal(type, window._bioModalRange || 'all');
  });
}

Object.assign(window, { showBiometricDetailModal, saveBiometricEntry, deleteBiometricEntry, editBiometricEntry, setBiometricsCategoryRange });
