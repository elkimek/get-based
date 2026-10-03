// commit-hash.js - Footer app version and commit hash hydration

import { escapeHTML } from './utils.js';
import { getAppVersionRuntime } from './utils-runtime.js';

let _cachedCommitHash: string | null = null;

function renderCommitHash(el: Element, sha: unknown) {
  const full = String(sha || '').trim();
  if (!full) return;
  const short = full.slice(0, 7);
  el.innerHTML = `<a href="https://github.com/elkimek/get-based/commit/${escapeHTML(full)}" target="_blank" rel="noopener">${escapeHTML(short)}</a>`;
}

function cacheAndRenderCommitHash(el: Element, sha: unknown) {
  _cachedCommitHash = String(sha || '').trim();
  renderCommitHash(el, _cachedCommitHash);
}

export function loadCommitHash() {
  const vEl = document.getElementById('app-version-text');
  if (vEl && !vEl.textContent) vEl.textContent = getAppVersionRuntime();
  const el = document.getElementById('app-commit-hash');
  if (!el) return;
  if (_cachedCommitHash) {
    renderCommitHash(el, _cachedCommitHash);
    return;
  }
  fetch('/api/commit')
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(({ sha }: { sha?: unknown }) => {
      const e = document.getElementById('app-commit-hash');
      if (e) cacheAndRenderCommitHash(e, sha);
    })
    .catch(() => {});
}
