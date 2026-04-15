// setup.js — First-run setup UI for Tauri-managed Lens installation
// Detects if running inside Tauri, shows GPU info + download progress

import { showNotification } from './utils.js';

// ─── Tauri API detection ────────────────────────────────────────
// When running inside Tauri, window.__TAURI__ is available.
function isTauri() {
  return !!(window.__TAURI_INTERNALS__);
}

async function invoke(cmd, args = {}) {
  if (!isTauri()) return null;
  return window.__TAURI_INTERNALS__.invoke(cmd, args);
}

// ─── Setup state ────────────────────────────────────────────────
let _setupState = null;
let _polling = false;
let _pollTimer = null;

export function isSetupAvailable() {
  return isTauri();
}

export async function fetchSetupStatus() {
  if (!isTauri()) return null;
  try {
    _setupState = await invoke('get_setup_status');
    return _setupState;
  } catch (e) {
    console.warn('[Setup] Failed to fetch status:', e);
    return null;
  }
}

export async function fetchGpuInfo() {
  if (!isTauri()) return null;
  try {
    return await invoke('detect_gpu');
  } catch (e) {
    console.warn('[Setup] GPU detection failed:', e);
    return null;
  }
}

// ─── Polling ────────────────────────────────────────────────────
function startPolling(onUpdate) {
  if (_polling) return;
  _polling = true;
  const poll = async () => {
    if (!_polling) return;
    const status = await fetchSetupStatus();
    if (onUpdate) onUpdate(status);
    if (status && status.phase !== 'completed' && status.phase !== 'failed') {
      _pollTimer = setTimeout(poll, 1000);
    } else {
      _polling = false;
    }
  };
  poll();
}

function stopPolling() {
  _polling = false;
  if (_pollTimer) clearTimeout(_pollTimer);
}

// ─── Actions ────────────────────────────────────────────────────
export async function startSetup() {
  if (!isTauri()) return;
  stopPolling();
  try {
    await invoke('run_setup');
  } catch (e) {
    console.error('[Setup] Failed:', e);
    showNotification(`Setup failed: ${e}`, 'error');
    return;
  }
  // Start polling for progress
  startPolling((status) => {
    _updateSetupUI(status);
    if (status?.phase === 'completed') {
      showNotification('Lens setup complete! You can now start the knowledge source.', 'success');
      stopPolling();
      // Re-render the full settings to show the Lens config panel
      const section = document.getElementById('setup-lens-section');
      if (section) section.innerHTML = renderSetupSection();
    } else if (status?.phase === 'failed') {
      showNotification(`Setup failed: ${status.phase.error || 'unknown error'}`, 'error');
      stopPolling();
    }
  });
}

export async function resetSetup() {
  if (!isTauri()) return;
  try {
    await invoke('reset_setup');
    showNotification('Setup reset — will re-download on next start', 'info');
    const section = document.getElementById('setup-lens-section');
    if (section) section.innerHTML = renderSetupSection();
  } catch (e) {
    showNotification(`Reset failed: ${e}`, 'error');
  }
}

// ─── UI Rendering ───────────────────────────────────────────────
function _phaseLabel(phase) {
  if (!phase) return 'Unknown';
  if (typeof phase === 'string') return phase;
  // Phase is an object with a "phase" tag from serde
  switch (phase.phase || phase) {
    case 'not_started': return 'Not started';
    case 'detecting_gpu': return '🖥️ Detecting GPU…';
    case 'downloading_python': return `📥 Downloading Python ${phase.progress ? `(${Math.round(phase.progress * 100)}%)` : ''}`;
    case 'installing_lens': return `📦 Installing Lens ${phase.progress ? `(${Math.round(phase.progress * 100)}%)` : ''}`;
    case 'downloading_onnx_runtime': return `⚡ Downloading ${phase.provider || 'ONNX Runtime'} ${phase.progress ? `(${Math.round(phase.progress * 100)}%)` : ''}`;
    case 'downloading_model': return `🧠 Downloading ${phase.name || 'BGE-M3 model'} ${phase.progress ? `(${Math.round(phase.progress * 100)}%)` : ''}`;
    case 'completed': return '✅ Setup complete';
    case 'failed': return `❌ Failed: ${phase.error || 'unknown'}`;
    default: return String(phase);
  }
}

function _phaseProgress(phase) {
  if (!phase || typeof phase === 'string') return 0;
  return phase.progress || 0;
}

function _gpuBadge(gpu) {
  if (!gpu) return '<span style="color:var(--text-muted)">No GPU detected — CPU inference</span>';
  const vendorColors = {
    nvidia: '#76b900', amd: '#ed1c24', intel: '#0071c5', apple: '#a2aaad',
  };
  const color = vendorColors[gpu.vendor] || 'var(--text-muted)';
  const runtime = gpu.runtime_installed ? ' ✓' : ' (runtime not installed)';
  return `<span style="color:${color};font-weight:600">${_esc(gpu.name)}</span>` +
    (gpu.vram_mb ? ` <span style="color:var(--text-muted)">${gpu.vram_mb} MB VRAM</span>` : '') +
    `<span style="color:var(--text-muted);font-size:11px"> · ${_esc(gpu.recommended_provider)}${runtime}</span>`;
}

function _esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function _updateSetupUI(status) {
  const progress = document.getElementById('setup-progress-bar');
  const label = document.getElementById('setup-phase-label');
  if (progress && status?.phase) {
    const pct = _phaseProgress(status.phase);
    progress.style.width = `${Math.max(pct * 100, 5)}%`;
  }
  if (label && status?.phase) {
    label.innerHTML = _phaseLabel(status.phase);
  }
}

export function renderSetupSection() {
  if (!isTauri()) return '';

  // We'll populate async after mount
  const html = `<div class="ai-provider-panel" id="setup-lens-panel">
    <div class="ai-provider-desc">
      <strong>One-Click Knowledge Source Setup</strong><br>
      Download everything needed for local AI-powered knowledge retrieval — no terminal or manual configuration needed.
      The app will download Python, the Lens RAG engine, ONNX Runtime (GPU-accelerated), and the BGE-M3 embedding model.
    </div>
    <div id="setup-gpu-info" style="margin-top:8px;font-size:13px">Detecting GPU…</div>
    <div style="margin-top:10px">
      <div id="setup-phase-label" style="font-size:13px;color:var(--text-muted)">Checking setup status…</div>
      <div style="margin-top:6px;background:var(--bg-secondary,#1a1a2e);border-radius:6px;overflow:hidden;height:8px">
        <div id="setup-progress-bar" style="height:100%;width:0%;background:var(--accent,#6c63ff);transition:width 0.5s ease;border-radius:6px"></div>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="import-btn import-btn-primary" id="setup-start-btn" onclick="handleStartSetup()">Start Setup</button>
      <button class="import-btn import-btn-secondary" id="setup-reset-btn" onclick="handleResetSetup()" style="display:none">Reset</button>
    </div>
  </div>`;

  // Populate async
  requestAnimationFrame(_populateSetupData);
  return html;
}

async function _populateSetupData() {
  const gpuEl = document.getElementById('setup-gpu-info');
  const phaseLabel = document.getElementById('setup-phase-label');
  const startBtn = document.getElementById('setup-start-btn');
  const resetBtn = document.getElementById('setup-reset-btn');

  const [gpu, status] = await Promise.all([fetchGpuInfo(), fetchSetupStatus()]);

  if (gpuEl) gpuEl.innerHTML = _gpuBadge(gpu);

  if (status) {
    if (phaseLabel) phaseLabel.innerHTML = _phaseLabel(status.phase);
    if (status.is_first_run) {
      if (startBtn) startBtn.style.display = '';
    } else {
      // Already set up
      if (startBtn) { startBtn.textContent = '✓ Already set up'; startBtn.disabled = true; }
      if (resetBtn) resetBtn.style.display = '';
      const progress = document.getElementById('setup-progress-bar');
      if (progress) progress.style.width = '100%';
    }
  }
}

// ─── Window exports ─────────────────────────────────────────────
export async function handleStartSetup() {
  const btn = document.getElementById('setup-start-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Setting up…'; }
  await startSetup();
}

export function handleResetSetup() {
  resetSetup();
}

// ─── Auto-prompt on first Tauri launch ──────────────────────────
// Shows a one-time modal so users don't have to dig into Settings.
async function maybeAutoPromptOnFirstLaunch() {
  if (!isTauri()) return;
  try {
    const status = await fetchSetupStatus();
    if (!status || !status.is_first_run) return;
    // Already shown this launch? (handle dev hot-reload)
    if (window._lensSetupPromptShown) return;
    window._lensSetupPromptShown = true;

    showFirstRunModal(status);
  } catch (e) {
    console.warn('[Setup] Auto-prompt skipped:', e);
  }
}

function showFirstRunModal(status) {
  if (document.getElementById('lens-firstrun-modal')) return;
  const gpuLine = status.gpu
    ? `<div style="font-size:13px;color:var(--text-muted);margin-top:8px">${_gpuBadge(status.gpu)}</div>`
    : '';
  const html = `
    <div id="lens-firstrun-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center" role="dialog" aria-modal="true" aria-label="First-run setup">
      <div style="background:var(--bg-secondary);border-radius:12px;max-width:520px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,0.5)">
        <h2 style="margin-top:0;font-size:20px">Welcome to getbased</h2>
        <p style="color:var(--text-muted);font-size:14px;line-height:1.5">
          To run AI-powered knowledge retrieval locally on your hardware, getbased needs to download some components on first launch:
        </p>
        <ul style="font-size:13px;color:var(--text-muted);line-height:1.7">
          <li>Python runtime (~50 MB)</li>
          <li>Lens RAG engine + ONNX Runtime (~400 MB)</li>
          <li>BGE-M3 embedding model (~2 GB)</li>
        </ul>
        <p style="font-size:13px;color:var(--text-muted)">
          Total ~3 GB · 5–15 min depending on connection. Runs fully offline after.
        </p>
        ${gpuLine}
        <div style="display:flex;gap:8px;margin-top:20px;justify-content:flex-end">
          <button class="import-btn import-btn-secondary" onclick="dismissFirstRunModal()">Skip — set up later</button>
          <button class="import-btn import-btn-primary" onclick="confirmFirstRunSetup()">Set up now</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

export function dismissFirstRunModal() {
  const m = document.getElementById('lens-firstrun-modal');
  if (m) m.remove();
}

export async function confirmFirstRunSetup() {
  dismissFirstRunModal();
  // Open Settings → AI tab so user can watch progress live
  if (window.openSettingsModal) {
    window.openSettingsModal('ai');
  }
  // Defer slightly so the section renders before we kick off
  setTimeout(() => handleStartSetup(), 200);
}

// Schedule auto-prompt after DOM ready (don't block initial render)
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(maybeAutoPromptOnFirstLaunch, 500));
  } else {
    setTimeout(maybeAutoPromptOnFirstLaunch, 500);
  }
}

Object.assign(window, {
  handleStartSetup,
  handleResetSetup,
  isSetupAvailable,
  fetchSetupStatus,
  // FIX (was missing — settings.js calls this on render):
  renderSetupSection,
  // First-run modal handlers
  dismissFirstRunModal,
  confirmFirstRunSetup,
});
