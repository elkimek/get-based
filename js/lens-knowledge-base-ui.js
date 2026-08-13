// @ts-check
// lens-knowledge-base-ui.js - Knowledge Base settings/modal UI and local ingest.

import { getErrorMessage } from './caught-error.js';
import { showNotification, showConfirmDialog, escapeHTML, escapeAttr } from './utils.js';
import { closeModalOverlay, openModalOverlay, wireBackdropClose } from './modal-lifecycle.js';
import { initLensActionDelegates, lensActionAttrs } from './lens-actions.js';
import { createLensLibraryHandlers } from './lens-library.js';

/** @typedef {Window & typeof globalThis & { _lensIngestRunning?: boolean, _lensIngestStopRequested?: boolean }} LensWindow */
const lensWindow = /** @type {LensWindow} */ (window);

export function createLensKnowledgeBaseUi(deps) {
  const {
    defaultTestProbe,
    getLensConfig,
    saveLensConfig,
    getLensKey,
    saveLensKey,
    removeLens,
    clearLensCache,
    getLensStatus,
    updateLensStatus,
    hasLens,
    isValidLensUrl,
    testLensConnection,
    recordLocalLensStats,
  } = deps;

  function renderCustomLensSection() {
    const cfg = getLensConfig();
    // Schedule on-device init on the next animation frame. The caller
    // (settings.js or _rerenderLensSection) sets innerHTML with the
    // string we return, so the #lens-local-stats + #lens-library-select
    // elements don't exist yet at this point. rAF defers until after
    // that assignment paints.
    if (cfg.backend === 'in-browser' && typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        try { _loadLibraryPicker(); } catch {}
        try { _loadLocalLensStats(); } catch {}
      });
    }
    const keySet = !!getLensKey();

    const isBrowser = cfg.backend === 'in-browser';
    const isExternal = cfg.backend === 'external-server';

    const connected = isBrowser || (isExternal && cfg.url && keySet);
    const usableSource = hasLens();
    const status = getLensStatus();
    const statusChip = !connected
      ? '<span class="kb-status-text">Not connected</span>'
      : status.state === 'error'
        ? `<span class="kb-status-text kb-status-error">&#9888; Error${cfg.name ? ' · ' + escapeHTML(cfg.name) : ''}</span>`
        : cfg.enabled
          ? isBrowser && !usableSource
            ? '<span class="kb-status-text">Enabled · add documents</span>'
            : `<span class="kb-status-text kb-status-active">&#10003; Active${cfg.name ? ' · ' + escapeHTML(cfg.name) : ''}</span>`
          : '<span class="kb-status-text">Ready, currently off</span>';
    const lastInfo = status.state === 'error' && status.lastError
      ? `<div class="kb-status-detail kb-status-error">Last error: ${escapeHTML(status.lastError)}</div>`
      : connected && status.lastChunkCount
        ? `<div class="kb-status-detail">Last search: ${status.lastChunkCount} excerpt${status.lastChunkCount !== 1 ? 's' : ''}${status.sourceName ? ' from ' + escapeHTML(status.sourceName) : ''}</div>`
        : '';

    const backendCopy = isBrowser
      ? 'Indexing and search run on this device after the first model download. Matching excerpts are shared with your selected AI provider when chat answers.'
      : 'Connect to a knowledge server on your computer or local network. Best for large document collections.';

    const localFields = isBrowser ? `
      <section class="kb-section" id="lens-library-picker" aria-labelledby="kb-library-heading">
        <div class="kb-section-head">
          <div>
            <h3 id="kb-library-heading">Active library</h3>
            <p>Keep research, clinical guides, and personal notes in separate collections.</p>
          </div>
          <button class="import-btn import-btn-primary kb-new-library-btn" ${lensActionAttrs('new-library')} title="Create a library">+ New library</button>
        </div>
        <div class="kb-library-row">
          <select id="lens-library-select" class="kb-field-control kb-library-select" aria-label="Active library" ${lensActionAttrs('activate-library')}>
            <option value="">Loading…</option>
          </select>
          <div class="kb-library-actions">
            <button class="import-btn import-btn-secondary kb-small-btn" ${lensActionAttrs('rename-library')} title="Rename active library">Rename</button>
            <button class="kb-text-btn kb-text-btn-danger" ${lensActionAttrs('delete-library')} title="Delete active library">Delete</button>
          </div>
        </div>
        <p class="kb-field-help">Chat searches only the active library.</p>
      </section>

      <section class="kb-section" id="lens-local-fields" aria-labelledby="kb-documents-heading">
        <div class="kb-section-head">
          <div>
            <h3 id="kb-documents-heading">Documents</h3>
            <p>Add files and keep working while indexing runs in the background.</p>
          </div>
        </div>
        <div id="lens-local-stats" class="kb-stats" role="status">Loading your library…</div>
        <div id="lens-local-drop" class="kb-drop-zone"
             role="button" tabindex="0"
             aria-label="Add documents — drop files here or press Enter to open the file picker"
             ${lensActionAttrs('open-local-filepick')}>
          <span class="kb-drop-icon" aria-hidden="true">📁</span>
          <strong>Drop documents here or choose files</strong>
          <span>PDF · Markdown · Text · Word · JSON · ZIP</span>
        </div>
        <input type="file" id="lens-local-filepick" multiple hidden accept=".txt,.md,.markdown,.rst,.json,.csv,.log,.pdf,.docx,.zip">
        <div id="lens-local-progress-wrap" class="kb-inline-progress" hidden>
          <progress id="lens-local-progress" value="0" max="100" aria-label="Indexing progress"></progress>
          <div id="lens-local-progress-text" role="status" aria-live="polite"></div>
        </div>
        <div id="lens-local-doc-list" class="kb-document-list"></div>
      </section>
    ` : '';

    const externalFields = isExternal ? `
      <section class="kb-section" id="lens-remote-fields" aria-labelledby="kb-server-heading">
        <div class="kb-section-head">
          <div>
            <h3 id="kb-server-heading">Knowledge server</h3>
            <p>Connect getbased to a RAG endpoint you control.</p>
          </div>
        </div>
        <details class="kb-setup-details">
          <summary>Set up the local server on Linux</summary>
          <div class="kb-setup-body">
            <p><strong>1. Install and start the agent stack</strong></p>
            <code class="kb-command">curl -sSL https://getbased.health/install.sh | bash</code>
            <p><strong>2. Open the dashboard</strong> using the one-click login URL printed by the installer.</p>
            <p><strong>3. In MCP → Environment, copy <code>LENS_API_KEY</code></strong> and paste it below.</p>
            <p class="kb-field-help"><strong>Linux only for automatic startup.</strong> On macOS or Windows, follow the <a href="https://docs.getbased.health/guides/knowledge-base" target="_blank" rel="noopener">manual setup guide</a>.</p>
            <details class="kb-setup-audit">
              <summary>Review the installer first</summary>
              <p><a href="https://github.com/elkimek/get-based-site/blob/main/install.sh" target="_blank" rel="noopener">Read install.sh on GitHub →</a></p>
              <code class="kb-command">curl -sSL https://getbased.health/install.sh.sha256 | sha256sum -c</code>
            </details>
          </div>
        </details>
        <div class="kb-field-grid">
          <label class="kb-field" for="lens-name-input">
            <span>Display name</span>
            <input type="text" class="kb-field-control" id="lens-name-input" value="${escapeAttr(cfg.name)}" placeholder="e.g. Functional Medicine Library">
            <small>Shown in chat while this source is grounding an answer.</small>
          </label>
          <label class="kb-field" for="lens-url-input">
            <span>Endpoint URL</span>
            <input type="url" class="kb-field-control" id="lens-url-input" value="${escapeAttr(cfg.url)}" placeholder="http://127.0.0.1:8322/query">
            <small>Include the <code>/query</code> path.</small>
          </label>
          <label class="kb-field" for="lens-key-input">
            <span>API key</span>
            <input type="password" class="kb-field-control" id="lens-key-input" value="${escapeAttr(keySet ? '••••••••' : '')}" placeholder="Bearer token">
            <small>Encrypted at rest on this device.</small>
          </label>
          <label class="kb-field" for="lens-test-probe-input">
            <span>Connection test query</span>
            <input type="text" class="kb-field-control" id="lens-test-probe-input" value="${escapeAttr(cfg.testProbe || defaultTestProbe)}" placeholder="${escapeAttr(defaultTestProbe)}">
            <small>Used once when you choose Save + connect.</small>
          </label>
        </div>
      </section>
    ` : '';

    return `<div class="kb-panel">
      <section class="kb-intro">
        <div class="kb-intro-copy">
          <strong>Ground AI answers in documents you trust.</strong>
          <p>Add research papers, clinical guides, or personal notes. getbased searches them before answering and can cite the matching excerpts. <a href="https://docs.getbased.health/guides/knowledge-base" target="_blank" rel="noopener">Learn how it works →</a></p>
        </div>
        <div class="kb-status" id="lens-status-chip">${statusChip}${lastInfo}</div>
      </section>

      <section class="kb-section kb-engine-section" aria-labelledby="kb-engine-heading">
        <div class="kb-section-head kb-engine-head">
          <div>
            <h3 id="kb-engine-heading">Where it runs</h3>
            <p>${backendCopy}</p>
          </div>
          <label class="kb-enable-control" for="lens-enabled-toggle">
            <span>Use in AI answers</span>
            <span class="toggle-switch">
              <input type="checkbox" id="lens-enabled-toggle" ${cfg.enabled ? 'checked' : ''} ${lensActionAttrs('toggle-enabled')}>
              <span class="toggle-slider"></span>
            </span>
          </label>
        </div>
        <div class="ctx-btn-group kb-engine-picker" role="radiogroup" aria-label="Knowledge Base engine">
          <button type="button" class="ctx-btn-option ${isBrowser ? 'active' : ''}" role="radio" aria-checked="${isBrowser}" ${lensActionAttrs('set-backend', { backend: 'in-browser' })}>On this device</button>
          <button type="button" class="ctx-btn-option ${isExternal ? 'active' : ''}" role="radio" aria-checked="${isExternal}" ${lensActionAttrs('set-backend', { backend: 'external-server' })}>External server</button>
        </div>
      </section>

      ${localFields}
      ${externalFields}

      <section class="kb-section" aria-labelledby="kb-retrieval-heading">
        <div class="kb-section-head">
          <div>
            <h3 id="kb-retrieval-heading">Search behavior</h3>
            <p>Control how much supporting context is sent with each question.</p>
          </div>
        </div>
        <div class="kb-retrieval-grid">
          <label class="kb-field kb-compact-field" for="lens-topk-input">
            <span>Excerpts per question</span>
            <input type="number" class="kb-field-control kb-number-control" id="lens-topk-input" value="${cfg.topK || 5}" min="1" max="10" inputmode="numeric">
            <small>Usually 3–5 is enough. Higher values add more context to each AI request.</small>
          </label>
          <label class="kb-option-card" for="lens-multi-query-checkbox">
            <input type="checkbox" id="lens-multi-query-checkbox" ${cfg.multiQuery !== false ? 'checked' : ''}>
            <span>
              <strong>Improve recall with query rewriting</strong>
              <small>Your AI provider searches synonyms and related terms. Adds about one second to the first matching question.</small>
            </span>
          </label>
        </div>
      </section>

      <div class="kb-footer-actions">
        <div class="kb-footer-secondary">
          ${connected ? `<button class="kb-text-btn" ${lensActionAttrs('clear-cache')}>Clear search cache</button>` : ''}
          ${connected ? `<button class="kb-text-btn kb-text-btn-danger" ${lensActionAttrs('remove-lens')}>Remove knowledge source</button>` : ''}
        </div>
        <button class="import-btn import-btn-primary kb-save-btn" ${lensActionAttrs('save-config')}>${isExternal ? 'Save + connect' : 'Save changes'}</button>
      </div>

      <div class="kb-privacy-note">
        <span aria-hidden="true">🔒</span>
        <span>${isBrowser
          ? 'Files, embeddings, and searches stay on this device. When chat uses the Knowledge Base, matching excerpts are included in the request to your configured AI provider. Query rewriting also sends the question when enabled.'
          : 'Questions are sent directly to the server you configure. Only connect to a server you control or trust.'}</span>
      </div>
    </div>`;
  }

  function _rerenderLensSection() {
    const section = document.getElementById('custom-lens-section');
    if (section) section.innerHTML = renderCustomLensSection();
  }

  // KB lives in its own modal as of v1.3.24 — pulled out of Settings →
  // AI because it's conceptually distinct (your documents, your local
  // embeddings) from "which API answers chat questions". The dashboard
  // "Connect a knowledge base" CTA opens this directly. Same DOM IDs as
  // the previous in-Settings render path, so handleSaveLensConfig and
  // _loadLocalLensStats keep working without changes.
  function openKnowledgeBaseModal(options = {}) {
    const showContextBack = options.source !== 'sidebar';
    let overlay = document.getElementById('kb-modal-overlay');
    let modal = document.getElementById('kb-modal');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'kb-modal-overlay';
      overlay.className = 'modal-overlay';
      document.body.appendChild(overlay);
      wireBackdropClose(overlay, closeKnowledgeBaseModal);
    }
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'kb-modal';
      overlay.appendChild(modal);
    }
    modal.className = 'modal kb-modal settings-modal';
    modal.innerHTML = `
      <div class="gb-modal-head">
        ${showContextBack ? `<button type="button" class="context-back-btn" ${lensActionAttrs('open-context')} aria-label="Back to Context" title="Back to Context"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>` : ''}
        <div>
          <div class="gb-modal-kicker">Local context</div>
          <div class="gb-modal-title">Knowledge Base</div>
        </div>
        <button class="modal-close" ${lensActionAttrs('close-kb')} aria-label="Close">&times;</button>
      </div>
      <div class="gb-form-body">
      <div class="settings-section" id="custom-lens-section">
        ${renderCustomLensSection()}
      </div>
      </div>
    `;
    openModalOverlay(overlay, {
      initialFocus: 'input:not([disabled]),button:not([disabled]),[tabindex="0"]',
      focusDelay: 50
    });
    document.addEventListener('keydown', _kbModalKeydown);
    // Hydrate stats async without blocking the open.
    if (getLensConfig().backend === 'in-browser') {
      _loadLocalLensStats().catch(() => {});
    }
  }

  function closeKnowledgeBaseModal() {
    closeModalOverlay('kb-modal-overlay');
    document.removeEventListener('keydown', _kbModalKeydown);
  }

  function _kbModalKeydown(e) {
    if (e.key !== 'Escape') return;
    // A library form, rename prompt, or destructive confirmation owns the
    // first Escape press. Closing the parent here as well would make a
    // simple cancel unexpectedly dismiss the whole Knowledge Base.
    if (document.querySelector('.confirm-overlay.show')) return;
    closeKnowledgeBaseModal();
  }

  // Update only the status chip without blowing away input fields
  function _updateLensStatusChip() {
    const chip = document.getElementById('lens-status-chip');
    if (!chip) return;
    const cfg = getLensConfig();
    const keySet = !!getLensKey();
    const isBrowser = cfg.backend === 'in-browser';
    const connected = isBrowser || (cfg.backend === 'external-server' && cfg.url && keySet);
    const usableSource = hasLens();
    const status = getLensStatus();
    const statusChip = !connected
      ? '<span class="kb-status-text">Not connected</span>'
      : status.state === 'error'
        ? `<span class="kb-status-text kb-status-error">&#9888; Error${cfg.name ? ' · ' + escapeHTML(cfg.name) : ''}</span>`
      : cfg.enabled
          ? isBrowser && !usableSource
            ? '<span class="kb-status-text">Enabled · add documents</span>'
            : `<span class="kb-status-text kb-status-active">&#10003; Active${cfg.name ? ' · ' + escapeHTML(cfg.name) : ''}</span>`
          : '<span class="kb-status-text">Ready, currently off</span>';
    const lastInfo = status.state === 'error' && status.lastError
      ? `<div class="kb-status-detail kb-status-error">Last error: ${escapeHTML(status.lastError)}</div>`
      : connected && status.lastChunkCount
        ? `<div class="kb-status-detail">Last search: ${status.lastChunkCount} excerpt${status.lastChunkCount !== 1 ? 's' : ''}${status.sourceName ? ' from ' + escapeHTML(status.sourceName) : ''}</div>`
        : '';
    chip.innerHTML = statusChip + lastInfo;
  }

  async function handleSaveLensConfig() {
    const topKInput = /** @type {HTMLInputElement | null} */ (document.getElementById('lens-topk-input'));
    const enabledToggle = /** @type {HTMLInputElement | null} */ (document.getElementById('lens-enabled-toggle'));
    const multiQueryCheckbox = /** @type {HTMLInputElement | null} */ (document.getElementById('lens-multi-query-checkbox'));
    const topK = Math.max(1, Math.min(10, parseInt(topKInput?.value || '', 10) || 5));
    const enabled = !!enabledToggle?.checked;
    const multiQuery = !!multiQueryCheckbox?.checked;
    // Backend is set by the pill buttons via handleLensBackendChange and
    // persisted immediately — read it from config rather than DOM.
    const backend = getLensConfig().backend || 'in-browser';

    if (backend === 'in-browser') {
      // On-device: display name is auto-derived from active library, not
      // a user-facing field anymore. Preserve whatever _loadLibraryPicker
      // last synced.
      saveLensConfig({ enabled, topK, backend, multiQuery });
      _rerenderLensSection();
      _loadLocalLensStats();
      showNotification('Saved. Indexing and search stay on this device.', 'success');
      return;
    }

    // external-server: only backend where a user-entered display name is
    // meaningful (it's a remote endpoint, not a named library).
    const nameInput = /** @type {HTMLInputElement | null} */ (document.getElementById('lens-name-input'));
    const urlInput = /** @type {HTMLInputElement | null} */ (document.getElementById('lens-url-input'));
    const keyInput = /** @type {HTMLInputElement | null} */ (document.getElementById('lens-key-input'));
    const testProbeInput = /** @type {HTMLInputElement | null} */ (document.getElementById('lens-test-probe-input'));
    const name = (nameInput?.value || '').trim();
    const url = (urlInput?.value || '').trim().replace(/\/+$/, '');
    const keyRaw = keyInput?.value || '';
    const testProbe = (testProbeInput?.value || '').trim() || defaultTestProbe;

    if (!url) { showNotification('Please enter an endpoint URL', 'error'); return; }
    if (!isValidLensUrl(url)) { showNotification('URL must be https:// (or http:// to localhost / LAN / .local)', 'error'); return; }

    const key = (keyRaw === '••••••••') ? getLensKey() : keyRaw.trim();
    if (!key) { showNotification('Please enter an API key', 'error'); return; }

    saveLensConfig({ name, url, enabled, topK, testProbe, backend, multiQuery });
    if (keyRaw !== '••••••••') await saveLensKey(key);

    const result = await testLensConnection();
    _rerenderLensSection();
    if (result.ok) {
      const n = result.chunkCount;
      const msg = n > 0
        ? `Connected — found ${n} good excerpt${n !== 1 ? 's' : ''} for the test query`
        : `Connected — your endpoint works, but the test query didn't find any close matches. Try a query more specific to what you've indexed.`;
      showNotification(msg, 'success');
    } else {
      showNotification(`Connection failed: ${result.error}`, 'error');
    }
  }

  /// Backend radio handler — saves the choice immediately (so a reload
  /// keeps the selection). Re-renders the whole panel since the per-backend
  /// sections have structurally different layouts.
  function handleLensBackendChange(backend) {
    saveLensConfig({ backend });
    _rerenderLensSection();
    if (backend === 'in-browser') _loadLocalLensStats();
    _updateLensStatusChip();
  }

  /// Populate the local-corpus stats line + doc list + wire the drop handler.
  /// Lazy-imports lens-local.js so remote-only users don't pay the cost.
  /// Idempotent — called on panel render, backend toggle, and after ingest.
  ///
  /// No local cache here: `openLocalLens()` memoizes its own `_ready`
  /// Promise, so repeated `await openLocalLens()` is free. One source of
  /// truth; no drift possible.
  async function _getLocalLens() {
    const mod = await import('./lens-local.js');
    return mod.openLocalLens();
  }

  async function _loadLocalLensStats() {
    const stats = document.getElementById('lens-local-stats');
    const list = document.getElementById('lens-local-doc-list');
    // Even when no Settings panel is open we still want the cache hot for
    // the dashboard summary — keep going if the DOM nodes aren't present.
    try {
      const lens = await _getLocalLens();
      const s = await lens.getStats();
      recordLocalLensStats(s);
      // Notify dashboard listeners that summary numbers may have changed.
      updateLensStatus({});
      if (!stats) return;
      if (s.total_chunks === 0) {
        stats.textContent = 'No documents indexed yet. Add a file to start this library.';
      } else {
        const modelLabel = /minilm/i.test(s.model)
          ? 'MiniLM'
          : /bge-small/i.test(s.model)
            ? 'BGE-small'
            : /bge-base/i.test(s.model)
              ? 'BGE-base'
              : /multilingual-e5/i.test(s.model)
                ? 'Multilingual-E5'
                : s.model;
        const backendLabel = s.backend === 'webgpu' ? 'WebGPU' : 'CPU';
        const speed = Number.isFinite(s.ms_per_embed) && s.ms_per_embed > 0
          ? ` · about ${Math.max(1, Math.round(1000 / s.ms_per_embed))} excerpts/s`
          : '';
        stats.innerHTML = `<span class="kb-stats-dot" aria-hidden="true"></span>${s.total_chunks.toLocaleString()} excerpt${s.total_chunks !== 1 ? 's' : ''} from ${s.documents.length} document${s.documents.length !== 1 ? 's' : ''} · <span title="${escapeAttr(s.model)}">${escapeHTML(modelLabel)} on ${escapeHTML(backendLabel)}${speed}</span>`;
        if (s.backend !== 'webgpu' && /bge-base/i.test(s.model)) {
          stats.innerHTML += '<div class="kb-performance-note">BGE-base favors retrieval quality over CPU import speed. For faster indexing, create a new library with the Balanced profile.</div>';
        }
      }
      if (list) list.innerHTML = _renderLocalDocList(s.documents);
      _attachLocalLensDropHandlers();
    } catch (e) {
      if (stats) stats.innerHTML = `<span class="kb-status-error">Failed to load library: ${escapeHTML(getErrorMessage(e, String(e)))}</span>`;
    }
  }

  function _renderLocalDocList(docs) {
    if (!docs || docs.length === 0) return '';
    const rows = docs.map((d) => `
      <div class="kb-document-row">
        <span class="kb-document-name" title="${escapeAttr(d.source)}">${escapeHTML(d.source)}</span>
        <span class="kb-document-count" title="Indexed excerpts">${d.chunks}</span>
        <button class="kb-doc-delete" ${lensActionAttrs('delete-doc', { source: d.source })} aria-label="Delete ${escapeAttr(d.source)}" title="Remove document">×</button>
      </div>
    `).join('');
    return `
      <div class="kb-document-table">${rows}</div>
      <div class="kb-document-actions">
        <button class="kb-text-btn kb-text-btn-danger" ${lensActionAttrs('clear-local')}>Remove all documents</button>
      </div>
    `;
  }

  function _attachLocalLensDropHandlers() {
    const drop = document.getElementById('lens-local-drop');
    const picker = document.getElementById('lens-local-filepick');
    if (!(drop instanceof HTMLElement) || !(picker instanceof HTMLInputElement)) return;
    if (drop.dataset.wired === '1') return;
    drop.dataset.wired = '1';
    drop.addEventListener('dragenter', (e) => { e.preventDefault(); drop.classList.add('is-dragging'); });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-dragging'); });
    drop.addEventListener('dragleave', () => { drop.classList.remove('is-dragging'); });
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-dragging'); _handleLocalLensIngest(e.dataTransfer?.files); });
    drop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); picker.click(); }
    });
    picker.addEventListener('change', () => { _handleLocalLensIngest(picker.files); picker.value = ''; });
  }

  // Fixed-position progress pill that lives outside any modal. Ingest can
  // take many minutes for large corpora; users need to close Settings and
  // keep working while embedding runs in the worker. This pill survives
  // modal open/close/re-render cycles and is the canonical progress UI.
  // The in-modal progress bar (if the modal is open) mirrors the same
  // events so existing markup keeps working — both are hydrated fresh on
  // every progress event so a mid-ingest modal reopen rebinds cleanly.
  function _ensureIngestPill() {
    let pill = document.getElementById('lens-ingest-pill');
    if (pill) return pill;
    pill = document.createElement('div');
    pill.id = 'lens-ingest-pill';
    pill.className = 'kb-ingest-pill';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    pill.innerHTML = `
      <div class="kb-ingest-pill-head">
        <strong>Indexing knowledge base</strong>
        <button id="lens-ingest-pill-dismiss" class="kb-ingest-pill-dismiss" title="Hide while indexing continues" aria-label="Hide progress">&times;</button>
      </div>
      <div id="lens-ingest-pill-text" class="kb-ingest-pill-text">Preparing…</div>
      <progress id="lens-ingest-pill-bar" value="0" max="1"></progress>
      <button id="lens-ingest-pill-cancel" class="kb-ingest-pill-stop">Stop indexing</button>
    `;
    document.body.appendChild(pill);
    const dismiss = /** @type {HTMLButtonElement | null} */ (pill.querySelector('#lens-ingest-pill-dismiss'));
    const cancel = /** @type {HTMLButtonElement | null} */ (pill.querySelector('#lens-ingest-pill-cancel'));
    dismiss?.addEventListener('click', () => {
      pill.style.display = 'none';
    });
    cancel?.addEventListener('click', async () => {
      lensWindow._lensIngestStopRequested = true;
      cancel.disabled = true;
      cancel.textContent = 'Stopping…';
      try {
        const lens = await _getLocalLens();
        lens.abort();
      } catch {}
    });
    return pill;
  }

  function _removeIngestPill() {
    const pill = document.getElementById('lens-ingest-pill');
    if (pill) pill.remove();
  }

  async function _handleLocalLensIngest(fileList) {
    // Snapshot IMMEDIATELY — FileList from an <input type=file>.files is a
    // LIVE reference, and the picker's change handler clears input.value
    // right after calling us. Awaiting the dynamic import below would give
    // the clear a chance to empty the FileList mid-flight. Array.from copies
    // the File handles off the live list; each File itself stays valid.
    const incoming = fileList ? Array.from(fileList) : [];
    if (incoming.length === 0) return;
    if (lensWindow._lensIngestRunning) {
      showNotification('Finish or stop the current indexing job before adding more files.', 'info');
      return;
    }

    const pill = _ensureIngestPill();
    pill.style.display = '';
    const pillText = /** @type {HTMLElement | null} */ (pill.querySelector('#lens-ingest-pill-text'));
    const pillBar = /** @type {HTMLProgressElement | null} */ (pill.querySelector('#lens-ingest-pill-bar'));
    const pillStop = /** @type {HTMLButtonElement | null} */ (pill.querySelector('#lens-ingest-pill-cancel'));
    if (!pillText || !pillBar || !pillStop) return;
    const t0 = performance.now();
    let indexT0 = 0;
    let unsub = () => {};
    lensWindow._lensIngestStopRequested = false;
    const updateProgressUi = (message, progress = null) => {
      pillText.textContent = message;
      const modalBar = /** @type {HTMLProgressElement | null} */ (document.getElementById('lens-local-progress'));
      const modalText = document.getElementById('lens-local-progress-text');
      const modalWrap = /** @type {HTMLElement | null} */ (document.getElementById('lens-local-progress-wrap'));
      if (modalWrap) {
        modalWrap.hidden = false;
        modalWrap.style.display = '';
      }
      if (modalText) modalText.textContent = message;
      if (progress) {
        const max = Math.max(1, progress.max);
        pillBar.max = max;
        pillBar.value = Math.min(max, progress.value);
        if (modalBar) {
          modalBar.max = max;
          modalBar.value = Math.min(max, progress.value);
        }
      } else {
        pillBar.removeAttribute('value');
        modalBar?.removeAttribute('value');
      }
    };

    lensWindow._lensIngestRunning = true;
    updateProgressUi(`Reading ${incoming.length} file${incoming.length !== 1 ? 's' : ''}…`);
    try {
      // Model startup and document parsing are independent, so begin both
      // together. On a cold library this hides most of the model-load cost
      // behind PDF/DOCX extraction instead of making the user wait twice.
      const localModulePromise = import('./lens-local.js');
      const lensPromise = localModulePromise.then((mod) => mod.openLocalLens());
      const { extractFromFile } = await import('./lens-local-parsers.js');
      const files = [];
      for (let i = 0; i < incoming.length; i++) {
        const f = incoming[i];
        updateProgressUi(`Reading ${i + 1}/${incoming.length} · ${f.name}`);
        try {
          const extracted = await extractFromFile(f);
          for (const e of extracted) files.push(e);
        } catch (err) {
          console.warn('[lens-local] extract failed:', f.name, err);
        }
        if (lensWindow._lensIngestStopRequested) {
          const stopped = 'Stopped before indexing — no library changes were saved.';
          updateProgressUi(stopped, { value: 1, max: 1 });
          showNotification(stopped, 'info');
          return;
        }
      }
      if (files.length === 0) {
        updateProgressUi('No usable documents were found.');
        return;
      }

      updateProgressUi('Loading the active search model…');
      const localModule = await localModulePromise;
      const lens = await lensPromise;
      if (lensWindow._lensIngestStopRequested) {
        const stopped = 'Stopped before indexing — no library changes were saved.';
        updateProgressUi(stopped, { value: 1, max: 1 });
        showNotification(stopped, 'info');
        return;
      }
      unsub = localModule.subscribeProgress((p) => {
        if (p.stage === 'start') {
          indexT0 = performance.now();
          updateProgressUi(
            p.total > 0
              ? `Preparing ${p.total} excerpt${p.total !== 1 ? 's' : ''}…`
              : 'Checking for document changes…',
            { value: 0, max: p.total },
          );
        } else if (p.stage === 'embed') {
          const elapsed = Math.max(0.001, (performance.now() - indexT0) / 1000);
          const rate = p.index / elapsed;
          const remaining = Math.max(0, p.total - p.index);
          const eta = rate > 0 && remaining > 0 ? ` · about ${Math.ceil(remaining / rate)}s left` : '';
          updateProgressUi(
            `Indexing ${p.index}/${p.total} · ${rate.toFixed(1)}/s${eta} · ${p.source}`,
            { value: p.index, max: p.total },
          );
        } else if (p.stage === 'saving') {
          pillStop.disabled = true;
          pillStop.textContent = 'Finishing…';
          updateProgressUi('Saving the updated library…', { value: p.total, max: p.total });
        }
      });

      updateProgressUi('Preparing documents…');
      const stats = await lens.ingest(files);
      const dur = ((performance.now() - t0) / 1000).toFixed(1);
      const skippedCount = Array.isArray(stats.skipped) ? stats.skipped.length : 0;
      let doneMsg;
      if (stats.cancelled) {
        doneMsg = `Stopped after ${dur}s — no library changes were saved.`;
      } else if (stats.chunks_indexed === 0 && skippedCount > 0) {
        doneMsg = `Already up to date — ${skippedCount} unchanged file${skippedCount !== 1 ? 's' : ''}.`;
      } else {
        const replaced = stats.replaced_documents || 0;
        const replacementCopy = replaced > 0 ? ` · replaced ${replaced} existing document${replaced !== 1 ? 's' : ''}` : '';
        doneMsg = `Indexed ${stats.chunks_indexed} excerpts from ${stats.files_seen} file${stats.files_seen !== 1 ? 's' : ''} in ${dur}s${replacementCopy}.`;
      }
      pillStop.disabled = true;
      pillStop.textContent = stats.cancelled ? 'Stopped' : 'Done';
      updateProgressUi(doneMsg, { value: 1, max: 1 });
      if (!stats.cancelled && stats.chunks_indexed > 0) clearLensCache();
      showNotification(doneMsg, stats.cancelled ? 'info' : 'success');
    } catch (e) {
      const errMsg = `Couldn't index: ${getErrorMessage(e, e)}`;
      updateProgressUi(errMsg);
      showNotification(errMsg, 'error');
    } finally {
      lensWindow._lensIngestRunning = false;
      lensWindow._lensIngestStopRequested = false;
      unsub();
      setTimeout(() => {
        _removeIngestPill();
        const modalWrap = document.getElementById('lens-local-progress-wrap');
        if (modalWrap) {
          modalWrap.hidden = true;
          modalWrap.style.display = 'none';
        }
      }, 3000);
      await _loadLocalLensStats();
    }
  }

  async function handleLocalLensDeleteDoc(source) {
    if (!source) return;
    if (await showConfirmDialog(`Remove "${source}" from your knowledge base?`)) {
      try {
        const lens = await _getLocalLens();
        const deleted = await lens.deleteDocument(source);
        clearLensCache();
        showNotification(`Removed ${deleted} excerpt${deleted !== 1 ? 's' : ''}.`, 'success');
        await _loadLocalLensStats();
      } catch (e) {
        showNotification(`Couldn't delete that document: ${getErrorMessage(e, e)}.`, 'error');
      }
    }
  }

  async function handleLocalLensClear() {
    if (await showConfirmDialog('Clear every document from your knowledge base? This can\'t be undone.')) {
      try {
        const lens = await _getLocalLens();
        await lens.clear();
        clearLensCache();
        showNotification('Knowledge base cleared.', 'success');
        await _loadLocalLensStats();
      } catch (e) {
        showNotification(`Couldn't clear the knowledge base: ${getErrorMessage(e, e)}.`, 'error');
      }
    }
  }

  const lensLibraryHandlers = createLensLibraryHandlers({
    getLensConfig,
    getLocalLens: _getLocalLens,
    clearLensCache,
    saveLensConfig,
    updateLensStatusChip: _updateLensStatusChip,
    loadLocalLensStats: _loadLocalLensStats,
  });
  const _loadLibraryPicker = lensLibraryHandlers.loadLibraryPicker;
  const handleLibraryActivate = lensLibraryHandlers.handleLibraryActivate;
  const handleLibraryNew = lensLibraryHandlers.handleLibraryNew;
  const handleLibraryRename = lensLibraryHandlers.handleLibraryRename;
  const handleLibraryDelete = lensLibraryHandlers.handleLibraryDelete;

  function handleToggleLens(checked) {
    saveLensConfig({ enabled: checked });
    _updateLensStatusChip();
  }

  function handleClearLensCache() {
    clearLensCache();
    showNotification('Lens cache cleared', 'info');
  }

  async function handleRemoveLens() {
    const cfg = getLensConfig();
    const isBrowser = cfg.backend === 'in-browser';
    const prompt = isBrowser
      ? 'Remove Knowledge Source? This also deletes every document you indexed in the browser. This can\'t be undone.'
      : 'Remove Knowledge Source? Your server URL and API key will be deleted.';
    if (await showConfirmDialog(prompt)) {
      await removeLens();
      if (isBrowser) {
        try {
          const lens = await _getLocalLens();
          await lens.clear();
        } catch (e) {
          console.warn('[lens] local corpus clear failed:', e);
        }
      }
      _rerenderLensSection();
      showNotification(
        isBrowser ? 'Knowledge Source and indexed documents removed.'
        : 'Knowledge Source removed.',
        'info',
      );
    }
  }

  initLensActionDelegates({
    closeKnowledgeBaseModal, handleClearLensCache, handleLensBackendChange,
    handleLibraryActivate, handleLibraryDelete, handleLibraryNew, handleLibraryRename,
    handleLocalLensClear, handleLocalLensDeleteDoc, handleRemoveLens, handleSaveLensConfig,
    handleToggleLens, openLocalFilePicker: () => document.getElementById('lens-local-filepick')?.click(),
  });

  return {
    closeKnowledgeBaseModal,
    handleClearLensCache,
    handleLensBackendChange,
    handleLibraryActivate,
    handleLibraryDelete,
    handleLibraryNew,
    handleLibraryRename,
    handleLocalLensClear,
    handleLocalLensDeleteDoc,
    handleRemoveLens,
    handleSaveLensConfig,
    handleToggleLens,
    openKnowledgeBaseModal,
    renderCustomLensSection,
  };
}
