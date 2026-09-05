// lens-library.js - Local Knowledge Base library picker and actions.

import { getErrorMessage } from './caught-error.js';
import { showNotification, showConfirmDialog, showPromptDialog, escapeHTML, escapeAttr } from './utils.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';

export function createLensLibraryHandlers({
  getLensConfig,
  getLocalLens,
  clearLensCache,
  saveLensConfig,
  updateLensStatusChip,
  loadLocalLensStats,
}) {
  // in-browser only. external-server has no library concept (it's a single
  // remote endpoint), so handlers no-op there.
  async function _libList() {
    const cfg = getLensConfig();
    if (cfg.backend === 'in-browser') {
      const lens = await getLocalLens();
      return lens.listLibraries(); // {libraries, activeId}
    }
    return { libraries: [], activeId: '' };
  }

  async function _libCreate(name, model) {
    const cfg = getLensConfig();
    if (cfg.backend === 'in-browser') {
      const lens = await getLocalLens();
      const created = await lens.createLibrary(name, model);
      await lens.activateLibrary(created.id);
      return created;
    }
    throw new Error('Libraries are not supported for this backend');
  }

  async function _libActivate(id) {
    const cfg = getLensConfig();
    if (cfg.backend === 'in-browser') {
      const lens = await getLocalLens();
      return lens.activateLibrary(id);
    }
  }

  async function _libRename(id, name) {
    const cfg = getLensConfig();
    if (cfg.backend === 'in-browser') {
      const lens = await getLocalLens();
      return lens.renameLibrary(id, name);
    }
  }

  async function _libDelete(id) {
    const cfg = getLensConfig();
    if (cfg.backend === 'in-browser') {
      const lens = await getLocalLens();
      return lens.deleteLibrary(id);
    }
  }

  /// Populate #lens-library-select from the active backend and sync the
  /// stored display name with the active library. Safe to call repeatedly.
  async function _loadLibraryPicker() {
    const sel = document.getElementById('lens-library-select');
    try {
      const { libraries, activeId } = await _libList();
      const active = libraries?.find((l) => l.id === activeId);
      if (active && getLensConfig().name !== active.name) {
        saveLensConfig({ name: active.name });
        updateLensStatusChip();
      }
      if (!sel) return;
      if (!libraries || libraries.length === 0) {
        sel.innerHTML = '<option value="">No libraries yet</option>';
        return;
      }
      sel.innerHTML = libraries.map((l) =>
        `<option value="${escapeAttr(l.id)}" ${l.id === activeId ? 'selected' : ''}>${escapeHTML(l.name)}</option>`
      ).join('');
    } catch (e) {
      if (sel) sel.innerHTML = '<option value="">(engine not ready)</option>';
    }
  }

  async function handleLibraryActivate(libraryId) {
    if (!libraryId) return;
    try {
      await _libActivate(libraryId);
      clearLensCache();
      showNotification('Switched library.', 'info');
      await _loadLibraryPicker();
      const cfg = getLensConfig();
      if (cfg.backend === 'in-browser') await loadLocalLensStats();
      updateLensStatusChip();
    } catch (e) {
      showNotification(`Couldn't switch library: ${getErrorMessage(e, e)}.`, 'error');
    }
  }

  async function handleLibraryNew() {
    // Pull the model catalog + tier verdict from the already-booted worker
    // so the dialog can highlight a device-appropriate default. If the
    // worker isn't ready yet (user opens the dialog the instant they
    // switch backends), fall back to a plain name-only prompt - we can
    // always create with DEFAULT_MODEL_KEY.
    let embedder = null;
    let models = null;
    _setNewLibraryBusy(true, 'Preparing…');
    try {
      const lens = await getLocalLens();
      embedder = lens.embedder;
      models = lens.models;
    } catch { /* backend not ready - fall through to plain prompt */ }
    finally { _setNewLibraryBusy(false); }

    const picked = (models && Object.keys(models).length > 0)
      ? await _showLibraryCreateDialog(embedder, models)
      : await _plainNamePrompt();
    if (!picked) return;
    _setNewLibraryBusy(true, 'Creating…');
    try {
      const created = await _libCreate(picked.name, picked.model);
      clearLensCache();
      showNotification(`Created "${created?.name || picked.name}". Drop documents to index them.`, 'success');
      await _loadLibraryPicker();
      const cfg = getLensConfig();
      if (cfg.backend === 'in-browser') await loadLocalLensStats();
      updateLensStatusChip();
    } catch (e) {
      showNotification(`Couldn't create library: ${getErrorMessage(e, e)}.`, 'error');
    } finally {
      _setNewLibraryBusy(false);
    }
  }

  function _setNewLibraryBusy(busy, label = '') {
    const buttons = document.querySelectorAll('[data-lens-action="new-library"]');
    for (const button of buttons) {
      if (!(button instanceof HTMLButtonElement)) continue;
      if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent || '+ New library';
      button.disabled = busy;
      button.setAttribute('aria-busy', String(busy));
      button.textContent = busy ? label : button.dataset.idleLabel;
    }
  }

  /// Fallback when the worker isn't ready / models catalog is empty.
  /// Preserves the pre-step-3 UX exactly so existing tests don't break.
  async function _plainNamePrompt() {
    const name = await showPromptDialog('Name for the new library?', {
      placeholder: 'e.g. Research Papers',
      okLabel: 'Create',
    });
    return name ? { name, model: undefined } : null;
  }

  /// Library-creation modal: name + user-facing search profile. CPU users
  /// default to the balanced model even when MiniLM benchmarks extremely
  /// well; otherwise a fast CPU silently gets "rewarded" with BGE-base and
  /// sees little wall-clock improvement. BGE-base is automatic only when a
  /// genuinely fast WebGPU path is active, and remains available manually.
  function _showLibraryCreateDialog(embedder, models) {
    const detectedTier = embedder?.tier || 1;
    const entries = Object.entries(models); // [[key, spec], ...]
    const byTier = { 1: [], 2: [], 3: [] };
    for (const [key, spec] of entries) {
      const t = spec.tier || 1;
      if (t <= 3) byTier[t]?.push({ key, spec });
    }
    const recommendedTier = embedder?.backend === 'webgpu' && detectedTier >= 3
      ? 3
      : detectedTier >= 2 ? 2 : 1;
    let recommendedKey = null;
    for (let t = recommendedTier; t >= 1; t--) {
      const candidates = byTier[t] || [];
      const english = candidates.find((c) => c.spec.language === 'en');
      const pick = english || candidates[0];
      if (pick) { recommendedKey = pick.key; break; }
    }
    if (!recommendedKey) recommendedKey = entries[0]?.[0];

    const deviceLine = !embedder
      ? 'We could not measure this browser yet, so Fast is selected for compatibility.'
      : embedder.backend === 'webgpu' && recommendedTier === 3
        ? 'WebGPU acceleration is available, so Best English retrieval should remain responsive.'
        : recommendedTier === 2
          ? `This browser is using ${embedder.backend === 'webgpu' ? 'WebGPU acceleration' : 'CPU indexing'}. Balanced keeps imports responsive while improving retrieval.`
          : 'This browser is using a slower local path, so Fast is selected to keep imports responsive.';

    const profileLabel = (key, spec) => {
      if (spec.language === 'multi') return 'Multilingual';
      if (spec.tier >= 3 || /base/i.test(key)) return 'Best recall';
      if (spec.tier === 2 || /small/i.test(key)) return 'Balanced';
      return 'Fast';
    };

    return new Promise((resolve) => {
      let overlay = document.getElementById('lens-library-create-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'lens-library-create-overlay';
        document.body.appendChild(overlay);
      }
      overlay.className = 'confirm-overlay kb-create-overlay';

      const radiosHtml = entries.map(([key, spec]) => {
        const isRecommended = key === recommendedKey;
        const badge = isRecommended
          ? '<span class="kb-recommended-badge">Recommended</span>'
          : '';
        const langLabel = spec.language === 'multi' ? '100+ languages' : 'English';
        return `<label class="kb-model-card">
          <input type="radio" name="lens-create-model" value="${escapeAttr(key)}" ${isRecommended ? 'checked' : ''}>
          <span class="kb-model-copy">
            <span class="kb-model-title"><span class="kb-model-profile">${escapeHTML(profileLabel(key, spec))}</span>${escapeHTML(spec.label)}</span>
            <span class="kb-model-meta">${spec.downloadMB}&nbsp;MB download &middot; ${langLabel}</span>
            <span class="kb-model-notes">${escapeHTML(spec.notes || '')}</span>
          </span>
          ${badge}
        </label>`;
      }).join('');

      overlay.innerHTML = `<div class="kb-create-dialog" role="dialog" aria-modal="true" aria-labelledby="lens-create-title">
        <div class="gb-modal-head">
          <div>
            <div class="gb-modal-title" id="lens-create-title">Create a library</div>
          </div>
          <button class="modal-close" id="lens-create-close" aria-label="Close">&times;</button>
        </div>
        <div class="kb-create-body">
          <div class="kb-create-device">${deviceLine}</div>
          <label class="kb-field" for="lens-create-name">
            <span>Library name</span>
            <input type="text" id="lens-create-name" class="kb-field-control" placeholder="e.g. Research Papers" autocomplete="off">
            <small>Use separate libraries for collections you do not want searched together.</small>
          </label>
          <div class="kb-field kb-model-field">
            <span>Search profile</span>
            <small>This choice is locked at creation. Changing it later requires indexing the documents again.</small>
            <div class="kb-model-picker" role="radiogroup" aria-label="Search profile">${radiosHtml}</div>
          </div>
          <div class="kb-create-actions">
            <button class="import-btn import-btn-secondary" id="lens-create-cancel">Cancel</button>
            <button class="import-btn import-btn-primary" id="lens-create-ok">Create library</button>
          </div>
        </div>
      </div>`;
      openModalOverlay(overlay, { initialFocus: '#lens-create-name', focusDelay: 0 });

      const nameInput = /** @type {HTMLInputElement} */ (document.getElementById('lens-create-name'));
      const ok = /** @type {HTMLButtonElement} */ (document.getElementById('lens-create-ok'));
      const cancel = /** @type {HTMLButtonElement} */ (document.getElementById('lens-create-cancel'));
      const closeButton = /** @type {HTMLButtonElement} */ (document.getElementById('lens-create-close'));

      const close = (result) => {
        closeModalOverlay(overlay);
        document.removeEventListener('keydown', onKey);
        resolve(result);
      };
      const submit = () => {
        const name = nameInput.value.trim();
        if (!name) { nameInput.focus(); return; }
        const chosen = /** @type {HTMLInputElement | null} */ (overlay.querySelector('input[name="lens-create-model"]:checked'));
        close({ name, model: chosen?.value || recommendedKey });
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(null); }
        else if (e.key === 'Enter' && e.target === nameInput) { e.preventDefault(); submit(); }
      };

      ok.onclick = submit;
      cancel.onclick = () => close(null);
      closeButton.onclick = () => close(null);
      overlay.onclick = (e) => { if (e.target === overlay) close(null); };
      document.addEventListener('keydown', onKey);
    });
  }

  async function handleLibraryRename() {
    try {
      const { libraries, activeId } = await _libList();
      const active = libraries.find((l) => l.id === activeId);
      const current = active?.name || '';
      const next = await showPromptDialog('Rename library:', {
        defaultValue: current,
        okLabel: 'Rename',
      });
      if (!next || next === current) return;
      await _libRename(activeId, next);
      // Cached result envelopes carry the library display name used by chat
      // citations, so a rename must invalidate them even though vectors stay
      // unchanged.
      clearLensCache();
      showNotification(`Renamed to "${next}".`, 'info');
      await _loadLibraryPicker();
      updateLensStatusChip();
    } catch (e) {
      showNotification(`Couldn't rename library: ${getErrorMessage(e, e)}.`, 'error');
    }
  }

  async function handleLibraryDelete() {
    if (await showConfirmDialog('Delete the active library? Every document in it will be removed. This can\'t be undone.')) {
      try {
        const { libraries, activeId } = await _libList();
        if (!activeId) return;
        await _libDelete(activeId);
        clearLensCache();
        const remaining = libraries.length - 1;
        showNotification(
          remaining === 0
            ? 'Library deleted. A fresh one will be created automatically.'
            : 'Library deleted.',
          'info',
        );
        await _loadLibraryPicker();
        const cfg = getLensConfig();
        if (cfg.backend === 'in-browser') await loadLocalLensStats();
        updateLensStatusChip();
      } catch (e) {
        showNotification(`Couldn't delete library: ${getErrorMessage(e, e)}.`, 'error');
      }
    }
  }

  return {
    loadLibraryPicker: _loadLibraryPicker,
    handleLibraryActivate,
    handleLibraryNew,
    handleLibraryRename,
    handleLibraryDelete,
  };
}
