// @ts-check
// profile-share.js — encrypted single-profile share links

import { getErrorMessage } from './caught-error.js';
import { state } from './state.js';
import { getProfiles } from './profile.js';
import { buildClientExportObject, importDataJSON } from './export.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import { addUtilsRuntimeListener } from './utils-runtime.js';

export const PROFILE_SHARE_SCHEMA = 'getbased-profile-share';
export const PROFILE_SHARE_VERSION = 1;
export const PROFILE_SHARE_KDF_ITERATIONS = 600000;
export const PROFILE_SHARE_MIN_KDF_ITERATIONS = 100000;
export const PROFILE_SHARE_MAX_DAYS = 30;
export const PROFILE_SHARE_MAX_DECOMPRESSED_BYTES = 37_500_000;
const OPERATED_PROFILE_SHARE_API = 'https://shares.getbased.health/api/share';
const OPERATED_PROFILE_SHARE_ID_PREFIX = 'vps1_';
const OPERATED_PROFILE_SHARE_ID_RE = /^vps1_[A-Za-z0-9_-]{24}$/;
const OPERATED_PROFILE_SHARE_HOSTS = new Set([
  'getbased.health',
  'www.getbased.health',
  'app.getbased.health',
  'beta.getbased.health',
  'get-based.vercel.app',
]);

/**
 * @param {Location | { hostname?: string } | null | undefined} [locationLike]
 * @param {string} [shareId]
 */
export function getProfileShareApiUrl(locationLike = globalThis.location, shareId = '') {
  const hostname = String(locationLike?.hostname || '').toLowerCase();
  return OPERATED_PROFILE_SHARE_HOSTS.has(hostname) && OPERATED_PROFILE_SHARE_ID_RE.test(shareId)
    ? OPERATED_PROFILE_SHARE_API
    : '/api/share';
}

export const PROFILE_SHARE_API = getProfileShareApiUrl(
  globalThis.location,
  `${OPERATED_PROFILE_SHARE_ID_PREFIX}${'A'.repeat(24)}`,
);

const SHARE_ID_RE = /^[A-Za-z0-9_-]{20,80}$/;
const SHARE_OVERLAY_ID = 'profile-share-overlay';
const SHARE_RECORDS_KEY = 'getbased-profile-shares-v1';
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const COPY_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const REFRESH_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 21v-5h5"/><path d="M3 12A9 9 0 0 1 18.4 5.6L21 8"/><path d="M21 3v5h-5"/></svg>';

function getCrypto() {
  const c = globalThis.crypto;
  if (!c?.subtle || typeof c.getRandomValues !== 'function') {
    throw new Error('Encrypted sharing requires Web Crypto support.');
  }
  return c;
}

function randomBytes(size) {
  const bytes = new Uint8Array(size);
  getCrypto().getRandomValues(bytes);
  return bytes;
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(i, i + 0x8000));
  }
  const base64 = typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = typeof atob === 'function'
    ? atob(padded)
    : Buffer.from(padded, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function createProfileShareId() {
  return `${OPERATED_PROFILE_SHARE_ID_PREFIX}${bytesToBase64Url(randomBytes(18))}`;
}

export function generateProfileSharePassword() {
  const token = bytesToBase64Url(randomBytes(24));
  return (token.match(/.{1,6}/g) || [token]).join('-');
}

function generateProfileShareManageToken() {
  return bytesToBase64Url(randomBytes(24));
}

async function sha256Hex(value) {
  const digest = await getCrypto().subtle.digest('SHA-256', TEXT_ENCODER.encode(String(value || '')));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function deriveShareKey(secret, salt, iterations) {
  const c = getCrypto();
  const material = await c.subtle.importKey('raw', TEXT_ENCODER.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return c.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function compressJsonText(text) {
  const bytes = TEXT_ENCODER.encode(text);
  if (typeof CompressionStream !== 'function' || typeof Blob !== 'function' || typeof Response !== 'function') {
    return { compression: 'none', bytes };
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  return { compression: 'gzip', bytes: compressed };
}

async function decompressJsonBytes(bytes, compression) {
  if (!compression || compression === 'none') {
    if (bytes.byteLength > PROFILE_SHARE_MAX_DECOMPRESSED_BYTES) throw new Error('Shared profile is too large to import.');
    return TEXT_DECODER.decode(bytes);
  }
  if (compression !== 'gzip') throw new Error('Unsupported share compression.');
  if (typeof DecompressionStream !== 'function' || typeof Blob !== 'function') {
    throw new Error('This browser cannot decompress the shared profile.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > PROFILE_SHARE_MAX_DECOMPRESSED_BYTES) {
        try { await reader.cancel(); } catch {}
        throw new Error('Shared profile is too large to import.');
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  const decompressed = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    decompressed.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return TEXT_DECODER.decode(decompressed);
}

function clampExpiryDays(days) {
  const parsed = Number(days);
  if (!Number.isFinite(parsed)) return 7;
  return Math.min(PROFILE_SHARE_MAX_DAYS, Math.max(1, Math.round(parsed)));
}

function isoDaysFromNow(days) {
  const expires = new Date(Date.now() + clampExpiryDays(days) * 24 * 60 * 60 * 1000);
  return expires.toISOString();
}

function validateSharePassword(value) {
  const trimmed = String(value || '').trim();
  if (trimmed.length < 12) throw new Error('Use a password of at least 12 characters.');
  return trimmed;
}

export function buildProfileShareUrl(id, loc = globalThis.location) {
  if (!SHARE_ID_RE.test(id)) throw new Error('Invalid share id.');
  const base = loc
    ? new URL(loc.pathname || '/', loc.origin || 'http://localhost')
    : new URL('/', 'http://localhost');
  base.hash = `share/${id}`;
  return base.toString();
}

export function parseProfileShareIdFromLocation(loc = globalThis.location) {
  if (!loc) return '';
  const hash = String(loc.hash || '').replace(/^#\/?/, '');
  let match = /^share\/([A-Za-z0-9_-]{20,80})$/.exec(hash);
  if (match) return match[1];
  match = /^share=([A-Za-z0-9_-]{20,80})$/.exec(hash);
  if (match) return match[1];
  try {
    const url = new URL(loc.href || String(loc));
    const id = url.searchParams.get('share');
    return SHARE_ID_RE.test(id || '') ? id : '';
  } catch {
    return '';
  }
}

function validateClientExportObject(exportObj) {
  if (!exportObj || typeof exportObj !== 'object') throw new Error('Invalid shared profile.');
  if (exportObj.version !== 2) throw new Error('Unsupported shared profile version.');
  if (!exportObj.profile?.name || typeof exportObj.profile.name !== 'string') throw new Error('Shared profile is missing profile metadata.');
  if (!Array.isArray(exportObj.entries)) throw new Error('Shared profile is missing lab entries.');
  return exportObj;
}

export async function encryptProfileShareEnvelope(exportObj, secret, options = {}) {
  validateClientExportObject(exportObj);
  const shareSecret = validateSharePassword(secret);
  const c = getCrypto();
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const requestedIterations = Number(options.iterations);
  const iterations = Number.isFinite(requestedIterations)
    ? Math.max(PROFILE_SHARE_MIN_KDF_ITERATIONS, Math.round(requestedIterations))
    : PROFILE_SHARE_KDF_ITERATIONS;
  const expiresAt = options.expiresAt || isoDaysFromNow(options.expiresDays || 7);
  const { compression, bytes } = await compressJsonText(JSON.stringify(exportObj));
  const key = await deriveShareKey(shareSecret, salt, iterations);
  const ciphertext = new Uint8Array(await c.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  return {
    schema: PROFILE_SHARE_SCHEMA,
    version: PROFILE_SHARE_VERSION,
    createdAt: new Date().toISOString(),
    expiresAt,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations,
      salt: bytesToBase64Url(salt),
    },
    cipher: {
      name: 'AES-GCM',
      iv: bytesToBase64Url(iv),
    },
    compression,
    ciphertext: bytesToBase64Url(ciphertext),
  };
}

export async function decryptProfileShareEnvelope(envelope, secret) {
  const shareSecret = validateSharePassword(secret);
  if (!envelope || envelope.schema !== PROFILE_SHARE_SCHEMA || envelope.version !== PROFILE_SHARE_VERSION) {
    throw new Error('Invalid shared profile link.');
  }
  if (Date.parse(envelope.expiresAt || '') <= Date.now()) {
    throw new Error('This shared profile link has expired.');
  }
  const kdf = envelope.kdf || {};
  const cipher = envelope.cipher || {};
  if (kdf.name !== 'PBKDF2' || kdf.hash !== 'SHA-256' || cipher.name !== 'AES-GCM') {
    throw new Error('Unsupported shared profile encryption.');
  }
  const salt = base64UrlToBytes(kdf.salt);
  const iv = base64UrlToBytes(cipher.iv);
  const ciphertext = base64UrlToBytes(envelope.ciphertext);
  const iterations = Number(kdf.iterations);
  if (!Number.isInteger(iterations) || iterations < PROFILE_SHARE_MIN_KDF_ITERATIONS) throw new Error('Invalid shared profile encryption settings.');
  const key = await deriveShareKey(shareSecret, salt, iterations);
  let plaintextBytes;
  try {
    plaintextBytes = new Uint8Array(await getCrypto().subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext));
  } catch {
    throw new Error('Could not decrypt shared profile.');
  }
  const jsonText = await decompressJsonBytes(plaintextBytes, envelope.compression);
  return validateClientExportObject(JSON.parse(jsonText));
}

async function postProfileShare(id, envelope, manageTokenHash) {
  const response = await fetch(getProfileShareApiUrl(globalThis.location, id), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, envelope, manageTokenHash }),
  });
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body?.error || `Share failed (${response.status})`);
  return body || {};
}

async function fetchProfileShareEnvelope(id) {
  if (!SHARE_ID_RE.test(id)) throw new Error('Invalid share id.');
  const apiUrl = getProfileShareApiUrl(globalThis.location, id);
  const response = await fetch(`${apiUrl}?id=${encodeURIComponent(id)}`);
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body?.error || `Share could not be loaded (${response.status})`);
  if (!body?.envelope) throw new Error('Shared profile payload is missing.');
  return body.envelope;
}

async function deleteProfileShareEnvelope(id, manageToken = '') {
  if (!SHARE_ID_RE.test(id)) throw new Error('Invalid share id.');
  const apiUrl = getProfileShareApiUrl(globalThis.location, id);
  const response = await fetch(`${apiUrl}?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ manageToken }),
  });
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(body?.error || `Could not stop sharing (${response.status})`);
  return body || {};
}

function readShareRecords() {
  if (typeof localStorage === 'undefined') return [];
  let parsed = [];
  let shouldRewrite = false;
  try {
    parsed = JSON.parse(localStorage.getItem(SHARE_RECORDS_KEY) || '[]');
  } catch {
    parsed = [];
    shouldRewrite = true;
  }
  if (!Array.isArray(parsed)) {
    parsed = [];
    shouldRewrite = true;
  }
  const now = Date.now();
  const records = parsed
    .filter(record => record && typeof record === 'object')
    .filter(record => SHARE_ID_RE.test(record.id || '') && Date.parse(record.expiresAt || '') > now)
    .map(record => ({
      id: record.id,
      profileId: String(record.profileId || ''),
      profileName: String(record.profileName || 'Profile'),
      shareUrl: String(record.shareUrl || ''),
      manageToken: String(record.manageToken || ''),
      createdAt: String(record.createdAt || ''),
      expiresAt: String(record.expiresAt || ''),
    }))
    .slice(0, 50);
  if (shouldRewrite || records.length !== parsed.length) writeShareRecords(records);
  return records;
}

function writeShareRecords(records) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SHARE_RECORDS_KEY, JSON.stringify(records.slice(0, 50)));
  } catch {}
}

function saveShareRecord(record) {
  const records = readShareRecords().filter(item => item.id !== record.id);
  records.unshift(record);
  writeShareRecords(records);
}

function removeShareRecord(id) {
  writeShareRecords(readShareRecords().filter(record => record.id !== id));
}

function getShareRecord(id) {
  return readShareRecords().find(record => record.id === id) || null;
}

function getProfileShareRecords(profileId = state.currentProfile) {
  return readShareRecords().filter(record => record.profileId === profileId);
}

/**
 * @typedef {Object} CreateProfileShareOptions
 * @property {string=} profileId
 * @property {string=} password
 * @property {number|string=} expiresDays
 */

/** @param {CreateProfileShareOptions} [options] */
export async function createProfileShare({ profileId = state.currentProfile, password, expiresDays = 7 } = {}) {
  const secret = validateSharePassword(password);
  const id = createProfileShareId();
  const manageToken = generateProfileShareManageToken();
  const manageTokenHash = await sha256Hex(manageToken);
  // Relay-backed shares exclude meals/photos; only explicit local JSON backups include them.
  const exportObj = await buildClientExportObject(profileId, false, false);
  const envelope = await encryptProfileShareEnvelope(exportObj, secret, { expiresDays: clampExpiryDays(expiresDays) });
  await postProfileShare(id, envelope, manageTokenHash);
  return {
    id,
    shareUrl: buildProfileShareUrl(id),
    password: secret,
    manageToken,
    expiresAt: envelope.expiresAt,
    profileName: exportObj.profile.name,
    profileId,
  };
}

async function copyText(value, successMessage) {
  if (!value) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      showNotification(successMessage, 'success');
      return;
    }
  } catch {}
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand?.('copy');
  ta.remove();
  showNotification(ok ? successMessage : 'Copy failed. Select the field and copy manually.', ok ? 'success' : 'warning');
}

function setStatus(text, type = 'info') {
  const el = document.getElementById('profile-share-status');
  if (!el) return;
  el.textContent = text || '';
  el.dataset.status = type;
  el.hidden = !text;
}

function setBusy(overlay, busy, label = '') {
  const buttons = overlay?.querySelectorAll('button, input, select');
  buttons?.forEach(el => {
    if (el.dataset.profileShareAction === 'close' || el.dataset.profileShareAction === 'copy') return;
    el.disabled = !!busy;
  });
  const submit = overlay?.querySelector('[data-profile-share-action="create"], [data-profile-share-action="load"]');
  if (submit) {
    if (busy && label) {
      submit.dataset.originalText = submit.dataset.originalText || submit.textContent;
      submit.textContent = label;
    } else if (submit.dataset.originalText) {
      submit.textContent = submit.dataset.originalText;
      delete submit.dataset.originalText;
    }
  }
}

function profileNameForShare(profileId = state.currentProfile) {
  const profile = getProfiles().find(p => p.id === profileId);
  return profile?.name || 'Active profile';
}

function formatShareExpiry(expiresAt) {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return 'Unknown expiry';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderActiveShareList(profileId = state.currentProfile) {
  const records = getProfileShareRecords(profileId);
  const rows = records.length
    ? records.map(record => `
        <div class="profile-share-active-row" data-profile-share-record="${escapeAttr(record.id)}">
          <div class="profile-share-active-main">
            <span class="profile-share-active-title">Shared link</span>
            <span class="profile-share-active-meta">Expires ${escapeHTML(formatShareExpiry(record.expiresAt))}</span>
          </div>
          <div class="profile-share-active-actions">
            <button type="button" class="profile-share-icon-btn" data-profile-share-action="copy" data-copy-value="${escapeAttr(record.shareUrl)}" data-copy-label="Link copied" title="Copy link" aria-label="Copy active link">${COPY_ICON}</button>
            <button type="button" class="profile-share-stop-btn" data-profile-share-action="delete-link" data-share-id="${escapeAttr(record.id)}">Stop sharing</button>
          </div>
        </div>`).join('')
    : `<div class="profile-share-active-empty">No active links created on this device.</div>`;
  return `
    <section class="profile-share-active" data-profile-share-active-list data-profile-id="${escapeAttr(profileId || '')}">
      <div class="profile-share-active-head">
        <span>Active links</span>
        <small>Created on this device</small>
      </div>
      <div class="profile-share-active-list">${rows}</div>
    </section>
  `;
}

function refreshActiveShareList(overlay, profileId = state.currentProfile) {
  const container = overlay?.querySelector('[data-profile-share-active-list]');
  if (!container) return;
  container.outerHTML = renderActiveShareList(profileId);
}

function renderCreateShareBody(profileId = state.currentProfile) {
  const secret = generateProfileSharePassword();
  return `
    <div class="gb-form-body profile-share-body">
      <div class="profile-share-intro">
        <div class="profile-share-intro-title">Encrypted link for <b>${escapeHTML(profileNameForShare(profileId))}</b></div>
        <div class="profile-share-intro-copy">The link finds a locked copy of the profile. The password is the only way to unlock it, and it is never added to the link or sent to us.</div>
      </div>
      <form class="profile-share-form" data-profile-share-form="create" data-profile-id="${escapeAttr(profileId || '')}">
        <label class="profile-share-field">
          <span>Password</span>
          <div class="profile-share-input-row">
            <input id="profile-share-password" class="api-key-input" type="text" value="${escapeAttr(secret)}" autocomplete="off" spellcheck="false">
            <button type="button" class="profile-share-icon-btn" data-profile-share-action="regenerate" title="Generate new password" aria-label="Generate new password">${REFRESH_ICON}</button>
          </div>
        </label>
        <label class="profile-share-field">
          <span>Expires</span>
          <select id="profile-share-expires" class="api-key-input">
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
          </select>
        </label>
        <label class="profile-share-consent">
          <input id="profile-share-consent" type="checkbox" required>
          <span>I agree to upload a password-locked copy of this profile for temporary sharing. Anyone with both the link and password can open it, so I will send the password separately.</span>
        </label>
        <div class="profile-share-note">If the password is lost, this shared copy cannot be recovered. On the official hosted app, temporary share copies are not backed up and may also be lost after a service failure; a self-hosted operator may use a different retention policy.</div>
        <div id="profile-share-status" class="profile-share-status" hidden></div>
        <div class="gb-form-actions">
          <button type="button" class="import-btn import-btn-secondary" data-profile-share-action="close">Cancel</button>
          <button type="submit" class="import-btn import-btn-primary" data-profile-share-action="create">Create Link</button>
        </div>
      </form>
      ${renderActiveShareList(profileId)}
    </div>
  `;
}

function renderShareResultBody(result) {
  return `
    <div class="gb-form-body profile-share-body">
      <div class="profile-share-intro">
        <div class="profile-share-intro-title">Link ready for <b>${escapeHTML(result.profileName)}</b></div>
        <div class="profile-share-intro-copy">Copy both values, but send them through separate channels.</div>
      </div>
      <div class="profile-share-result-list">
        <label class="profile-share-field">
          <span>Link</span>
          <div class="profile-share-input-row">
            <input id="profile-share-link" class="api-key-input" type="text" value="${escapeAttr(result.shareUrl)}" readonly>
            <button type="button" class="profile-share-icon-btn" data-profile-share-action="copy" data-copy-target="profile-share-link" data-copy-label="Link copied" title="Copy link" aria-label="Copy link">${COPY_ICON}</button>
          </div>
        </label>
        <label class="profile-share-field">
          <span>Password</span>
          <div class="profile-share-input-row">
            <input id="profile-share-result-password" class="api-key-input" type="text" value="${escapeAttr(result.password)}" readonly>
            <button type="button" class="profile-share-icon-btn" data-profile-share-action="copy" data-copy-target="profile-share-result-password" data-copy-label="Password copied" title="Copy password" aria-label="Copy password">${COPY_ICON}</button>
          </div>
        </label>
      </div>
      <div class="profile-share-note">Expires ${escapeHTML(new Date(result.expiresAt).toLocaleString())}. Recipients import this as a new profile.</div>
      ${renderActiveShareList(result.profileId)}
      <div id="profile-share-status" class="profile-share-status" hidden></div>
      <div class="gb-form-actions">
        <button type="button" class="import-btn import-btn-primary" data-profile-share-action="close">Done</button>
      </div>
    </div>
  `;
}

function renderLoadShareBody(id) {
  return `
    <div class="gb-form-body profile-share-body">
      <div class="modal-unit">Enter the password for this shared profile. It will import as a new profile in this browser.</div>
      <form class="profile-share-form" data-profile-share-form="load" data-share-id="${escapeAttr(id)}">
        <label class="profile-share-field">
          <span>Password</span>
          <input id="profile-share-load-password" class="api-key-input" type="password" autocomplete="current-password">
        </label>
        <div id="profile-share-status" class="profile-share-status" hidden></div>
        <div class="gb-form-actions">
          <button type="button" class="import-btn import-btn-secondary" data-profile-share-action="close">Cancel</button>
          <button type="submit" class="import-btn import-btn-primary" data-profile-share-action="load">Load Profile</button>
        </div>
      </form>
    </div>
  `;
}

function renderProfileShareShell({ title, kicker = 'Share Profile', body }) {
  closeProfileShareModal();
  const template = document.createElement('template');
  template.innerHTML = `
    <div class="modal-overlay" id="${SHARE_OVERLAY_ID}">
      <div class="modal gb-form-modal profile-share-modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}">
        <div class="gb-modal-head">
          <div>
            <div class="gb-modal-kicker">${escapeHTML(kicker)}</div>
            <div class="gb-modal-title">${escapeHTML(title)}</div>
          </div>
          <button type="button" class="modal-close" aria-label="Close" data-profile-share-action="close">&times;</button>
        </div>
        ${body}
      </div>
    </div>
  `.trim();
  const overlay = template.content.firstElementChild;
  if (!(overlay instanceof HTMLElement)) return;
  openAppendedModalOverlay(overlay, closeProfileShareModal);
  installProfileShareDelegates(overlay);
}

export function openProfileShareModal(profileId = state.currentProfile) {
  renderProfileShareShell({
    title: 'Share Profile',
    body: renderCreateShareBody(profileId),
  });
}

export function closeProfileShareModal() {
  const overlay = document.getElementById(SHARE_OVERLAY_ID);
  if (overlay) removeModalOverlay(overlay);
}

export function openSharedProfileImportModal(id) {
  if (!SHARE_ID_RE.test(id || '')) return;
  renderProfileShareShell({
    title: 'Load Shared Profile',
    kicker: 'Encrypted Link',
    body: renderLoadShareBody(id),
  });
}

async function handleCreateSubmit(form) {
  const overlay = document.getElementById(SHARE_OVERLAY_ID);
  if (!overlay) return;
  const profileId = form.dataset.profileId || state.currentProfile;
  const passwordInput = /** @type {HTMLInputElement | null} */ (form.querySelector('#profile-share-password'));
  const expiresInput = /** @type {HTMLSelectElement | null} */ (form.querySelector('#profile-share-expires'));
  const password = passwordInput?.value || '';
  const expiresDays = expiresInput?.value || 7;
  try {
    setBusy(overlay, true, 'Creating...');
    setStatus('Encrypting profile and creating link...', 'info');
    const result = await createProfileShare({ profileId, password, expiresDays });
    saveShareRecord({
      id: result.id,
      profileId: result.profileId,
      profileName: result.profileName,
      shareUrl: result.shareUrl,
      manageToken: result.manageToken,
      createdAt: new Date().toISOString(),
      expiresAt: result.expiresAt,
    });
    const body = overlay.querySelector('.profile-share-body');
    if (!body) throw new Error('Profile share modal closed before the link was ready.');
    body.outerHTML = renderShareResultBody(result);
    showNotification('Encrypted profile link created', 'success');
  } catch (err) {
    setStatus(getErrorMessage(err, 'Could not create share link.'), 'error');
    showNotification(getErrorMessage(err, 'Could not create share link.'), 'error');
  } finally {
    setBusy(overlay, false);
  }
}

async function handleLoadSubmit(form) {
  const overlay = document.getElementById(SHARE_OVERLAY_ID);
  const id = form.dataset.shareId || '';
  const passwordInput = /** @type {HTMLInputElement | null} */ (form.querySelector('#profile-share-load-password'));
  const password = passwordInput?.value || '';
  try {
    setBusy(overlay, true, 'Loading...');
    setStatus('Fetching encrypted profile...', 'info');
    const envelope = await fetchProfileShareEnvelope(id);
    setStatus('Decrypting profile...', 'info');
    const exportObj = await decryptProfileShareEnvelope(envelope, password);
    const json = JSON.stringify(exportObj, null, 2);
    await importDataJSON(new File([json], 'getbased-shared-profile.json', { type: 'application/json' }));
    closeProfileShareModal();
    clearShareHash(id);
    showNotification(`Imported shared profile "${exportObj.profile.name}"`, 'success');
  } catch (err) {
    const message = /decrypt|operation|key|password/i.test(String(getErrorMessage(err, '')))
      ? 'Could not unlock shared profile. Check the password and try again.'
      : (getErrorMessage(err, 'Could not load shared profile.'));
    setStatus(message, 'error');
    showNotification(message, 'error');
  } finally {
    setBusy(overlay, false);
  }
}

async function handleDeleteShare(actionEl) {
  const overlay = document.getElementById(SHARE_OVERLAY_ID);
  const id = actionEl.dataset.shareId || '';
  const record = getShareRecord(id);
  const list = actionEl.closest('[data-profile-share-active-list]');
  const profileId = list?.dataset.profileId || state.currentProfile;
  const previousText = actionEl.textContent;
  try {
    actionEl.disabled = true;
    actionEl.textContent = 'Stopping...';
    await deleteProfileShareEnvelope(id, record?.manageToken || '');
    removeShareRecord(id);
    refreshActiveShareList(overlay, profileId);
    setStatus('Link stopped. It can no longer load the shared profile.', 'info');
    showNotification('Sharing link stopped', 'success');
  } catch (err) {
    actionEl.disabled = false;
    actionEl.textContent = previousText || 'Stop sharing';
    setStatus(getErrorMessage(err, 'Could not stop sharing link.'), 'error');
    showNotification(getErrorMessage(err, 'Could not stop sharing link.'), 'error');
  }
}

function clearShareHash(id) {
  if (!globalThis.history?.replaceState || parseProfileShareIdFromLocation() !== id) return;
  const url = new URL(globalThis.location.href);
  url.hash = '';
  url.searchParams.delete('share');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
}

function installProfileShareDelegates(overlay) {
  if (!overlay || overlay.dataset.profileShareDelegates === '1') return;
  overlay.dataset.profileShareDelegates = '1';
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeProfileShareModal();
      return;
    }
    const actionEl = event.target.closest('[data-profile-share-action]');
    if (!actionEl || !overlay.contains(actionEl)) return;
    const action = actionEl.dataset.profileShareAction;
    if (action === 'close') {
      event.preventDefault();
      closeProfileShareModal();
    } else if (action === 'regenerate') {
      event.preventDefault();
      const input = /** @type {HTMLInputElement | null} */ (document.getElementById('profile-share-password'));
      if (input) input.value = generateProfileSharePassword();
    } else if (action === 'copy') {
      event.preventDefault();
      const target = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (document.getElementById(actionEl.dataset.copyTarget || ''));
      copyText(actionEl.dataset.copyValue || target?.value || '', actionEl.dataset.copyLabel || 'Copied');
    } else if (action === 'delete-link') {
      event.preventDefault();
      void handleDeleteShare(actionEl);
    } else if (action === 'create' || action === 'load') {
      event.preventDefault();
      const form = actionEl.closest('[data-profile-share-form]');
      if (typeof form?.requestSubmit === 'function') {
        form.requestSubmit();
      } else if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    }
  });
  overlay.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-profile-share-form]');
    if (!form || !overlay.contains(form)) return;
    event.preventDefault();
    if (form.dataset.profileShareForm === 'create') {
      void handleCreateSubmit(form);
    } else if (form.dataset.profileShareForm === 'load') {
      void handleLoadSubmit(form);
    }
  });
}

let _lastOpenedShareId = '';
export function resetProfileShareDeepLinkState() {
  _lastOpenedShareId = '';
}

export function handleProfileShareDeepLink() {
  const id = parseProfileShareIdFromLocation();
  if (!id || id === _lastOpenedShareId) return;
  _lastOpenedShareId = id;
  openSharedProfileImportModal(id);
}

export function initProfileShareLinks() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handleProfileShareDeepLink, { once: true });
  } else {
    setTimeout(handleProfileShareDeepLink, 0);
  }
  addUtilsRuntimeListener('hashchange', handleProfileShareDeepLink);
}

if (typeof window !== 'undefined') {
  initProfileShareLinks();
}
