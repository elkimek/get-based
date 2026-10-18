#!/usr/bin/env node
import { readRepositorySource } from './helpers/repository-source.js';
import { readServiceWorkerSource } from '../scripts/service-worker-source.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// Static sun-session UI delegated-action source guards.

const uiSrc = readRepositorySource('js/sun-session-ui.js', 'utf8');
const detailSrc = readRepositorySource('js/components/LightSessionDetail.svelte', 'utf8');
const activeSrc = readRepositorySource('js/components/LightActiveSession.svelte', 'utf8');
const controlsSrc = readRepositorySource('js/components/LightSessionControls.svelte', 'utf8');
const chipsSrc = readRepositorySource('js/components/LightSessionChips.svelte', 'utf8');
const actionSrc = readRepositorySource('js/sun-session-actions.js', 'utf8');
const sunSrc = readRepositorySource('js/sun.js', 'utf8');
const sunAiSrc = readRepositorySource('js/sun-ai-analysis.js', 'utf8');
const aiHookSrc = readRepositorySource('js/sun-session-ai-render-hooks.js', 'utf8');
const uiHookSrc = readRepositorySource('js/sun-session-ui-hooks.js', 'utf8');
const lightSunAiHooksSrc = readRepositorySource('js/light-sun-ai-hooks.js', 'utf8');
const appLightSunSrc = readRepositorySource('js/app-light-sun-modules.js', 'utf8');
const appUiShellSrc = readRepositorySource('js/app-ui-shell-modules.js', 'utf8');
const swSrc = readServiceWorkerSource(relative => readRepositorySource(relative, 'utf8'));

const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

console.log('=== Sun Session UI Delegated Actions ===');

const inlineHandlerRe = /\bon(?:click|keydown|submit|change|input)=/;

assert('sun-session-ui renders no inline event attributes',
  !inlineHandlerRe.test(uiSrc) && !inlineHandlerRe.test(detailSrc) && !inlineHandlerRe.test(activeSrc + controlsSrc + chipsSrc));
assert('sun-session-actions defines one shared action attribute helper',
  (actionSrc.match(/\bfunction\s+sunSessionActionAttrs\b/g) || []).length === 1 &&
    actionSrc.includes('data-sun-session-action=') &&
    actionSrc.includes('data-sun-session-${escapeAttr(dataAttrName(name))}=') &&
    actionSrc.includes("replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)") &&
    actionSrc.includes("value !== false"));
assert('sun-session-ui imports and installs idempotent action delegates',
  uiSrc.includes("from './sun-session-actions.js'") &&
    uiSrc.includes('const sunSessionDelegateActions = {') &&
    uiSrc.includes('installSunSessionActionDelegates(sunSessionDelegateActions)') &&
    actionSrc.includes('const sunSessionActionDelegateRoots = new WeakSet();') &&
    actionSrc.includes("root.addEventListener('click', event => handleSunSessionClick(event, actions))") &&
    actionSrc.includes("root.addEventListener('keydown', event => handleSunSessionKeydown(event, actions))"));
assert('sun-session-actions scopes delegated actions to the installed root',
  actionSrc.includes('event.currentTarget?.contains(actionEl)'));
assert('sun-session-actions keyboard delegate supports role-button rows and ignores form controls',
  actionSrc.includes('const SUN_SESSION_KEYBOARD_ACTIONS = new Set') &&
    actionSrc.includes("'open-detail'") &&
    actionSrc.includes("'forgot-stop'") &&
    actionSrc.includes("'open-channel'") &&
    actionSrc.includes("event.target?.closest?.('button, a, input, textarea, select')"));
assert('sun-session-actions expands chips via the owning chips container',
  actionSrc.includes("const container = actionEl.closest('.sun-channel-chips')") &&
    actionSrc.includes('setSunChannelChipsExpanded(container, !container.classList.contains(\'sun-chips-expanded\'))') &&
    !actionSrc.includes("actionEl.parentElement?.classList.toggle('sun-chips-expanded')"));
assert('sun-session-actions closes overlays through the shared lifecycle removal helper',
  actionSrc.includes("import { removeModalOverlay } from './modal-lifecycle.js';") &&
    actionSrc.includes('removeModalOverlay(overlay)') &&
    !actionSrc.includes("closest('.modal-overlay')?.remove()"));
assert('sun-session-actions routes active controls through injected actions',
  !actionSrc.includes('window.') &&
    actionSrc.includes('actions.quickLogSunSession') &&
    actionSrc.includes('actions.pauseSunSession') &&
    actionSrc.includes('actions.resumeSunSession') &&
    actionSrc.includes('actions.flipSidesMidSession') &&
    actionSrc.includes('actions.changeCoverageMidSession') &&
    actionSrc.includes('actions.applySunscreenMidSession') &&
    actionSrc.includes('actions.setOzoneOverrideMidSession') &&
    actionSrc.includes('actions.forgotStopPrompt') &&
    actionSrc.includes('actions.openChannelOnLightPage'));
assert('sun-session-ui direct module actions no longer route through window globals',
  !uiSrc.includes('window.openSunSessionDetail') &&
    !uiSrc.includes('window.deleteSunSession') &&
    !uiSrc.includes('window.editSunSessionDuration') &&
    !uiSrc.includes('window.renderSessionAIInline') &&
    !uiSrc.includes('window.renderSessionAIDetail') &&
    !uiSrc.includes('window.navigate'));
assert('sun-session-ui runtime render and navigate callbacks are startup-wired',
  uiSrc.includes('getSessionAIDetailView: () =>') &&
    uiSrc.includes('navigate: () =>') &&
    !uiSrc.includes('uiDeps.renderSessionAIInline(sess)') &&
    uiSrc.includes('uiDeps.getSessionAIDetailView(sess)') &&
    uiSrc.includes('function refreshLightView()') &&
    sunAiSrc.includes('registerAIActionHandler') &&
    !sunAiSrc.includes('Object.assign(window, {') &&
    !sunAiSrc.includes('window.refreshSessionAIAnalysis') &&
    !sunAiSrc.includes('window.analyzeSunSessionAI') &&
    !sunAiSrc.includes('window.maybeAnalyzeSessionAfterFinish') &&
    !sunAiSrc.includes('window.renderSessionAIInline') &&
    !sunAiSrc.includes('window.renderSessionAIDetail') &&
    aiHookSrc.includes("import { getSunSessionAIView } from './sun-ai-analysis.js';") &&
    aiHookSrc.includes("configureSunSessionUI({ getSessionAIDetailView: (session) => getSunSessionAIView(session, 'detail') })") &&
    lightSunAiHooksSrc.includes("import { maybeAnalyzeSessionAfterFinish } from './sun-ai-analysis.js';") &&
    lightSunAiHooksSrc.includes('configureSunSessionsStore({ maybeAnalyzeSessionAfterFinish })') &&
    uiHookSrc.includes("import { navigate } from './views-runtime.js';") &&
    uiHookSrc.includes('configureSunSessionUI({ navigate })') &&
    appLightSunSrc.includes("import './sun-session-ai-render-hooks.js';") &&
    appLightSunSrc.includes('configureSunSessionUI({ navigate });') &&
    !appUiShellSrc.includes("import './sun-session-ui-hooks.js';") &&
    swSrc.includes("'/js/sun-session-ai-render-hooks.js'") &&
    swSrc.includes("'/js/sun-session-ui-hooks.js'"));
assert('sun.js configures active sun-session delegated actions',
  sunSrc.includes('quickLogSunSession,') &&
    sunSrc.includes('pauseSunSession,') &&
    sunSrc.includes('resumeSunSession,') &&
    sunSrc.includes('flipSidesMidSession,') &&
    sunSrc.includes('changeCoverageMidSession,') &&
    sunSrc.includes('applySunscreenMidSession,') &&
    sunSrc.includes('setOzoneOverrideMidSession,') &&
    sunSrc.includes('forgotStopPrompt: _forgotStopPrompt') &&
    sunSrc.includes('openChannelOnLightPage: openSunChannelOnLightPageRuntime') &&
    sunSrc.includes("from './sun-runtime.js'"));

[
  'ignore',
  'open-detail',
  'delete-session',
  'quick-log-sun',
  'pause-session',
  'resume-session',
  'flip-sides',
  'change-coverage',
  'apply-sunscreen',
  'override-ozone',
  'forgot-stop',
  'open-channel',
  'close-modal',
  'edit-duration',
  'retry-calculation',
  'toggle-chips',
].forEach(action => {
  assert(`sun session action ${action} is handled`,
    actionSrc.includes(`action === '${action}'`));
});

[
  ['active detail', activeSrc, 'data-sun-session-action="open-detail" data-sun-session-id={view.id}'],
  ['quick log', controlsSrc, "data-sun-session-action={view.kind === 'sun' ? 'quick-log-sun' : undefined}"],
  ['pause and resume', controlsSrc, "data-sun-session-action={view.paused ? 'resume-session' : 'pause-session'} data-sun-session-id={view.id}"],
  ['side change', controlsSrc, "data-sun-session-action={view.rotated ? undefined : 'flip-sides'} data-sun-session-id={view.rotated ? undefined : view.id}"],
  ['coverage', controlsSrc, 'data-sun-session-action="change-coverage" data-sun-session-id={view.id}'],
  ['sunscreen', controlsSrc, 'data-sun-session-action="apply-sunscreen" data-sun-session-id={view.id}'],
  ['ozone', controlsSrc, 'data-sun-session-action="override-ozone"'],
  ['forgot stop', activeSrc, 'data-sun-session-action="forgot-stop" data-sun-session-id={view.id}'],
  ['channel expansion', chipsSrc, 'data-sun-session-action="toggle-chips" data-sun-session-hidden-count={chips.length - 3}'],
].forEach(([name, source, contract]) => {
  assert(`authored active session retains delegated ${name}`, source!.includes(contract!));
});

assert('authored Sun detail channel buttons retain channel-scoped delegated actions',
  detailSrc.includes("data-sun-session-action={view.kind === 'sun' ? 'open-channel' : undefined}") &&
    detailSrc.includes("data-sun-session-channel={view.kind === 'sun' ? item.key : undefined}") &&
    detailSrc.includes('aria-label={item.ariaLabel}'));
assert('authored Sun duration action retains the captured session ID',
  detailSrc.includes("data-sun-session-action={view.kind === 'sun' ? 'edit-duration' : undefined}") &&
    detailSrc.includes("data-sun-session-id={view.kind === 'sun' ? view.id : undefined}"));
assert('authored calculation retry retains the captured session ID and existing calculation service',
  detailSrc.includes('data-sun-session-action="retry-calculation" data-sun-session-id={view.id}') &&
    uiSrc.includes('sessionCalculationNotice(sess.calculationStatus)') &&
    actionSrc.includes('actions.retrySunSessionCalculation'));
assert('authored Sun delete action closes its owning modal and retains the captured session ID',
  detailSrc.includes("data-sun-session-action={view.kind === 'sun' ? 'delete-session' : undefined}") &&
    detailSrc.includes("data-sun-session-id={view.kind === 'sun' ? view.id : undefined}") &&
    detailSrc.includes("data-sun-session-close-modal={view.kind === 'sun' ? 'true' : undefined}"));

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
if (legacyAssertions.fail > 0) process.exit(1);
