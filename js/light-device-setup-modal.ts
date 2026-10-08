import type { LightDeviceRecord } from './light-devices-store.js';

export interface LightDeviceSetupDeps {
  loadPresets(): Promise<{ presets: LightDeviceRecord[]; types: Record<string, { icon?: string; label?: string }> }>;
  addDeviceFromPreset(presetId: string): Promise<unknown>;
  addCustomDevice: typeof import('./light-devices-store.js').addCustomDevice;
  wireModal(overlay: HTMLElement, closeFn: () => void): unknown;
  refreshLightView(): unknown;
}
// Parsed extraction fields retain their raw values until the existing form readers apply.
type ParsedDeviceSpec = Record<string, unknown> | null | undefined;
type DeviceAIResponse = Pick<Awaited<ReturnType<typeof import('./agent-feature-inference.js').callCodexFeature>>, 'text'>;

// light-device-setup-modal.js — add/custom light-device setup UI.
//
// Device persistence stays behind light-devices-store.js via injected
// callbacks. This module owns the preset-picker modal, custom-device form,
// and AI-assisted URL/photo spec extraction.

import { renderHTML } from './components/LightDeviceSetup.svelte.html.js';
import { projectDevicePresets, projectDeviceCustomSetup } from './light-device-setup-presentation.js';

import { getErrorMessage } from './caught-error.js';
import { state } from './state.js';
import { showNotification, isDebugMode } from './utils.js';
import {
  assistantFeatureSupports, callAssistantFeatureAI, hasAssistantFeatureProvider,
} from './ai-feature-routing.js';
import { resizeImage, isValidImageType, formatImageBlock, buildVisionContent } from './image-utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import { getUtilsRuntimeHostname } from './utils-runtime.js';
import { getProxyApiUrl } from './proxy-runtime.js';

function _input(root: ParentNode, selector: string) {
  return (root.querySelector(selector) as HTMLInputElement | null);
}

function _button(root: ParentNode, selector: string) {
  return (root.querySelector(selector) as HTMLButtonElement | null);
}

function _select(root: ParentNode, selector: string) {
  return (root.querySelector(selector) as HTMLSelectElement | null);
}

const setupDeps: LightDeviceSetupDeps = {
  loadPresets: async () => ({ presets: [], types: {} }),
  addDeviceFromPreset: async () => null,
  addCustomDevice: async () => null,
  wireModal: (overlay, closeFn) => openAppendedModalOverlay(overlay, closeFn),
  refreshLightView: () => {},
};

export function configureLightDeviceSetup(deps: Partial<LightDeviceSetupDeps> = {}) {
  Object.assign(setupDeps, deps);
}

export async function openAddDeviceDialog() {
  const { presets, types } = await setupDeps.loadPresets();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const closeDialog = () => removeModalOverlay(overlay);
  overlay.innerHTML = renderHTML({ kind: 'presets', view: projectDevicePresets({
    presets, types, hasAI: hasAssistantFeatureProvider(),
  }) });
  setupDeps.wireModal(overlay, closeDialog);
  overlay.querySelectorAll('[data-light-device-setup-close]').forEach(btn => {
    btn.addEventListener('click', closeDialog);
  });

  _button(overlay, '#add-device-custom')?.addEventListener('click', () => {
    closeDialog();
    openCustomDeviceDialog();
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
  const addBtn = _button(overlay, '#add-device-confirm');
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

  addBtn?.addEventListener('click', async () => {
    const presetId = selectedPresetId;
    if (!presetId) return;
    const added = await setupDeps.addDeviceFromPreset(presetId);
    if (!added) {
      showNotification('The device could not be added.', 'error');
      return;
    }
    closeDialog();
    showNotification('Device added.');
    setupDeps.refreshLightView();
  });
}

// AI-powered custom-device add modal. Mirrors the supplement custom-add flow
// (see supplements.js fetchSupplementFromURL + scanSupplementLabel): paste a
// product URL or snap a photo, AI extracts specs, user verifies and saves.
export async function openCustomDeviceDialog() {
  const hasAI = hasAssistantFeatureProvider();
  const hasVision = hasAI && assistantFeatureSupports('image');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const closeDialog = () => removeModalOverlay(overlay);
  overlay.innerHTML = renderHTML({ kind: 'custom', view: projectDeviceCustomSetup({
    hasAI, hasVision, unitSystem: state.unitSystem,
  }) });
  setupDeps.wireModal(overlay, closeDialog);
  overlay.querySelectorAll('[data-light-device-custom-close]').forEach(btn => {
    btn.addEventListener('click', closeDialog);
  });

  // Per-field unit toggle on the Vendor reference distance input — same
  // in-place conversion as the session dialog.
  for (const btn of overlay.querySelectorAll('.dev-unit-btn[data-target]')) {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-unit');
      const inputId = btn.getAttribute('data-target');
      const input = inputId ? _input(overlay, '#' + inputId) : null;
      if (!input || !target) return;
      const cur = input.dataset.unit || 'cm';
      if (cur === target) return;
      const v = parseFloat(input.value);
      if (Number.isFinite(v)) {
        const cm = cur === 'in' ? v * 2.54 : v;
        input.value = String(target === 'in' ? +(cm / 2.54).toFixed(1) : Math.round(cm * 10) / 10);
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
    _button(overlay, '#custom-dev-fetch')?.addEventListener('click', () => _fetchCustomDeviceFromURL(overlay));
    if (hasVision) {
      const imageInput = _input(overlay, '#custom-dev-image');
      _button(overlay, '#custom-dev-scan')?.addEventListener('click', () => imageInput?.click());
      imageInput?.addEventListener('change', (e) => _scanCustomDeviceLabel((e.target as HTMLInputElement), overlay));
    }
  }
  _button(overlay, '#custom-dev-save')?.addEventListener('click', async () => {
    const spec = _readCustomDeviceForm(overlay);
    if (!spec.brand || !spec.model) {
      showNotification('Brand and model are required.', 'error');
      return;
    }
    const added = await setupDeps.addCustomDevice(spec);
    if (!added) {
      showNotification('The device could not be added. Check the entered specifications.', 'error');
      return;
    }
    closeDialog();
    showNotification('Device added.');
    setupDeps.refreshLightView();
  });
}

function _readCustomDeviceForm(overlay: HTMLElement) {
  const peaksRaw = _input(overlay, '#custom-dev-peaks')?.value.trim() || '';
  const peaks = peaksRaw
    ? peaksRaw.split(/[,\s]+/).map(s => parseFloat(s)).filter(n => Number.isFinite(n) && n > 100 && n < 3000)
    : [];
  const irrRaw = _input(overlay, '#custom-dev-irradiance')?.value.trim() || '';
  const distInput = _input(overlay, '#custom-dev-distance');
  const distRaw = distInput?.value.trim() || '';
  const distUnit = distInput?.dataset.unit || 'cm';
  const distCm = distRaw
    ? (distUnit === 'in' ? parseFloat(distRaw) * 2.54 : parseFloat(distRaw))
    : null;
  const luxRaw = _input(overlay, '#custom-dev-lux')?.value.trim() || '';
  const mediRaw = _input(overlay, '#custom-dev-medi')?.value.trim() || '';
  let advanced: unknown = {};
  try {
    advanced = JSON.parse(_input(overlay, '#custom-dev-advanced')?.value || '{}');
  } catch (_) {}
  return {
    ...(advanced as Record<string, unknown>),
    brand: _input(overlay, '#custom-dev-brand')?.value.trim() || '',
    model: _input(overlay, '#custom-dev-model')?.value.trim() || '',
    type: _select(overlay, '#custom-dev-type')?.value || 'combined',
    peakWavelengths: peaks,
    mwPerCm2At15cm: irrRaw ? parseFloat(irrRaw) : null,
    recommendedDistanceCm: distCm,
    lux: luxRaw ? parseFloat(luxRaw) : null,
    melanopicEdiLux: mediRaw ? parseFloat(mediRaw) : null,
  };
}

function _applyParsedDevice(parsed: ParsedDeviceSpec, overlay: HTMLElement, sourceUrl: string | null = null) {
  if (!parsed || typeof parsed !== 'object') return;
  const valid = (v: unknown) => v != null && v !== '' && !/not (specified|found|available|provided)/i.test(String(v)) && !/^n\/?a$/i.test(String(v));
  const set = (id: string, val: unknown) => {
    if (!valid(val)) return;
    const el = (overlay.querySelector(id) as HTMLInputElement | HTMLSelectElement | null);
    if (el && !el.value) el.value = String(val);
  };
  set('#custom-dev-brand', parsed.brand);
  set('#custom-dev-model', parsed.model);
  if (parsed.type) {
    const sel = _select(overlay, '#custom-dev-type');
    const opt = sel ? Array.from(sel.options).find(o => o.value === parsed.type) : null;
    if (sel && opt) sel.value = parsed.type as string;
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
    const distEl = _input(overlay, '#custom-dev-distance');
    if (distEl && !distEl.value) {
      const distUnit = distEl.dataset.unit || 'cm';
      const v = distUnit === 'in'
        ? +(Number(parsed.recommendedDistanceCm) / 2.54).toFixed(1)
        : Number(parsed.recommendedDistanceCm);
      if (Number.isFinite(v) && v > 0) distEl.value = String(v);
    }
  }
  set('#custom-dev-lux', parsed.lux);
  set('#custom-dev-medi', parsed.melanopicEdiLux);
  const advancedKeys = [
    'peakShares', 'peakShareBasis', 'irradianceBasis',
    'irradianceByDistanceCm', 'distanceModel', 'melanopicDER',
    'melanopicBasis',
    'channelGroups', 'modes', 'coupling', 'notes',
  ];
  const advanced: Record<string, unknown> = {};
  for (const key of advancedKeys) {
    if (parsed[key] != null) advanced[key] = parsed[key];
  }
  if (sourceUrl) advanced.specSourceUrl = sourceUrl;
  const advancedInput = _input(overlay, '#custom-dev-advanced');
  if (advancedInput) advancedInput.value = JSON.stringify(advanced);
  const review = overlay.querySelector('#custom-dev-extracted-details');
  const reviewJson = overlay.querySelector('#custom-dev-extracted-json');
  const hasAdvanced = Object.keys(advanced).some(key => !['specSourceUrl'].includes(key));
  if (review instanceof HTMLElement) review.hidden = !hasAdvanced;
  if (reviewJson) reviewJson.textContent = JSON.stringify(advanced, null, 2);
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
  "irradianceBasis": "vendor-claim|measured-radiometer|measured-spectrometer|unknown",
  "irradianceByDistanceCm": null OR [{"distanceCm": number, "mwPerCm2": number}, ...] (only readings explicitly stated by the source),
  "distanceModel": "point-source" only if the source explicitly describes point-source/inverse-square behavior, otherwise "reference-only",
  "peakShares": null OR [fractions matching peakWavelengths] (only when the source gives a per-band power split; never infer a UV share from total panel irradiance),
  "peakShareBasis": "vendor-band-split|measured-band-split" or null,
  "melanopicDER": number or null (only when explicitly stated),
  "melanopicEdiLux": number or null (direct eye-level melanopic EDI in lux, only when explicitly stated),
  "melanopicBasis": "vendor-claim|measured-spectrum" or null,
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
- modes: only fill in modes the source actually describes. Each mode lists which channelGroup ids fire. Mark default:true only when the source identifies a default or always-on base. Do not invent an all-on mode.
- coupling: only fill in when the vendor explicitly states an LED group cannot run without another (e.g. "UV must run with red/NIR" — common safety design on hybrid UVB+red panels). Quote the rationale in "reason". Don't infer coupling from omission.

Use null for fields not found. A total irradiance for a hybrid UV + visible/red/NIR panel is NOT a UV irradiance: leave peakShares null unless a band split is stated. Do NOT invent modes, coupling, measurements, or spectral shares. No other text.`;

async function _fetchCustomDeviceFromURL(overlay: HTMLElement) {
  const urlInput = _input(overlay, '#custom-dev-url');
  const url = urlInput?.value.trim();
  if (!url) { showNotification('Paste a product URL first', 'error'); return; }
  try { new URL(url); } catch { showNotification('Invalid URL', 'error'); return; }
  const btn = _button(overlay, '#custom-dev-fetch');
  if (btn) { btn.textContent = 'Fetching...'; btn.disabled = true; }
  try {
    // Local development can use /api/fetch-page. Hosted/self-hosted builds use
    // the same-origin proxy, whose operated-host policy permits only a public
    // GET with no credentials or request body for this branch.
    const isLocal = ['localhost', '127.0.0.1'].includes(getUtilsRuntimeHostname());
    let html: string;
    if (isLocal) {
      const res = await fetch('/api/fetch-page?url=' + encodeURIComponent(url));
      if (!res.ok) throw new Error(`Fetch error ${res.status}`);
      const json = await res.json() as { html: string };
      html = json.html;
    } else {
      const res = await fetch(getProxyApiUrl(), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxy_purpose: 'public-page', url, method: 'GET', headers: {} })
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
    const comments: Node[] = [];
    let c; while ((c = walker.nextNode())) comments.push(c);
    for (const comment of comments) comment.parentNode?.removeChild(comment);
    const plainText = (doc.body?.textContent || '').replace(/\s{2,}/g, ' ');
    const kwPattern = /(.{0,300}(?:wavelength|spectrum|nm|red light|near.?infrared|UV[AB]?|irradiance|mW\/cm|lux|inches|distance|specifications?|specs).{0,500})/gi;
    const kwMatches = plainText.match(kwPattern) || [];
    const trimmed = (ldText + '\n' + kwMatches.join('\n') + '\n' + plainText.slice(0, 5000)).slice(0, 15000);
    const result = await callAssistantFeatureAI({
      system: _CUSTOM_DEVICE_PROMPT,
      messages: [{ role: 'user', content: trimmed }],
      maxTokens: 800,
    });
    if (!overlay.isConnected) return;
    const jsonMatch = (result as DeviceAIResponse).text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { showNotification('Could not parse device specs from page', 'error'); return; }
    _applyParsedDevice(JSON.parse(jsonMatch[0]!) as ParsedDeviceSpec, overlay, url);
  } catch (e) {
    if (!overlay.isConnected) return;
    if (isDebugMode()) console.warn('[fetchCustomDevice]', e);
    showNotification('Failed to fetch: ' + (getErrorMessage(e, 'Unknown error')), 'error');
  } finally {
    if (overlay.isConnected && btn) { btn.textContent = 'Fetch & analyse'; btn.disabled = false; }
  }
}

async function _scanCustomDeviceLabel(input: HTMLInputElement, overlay: HTMLElement) {
  const file = input.files?.[0];
  input.value = '';
  if (!file || !isValidImageType(file.type)) {
    showNotification('Please select an image (JPG, PNG, WebP)', 'error');
    return;
  }
  const btn = _button(overlay, '#custom-dev-scan');
  if (btn) { btn.textContent = 'Scanning...'; btn.disabled = true; }
  try {
    const { base64, mediaType } = await resizeImage(file, 1024, 0.85);
    const imageBlock = formatImageBlock(base64, mediaType, 'openrouter');
    const content = buildVisionContent([imageBlock], _CUSTOM_DEVICE_PROMPT, 'openrouter');
    const result = await callAssistantFeatureAI({ messages: [{ role: 'user', content }], maxTokens: 800, consentKind: 'image' });
    if (!overlay.isConnected) return;
    const jsonMatch = (result as DeviceAIResponse).text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { showNotification('Could not parse device specs from image', 'error'); return; }
    _applyParsedDevice(JSON.parse(jsonMatch[0]!) as ParsedDeviceSpec, overlay);
  } catch (e) {
    if (!overlay.isConnected) return;
    if (isDebugMode()) console.warn('[scanCustomDevice]', e);
    showNotification('Failed to scan: ' + (getErrorMessage(e, 'Unknown error')), 'error');
  } finally {
    if (overlay.isConnected && btn) { btn.textContent = '📷 Scan device label'; btn.disabled = false; }
  }
}
