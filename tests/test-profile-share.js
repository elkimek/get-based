#!/usr/bin/env node
// test-profile-share.js — encrypted single-profile share links

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf8');

let pass = 0, fail = 0;
function assert(name, condition, detail = '') {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Profile Share Tests ===\n');

const mod = await import('../js/profile-share.js');
const profileShareSrc = read('js/profile-share.js');
const exportSrc = read('js/export.js');
const settingsSrc = read('js/settings.js');
const settingsDataSrc = read('js/settings-data.js');
const profileShareLoaderSrc = read('js/profile-share-loader.js');
const appFeatureSrc = read('js/app-feature-modules.js');
const appShellHooksSrc = read('js/app-shell-hooks.js');
const apiShareSrc = [
  read('api/share.js'),
  read('lib/profile-share-service.js'),
  read('lib/profile-share-transition.js'),
  read('lib/profile-share-vercel-blob-store.js'),
].join('\n');
const devServerSrc = read('dev-server.js');
const modalCss = read('css/modal-shared.css');
const redesignCss = read('css/redesign-shell.css');
const packageJson = JSON.parse(read('package.json'));
const decompressJsonBytesSrc = /async function decompressJsonBytes[\s\S]*?\n}\n\nfunction clampExpiryDays/.exec(profileShareSrc)?.[0] || '';

console.log('1. Encrypted envelope behavior');
try {
  const sampleExport = {
    version: 2,
    exportedAt: '2026-06-02T12:00:00.000Z',
    profile: { name: 'Private Patient', sex: 'female', dob: '1985-04-10' },
    entries: [{ date: '2026-05-30', markers: { metabolic_glucose: 86 } }],
    notes: [],
    supplements: [],
  };
  const secret = 'correct-horse-1234';
  const envelope = await mod.encryptProfileShareEnvelope(sampleExport, secret, {
    iterations: mod.PROFILE_SHARE_MIN_KDF_ITERATIONS,
    expiresDays: 1,
  });
  const serializedEnvelope = JSON.stringify(envelope);
  assert('Envelope uses getbased profile-share schema', envelope.schema === 'getbased-profile-share' && envelope.version === 1);
  assert('Envelope stores PBKDF2 + AES-GCM metadata', envelope.kdf?.name === 'PBKDF2' && envelope.kdf?.hash === 'SHA-256' && envelope.cipher?.name === 'AES-GCM');
  assert('Envelope keeps profile name inside ciphertext', !serializedEnvelope.includes('Private Patient'));
  assert('Envelope has base64url ciphertext', /^[A-Za-z0-9_-]+$/.test(envelope.ciphertext));
  const decrypted = await mod.decryptProfileShareEnvelope(envelope, secret);
  assert('Correct secret decrypts the v2 export', decrypted.profile.name === 'Private Patient' && decrypted.entries[0].markers.metabolic_glucose === 86);
  assert('Envelope enforces the profile-share KDF floor',
    envelope.kdf?.iterations >= mod.PROFILE_SHARE_MIN_KDF_ITERATIONS);
  let weakKdfFailed = false;
  try {
    await mod.decryptProfileShareEnvelope({
      ...envelope,
      kdf: { ...envelope.kdf, iterations: mod.PROFILE_SHARE_MIN_KDF_ITERATIONS - 1 },
    }, secret);
  } catch { weakKdfFailed = true; }
  assert('Weak shared-profile KDF settings are rejected', weakKdfFailed);
  let wrongFailed = false;
  try { await mod.decryptProfileShareEnvelope(envelope, 'wrong-horse-1234'); } catch { wrongFailed = true; }
  assert('Wrong secret fails to decrypt', wrongFailed);
  assert('Shared profile decompression enforces an expanded-size cap',
    mod.PROFILE_SHARE_MAX_DECOMPRESSED_BYTES === 37_500_000 &&
    decompressJsonBytesSrc.includes('stream.getReader()') &&
    decompressJsonBytesSrc.includes('totalBytes') &&
    decompressJsonBytesSrc.includes('reader.cancel()') &&
    !decompressJsonBytesSrc.includes('new Response(stream).arrayBuffer()'));
} catch (err) {
  assert('Encrypted envelope round-trip', false, err.message);
}

console.log('2. Share link shape');
try {
  const id = 'abcdefghijklmnopqrstuvwx';
  const url = mod.buildProfileShareUrl(id, { origin: 'https://getbased.health', pathname: '/app' });
  assert('Share URL uses hash route', url === `https://getbased.health/app#share/${id}`, url);
  assert('Share URL does not include a secret query parameter', !/[?&](password|secret|key)=/i.test(url));
  const parsed = mod.parseProfileShareIdFromLocation({ hash: `#share/${id}`, href: url });
  assert('Hash parser extracts share id', parsed === id);
} catch (err) {
  assert('Share link helpers', false, err.message);
}

console.log('3. App wiring and UI source');
assert('profile-share module imports reusable export builder',
  profileShareSrc.includes("import { buildClientExportObject, importDataJSON } from './export.js'"));
assert('Profile share module loads lazily with a cached retry path',
  profileShareLoaderSrc.includes("import('./profile-share.js')") &&
  profileShareLoaderSrc.includes("import('./profile-share.js?lazy-retry=1')") &&
  profileShareLoaderSrc.includes('let _profileShareModuleLoad = null') &&
  profileShareLoaderSrc.includes('handleProfileShareLoaderDeepLink') &&
  !appFeatureSrc.includes('app-data-io-modules.js') &&
  !appShellHooksSrc.includes("from './profile-share.js'") &&
  appShellHooksSrc.includes("from './profile-share-loader.js'"));
assert('Settings Data tab exposes Share Profile action',
  settingsDataSrc.includes("data-settings-action=\"share-profile\"") &&
  settingsSrc.includes('settingsRuntime.openProfileShareModal()') &&
  settingsSrc.includes('openProfileShareModal: () => {}') &&
  appShellHooksSrc.includes('configureSettingsRuntime') &&
  appShellHooksSrc.includes('openProfileShareModal'));
assert('Share modal has dedicated shared-modal styling',
  modalCss.includes('#profile-share-overlay.modal-overlay') &&
  modalCss.includes('.profile-share-modal') &&
  modalCss.includes('.profile-share-input-row') &&
  modalCss.includes('.profile-share-icon-btn') &&
  modalCss.includes('.profile-share-consent') &&
  modalCss.includes('.profile-share-active') &&
  modalCss.includes('.profile-share-status[data-status="error"]'));
assert('Share modal requires explicit encrypted upload consent',
  profileShareSrc.includes('id="profile-share-consent" type="checkbox" required') &&
  profileShareSrc.includes('The link finds a locked copy of the profile') &&
  profileShareSrc.includes('The password is the only way to unlock it') &&
  profileShareSrc.includes('temporary share copies are not backed up') &&
  profileShareSrc.includes('Anyone with both the link and password can open it'));
assert('Share modal lists and can stop links created on this device',
  profileShareSrc.includes('const SHARE_RECORDS_KEY') &&
  profileShareSrc.includes('function renderActiveShareList') &&
  profileShareSrc.includes('Created on this device') &&
  profileShareSrc.includes('data-profile-share-action="delete-link"') &&
  profileShareSrc.includes('async function deleteProfileShareEnvelope') &&
  profileShareSrc.includes('manageToken') &&
  profileShareSrc.includes("method: 'DELETE'"));
assert('Share profile has a top-level header action',
  read('index.html').includes('data-shell-action="share-profile"') &&
  read('js/shell-actions.js').includes("action === 'share-profile'") &&
  read('js/shell-actions.js').includes('shellProfileShareDeps.openProfileShareModal()') &&
  read('js/app-shell-hooks.js').includes('configureShellProfileShareDeps({ openProfileShareModal });'));
assert('Mobile share path moves into client list menu',
  read('js/client-list-impl.js').includes("label: 'Share Profile', action: 'share-profile'") &&
  read('js/client-list-impl.js').includes('clientListRuntime.openProfileShareModal(id)') &&
  read('js/app-shell-hooks.js').includes('configureClientListRuntime') &&
  read('js/app-shell-hooks.js').includes('openProfileShareModal') &&
  /@media \(max-width: 768px\), \(pointer: coarse\)[\s\S]*\.header-share-btn\s*\{[\s\S]*display:\s*none/.test(redesignCss));
assert('Share modal can target a selected profile id',
  profileShareSrc.includes('openProfileShareModal(profileId = state.currentProfile)') &&
  profileShareSrc.includes('data-profile-id="${escapeAttr(profileId || \'\')}"') &&
  profileShareSrc.includes('createProfileShare({ profileId, password, expiresDays })'));
assert('Share result uses icon copy buttons',
  profileShareSrc.includes('const COPY_ICON') &&
  profileShareSrc.includes('class="profile-share-icon-btn" data-profile-share-action="copy"') &&
  profileShareSrc.includes('aria-label="Copy link"') &&
  profileShareSrc.includes('aria-label="Copy password"'));
assert('Profile share helpers stay module-only',
  profileShareSrc.includes('export function openProfileShareModal') &&
  profileShareSrc.includes('export async function decryptProfileShareEnvelope') &&
  profileShareSrc.includes('export function parseProfileShareIdFromLocation') &&
  !profileShareSrc.includes('Object.assign(window'));

console.log('4. Export/import reuse and credential boundaries');
assert('buildClientExportObject stays module-only, not window-exposed',
  exportSrc.includes('export async function buildClientExportObject') &&
  !exportSrc.includes('publishExportGlobals') &&
  !exportSrc.includes('Object.assign(window'));
assert('exportClientJSON downloads the reusable export object',
  exportSrc.includes('exportObj = await buildClientExportObject(profileId, includeChat)') &&
  exportSrc.includes('new Blob([JSON.stringify(exportObj, null, 2)]'));
assert('Single-profile export still excludes wearableConnections',
  !/wearableConnections:\s*data\.wearableConnections/.test(exportSrc));
assert('Shared profile import uses existing importDataJSON path',
  profileShareSrc.includes("await importDataJSON(new File([json], 'getbased-shared-profile.json'"));

console.log('5. Vercel Blob API safeguards');
assert('Edge API avoids importing the Node-only @vercel/blob client',
  !apiShareSrc.includes("from '@vercel/blob'"));
assert('Edge API uses the shared private Vercel Blob REST boundary',
  packageJson.dependencies?.['@vercel/blob'] === '2.8.0' &&
  apiShareSrc.includes("from './vercel-blob-rest.js'") &&
  apiShareSrc.includes("access: 'private'") &&
  apiShareSrc.includes('BLOB_READ_WRITE_TOKEN'));
assert('API validates share ids, size, expiry, and crypto envelope',
  apiShareSrc.includes('SHARE_ID_RE') &&
  apiShareSrc.includes('MAX_SHARE_BYTES') &&
  apiShareSrc.includes('MAX_TTL_MS') &&
  apiShareSrc.includes('MIN_KDF_ITERATIONS') &&
  apiShareSrc.includes("envelope.schema !== SHARE_SCHEMA") &&
  apiShareSrc.includes("envelope.cipher?.name !== 'AES-GCM'"));
assert('API rate limits unauthenticated share creation',
  apiShareSrc.includes('RATE_LIMIT_PREFIX') &&
  apiShareSrc.includes('POST_RATE_LIMIT_MAX') &&
  apiShareSrc.includes('isBlobPreconditionFailure') &&
  apiShareSrc.includes('rateLimitMarkerPath') &&
  apiShareSrc.includes('enforcePostRateLimit') &&
  apiShareSrc.includes('cleanupExpiredBlobState') &&
  apiShareSrc.includes('allowOverwrite: false') &&
  apiShareSrc.includes('status') &&
  apiShareSrc.includes('429'));
assert('API only allows localhost CORS in development',
  apiShareSrc.includes("process.env.NODE_ENV === 'development'") &&
  apiShareSrc.includes("['localhost', '127.0.0.1'].includes(originUrl.hostname)"));
assert('Hosted transition is bounded and does not migrate opaque records',
  profileShareSrc.includes("OPERATED_PROFILE_SHARE_ID_PREFIX = 'vps1_'") &&
  apiShareSrc.includes('MAX_LEGACY_WINDOW_MS') &&
  apiShareSrc.includes('GETBASED_PROFILE_SHARE_TRANSITION_STARTED_AT') &&
  apiShareSrc.includes('GETBASED_PROFILE_SHARE_LEGACY_BLOB_UNTIL') &&
  apiShareSrc.includes('redirectToUpstream') &&
  !apiShareSrc.includes('migrateProfileShare'));
assert('API requires local management token to stop new links',
  apiShareSrc.includes('manageTokenHash') &&
  apiShareSrc.includes('MANAGE_TOKEN_HASH_RE') &&
  apiShareSrc.includes('x-profile-share-manage-token') &&
  devServerSrc.includes('PROFILE_SHARE_MIN_KDF_ITERATIONS') &&
  devServerSrc.includes('PROFILE_SHARE_MANAGE_TOKEN_HASH_RE') &&
  devServerSrc.includes('This link can only be stopped from the browser that created it.'));
assert('API never accepts or stores a password field',
  !/body\.(password|passphrase|secret)|parsed\.(password|passphrase|secret)/.test(apiShareSrc));
assert('Dev server mirrors /api/share without disk writes',
  devServerSrc.includes("if (pathname === '/api/share')") &&
  devServerSrc.includes('PROFILE_SHARE_DEV_STORE = new Map()'));

if (fail) {
  console.log(`\nProfile share tests: ${pass} passed, ${fail} failed`);
  process.exit(1);
} else {
  console.log(`\nProfile share tests: ${pass} passed, 0 failed`);
}
