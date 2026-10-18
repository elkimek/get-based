#!/usr/bin/env node
import { readAuthoredRepositorySource as readRepositorySource } from './helpers/repository-source.js';
import { sourceFunctionHasStatement } from './helpers/native-source-contracts.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// Static lens page shell delegated-action source guards.

const shellSrc = readRepositorySource('js/lens-page-shell-core.js', 'utf8');
const lensPagesSrc = readRepositorySource('js/lens-pages.js', 'utf8');
const viewsSrc = readRepositorySource('js/views.js', 'utf8');

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
    readRepositorySource('js/components/LensWidgetTools.svelte', 'utf8').includes('data-lens-page-action="move-widget"') &&
    readRepositorySource('js/components/LensDashboardToggle.svelte', 'utf8').includes('data-lens-page-action={view.action}'));
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

assert('views.js passes typed chrome and grid into lens page handlers',
  viewsSrc.includes("from './lens-page-shell-core.js'") && viewsSrc.includes('getLensContentGrid,') && viewsSrc.includes('getLensWidgetChrome,'));
assert('recommendations page dashboard toggle uses lens delegated action',
  lensPagesSrc.includes("projectLensActions('tips', {recommendationsVisible})") &&
    readRepositorySource('js/components/LensActionButtons.svelte', 'utf8').includes('data-lens-page-action={button.action}') &&
    readRepositorySource('js/lens-content-presentation.js', 'utf8').includes("id: 'recommendations'") &&
    !lensPagesSrc.includes("inlineHandlerCall(dashboardAction, 'recommendations')"));

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
if (legacyAssertions.fail > 0) process.exit(1);
