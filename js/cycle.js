// cycle.js — Menstrual cycle tracking, phase calculation, editor, alerts
import { state } from './state.js';
import { PERIOD_SYMPTOMS } from './constants.js';
import { escapeHTML, showNotification, showConfirmDialog, linearRegression } from './utils.js';
import { saveImportedData } from './data.js';

export function getCyclePhase(dateStr, mc) {
  if (!mc || !mc.periods || mc.periods.length === 0) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const sorted = mc.periods.slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
  let periodStart = null;
  for (const p of sorted) {
    if (new Date(p.startDate + 'T00:00:00') <= target) {
      periodStart = p.startDate;
      break;
    }
  }
  if (!periodStart) return null;
  const startDate = new Date(periodStart + 'T00:00:00');
  const cycleDay = Math.floor((target - startDate) / 86400000) + 1;
  const cycleLen = mc.cycleLength || 28;
  if (cycleDay > cycleLen + 7) return null; // too far from any known period
  const periodLen = mc.periodLength || 5;
  const ovulationDay = cycleLen - 14;
  let phase, phaseName;
  if (cycleDay <= periodLen) {
    phase = 'menstrual'; phaseName = 'Menstrual';
  } else if (cycleDay < ovulationDay - 1) {
    phase = 'follicular'; phaseName = 'Follicular';
  } else if (cycleDay <= ovulationDay + 1) {
    phase = 'ovulatory'; phaseName = 'Ovulatory';
  } else {
    phase = 'luteal'; phaseName = 'Luteal';
  }
  return { cycleDay, phase, phaseName };
}

export function getNextBestDrawDate(mc) {
  if (!mc || !mc.periods || mc.periods.length === 0) return null;
  const sorted = mc.periods.slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
  const lastStart = new Date(sorted[0].startDate + 'T00:00:00');
  const cycleLen = mc.cycleLength || 28;
  const today = new Date(); today.setHours(0,0,0,0);
  // Find the most recent predicted period start (on or before today)
  let currentPeriodStart = new Date(lastStart.getTime());
  while (currentPeriodStart.getTime() + cycleLen * 86400000 <= today.getTime()) {
    currentPeriodStart = new Date(currentPeriodStart.getTime() + cycleLen * 86400000);
  }
  // Check if today falls within the current cycle's draw window (days 3-5)
  const currentDrawStart = new Date(currentPeriodStart.getTime() + 2 * 86400000);
  const currentDrawEnd = new Date(currentPeriodStart.getTime() + 4 * 86400000);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (today >= currentDrawStart && today <= currentDrawEnd) {
    const dayInCycle = Math.floor((today - currentPeriodStart) / 86400000) + 1;
    return {
      startDate: currentDrawStart.toISOString().slice(0, 10),
      endDate: currentDrawEnd.toISOString().slice(0, 10),
      description: `Now is ideal! Today is day ${dayInCycle} (early follicular)`
    };
  }
  // Otherwise recommend the next cycle's window
  if (today > currentDrawEnd) {
    currentPeriodStart = new Date(currentPeriodStart.getTime() + cycleLen * 86400000);
  }
  const drawStart = new Date(currentPeriodStart.getTime() + 2 * 86400000);
  const drawEnd = new Date(currentPeriodStart.getTime() + 4 * 86400000);
  return {
    startDate: drawStart.toISOString().slice(0, 10),
    endDate: drawEnd.toISOString().slice(0, 10),
    description: `~${fmt(drawStart)}-${fmt(drawEnd)} (days 3-5, early follicular)`
  };
}

export function getBloodDrawPhases(mc, dates) {
  if (!mc || !dates) return {};
  const phases = {};
  for (const d of dates) {
    const p = getCyclePhase(d, mc);
    if (p) phases[d] = p;
  }
  return phases;
}

export function calculateCycleStats(periods) {
  const result = { cycleLength: null, periodLength: null, regularity: null, flow: null };
  if (!periods || periods.length === 0) return result;
  const sorted = periods.slice().sort((a, b) => a.startDate.localeCompare(b.startDate));

  // Average period length (1+ periods with valid endDate)
  const periodLengths = sorted.filter(p => p.endDate).map(p => {
    const start = new Date(p.startDate + 'T00:00:00');
    const end = new Date(p.endDate + 'T00:00:00');
    return Math.round((end - start) / 86400000) + 1;
  });
  if (periodLengths.length > 0) {
    const avgPeriod = Math.round(periodLengths.reduce((a, b) => a + b, 0) / periodLengths.length);
    result.periodLength = Math.max(2, Math.min(10, avgPeriod));
  }

  // Most common flow from recent entries (up to last 6)
  const recent = sorted.slice(-6).filter(p => p.flow);
  if (recent.length > 0) {
    const counts = {};
    for (const p of recent) counts[p.flow] = (counts[p.flow] || 0) + 1;
    result.flow = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  // Cycle lengths between consecutive period starts (2+ periods)
  if (sorted.length >= 2) {
    const cycleLengths = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1].startDate + 'T00:00:00');
      const curr = new Date(sorted[i].startDate + 'T00:00:00');
      cycleLengths.push(Math.round((curr - prev) / 86400000));
    }
    const avgCycle = Math.round(cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length);
    // 90-day ceiling covers normal cycles, oligomenorrhea, and perimenopause.
    // The old 45-day clamp silently truncated 60–90 day cycles, throwing off
    // getNextBestDrawDate prediction by weeks for both irregular runs and
    // regular-but-long perimenopause cycles.
    result.cycleLength = Math.max(20, Math.min(90, avgCycle));
    if (cycleLengths.length >= 2) {
      const mean = cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length;
      const variance = cycleLengths.reduce((sum, v) => sum + (v - mean) ** 2, 0) / cycleLengths.length;
      const stdev = Math.sqrt(variance);
      if (stdev <= 2) result.regularity = 'regular';
      else if (stdev <= 7) result.regularity = 'irregular';
      else result.regularity = 'very_irregular';
    }
  }

  return result;
}

export function detectPerimenopausePattern(mc, dob) {
  if (!mc?.periods || mc.periods.length < 4 || !dob) return null;
  const age = (Date.now() - new Date(dob + 'T00:00:00').getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (age < 35) return null;

  const sorted = mc.periods.slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
  const intervals = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].startDate + 'T00:00:00');
    const curr = new Date(sorted[i].startDate + 'T00:00:00');
    intervals.push(Math.round((curr - prev) / 86400000));
  }
  if (intervals.length < 3) return null;

  const indicators = [];

  // 1. Lengthening trend: positive slope on cycle lengths
  const reg = linearRegression(intervals);
  if (reg.slope > 0.5 && reg.r2 > 0.3) {
    indicators.push('lengthening cycles');
  }

  // 2. Increasing variability: stdev of second half > first half
  const mid = Math.floor(intervals.length / 2);
  const firstHalf = intervals.slice(0, mid);
  const secondHalf = intervals.slice(mid);
  const stdev = arr => { const m = arr.reduce((a, b) => a + b, 0) / arr.length; return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length); };
  if (secondHalf.length >= 2 && firstHalf.length >= 2) {
    if (stdev(secondHalf) > stdev(firstHalf) * 1.5) {
      indicators.push('increasing variability');
    }
  }

  // 3. Any cycle > 38 days (classic perimenopause marker)
  if (intervals.some(i => i > 38)) {
    indicators.push('cycles >38 days');
  }

  // 4. Heavy flow increase
  const recentPeriods = sorted.slice(-4);
  const heavyCount = recentPeriods.filter(p => p.flow === 'heavy').length;
  if (heavyCount >= 3) {
    indicators.push('predominantly heavy flow');
  }

  // 5. Perimenopause-specific symptoms in recent entries
  const recentSymptoms = sorted.slice(-6).flatMap(p => p.symptoms || []);
  const periSymptoms = ['Hot flashes', 'Night sweats'];
  if (periSymptoms.some(s => recentSymptoms.includes(s))) {
    indicators.push('vasomotor symptoms (hot flashes/night sweats)');
  }

  // 6. Cycle skipping — gap > 1.5× average cycle length suggests missed period
  if (intervals.length >= 3) {
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const skippedCount = intervals.filter(i => i > avgInterval * 1.5).length;
    if (skippedCount >= 1) {
      indicators.push('possible skipped cycles');
    }
  }

  // Need 2+ indicators to flag
  if (indicators.length < 2) return null;

  return {
    indicators,
    age: Math.floor(age),
    message: `Possible perimenopause pattern detected (age ${Math.floor(age)}): ${indicators.join(', ')}. Consider discussing with your healthcare provider.`
  };
}

export function detectCycleIronAlerts(mc, data) {
  if (!mc?.periods?.length) return [];
  const alerts = [];

  // Check if any recent periods are heavy flow
  const sorted = mc.periods.slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
  const recentHeavy = sorted.slice(0, 3).filter(p => p.flow === 'heavy');
  if (recentHeavy.length === 0) return [];

  // Check iron-related markers
  const ironMarkers = [
    { cat: 'hematology', key: 'ferritin', label: 'Ferritin' },
    { cat: 'hematology', key: 'hemoglobin', label: 'Hemoglobin' },
    { cat: 'hematology', key: 'iron', label: 'Iron' }
  ];

  for (const im of ironMarkers) {
    const marker = data.categories[im.cat]?.markers[im.key];
    if (!marker) continue;
    const latestIdx = marker.values.findLastIndex(v => v !== null);
    if (latestIdx === -1) continue;
    const v = marker.values[latestIdx];
    const r = { min: marker.refMin, max: marker.refMax };
    if (r.min == null) continue;

    // Alert if low or in bottom 25% of range
    const threshold = r.min + (r.max - r.min) * 0.25;
    if (v <= threshold) {
      const severity = v < r.min ? 'critical' : 'warning';
      alerts.push({
        marker: im.label,
        value: v,
        unit: marker.unit,
        severity,
        message: v < r.min
          ? `${im.label} is below range (${v} ${marker.unit}) with recent heavy flow \u2014 discuss iron supplementation with your provider`
          : `${im.label} is in the low range (${v} ${marker.unit}) with recent heavy flow \u2014 monitor closely`
      });
    }
  }

  // Alert if iron markers are missing entirely with heavy flow
  const hasAnyIron = ironMarkers.some(im => {
    const m = data.categories[im.cat]?.markers[im.key];
    return m && m.values.some(v => v !== null);
  });
  if (!hasAnyIron && recentHeavy.length >= 2) {
    alerts.push({
      marker: null,
      severity: 'info',
      message: 'Heavy menstrual flow detected but no iron panel on file \u2014 consider testing ferritin, hemoglobin, and iron'
    });
  }

  return alerts;
}

export function openMenstrualCycleEditor() {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const mc = state.importedData.menstrualCycle || {};
  const periods = (mc.periods || []).slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
  const stats = calculateCycleStats(mc.periods);
  const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const regLabels = { regular: 'Regular', irregular: 'Irregular', very_irregular: 'Very Irregular' };
  const isActiveCycleStatus = !mc.cycleStatus || mc.cycleStatus === 'regular' || mc.cycleStatus === 'perimenopause';
  const flowLabels = { light: 'Light', moderate: 'Moderate', heavy: 'Heavy' };
  let html = `<button class="modal-close" onclick="window.closeModal()">&times;</button>
    <h3>Menstrual Cycle</h3>
    <div class="modal-unit">Track your cycle so AI can interpret hormone, iron, and inflammation markers in context of cycle phase.</div>
    <div class="cycle-editor-form">
      <div class="supp-form-row">
        <div class="supp-form-field">
          <label>Cycle Status</label>
          <select id="mc-cycle-status" onchange="window._toggleCycleEditorFields()">
            <option value="regular"${mc.cycleStatus === 'regular' || !mc.cycleStatus ? ' selected' : ''}>Active — regular cycling</option>
            <option value="perimenopause"${mc.cycleStatus === 'perimenopause' ? ' selected' : ''}>Perimenopause / irregular</option>
            <option value="postmenopause"${mc.cycleStatus === 'postmenopause' ? ' selected' : ''}>Postmenopause / no periods</option>
            <option value="pregnant"${mc.cycleStatus === 'pregnant' ? ' selected' : ''}>Pregnant</option>
            <option value="breastfeeding"${mc.cycleStatus === 'breastfeeding' ? ' selected' : ''}>Breastfeeding</option>
            <option value="absent"${mc.cycleStatus === 'absent' ? ' selected' : ''}>Absent (other reason)</option>
          </select>
        </div>
      </div>
      <div id="mc-active-fields" ${isActiveCycleStatus ? '' : 'style="display:none"'}>
      <div class="supp-form-row">
        <div class="supp-form-field">
          <label>Average Cycle Length (days)</label>
          ${stats.cycleLength != null
            ? `<div class="mc-auto-value" id="mc-cycle-length-auto" data-value="${stats.cycleLength}">${stats.cycleLength} days</div>`
            : `<div class="mc-auto-value mc-auto-pending">${mc.cycleLength || 28} days <span class="mc-auto-hint">default — log 2+ periods to auto-calculate</span></div>`}
        </div>
        <div class="supp-form-field">
          <label>Average Period Length (days)</label>
          ${stats.periodLength != null
            ? `<div class="mc-auto-value" id="mc-period-length-auto" data-value="${stats.periodLength}">${stats.periodLength} days</div>`
            : `<div class="mc-auto-value mc-auto-pending">${mc.periodLength || 5} days <span class="mc-auto-hint">default — log periods with end dates to auto-calculate</span></div>`}
        </div>
      </div>
      <div class="supp-form-row">
        <div class="supp-form-field">
          <label>Regularity</label>
          ${stats.regularity != null
            ? `<div class="mc-auto-value" id="mc-regularity-auto" data-value="${stats.regularity}">${regLabels[stats.regularity]}</div>`
            : `<div class="mc-auto-value mc-auto-pending">${regLabels[mc.regularity] || 'Regular'} <span class="mc-auto-hint">default — log 3+ periods to auto-calculate</span></div>`}
        </div>
        <div class="supp-form-field">
          <label>Typical Flow</label>
          ${stats.flow != null
            ? `<div class="mc-auto-value" id="mc-flow-auto" data-value="${stats.flow}">${flowLabels[stats.flow]}</div>`
            : `<div class="mc-auto-value mc-auto-pending">${flowLabels[mc.flow] || 'Moderate'} <span class="mc-auto-hint">default — log 1+ period to auto-calculate</span></div>`}
        </div>
      </div>
      </div>
      <div class="supp-form-row">
        <div class="supp-form-field">
          <label>Contraceptive</label>
          <select id="mc-contraceptive">
            <option value=""${!mc.contraceptive ? ' selected' : ''}>None</option>
            <optgroup label="Hormonal">
              <option value="OCP"${mc.contraceptive === 'OCP' ? ' selected' : ''}>OCP (birth control pill)</option>
              <option value="Hormonal IUD (Mirena)"${mc.contraceptive?.includes('Mirena') ? ' selected' : ''}>Hormonal IUD (Mirena/Kyleena)</option>
              <option value="Implant"${mc.contraceptive === 'Implant' ? ' selected' : ''}>Implant (Nexplanon)</option>
              <option value="Patch"${mc.contraceptive === 'Patch' ? ' selected' : ''}>Patch</option>
              <option value="Ring"${mc.contraceptive === 'Ring' ? ' selected' : ''}>Ring (NuvaRing)</option>
              <option value="Depo injection"${mc.contraceptive?.includes('Depo') ? ' selected' : ''}>Depo injection</option>
            </optgroup>
            <optgroup label="Non-hormonal">
              <option value="Copper IUD"${mc.contraceptive === 'Copper IUD' ? ' selected' : ''}>Copper IUD</option>
              <option value="Barrier"${mc.contraceptive === 'Barrier' ? ' selected' : ''}>Barrier (condom/diaphragm)</option>
              <option value="FAM"${mc.contraceptive === 'FAM' ? ' selected' : ''}>Fertility awareness</option>
            </optgroup>
            <option value="other"${mc.contraceptive && !['OCP','Hormonal IUD (Mirena)','Implant','Patch','Ring','Depo injection','Copper IUD','Barrier','FAM'].includes(mc.contraceptive) && mc.contraceptive !== '' ? ' selected' : ''}>Other</option>
          </select>
        </div>
        <div class="supp-form-field">
          <label>Conditions</label>
          <input type="text" id="mc-conditions" value="${escapeHTML(mc.conditions || '')}" placeholder="e.g. PCOS, endometriosis, fibroids">
        </div>
      </div>
    </div>
    <div id="mc-period-log-section" style="border-top:1px solid var(--border);margin-top:16px;padding-top:16px${isActiveCycleStatus ? '' : ';display:none'}">
      <div class="supp-form-title">Period Log</div>`;
  if (periods.length > 0) {
    html += `<div class="supp-list">`;
    for (let i = 0; i < periods.length; i++) {
      const p = periods[i];
      const flowCls = p.flow === 'heavy' ? 'severity-major' : p.flow === 'light' ? 'severity-minor' : 'severity-mild';
      html += `<div class="supp-list-item">
        <span class="supp-list-icon">\uD83D\uDD34</span>
        <div class="supp-list-info">
          <div class="supp-list-name">${fmtDate(p.startDate)} \u2013 ${fmtDate(p.endDate)}</div>
          <div class="supp-list-meta"><span class="goals-severity-badge ${flowCls}">${p.flow || 'moderate'}</span>${(p.symptoms && p.symptoms.length) ? p.symptoms.map(s => `<span class="period-symptom-tag">${escapeHTML(s)}</span>`).join('') : ''}${p.notes ? ' ' + escapeHTML(p.notes) : ''}</div>
        </div>
        <div class="supp-list-actions">
          <button class="delete" onclick="deletePeriodEntry('${p.startDate}')">\u2715</button>
        </div>
      </div>`;
    }
    html += `</div>`;
  }
  const today = new Date().toISOString().slice(0, 10);
  const defaultEnd = new Date(Date.now() + ((mc.periodLength || 5) - 1) * 86400000).toISOString().slice(0, 10);
  html += `<div class="supp-form-row">
        <div class="supp-form-field">
          <label>Start Date</label>
          <input type="date" id="mc-period-start" value="${today}">
        </div>
        <div class="supp-form-field">
          <label>End Date</label>
          <input type="date" id="mc-period-end" value="${defaultEnd}">
        </div>
        <div class="supp-form-field">
          <label>Flow</label>
          <select id="mc-period-flow">
            <option value="light">Light</option>
            <option value="moderate" selected>Moderate</option>
            <option value="heavy">Heavy</option>
          </select>
        </div>
      </div>
      <div class="supp-form-row">
        <div class="supp-form-field" style="flex:2">
          <label>Symptoms</label>
          <div class="ctx-tags" id="mc-period-symptoms">
            ${PERIOD_SYMPTOMS.map(s => `<span class="ctx-tag" data-value="${s}" onclick="this.classList.toggle('active')">${s}</span>`).join('')}
          </div>
        </div>
      </div>
      <div class="supp-form-row">
        <div class="supp-form-field" style="flex:2">
          <label>Notes (optional)</label>
          <input type="text" id="mc-period-notes" placeholder="e.g. spotting, unusual pain">
        </div>
        <div class="supp-form-field" style="flex:0;align-self:flex-end">
          <button class="import-btn import-btn-primary" style="padding:8px 16px" onclick="addPeriodEntry()">Add</button>
        </div>
      </div>
    </div>
    <div class="note-editor-actions" style="margin-top:16px">
      <button class="import-btn import-btn-primary" onclick="saveMenstrualCycle()">Save</button>
      <button class="import-btn import-btn-secondary" onclick="window.closeModal()">Cancel</button>
      ${state.importedData.menstrualCycle ? `<button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red);margin-left:auto" onclick="clearMenstrualCycle()">Clear All</button>` : ''}
    </div>`;
  modal.innerHTML = html;
  overlay.classList.add("show");
}

export function saveMenstrualCycle() {
  syncMenstrualCycleProfileFromForm();
  // Auto-add pending period if form has data that hasn't been added yet
  const pendingStart = document.getElementById('mc-period-start')?.value;
  const pendingEnd = document.getElementById('mc-period-end')?.value;
  if (pendingStart && pendingEnd && pendingEnd >= pendingStart) {
    const periods = state.importedData.menstrualCycle?.periods || [];
    const exists = periods.some(p => p.startDate === pendingStart);
    const overlaps = periods.some(p => pendingStart <= (p.endDate || p.startDate) && pendingEnd >= p.startDate);
    if (!exists && !overlaps) {
      const flow = document.getElementById('mc-period-flow')?.value || 'moderate';
      const symptomTags = document.querySelectorAll('#mc-period-symptoms .ctx-tag.active');
      const symptoms = Array.from(symptomTags).map(t => t.dataset.value);
      const notes = document.getElementById('mc-period-notes')?.value?.trim() || '';
      state.importedData.menstrualCycle.periods.push({ startDate: pendingStart, endDate: pendingEnd, flow, symptoms, notes });
    }
  }
  window.recordChange('menstrualCycle');
  saveImportedData();
  window.closeModal();
  const activeNav = document.querySelector(".nav-item.active");
  window.navigate(activeNav ? activeNav.dataset.category : "dashboard");
  showNotification('Menstrual cycle profile saved', 'success');
  // Auto-trigger cycle tour after dashboard re-renders
  setTimeout(() => { if (window.startCycleTour) window.startCycleTour(true); }, 600);
}

export async function clearMenstrualCycle() {
  if (await showConfirmDialog('Clear all menstrual cycle data? This cannot be undone.')) {
    state.importedData.menstrualCycle = null;
    window.recordChange('menstrualCycle');
    saveImportedData();
    window.closeModal();
    const activeNav = document.querySelector(".nav-item.active");
    window.navigate(activeNav ? activeNav.dataset.category : "dashboard");
    showNotification('Menstrual cycle data cleared', 'info');
  }
}

function _toggleCycleEditorFields() {
  const status = document.getElementById('mc-cycle-status')?.value;
  const fields = document.getElementById('mc-active-fields');
  const periodLog = document.getElementById('mc-period-log-section');
  const isActive = !status || status === 'regular' || status === 'perimenopause';
  if (fields) fields.style.display = isActive ? '' : 'none';
  if (periodLog) periodLog.style.display = isActive ? '' : 'none';
}

export function syncMenstrualCycleProfileFromForm() {
  const stats = calculateCycleStats(state.importedData.menstrualCycle ? state.importedData.menstrualCycle.periods : []);
  const mc = state.importedData.menstrualCycle || {};
  const cycleLengthAuto = document.getElementById('mc-cycle-length-auto');
  const periodLengthAuto = document.getElementById('mc-period-length-auto');
  const regularityAuto = document.getElementById('mc-regularity-auto');
  const flowAuto = document.getElementById('mc-flow-auto');
  const cycleLength = cycleLengthAuto ? parseInt(cycleLengthAuto.dataset.value) : (mc.cycleLength || 28);
  const periodLength = periodLengthAuto ? parseInt(periodLengthAuto.dataset.value) : (mc.periodLength || 5);
  const regularity = regularityAuto ? regularityAuto.dataset.value : (mc.regularity || 'regular');
  const flow = flowAuto ? flowAuto.dataset.value : (mc.flow || 'moderate');
  const contraceptive = document.getElementById('mc-contraceptive')?.value || '';
  const conditions = document.getElementById('mc-conditions').value.trim();
  const cycleStatus = document.getElementById('mc-cycle-status')?.value || 'regular';
  if (!state.importedData.menstrualCycle) {
    state.importedData.menstrualCycle = { cycleStatus, cycleLength, periodLength, regularity, flow, contraceptive, conditions, periods: [] };
  } else {
    Object.assign(state.importedData.menstrualCycle, { cycleStatus, cycleLength, periodLength, regularity, flow, contraceptive, conditions });
  }
}

export function addPeriodEntry() {
  const startDate = document.getElementById('mc-period-start').value;
  const endDate = document.getElementById('mc-period-end').value;
  const flow = document.getElementById('mc-period-flow').value;
  const symptomTags = document.querySelectorAll('#mc-period-symptoms .ctx-tag.active');
  const symptoms = Array.from(symptomTags).map(t => t.dataset.value);
  const notes = document.getElementById('mc-period-notes').value.trim();
  if (!startDate) { showNotification('Start date is required', 'error'); return; }
  if (!endDate) { showNotification('End date is required', 'error'); return; }
  if (endDate < startDate) { showNotification('End date must be on or after start date', 'error'); return; }
  syncMenstrualCycleProfileFromForm();
  const exists = state.importedData.menstrualCycle.periods.some(p => p.startDate === startDate);
  if (exists) { showNotification('A period entry with this start date already exists', 'error'); return; }
  const overlaps = state.importedData.menstrualCycle.periods.some(p =>
    startDate <= (p.endDate || p.startDate) && endDate >= p.startDate
  );
  if (overlaps) { showNotification('This overlaps with an existing period entry', 'error'); return; }
  state.importedData.menstrualCycle.periods.push({ startDate, endDate, flow, symptoms, notes });
  saveImportedData();
  openMenstrualCycleEditor();
}

export function deletePeriodEntry(startDate) {
  if (!state.importedData.menstrualCycle || !state.importedData.menstrualCycle.periods) return;
  syncMenstrualCycleProfileFromForm();
  state.importedData.menstrualCycle.periods = state.importedData.menstrualCycle.periods.filter(p => p.startDate !== startDate);
  saveImportedData();
  openMenstrualCycleEditor();
}

export function renderMenstrualCycleSection(data) {
  const mc = state.importedData.menstrualCycle;
  let html = `<div class="cycle-section">
    <div class="supp-timeline-header">
      <span class="context-section-title">Menstrual Cycle</span>
      <div style="display:flex;gap:6px;align-items:center">
        ${mc ? `<button class="cycle-tour-btn" onclick="startCycleTour(false)" title="Cycle feature tour" aria-label="Take the cycle feature tour">?</button>` : ''}
        <button class="supp-add-btn" onclick="openMenstrualCycleEditor()">${mc ? 'Edit' : '+ Set Up'}</button>
      </div>
    </div>`;
  if (!mc) {
    html += `<div class="cycle-prompt" role="button" tabindex="0" aria-label="Set up cycle tracking" onclick="openMenstrualCycleEditor()">
      <span class="cycle-prompt-icon">\uD83D\uDD34</span>
      <div><strong>Track your cycle for better lab interpretation</strong><br>
      <span style="color:var(--text-muted);font-size:12px">Hormone, iron, and inflammation markers vary significantly by cycle phase. Set up cycle tracking so AI can factor this in.</span></div>
    </div>`;
  } else {
    const regLabel = mc.regularity === 'very_irregular' ? 'very irregular' : mc.regularity || 'regular';
    const statusLabels = { postmenopause: 'Postmenopause', perimenopause: 'Perimenopause', pregnant: 'Pregnant', breastfeeding: 'Breastfeeding', absent: 'No active cycle' };
    let summary;
    if (mc.cycleStatus && mc.cycleStatus !== 'regular' && statusLabels[mc.cycleStatus]) {
      summary = statusLabels[mc.cycleStatus];
      if (mc.conditions) summary += ` \u2022 ${escapeHTML(mc.conditions)}`;
    } else {
      summary = `${mc.cycleLength || 28}-day cycle, ${regLabel}, ${mc.flow || 'moderate'} flow`;
      if (mc.contraceptive) summary += ` \u2022 ${escapeHTML(mc.contraceptive)}`;
      if (mc.conditions) summary += ` \u2022 ${escapeHTML(mc.conditions)}`;
    }
    html += `<div class="cycle-summary" role="button" tabindex="0" aria-label="Edit cycle: ${escapeHTML(summary)}" onclick="openMenstrualCycleEditor()" style="cursor:pointer">${summary}</div>`;
    const isActiveCycle = !mc.cycleStatus || mc.cycleStatus === 'regular' || mc.cycleStatus === 'perimenopause';
    const drawRec = isActiveCycle ? getNextBestDrawDate(mc) : null;
    if (drawRec) {
      html += `<div class="cycle-draw-date">
        <span class="cycle-draw-icon">\uD83D\uDCC5</span>
        <div><strong>Next best blood draw:</strong> ${escapeHTML(drawRec.description)}
        <div class="cycle-draw-explain">Early follicular phase gives the most stable baseline for hormones, iron, and inflammation markers.</div></div>
      </div>`;
    }
    if (isActiveCycle && data.dates.length > 0) {
      const phases = getBloodDrawPhases(mc, data.dates);
      const phaseDates = Object.entries(phases);
      if (phaseDates.length > 0) {
        html += `<div class="cycle-draw-phases">`;
        const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        for (const [date, p] of phaseDates) {
          html += `<span class="cycle-draw-tag"><span class="cycle-phase-badge phase-${p.phase}">${p.phaseName}</span> ${fmtDate(date)} \u2014 Day ${p.cycleDay}</span>`;
        }
        html += `</div>`;
      }
    }
    const periods = (mc.periods || []).slice().sort((a, b) => b.startDate.localeCompare(a.startDate)).slice(0, 6);
    if (periods.length > 0) {
      const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      html += `<div class="cycle-period-log">`;
      for (const p of periods) {
        const flowCls = p.flow === 'heavy' ? 'severity-major' : p.flow === 'light' ? 'severity-minor' : 'severity-mild';
        html += `<span class="cycle-period-entry">${fmtDate(p.startDate)}\u2013${fmtDate(p.endDate)} <span class="goals-severity-badge ${flowCls}">${p.flow}</span>${(p.symptoms && p.symptoms.length) ? p.symptoms.map(s => `<span class="period-symptom-tag">${escapeHTML(s)}</span>`).join('') : ''}${p.notes ? ` <span class="cycle-period-note">${escapeHTML(p.notes)}</span>` : ''}</span>`;
      }
      html += `</div>`;
    }
    // Perimenopause pattern detection
    const perimenopause = detectPerimenopausePattern(mc, state.profileDob);
    if (perimenopause) {
      html += `<div class="cycle-alert cycle-alert-perimenopause">
        <span class="cycle-alert-icon">\u26A0\uFE0F</span>
        <div>
          <strong>Possible Perimenopause Pattern</strong>
          <div class="cycle-alert-detail">${escapeHTML(perimenopause.message)}</div>
        </div>
      </div>`;
    }
    // Heavy flow + iron alerts
    const ironAlerts = detectCycleIronAlerts(mc, data);
    for (const alert of ironAlerts) {
      const cls = alert.severity === 'critical' ? 'cycle-alert-critical' : alert.severity === 'warning' ? 'cycle-alert-warning' : 'cycle-alert-info';
      html += `<div class="cycle-alert ${cls}">
        <span class="cycle-alert-icon">${alert.severity === 'critical' ? '\uD83D\uDEA8' : alert.severity === 'warning' ? '\u26A0\uFE0F' : '\u2139\uFE0F'}</span>
        <div>
          <strong>${alert.marker ? escapeHTML(alert.marker) + ' + Heavy Flow' : 'Iron Panel Missing'}</strong>
          <div class="cycle-alert-detail">${escapeHTML(alert.message)}</div>
        </div>
      </div>`;
    }
  }
  html += `</div>`;
  return html;
}

Object.assign(window, { getCyclePhase, getNextBestDrawDate, getBloodDrawPhases, detectPerimenopausePattern, detectCycleIronAlerts, renderMenstrualCycleSection, openMenstrualCycleEditor, saveMenstrualCycle, clearMenstrualCycle, syncMenstrualCycleProfileFromForm, addPeriodEntry, deletePeriodEntry, _toggleCycleEditorFields });
