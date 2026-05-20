// commit-hash.js - Footer app version and commit hash hydration

import { escapeHTML } from './utils.js';

let _cachedCommitHash = null;

export function loadCommitHash() {
  const vEl = document.getElementById('app-version-text');
  if (vEl && !vEl.textContent) vEl.textContent = window.APP_VERSION || '';
  const el = document.getElementById('app-commit-hash');
  if (!el) return;
  if (_cachedCommitHash) {
    el.innerHTML = `<a href="https://github.com/elkimek/get-based/commit/${escapeHTML(_cachedCommitHash)}" target="_blank" rel="noopener">${escapeHTML(_cachedCommitHash)}</a>`;
    return;
  }
  fetch('https://api.github.com/repos/elkimek/get-based/commits/main', { headers: { Accept: 'application/vnd.github.sha' } })
    .then(r => r.ok ? r.text() : Promise.reject())
    .then(sha => {
      _cachedCommitHash = sha.trim().slice(0, 7);
      const e = document.getElementById('app-commit-hash');
      if (e) e.innerHTML = `<a href="https://github.com/elkimek/get-based/commit/${escapeHTML(_cachedCommitHash)}" target="_blank" rel="noopener">${escapeHTML(_cachedCommitHash)}</a>`;
    })
    .catch(() => {});
}
