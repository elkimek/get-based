#!/usr/bin/env node
import { readRepositorySource } from './helpers/repository-source.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// Static client-list delegated-action source guards.

const clientListImplSrc = readRepositorySource('js/client-list-impl.js', 'utf8');
const clientListFormSrc = readRepositorySource('js/client-list-form.js', 'utf8').replace(/\s+/g, ' ');
const clientListSrc = `${clientListImplSrc}\n${clientListFormSrc}`;
const profileSrc = readRepositorySource('js/profile.js', 'utf8');
const clientListUsesScrollLockedOverlay = /openModalOverlay\s*\(\s*overlay\s*,\s*\{\s*initialFocus:\s*['"]#cl-search['"]\s*,\s*scrollLock:\s*true\s*,?\s*\}\s*\)/s.test(clientListSrc);
const clientListClosesOverlay = /closeModalOverlay\s*\(\s*['"]client-list-overlay['"]\s*\)/.test(clientListSrc);

const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

console.log('=== Client List Delegated Actions ===');

assert('client-list.js renders no inline event attributes',
  !/\bon(?:click|change|input|search|keydown|keyup|submit)=/.test(clientListSrc));
assert('client-list.js uses data action attributes',
  clientListSrc.includes('data-cl-action') &&
    clientListSrc.includes('data-cl-input-action') &&
    clientListSrc.includes('data-cl-change-action') &&
    clientListSrc.includes('data-cl-submit-action') &&
    clientListSrc.includes('data-cl-key-action'));
assert('client-list.js installs idempotent delegates',
  clientListSrc.includes('let clientListDelegatesInstalled = false') &&
    clientListSrc.includes("document.addEventListener('click', _handleClientClick)") &&
    clientListSrc.includes("document.addEventListener('input', _handleClientInput)") &&
    clientListSrc.includes("document.addEventListener('change', _handleClientChange)") &&
    clientListSrc.includes("document.addEventListener('submit', _handleClientSubmit)") &&
    clientListSrc.includes("document.addEventListener('keydown', _handleClientKeydown)"));
assert('client-list menu buttons are data-driven',
  clientListSrc.includes('function _clMenuButton') &&
    clientListSrc.includes("action: 'pin-profile'") &&
    clientListSrc.includes("action: 'share-profile'") &&
    clientListSrc.includes("action: 'delete-profile'") &&
    !clientListSrc.includes('onclick:'));
assert('client-list can open share modal for selected profile',
  clientListSrc.includes('function _clShare(id)') &&
    clientListSrc.includes('clientListRuntime.openProfileShareModal(id)'));
assert('client-list routes app-shell actions through injectable runtime',
  clientListSrc.includes('export function configureClientListRuntime') &&
    clientListSrc.includes('clientListRuntime.exportAllDataJSON()') &&
    clientListSrc.includes('clientListRuntime.exportClientJSON(id, true)') &&
    clientListSrc.includes('clientListRuntime.importDataJSON(file)') &&
    clientListSrc.includes('clientListRuntime.loadDemoData(actionEl.dataset.clDemo'));
assert('client-list keeps browser adapters explicit and publishes no window bindings',
  clientListSrc.includes("from './client-list-runtime.js'") &&
    clientListSrc.includes('navigateClientListRoute') &&
    clientListSrc.includes('showClientListNotification') &&
    !clientListSrc.includes('publishClientListWindowBindings') &&
    !/\bwindow(?:\.|\s*\[)/.test(clientListSrc));
assert('client-list modal uses shared overlay lifecycle helpers',
  clientListSrc.includes("from './modal-lifecycle.js'") &&
    clientListUsesScrollLockedOverlay &&
    clientListClosesOverlay &&
    !clientListSrc.includes("document.body.style.overflow = 'hidden'") &&
    !clientListSrc.includes("document.body.style.overflow = ''"));
assert('dynamic avatar and tag buttons avoid direct onclick assignment',
  /\.setAttribute\(\s*['"]data-cl-action['"]\s*,\s*['"]remove-avatar['"]\s*\)/.test(clientListSrc) &&
    !clientListSrc.includes('.onclick'));
assert('height display rounds cm to whole numbers and inches to one decimal',
  clientListSrc.includes("unit === 'in' ? (heightCm / 2.54).toFixed(1) : String(Math.round(heightCm))") &&
    clientListSrc.includes("next === 'in' ? '0.1' : '1'") &&
    clientListSrc.includes("heightUnit === 'in' ? Math.round(heightRaw * 2.54 * 10) / 10 : Math.round(heightRaw)"));
assert('postal-area refinement stays ZIP-gated inside the debounce',
  /latitudeTimer\s*=\s*setTimeout\(\(\) => \{[\s\S]{0,100}if \(!zip\) return;[\s\S]{0,100}detectLatitudeWithAI\(country, zip\)/.test(clientListFormSrc) &&
    profileSrc.includes("meteo: 'postal_geocode'") &&
    profileSrc.includes('postalCode: String(zip).trim()'));

[
  'close',
  'open-form',
  'back-to-list',
  'select-profile',
  'edit-profile',
  'toggle-tools-menu',
  'trigger-json-import',
  'export-all',
  'load-demo',
  'tag-filter',
  'toggle-menu',
  'choose-avatar',
  'remove-avatar',
  'set-sex',
  'remove-tag',
  'height-unit',
  'health-metrics',
  'pin-profile',
  'unpin-profile',
  'flag-profile',
  'unflag-profile',
  'archive-profile',
  'unarchive-profile',
  'share-profile',
  'export-profile',
  'export-profile-chat',
  'delete-profile',
].forEach(action => {
  assert(`client-list action ${action} is handled`, clientListSrc.includes(`action === '${action}'`));
});

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
if (legacyAssertions.fail > 0) process.exit(1);
