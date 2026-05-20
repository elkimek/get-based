// commit-hash.js - Footer app version and commit hash hydration

import { escapeHTML } from './utils.js';

let _cachedCommitHash = null;

function renderCommitHash(el, sha) {
  const full = String(sha || '').trim();
  if (!full) return;
  const short = full.slice(0, 7);
  el.innerHTML = `<a href="https://github.com/elkimek/get-based/commit/${escapeHTML(full)}" target="_blank" rel="noopener">${escapeHTML(short)}</a>`;
}

function cacheAndRenderCommitHash(el, sha) {
  _cachedCommitHash = String(sha || '').trim();
  renderCommitHash(el, _cachedCommitHash);
}

export function loadCommitHash() {
  const vEl = document.getElementById('app-version-text');
  if (vEl && !vEl.textContent) vEl.textContent = window.APP_VERSION || '';
  const el = document.getElementById('app-commit-hash');
  if (!el) return;
  if (_cachedCommitHash) {
    renderCommitHash(el, _cachedCommitHash);
    return;
  }
  fetch('/api/commit')
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(({ sha }) => {
      const e = document.getElementById('app-commit-hash');
      if (e) cacheAndRenderCommitHash(e, sha);
    })
    .catch(() => fetch('https://api.github.com/repos/elkimek/get-based/commits/main', { headers: { Accept: 'application/vnd.github.sha' } })
      .then(r => r.ok ? r.text() : Promise.reject())
      .then(sha => {
        const e = document.getElementById('app-commit-hash');
        if (e) cacheAndRenderCommitHash(e, sha);
      })
      .catch(() => {}));
}
