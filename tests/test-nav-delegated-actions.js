#!/usr/bin/env node
// Static sidebar nav delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const navSrc = fs.readFileSync(path.join(root, 'js/nav.js'), 'utf8');

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

console.log('=== Sidebar Nav Delegated Actions ===');

assert('nav.js renders no inline event attributes',
  !/\bon(?:click|change|input|search|keydown|keyup|submit)=/.test(navSrc));
assert('nav.js renders delegated click actions',
  navSrc.includes('data-nav-action=') &&
    navSrc.includes("_navActionAttrs('navigate'") &&
    navSrc.includes("_navActionAttrs('toggle-group'") &&
    navSrc.includes("_navActionAttrs('toggle-group-ai'"));
assert('nav.js renders delegated search input action',
  navSrc.includes('data-nav-input-action="filter-sidebar"'));
assert('nav.js installs idempotent click and input delegates',
  navSrc.includes('let navDelegatesInstalled = false') &&
    navSrc.includes("document.addEventListener('click', handleNavActionClick)") &&
    navSrc.includes("document.addEventListener('input', handleNavInput)"));

[
  'navigate',
  'open-emf-assessment',
  'open-light-assessment',
  'open-knowledge-base',
  'open-custom-marker',
  'toggle-group',
  'toggle-group-ai',
  'open-client-list',
].forEach(action => {
  assert(`nav action ${action} is handled`, navSrc.includes(`action === '${action}'`));
});

assert('nav delegates are scoped to sidebar/profile surfaces',
  navSrc.includes("el.closest('#sidebar-nav, #profile-selector')"));
assert('group lookup avoids selector interpolation',
  navSrc.includes('function _findGroupHeader') &&
    navSrc.includes('el.dataset.groupName === groupName'));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
