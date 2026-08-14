// @ts-check
// light-env-screen-ui.js — screen-card rendering helpers for Light Environment.

import { escapeHTML, escapeAttr } from './utils.js';
import { lightEnvActionAttrs } from './light-env-actions.js';
import { SCREEN_DEVICES, computeScreenStatus } from './light-env-model.js';
import { isActiveToday } from './light-env-store.js';

const SCREEN_DEVICE_ICONS = {
  phone: '📱', laptop: '💻', monitor: '🖥', tablet: '📲', tv: '📺',
};

function screenSummary(s) {
  const parts = [];
  const hours = s.hoursPerDay;
  if (hours != null && hours > 0) parts.push(`${hours} hr/day`);
  const eve = s.eveningUseAfterSunset;
  if (eve != null && eve > 0) parts.push(`${eve} hr evening`);
  else if (hours > 0) parts.push('daytime only');
  if (s.blueBlockerEnabled) parts.push('blue reduced');
  return parts.join(' · ');
}

// Hours-per-day chip buckets — separate set from room HOURS_BUCKETS
// because screen total-day usage often skews lower (a phone is 3 hr,
// not 8). Stored as numeric midpoint, same as rooms.
export const SCREEN_HOURS_BUCKETS = [
  { key: 'short',  label: '< 1 hr',  midpoint: 0.5, min: 0, max: 1 },
  { key: 'some',   label: '1–3 hr',  midpoint: 2,   min: 1, max: 3 },
  { key: 'lots',   label: '3–6 hr',  midpoint: 4.5, min: 3, max: 6 },
  { key: 'most',   label: '6+ hr',   midpoint: 8,   min: 6, max: 24 },
];

export function activeScreenHoursBucket(hours) {
  if (hours == null || isNaN(+hours)) return null;
  const h = +hours;
  for (const b of SCREEN_HOURS_BUCKETS) if (h >= b.min && h < b.max) return b.key;
  return 'most';
}

export function activeScreenEveningBucket(eve) {
  if (eve == null) return null;
  const h = +eve;
  if (h <= 0) return 'none';
  if (h < 1) return 'lt1';
  if (h < 3) return 'mid';
  return 'gt3';
}

// Single screen card markup — used both at top level (portable) and
// nested inside a room card (compact mode). Expansion state stays in
// light-env.js; this module renders from the supplied context.
export function renderScreenCard(s, opts = {}) {
  const status = computeScreenStatus(s);
  const activeToday = isActiveToday(s);
  const expanded = !!opts.expanded;
  const rooms = Array.isArray(opts.rooms) ? opts.rooms : [];
  const renderTodayToggle = opts.renderTodayToggle;
  const deviceIcon = SCREEN_DEVICE_ICONS[s.device] || '📱';
  const deviceLabel = (SCREEN_DEVICES.find(d => d.key === s.device)?.label) || 'Device';
  const summary = screenSummary(s);

  let html = `<div class="light-env-screen-card light-env-card-sev-${status.color}${activeToday ? '' : ' light-env-card-skipped'}${expanded ? ' expanded' : ''}" data-id="${escapeAttr(s.id)}">
    <div class="light-env-screen-card-head" role="button" tabindex="0" aria-expanded="${expanded ? 'true' : 'false'}" aria-label="${escapeAttr(deviceLabel + ' — ' + status.label + (summary ? ', ' + summary : '') + (expanded ? ', expanded' : ', collapsed'))}" ${lightEnvActionAttrs('toggle-screen-expanded', { id: s.id })}>
      <span class="light-env-sev-dot light-env-sev-${status.color}" title="${escapeAttr(status.label + ' — ' + status.reason)}"><span class="sr-only">${escapeHTML(status.label)}</span></span>
      <span class="light-env-screen-card-icon" aria-hidden="true">${deviceIcon}</span>
      <span class="light-env-screen-card-name">${escapeHTML(deviceLabel)}</span>
      ${expanded ? '' : `<span class="light-env-screen-card-summary">${escapeHTML(summary || 'Tap to set up')}</span>`}
      <span class="light-env-room-disclosure-spacer"></span>
      ${typeof renderTodayToggle === 'function' ? renderTodayToggle('screen', s.id, activeToday) : ''}
      ${expanded ? `<button class="light-env-overflow" ${lightEnvActionAttrs('delete-screen-confirm', { id: s.id })} title="Delete screen" aria-label="Delete screen">⋯</button>` : ''}
      <span class="light-env-room-disclosure-chevron" aria-hidden="true">${expanded ? '▾' : '▸'}</span>
    </div>`;

  if (expanded) html += renderScreenExpandedBody(s, rooms, opts);
  html += `</div>`;
  return html;
}

function renderScreenExpandedBody(s, rooms, opts = {}) {
  const hoursActive = activeScreenHoursBucket(s.hoursPerDay);
  const eveActive = activeScreenEveningBucket(s.eveningUseAfterSunset);
  const renderScreenAIBlock = opts.renderScreenAIBlock;

  const hoursChips = SCREEN_HOURS_BUCKETS.map(b =>
    `<button type="button" class="light-env-chip${hoursActive === b.key ? ' light-env-chip-active' : ''}" aria-pressed="${hoursActive === b.key ? 'true' : 'false'}" ${lightEnvActionAttrs('set-screen-hours-bucket', { id: s.id, key: b.key })}>${escapeHTML(b.label)}</button>`
  ).join('');

  const eveBuckets = [
    { key: 'none', label: 'None',     midpoint: 0 },
    { key: 'lt1',  label: '< 1 hr',   midpoint: 0.5 },
    { key: 'mid',  label: '1–3 hr',   midpoint: 2 },
    { key: 'gt3',  label: '3+ hr',    midpoint: 4 },
  ];
  const eveChips = eveBuckets.map(b =>
    `<button type="button" class="light-env-chip${eveActive === b.key ? ' light-env-chip-active' : ''}" aria-pressed="${eveActive === b.key ? 'true' : 'false'}" ${lightEnvActionAttrs('set-screen-evening-bucket', { id: s.id, key: b.key })}>${escapeHTML(b.label)}</button>`
  ).join('');

  const roomOptions = rooms.length > 0
    ? `<select class="ctx-select light-env-screen-room" ${lightEnvActionAttrs('update-screen-room', { id: s.id })} aria-label="Used in room">
        <option value=""${!s.roomId ? ' selected' : ''}>Portable / multiple rooms</option>
        ${rooms.map(r => `<option value="${escapeAttr(r.id)}"${s.roomId === r.id ? ' selected' : ''}>${escapeHTML(r.name || 'Room')}</option>`).join('')}
      </select>`
    : '';

  return `<div class="light-env-screen-card-body">
    <div class="light-env-screen-meta-row">
      <label class="ctx-label">Device
        <select class="ctx-select" ${lightEnvActionAttrs('update-screen-device', { id: s.id })} aria-label="Device type">
          ${SCREEN_DEVICES.map(d => `<option value="${escapeAttr(d.key)}"${s.device === d.key ? ' selected' : ''}>${escapeHTML(d.label)}</option>`).join('')}
        </select>
      </label>
      ${roomOptions ? `<label class="ctx-label">Used in
        ${roomOptions}
      </label>` : ''}
    </div>
    <div class="light-env-picker">
      <span class="light-env-picker-label">Hours per day</span>
      <div class="light-env-chip-row">${hoursChips}</div>
    </div>
    <div class="light-env-picker">
      <span class="light-env-picker-label">Time after sunset</span>
      <div class="light-env-chip-row">${eveChips}</div>
    </div>
    <div class="light-env-screen-blocker" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px">
      <span style="flex:1;min-width:0;font-size:13px;color:var(--text-secondary)">Blue reduction active
        <span style="display:block;font-size:11px;color:var(--text-muted);margin-top:2px">Night Shift, f.lux, amber tint, or glasses may reduce short-wavelength light. Brightness, distance, and duration still matter.</span>
      </span>
      <label class="toggle-switch">
        <input type="checkbox"${s.blueBlockerEnabled ? ' checked' : ''} ${lightEnvActionAttrs('update-screen-blue-blocker', { id: s.id })} />
        <span class="toggle-slider"></span>
      </label>
    </div>
    ${typeof renderScreenAIBlock === 'function' ? renderScreenAIBlock(s) : ''}
  </div>`;
}
