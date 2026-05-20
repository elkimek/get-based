// commit-hash.js - Footer app version and commit hash hydration

import { escapeHTML } from './utils.js';

let _cachedCommitHash = null;
let _cachedCommitRef = '';

function renderCommitHash(el, sha, ref = '') {
  const full = String(sha || '').trim();
  if (!full) return;
  const short = full.slice(0, 7);
  const suffix = ref && ref !== 'main' ? ` <span style="color:var(--text-muted);opacity:0.7">(${escapeHTML(ref)})</span>` : '';
  el.innerHTML = `<a href="https://github.com/elkimek/get-based/commit/${escapeHTML(full)}" target="_blank" rel="noopener">${escapeHTML(short)}</a>${suffix}`;
}

function cacheAndRenderCommitHash(el, sha, ref = '') {
  _cachedCommitHash = String(sha || '').trim();
  _cachedCommitRef = ref || '';
  renderCommitHash(el, _cachedCommitHash, _cachedCommitRef);
}

export function loadCommitHash() {
  const vEl = document.getElementById('app-version-text');
  if (vEl && !vEl.textContent) vEl.textContent = window.APP_VERSION || '';
  const el = document.getElementById('app-commit-hash');
  if (!el) return;
  if (_cachedCommitHash) {
    renderCommitHash(el, _cachedCommitHash, _cachedCommitRef);
    return;
  }
  fetch('/api/commit')
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(({ sha, ref }) => {
      const e = document.getElementById('app-commit-hash');
      if (e) cacheAndRenderCommitHash(e, sha, ref);
    })
    .catch(() => fetch('https://api.github.com/repos/elkimek/get-based/commits/main', { headers: { Accept: 'application/vnd.github.sha' } })
      .then(r => r.ok ? r.text() : Promise.reject())
      .then(sha => {
        const e = document.getElementById('app-commit-hash');
        if (e) cacheAndRenderCommitHash(e, sha, 'main');
      })
      .catch(() => {}));
}
