// @ts-check
// light-env.js — Light Environment module: rooms, screens, indoor light dose.
//
// Tracks continuous indoor light context alongside episodic Sun Sessions.
//
// Schema:
//   importedData.lightEnvironment = {
//     rooms: [{ name, primarySource, cct, hoursOccupiedPerDay,
//                eveningHoursAfterSunset, flickerScore, ... }],
//     screens: [{ device, hoursPerDay, eveningUseAfterSunset, ... }],
//   }

import { state } from './state.js';
import { bindModalSyncRefresh, escapeHTML, escapeAttr } from './utils.js';
import { roomUsesEveningAfterSunset } from './light-env-evening.js';
import {
  getEnvironment,
  getScreensForRoom,
  isActiveToday,
} from './light-env-store.js';
import {
  PRIMARY_SOURCES,
  DAYLIGHT_LEVELS,
  SOURCE_ARCHETYPES,
  HOURS_BUCKETS,
  EVENING_BUCKETS,
  activeSourceArchetype,
  activeHoursBucket,
  activeEveningBucket,
  computeRoomSeverityForRoom,
  computeDeficitAxesForEnvironment,
  computeIndoorBurdenForEnvironment,
} from './light-env-model.js';
import {
  configureLightEnvAudits,
  getLightAudits,
  lightEnvAuditActionHandlers,
  renderLightAuditsBlock,
} from './light-env-audits.js';
import { installLightEnvActionDelegates, lightEnvActionAttrs } from './light-env-actions.js';
import {
  configureLightEnvEditor,
  isLightEnvScreenExpanded,
  lightEnvEditorActionHandlers,
  nextDefaultRoomName,
  resolveActiveRoomId,
  suggestRoomSourceFromSpectrum,
} from './light-env-editor.js';
import { renderScreenCard } from './light-env-screen-ui.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';

export { getLightAudits, saveLightAudit, updateLightAudit, deleteLightAudit } from './light-env-audits.js';
export {
  addRoom,
  addScreen,
  deleteRoom,
  deleteScreen,
  getEnvironment,
  getScreensForRoom,
  isActiveToday,
  setTodayActive,
  updateRoom,
  updateScreen,
} from './light-env-store.js';
export {
  PRIMARY_SOURCES,
  DAYLIGHT_LEVELS,
  SCREEN_DEVICES,
  SOURCE_ARCHETYPES,
  HOURS_BUCKETS,
  EVENING_BUCKETS,
  activeSourceArchetype,
  activeHoursBucket,
  activeEveningBucket,
  defaultHoursForName,
  computeScreenStatus,
} from './light-env-model.js';
export {
  getRoomEveningHoursAfterSunset,
  hasRoomEveningAnswer,
  roomUsesEveningAfterSunset,
} from './light-env-evening.js';
export { nextDefaultRoomName, suggestRoomSourceFromSpectrum };

/** @type {{ getMeasurementsForRoom: AnyFunction | null, navigate: AnyFunction | null, renderBurdenInterp: AnyFunction | null, renderMeasurementAIInline: AnyFunction | null, renderRoomAIBlock: AnyFunction | null, renderScreenAIBlock: AnyFunction | null, openSpectrumClassifier: AnyFunction | null, openLuxMeter: AnyFunction | null, openFlickerDetector: AnyFunction | null, openCCTMeter: AnyFunction | null, openDarknessMeter: AnyFunction | null }} */
const lightEnvDeps = {
  getMeasurementsForRoom: null,
  navigate: null,
  renderBurdenInterp: null,
  renderMeasurementAIInline: null,
  renderRoomAIBlock: null,
  renderScreenAIBlock: null,
  openSpectrumClassifier: null,
  openLuxMeter: null,
  openFlickerDetector: null,
  openCCTMeter: null,
  openDarknessMeter: null,
};

export function configureLightEnv(deps = {}) {
  const previous = { ...lightEnvDeps };
  for (const [key, value] of Object.entries(deps || {})) {
    if (Object.prototype.hasOwnProperty.call(lightEnvDeps, key)) {
      lightEnvDeps[key] = value;
    }
  }
  return previous;
}

// Step 1 chip-picker render helpers — produce the inline chip rows
// for source / hours / evening, plus the "More options" reveal that
// drops back to the full 10-option dropdown for power users.

function renderSourcePicker(r) {
  const active = activeSourceArchetype(r.primarySource);
  const chips = SOURCE_ARCHETYPES.map(a => {
    const isActive = active === a.key;
    return `<button type="button" class="light-env-chip${isActive ? ' light-env-chip-active' : ''}" aria-pressed="${isActive ? 'true' : 'false'}" ${lightEnvActionAttrs('set-room-source-archetype', { id: r.id, key: a.key })}>${a.emoji} ${escapeHTML(a.label)}</button>`;
  }).join('');
  // Power-user reveal — keep the full 10-option dropdown for users who
  // know their CCT spec or want "natural-only" / "tunable LED".
  const showFullDropdown = !active; // expand by default if we couldn't map their saved value into an archetype
  return `<div class="light-env-picker">
    <span class="light-env-picker-label">Light source</span>
    <div class="light-env-chip-row">${chips}</div>
    <details class="light-env-picker-more"${showFullDropdown ? ' open' : ''}>
      <summary>More source types…</summary>
      <select class="ctx-select" ${lightEnvActionAttrs('update-room-primary-source', { id: r.id })} aria-label="Primary light source">
        ${PRIMARY_SOURCES.map(s => `<option value="${escapeAttr(s.key)}"${r.primarySource === s.key ? ' selected' : ''}>${escapeHTML(s.label)}</option>`).join('')}
      </select>
    </details>
  </div>`;
}

function renderHoursPicker(r) {
  const active = activeHoursBucket(r.hoursOccupiedPerDay);
  const chips = HOURS_BUCKETS.map(b => {
    const isActive = active === b.key;
    return `<button type="button" class="light-env-chip${isActive ? ' light-env-chip-active' : ''}" aria-pressed="${isActive ? 'true' : 'false'}" ${lightEnvActionAttrs('set-room-hours-bucket', { id: r.id, key: b.key })}>${escapeHTML(b.label)}</button>`;
  }).join('');
  return `<div class="light-env-picker">
    <span class="light-env-picker-label">Time you spend here</span>
    <div class="light-env-chip-row">${chips}</div>
    <details class="light-env-picker-more">
      <summary>Set exact hours…</summary>
      <input type="number" min="0" max="24" step="0.5" class="ctx-input" placeholder="hr/day" value="${r.hoursOccupiedPerDay ?? ''}" ${lightEnvActionAttrs('update-room-hours', { id: r.id })} aria-label="Hours per day" />
    </details>
  </div>`;
}

function renderDaylightPicker(r) {
  const chips = DAYLIGHT_LEVELS.map(level => {
    const active = r.daylightLevel === level.key;
    return `<button type="button" class="light-env-chip${active ? ' light-env-chip-active' : ''}" aria-pressed="${active ? 'true' : 'false'}" ${lightEnvActionAttrs('set-room-daylight-level', { id: r.id, key: level.key })}>${escapeHTML(level.label)}</button>`;
  }).join('');
  return `<div class="light-env-picker">
    <span class="light-env-picker-label">Daylight reaching this room</span>
    <div class="light-env-chip-row">${chips}</div>
    <span class="light-env-picker-help">Think about the hours you are usually here, not the best moment of the day.</span>
  </div>`;
}

function renderEveningPicker(r) {
  const active = activeEveningBucket(r);
  const chips = EVENING_BUCKETS.map(b => {
    const isActive = active === b.key;
    return `<button type="button" class="light-env-chip${isActive ? ' light-env-chip-active' : ''}" aria-pressed="${isActive ? 'true' : 'false'}" ${lightEnvActionAttrs('set-room-evening-bucket', { id: r.id, key: b.key })}>${escapeHTML(b.label)}</button>`;
  }).join('');
  return `<div class="light-env-picker">
    <span class="light-env-picker-label">Time here after sunset</span>
    <div class="light-env-chip-row">${chips}</div>
  </div>`;
}

// Environment-aware wrappers around the deterministic model. The model stays
// state-free; this module supplies today's skip toggles and room-linked screens.
export function computeRoomSeverity(room, measurements = [], options = {}) {
  return computeRoomSeverityForRoom(room, measurements, {
    screens: options.screens || (room?.id ? getScreensForRoom(room.id) : []),
    isActiveToday: options.isActiveToday || isActiveToday,
  });
}

export function computeDeficitAxes() {
  return computeDeficitAxesForEnvironment(getEnvironment(), {
    isActiveToday,
    getMeasurementsForRoom: getMeasurementsFor,
  });
}

export function computeIndoorBurden() {
  return computeIndoorBurdenForEnvironment(getEnvironment(), {
    isActiveToday,
    getMeasurementsForRoom: getMeasurementsFor,
  });
}

// ─── UI: Light Environment page (lives at /light-environment route) ───
//
// Layout: disclosure list (collapsed-by-default cards with severity
// dots; expanding reveals a Step 1/2/3 form). Mirrors the EMF
// Assessment + Light Audits pattern so the three sub-modules share one
// mental model. First render auto-expands a useful room, but explicit
// user collapse is preserved.

function getMeasurementsFor(roomId) {
  if (typeof lightEnvDeps.getMeasurementsForRoom !== 'function') return [];
  try {
    const measurements = lightEnvDeps.getMeasurementsForRoom(roomId);
    return Array.isArray(measurements) ? measurements : [];
  } catch (_) {
    return [];
  }
}

function fmtMeasureValue(m) {
  if (m.tool === 'lux') {
    const value = Math.round(m.value).toLocaleString();
    if (m.extra?.source === 'camera-estimate') return `~${value} lux (camera estimate)`;
    if (['AmbientLightSensor', 'manual-entry', 'meter-entry'].includes(m.extra?.source)) return `${value} lux`;
    return `${value} lux (method unknown)`;
  }
  if (m.tool === 'flicker') return ['no banding detected', 'some banding', 'clear banding', 'strong banding'][Math.min(m.value || 0, 3)];
  if (m.tool === 'cct') return `~${Math.round(m.value / 100) * 100} K (camera)`;
  if (m.tool === 'darkness') {
    if (m.extra?.method === 'camera-relative') return `${m.extra?.levelLabel || 'Qualitative'} camera check`;
    const value = m.value < 1 ? Number(m.value).toFixed(2) : Math.round(m.value);
    if (m.extra?.method === 'meter-entry' || m.extra?.source === 'meter-entry') return `${value} lux (meter)`;
    return `${value} legacy value (method unknown)`;
  }
  if (m.tool === 'brightness-proxy') return `${m.extra?.levelLabel || 'Relative brightness'} (camera comparison)`;
  if (m.tool === 'spectrum') return String(m.value);
  if (m.tool === 'glass-transmission') return `~${Math.round((m.value || 0) * 100)}% camera-visible comparison`;
  if (m.tool === 'audit') {
    const n = Number.isFinite(m.value) ? m.value : (m?.extra?.rooms?.length || 0);
    return `${n} room snapshot${n === 1 ? '' : 's'}`;
  }
  return String(m.value);
}

function fmtMeasureTime(ts) {
  const days = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const TOOL_ICONS = {
  lux: '📏', flicker: '⚡', cct: '🎨', darkness: '🌙', spectrum: '🔬', 'glass-transmission': '🪟',
  audit: '👁', 'brightness-proxy': '◐',
};

// Per-day use toggle; the stored date makes it reset at midnight.
function _renderTodayToggle(kind, id, activeToday, opts = {}) {
  const compact = opts.compact !== false;
  const cls = `light-env-today-toggle${activeToday ? ' light-env-today-on' : ' light-env-today-off'}${compact ? ' light-env-today-compact' : ''}`;
  const icon = activeToday ? '✓' : '⊘';
  const label = activeToday ? 'In use today' : 'Skipped today';
  const flipTo = activeToday ? 'false' : 'true';
  const tip = activeToday
    ? "Click to skip today — won't count toward today's exposure. Resets to 'in use' tomorrow."
    : "Click to use today — counts toward today's exposure.";
  const inner = compact ? `<span aria-hidden="true">${icon}</span><span class="visually-hidden">${escapeHTML(label)}</span>` : `${icon} ${escapeHTML(label)}`;
  return `<button type="button" class="${cls}" ${lightEnvActionAttrs('set-today-active', { kind, id, active: flipTo })} title="${escapeAttr(tip)}" aria-label="${escapeAttr(label)} — click to flip" aria-pressed="${activeToday}">${inner}</button>`;
}

// Screen disclosure card.
function renderLightEnvScreenCard(s, rooms) {
  return renderScreenCard(s, {
    expanded: isLightEnvScreenExpanded(s.id),
    renderTodayToggle: _renderTodayToggle,
    renderScreenAIBlock: lightEnvDeps.renderScreenAIBlock,
    rooms,
  });
}

// Quick-pick chip row for adding common rooms — eliminates the
// "Room 1" footgun and accelerates the common path. Hides chips for
// names already in use; "Other…" opens a prompt for custom names.
const ROOM_QUICK_PICKS = ['Bedroom', 'Living room', 'Kitchen', 'Office', 'Bathroom'];
const SCREEN_QUICK_PICK_LABELS = {
  phone: '📱 Phone',
  laptop: '💻 Laptop',
  monitor: '🖥 Monitor',
  tablet: '📲 Tablet',
  tv: '📺 TV',
};

function renderRoomQuickPicks(rooms) {
  const usedLC = new Set((rooms || []).map(r => (r.name || '').trim().toLowerCase()));
  const chips = ROOM_QUICK_PICKS
    .filter(name => !usedLC.has(name.toLowerCase()))
    .map(name => `<button class="light-env-quickpick" ${lightEnvActionAttrs('add-room-named', { name })}>${escapeHTML(name)}</button>`)
    .join('');
  return `<div class="light-env-quickpicks-row">
    <span class="light-env-quickpicks-label">${rooms.length === 0 ? 'Start with' : 'Add'}:</span>
    ${chips}
    <button class="light-env-quickpick light-env-quickpick-other" ${lightEnvActionAttrs('add-room-custom')}>Other…</button>
  </div>`;
}

function renderScreenQuickPicks(screens, roomId = null, preferred = ['phone', 'laptop', 'monitor', 'tablet', 'tv']) {
  const existing = new Set((screens || []).filter(s => (s.roomId || null) === (roomId || null)).map(s => s.device));
  const chips = preferred
    .filter(device => !existing.has(device))
    .map(device => `<button class="light-env-quickpick" ${lightEnvActionAttrs('add-screen-with-device', { roomId, device })}>${escapeHTML(SCREEN_QUICK_PICK_LABELS[device] || device)}</button>`)
    .join('');
  return `<div class="light-env-quickpicks-row light-env-screen-quickpicks">
    <span class="light-env-quickpicks-label">${existing.size === 0 ? 'Start with' : 'Add'}:</span>
    ${chips}
    <button class="light-env-quickpick light-env-quickpick-other" ${lightEnvActionAttrs('add-screen', { roomId })}>Other…</button>
  </div>`;
}

// Compact source label for the collapsed header — full PRIMARY_SOURCES
// labels are too verbose ("LED — cool/daylight (4000K+)"). Returns
// '' for unknown so the header doesn't show a dangling "I don't know".
const PRIMARY_SOURCE_SHORT = {
  'led-cool': 'Cool LED',
  'led-warm': 'Warm LED',
  'led-tunable': 'Tunable LED',
  'fluorescent': 'Fluorescent',
  'incandescent': 'Incandescent',
  'halogen': 'Halogen',
  'candle': 'Candle',
  'mixed': 'Mixed',
  'natural-only': 'Natural only',
};

function renderEnvironmentLoadSummary() {
  const burden = computeIndoorBurden();
  const interpHTML = (typeof lightEnvDeps.renderBurdenInterp === 'function')
    ? lightEnvDeps.renderBurdenInterp(burden)
    : `<p class="light-env-summary-interp">${escapeHTML(burden.interp)}</p>`;
  // Keep the deterministic screening header tied to the current inputs.
  // Cached AI copy may be stale between an edit and the next analysis; it
  // must not recolor the live assessment during that period.
  const bannerColor = burden.color;
  const bannerLabel = burden.label;
  return `<div class="light-env-summary light-env-summary-top light-env-summary-${bannerColor}">
    <div class="light-env-summary-kicker">Indoor light picture</div>
    <div class="light-env-summary-head">
      <span class="light-env-summary-tier">${escapeHTML(bannerLabel)}</span>
      ${burden.parts.length ? `<span class="light-env-summary-parts">${escapeHTML(burden.parts.join(' · '))}</span>` : ''}
    </div>
    ${interpHTML}
  </div>`;
}

function formatLatestLightAudit(audits) {
  if (!audits.length) return 'No saved snapshots';
  const latest = audits
    .slice()
    .sort((a, b) => (b.createdAt || Date.parse(b.date || '') || 0) - (a.createdAt || Date.parse(a.date || '') || 0))[0];
  const label = latest?.label ? ` · ${latest.label}` : '';
  const date = latest?.date ? fmtMeasureTime(new Date(latest.date + 'T00:00:00').getTime()) : 'latest';
  return `${audits.length} audit${audits.length === 1 ? '' : 's'} · ${date}${label}`;
}

export function renderEnvironmentAssessmentSummary() {
  const env = getEnvironment();
  const rooms = env?.rooms || [];
  const screens = env?.screens || [];
  const audits = getLightAudits();
  const measurements = state.importedData?.lightMeasurements || [];
  const roomIds = new Set(rooms.map(r => r.id).filter(Boolean));
  const mappedMeasurements = measurements.filter(m => m?.roomId && roomIds.has(m.roomId));
  const burden = computeIndoorBurden();
  const activeRooms = rooms.filter(isActiveToday).length;
  const activeScreens = screens.filter(isActiveToday).length;
  const measuredRooms = new Set(mappedMeasurements.map(m => m.roomId)).size;
  const hasMapped = rooms.length > 0 || screens.length > 0;
  const hasRooms = rooms.length > 0;
  const actionLabel = hasMapped ? 'Open assessment' : 'Start assessment';
  const lead = hasMapped
    ? burden.interp
    : 'Map your bedroom, work areas, and screens once; update the assessment when bulbs, monitors, or evening routines change.';
  const metrics = [
    {
      label: 'Rooms',
      value: String(rooms.length),
      sub: rooms.length ? `${activeRooms} active today` : 'Start with bedroom',
    },
    {
      label: 'Screens',
      value: String(screens.length),
      sub: screens.length ? `${activeScreens} active today` : 'Portable or room-bound',
    },
  ];
  if (hasRooms) {
    metrics.push({
      label: 'Readings',
      value: String(mappedMeasurements.length),
      sub: measuredRooms ? `${measuredRooms} room${measuredRooms === 1 ? '' : 's'} checked` : 'Run brightness or banding',
    }, {
      label: 'Audits',
      value: String(audits.length),
      sub: formatLatestLightAudit(audits),
    });
  }
  return `<div class="light-env-assessment-summary light-env-assessment-summary-${escapeAttr(burden.color)}">
    <div class="light-env-assessment-status">
      <span class="light-env-summary-kicker">Indoor light picture</span>
      <span class="light-env-assessment-tier">${escapeHTML(burden.label)}</span>
      ${burden.parts.length ? `<span class="light-env-assessment-parts">${escapeHTML(burden.parts.join(' · '))}</span>` : ''}
    </div>
    <p class="light-env-assessment-lead">${escapeHTML(lead)}</p>
    <div class="light-env-assessment-metrics">
      ${metrics.map(m => `<div class="light-env-assessment-metric">
        <span class="light-env-assessment-metric-label">${escapeHTML(m.label)}</span>
        <strong>${escapeHTML(m.value)}</strong>
        <span>${escapeHTML(m.sub)}</span>
      </div>`).join('')}
    </div>
    <div class="light-env-assessment-actions">
      <button class="dashboard-action-btn dashboard-action-btn-primary" ${lightEnvActionAttrs('open-assessment')}>${escapeHTML(actionLabel)}</button>
      ${rooms.length ? `<button class="dashboard-action-btn" ${lightEnvActionAttrs('open-assessment-save-audit')}>Save audit</button>` : ''}
    </div>
  </div>`;
}

const LIGHT_ENV_ASSESSMENT_OVERLAY_ID = 'light-env-assessment-overlay';

function getLightEnvironmentAssessmentOverlay() {
  return document.getElementById(LIGHT_ENV_ASSESSMENT_OVERLAY_ID);
}

function isLightEnvironmentAssessmentOpen() {
  return !!getLightEnvironmentAssessmentOverlay();
}

function renderLightEnvironmentAssessmentModal() {
  let overlay = getLightEnvironmentAssessmentOverlay();
  const wasOpen = overlay?.classList?.contains('show') === true;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = LIGHT_ENV_ASSESSMENT_OVERLAY_ID;
    overlay.className = 'modal-overlay light-env-assessment-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeLightEnvironmentAssessment();
    });
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="modal light-env-assessment-modal" role="dialog" aria-modal="true" aria-labelledby="light-env-assessment-title">
    <button class="modal-close" ${lightEnvActionAttrs('close-assessment')} aria-label="Close">×</button>
    <div class="modal-header">
      <h3 id="light-env-assessment-title">Indoor Light Assessment</h3>
    </div>
    <p class="light-env-assessment-modal-copy">Map daylight, artificial light, screens, and optional room checks. This is a practical screening picture—not a measured biological dose. Save snapshots before and after changes to compare what moved.</p>
    ${renderEnvironmentSection({ embedded: true })}
  </div>`;
  openModalOverlay(overlay, wasOpen ? {} : { initialFocus: '.modal-close', focusDelay: 50 });
}

export function openLightEnvironmentAssessment() {
  renderLightEnvironmentAssessmentModal();
}

export function closeLightEnvironmentAssessment() {
  const overlay = getLightEnvironmentAssessmentOverlay();
  if (!overlay) return;
  closeModalOverlay(overlay);
  overlay.remove();
}

export function refreshLightEnvironmentAssessment() {
  if (isLightEnvironmentAssessmentOpen()) renderLightEnvironmentAssessmentModal();
}

function refreshOpenLightEnvironmentAssessmentOnSync() {
  renderLightEnvironmentAssessmentModal();
}

function setLightEnvironmentAssessmentScrollTop(scrollTop) {
  const modal = getLightEnvironmentAssessmentOverlay()?.querySelector('.light-env-assessment-modal');
  if (!modal) return;
  const apply = () => { modal.scrollTop = Math.max(0, scrollTop || 0); };
  apply();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(apply);
}

function scrollLightEnvironmentAssessmentTo(selector, fallbackSelector = '') {
  const overlay = getLightEnvironmentAssessmentOverlay();
  const modal = overlay?.querySelector('.light-env-assessment-modal');
  const target = selector ? modal?.querySelector(selector) : null;
  const fallback = fallbackSelector ? modal?.querySelector(fallbackSelector) : null;
  const anchor = target || fallback;
  if (!modal || !anchor) return;
  const apply = () => {
    const modalRect = modal.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    modal.scrollTop = Math.max(0, modal.scrollTop + anchorRect.top - modalRect.top - 8);
  };
  apply();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(apply);
  setTimeout(apply, 0);
  setTimeout(apply, 60);
}

function refreshLightEnvironmentUI(options = {}) {
  const modal = getLightEnvironmentAssessmentOverlay()?.querySelector('.light-env-assessment-modal');
  const priorScrollTop = modal?.scrollTop || 0;
  refreshLightEnvironmentAssessment();
  if (options.scrollAnchor) scrollLightEnvironmentAssessmentTo(options.scrollAnchor, options.fallbackScrollAnchor);
  else if (priorScrollTop) setLightEnvironmentAssessmentScrollTop(priorScrollTop);
  const navigate = lightEnvDeps.navigate;
  if (navigate && state.currentView === 'light') {
    navigate('light', options.scrollAnchor ? { scrollAnchor: options.scrollAnchor } : undefined);
  }
}

// Disclosure-pattern room card. Header shows: name · severity dot ·
// hours · source · today-toggle · expand affordance. Click anywhere on
// the header (except interactive children) to toggle expand. Expanded
// state reveals the Step 1/2/3 body.
function renderRoomDisclosure(r, expanded) {
  const measurements = getMeasurementsFor(r.id).sort((a, b) => b.capturedAt - a.capturedAt);
  const sev = computeRoomSeverity(r, measurements);
  const activeToday = isActiveToday(r);
  const sourceShort = PRIMARY_SOURCE_SHORT[r.primarySource] || '';
  const hours = r.hoursOccupiedPerDay;
  const hoursLabel = hours ? `${hours} hr/day` : '';

  const eveningOn = roomUsesEveningAfterSunset(r);
  const roomAriaLabel = `${r.name || 'Room'} — ${sev.label}${hoursLabel ? ', ' + hoursLabel : ''}${sourceShort ? ', ' + sourceShort : ''}${expanded ? ', expanded' : ', collapsed'}`;
  let html = `<div class="light-env-room-disclosure light-env-card-sev-${sev.color}${activeToday ? '' : ' light-env-card-skipped'}${expanded ? ' expanded' : ''}" data-id="${escapeAttr(r.id)}">
    <div class="light-env-room-disclosure-head" role="button" tabindex="0" aria-expanded="${expanded ? 'true' : 'false'}" aria-label="${escapeAttr(roomAriaLabel)}" ${lightEnvActionAttrs('toggle-room-expanded', { id: r.id })}>
      <span class="light-env-sev-dot light-env-sev-${sev.color}" title="${escapeAttr(sev.label + ' — ' + sev.reason)}"><span class="sr-only">${escapeHTML(sev.label)}</span></span>
      <span class="light-env-room-disclosure-name">${escapeHTML(r.name || 'Room')}</span>
      ${expanded ? '' : `<span class="light-env-room-disclosure-signals">
        ${hoursLabel ? `<span class="light-env-room-signal">${escapeHTML(hoursLabel)}</span>` : ''}
        ${sourceShort ? `<span class="light-env-room-signal">${escapeHTML(sourceShort)}</span>` : ''}
        ${eveningOn ? `<span class="light-env-room-signal">evening</span>` : ''}
      </span>`}
      <span class="light-env-room-disclosure-spacer"></span>
      ${expanded ? '' : _renderTodayToggle('room', r.id, activeToday)}
      ${expanded ? `<button class="light-env-overflow" ${lightEnvActionAttrs('delete-room-confirm', { id: r.id })} title="Delete room" aria-label="Delete room">⋯</button>` : ''}
      <span class="light-env-room-disclosure-chevron" aria-hidden="true">${expanded ? '▾' : '▸'}</span>
    </div>`;

  if (expanded) html += renderRoomExpandedBody(r, measurements, sev);
  html += `</div>`;
  return html;
}

// The expanded body — three numbered steps so the linear flow is
// obvious (versus the old layout where 5 concerns competed for
// attention all at once).
function renderRoomExpandedBody(r, measurements, sev) {
  const latestByTool = new Map();
  for (const m of measurements) {
    if (!latestByTool.has(m.tool)) latestByTool.set(m.tool, m);
  }

  // activeToday is recomputed here so the in-body toggle reflects the
  // same per-day flag the collapsed-row toggle would use.
  const _activeToday = isActiveToday(r);
  let html = `<div class="light-env-room-disclosure-body">

    <div class="light-env-room-step light-env-room-step-about">
      <div class="light-env-room-step-head">
        <span>Room setup</span>
        <span class="light-env-room-status-pill light-env-room-status-${escapeAttr(sev.color)}">${escapeHTML(sev.label)}</span>
      </div>
      <div class="light-env-room-step-body light-env-room-setup-body">
        <label class="ctx-label light-env-room-name-field">Room name
          <input type="text" class="ctx-input light-env-room-name-input" value="${escapeAttr(r.name)}" ${lightEnvActionAttrs('update-room-name', { id: r.id })} aria-label="Room name" />
        </label>
        <div class="light-env-room-today-row">
          <span class="light-env-room-today-copy">Use today
            <span>Skip only for travel, sick days, or rooms you did not use.</span>
          </span>
          ${_renderTodayToggle('room', r.id, _activeToday)}
        </div>
        ${renderSourcePicker(r)}
        ${renderDaylightPicker(r)}
        ${renderHoursPicker(r)}
        ${renderEveningPicker(r)}
      </div>
    </div>

    <div class="light-env-room-step light-env-room-step-measure">
      <div class="light-env-room-step-head">
        <span>Measure this room</span>
        <span class="light-env-room-step-tag">Optional</span>
      </div>
      <div class="light-env-room-step-body">
        <div class="light-env-room-tools light-env-measure-toolbar" aria-label="Room measurement tools">
          <button class="light-env-tool-pill light-env-tool-pill-primary" ${lightEnvActionAttrs('open-tool', { id: r.id, tool: 'lux' })} title="Eye-level photopic lux from a sensor, meter entry, or calibrated camera">📏 Brightness</button>
          <button class="light-env-tool-pill" ${lightEnvActionAttrs('open-tool', { id: r.id, tool: 'flicker' })} title="Screen for camera-visible rolling-shutter banding">⚡ Banding</button>
          <button class="light-env-tool-pill" ${lightEnvActionAttrs('open-tool', { id: r.id, tool: 'spectrum' })} title="Qualitative warm, cool, and mixed camera pattern">🔬 Light type</button>
          <button class="light-env-tool-pill" ${lightEnvActionAttrs('open-tool', { id: r.id, tool: 'cct' })} title="Approximate warm/cool camera estimate—not a spectrometer">🎨 Warm / cool</button>
          ${/bedroom|sleep/i.test(r.name || '') ? `<button class="light-env-tool-pill" ${lightEnvActionAttrs('open-tool', { id: r.id, tool: 'darkness' })} title="Qualitative camera darkness check or enter a meter reading">🌙 Sleep light</button>` : ''}
        </div>`;

  if (latestByTool.size === 0) {
    html += `<p class="light-env-room-empty">No measurements yet. Run any tool above and the result lives here.</p>`;
  } else {
    html += `<div class="light-env-room-readings">`;
    for (const [tool, m] of latestByTool) {
      const icon = TOOL_ICONS[tool] || '·';
      html += `<div class="light-env-reading">
        <span class="light-env-reading-icon">${icon}</span>
        <span class="light-env-reading-value">${escapeHTML(fmtMeasureValue(m))}</span>
        <span class="light-env-reading-time">${escapeHTML(fmtMeasureTime(m.capturedAt))}</span>
      </div>${typeof lightEnvDeps.renderMeasurementAIInline === 'function' ? lightEnvDeps.renderMeasurementAIInline(m) : ''}`;
    }
    html += `</div>`;
  }
  html += `</div></div>`;

  // AI verdict block (between Measure and Screens) — synthesizes the room
  // signals into a single circadian-friendliness verdict.
  if (typeof lightEnvDeps.renderRoomAIBlock === 'function') {
    html += lightEnvDeps.renderRoomAIBlock(r);
  }

  // Step 3: screens used here. Step head + empty-state copy customize
  // per room because the dominant device differs sharply (bedroom →
  // phone, office → laptop / monitor, living room → TV). The phone-in-
  // bed signal in particular is high-leverage: junk-light memory note
  // says it's the dominant vector for most users, so the copy nudges
  // toward it for bedroom rooms.
  const screensHere = getScreensForRoom(r.id);
  const roomName = (r.name || '').toLowerCase();
  let stepHead, emptyCopy, quickPicks;
  if (/bedroom|sleep/.test(roomName)) {
    stepHead = 'Screens used in bed';
    emptyCopy = 'If a phone or tablet is used near bedtime, add it here. Timing is useful context; brightness and viewing distance are not measured.';
    quickPicks = ['phone', 'tablet', 'tv'];
  } else if (/office|study|desk|work/.test(roomName)) {
    stepHead = 'Screens at this desk';
    emptyCopy = 'Long stretches in front of a laptop or monitor add up. Map them here so daytime exposure isn\'t overweighted vs evening.';
    quickPicks = ['laptop', 'monitor', 'phone'];
  } else if (/living|family|den|lounge/.test(roomName)) {
    stepHead = 'Screens in this room';
    emptyCopy = 'Add a TV or other screen used after sunset so the assessment can include its timing.';
    quickPicks = ['tv', 'phone', 'tablet'];
  } else {
    stepHead = 'Screens used here';
    emptyCopy = 'Map any phone, tablet, laptop, monitor, or TV used in this room.';
    quickPicks = ['phone', 'laptop', 'tv'];
  }

  html += `<div class="light-env-room-step">
    <div class="light-env-room-step-head">${escapeHTML(stepHead)}</div>
    <div class="light-env-room-step-body">`;
  if (screensHere.length === 0) {
    html += `<p class="light-env-room-empty">${escapeHTML(emptyCopy)}</p>`;
  } else {
    html += `<div class="light-env-room-screens-list">`;
    const rooms = getEnvironment()?.rooms || [];
    for (const s of screensHere) html += renderLightEnvScreenCard(s, rooms);
    html += `</div>`;
  }
  // Quick-pick chip row — one-click adds a screen with the right device
  // type. "Other…" falls back to the original generic "+ Add screen"
  // path which infers device by room name.
  html += renderScreenQuickPicks(screensHere, r.id, quickPicks);
  html += `    </div>
  </div>`;

  // Delete moved to the header overflow (⋯) — keeps destructive actions
  // out of the primary scan path inside the body.
  html += `</div>`;
  return html;
}

export function renderEnvironmentSection(options = {}) {
  const env = getEnvironment();
  const rooms = env?.rooms || [];
  const screens = env?.screens || [];
  const embedded = !!options.embedded;

  let html = `<div class="light-env-section${embedded ? ' light-env-section-embedded' : ''}">`;
  if (!embedded) {
    html += `<div class="light-env-head">
      <h3 class="light-section-title">Light environment</h3>
      <p class="light-section-hint">Map the light that reaches you indoors: daylight access, evening sources, screens, and optional room checks. The rest of Light uses this as context, not as a measured dose.</p>
    </div>`;
  }
  html += renderEnvironmentLoadSummary();

  // Rooms — disclosure list (mirrors EMF Assessment + Light Audits).
  // Each row is collapsed-by-default with name + severity + key
  // signals; clicking expands a Step 1/2/3 form. Auto-expands the
  // only room on first render (no click needed for the common starter
  // case), but respects explicit collapse stored in localStorage.
  html += `<div class="light-env-block">
    <div class="light-env-block-head">
      <strong>Rooms you spend time in</strong>
      <button class="import-btn import-btn-secondary" ${lightEnvActionAttrs('add-room')}>+ Room</button>
    </div>`;
  if (rooms.length === 0) {
    html += `<div class="light-env-empty light-env-empty-cta">
      <p><strong>Map your bedroom first.</strong> Record the light used after sunset, screens near bed, and any visible light during sleep. Ordinary lux and phone-camera readings are kept separate from melanopic EDI, so the assessment can guide a better setup without pretending to measure a biological dose.</p>
      ${renderRoomQuickPicks(rooms)}
    </div>`;
  } else {
    const activeId = resolveActiveRoomId(rooms);
    html += `<div class="light-env-room-list">`;
    for (const r of rooms) {
      html += renderRoomDisclosure(r, r.id === activeId);
    }
    html += `</div>`;
    html += `<div class="light-env-room-quickpicks">${renderRoomQuickPicks(rooms)}</div>`;
  }
  html += `</div>`;

  // Top-level screens block — now ONLY portable devices (no roomId).
  // Screens that live in a specific room render INSIDE that room's
  // card so the user has one place to look for their Office, Bedroom,
  // etc. Phone-style devices that move around stay here.
  const portableScreens = screens.filter(s => !s.roomId);
  html += `<div class="light-env-block">
    <div class="light-env-block-head">
      <strong>Portable screens</strong>
      <button class="import-btn import-btn-secondary" ${lightEnvActionAttrs('add-screen')}>+ Screen</button>
    </div>`;
  if (portableScreens.length === 0 && screens.length === 0 && rooms.length === 0) {
    // First-time: show the value-prop CTA only when the whole section is empty
    html += `<div class="light-env-empty light-env-empty-cta">
      <p><strong>Track your phone, TV, or any screen that moves between rooms.</strong> Screens you use in a specific room (laptop in the Office, TV in the Living Room) live inside that room's card — add them from there.</p>
      ${renderScreenQuickPicks(portableScreens)}
    </div>`;
  } else if (portableScreens.length === 0) {
    html += `<div class="light-env-empty light-env-empty-cta">
      <p>No portable screens yet. Devices that stay in one place are listed inside their room card above.</p>
      ${renderScreenQuickPicks(portableScreens)}
    </div>`;
  } else {
    html += `<div class="light-env-screen-cards">`;
    for (const s of portableScreens) html += renderLightEnvScreenCard(s, rooms);
    html += `</div>`;
  }
  html += `</div>`;

  // Light Audits — frozen snapshots of rooms + screens + measurements.
  // Hidden until the user has at least one room mapped.
  if ((env?.rooms || []).length > 0) {
    html += renderLightAuditsBlock();
  }

  html += `</div>`;
  return html;
}

export function getRooms() {
  return (getEnvironment()?.rooms) || [];
}

function openLightEnvTool(tool, roomId) {
  const opts = roomId ? { roomId } : undefined;
  const openers = {
    spectrum: lightEnvDeps.openSpectrumClassifier,
    lux: lightEnvDeps.openLuxMeter,
    flicker: lightEnvDeps.openFlickerDetector,
    cct: lightEnvDeps.openCCTMeter,
    darkness: lightEnvDeps.openDarknessMeter,
  };
  const opener = openers[tool];
  if (typeof opener === 'function') opener(opts);
}

export const lightEnvActionHandlers = Object.freeze({
  ...lightEnvEditorActionHandlers,
  openLightEnvironmentAssessment,
  closeLightEnvironmentAssessment,
  openLightEnvTool,
});

configureLightEnvEditor({
  refreshUI: refreshLightEnvironmentUI,
});
configureLightEnvAudits({
  getEnvironment,
  computeRoomSeverity,
  refreshLightEnvironmentUI,
});

if (typeof document !== 'undefined') {
  installLightEnvActionDelegates({
    ...lightEnvActionHandlers,
    ...lightEnvAuditActionHandlers,
  });
}

if (typeof window !== 'undefined') {
  bindModalSyncRefresh({
    overlayId: LIGHT_ENV_ASSESSMENT_OVERLAY_ID,
    modalSelector: '.light-env-assessment-modal',
    refresh: refreshOpenLightEnvironmentAssessmentOnSync,
  });
}
