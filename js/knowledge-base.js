// knowledge-base.js — Local Knowledge Base UI for the desktop app.
// Browser builds: all functions early-return; entire UI section is hidden.
//
// User-facing flow:
//   1. Settings → AI → Local Knowledge Base
//   2. If setup not done: see brief explainer + "Set up engine" button
//   3. After setup: drag/drop docs OR click to add via OS file picker
//   4. Indexed docs listed with delete buttons
//   5. "Auto-configure Custom Knowledge Source" button wires the local lens
//      into the existing Custom Knowledge Source settings in one click

import { showNotification } from './utils.js';

// ─── Tauri detection ─────────────────────────────────────────────
function isTauri() {
  return !!(window.__TAURI_INTERNALS__);
}

async function invoke(cmd, args = {}) {
  if (!isTauri()) return null;
  return window.__TAURI_INTERNALS__.invoke(cmd, args);
}

export function isKnowledgeBaseAvailable() {
  return isTauri();
}

// ─── State ───────────────────────────────────────────────────────
let _state = {
  setupComplete: false,
  setupRunning: false,
  setupPhase: null,    // SetupPhase from Tauri (object with phase tag)
  setupGpu: null,
  stats: { total_chunks: 0, documents: [] },
  ingesting: false,
  loading: false,
};
let _setupPollTimer = null;

// ─── HTML escape ─────────────────────────────────────────────────
function _esc(s) {
  if (s === null || s === undefined) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

// ─── Data fetching ───────────────────────────────────────────────
async function fetchSetupStatus() {
  try {
    const status = await invoke('get_setup_status');
    return status;
  } catch (e) {
    console.warn('[KB] setup status failed:', e);
    return null;
  }
}

async function fetchStats() {
  try {
    return await invoke('get_knowledge_stats');
  } catch (e) {
    console.warn('[KB] stats failed:', e);
    return { total_chunks: 0, documents: [] };
  }
}

// ─── Setup integration (start setup + poll progress within KB section) ──
export async function startKbSetup() {
  if (!isTauri()) return;
  _state.setupRunning = true;
  _renderSection();
  try {
    await invoke('run_setup');
  } catch (e) {
    showNotification(`Setup failed to start: ${e}`, 'error');
    _state.setupRunning = false;
    _renderSection();
    return;
  }
  // Start polling for progress
  if (_setupPollTimer) clearInterval(_setupPollTimer);
  _setupPollTimer = setInterval(_pollSetupProgress, 1000);
  _pollSetupProgress();
}

async function _pollSetupProgress() {
  try {
    const status = await fetchSetupStatus();
    if (!status) return;
    _state.setupPhase = status.phase;
    _state.setupGpu = status.gpu;
    const phaseTag = (status.phase && status.phase.phase) || status.phase;
    if (phaseTag === 'completed') {
      _state.setupRunning = false;
      _state.setupComplete = true;
      clearInterval(_setupPollTimer);
      _setupPollTimer = null;
      _state.stats = await fetchStats();
      showNotification('Local knowledge engine ready', 'success');
    } else if (phaseTag === 'failed') {
      _state.setupRunning = false;
      clearInterval(_setupPollTimer);
      _setupPollTimer = null;
      const err = (status.phase && status.phase.error) || 'unknown';
      showNotification(`Setup failed: ${err}`, 'error');
    }
    _renderSection();
  } catch (e) {
    console.warn('[KB] poll failed:', e);
  }
}

function _phaseLabel(phase) {
  if (!phase) return 'Starting…';
  const tag = phase.phase || phase;
  const pct = phase.progress != null ? ` (${Math.round(phase.progress * 100)}%)` : '';
  switch (tag) {
    case 'not_started': return 'Starting…';
    case 'detecting_gpu': return '🖥️ Detecting GPU…';
    case 'downloading_python': return `📥 Downloading Python${pct}`;
    case 'installing_lens': return `📦 Installing engine${pct}`;
    case 'downloading_onnx_runtime': return `⚡ Downloading ${phase.provider || 'ONNX'} runtime${pct}`;
    case 'downloading_model': return `🧠 Downloading ${phase.name || 'model'}${pct}`;
    case 'completed': return '✅ Setup complete';
    case 'failed': return `❌ Failed: ${phase.error || 'unknown'}`;
    default: return String(tag);
  }
}

function _phaseProgress(phase) {
  if (!phase || typeof phase === 'string') return 0;
  return phase.progress || 0;
}

// ─── Auto-configure Custom Knowledge Source ──────────────────────
export async function autoConfigureCustomLens() {
  if (!isTauri()) return;
  try {
    const cfg = await invoke('get_lens_config');
    if (!cfg || !cfg.url || !cfg.api_key) {
      showNotification('Failed to get lens config — is setup complete?', 'error');
      return;
    }
    // Fill in the Custom Knowledge Source fields and save
    if (window.saveLensConfig && window.saveLensKey) {
      window.saveLensConfig({
        name: 'Local Knowledge Base',
        url: cfg.url,
        topK: cfg.top_k || 5,
        enabled: true,
      });
      await window.saveLensKey(cfg.api_key);
      // Re-render the lens settings section to reflect new config
      const section = document.getElementById('custom-lens-section');
      if (section && window.renderCustomLensSection) {
        section.innerHTML = window.renderCustomLensSection();
      }
      // Update chat header indicator
      if (window.updateLensIndicator) window.updateLensIndicator();
      showNotification('Custom Knowledge Source connected to local engine', 'success');
    } else {
      showNotification('Lens module not available — try refreshing', 'error');
    }
  } catch (e) {
    showNotification(`Auto-configure failed: ${e}`, 'error');
  }
}

// ─── File ingest (drag & drop + click) ───────────────────────────
async function pickFiles() {
  if (!isTauri()) return [];
  try {
    // Tauri's dialog plugin
    const { open } = await import('https://unpkg.com/@tauri-apps/plugin-dialog@2/dist/index.js')
      .catch(() => ({ open: null }));
    if (!open) {
      // Fallback: HTML file input. Tauri dialog plugin not loaded.
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.txt,.md,.markdown,.rst,.json,.pdf,.docx';
        input.onchange = () => {
          const files = Array.from(input.files || []);
          resolve(files.map(f => f.path).filter(Boolean));
        };
        input.click();
      });
    }
    const selected = await open({
      multiple: true,
      directory: false,
      filters: [
        { name: 'Documents', extensions: ['txt', 'md', 'markdown', 'rst', 'json', 'pdf', 'docx'] },
      ],
    });
    if (!selected) return [];
    return Array.isArray(selected) ? selected : [selected];
  } catch (e) {
    console.warn('[KB] file picker failed:', e);
    return [];
  }
}

async function pickFolder() {
  if (!isTauri()) return null;
  try {
    const { open } = await import('https://unpkg.com/@tauri-apps/plugin-dialog@2/dist/index.js')
      .catch(() => ({ open: null }));
    if (!open) return null;
    const selected = await open({ directory: true, multiple: false });
    return selected || null;
  } catch (e) {
    return null;
  }
}

export async function handleAddFiles() {
  if (!isTauri() || _state.ingesting) return;
  const paths = await pickFiles();
  if (!paths || paths.length === 0) return;
  await runIngest(paths);
}

export async function handleAddFolder() {
  if (!isTauri() || _state.ingesting) return;
  const folder = await pickFolder();
  if (!folder) return;
  await runIngest([folder]);
}

async function runIngest(paths) {
  _state.ingesting = true;
  _renderSection();
  try {
    const result = await invoke('ingest_documents', { req: { paths } });
    if (!result) return;
    const skipped = (result.skipped || []).length;
    if (result.chunks_indexed === 0) {
      showNotification(
        skipped > 0
          ? `Indexed 0 chunks from ${result.files_seen} files (${skipped} skipped — unsupported or too short)`
          : 'No content found in selected files (try larger documents)',
        'info'
      );
    } else {
      showNotification(
        `Indexed ${result.chunks_indexed} chunks from ${result.files_seen} file${result.files_seen !== 1 ? 's' : ''}`,
        'success'
      );
    }
    // Refresh stats
    _state.stats = await fetchStats();
  } catch (e) {
    showNotification(`Ingest failed: ${e}`, 'error');
  } finally {
    _state.ingesting = false;
    _renderSection();
  }
}

export async function handleDeleteDocument(source) {
  if (!isTauri()) return;
  if (!confirm(`Delete "${source}" from your knowledge base? This removes all chunks indexed from it.`)) {
    return;
  }
  try {
    const deleted = await invoke('delete_document', { source });
    showNotification(`Removed ${deleted} chunks for ${source}`, 'success');
    _state.stats = await fetchStats();
    _renderSection();
  } catch (e) {
    showNotification(`Delete failed: ${e}`, 'error');
  }
}

// ─── Drag & drop wiring ──────────────────────────────────────────
function _attachDropHandlers() {
  const zone = document.getElementById('kb-drop-zone');
  if (!zone || zone.dataset.dropAttached) return;
  zone.dataset.dropAttached = '1';

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('kb-drop-zone-active');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('kb-drop-zone-active'));
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.classList.remove('kb-drop-zone-active');
    if (!isTauri()) return;
    // Tauri exposes file paths via dataTransfer.files (with .path on each File)
    const files = Array.from(e.dataTransfer?.files || []);
    const paths = files.map(f => f.path).filter(Boolean);
    if (paths.length > 0) {
      await runIngest(paths);
    }
  });
}

// ─── UI rendering ────────────────────────────────────────────────
export function renderKnowledgeBaseSection() {
  if (!isTauri()) return '';

  // Trigger async data load + re-render once data lands
  if (!_state.loading && !_state.ingesting) {
    _state.loading = true;
    Promise.all([fetchSetupStatus(), fetchStats()]).then(([status, stats]) => {
      _state.setupComplete = !!status && !status.is_first_run;
      _state.stats = stats;
      _state.loading = false;
      _renderSection();
      requestAnimationFrame(_attachDropHandlers);
    });
  }

  return _innerHtml();
}

function _renderSection() {
  const section = document.getElementById('knowledge-base-section');
  if (section) {
    section.innerHTML = _innerHtml();
    requestAnimationFrame(_attachDropHandlers);
  }
}

function _innerHtml() {
  if (_state.loading) {
    return `<div class="ai-provider-panel"><div class="ai-provider-desc">Loading knowledge base…</div></div>`;
  }

  // Setup currently running — show progress
  if (_state.setupRunning) {
    const pct = _phaseProgress(_state.setupPhase);
    const gpuLine = _state.setupGpu
      ? `<div style="font-size:12px;color:var(--text-muted);margin-top:8px">Hardware: ${_esc(_state.setupGpu.name || 'detecting…')}${_state.setupGpu.recommended_provider ? ' · ' + _esc(_state.setupGpu.recommended_provider) : ''}</div>`
      : '';
    return `<div class="ai-provider-panel">
      <div class="ai-provider-desc">Setting up local knowledge engine — this is a one-time download.</div>
      <div style="margin-top:10px;font-size:13px;color:var(--text-muted)">${_esc(_phaseLabel(_state.setupPhase))}</div>
      <div style="margin-top:8px;background:var(--bg-secondary);border-radius:6px;overflow:hidden;height:8px">
        <div style="height:100%;width:${Math.max(pct * 100, 5)}%;background:var(--accent);transition:width 0.5s ease;border-radius:6px"></div>
      </div>
      ${gpuLine}
    </div>`;
  }

  // Setup not done — invite to start
  if (!_state.setupComplete) {
    return `<div class="ai-provider-panel">
      <div class="ai-provider-desc">
        Run an AI knowledge engine on your computer. Add your own documents
        (research papers, clinical guides, notes) and the chat AI will reference
        them when answering your health questions.
      </div>
      <div style="font-size:13px;color:var(--text-muted);margin:10px 0">
        First-time setup downloads ~3 GB (Python runtime + AI engine + embedding model).
        Takes 5–15 min. Runs fully offline after.
      </div>
      <button class="import-btn import-btn-primary" onclick="startKbSetup()">
        Set up engine
      </button>
    </div>`;
  }

  // Setup done — show stats + drop zone + doc list + auto-config
  const stats = _state.stats || { total_chunks: 0, documents: [] };
  const docCount = stats.documents.length;
  const chunkCount = stats.total_chunks;

  const statsLine = chunkCount === 0
    ? `<span style="color:var(--text-muted)">No documents indexed yet</span>`
    : `<span style="color:var(--green)">●</span> ${chunkCount} chunk${chunkCount !== 1 ? 's' : ''} from ${docCount} document${docCount !== 1 ? 's' : ''}`;

  const dropZoneState = _state.ingesting ? 'kb-drop-zone-busy' : '';
  const dropZoneContent = _state.ingesting
    ? `<span class="kb-spinner" aria-hidden="true"></span> Indexing…`
    : `<div style="font-size:24px;line-height:1">📁</div>
       <div style="font-weight:500;margin-top:4px">Drop documents here or click to add</div>
       <div style="font-size:11px;color:var(--text-muted);margin-top:2px">PDF · Markdown · Text · Word · JSON</div>`;

  const docList = chunkCount === 0
    ? ''
    : `<div style="margin-top:14px">
        <div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Indexed documents</div>
        <div class="kb-doc-list">
          ${stats.documents.map(d => `
            <div class="kb-doc-row">
              <span class="kb-doc-icon">📄</span>
              <span class="kb-doc-name">${_esc(d.source)}</span>
              <span class="kb-doc-chunks">${d.chunks} chunk${d.chunks !== 1 ? 's' : ''}</span>
              <button class="kb-doc-delete" onclick="handleDeleteDocument('${_esc(d.source).replace(/'/g, "\\'")}')" aria-label="Remove ${_esc(d.source)}" title="Remove">×</button>
            </div>
          `).join('')}
        </div>
      </div>`;

  return `<div class="ai-provider-panel">
    <div class="ai-provider-desc">
      Add documents to your local knowledge base. The AI references them when
      answering health questions.
    </div>
    <div style="margin-top:10px;font-size:13px">${statsLine}</div>

    <div id="kb-drop-zone" class="kb-drop-zone ${dropZoneState}" onclick="handleAddFiles()">
      ${dropZoneContent}
    </div>

    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
      <button class="import-btn import-btn-secondary" onclick="handleAddFiles()" ${_state.ingesting ? 'disabled' : ''}>Add files…</button>
      <button class="import-btn import-btn-secondary" onclick="handleAddFolder()" ${_state.ingesting ? 'disabled' : ''}>Add folder…</button>
    </div>

    ${docList}

    <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border)">
      <button class="import-btn import-btn-primary" onclick="autoConfigureCustomLens()">
        ⚡ Auto-configure Custom Knowledge Source
      </button>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px">
        Connects the chat AI to this local engine in one click. After clicking,
        the Custom Knowledge Source section above is filled in and enabled.
      </div>
    </div>
  </div>`;
}

// ─── Window exports ──────────────────────────────────────────────
Object.assign(window, {
  isKnowledgeBaseAvailable,
  renderKnowledgeBaseSection,
  handleAddFiles,
  handleAddFolder,
  handleDeleteDocument,
  autoConfigureCustomLens,
  startKbSetup,
});
