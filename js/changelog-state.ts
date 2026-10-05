import { getAppVersionRuntime } from './utils-runtime.js';

export function getMajorMinor(ver: unknown) {
  const parts = String(ver).split('.');
  return parts.slice(0, 2).join('.');
}

export function getSeenVersion() {
  return localStorage.getItem('labcharts-changelog-seen') || '';
}

export function markChangelogSeen() {
  localStorage.setItem('labcharts-changelog-seen', getAppVersionRuntime());
}

export function _semverGt(a: unknown, b: unknown) {
  const pa = String(a || '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const ai = pa[i] || 0, bi = pb[i] || 0;
    if (ai > bi) return true;
    if (ai < bi) return false;
  }
  return false;
}
