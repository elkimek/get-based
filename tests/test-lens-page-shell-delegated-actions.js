#!/usr/bin/env node
import { sourceFunctionHasStatement } from './helpers/native-source-contracts.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// Static lens page shell delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const shellSrc = fs.readFileSync(path.join(root, 'js/lens-page-shell.js'), 'utf8');
const lensPagesSrc = fs.readFileSync(path.join(root, 'js/lens-pages.js'), 'utf8');
const viewsSrc = fs.readFileSync(path.join(root, 'js/views.js'), 'utf8');




const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

console.log('=== Lens Page Shell Delegated Actions ===');

assert('lens-page-shell renders no inline event attributes',
  !/\bon(?:click|input|change|submit|keydown|keyup)=/.test(shellSrc));
assert('lens-page-shell no longer exports inlineHandlerCall',
  !shellSrc.includes('inlineHandlerCall') &&
    !viewsSrc.includes('inlineHandlerCall') &&
    !lensPagesSrc.includes('inlineHandlerCall'));
assert('lens-page-shell renders delegated action attributes',
  shellSrc.includes('export function lensPageActionAttrs') &&
    sourceFunctionHasStatement(shellSrc, 'lensPageActionAttrs', "return actionAttributes('lens-page', action, attrs);") &&
    shellSrc.includes("lensPageActionAttrs('move-widget'") &&
    shellSrc.includes("lensPageActionAttrs(action, { id: dashboardId })"));
assert('lens-page-shell installs an idempotent click delegate',
  shellSrc.includes('let lensPageShellDelegatesInstalled = false') &&
    shellSrc.includes("document.addEventListener('click', handleLensPageShellClick)") &&
    shellSrc.includes('installLensPageShellDelegates();'));
assert('lens-page-shell scopes delegated clicks to lens surfaces',
  shellSrc.includes("closest('.lens-page-header, .lens-page-widgets, #recommendations-page, .biology-coherence-hero')"));

[
  'move-widget',
  'add-dashboard-widget',
  'remove-dashboard-widget',
].forEach(action => {
  assert(`lens page action ${action} is handled`, shellSrc.includes(`action === '${action}'`));
});

assert('views.js passes lensPageActionAttrs into lens page handlers',
  viewsSrc.includes('lensPageActionAttrs') &&
    viewsSrc.includes("from './lens-page-shell.js'") &&
    viewsSrc.includes('lensPageActionAttrs,'));
assert('recommendations page dashboard toggle uses lens delegated action',
  lensPagesSrc.includes("lensPageActionAttrs(dashboardAction, { id: 'recommendations' })") &&
    !lensPagesSrc.includes("inlineHandlerCall(dashboardAction, 'recommendations')"));

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
if (legacyAssertions.fail > 0) process.exit(1);
