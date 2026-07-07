// @ts-check
// lens-knowledge-base-ui.js - Knowledge Base settings/modal UI and local ingest.

import { showNotification, showConfirmDialog, escapeHTML, escapeAttr } from './utils.js';
import { closeModalOverlay, openModalOverlay, wireBackdropClose } from './modal-lifecycle.js';
import { initLensActionDelegates, lensActionAttrs } from './lens-actions.js';
import { createLensLibraryHandlers } from './lens-library.js';

/** @typedef {Window & typeof globalThis & { _lensIngestRunning?: boolean }} LensWindow */
const lensWindow = /** @type {LensWindow} */ (window);

export function createLensKnowledgeBaseUi(deps) {
  const {
    defaultTestProbe,
    getLensConfig,
    saveLensConfig,
    getLensKey,
    saveLensKey,
    removeLens,
    hasLens,
    clearLensCache,
    getLensStatus,
    updateLensStatus,
    updateLensIndicator,
    isValidLensUrl,
    testLensConnection,
    hasAIProvider,
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
    const status = getLensStatus();
    const statusChip = !connected
      ? '<span style="color:var(--text-muted)">Not connected</span>'
      : status.state === 'error'
        ? `<span style="color:#fbbf24">&#9888; Error${cfg.name ? ' · ' + escapeHTML(cfg.name) : ''}</span>`
        : cfg.enabled
          ? `<span style="color:var(--green)">&#10003; Connected${cfg.name ? ' · ' + escapeHTML(cfg.name) : ''}</span>`
          : `<span style="color:var(--text-muted)">Configured (disabled)</span>`;
    const lastInfo = status.state === 'error' && status.lastError
      ? `<div style="font-size:11px;color:#fbbf24;margin-top:4px">Last error: ${escapeHTML(status.lastError)}</div>`
      : connected && status.lastChunkCount
        ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">Last query: ${status.lastChunkCount} excerpt${status.lastChunkCount !== 1 ? 's' : ''}${status.sourceName ? ' from ' + escapeHTML(status.sourceName) : ''}</div>`
        : '';

    // Per-backend field visibility. The radio handler swaps display:none
    // so we don't have to re-render the whole panel on toggle — preserves
    // scroll position + focus.
    const browserFieldsStyle = isBrowser ? '' : 'display:none';
    const externalFieldsStyle = isExternal ? '' : 'display:none';

    return `<div class="ai-provider-panel">
      <div class="ai-provider-desc">Optional. A Knowledge Base grounds the AI's answers in documents you provide — research papers, clinical guides, personal notes. Add your documents below and the AI cites them when answering chat questions. <a href="https://docs.getbased.health/guides/interpretive-lens" target="_blank" rel="noopener" style="color:var(--accent)">Learn more →</a></div>
      <div class="api-key-status" id="lens-status-chip">${statusChip}${lastInfo}</div>

      <div style="margin-top:10px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Where to run it</div>
        <div class="ctx-btn-group" role="radiogroup" aria-label="Knowledge Base engine">
          <button type="button" class="ctx-btn-option ${isBrowser ? 'active' : ''}" role="radio" aria-checked="${isBrowser}" ${lensActionAttrs('set-backend', { backend: 'in-browser' })}>On this device</button>
          <button type="button" class="ctx-btn-option ${isExternal ? 'active' : ''}" role="radio" aria-checked="${isExternal}" ${lensActionAttrs('set-backend', { backend: 'external-server' })}>External server</button>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px">
          ${isBrowser
            ? 'Runs entirely in this browser. No install — first use downloads a small AI model (~100 MB); after that it works offline. Good for a few hundred documents.'
            : 'Connect to a RAG server on your machine or LAN. Best for large corpora (thousands of files) and hardware-accelerated retrieval.'}
        </div>
      </div>

      <div style="margin-top:10px;display:flex;align-items:center;gap:10px">
        <label class="toggle-switch" for="lens-enabled-toggle">
          <input type="checkbox" id="lens-enabled-toggle" ${cfg.enabled ? 'checked' : ''} ${lensActionAttrs('toggle-enabled')}>
          <span class="toggle-slider"></span>
        </label>
        <label for="lens-enabled-toggle" style="font-size:13px;cursor:pointer">Enable Knowledge Source</label>
      </div>

      ${isBrowser ? `
      <!-- Library picker — in-browser only. external-server has no library
           concept; it's a single remote endpoint.
           The select is populated lazily after mount because the backend
           is async. -->
      <div id="lens-library-picker" style="margin-top:12px">
        <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px" for="lens-library-select">Library</label>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <select id="lens-library-select" ${lensActionAttrs('activate-library')}
                  style="flex:1;min-width:180px;padding:6px 8px;background:var(--select-surface);color:var(--text-primary);border:1px solid var(--border);border-radius:4px;font-size:13px">
            <option value="">Loading…</option>
          </select>
          <button class="import-btn import-btn-secondary" ${lensActionAttrs('new-library')} style="font-size:12px;padding:6px 10px" title="New library">+ New</button>
          <button class="import-btn import-btn-secondary" ${lensActionAttrs('rename-library')} style="font-size:12px;padding:6px 10px" title="Rename active library">Rename</button>
          <button class="import-btn import-btn-secondary" ${lensActionAttrs('delete-library')} style="font-size:12px;padding:6px 10px" title="Delete active library">Delete</button>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Keep different collections separate — research papers, clinical guides, personal notes. Chat grounds its answers in the active library only.</div>
      </div>
      ` : ''}

      <div id="lens-remote-fields" style="${externalFieldsStyle}">
        <!-- One-command install via curl | bash, served from the landing
             site's Vercel deploy. Hits the same pipx/uv → agent-stack →
             systemd-user-services flow a user would do by hand, just
             scripted. Linux-only for now — the installer degrades on
             macOS/containers (unit files land but don't activate) but
             auto-start is a systemd-only feature. Source is public so
             security-conscious users can audit before running. -->
        <details class="lens-setup-details" style="margin-top:8px;padding:12px 14px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;font-size:12px;color:var(--text-muted);line-height:1.6" open>
          <summary style="cursor:pointer;color:var(--text-primary);font-weight:600;font-size:13px;user-select:none;list-style:none">🚀 New here? One-command setup (Linux)</summary>
          <div style="margin-top:10px">
            <div style="margin-bottom:10px"><strong style="color:var(--text-primary)">1. Install the agent stack:</strong></div>
            <div style="font-family:var(--font-mono,monospace);font-size:11.5px;background:var(--bg-primary);padding:8px 12px;border-radius:4px;color:var(--text-primary);line-height:1.8;overflow-wrap:anywhere">curl -sSL https://getbased.health/install.sh | bash</div>
            <div style="font-size:11px;margin-top:4px;opacity:0.85">Installs via <code style="font-family:var(--font-mono,monospace);font-size:11px">pipx</code> or <code style="font-family:var(--font-mono,monospace);font-size:11px">uv</code> (auto-detected), starts rag + dashboard as systemd user services. <strong>Linux only</strong> — macOS and Windows aren't supported yet (the script installs but services won't auto-start).</div>
          </div>
          <div style="margin-top:14px">
            <div style="margin-bottom:10px"><strong style="color:var(--text-primary)">2. Open the dashboard</strong> — the script prints a <a href="https://docs.getbased.health/guides/interpretive-lens#one-click-login" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline">one-click login URL</a> at the end.</div>
            <div style="font-size:12px;line-height:1.7">
              • <strong>Knowledge</strong> tab — create a library, drop files in, wait for indexing<br>
              • <strong>MCP</strong> tab → <strong>Environment</strong> panel — copy <code style="font-family:var(--font-mono,monospace);font-size:11px">LENS_API_KEY</code>
            </div>
          </div>
          <div style="margin-top:14px">
            <div><strong style="color:var(--text-primary)">3. Paste the bearer</strong> into <em>API key</em> below, hit <em>Save + connect</em>.</div>
          </div>
          <!-- Audit/verification block — the audience is security-conscious
               by definition (they care about grounding health data on their
               own RAG), so curl | bash deserves an honest review-first path
               rather than pretending HTTPS is all anyone needs. -->
          <div style="margin-top:14px;font-size:11px;padding-top:10px;border-top:1px dashed var(--border);line-height:1.55">
            <strong style="color:var(--text-primary)">Cautious?</strong> Read the script first or verify its hash:<br>
            <code style="font-family:var(--font-mono,monospace);font-size:11px;display:inline-block;margin-top:4px">curl -sSL https://getbased.health/install.sh | less</code><br>
            <code style="font-family:var(--font-mono,monospace);font-size:11px;display:inline-block;margin-top:2px">curl -sSL https://getbased.health/install.sh.sha256 | sha256sum -c</code><br>
            <a href="https://github.com/elkimek/get-based-site/blob/main/install.sh" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline">Source on GitHub →</a>
          </div>
          <div style="margin-top:10px;font-size:11px">Already have a server? Skip this and fill in the fields below.</div>
        </details>
        <!-- Display name: only meaningful for external-server, which is a
             remote endpoint rather than a named library. in-browser derives
             the chip label from the active library name. -->
        <div style="margin-top:12px">
          <label style="font-size:12px;color:var(--text-muted)" for="lens-name-input">Display name</label>
          <input type="text" class="api-key-input" id="lens-name-input" value="${escapeAttr(cfg.name)}" placeholder="e.g. Functional Medicine Library" style="margin-top:4px">
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Shown in the chat-header badge when this source is feeding answers.</div>
        </div>
        <div style="margin-top:10px">
          <label style="font-size:12px;color:var(--text-muted)" for="lens-url-input">Endpoint URL</label>
          <input type="text" class="api-key-input" id="lens-url-input" value="${escapeAttr(cfg.url)}" placeholder="http://127.0.0.1:8322/query" style="margin-top:4px">
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Include the <code style="font-family:var(--font-mono,monospace);font-size:11px">/query</code> path — it's the specific endpoint the chat hits, not the server root.</div>
        </div>
        <div style="margin-top:10px">
          <label style="font-size:12px;color:var(--text-muted)" for="lens-key-input">API key</label>
          <input type="password" class="api-key-input" id="lens-key-input" value="${escapeAttr(keySet ? '••••••••' : '')}" placeholder="Bearer token" style="margin-top:4px">
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Paste from the dashboard's <em>MCP → Environment</em> panel, or run <code style="font-family:var(--font-mono,monospace);font-size:11px">lens key</code> in a terminal on the server. Encrypted at rest on this device; never sent to any third party.</div>
        </div>
        <div style="margin-top:10px">
          <label style="font-size:12px;color:var(--text-muted)" for="lens-test-probe-input">Test query</label>
          <input type="text" class="api-key-input" id="lens-test-probe-input" value="${escapeAttr(cfg.testProbe || defaultTestProbe)}" placeholder="${escapeAttr(defaultTestProbe)}" style="margin-top:4px">
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Sent to your endpoint on <strong>Save + connect</strong> to verify the connection. Pick a query your documents should have good matches for.</div>
        </div>
        <!-- Footnote: the panel points at a server; the server's libraries
             are managed in the dashboard. Integrated flow covers this in
             step 3, so the once-separate callout is now a terse reminder. -->
        <div style="margin-top:14px;padding:8px 12px;border-left:3px solid var(--accent);background:var(--bg-secondary);font-size:11.5px;color:var(--text-muted);line-height:1.5">
          Chat grounds on the server's <strong>active library</strong>. Switch or create libraries from the dashboard — this panel only says which server to talk to.
        </div>
      </div>

      <div id="lens-local-fields" style="${browserFieldsStyle}">
        <div id="lens-local-stats" style="margin-top:10px;padding:10px 14px;background:var(--bg-secondary);border-radius:6px;font-size:13px;color:var(--text-muted)">Loading stats…</div>
        <div id="lens-local-drop"
             role="button" tabindex="0"
             aria-label="Add documents — drop files here or press Enter to open the file picker"
             style="margin-top:10px;padding:18px;border:2px dashed var(--border);border-radius:8px;text-align:center;font-size:13px;color:var(--text-muted);cursor:pointer;transition:border-color 0.15s"
             ${lensActionAttrs('open-local-filepick')}>
          <div style="font-size:20px;pointer-events:none" aria-hidden="true">📁</div>
          <div style="margin-top:4px;pointer-events:none">Drop documents or click to add</div>
          <div style="font-size:11px;margin-top:2px;opacity:0.7;pointer-events:none">PDF · Markdown · Text · Word · JSON · ZIP</div>
        </div>
        <input type="file" id="lens-local-filepick" multiple style="display:none" accept=".txt,.md,.markdown,.rst,.json,.csv,.log,.pdf,.docx,.zip">
        <div id="lens-local-progress-wrap" style="display:none;margin-top:8px">
          <progress id="lens-local-progress" value="0" max="100" style="width:100%;height:8px" aria-label="Indexing progress"></progress>
          <div id="lens-local-progress-text" role="status" aria-live="polite" style="font-size:11px;color:var(--text-muted);margin-top:4px"></div>
        </div>
        <div id="lens-local-doc-list" style="margin-top:10px"></div>
      </div>

      <div style="margin-top:10px">
        <label style="font-size:12px;color:var(--text-muted)" for="lens-topk-input">Excerpts per question</label>
        <input type="number" class="api-key-input" id="lens-topk-input" value="${cfg.topK || 5}" min="1" max="10" style="margin-top:4px;width:100px">
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">How many of the most relevant excerpts the AI sees with each chat question.</div>
      </div>

      <div style="margin-top:14px">
        <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer">
          <input type="checkbox" id="lens-multi-query-checkbox" ${cfg.multiQuery !== false ? 'checked' : ''} style="margin-top:3px">
          <span style="font-size:12px;color:var(--text-primary)">
            Improve recall with query rewriting
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;line-height:1.4">
              Before searching, your AI provider rephrases the question to cover Latin names, synonyms, and related terms — so a search for "Black Seed Oil" still finds notes titled "Nigella Sativa". Adds ~1s on the first matching question.
            </div>
          </span>
        </label>
      </div>

      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="import-btn import-btn-primary" ${lensActionAttrs('save-config')}>${isExternal ? 'Save + connect' : 'Save'}</button>
        ${connected ? `<button class="import-btn import-btn-secondary" ${lensActionAttrs('clear-cache')}>Clear cache</button>` : ''}
        ${connected ? `<button class="import-btn import-btn-secondary" ${lensActionAttrs('remove-lens')}>Remove</button>` : ''}
      </div>

      <div class="api-key-notice" style="margin-top:12px">
        ${isBrowser
          ? 'Your documents and questions never leave this device. First use downloads a small AI model (about 100 MB); after that it works offline.'
          : 'Your questions are sent directly to the server you configure. Only connect to servers you control or trust.'}
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
  function openKnowledgeBaseModal() {
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
        <button type="button" class="context-back-btn" ${lensActionAttrs('open-context')} aria-label="Back to Context" title="Back to Context"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
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
    if (e.key === 'Escape') closeKnowledgeBaseModal();
  }

  // Update only the status chip without blowing away input fields
  function _updateLensStatusChip() {
    const chip = document.getElementById('lens-status-chip');
    if (!chip) return;
    const cfg = getLensConfig();
    const keySet = !!getLensKey();
    const isBrowser = cfg.backend === 'in-browser';
    const connected = isBrowser || (cfg.backend === 'external-server' && cfg.url && keySet);
    const status = getLensStatus();
    const statusChip = !connected
      ? '<span style="color:var(--text-muted)">Not connected</span>'
      : status.state === 'error'
        ? `<span style="color:#fbbf24">&#9888; Error${cfg.name ? ' · ' + escapeHTML(cfg.name) : ''}</span>`
        : cfg.enabled
          ? `<span style="color:var(--green)">&#10003; Connected${cfg.name ? ' · ' + escapeHTML(cfg.name) : ''}</span>`
          : `<span style="color:var(--text-muted)">Configured (disabled)</span>`;
    const lastInfo = status.state === 'error' && status.lastError
      ? `<div style="font-size:11px;color:#fbbf24;margin-top:4px">Last error: ${escapeHTML(status.lastError)}</div>`
      : connected && status.lastChunkCount
        ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">Last query: ${status.lastChunkCount} excerpt${status.lastChunkCount !== 1 ? 's' : ''}${status.sourceName ? ' from ' + escapeHTML(status.sourceName) : ''}</div>`
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
      showNotification('Saved. Your documents stay on this device.', 'success');
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
    updateLensIndicator();
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

  // Module-level cache of the most recent in-browser lens stats. Used by
  // getLensSummary() so the dashboard's Knowledge Base row can render
  // synchronously without re-awaiting the worker on every paint. Refreshed
  // every time _loadLocalLensStats() runs successfully.
  let _lastLocalStats = null;

  async function _loadLocalLensStats() {
    const stats = document.getElementById('lens-local-stats');
    const list = document.getElementById('lens-local-doc-list');
    // Even when no Settings panel is open we still want the cache hot for
    // the dashboard summary — keep going if the DOM nodes aren't present.
    try {
      const lens = await _getLocalLens();
      const s = await lens.getStats();
      _lastLocalStats = s;
      // Notify dashboard listeners that summary numbers may have changed.
      updateLensStatus({});
      if (!stats) return;
      if (s.total_chunks === 0) {
        stats.innerHTML = '<span style="color:var(--text-muted)">No documents indexed yet.</span>';
      } else {
        const modelLabel = /minilm/i.test(s.model)
          ? `MiniLM · ${s.dim}-dim`
          : /bge-m3/i.test(s.model) ? `BGE-M3 · ${s.dim}-dim` : `${s.model} · ${s.dim}-dim`;
        // Surface the active transformers.js backend. WebGPU is 3-10× faster
        // than WASM for embedding inference; showing it makes the speed gap
        // legible to users debugging "why is my query slow" and advertises
        // the upgrade path (switch to a modern Chrome for WebGPU).
        const backendLabel = s.backend === 'webgpu' ? 'WebGPU' : 'WASM';
        stats.innerHTML = `<span style="color:var(--green)">&#9679;</span> ${s.total_chunks.toLocaleString()} excerpt${s.total_chunks !== 1 ? 's' : ''} from ${s.documents.length} document${s.documents.length !== 1 ? 's' : ''} · <span title="${escapeAttr(s.model)}">${escapeHTML(backendLabel)} · ${escapeHTML(modelLabel)}</span>`;
      }
      if (list) list.innerHTML = _renderLocalDocList(s.documents);
      _attachLocalLensDropHandlers();
    } catch (e) {
      if (stats) stats.innerHTML = `<span style="color:#fbbf24">Failed to load stats: ${escapeHTML(e?.message || String(e))}</span>`;
    }
  }

  // Synchronous summary used by the dashboard Knowledge Base row.
  // Returns enough to render a one-line status without awaiting the
  // worker. Numbers are best-effort — if no successful stats fetch has
  // happened yet, docCount/chunkCount come back as null and the caller
  // can render a softer "loading…" affordance.
  function getLensSummary() {
    const cfg = getLensConfig();
    const configured = hasLens();
    const aiAvailable = hasAIProvider();
    const summary = {
      configured,
      backend: cfg.backend,
      enabled: !!cfg.enabled,
      multiQueryOn: configured && aiAvailable && cfg.multiQuery !== false,
      aiAvailable,
      displayName: '',
      docCount: null,
      chunkCount: null,
    };
    if (cfg.backend === 'in-browser') {
      summary.displayName = (cfg.name || '').trim() || 'My Library';
      // Only surface doc/chunk counts when there's actually a configured
      // library — otherwise stale cache from a prior session would leak
      // numbers into the dashboard's empty-state stub.
      if (configured && _lastLocalStats) {
        summary.docCount = Array.isArray(_lastLocalStats.documents) ? _lastLocalStats.documents.length : null;
        summary.chunkCount = typeof _lastLocalStats.total_chunks === 'number' ? _lastLocalStats.total_chunks : null;
      }
    } else {
      // external-server: take the user-named label, or fall back to the URL host
      let label = (cfg.name || '').trim();
      if (!label && cfg.url) {
        try { label = new URL(cfg.url).host; } catch { label = cfg.url; }
      }
      summary.displayName = label || 'Knowledge Base';
    }
    return summary;
  }

  function _renderLocalDocList(docs) {
    if (!docs || docs.length === 0) return '';
    const rows = docs.map((d) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid var(--border);font-size:12px">
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeAttr(d.source)}">${escapeHTML(d.source)}</span>
        <span style="color:var(--text-muted);margin:0 10px;font-variant-numeric:tabular-nums">${d.chunks}</span>
        <button class="kb-doc-delete" ${lensActionAttrs('delete-doc', { source: d.source })} aria-label="Delete ${escapeAttr(d.source)}" title="Delete" style="background:transparent;border:0;color:var(--text-muted);cursor:pointer;font-size:16px;padding:2px 6px">×</button>
      </div>
    `).join('');
    return `
      <div style="margin-top:4px;max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:6px">${rows}</div>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="import-btn import-btn-secondary" ${lensActionAttrs('clear-local')} style="font-size:12px;padding:4px 10px">Clear all</button>
      </div>
    `;
  }

  function _attachLocalLensDropHandlers() {
    const drop = document.getElementById('lens-local-drop');
    const picker = document.getElementById('lens-local-filepick');
    if (!(drop instanceof HTMLElement) || !(picker instanceof HTMLInputElement)) return;
    if (drop.dataset.wired === '1') return;
    drop.dataset.wired = '1';
    drop.addEventListener('dragenter', (e) => { e.preventDefault(); drop.style.borderColor = 'var(--accent)'; });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.style.borderColor = 'var(--accent)'; });
    drop.addEventListener('dragleave', () => { drop.style.borderColor = 'var(--border)'; });
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.style.borderColor = 'var(--border)'; _handleLocalLensIngest(e.dataTransfer?.files); });
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
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    pill.style.cssText = [
      'position:fixed',
      'bottom:88px',
      'right:20px',
      'z-index:9999',
      'min-width:260px',
      'max-width:360px',
      'padding:12px 14px',
      'background:var(--bg-elev, #1e1e1e)',
      'border:1px solid var(--border, #333)',
      'border-radius:12px',
      'box-shadow:var(--shadow-lg, 0 8px 32px rgba(0,0,0,0.4))',
      'font-size:12px',
      'color:var(--text-primary, #eee)',
      'pointer-events:auto',
    ].join(';');
    pill.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px">
        <strong style="font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:var(--text-muted,#888)">Indexing knowledge base</strong>
        <button id="lens-ingest-pill-dismiss" title="Hide (ingest keeps running)" style="background:none;border:none;color:var(--text-muted,#888);cursor:pointer;padding:0 4px;font-size:16px;line-height:1">&times;</button>
      </div>
      <div id="lens-ingest-pill-text" style="margin-bottom:8px;font-size:12px;color:var(--text-secondary,#bbb);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Preparing…</div>
      <progress id="lens-ingest-pill-bar" value="0" max="1" style="width:100%;height:6px;margin-bottom:8px"></progress>
      <button id="lens-ingest-pill-cancel" style="width:100%;padding:6px;background:transparent;border:1px solid var(--border,#333);border-radius:6px;color:var(--text-secondary,#bbb);font-size:11px;cursor:pointer">Cancel</button>
    `;
    document.body.appendChild(pill);
    const dismiss = /** @type {HTMLButtonElement | null} */ (pill.querySelector('#lens-ingest-pill-dismiss'));
    const cancel = /** @type {HTMLButtonElement | null} */ (pill.querySelector('#lens-ingest-pill-cancel'));
    dismiss?.addEventListener('click', () => {
      pill.style.display = 'none';
    });
    cancel?.addEventListener('click', async () => {
      cancel.disabled = true;
      cancel.textContent = 'Cancelling…';
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

    const pill = _ensureIngestPill();
    pill.style.display = '';
    const pillText = /** @type {HTMLElement | null} */ (pill.querySelector('#lens-ingest-pill-text'));
    const pillBar = /** @type {HTMLProgressElement | null} */ (pill.querySelector('#lens-ingest-pill-bar'));
    if (!pillText || !pillBar) return;
    pillText.textContent = 'Reading files…';

    // Parse main-thread, hand text to worker (see lens-local-parsers.js for
    // why: module worker can't cleanly import the UMD parser bundles).
    const { extractFromFile } = await import('./lens-local-parsers.js');
    const files = [];
    for (const f of incoming) {
      try {
        const extracted = await extractFromFile(f);
        for (const e of extracted) files.push(e);
      } catch (err) { console.warn('[lens-local] extract failed:', f.name, err); }
    }
    if (files.length === 0) {
      pillText.textContent = 'No usable files.';
      setTimeout(() => _removeIngestPill(), 3000);
      return;
    }

    const lens = await _getLocalLens();
    const { subscribeProgress } = await import('./lens-local.js');
    const t0 = performance.now();
    const unsub = subscribeProgress((p) => {
      // Re-query the in-modal elements on every event so a mid-ingest
      // Settings reopen (which rerenders innerHTML) rebinds cleanly to
      // the new DOM nodes instead of updating detached ones.
      const modalBar = /** @type {HTMLProgressElement | null} */ (document.getElementById('lens-local-progress'));
      const modalText = document.getElementById('lens-local-progress-text');
      const modalWrap = /** @type {HTMLElement | null} */ (document.getElementById('lens-local-progress-wrap'));
      if (modalWrap) modalWrap.style.display = '';
      if (p.stage === 'start') {
        pillBar.max = p.total; pillBar.value = 0;
        pillText.textContent = `Preparing ${p.total} excerpts…`;
        if (modalBar) modalBar.max = p.total;
        if (modalText) modalText.textContent = `Preparing ${p.total} excerpts across ${files.length} file${files.length !== 1 ? 's' : ''}…`;
      } else if (p.stage === 'embed') {
        const rate = p.index / ((performance.now() - t0) / 1000);
        pillBar.max = p.total;
        pillBar.value = p.index;
        pillText.textContent = `${p.index}/${p.total} · ${rate.toFixed(1)}/s`;
        // Set max on every tick — when Settings is reopened mid-ingest the
        // fresh <progress> markup starts at max=100, so without this the
        // bar jumps to 100% even at small p.index values.
        if (modalBar) { modalBar.max = p.total; modalBar.value = p.index; }
        if (modalText) modalText.textContent = `Indexing ${p.index}/${p.total} · ${rate.toFixed(1)}/s · ${p.source}`;
      }
    });
    lensWindow._lensIngestRunning = true;
    try {
      const stats = await lens.ingest(files);
      const dur = ((performance.now() - t0) / 1000).toFixed(1);
      const planned = stats.chunks_planned ?? stats.chunks_indexed;
      const doneMsg = stats.cancelled
        ? `Cancelled — indexed ${stats.chunks_indexed} of ${planned} excerpts in ${dur}s.`
        : `Indexed ${stats.chunks_indexed} excerpts from ${stats.files_seen} file${stats.files_seen !== 1 ? 's' : ''} in ${dur}s.`;
      pillText.textContent = doneMsg;
      const modalText = document.getElementById('lens-local-progress-text');
      if (modalText) modalText.textContent = doneMsg;
      showNotification(doneMsg, stats.cancelled ? 'info' : 'success');
    } catch (e) {
      const errMsg = `Couldn't index: ${e.message || e}`;
      pillText.textContent = errMsg;
      const modalText = document.getElementById('lens-local-progress-text');
      if (modalText) modalText.textContent = errMsg;
      showNotification(errMsg, 'error');
    } finally {
      lensWindow._lensIngestRunning = false;
      unsub();
      setTimeout(() => {
        _removeIngestPill();
        const modalWrap = document.getElementById('lens-local-progress-wrap');
        if (modalWrap) modalWrap.style.display = 'none';
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
        showNotification(`Removed ${deleted} excerpt${deleted !== 1 ? 's' : ''}.`, 'success');
        await _loadLocalLensStats();
      } catch (e) {
        showNotification(`Couldn't delete that document: ${e?.message || e}.`, 'error');
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
        showNotification(`Couldn't clear the knowledge base: ${e?.message || e}.`, 'error');
      }
    }
  }

  const lensLibraryHandlers = createLensLibraryHandlers({
    getLensConfig,
    getLocalLens: _getLocalLens,
    clearLensCache,
    saveLensConfig,
    updateLensIndicator,
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
    updateLensIndicator();
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
    getLensSummary,
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
