#!/usr/bin/env node
import {renderHTML} from '../js/components/LightCameraPresentation.svelte.html.js';
import {projectAimingGuide, type CameraToolKey} from '../js/light-camera-presentation.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// Static guards for light camera modal close controls.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const facadeSrc = fs.readFileSync(path.join(root, 'js/light-tool-camera-modals.js'), 'utf8');
const runtimeSrc = fs.readFileSync(path.join(root, 'js/light-tool-camera-modal-runtime.js'), 'utf8');
const modalSrc = [
  'light-tool-lux-meter.js',
  'light-tool-flicker-detector.js',
  'light-tool-darkness-meter.js',
  'light-tool-cct-meter.js',
  'light-tool-spectrum-classifier.js',
  'light-tool-glass-transmission.js',
].map(file => fs.readFileSync(path.join(root, 'js', file), 'utf8')).join('\n');
const guideSrc = fs.readFileSync(path.join(root, 'js/components/LightAimingGuide.svelte'), 'utf8');
const cameraSrc = fs.readFileSync(path.join(root, 'js/light-tool-camera.js'), 'utf8');
const src = `${facadeSrc}\n${runtimeSrc}\n${modalSrc}\n${cameraSrc}`;

const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

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
  runtimeSrc.includes('function lightToolModalActionAttrs') &&
    runtimeSrc.includes('data-light-tool-modal-action') &&
    runtimeSrc.includes('function handleLightToolModalClick') &&
    runtimeSrc.includes("overlay.addEventListener('click', handleLightToolModalClick);"));
assert('light camera aiming guide dismiss uses delegated action helper',
  guideSrc.includes('data-aiming-guide-action="dismiss"') &&
    cameraSrc.includes('function _handleAimingGuideClick') &&
    cameraSrc.includes("document.addEventListener('click', _handleAimingGuideClick)") &&
    cameraSrc.includes('dismissAimingGuide(toolKey);') &&
    !cameraSrc.includes('window._dismissAimingGuide'));

for (const action of closeActions) {
  const tool = ({'close-lux':'lux','close-flicker':'flicker','close-dark':'darkness','close-cct':'cct','close-spec':'spectrum','close-glass':'glass-transmission'} as const)[action as 'close-lux'];
  const html = renderHTML({kind:'shell', view:{tool:tool as CameraToolKey,guide:projectAimingGuide(tool)}});
  assert(`light camera close action ${action} is rendered twice`,
    html.split(`data-light-tool-modal-action="${action}"`).length - 1 === 2);
  assert(`light camera close action ${action} has no inline event attributes`, !inlineHandlerRe.test(html));
  assert(`light camera close action ${action} is handled`,
    facadeSrc.includes(`closeCameraTool('${action}')`) &&
      modalSrc.includes(`registerCameraToolCloser('${action}'`) &&
      modalSrc.includes(`clearCameraToolCloser('${action}'`));
}

assert('light camera close delegates are installed for each modal',
  modalSrc.split('installLightToolModalDelegates(overlay);').length - 1 === 6);

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
if (legacyAssertions.fail > 0) process.exit(1);
