// light-device-setup-modal.js — add/custom light-device setup UI.
//
// Device persistence stays in light-devices.js. This module owns the
// preset-picker modal, custom-device form, and AI-assisted URL/photo spec
// extraction, then calls injected persistence callbacks.

import { state } from './state.js';
import { escapeHTML, escapeAttr, showNotification, isDebugMode } from './utils.js';
import { callClaudeAPI, hasAIProvider, supportsVision } from './api.js';
import { resizeImage, isValidImageType, formatImageBlock, buildVisionContent } from './image-utils.js';

const setupDeps = {
  loadPresets: async () => ({ presets: [], types: {} }),
  addDeviceFromPreset: async () => null,
  addCustomDevice: async () => null,
  wireModal: (overlay) => document.body.appendChild(overlay),
  refreshLightView: () => {},
};

export function configureLightDeviceSetup(deps = {}) {
  Object.assign(setupDeps, deps);
}

export async function openAddDeviceDialog() {
  const { presets, types } = await setupDeps.loadPresets();
  const groups = {};
  for (const p of presets) {
    if (!groups[p.type]) groups[p.type] = [];
    groups[p.type].push(p);
  }
  // Order: UV (most distinctive — vitamin D capable) first, then UVA-only,
  // then red+NIR panels, then targeted PBM, then eye-channel devices
  // (SAD → dawn → full-spectrum bulbs). Mirrors the natural mental
  // model "what kind of light am I trying to add?"
  const orderedTypes = ['uvb', 'uva', 'combined', 'pbm-targeted', 'sad', 'dawn-sim', 'full-spectrum'];

  let presetSections = '';
  for (const t of orderedTypes) {
    if (!groups[t]) continue;
    const meta = types[t] || {};
    const groupId = `add-device-group-${t.replace(/[^a-z0-9-]/gi, '-')}`;
    presetSections += `<section class="light-device-preset-group" aria-labelledby="${escapeAttr(groupId)}">
      <h4 class="light-device-preset-heading" id="${escapeAttr(groupId)}">${escapeHTML((meta.icon || '') + ' ' + (meta.label || t))}</h4>
      <div class="light-device-preset-list">`;
    for (const p of groups[t]) {
      const presetMeta = _formatPresetMeta(p);
      presetSections += `<button type="button" class="light-device-preset-row" data-preset-id="${escapeAttr(p.id)}" aria-pressed="false">
        <span class="light-device-preset-name">${escapeHTML(p.brand)} ${escapeHTML(p.model)}</span>
        ${presetMeta ? `<span class="light-device-preset-meta">${escapeHTML(presetMeta)}</span>` : ''}
      </button>`;
    }
    presetSections += '</div></section>';
  }

  // Anything not in the curated preset list goes through the AI-powered
  // custom-add flow (paste URL or scan label) — same UX shape as the
  // supplement-add modal in supplements.js.
  const hasAI = hasAIProvider();
  const aiHint = hasAI
    ? 'Don\'t see your device? Paste its product page or snap a photo of the back panel — AI extracts the specs.'
    : 'Don\'t see your device? Set up an AI provider in Settings to auto-extract specs from a URL or photo, or click below to enter manually.';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `<div class="modal light-device-add-modal" role="dialog" aria-label="Add light device">
    <div class="modal-header">
      <h3>Add a light device</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint">Pick from the curated brand presets — Mitochondriak, Chroma, EMR-Tek. Anything else uses the custom-add flow below.</p>
      <div class="light-device-preset-groups">
        ${presetSections}
      </div>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="import-btn import-btn-primary" id="add-device-confirm" disabled>Add device</button>
      </div>

      <hr style="margin:20px 0;border:none;border-top:1px solid var(--border)">

      <p class="modal-body-hint">${escapeHTML(aiHint)}</p>
      <button type="button" class="import-btn import-btn-secondary" id="add-device-custom" style="width:100%;margin-top:8px">+ Custom device (paste link or scan photo)</button>
    </div>
  </div>`;
  setupDeps.wireModal(overlay);

  overlay.querySelector('#add-device-custom').addEventListener('click', () => {
    overlay.remove();
    openCustomDeviceDialog();
  });

  // Backdrop-click closes — this is a browse/pick modal (single select, no
  // typed input), so accidental dismissal doesn't lose any data the user
  // hasn't already chosen via dropdown. Escape is handled globally in
  // main.js's anonymous-overlay fallback.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.addEventListener('wheel', (event) => {
    const modal = overlay.querySelector('.light-device-add-modal');
    if (!modal) return;
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? modal.clientHeight
      : (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1);
    modal.scrollBy({ top: event.deltaY * unit, left: 0, behavior: 'auto' });
    event.preventDefault();
  }, { passive: false });

  let selectedPresetId = '';
  const addBtn = overlay.querySelector('#add-device-confirm');
  const presetRows = Array.from(overlay.querySelectorAll('.light-device-preset-row'));
  for (const row of presetRows) {
    row.addEventListener('click', () => {
      selectedPresetId = row.getAttribute('data-preset-id') || '';
      for (const item of presetRows) {
        const active = item === row;
        item.classList.toggle('active', active);
        item.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
      if (addBtn) addBtn.disabled = !selectedPresetId;
    });
  }

  addBtn.addEventListener('click', async () => {
    const presetId = selectedPresetId;
    if (!presetId) return;
    await setupDeps.addDeviceFromPreset(presetId);
    overlay.remove();
    showNotification('Device added.');
    setupDeps.refreshLightView();
  });
}

function _formatPresetMeta(p) {
  const parts = [];
  if (Array.isArray(p.peakWavelengths) && p.peakWavelengths.length) {
    parts.push(`${p.peakWavelengths.join('/')} nm`);
  }
  if (Number.isFinite(Number(p.mwPerCm2At15cm)) && Number(p.mwPerCm2At15cm) > 0) {
    parts.push(`${p.mwPerCm2At15cm} mW/cm²`);
  } else if (Number.isFinite(Number(p.lux)) && Number(p.lux) > 0) {
    parts.push(`${Number(p.lux).toLocaleString()} lux`);
  }
  if (Number.isFinite(Number(p.recommendedDistanceCm)) && Number(p.recommendedDistanceCm) > 0) {
    parts.push(`${p.recommendedDistanceCm} cm`);
  }
  return parts.join(' · ');
}

// AI-powered custom-device add modal. Mirrors the supplement custom-add flow
// (see supplements.js fetchSupplementFromURL + scanSupplementLabel): paste a
// product URL or snap a photo, AI extracts specs, user verifies and saves.
export async function openCustomDeviceDialog() {
  const hasAI = hasAIProvider();
  const hasVision = hasAI && supportsVision();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-label="Add custom light device">
    <div class="modal-header">
      <h3>Add a custom device</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${hasAI ? `
      <p class="modal-body-hint">Paste a product page URL or scan the label — AI will extract the device specs. You can edit any field before saving.</p>
      <div class="custom-device-ai-row">
        <input type="url" id="custom-dev-url" class="ctx-input" placeholder="https://..." style="flex:1" />
        <button type="button" class="import-btn import-btn-secondary custom-dev-fetch" id="custom-dev-fetch">Fetch &amp; analyse</button>
      </div>
      ${hasVision ? `<div class="custom-device-ai-row" style="margin-top:8px">
        <button type="button" class="import-btn import-btn-secondary custom-dev-scan" id="custom-dev-scan">📷 Scan device label</button>
        <input type="file" id="custom-dev-image" accept="image/*" style="display:none">
      </div>` : `<p class="modal-body-hint" style="margin-top:8px">Image scan needs a vision-capable AI model (Claude or OpenAI).</p>`}
      <hr style="margin:16px 0;border:none;border-top:1px solid var(--border)">
      ` : `<p class="modal-body-hint">Set up an AI provider in Settings to auto-extract specs from a URL or photo. For now, fill in fields manually:</p>`}
      <div class="custom-device-form">
        <label class="ctx-label">Brand
          <input type="text" id="custom-dev-brand" class="ctx-input" placeholder="e.g. Mitochondriak" />
        </label>
        <label class="ctx-label">Model
          <input type="text" id="custom-dev-model" class="ctx-input" placeholder="e.g. Maxi UVB" />
        </label>
        <label class="ctx-label">Type
          <select id="custom-dev-type" class="ctx-select">
            <option value="combined">Red + near-IR panel</option>
            <option value="uvb">UV phototherapy (UVB-capable)</option>
            <option value="uva">UVA panel (no UVB)</option>
            <option value="pbm-targeted">Targeted PBM device</option>
            <option value="sad">SAD light box (10k lux)</option>
            <option value="dawn-sim">Dawn simulator</option>
            <option value="full-spectrum">Full-spectrum bulb</option>
          </select>
        </label>
        <label class="ctx-label">Peak wavelengths (nm, comma-separated)
          <input type="text" id="custom-dev-peaks" class="ctx-input" placeholder="e.g. 660, 850" />
        </label>
        <label class="ctx-label">Irradiance (mW/cm² at vendor's reference distance)
          <input type="number" id="custom-dev-irradiance" class="ctx-input" min="0" step="any" placeholder="e.g. 100 (leave blank for SAD lamps)" />
        </label>
        ${(() => {
          const useUS = state.unitSystem === 'US';
          const startUnit = useUS ? 'in' : 'cm';
          const ph = startUnit === 'in' ? 'e.g. 6' : 'e.g. 15';
          return `<label class="ctx-label">Vendor reference distance — distance the irradiance was measured at
            <div class="dev-distance-row">
              <input type="number" id="custom-dev-distance" class="ctx-input" min="1" max="200" step="any" placeholder="${ph}" data-unit="${startUnit}" />
              <div class="dev-unit-toggle" role="tablist" aria-label="Distance unit">
                <button type="button" class="dev-unit-btn${startUnit === 'cm' ? ' active' : ''}" data-target="custom-dev-distance" data-unit="cm" role="tab" aria-selected="${startUnit === 'cm'}">cm</button>
                <button type="button" class="dev-unit-btn${startUnit === 'in' ? ' active' : ''}" data-target="custom-dev-distance" data-unit="in" role="tab" aria-selected="${startUnit === 'in'}">in</button>
              </div>
            </div>
          </label>`;
        })()}
        <label class="ctx-label">Lux at the eye (for SAD / dawn lamps)
          <input type="number" id="custom-dev-lux" class="ctx-input" min="0" step="any" placeholder="e.g. 10000" />
        </label>
      </div>
      <div class="modal-actions" style="margin-top:18px">
        <button type="button" class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button type="button" class="import-btn import-btn-primary" id="custom-dev-save">Add device</button>
      </div>
    </div>
  </div>`;
  setupDeps.wireModal(overlay);

  // Per-field unit toggle on the Vendor reference distance input — same
  // in-place conversion as the session dialog.
  for (const btn of overlay.querySelectorAll('.dev-unit-btn[data-target]')) {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-unit');
      const inputId = btn.getAttribute('data-target');
      const input = overlay.querySelector('#' + inputId);
      const cur = input.dataset.unit || 'cm';
      if (cur === target) return;
      const v = parseFloat(input.value);
      if (Number.isFinite(v)) {
        const cm = cur === 'in' ? v * 2.54 : v;
        input.value = target === 'in' ? +(cm / 2.54).toFixed(1) : Math.round(cm * 10) / 10;
      }
      input.dataset.unit = target;
      for (const b of overlay.querySelectorAll(`.dev-unit-btn[data-target="${inputId}"]`)) {
        const active = b.getAttribute('data-unit') === target;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      }
    });
  }

  if (hasAI) {
    overlay.querySelector('#custom-dev-fetch').addEventListener('click', () => _fetchCustomDeviceFromURL(overlay));
    if (hasVision) {
      overlay.querySelector('#custom-dev-scan').addEventListener('click', () => overlay.querySelector('#custom-dev-image').click());
      overlay.querySelector('#custom-dev-image').addEventListener('change', (e) => _scanCustomDeviceLabel(e.target, overlay));
    }
  }
  overlay.querySelector('#custom-dev-save').addEventListener('click', async () => {
    const spec = _readCustomDeviceForm(overlay);
    if (!spec.brand || !spec.model) {
      showNotification('Brand and model are required.', 'error');
      return;
    }
    await setupDeps.addCustomDevice(spec);
    overlay.remove();
    showNotification('Device added.');
    setupDeps.refreshLightView();
  });
}

function _readCustomDeviceForm(overlay) {
  const peaksRaw = overlay.querySelector('#custom-dev-peaks').value.trim();
  const peaks = peaksRaw
    ? peaksRaw.split(/[,\s]+/).map(s => parseFloat(s)).filter(n => Number.isFinite(n) && n > 100 && n < 3000)
    : [];
  const irrRaw = overlay.querySelector('#custom-dev-irradiance').value.trim();
  const distInput = overlay.querySelector('#custom-dev-distance');
  const distRaw = distInput.value.trim();
  const distUnit = distInput.dataset.unit || 'cm';
  const distCm = distRaw
    ? (distUnit === 'in' ? parseFloat(distRaw) * 2.54 : parseFloat(distRaw))
    : null;
  const luxRaw = overlay.querySelector('#custom-dev-lux').value.trim();
  return {
    brand: overlay.querySelector('#custom-dev-brand').value.trim(),
    model: overlay.querySelector('#custom-dev-model').value.trim(),
    type: overlay.querySelector('#custom-dev-type').value,
    peakWavelengths: peaks,
    mwPerCm2At15cm: irrRaw ? parseFloat(irrRaw) : null,
    recommendedDistanceCm: distCm,
    lux: luxRaw ? parseFloat(luxRaw) : null,
  };
}

function _applyParsedDevice(parsed, overlay) {
  if (!parsed || typeof parsed !== 'object') return;
  const valid = v => v != null && v !== '' && !/not (specified|found|available|provided)/i.test(String(v)) && !/^n\/?a$/i.test(String(v));
  const set = (id, val) => {
    if (!valid(val)) return;
    const el = overlay.querySelector(id);
    if (el && !el.value) el.value = val;
  };
  set('#custom-dev-brand', parsed.brand);
  set('#custom-dev-model', parsed.model);
  if (parsed.type) {
    const sel = overlay.querySelector('#custom-dev-type');
    const opt = Array.from(sel.options).find(o => o.value === parsed.type);
    if (opt) sel.value = parsed.type;
  }
  if (Array.isArray(parsed.peakWavelengths) && parsed.peakWavelengths.length > 0) {
    const peaks = parsed.peakWavelengths.filter(n => Number.isFinite(Number(n))).join(', ');
    if (peaks) set('#custom-dev-peaks', peaks);
  }
  set('#custom-dev-irradiance', parsed.mwPerCm2At15cm);
  // Distance comes back from AI in cm. If the input is rendered in inches
  // (US users), convert before populating so the visible value matches the
  // field's unit label.
  if (parsed.recommendedDistanceCm != null) {
    const distEl = overlay.querySelector('#custom-dev-distance');
    if (distEl && !distEl.value) {
      const distUnit = distEl.dataset.unit || 'cm';
      const v = distUnit === 'in'
        ? +(Number(parsed.recommendedDistanceCm) / 2.54).toFixed(1)
        : Number(parsed.recommendedDistanceCm);
      if (Number.isFinite(v) && v > 0) distEl.value = v;
    }
  }
  set('#custom-dev-lux', parsed.lux);
  showNotification('Specs extracted — review and save.', 'success');
}

const _CUSTOM_DEVICE_PROMPT = `Extract light therapy device specs from this product page. Reply with ONLY JSON:
{
  "brand": "manufacturer name",
  "model": "model name",
  "type": "uvb|uva|combined|pbm-targeted|sad|dawn-sim|full-spectrum",
  "peakWavelengths": [numbers in nm e.g. 660, 850],
  "mwPerCm2At15cm": number or null (the irradiance value; field is legacy-named — store the vendor's reading at whatever distance they publish),
  "recommendedDistanceCm": number or null (the distance at which the manufacturer measured the irradiance above — typically 15-30 cm; some COB devices recommend 50+ cm. Convert inches to cm: 6 in ≈ 15 cm, 12 in ≈ 30 cm, 20 in ≈ 50 cm),
  "lux": number or null (only for SAD / dawn lamps),
  "channelGroups": null OR [{"id": "kebab-case-id", "label": "human label", "peaks": [subset of peakWavelengths]}, ...],
  "modes": null OR [{"id": "kebab-case-id", "label": "human label", "groups": [groupIds], "default": true on the most common preset}, ...],
  "coupling": null OR [{"if": "groupId", "requires": ["otherGroupId"], "reason": "vendor-stated reason — quote if possible"}],
  "notes": "short description"
}

Type guide:
- uvb: emits UVB (270-320 nm) — vitamin D capable, may also have other bands
- uva: emits UVA (320-400 nm) but no UVB
- combined: red + near-IR panel (660 + 850 nm typical), no UV
- pbm-targeted: handheld / spot PBM device
- sad: SAD light box (10000 lux therapy lamp)
- dawn-sim: dawn simulator / wake-up light
- full-spectrum: full-spectrum bulb

channelGroups / modes / coupling guide (set ALL THREE to null if the product page describes a single-channel device with no mode-selector):
- channelGroups: only fill in when the panel has independently-controllable LED groups (e.g. a touchscreen toggle for "UV" vs "red/NIR", or named modes like "Ironforge / Lux Vital / D-Light"). Each group lists which peakWavelengths are wired to its dimmer/switch.
- modes: only fill in if the device has named touchscreen presets / mode buttons. Each mode lists which channelGroup ids fire when selected. Always include an "all-on" mode that fires every group, marked default:true unless the vendor states otherwise. If the vendor only describes one operating mode, set modes to null.
- coupling: only fill in when the vendor explicitly states an LED group cannot run without another (e.g. "UV must run with red/NIR" — common safety design on hybrid UVB+red panels). Quote the rationale in "reason". Don't infer coupling from omission.

Use null for fields not found. Do NOT invent modes the vendor doesn't describe. No other text.`;

async function _fetchCustomDeviceFromURL(overlay) {
  const urlInput = overlay.querySelector('#custom-dev-url');
  const url = urlInput?.value.trim();
  if (!url) { showNotification('Paste a product URL first', 'error'); return; }
  try { new URL(url); } catch { showNotification('Invalid URL', 'error'); return; }
  const btn = overlay.querySelector('#custom-dev-fetch');
  if (btn) { btn.textContent = 'Fetching...'; btn.disabled = true; }
  try {
    // Same fetch path supplements.js uses — /api/fetch-page on localhost,
    // POST /api/proxy on hosted. Reuses the existing trusted-host gates.
    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    let html;
    if (isLocal) {
      const res = await fetch('/api/fetch-page?url=' + encodeURIComponent(url));
      if (!res.ok) throw new Error(`Fetch error ${res.status}`);
      const json = await res.json();
      html = json.html;
    } else {
      const res = await fetch('/api/proxy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, method: 'GET', headers: {} })
      });
      if (!res.ok) throw new Error(`Proxy error ${res.status}`);
      html = await res.text();
    }
    if (!overlay.isConnected) return;
    if (!html || html.length < 100) { showNotification('Could not fetch page content', 'error'); return; }
    // Use DOMParser (not regex) to strip non-content nodes — regex strips can
    // be evaded by HTML edge cases, and CodeQL flags every variant. The text
    // is fed into an AI prompt, not into the DOM, but parser extraction is
    // still more accurate.
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const ldText = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))
      .map(s => (s.textContent || '').trim()).filter(Boolean).join('\n');
    doc.querySelectorAll('script, style, nav, footer, header, svg, noscript, template, iframe')
      .forEach(n => n.remove());
    const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_COMMENT);
    const comments = [];
    let c; while ((c = walker.nextNode())) comments.push(c);
    for (const comment of comments) comment.remove();
    const plainText = (doc.body?.textContent || '').replace(/\s{2,}/g, ' ');
    const kwPattern = /(.{0,300}(?:wavelength|spectrum|nm|red light|near.?infrared|UV[AB]?|irradiance|mW\/cm|lux|inches|distance|specifications?|specs).{0,500})/gi;
    const kwMatches = plainText.match(kwPattern) || [];
    const trimmed = (ldText + '\n' + kwMatches.join('\n') + '\n' + plainText.slice(0, 5000)).slice(0, 15000);
    const result = await callClaudeAPI({
      system: _CUSTOM_DEVICE_PROMPT,
      messages: [{ role: 'user', content: trimmed }],
      maxTokens: 800,
    });
    if (!overlay.isConnected) return;
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { showNotification('Could not parse device specs from page', 'error'); return; }
    _applyParsedDevice(JSON.parse(jsonMatch[0]), overlay);
  } catch (e) {
    if (!overlay.isConnected) return;
    if (isDebugMode()) console.warn('[fetchCustomDevice]', e);
    showNotification('Failed to fetch: ' + (e.message || 'Unknown error'), 'error');
  } finally {
    if (overlay.isConnected && btn) { btn.textContent = 'Fetch & analyse'; btn.disabled = false; }
  }
}

async function _scanCustomDeviceLabel(input, overlay) {
  const file = input.files?.[0];
  input.value = '';
  if (!file || !isValidImageType(file.type)) {
    showNotification('Please select an image (JPG, PNG, WebP)', 'error');
    return;
  }
  const btn = overlay.querySelector('#custom-dev-scan');
  if (btn) { btn.textContent = 'Scanning...'; btn.disabled = true; }
  try {
    const { base64, mediaType } = await resizeImage(file, 1024, 0.85);
    const imageBlock = formatImageBlock(base64, mediaType);
    const content = buildVisionContent([imageBlock], _CUSTOM_DEVICE_PROMPT);
    const result = await callClaudeAPI({ messages: [{ role: 'user', content }], maxTokens: 800 });
    if (!overlay.isConnected) return;
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { showNotification('Could not parse device specs from image', 'error'); return; }
    _applyParsedDevice(JSON.parse(jsonMatch[0]), overlay);
  } catch (e) {
    if (!overlay.isConnected) return;
    if (isDebugMode()) console.warn('[scanCustomDevice]', e);
    showNotification('Failed to scan: ' + (e.message || 'Unknown error'), 'error');
  } finally {
    if (overlay.isConnected && btn) { btn.textContent = '📷 Scan device label'; btn.disabled = false; }
  }
}
