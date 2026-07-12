// @ts-check
// light-device-view-utils.js — shared device-session time labels.

export function formatDeviceElapsedMs(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
export function relativeDeviceTimeShort(ts) {
  if (!ts) return 'never';
  const days = Math.floor((Date.now() - ts) / (24 * 3600 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `${w} week${w !== 1 ? 's' : ''} ago`;
  }
  if (days < 365) {
    const m = Math.floor(days / 30);
    return `${m} month${m !== 1 ? 's' : ''} ago`;
  }
  const y = Math.floor(days / 365);
  return `${y} year${y !== 1 ? 's' : ''} ago`;
}
