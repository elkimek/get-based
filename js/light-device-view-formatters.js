// @ts-check

import { escapeAttr, escapeHTML, formatDate } from './utils.js';

export function localDeviceSessionStamp(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return { date: 'Date unavailable', time: '' };
  const localKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { date: formatDate(localKey), time: date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) };
}

export function deviceBasisLabel(basis) {
  const labels = {
    'measured-spectrometer': 'spectrometer measurement',
    'measured-total-spectrometer': 'total spectrometer measurement',
    'measured-radiometer': 'radiometer measurement',
    'vendor-claim': 'vendor-stated value',
    'user-entered': 'user-entered value',
    'curated-estimate': 'curated estimate',
    unknown: 'source not recorded',
  };
  return labels[basis] || String(basis || 'source not recorded').replaceAll('-', ' ');
}

export function safeHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch (_) {
    return null;
  }
}

export function formatWavelengthSummary(peaks) {
  if (!Array.isArray(peaks) || peaks.length === 0) return '';
  const sorted = peaks.slice().sort((a, b) => a - b);
  if (sorted.length <= 3) return sorted.join(' / ') + ' nm';
  return `${sorted[0]}–${sorted[sorted.length - 1]} nm (${sorted.length} bands)`;
}

export function renderDeviceChannelChips(channelKeys, channelDisplay) {
  if (!Array.isArray(channelKeys) || channelKeys.length === 0) return '';
  const order = ['vitamin_d', 'pomc', 'no_cv', 'violet_eye', 'circadian', 'nir_solar', 'pbm_red', 'pbm_nir'];
  const present = new Set(channelKeys);
  return order.filter(key => present.has(key)).map(key => {
    const meta = channelDisplay[key] || {};
    return `<span class="light-device-feed-chip" title="${escapeAttr((meta.label || key) + ' — ' + (meta.what || ''))}">
      <span class="light-device-feed-icon" aria-hidden="true">${meta.icon || '·'}</span>
      <span class="light-device-feed-label">${escapeHTML(meta.label || key)}</span>
    </span>`;
  }).join('');
}

export function relativeTimeShort(timestamp) {
  if (!timestamp) return 'never';
  const days = Math.floor((Date.now() - timestamp) / (24 * 3600 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} month${months !== 1 ? 's' : ''} ago`;
  }
  const years = Math.floor(days / 365);
  return `${years} year${years !== 1 ? 's' : ''} ago`;
}
