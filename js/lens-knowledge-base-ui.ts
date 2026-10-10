// lens-knowledge-base-ui.js - Knowledge Base settings/modal UI and local ingest.

import { getErrorMessage } from './caught-error.js';
import { showNotification, showConfirmDialog } from './utils.js';
import { closeModalOverlay, openModalOverlay, wireBackdropClose } from './modal-lifecycle.js';
import { initLensActionDelegates } from './lens-actions.js';
import { createLensLibraryHandlers } from './lens-library.js';
import { knowledgeBaseClasses } from './knowledge-base-classes.js';
import {
  projectKnowledgeBaseStatus,
  projectKnowledgeBasePanel,
  projectKnowledgeBaseStats,
  projectKnowledgeBaseDocuments,
} from './knowledge-base-presentation.js';
import type { KnowledgeBasePanelView } from './knowledge-base-presentation.js';
import {
  renderKnowledgeBasePanel,
  renderKnowledgeBaseModal,
  renderKnowledgeBaseStatus,
  renderKnowledgeBaseStats,
  renderKnowledgeBaseDocuments,
  renderKnowledgeBaseIngestPill,
} from './knowledge-base-rendering.js';

import type { LensLibraryDeps } from './lens-library.js';
import type { StatsReply } from './lens-local-protocol.js';
import type { LensInputFile } from './lens-local-ingest.js';
export interface LensUiConfig { backend: string; name: string; url: string; enabled: boolean; topK: number; testProbe: string; multiQuery: boolean }
interface LensStatus { state: string; lastChunkCount: number; lastError: string | null; sourceName: string }
type LensConnectionResult = { ok: true; chunkCount: number } | { ok: false; error: string };
interface LensUiDeps extends Pick<LensLibraryDeps, 'clearLensCache'> {
  defaultTestProbe: string; getLensConfig(): LensUiConfig; saveLensConfig(partial: Partial<LensUiConfig>): unknown;
  getLensKey(): string; saveLensKey(key: string): Promise<unknown>; removeLens(): Promise<unknown>;
  getLensStatus(): LensStatus; updateLensStatus(partial: Partial<LensStatus>): unknown;
  hasLens(): boolean; isValidLensUrl(url: string): boolean;
  testLensConnection(): Promise<LensConnectionResult>;
  recordLocalLensStats(stats: Omit<StatsReply, 'type'>): unknown;
}
type LensWindow = Window & typeof globalThis & { _lensIngestRunning?: boolean; _lensIngestStopRequested?: boolean; _lensIngestJobToken?: symbol };
const lensWindow = window as LensWindow;

function renderLensStatus(
  cfg: LensUiConfig,
  connected: unknown,
  isBrowser: boolean,
  usableSource: boolean,
  status: LensStatus,
) {
  return projectKnowledgeBaseStatus(
    cfg,
    connected,
    isBrowser,
    usableSource,
    status,
  );
}

export function createLensKnowledgeBaseUi(deps: LensUiDeps) {
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

  function prepareLensPanelView(): KnowledgeBasePanelView {
    const cfg = getLensConfig();
    // The host inserts the authored panel markup synchronously. Schedule
    // on-device initialization on the next frame, after #lens-local-stats
    // and #lens-library-select exist in that markup.
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
    const statusView = renderLensStatus(
      cfg,
      connected,
      isBrowser,
      usableSource,
      status,
    );
    return projectKnowledgeBasePanel({
      config: cfg,
      keySet,
      isBrowser,
      isExternal,
      connected,
      status: statusView,
      defaultTestProbe,
    });
  }

  function renderCustomLensSection() {
    return renderKnowledgeBasePanel(prepareLensPanelView());
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
  function openKnowledgeBaseModal(options: { source?: string } = {}) {
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
    modal.className = knowledgeBaseClasses('modal kb-modal settings-modal');
    modal.innerHTML = renderKnowledgeBaseModal({
      showContextBack,
      panel: prepareLensPanelView(),
    });
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

  function _kbModalKeydown(e: KeyboardEvent) {
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
    const statusView = renderLensStatus(
      cfg,
      connected,
      isBrowser,
      usableSource,
      status,
    );
    chip.innerHTML = renderKnowledgeBaseStatus(statusView);
  }

  async function handleSaveLensConfig() {
    const topKInput = (document.getElementById('lens-topk-input') as HTMLInputElement | null);
    const enabledToggle = (document.getElementById('lens-enabled-toggle') as HTMLInputElement | null);
    const multiQueryCheckbox = (document.getElementById('lens-multi-query-checkbox') as HTMLInputElement | null);
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
    const nameInput = (document.getElementById('lens-name-input') as HTMLInputElement | null);
    const urlInput = (document.getElementById('lens-url-input') as HTMLInputElement | null);
    const keyInput = (document.getElementById('lens-key-input') as HTMLInputElement | null);
    const testProbeInput = (document.getElementById('lens-test-probe-input') as HTMLInputElement | null);
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
      showNotification(`Connection failed: ${(result as Extract<LensConnectionResult, { ok: false }>).error}`, 'error');
    }
  }

  /// Backend radio handler — saves the choice immediately (so a reload
  /// keeps the selection). Re-renders the whole panel since the per-backend
  /// sections have structurally different layouts.
  function handleLensBackendChange(backend: string) {
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
        const speed = Number.isFinite(s.ms_per_embed) && (s.ms_per_embed as number) > 0
          ? ` · about ${Math.max(1, Math.round(1000 / (s.ms_per_embed as number)))} excerpts/s`
          : '';
        stats.innerHTML = renderKnowledgeBaseStats(projectKnowledgeBaseStats({
          totalChunks: s.total_chunks,
          documentCount: s.documents.length,
          model: s.model,
          modelLabel,
          backendLabel,
          speed,
        }));
        if (s.backend !== 'webgpu' && /bge-base/i.test(s.model)) {
          stats.innerHTML += renderKnowledgeBaseStats({ part: 'performance-note' });
        }
      }
      if (list) list.innerHTML = _renderLocalDocList(s.documents);
      _attachLocalLensDropHandlers();
    } catch (e) {
      if (stats) stats.innerHTML = renderKnowledgeBaseStats({
        part: 'error',
        message: getErrorMessage(e, String(e)),
      });
    }
  }

  function _renderLocalDocList(docs: StatsReply['documents'] | null | undefined) {
    if (!docs || docs.length === 0) return '';
    return renderKnowledgeBaseDocuments(projectKnowledgeBaseDocuments(docs));
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
    pill.className = knowledgeBaseClasses('kb-ingest-pill');
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    pill.innerHTML = renderKnowledgeBaseIngestPill();
    document.body.appendChild(pill);
    const dismiss = (pill.querySelector('#lens-ingest-pill-dismiss') as HTMLButtonElement | null);
    const cancel = (pill.querySelector('#lens-ingest-pill-cancel') as HTMLButtonElement | null);
    dismiss?.addEventListener('click', () => {
      pill!.style.display = 'none';
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

  async function _handleLocalLensIngest(fileList: FileList | null | undefined) {
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
    pill!.style.display = '';
    const pillText = (pill.querySelector('#lens-ingest-pill-text') as HTMLElement | null);
    const pillBar = (pill.querySelector('#lens-ingest-pill-bar') as HTMLProgressElement | null);
    const pillStop = (pill.querySelector('#lens-ingest-pill-cancel') as HTMLButtonElement | null);
    if (!pillText || !pillBar || !pillStop) return;
    const jobToken = Symbol('lens-ingest');
    lensWindow._lensIngestJobToken = jobToken;
    pillStop.disabled = false;
    pillStop.textContent = 'Stop indexing';
    const t0 = performance.now();
    let indexT0 = 0;
    let unsub = () => {};
    lensWindow._lensIngestStopRequested = false;
    const updateProgressUi = (message: string, progress: { value: number; max: number } | null = null) => {
      pillText.textContent = message;
      const modalBar = (document.getElementById('lens-local-progress') as HTMLProgressElement | null);
      const modalText = document.getElementById('lens-local-progress-text');
      const modalWrap = (document.getElementById('lens-local-progress-wrap') as HTMLElement | null);
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
      const files: LensInputFile[] = [];
      for (let i = 0; i < incoming.length; i++) {
        const f = incoming[i]!;
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
        if (lensWindow._lensIngestJobToken !== jobToken) return;
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

  async function handleLocalLensDeleteDoc(source: string) {
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

  function handleToggleLens(checked: boolean) {
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
