// biometrics-view.js — Category view with chart cards for all biometric metrics
// Renders a dashboard-style grid of biometric charts, detail modals, manual entry, inline edit

import { state } from './state.js';
import { escapeHTML, escapeAttr, showNotification, showConfirmDialog, formatValue, getStatus } from './utils.js';
import { saveImportedData, renderDateRangeFilter } from './data.js';
import { createLineChart } from './charts.js';
import { ensureBiometricsStructure, BIOMETRIC_KEYS } from './wearables/core.js';
import { getDisplayEntries } from './wearables/normalizer.js';

// ═══════════════════════════════════════════════
// METRIC DISPLAY CONFIG
// ═══════════════════════════════════════════════
const METRIC_CONFIG = {
  weight:         { name: 'Weight',           unit: () => state.unitSystem === 'US' ? 'lbs' : 'kg', refMin: null, refMax: null, icon: '⚖️' },
  bp:             { name: 'Blood Pressure',   unit: () => 'mmHg', refMin: 90, refMax: 120, icon: '❤️‍🩹' },
  pulse:          { name: 'Pulse',            unit: () => 'bpm', refMin: 50, refMax: 90, icon: '💓' },
  hrv:            { name: 'HRV',              unit: () => 'ms', refMin: 20, refMax: 100, icon: '🫀' },
  sleep:          { name: 'Sleep',            unit: () => 'hours', refMin: 7, refMax: 9, displayValue: e => e.total_s != null ? +(e.total_s / 3600).toFixed(1) : e.score != null ? e.score : null, icon: '😴' },
  readiness:      { name: 'Readiness',        unit: () => 'score', refMin: 70, refMax: 100, icon: '🔋' },
  steps:          { name: 'Steps',           unit: () => 'steps', refMin: 7000, refMax: 15000, icon: '🚶' },
  activeCalories: { name: 'Active Calories', unit: () => 'kcal', refMin: 200, refMax: 800, icon: '🔥' },
  distance:       { name: 'Distance',         unit: () => 'km', refMin: null, refMax: null, displayValue: e => e.value_m != null ? +(e.value_m / 1000).toFixed(1) : null, icon: '📏' },
  activeMinutes:  { name: 'Active Minutes',  unit: () => 'min', refMin: 30, refMax: 90, icon: '🏃' },
  spo2:           { name: 'SpO₂',            unit: () => '%', refMin: 95, refMax: 100, icon: '🫁' },
  pwv:            { name: 'Pulse Wave Velocity', unit: () => 'm/s', refMin: null, refMax: 10, icon: '🌊' },
};

// Biometrics date range filter (separate from main app range)
let _bioRange = '1y'; // 1m, 3m, 6m, 1y, all

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
function _filterByRange(entries) {
  if (_bioRange === 'all') return entries;
  const now = new Date();
  const cutoff = new Date(now);
  if (_bioRange === '1m') cutoff.setMonth(cutoff.getMonth() - 1);
  else if (_bioRange === '3m') cutoff.setMonth(cutoff.getMonth() - 3);
  else if (_bioRange === '6m') cutoff.setMonth(cutoff.getMonth() - 6);
  else if (_bioRange === '1y') cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return entries.filter(e => e.date >= cutoffStr);
}

function _getDisplayValue(entry, metricKey) {
  const cfg = METRIC_CONFIG[metricKey];
  if (!cfg) return entry.value ?? null;
  if (cfg.displayValue) return cfg.displayValue(entry);
  if (metricKey === 'weight' && entry.value != null) {
    if (entry.unit === 'kg' && state.unitSystem === 'US') return +(entry.value * 2.20462).toFixed(1);
    if (entry.unit === 'lbs' && state.unitSystem !== 'US') return +(entry.value / 2.20462).toFixed(1);
    return entry.value;
  }
  if (metricKey === 'bp') {
    if (entry.sys != null && entry.dia != null) return `${entry.sys}/${entry.dia}`;
    return null;
  }
  return entry.value ?? entry.score ?? null;
}

function _getDisplayUnit(metricKey) {
  const cfg = METRIC_CONFIG[metricKey];
  if (!cfg) return '';
  return cfg.unit();
}

function _getRefRange(metricKey) {
  const cfg = METRIC_CONFIG[metricKey];
  if (!cfg) return { refMin: null, refMax: null };
  return { refMin: cfg.refMin, refMax: cfg.refMax };
}

function _toMarkerObj(metricKey, entries) {
  // Convert biometric entries to a marker-like object that createLineChart can use
  const cfg = METRIC_CONFIG[metricKey];
  if (!cfg) return null;

  const filtered = _filterByRange(entries);
  if (filtered.length === 0) return null;

  const dates = filtered.map(e => e.date);
  const values = filtered.map(e => {
    if (metricKey === 'bp') return e.sys != null ? e.sys : null; // chart shows systolic
    const v = _getDisplayValue(e, metricKey);
    return v != null ? v : null;
  });
  const dateLabels = dates.map(d => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  });

  return {
    name: cfg.name,
    unit: _getDisplayUnit(metricKey),
    values,
    dates,
    dateLabels,
    refMin: cfg.refMin != null ? cfg.refMin : null,
    refMax: cfg.refMax != null ? cfg.refMax : null,
    optimalMin: null,
    optimalMax: null,
    singlePoint: false,
  };
}

function _getLatestDisplayValue(metricKey, entries) {
  const filtered = _filterByRange(entries);
  if (filtered.length === 0) return { value: null, date: null, status: 'missing' };
  const latest = filtered[filtered.length - 1];
  const displayVal = _getDisplayValue(latest, metricKey);
  const ref = _getRefRange(metricKey);
  let status = 'missing';
  if (displayVal != null && ref.refMax != null) {
    const numVal = typeof displayVal === 'number' ? displayVal : null;
    if (numVal != null) {
      if (numVal < ref.refMin) status = 'low';
      else if (numVal > ref.refMax) status = 'high';
      else status = 'normal';
    }
  }
  return { value: displayVal, date: latest.date, status };
}

// ═══════════════════════════════════════════════
// CATEGORY VIEW
// ═══════════════════════════════════════════════
export function renderBiometricsCategoryView() {
  ensureBiometricsStructure();
  const bio = state.importedData.biometrics;
  const main = document.getElementById('main-content');

  // Count metrics with data
  let metricsWithData = 0;
  for (const key of BIOMETRIC_KEYS) {
    const displayEntries = getDisplayEntries(key);
    if (displayEntries.length > 0) metricsWithData++;
  }

  const countLabel = metricsWithData > 0
    ? `${metricsWithData} of ${BIOMETRIC_KEYS.length} metrics with data`
    : 'No biometric data yet';

  let html = `<div class="category-header"><h2><span>📊</span> Biometrics</h2><p>${countLabel}</p></div>`;

  // Range filter
  html += `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:20px">`;
  html += `<div class="date-range-filter" style="margin-bottom:0">`;
  const ranges = [
    { key: '1m', label: '1M' },
    { key: '3m', label: '3M' },
    { key: '6m', label: '6M' },
    { key: '1y', label: '1Y' },
    { key: 'all', label: 'All' }
  ];
  for (const r of ranges) {
    html += `<button class="range-btn${_bioRange === r.key ? ' active' : ''}" onclick="setBiometricsCategoryRange('${r.key}')">${r.label}</button>`;
  }
  html += `</div>`;
  html += `</div>`;

  if (metricsWithData === 0) {
    html += `<div class="empty-state"><div class="empty-state-icon">📊</div>
      <h3>No Biometric Data</h3><p>Connect a wearable device in Settings or add manual entries to see your biometrics here.</p></div>`;
  } else {
    html += `<div class="charts-grid">`;
    for (const key of BIOMETRIC_KEYS) {
      const allEntries = getDisplayEntries(key);
      const filtered = _filterByRange(allEntries);
      if (filtered.length === 0) continue;

      const cfg = METRIC_CONFIG[key];
      const latest = _getLatestDisplayValue(key, allEntries);
      const unit = _getDisplayUnit(key);
      const ref = _getRefRange(key);

      const statusClass = `status-${latest.status === 'missing' ? 'normal' : latest.status}`;
      const statusLabel = latest.status === 'normal' ? 'Normal' :
                          latest.status === 'high' ? 'High' :
                          latest.status === 'low' ? 'Low' : 'N/A';
      const statusIcon = latest.status === 'high' ? '↑' : latest.status === 'low' ? '↓' : '';

      let latestStr = '';
      if (latest.value != null) {
        if (key === 'weight') {
          latestStr = `${formatValue(latest.value)} ${unit}`;
        } else if (key === 'bp') {
          // For BP, show sys/dia
          const latestEntry = filtered[filtered.length - 1];
          latestStr = latestEntry.sys != null ? `${latestEntry.sys}/${latestEntry.dia} ${unit}` : '—';
        } else {
          latestStr = `${formatValue(latest.value)} ${unit}`;
        }
      } else {
        latestStr = '—';
      }

      let refStr = '';
      if (ref.refMin != null && ref.refMax != null) {
        refStr = `<div class="chart-ref-range">Reference: ${ref.refMin} – ${ref.refMax} ${escapeHTML(unit)}</div>`;
      }

      html += `<div class="chart-card" onclick="showBiometricDetailModal('${key}')" style="cursor:pointer">
        <div class="chart-card-header"><div>
          <div class="chart-card-title">${cfg.icon} ${escapeHTML(cfg.name)}</div>
          <div class="chart-card-unit">${escapeHTML(unit)}</div></div>
          <div><span class="chart-card-status ${statusClass}">${statusIcon ? statusIcon + ' ' : ''}${statusLabel}</span></div></div>
        <div class="chart-container"><canvas id="chart-bio_${key}"></canvas></div>
        <div class="chart-values">
          <div class="chart-value-item"><div class="chart-value-date">Latest</div>
            <div class="chart-value-num ${statusClass}">${latestStr}</div></div>
        </div>
        ${refStr}</div>`;
    }
    html += `</div>`;

    // Show metrics without data as add buttons
    const noDataKeys = BIOMETRIC_KEYS.filter(key => {
      const entries = getDisplayEntries(key);
      return _filterByRange(entries).length === 0;
    });
    if (noDataKeys.length > 0) {
      html += `<div style="margin-top:16px"><p style="color:var(--text-secondary);font-size:13px;margin-bottom:8px">No data yet</p><div style="display:flex;flex-wrap:wrap;gap:8px">`;
      for (const key of noDataKeys) {
        const cfg = METRIC_CONFIG[key];
        html += `<div class="chart-card" onclick="showBiometricDetailModal('${key}')" style="cursor:pointer;padding:12px 16px;min-height:auto;flex:0 0 auto">
          <span style="color:var(--text-secondary)">${cfg.icon} ${escapeHTML(cfg.name)}</span>
          <span style="color:var(--text-muted);font-size:11px;margin-left:6px">+ add</span></div>`;
      }
      html += `</div></div>`;
    }
  }

  main.innerHTML = html;

  // Render charts for metrics with data
  if (metricsWithData > 0) {
    for (const key of BIOMETRIC_KEYS) {
      const allEntries = getDisplayEntries(key);
      const filtered = _filterByRange(allEntries);
      if (filtered.length === 0) continue;

      const marker = _toMarkerObj(key, filtered);
      if (marker) {
        createLineChart('bio_' + key, marker, marker.dateLabels, marker.dates);
      }
    }
  }
}

export function setBiometricsCategoryRange(range) {
  _bioRange = range;
  window.navigate('biometrics');
}

// ═══════════════════════════════════════════════
// DETAIL MODAL
// ═══════════════════════════════════════════════
export function showBiometricDetailModal(type, range) {
  ensureBiometricsStructure();
  const cfg = METRIC_CONFIG[type];
  if (!cfg) return;

  const allEntries = getDisplayEntries(type);
  const filtered = _filterByRange(allEntries);
  const unit = _getDisplayUnit(type);
  const ref = _getRefRange(type);

  // Build marker for chart
  const marker = _toMarkerObj(type, filtered);
  const hasData = marker && marker.values.some(v => v !== null);

  // Build history table
  let tableHtml = '';
  if (filtered.length > 0) {
    tableHtml = `<table class="data-table" style="margin-top:16px">
      <thead><tr><th>Date</th><th>Value</th><th>Source</th><th></th></tr></thead><tbody>`;
    // Show most recent first
    const reversed = [...filtered].reverse();
    for (const entry of reversed) {
      const displayVal = _getDisplayValue(entry, type);
      let valStr = displayVal != null ? formatValue(displayVal) : '—';
      const sourceLabel = (entry.source || 'manual').charAt(0).toUpperCase() + (entry.source || 'manual').slice(1);
      tableHtml += `<tr>
        <td>${escapeHTML(entry.date)}</td>
        <td>${valStr} ${escapeHTML(unit)}</td>
        <td style="font-size:12px;color:var(--text-muted)">${escapeHTML(sourceLabel)}</td>
        <td><button class="import-btn import-btn-secondary" style="font-size:11px;padding:2px 8px" onclick="deleteBiometricEntry('${type}','${entry.date}')">×</button></td>
      </tr>`;
    }
    tableHtml += `</tbody></table>`;
  }

  // Manual entry form
  let entryFormHtml = '';
  if (type === 'bp') {
    entryFormHtml = `<div style="margin-top:16px;padding:12px;background:var(--bg-secondary);border-radius:8px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">Add Manual Entry</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end">
        <div><label style="font-size:11px;color:var(--text-muted)">Date</label><input type="date" id="bio-entry-date" value="${new Date().toISOString().slice(0, 10)}" style="display:block;font-size:13px;border-radius:6px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);padding:4px 8px"></div>
        <div><label style="font-size:11px;color:var(--text-muted)">Systolic</label><input type="number" id="bio-entry-sys" placeholder="120" style="display:block;font-size:13px;border-radius:6px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);padding:4px 8px;width:80px"></div>
        <div><label style="font-size:11px;color:var(--text-muted)">Diastolic</label><input type="number" id="bio-entry-dia" placeholder="80" style="display:block;font-size:13px;border-radius:6px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);padding:4px 8px;width:80px"></div>
        <button class="import-btn import-btn-primary" style="font-size:12px;padding:6px 14px" onclick="saveBiometricEntry('${type}')">Save</button>
      </div></div>`;
  } else if (type === 'weight') {
    entryFormHtml = `<div style="margin-top:16px;padding:12px;background:var(--bg-secondary);border-radius:8px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">Add Manual Entry</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end">
        <div><label style="font-size:11px;color:var(--text-muted)">Date</label><input type="date" id="bio-entry-date" value="${new Date().toISOString().slice(0, 10)}" style="display:block;font-size:13px;border-radius:6px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);padding:4px 8px"></div>
        <div><label style="font-size:11px;color:var(--text-muted)">Weight (${unit})</label><input type="number" id="bio-entry-value" placeholder="${state.unitSystem === 'US' ? '170' : '77'}" step="0.1" style="display:block;font-size:13px;border-radius:6px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);padding:4px 8px;width:100px"></div>
        <button class="import-btn import-btn-primary" style="font-size:12px;padding:6px 14px" onclick="saveBiometricEntry('${type}')">Save</button>
      </div></div>`;
  } else if (type === 'sleep') {
    entryFormHtml = `<div style="margin-top:16px;padding:12px;background:var(--bg-secondary);border-radius:8px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">Add Manual Entry</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end">
        <div><label style="font-size:11px;color:var(--text-muted)">Date</label><input type="date" id="bio-entry-date" value="${new Date().toISOString().slice(0, 10)}" style="display:block;font-size:13px;border-radius:6px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);padding:4px 8px"></div>
        <div><label style="font-size:11px;color:var(--text-muted)">Total sleep (hours)</label><input type="number" id="bio-entry-hours" placeholder="7.5" step="0.1" style="display:block;font-size:13px;border-radius:6px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);padding:4px 8px;width:100px"></div>
        <button class="import-btn import-btn-primary" style="font-size:12px;padding:6px 14px" onclick="saveBiometricEntry('${type}')">Save</button>
      </div></div>`;
  } else if (type === 'distance') {
    entryFormHtml = `<div style="margin-top:16px;padding:12px;background:var(--bg-secondary);border-radius:8px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">Add Manual Entry</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end">
        <div><label style="font-size:11px;color:var(--text-muted)">Date</label><input type="date" id="bio-entry-date" value="${new Date().toISOString().slice(0, 10)}" style="display:block;font-size:13px;border-radius:6px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);padding:4px 8px"></div>
        <div><label style="font-size:11px;color:var(--text-muted)">Distance (km)</label><input type="number" id="bio-entry-value" placeholder="5" step="0.1" style="display:block;font-size:13px;border-radius:6px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);padding:4px 8px;width:100px"></div>
        <button class="import-btn import-btn-primary" style="font-size:12px;padding:6px 14px" onclick="saveBiometricEntry('${type}')">Save</button>
      </div></div>`;
  } else {
    entryFormHtml = `<div style="margin-top:16px;padding:12px;background:var(--bg-secondary);border-radius:8px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">Add Manual Entry</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end">
        <div><label style="font-size:11px;color:var(--text-muted)">Date</label><input type="date" id="bio-entry-date" value="${new Date().toISOString().slice(0, 10)}" style="display:block;font-size:13px;border-radius:6px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);padding:4px 8px"></div>
        <div><label style="font-size:11px;color:var(--text-muted)">Value (${escapeHTML(unit)})</label><input type="number" id="bio-entry-value" step="any" style="display:block;font-size:13px;border-radius:6px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);padding:4px 8px;width:100px"></div>
        <button class="import-btn import-btn-primary" style="font-size:12px;padding:6px 14px" onclick="saveBiometricEntry('${type}')">Save</button>
      </div></div>`;
  }

  // Reference range info
  let refHtml = '';
  if (ref.refMin != null && ref.refMax != null) {
    refHtml = `<div style="margin-top:8px;font-size:12px;color:var(--text-muted)">Reference range: ${ref.refMin} – ${ref.refMax} ${escapeHTML(unit)}</div>`;
  }

  // Build modal
  const overlay = document.getElementById('modal-overlay');
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(cfg.name)}">
    <div class="modal-header">
      <h3>${cfg.icon} ${escapeHTML(cfg.name)}</h3>
      <button class="modal-close" onclick="closeModal()">&times;</button>
    </div>
    <div class="modal-body" style="max-height:60vh;overflow-y:auto">
      ${refHtml}
      ${hasData ? '<div class="chart-container" style="min-height:200px;margin-top:8px"><canvas id="chart-bio_modal"></canvas></div>' : '<div style="text-align:center;padding:24px;color:var(--text-muted)">No data for this metric</div>'}
      ${tableHtml}
      ${entryFormHtml}
    </div>
  </div>`;

  overlay.classList.add('show');

  // Render chart
  if (hasData && marker) {
    setTimeout(() => {
      createLineChart('bio_modal', marker, marker.dateLabels, marker.dates);
    }, 50);
  }
}

// ═══════════════════════════════════════════════
// SAVE / DELETE / EDIT
// ═══════════════════════════════════════════════
export function saveBiometricEntry(type) {
  ensureBiometricsStructure();
  const bio = state.importedData.biometrics;
  const cfg = METRIC_CONFIG[type];
  if (!cfg) return;

  const dateInput = document.getElementById('bio-entry-date');
  const date = dateInput?.value;
  if (!date) { showNotification('Please enter a date', 'error'); return; }

  const source = 'manual';
  let entry;

  if (type === 'bp') {
    const sysInput = document.getElementById('bio-entry-sys');
    const diaInput = document.getElementById('bio-entry-dia');
    const sys = parseInt(sysInput?.value);
    const dia = parseInt(diaInput?.value);
    if (isNaN(sys) || isNaN(dia)) { showNotification('Please enter both systolic and diastolic values', 'error'); return; }
    entry = { date, sys, dia, source };
  } else if (type === 'weight') {
    const valueInput = document.getElementById('bio-entry-value');
    const value = parseFloat(valueInput?.value);
    if (isNaN(value)) { showNotification('Please enter a value', 'error'); return; }
    // Store as kg internally
    const storedValue = state.unitSystem === 'US' ? +(value / 2.20462).toFixed(3) : value;
    entry = { date, value: storedValue, unit: 'kg', source };
  } else if (type === 'sleep') {
    const hoursInput = document.getElementById('bio-entry-hours');
    const hours = parseFloat(hoursInput?.value);
    if (isNaN(hours)) { showNotification('Please enter a value', 'error'); return; }
    entry = { date, total_s: Math.round(hours * 3600), score: null, source };
  } else if (type === 'distance') {
    const valueInput = document.getElementById('bio-entry-value');
    const km = parseFloat(valueInput?.value);
    if (isNaN(km)) { showNotification('Please enter a value', 'error'); return; }
    entry = { date, value_m: Math.round(km * 1000), source };
  } else {
    const valueInput = document.getElementById('bio-entry-value');
    const value = parseFloat(valueInput?.value);
    if (isNaN(value)) { showNotification('Please enter a value', 'error'); return; }
    entry = { date, value, source };
  }

  // Upsert: replace same-date+source, or add
  const arr = bio[type];
  const idx = arr.findIndex(e => e.date === date && e.source === source);
  if (idx >= 0) arr[idx] = entry;
  else arr.push(entry);
  arr.sort((a, b) => a.date.localeCompare(b.date));

  if (window.recordChange) window.recordChange('biometrics');
  saveImportedData();
  window.buildSidebar?.();

  showNotification(`${cfg.name} entry saved`, 'success');
  showBiometricDetailModal(type);
}

export function deleteBiometricEntry(type, date) {
  ensureBiometricsStructure();
  const cfg = METRIC_CONFIG[type];
  if (!cfg) return;

  showConfirmDialog(`Delete ${cfg.name} entry for ${date}?`, () => {
    const arr = state.importedData.biometrics[type];
    const idx = arr.findIndex(e => e.date === date);
    if (idx >= 0) {
      arr.splice(idx, 1);
      if (window.recordChange) window.recordChange('biometrics');
      saveImportedData();
      window.buildSidebar?.();
      showNotification('Entry deleted', 'info');
    }
    showBiometricDetailModal(type);
  });
}

export function editBiometricEntry(type, date, event) {
  // Simple inline edit: prompt for value (used if we add this later)
  ensureBiometricsStructure();
  const arr = state.importedData.biometrics[type];
  const entry = arr.find(e => e.date === date);
  if (!entry) return;

  const cfg = METRIC_CONFIG[type];
  // For now, just reopen the detail modal (full inline edit can be added later)
  showBiometricDetailModal(type);
}

// ═══════════════════════════════════════════════
// WINDOW EXPOSURES
// ═══════════════════════════════════════════════
Object.assign(window, {
  renderBiometricsCategoryView,
  setBiometricsCategoryRange,
  showBiometricDetailModal,
  saveBiometricEntry,
  deleteBiometricEntry,
  editBiometricEntry,
});