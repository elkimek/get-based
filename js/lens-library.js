// lens-library.js - Local Knowledge Base library picker and actions.

import { showNotification, showConfirmDialog, showPromptDialog, escapeHTML, escapeAttr } from './utils.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';

export function createLensLibraryHandlers({
  getLensConfig,
  getLocalLens,
  clearLensCache,
  saveLensConfig,
  updateLensIndicator,
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
      updateLensIndicator();
      showNotification('Switched library.', 'info');
      await _loadLibraryPicker();
      const cfg = getLensConfig();
      if (cfg.backend === 'in-browser') await loadLocalLensStats();
      updateLensStatusChip();
    } catch (e) {
      showNotification(`Couldn't switch library: ${e?.message || e}.`, 'error');
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
    try {
      const lens = await getLocalLens();
      embedder = lens.embedder;
      models = lens.models;
    } catch { /* backend not ready - fall through to plain prompt */ }

    const picked = (models && Object.keys(models).length > 0)
      ? await _showLibraryCreateDialog(embedder, models)
      : await _plainNamePrompt();
    if (!picked) return;
    try {
      const created = await _libCreate(picked.name, picked.model);
      clearLensCache();
      updateLensIndicator();
      showNotification(`Created "${created?.name || picked.name}". Drop documents to index them.`, 'success');
      await _loadLibraryPicker();
      const cfg = getLensConfig();
      if (cfg.backend === 'in-browser') await loadLocalLensStats();
      updateLensStatusChip();
    } catch (e) {
      showNotification(`Couldn't create library: ${e?.message || e}.`, 'error');
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

  /// Library-creation modal: name + model picker. Highlights a
  /// recommended model based on the benchmark verdict (embedder.tier)
  /// so users with modern hardware default to a stronger model than
  /// MiniLM. Returns {name, model} or null on cancel.
  ///
  /// Mirrors the structure of showPromptDialog in utils.js - same
  /// overlay + dialog classes so theming and escape-to-cancel come
  /// for free - but with a radio group of model options inside.
  function _showLibraryCreateDialog(embedder, models) {
    // Pick the recommended model: highest-tier option that fits within
    // the detected tier. No benchmark verdict (old browsers, init
    // hiccup) -> recommend the default (tier-1 MiniLM, universally
    // works). Within a tier, prefer English BGE over multilingual-E5
    // for the default highlight - English health research is getbased's
    // modal case. Users with multilingual corpora can one-click over.
    const detectedTier = embedder?.tier || 1;
    const entries = Object.entries(models); // [[key, spec], ...]
    const byTier = { 1: [], 2: [], 3: [] };
    for (const [key, spec] of entries) {
      const t = spec.tier || 1;
      if (t <= 3) byTier[t]?.push({ key, spec });
    }
    // Recommended = highest-tier eligible for the device, English
    // preferred. If nothing at the detected tier, step down.
    let recommendedKey = null;
    for (let t = detectedTier; t >= 1; t--) {
      const candidates = byTier[t] || [];
      const english = candidates.find((c) => c.spec.language === 'en');
      const pick = english || candidates[0];
      if (pick) { recommendedKey = pick.key; break; }
    }
    if (!recommendedKey) recommendedKey = entries[0]?.[0];

    const tierLine = embedder
      ? `Your device: ${embedder.msPerEmbed.toFixed(0)} ms/embed on ${embedder.backend} &rarr; tier ${embedder.tier}.`
      : 'Device not yet benchmarked - recommending the universally-compatible default.';

    return new Promise((resolve) => {
      let overlay = document.getElementById('lens-library-create-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'lens-library-create-overlay';
        overlay.className = 'confirm-overlay';
        document.body.appendChild(overlay);
      }

      // Render radio buttons for each model. Highlight the recommended
      // one with a badge + default-checked. Each row shows label, size,
      // dim, and language scope so users can make an informed choice.
      const radiosHtml = entries.map(([key, spec]) => {
        const isRecommended = key === recommendedKey;
        const border = isRecommended ? 'var(--accent)' : 'var(--border)';
        const shadow = isRecommended ? 'box-shadow:0 0 0 2px rgba(124,58,237,0.15);' : '';
        const badge = isRecommended
          ? '<span style="margin-left:8px;padding:2px 6px;font-size:10px;background:var(--accent);color:#fff;border-radius:3px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Recommended</span>'
          : '';
        const langLabel = spec.language === 'multi' ? '100+ languages' : 'English';
        return `<label style="display:block;padding:10px 12px;margin:6px 0;border:1px solid ${border};border-radius:6px;cursor:pointer;${shadow}">
          <div style="display:flex;align-items:center">
            <input type="radio" name="lens-create-model" value="${escapeAttr(key)}" ${isRecommended ? 'checked' : ''} style="margin-right:10px">
            <strong style="color:var(--text-primary);font-size:13px">${escapeHTML(spec.label)}</strong>
            ${badge}
          </div>
          <div style="margin-top:4px;margin-left:23px;font-size:11px;color:var(--text-muted);line-height:1.5">
            ${spec.downloadMB}&nbsp;MB download &middot; ${spec.dim}-dim &middot; ${langLabel}<br>
            ${escapeHTML(spec.notes || '')}
          </div>
        </label>`;
      }).join('');

      overlay.innerHTML = `<div class="confirm-dialog" role="dialog" aria-modal="true" aria-label="New library" style="max-width:520px">
        <p class="confirm-message" style="margin-bottom:4px">New library</p>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px;line-height:1.4">${tierLine}</div>
        <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">Library name</label>
        <input type="text" id="lens-create-name" class="api-key-input"
               placeholder="e.g. Research Papers"
               style="width:100%;margin-bottom:14px;box-sizing:border-box"
               aria-label="Library name">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Embedding model (locked at creation - switching model later means re-indexing every document)</div>
        <div style="max-height:320px;overflow-y:auto;margin-bottom:14px">${radiosHtml}</div>
        <div class="confirm-actions">
          <button class="confirm-btn confirm-btn-cancel" id="lens-create-cancel">Cancel</button>
          <button class="confirm-btn confirm-btn-danger" id="lens-create-ok" style="background:var(--accent)">Create</button>
        </div></div>`;
      openModalOverlay(overlay, { initialFocus: '#lens-create-name', focusDelay: 0 });

      const nameInput = /** @type {HTMLInputElement} */ (document.getElementById('lens-create-name'));
      const ok = /** @type {HTMLButtonElement} */ (document.getElementById('lens-create-ok'));
      const cancel = /** @type {HTMLButtonElement} */ (document.getElementById('lens-create-cancel'));

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
      showNotification(`Renamed to "${next}".`, 'info');
      await _loadLibraryPicker();
      updateLensStatusChip();
    } catch (e) {
      showNotification(`Couldn't rename library: ${e?.message || e}.`, 'error');
    }
  }

  async function handleLibraryDelete() {
    if (await showConfirmDialog('Delete the active library? Every document in it will be removed. This can\'t be undone.')) {
      try {
        const { libraries, activeId } = await _libList();
        if (!activeId) return;
        await _libDelete(activeId);
        clearLensCache();
        updateLensIndicator();
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
        showNotification(`Couldn't delete library: ${e?.message || e}.`, 'error');
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
