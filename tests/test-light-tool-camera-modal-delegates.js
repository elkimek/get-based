#!/usr/bin/env node
// Static guards for light camera modal close controls.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const modalSrc = fs.readFileSync(path.join(root, 'js/light-tool-camera-modals.js'), 'utf8');
const cameraSrc = fs.readFileSync(path.join(root, 'js/light-tool-camera.js'), 'utf8');
const src = `${modalSrc}\n${cameraSrc}`;

let passed = 0;
let failed = 0;

function assert(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.log(`  FAIL: ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

function countNeedle(needle) {
  return src.split(needle).length - 1;
}

const closeActions = [
  'close-lux',
  'close-flicker',
  'close-dark',
  'close-cct',
  'close-spec',
  'close-glass',
];
const inlineHandlerRe = /\bon(?:click|keydown|submit|change|input)=/;

console.log('=== Light Tool Camera Modal Delegates ===');

assert('light camera modal templates render no inline event attributes',
  !inlineHandlerRe.test(src));
assert('light camera modals use shared delegated action helper',
  modalSrc.includes('function lightToolModalActionAttrs') &&
    modalSrc.includes('data-light-tool-modal-action') &&
    modalSrc.includes('function _handleLightToolModalClick') &&
    modalSrc.includes("overlay.addEventListener('click', _handleLightToolModalClick);"));
assert('light camera aiming guide dismiss uses delegated action helper',
  cameraSrc.includes('data-aiming-guide-action="dismiss"') &&
    cameraSrc.includes('function _handleAimingGuideClick') &&
    cameraSrc.includes("document.addEventListener('click', _handleAimingGuideClick)") &&
    cameraSrc.includes('window._dismissAimingGuide?.(toolKey);'));

for (const action of closeActions) {
  assert(`light camera close action ${action} is rendered twice`,
    modalSrc.split(`lightToolModalActionAttrs('${action}')`).length - 1 === 2);
  assert(`light camera close action ${action} is handled`,
    modalSrc.includes(`action === '${action}'`));
}

assert('light camera close delegates are installed for each modal',
  modalSrc.split('installLightToolModalDelegates(overlay);').length - 1 === 6);

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
