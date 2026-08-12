// @ts-check
import { getErrorMessage } from './caught-error.js';
import { state } from './state.js';
import { PERIOD_SYMPTOMS } from './constants.js';
import { escapeHTML, showNotification, showConfirmDialog, linearRegression } from './utils.js';
import { saveImportedData } from './data.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { startCycleTour } from './tour.js';
import { calculateCycleStats, createCyclePeriod, recentCyclePeriods, upgradeMenstrualCycleProfile } from './cycle-summary.js';
import { clearCycleProfileData, renderCycleImportPickerControls, renderCycleImportSummarySection } from './cycle-import-loader.js';
import { recordContextCardChangeRuntime } from './context-cards-runtime.js';
import { closeCycleModalRuntime, configureCycleAnalysisBridge, isCycleStylesheetLoaded, loadCycleStylesheetForAction, navigateCycleViewRuntime } from './cycle-runtime.js';
import { getRecordedDrawPhase } from './cycle-draw-phases.js';
const CYCLE_ACTIVE_STATUSES = new Set(['regular', 'perimenopause']);
const CYCLE_ICONS = {
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></svg>',
  droplet: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.5 6.9 9.1a8 8 0 1 0 10.2 0L12 2.5Z"></path></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"></path></svg>',
  help: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"></circle><path d="M9.1 9a3 3 0 1 1 4.9 2.3c-.9.6-1.5 1.1-1.5 2.2"></path><path d="M12 17h.01"></path></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4M12 8h.01"></path></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"></path></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v5M14 11v5"></path></svg>',
  warning: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 3 10 18H2L12 3Z"></path><path d="M12 9v5M12 17h.01"></path></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 6 6 18M6 6l12 12"></path></svg>'
};
const appWindow = /** @type {Window & typeof globalThis & { __cycleDelegatesBound?: boolean }} */ (
  typeof window !== 'undefined' ? window : {}
);
function closeCycleModal() {
  closeCycleModalRuntime();
}
function navigateCycleView(category) { navigateCycleViewRuntime(category); }
function cycleActionAttrs(action, extra = '') {
  return `data-cycle-action="${action}"${extra ? ` ${extra}` : ''}`;
}
/**
 * @param {EventTarget | null} target
 * @param {string} selector
 * @returns {HTMLElement | null}
 */
function closestCycleElement(target, selector) {
  if (!(target instanceof Element)) return null;
  const el = target.closest(selector);
  return el instanceof HTMLElement ? el : null;
}
/** @param {MouseEvent} event */
function handleCycleClick(event) {
  const actionEl = closestCycleElement(event.target, '[data-cycle-action]');
  if (!actionEl) return;
  switch (actionEl.dataset.cycleAction || '') {
    case 'close':
      closeCycleModal();
      break;
    case 'delete-period':
      deletePeriodEntry(actionEl.dataset.cycleStartDate || '');
      break;
    case 'toggle-symptom':
      toggleCycleSymptomTag(actionEl);
      break;
    case 'add-period':
      addPeriodEntry();
      break;
    case 'clear':
      clearMenstrualCycle();
      break;
    case 'save':
      saveMenstrualCycle();
      break;
    case 'start-tour':
      startCycleTour(false);
      break;
    case 'open-editor':
      openMenstrualCycleEditor();
      break;
    default:
      break;
  }
}
/** @param {Event} event */
function handleCycleChange(event) {
  const actionEl = closestCycleElement(event.target, '[data-cycle-action="toggle-fields"]');
  if (!actionEl) return;
  _toggleCycleEditorFields();
}
function initCycleActionDelegates() {
  if (appWindow.__cycleDelegatesBound || typeof document === 'undefined') return;
  appWindow.__cycleDelegatesBound = true;
  document.addEventListener('click', handleCycleClick);
  document.addEventListener('change', handleCycleChange);
}
initCycleActionDelegates();
export { calculateCycleStats };
/**
 * @param {string | null | undefined} id
 * @returns {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null}
 */
function getFormField(id) {
  if (!id) return null;
  const el = document.getElementById(id);
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  ) {
    return el;
  }
  return null;
}
/**
 * @param {string} id
 * @returns {string}
 */
function getFieldValue(id) {
  return getFormField(id)?.value || '';
}
/**
 * @param {Element} el
 * @returns {el is HTMLElement}
 */
function isHTMLElement(el) {
  return el instanceof HTMLElement;
}
function isActiveCycleStatus(status) {
  return !status || CYCLE_ACTIVE_STATUSES.has(status);
}
/**
 * @param {string | null | undefined} dateStr
 * @param {Intl.DateTimeFormatOptions} [opts]
 */
function fmtCycleDate(dateStr, opts = { month: 'short', day: 'numeric' }) {
  if (!dateStr) return 'No date';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', opts);
}
function flowClass(flow) {
  if (flow === 'heavy') return 'severity-major';
  if (flow === 'light') return 'severity-minor';
  return 'severity-mild';
}
function renderCycleMetaTags(items) {
  return items.filter(Boolean).map(item => `<span class="cycle-meta-tag">${escapeHTML(item)}</span>`).join('');
}
export function getCyclePhase(dateStr, mc) {
  if (!mc || !mc.periods || mc.periods.length === 0) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const sorted = mc.periods.slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
  let basisPeriod = null;
  for (const p of sorted) {
    if (new Date(p.startDate + 'T00:00:00') <= target) {
      basisPeriod = p;
      break;
    }
  }
  if (!basisPeriod) return null;
  const startDate = new Date(basisPeriod.startDate + 'T00:00:00');
  const cycleDay = Math.floor((target.getTime() - startDate.getTime()) / 86400000) + 1;
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
  const periodEnd = basisPeriod.endDate || basisPeriod.startDate;
  const observedBleedDay = dateStr >= basisPeriod.startDate && dateStr <= periodEnd;
  return {
    cycleDay,
    phase,
    phaseName,
    confidence: observedBleedDay ? 'high' : (basisPeriod.confidence === 'observed' ? 'medium' : basisPeriod.confidence || 'medium'),
    basedOnStartDate: basisPeriod.startDate,
    source: basisPeriod.source || null,
  };
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
    const dayInCycle = Math.floor((today.getTime() - currentPeriodStart.getTime()) / 86400000) + 1;
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

export function getBloodDrawPhases(mc, dates, entryContextByDate = {}) {
  if (!dates) return {};
  const phases = {};
  for (const d of dates) {
    const recordedPhase = getRecordedDrawPhase(entryContextByDate[d]);
    if (recordedPhase) {
      phases[d] = recordedPhase;
      continue;
    }
    const p = mc ? getCyclePhase(d, mc) : null;
    if (p) phases[d] = { ...p, phaseDetailName: p.phaseName, source: 'predicted' };
  }
  return phases;
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
    intervals.push(Math.round((curr.getTime() - prev.getTime()) / 86400000));
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
  if (typeof document !== 'undefined' && document.querySelector('[data-cycle-stylesheet-anchor]') && !isCycleStylesheetLoaded()) {
    return loadCycleStylesheetForAction().then(function openCycleEditorAfterStylesheet(loaded) { return loaded ? openMenstrualCycleEditor() : false; });
  }
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  if (!(modal instanceof HTMLElement)) return false;
  const mc = state.importedData.menstrualCycle || {};
  const periods = (mc.periods || []).slice().sort(function newestCyclePeriodFirst(a, b) { return b.startDate.localeCompare(a.startDate); });
  const stats = calculateCycleStats(mc.periods);
  const regLabels = { regular: 'Regular', irregular: 'Irregular', very_irregular: 'Very Irregular' };
  const activeCycle = isActiveCycleStatus(mc.cycleStatus);
  const flowLabels = { light: 'Light', moderate: 'Moderate', heavy: 'Heavy' };
  modal.className = 'modal cycle-modal';
  let html = `<div class="gb-modal-head cycle-modal-head">
      <div>
        <div class="gb-modal-kicker">Body context</div>
        <div class="gb-modal-title">Menstrual Cycle</div>
      </div>
      <button type="button" class="modal-close cycle-icon-btn" ${cycleActionAttrs('close')} aria-label="Close cycle editor">${CYCLE_ICONS.x}</button>
    </div>
    <div class="cycle-modal-body">
      <p class="cycle-modal-intro">Track cycle status, period history, and symptoms so hormone, iron, and inflammation markers can be interpreted against cycle phase.</p>
      <section class="cycle-editor-section">
        <div class="cycle-editor-section-title">Cycle Profile</div>
        <div class="cycle-form-grid cycle-form-grid-single">
          <label class="cycle-field">
            <span>Cycle Status</span>
          <select id="mc-cycle-status" ${cycleActionAttrs('toggle-fields')}>
            <option value="regular"${mc.cycleStatus === 'regular' || !mc.cycleStatus ? ' selected' : ''}>Active - regular cycling</option>
            <option value="perimenopause"${mc.cycleStatus === 'perimenopause' ? ' selected' : ''}>Perimenopause / irregular</option>
            <option value="postmenopause"${mc.cycleStatus === 'postmenopause' ? ' selected' : ''}>Postmenopause / no periods</option>
            <option value="pregnant"${mc.cycleStatus === 'pregnant' ? ' selected' : ''}>Pregnant</option>
            <option value="breastfeeding"${mc.cycleStatus === 'breastfeeding' ? ' selected' : ''}>Breastfeeding</option>
            <option value="absent"${mc.cycleStatus === 'absent' ? ' selected' : ''}>Absent (other reason)</option>
          </select>
          </label>
        </div>
        <div id="mc-active-fields" class="cycle-active-fields"${activeCycle ? '' : ' hidden'}>
          <div class="cycle-form-grid">
            <label class="cycle-field">
              <span>Average Cycle Length</span>
          ${stats.cycleLength != null
            ? `<div class="mc-auto-value cycle-auto-value" id="mc-cycle-length-auto" data-value="${stats.cycleLength}">${stats.cycleLength} days</div>`
            : `<div class="mc-auto-value cycle-auto-value mc-auto-pending">${mc.cycleLength || 28} days <span class="mc-auto-hint">default - log 2+ periods to auto-calculate</span></div>`}
            </label>
            <label class="cycle-field">
              <span>Average Period Length</span>
          ${stats.periodLength != null
            ? `<div class="mc-auto-value cycle-auto-value" id="mc-period-length-auto" data-value="${stats.periodLength}">${stats.periodLength} days</div>`
            : `<div class="mc-auto-value cycle-auto-value mc-auto-pending">${mc.periodLength || 5} days <span class="mc-auto-hint">default - log periods with end dates to auto-calculate</span></div>`}
            </label>
            <label class="cycle-field">
              <span>Regularity</span>
          ${stats.regularity != null
            ? `<div class="mc-auto-value cycle-auto-value" id="mc-regularity-auto" data-value="${stats.regularity}">${regLabels[stats.regularity]}</div>`
            : `<div class="mc-auto-value cycle-auto-value mc-auto-pending">${regLabels[mc.regularity] || 'Regular'} <span class="mc-auto-hint">default - log 3+ periods to auto-calculate</span></div>`}
            </label>
            <label class="cycle-field">
              <span>Typical Flow</span>
          ${stats.flow != null
            ? `<div class="mc-auto-value cycle-auto-value" id="mc-flow-auto" data-value="${stats.flow}">${flowLabels[stats.flow]}</div>`
            : `<div class="mc-auto-value cycle-auto-value mc-auto-pending">${flowLabels[mc.flow] || 'Moderate'} <span class="mc-auto-hint">default - log 1+ period to auto-calculate</span></div>`}
            </label>
          </div>
        </div>
        <div class="cycle-form-grid">
          <label class="cycle-field">
            <span>Contraceptive</span>
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
          </label>
          <label class="cycle-field">
            <span>Conditions</span>
            <input type="text" id="mc-conditions" value="${escapeHTML(mc.conditions || '')}" placeholder="e.g. PCOS, endometriosis, fibroids">
          </label>
        </div>
      </section>${renderCycleImportSummarySection(mc)}
      <section id="mc-period-log-section" class="cycle-editor-section cycle-period-editor"${activeCycle ? '' : ' hidden'}>
        <div class="cycle-editor-section-title">Period Log</div>`;
  if (periods.length > 0) {
    html += `<div class="cycle-log-list">`;
    for (const p of periods) {
      const dateLabel = `${fmtCycleDate(p.startDate, { month: 'short', day: 'numeric', year: 'numeric' })} - ${fmtCycleDate(p.endDate, { month: 'short', day: 'numeric', year: 'numeric' })}`;
      html += `<div class="cycle-log-item">
        <span class="cycle-log-icon">${CYCLE_ICONS.droplet}</span>
        <div class="cycle-log-main">
          <div class="cycle-log-date">${escapeHTML(dateLabel)}</div>
          <div class="cycle-log-meta">
            <span class="goals-severity-badge ${flowClass(p.flow)}">${escapeHTML(p.flow || 'moderate')}</span>
            ${(p.symptoms && p.symptoms.length) ? p.symptoms.map(s => `<span class="period-symptom-tag">${escapeHTML(s)}</span>`).join('') : ''}
            ${p.notes ? `<span class="cycle-period-note">${escapeHTML(p.notes)}</span>` : ''}
          </div>
        </div>
        <button type="button" class="cycle-icon-btn cycle-delete-btn" ${cycleActionAttrs('delete-period', `data-cycle-start-date="${escapeHTML(p.startDate)}"`)} aria-label="Delete period starting ${escapeHTML(fmtCycleDate(p.startDate))}" title="Delete period">${CYCLE_ICONS.trash}</button>
      </div>`;
    }
    html += `</div>`;
  }
  const today = new Date().toISOString().slice(0, 10);
  const defaultEnd = new Date(Date.now() + ((mc.periodLength || 5) - 1) * 86400000).toISOString().slice(0, 10);
  html += `<div class="cycle-period-add">
        <div class="cycle-form-grid cycle-form-grid-three">
          <label class="cycle-field">
            <span>Start Date</span>
          <input type="date" id="mc-period-start" value="${today}">
          </label>
          <label class="cycle-field">
            <span>End Date</span>
          <input type="date" id="mc-period-end" value="${defaultEnd}">
          </label>
          <label class="cycle-field">
            <span>Flow</span>
          <select id="mc-period-flow">
            <option value="light">Light</option>
            <option value="moderate" selected>Moderate</option>
            <option value="heavy">Heavy</option>
          </select>
          </label>
        </div>
        <label class="cycle-field cycle-field-wide">
          <span>Symptoms</span>
          <div class="ctx-tags cycle-symptom-grid" id="mc-period-symptoms">
            ${PERIOD_SYMPTOMS.map(s => `<button type="button" class="ctx-tag cycle-symptom-chip" data-value="${escapeHTML(s)}" aria-pressed="false" ${cycleActionAttrs('toggle-symptom')}>${escapeHTML(s)}</button>`).join('')}
          </div>
        </label>
        <div class="cycle-add-row">
          <label class="cycle-field">
            <span>Notes (optional)</span>
          <input type="text" id="mc-period-notes" placeholder="e.g. spotting, unusual pain">
          </label>
          <button type="button" class="dashboard-action-btn dashboard-action-btn-primary cycle-add-btn" ${cycleActionAttrs('add-period')}>${CYCLE_ICONS.plus}<span>Add period</span></button>
        </div>
      </div>
      </section>
    </div>
    <div class="cycle-modal-footer">
      ${state.importedData.menstrualCycle ? `<button type="button" class="dashboard-action-btn cycle-danger-btn" ${cycleActionAttrs('clear')}>Clear All</button>` : ''}
      <button type="button" class="dashboard-action-btn" ${cycleActionAttrs('close')}>Cancel</button>
      <button type="button" class="dashboard-action-btn dashboard-action-btn-primary" ${cycleActionAttrs('save')}>Save</button>
    </div>`;
  modal.innerHTML = html;
  openModalOverlay(overlay);
}
export function saveMenstrualCycle() {
  const mc = syncMenstrualCycleProfileFromForm();
  if (!mc) {
    showNotification('Menstrual cycle profile could not be initialized', 'error');
    return;
  }
  // Auto-add pending period if form has data that hasn't been added yet
  const cycleStatus = getFieldValue('mc-cycle-status') || 'regular';
  const pendingStart = getFieldValue('mc-period-start');
  const pendingEnd = getFieldValue('mc-period-end');
  if (isActiveCycleStatus(cycleStatus) && pendingStart && pendingEnd && pendingEnd >= pendingStart) {
    const periods = mc.periods || [];
    const exists = periods.some(p => p.startDate === pendingStart);
    const overlaps = periods.some(p => pendingStart <= (p.endDate || p.startDate) && pendingEnd >= p.startDate);
    if (!exists && !overlaps) {
      const flow = getFieldValue('mc-period-flow') || 'moderate';
      const symptoms = getSelectedCycleSymptoms();
      const notes = getFieldValue('mc-period-notes').trim();
      const updatedAt = new Date().toISOString();
      const period = createCyclePeriod({ startDate: pendingStart, endDate: pendingEnd, flow, symptoms, notes, updatedAt });
      if (!period) {
        showNotification('Period dates are invalid', 'error');
        return;
      }
      mc.periods.push(period);
      state.importedData.menstrualCycle = upgradeMenstrualCycleProfile(mc, { now: updatedAt });
    }
  }
  recordContextCardChangeRuntime('menstrualCycle');
  saveImportedData();
  closeCycleModal();
  const activeNav = document.querySelector(".nav-item.active");
  navigateCycleView(activeNav instanceof HTMLElement ? activeNav.dataset.category || "dashboard" : "dashboard");
  showNotification('Menstrual cycle profile saved', 'success');
  // Auto-trigger cycle tour after dashboard re-renders
  setTimeout(() => { startCycleTour(true); }, 600);
}
export async function clearMenstrualCycle() {
  if (await showConfirmDialog('Clear all menstrual cycle data? This cannot be undone.')) {
    try { await clearCycleProfileData(); }
    catch (error) { showNotification(`Menstrual cycle data could not be cleared: ${getErrorMessage(error)}`, 'error'); return; }
    closeCycleModal();
    const activeNav = document.querySelector(".nav-item.active");
    navigateCycleView(activeNav instanceof HTMLElement ? activeNav.dataset.category || "dashboard" : "dashboard");
    showNotification('Menstrual cycle data cleared', 'info');
  }
}

export function _toggleCycleEditorFields() {
  const status = getFieldValue('mc-cycle-status');
  const fields = document.getElementById('mc-active-fields');
  const periodLog = document.getElementById('mc-period-log-section');
  const isActive = isActiveCycleStatus(status);
  if (fields) fields.hidden = !isActive;
  if (periodLog) periodLog.hidden = !isActive;
}

export function toggleCycleSymptomTag(btn) {
  if (!btn) return;
  const active = btn.classList.toggle('active');
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
}

function getSelectedCycleSymptoms() {
  const symptomTags = document.querySelectorAll('#mc-period-symptoms .ctx-tag.active');
  return Array.from(symptomTags).filter(isHTMLElement).map(tag => tag.dataset.value || '').filter(Boolean);
}

export function syncMenstrualCycleProfileFromForm() {
  const mc = state.importedData.menstrualCycle || {};
  const cycleLengthAuto = document.getElementById('mc-cycle-length-auto');
  const periodLengthAuto = document.getElementById('mc-period-length-auto');
  const regularityAuto = document.getElementById('mc-regularity-auto');
  const flowAuto = document.getElementById('mc-flow-auto');
  const parsedCycleLength = cycleLengthAuto instanceof HTMLElement ? parseInt(cycleLengthAuto.dataset.value || '', 10) : (mc.cycleLength || 28);
  const parsedPeriodLength = periodLengthAuto instanceof HTMLElement ? parseInt(periodLengthAuto.dataset.value || '', 10) : (mc.periodLength || 5);
  const cycleLength = Number.isFinite(parsedCycleLength) ? parsedCycleLength : (mc.cycleLength || 28);
  const periodLength = Number.isFinite(parsedPeriodLength) ? parsedPeriodLength : (mc.periodLength || 5);
  const regularity = regularityAuto instanceof HTMLElement ? regularityAuto.dataset.value : (mc.regularity || 'regular');
  const flow = flowAuto instanceof HTMLElement ? flowAuto.dataset.value : (mc.flow || 'moderate');
  const contraceptive = getFieldValue('mc-contraceptive');
  const conditions = getFieldValue('mc-conditions').trim();
  const cycleStatus = getFieldValue('mc-cycle-status') || 'regular';
  const base = state.importedData.menstrualCycle
    ? { ...state.importedData.menstrualCycle, cycleStatus, cycleLength, periodLength, regularity, flow, contraceptive, conditions }
    : { cycleStatus, cycleLength, periodLength, regularity, flow, contraceptive, conditions, periods: [] };
  const profile = upgradeMenstrualCycleProfile(base);
  state.importedData.menstrualCycle = profile;
  return profile;
}

export function addPeriodEntry() {
  const startDate = getFieldValue('mc-period-start');
  const endDate = getFieldValue('mc-period-end');
  const flow = getFieldValue('mc-period-flow');
  const symptoms = getSelectedCycleSymptoms();
  const notes = getFieldValue('mc-period-notes').trim();
  if (!startDate) { showNotification('Start date is required', 'error'); return; }
  if (!endDate) { showNotification('End date is required', 'error'); return; }
  if (endDate < startDate) { showNotification('End date must be on or after start date', 'error'); return; }
  const mc = syncMenstrualCycleProfileFromForm();
  if (!mc) {
    showNotification('Menstrual cycle profile could not be initialized', 'error');
    return;
  }
  const exists = mc.periods.some(p => p.startDate === startDate);
  if (exists) { showNotification('A period entry with this start date already exists', 'error'); return; }
  const overlaps = mc.periods.some(p =>
    startDate <= (p.endDate || p.startDate) && endDate >= p.startDate
  );
  if (overlaps) { showNotification('This overlaps with an existing period entry', 'error'); return; }
  const updatedAt = new Date().toISOString();
  const period = createCyclePeriod({ startDate, endDate, flow, symptoms, notes, updatedAt });
  if (!period) { showNotification('Period dates are invalid', 'error'); return; }
  mc.periods.push(period);
  state.importedData.menstrualCycle = upgradeMenstrualCycleProfile(mc, { now: updatedAt });
  saveImportedData();
  openMenstrualCycleEditor();
}

export function deletePeriodEntry(startDate) {
  if (!state.importedData.menstrualCycle || !state.importedData.menstrualCycle.periods) return;
  const mc = syncMenstrualCycleProfileFromForm();
  if (!mc) return;
  mc.periods = mc.periods.filter(p => p.startDate !== startDate);
  state.importedData.menstrualCycle = upgradeMenstrualCycleProfile(mc);
  saveImportedData();
  openMenstrualCycleEditor();
}

export function renderMenstrualCycleSection(data, opts = {}) {
  const compact = opts?.variant === 'dashboard';
  const showHeader = opts?.showHeader !== false;
  const mc = state.importedData.menstrualCycle ? upgradeMenstrualCycleProfile(state.importedData.menstrualCycle) : null;
  const renderAlert = alert => {
    const cls = alert.kind === 'perimenopause'
      ? 'cycle-alert-perimenopause'
      : alert.severity === 'critical'
        ? 'cycle-alert-critical'
        : alert.severity === 'warning'
          ? 'cycle-alert-warning'
          : 'cycle-alert-info';
    return `<div class="cycle-alert ${cls}">
      <span class="cycle-alert-icon">${alert.severity === 'info' ? CYCLE_ICONS.info : CYCLE_ICONS.warning}</span>
      <div class="cycle-alert-copy">
        <strong>${escapeHTML(alert.title)}</strong>
        <div class="cycle-alert-detail">${escapeHTML(alert.message)}</div>
      </div>
    </div>`;
  };
  let html = `<div class="cycle-section${compact ? ' cycle-section-compact' : ''}">`;
  if (showHeader) {
    html += `<div class="cycle-widget-head">
      <div class="cycle-widget-title-wrap">
        <span class="cycle-widget-kicker">Body context</span>
        <span class="cycle-widget-title">Menstrual cycle</span>
      </div>
      <div class="cycle-widget-actions">
        ${mc ? `<button type="button" class="cycle-icon-btn" ${cycleActionAttrs('start-tour')} title="Cycle feature tour" aria-label="Take the cycle feature tour">${CYCLE_ICONS.help}</button>` : ''}
        ${renderCycleImportPickerControls()}
        <button type="button" class="cycle-action-btn" ${cycleActionAttrs('open-editor')}>${mc ? CYCLE_ICONS.edit : CYCLE_ICONS.plus}<span>${mc ? 'Edit' : 'Set up'}</span></button>
      </div>
    </div>`;
  }
  if (!mc) {
    html += `<button type="button" class="cycle-prompt" aria-label="Set up cycle tracking" ${cycleActionAttrs('open-editor')}>
      <span class="cycle-prompt-icon">${CYCLE_ICONS.droplet}</span>
      <span class="cycle-prompt-copy">
        <strong>Track your cycle for better lab interpretation</strong>
        <span>Hormone, iron, and inflammation markers shift by phase. Add cycle context so AI can account for timing.</span>
      </span>
    </button>`;
  } else {
    const regLabel = mc.regularity === 'very_irregular' ? 'very irregular' : mc.regularity || 'regular';
    const statusLabels = { postmenopause: 'Postmenopause', perimenopause: 'Perimenopause', pregnant: 'Pregnant', breastfeeding: 'Breastfeeding', absent: 'No active cycle' };
    let summaryPrimary;
    const summaryMeta = [];
    if (mc.cycleStatus && mc.cycleStatus !== 'regular' && statusLabels[mc.cycleStatus]) {
      summaryPrimary = statusLabels[mc.cycleStatus];
      if (isActiveCycleStatus(mc.cycleStatus)) {
        summaryMeta.push(`${mc.cycleLength || 28}-day cycle`, regLabel, `${mc.flow || 'moderate'} flow`);
      }
    } else {
      summaryPrimary = `${mc.cycleLength || 28}-day cycle`;
      summaryMeta.push(regLabel, `${mc.flow || 'moderate'} flow`);
    }
    if (mc.contraceptive) summaryMeta.push(mc.contraceptive);
    if (mc.conditions) summaryMeta.push(mc.conditions);
    const sortedPeriods = recentCyclePeriods(mc, 12);
    const coverage = mc.coverage;
    if (coverage?.periodCount) summaryMeta.push(`${coverage.periodCount} periods`);
    if (compact && sortedPeriods[0]?.startDate) summaryMeta.push(`Last ${fmtCycleDate(sortedPeriods[0].startDate)}`);
    const summaryAria = [summaryPrimary, ...summaryMeta].filter(Boolean).join(', ');
    html += `<button type="button" class="cycle-summary-card" aria-label="Edit cycle: ${escapeHTML(summaryAria)}" ${cycleActionAttrs('open-editor')}>
      <span class="cycle-summary-icon">${CYCLE_ICONS.droplet}</span>
      <span class="cycle-summary-copy">
        <span class="cycle-summary-label">Current profile</span>
        <strong>${escapeHTML(summaryPrimary)}</strong>
        <span class="cycle-summary-tags">${renderCycleMetaTags(summaryMeta)}</span>
      </span>
    </button>`;
    const isActiveCycle = isActiveCycleStatus(mc.cycleStatus);
    const drawRec = isActiveCycle ? getNextBestDrawDate(mc) : null;
    if (drawRec) {
      html += `<div class="cycle-draw-date">
        <span class="cycle-draw-icon">${CYCLE_ICONS.calendar}</span>
        <div class="cycle-draw-copy">
          <strong>Next best blood draw</strong>
          <span>${escapeHTML(drawRec.description)}</span>
          <small>Early follicular phase gives the most stable baseline for hormones, iron, and inflammation markers.</small>
        </div>
      </div>`;
    }
    if (isActiveCycle && data?.dates?.length > 0) {
      const phases = getBloodDrawPhases(mc, data.dates, data.entryContextByDate);
      const phaseDates = Object.entries(phases);
      if (phaseDates.length > 0) {
        html += `<div class="cycle-draw-phases">`;
        const visiblePhaseDates = compact ? phaseDates.slice(0, 2) : phaseDates;
        for (const [date, p] of visiblePhaseDates) {
          const sourceLabel = p.source === 'recorded' ? 'Recorded' : 'Predicted';
          html += `<span class="cycle-draw-tag"><span class="cycle-phase-badge phase-${p.phase}">${escapeHTML(p.phaseDetailName || p.phaseName)}</span><span>${escapeHTML(fmtCycleDate(date, { month: 'short', day: 'numeric', year: 'numeric' }))}</span>${p.cycleDay ? `<span class="cycle-tag-day">Day ${p.cycleDay}</span>` : ''}<span class="cycle-tag-day">${sourceLabel}</span></span>`;
        }
        if (compact && phaseDates.length > visiblePhaseDates.length) {
          html += `<span class="cycle-draw-tag cycle-draw-more">+${phaseDates.length - visiblePhaseDates.length} more draws</span>`;
        }
        html += `</div>`;
      }
    }
    const periods = compact ? [] : sortedPeriods.slice(0, 6);
    if (periods.length > 0) {
      html += `<div class="cycle-period-log">`;
      for (const p of periods) {
        const dateLabel = `${fmtCycleDate(p.startDate)}-${fmtCycleDate(p.endDate || p.startDate)}`;
        html += `<span class="cycle-period-entry">
          <span class="cycle-period-date">${escapeHTML(dateLabel)}</span>
          <span class="goals-severity-badge ${flowClass(p.flow)}">${escapeHTML(p.flow || 'moderate')}</span>
          ${(p.symptoms && p.symptoms.length) ? p.symptoms.map(s => `<span class="period-symptom-tag">${escapeHTML(s)}</span>`).join('') : ''}
          ${p.notes ? `<span class="cycle-period-note">${escapeHTML(p.notes)}</span>` : ''}
        </span>`;
      }
      html += `</div>`;
    }
    // Perimenopause pattern detection
    const perimenopause = detectPerimenopausePattern(mc, state.profileDob);
    // Heavy flow + iron alerts
    const ironAlerts = data ? detectCycleIronAlerts(mc, data) : [];
    const alerts = [
      perimenopause ? { kind: 'perimenopause', severity: 'warning', title: 'Possible Perimenopause Pattern', message: perimenopause.message } : null,
      ...ironAlerts.map(alert => ({ ...alert, title: alert.marker ? `${alert.marker} + Heavy Flow` : 'Iron Panel Missing' }))
    ].filter(Boolean);
    for (const alert of compact ? alerts.slice(0, 1) : alerts) {
      html += renderAlert(alert);
    }
  }
  html += `</div>`;
  return html;
}
configureCycleAnalysisBridge({ detectCycleIronAlerts, detectPerimenopausePattern, getBloodDrawPhases, getNextBestDrawDate });
