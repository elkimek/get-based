#!/usr/bin/env node
import { sourceFunctionHasStatement, sourceFunctionHasVariable } from './helpers/native-source-contracts.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// test-prelab.ts — Verify pre-lab onboarding: context cards → test recommendations
//
// Static source inspection only — fs.readFileSync instead of fetch.
//
// Run: node tests/test-prelab.ts  (or via npm test)

import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { projectDashboardWelcomeView, renderDashboardWelcomeFragment } from '../js/dashboard-welcome-presentation.js';
import postcss from 'postcss';
import { projectChatEmpty } from '../js/chat-empty-presentation.js';
import { reportBuilderClasses } from '../js/report-builder-classes.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');
const CSS_FILES = ['styles.css', 'css/app-shell.css', 'css/import.css', 'css/emf.css', 'css/modal-shared.css', 'css/dashboard-core.css', 'css/dashboard-widgets.css', 'css/dashboard-welcome.css', 'css/dashboard-data.css', 'css/category-views.css', 'css/context-profile.css', 'css/context-editor.css', 'css/genetics.css', 'css/data-protection.css', 'css/settings.css', 'css/mobile-dashboard.css', 'css/cycle.css', 'css/marker-detail-modal.css', 'css/recommendations.css', 'css/client-list.css', 'css/wearables.css', 'css/light-sun.css', 'css/light-channels.css', 'css/light-devices.css', 'css/light-conditions-now.css', 'css/light-setup.css', 'css/light-tools.css', 'css/light-env.css', 'css/chat-panel.css', 'css/chat-panel-open.css', 'css/chat-personality.css', 'css/chat-messages.css', 'css/chat-composer.css', 'css/chat-onboarding.css', 'css/chat-responsive.css', 'css/chat-actions.css', 'css/chat-mobile.css', 'css/redesign-shell.css', 'css/chat-redesign.css', 'css/chat-redesign-open.css'];
const readCssBundle = () => CSS_FILES.map(read).join('\n');


const { assert, results: legacyAssertions } = createLegacyAssertions();

console.log('=== Pre-Lab Onboarding Tests ===\n');

const chatSrc = read('js/chat.js');
const chatPanelSrc = read('js/chat-panel.js');
const chatOnboardingSrc = read('js/chat-onboarding.js');
const providerQuizSrc = read('js/components/ChatProviderQuiz.svelte');
const chatProfileFormSrc = read('js/components/ChatProfileSetup.svelte');
const chatProfileStylesSrc = read('js/chat-profile-onboarding-classes.ts');
const chatEmptyStateSrc = read('js/chat-empty-state.js').replace(/if \(hasLabs\)\s+return null;/g, 'if (hasLabs) return null;');
const chatRenderSrc = read('js/chat-render.js');
const chatSendSrc = read('js/chat-send.js');
const labCtxSrc = read('js/lab-context-assembly.js');
const onboardingViewSrc = read('js/onboarding-view.js');
const onboardingRuntimeSrc = read('js/onboarding-view-runtime.js');
const chatEmptyViewSrc = read('js/components/ChatEmptyState.svelte');
const chatCatalogOwnerSrc = read('js/chat-empty-catalog-component.js');
const chatEmptyProjectorSrc = read('js/chat-empty-presentation.ts');
const medicalHistoryViewSrc = read('js/context-medical-history-view.js');
const medicalHistoryComponentSrc = read('js/components/ContextMedicalHistory.svelte');
const lifestyleFormViewSrc = read('js/context-lifestyle-form-view.js');
const lifestyleFormComponentSrc = read('js/components/LifestyleContextForm.svelte');
const reportBuilderViewSrc = read('js/components/ReportBuilderPresentation.svelte');
const reportBuilderAISrc = read('js/components/ReportBuilderAI.svelte');


  assert('No sentinel return string', !labCtxSrc.includes("return 'No lab data is currently loaded for this profile.'"),
    'The old sentinel early-return should be removed');
  assert('hasLabData respects lab marker context toggle',
    labCtxSrc.includes('const includeLabMarkers = ignoreContextToggles || isLabMarkersContextEnabled()') &&
    labCtxSrc.includes('const hasImportedLabData = data.dates.length > 0 || Object.values(data.categories).some(c => c.singleDate)') &&
    labCtxSrc.includes('const hasLabData = includeLabMarkers && hasImportedLabData'),
    'Should compute imported lab presence separately from the user-controlled lab marker context toggle');
  assert('No-data header includes profile context', labCtxSrc.includes("Profile context (sex:"),
    'No-data header should say "Profile context" not "Lab data"');
  assert('No-data NOTE recommends tests and respects Insight cards source',
    labCtxSrc.includes('recommend which blood panels') &&
      labCtxSrc.includes('The more Insight Context Cards') &&
      labCtxSrc.includes('Insight Context Cards are turned off by the user'),
    'NOTE should recommend panels, gently nudge enabled cards, and respect disabled cards');
  assert('No-data path flags missing demographics', labCtxSrc.includes('missingDemo') && labCtxSrc.includes("urge the user to set"),
    'Should add IMPORTANT warning when sex/DOB missing');
  assert('Lab values section gated by hasLabData', labCtxSrc.includes('if (hasLabData) {') && labCtxSrc.includes('formatMarkerValuesForChat'),
    'Lab values should be wrapped in if (hasLabData)');
  assert('Biology Scores context receives an explicit trusted full-context override',
    labCtxSrc.includes('labContextDeps.buildBiologyScoresAIContext?.(data, { limit: 7, ignoreContextToggles })'),
    'Trusted internal review should be able to include Biology Score context flags explicitly');
  assert('Lab context avoids a duplicate flagged-results inventory',
    !labCtxSrc.includes('getAllFlaggedMarkers') && !labCtxSrc.includes('[critical]'),
    'Marker lines already carry distinct range comparisons; do not repeat a mode-dependent flag list');
  assert('Staleness uses hasLabData guard', labCtxSrc.includes('if (hasLabData && data.dates.length > 0)'),
    'Staleness signal should check hasLabData first');

  // Sections 5-16 (notes, conditions, supplements, cycle, lifestyle cards) should NOT be gated by hasLabData
  assert('User Notes section not gated by hasLabData', sourceFunctionHasVariable(labCtxSrc, '_buildLabContextInner', 'notes'),
    'User Notes should be at top level, not inside hasLabData block');
  assert('Medical History section not gated by hasLabData', labCtxSrc.includes("// ── 6. Medical History"),
    'Medical history should serialize without lab data');
  assert('Diet section not gated by hasLabData', labCtxSrc.includes("// ── 9. Diet"),
    'Diet should serialize without lab data');

  // ═══════════════════════════════════════
  // 2. Context-aware chat prompts
  // ═══════════════════════════════════════
  console.log('%c 2. Context-Aware Chat Prompts ', 'font-weight:bold;color:#f59e0b');

  assert('_getNoDataPrompts helper exists', chatEmptyStateSrc.includes('function _getNoDataPrompts()'),
    'Module-private helper should exist');
  assert('0-cards prompts: "What should I tell you"', chatEmptyStateSrc.includes("'What should I tell you about myself first?'"),
    'Should have card-filling encouragement prompt');
  assert('0-cards prompts: "What blood tests"', chatEmptyStateSrc.includes("'What blood tests are worth getting?'"),
    'Should have general test advice prompt');
  assert('0-cards prompts: "Where do I start"', chatEmptyStateSrc.includes("'Where do I start with optimizing my health?'"),
    'Should have getting-started prompt');
  assert('Some-cards prompts: "Based on my profile"', chatEmptyStateSrc.includes("'Based on my profile, what blood tests should I get?'"),
    'Should have personalized recommendation prompt');
  assert('Some-cards prompts: "What panels"', chatEmptyStateSrc.includes("'What panels would help with my health goals?'"),
    'Should have goals-based panel prompt');
  assert('Some-cards prompts: "Tell my doctor"', chatEmptyStateSrc.includes("'What should I tell my doctor to test for?'"),
    'Should have doctor-facing prompt');
  assert('Some-cards prompts: "Most relevant"', chatEmptyStateSrc.includes("'Which markers are most relevant to my lifestyle?'"),
    'Should have lifestyle-based prompt');
  assert('renderChatMessages delegates empty state', chatRenderSrc.includes('renderEmptyChatState(container, panel)'),
    'renderChatMessages should delegate empty/onboarding state');
  assert('empty state uses _getNoDataPrompts', sourceFunctionHasVariable(chatEmptyStateSrc, 'renderGeneralPromptState', 'prompts') &&
    chatEmptyStateSrc.includes('const prompts = _getNoDataPrompts() || [') &&
    sourceFunctionHasStatement(chatEmptyStateSrc, 'renderGeneralPromptState',
      "return renderEmptyPresentationState(container, 'general', context, { prompts });", 'last'),
    'Empty-state renderer should call the helper');
  assert('Prompts rendered dynamically', chatEmptyStateSrc.includes("from './chat-empty-presentation.js'") &&
    chatEmptyProjectorSrc.includes('actions.push(...(input.prompts || []).map(value => prompt(value, value)))') &&
    chatEmptyViewSrc.includes('{#each view.actions as item}{@render action(item)}') &&
    JSON.stringify(projectChatEmpty({kind:'general', personalityLabel:'', connected:false,
      prompts:['First','<literal>&']}).actions.map(item => [item.label,item.prompt,item.action])) ===
      JSON.stringify([['First','First','use-prompt'],['<literal>&','<literal>&','use-prompt']]),
    'Prompt buttons should be generated from array');
  assert('Has lab data returns null', chatEmptyStateSrc.includes('if (hasLabs) return null'),
    '_getNoDataPrompts should return null when labs exist');
  assert('Counts filled cards', chatEmptyStateSrc.includes('filledCount === 0'),
    'Should branch on card fill count');

  // ═══════════════════════════════════════
  // 3. System prompt — no-data instructions
  // ═══════════════════════════════════════
  console.log('%c 3. System Prompt No-Data Section ', 'font-weight:bold;color:#f59e0b');

  const chatSystemPromptSrc = read('js/chat-system-prompt.js');

  assert('Has a no-lab-results section', chatSystemPromptSrc.includes('## When No Lab Results Exist'),
    'CHAT_SYSTEM_PROMPT should have no-data section');
  assert('Advises a focused pre-lab role', chatSystemPromptSrc.includes('Help the user choose a focused set of tests'),
    'Should make the no-data conversation immediately useful');
  assert('Recommends tailored panels', chatSystemPromptSrc.includes('based on the provided goals, age, sex, conditions, lifestyle, and environment'),
    'Should instruct personalized recommendations');
  assert('Explains why each panel is relevant', chatSystemPromptSrc.includes('give one short reason for each'),
    'Should instruct per-panel reasoning');
  assert('No-lab card nudge respects disabled Insight Context Cards',
    chatSystemPromptSrc.includes('Respect disabled Insight Context Cards') &&
      chatSystemPromptSrc.includes('mention only the most useful missing context') &&
      chatSystemPromptSrc.includes('without turning the response into a setup checklist'),
    'Should nudge gently when useful and respect disabled card context');
  assert('Sex and age materially shape selection', chatSystemPromptSrc.includes('If age or sex is missing and materially changes selection'),
    'Should instruct AI about importance of demographics');
  assert('Missing demographics should be surfaced when material', chatSystemPromptSrc.includes('If age or sex is missing') && chatSystemPromptSrc.includes('say so'),
    'Should surface missing demographics without a rigid setup script');
  assert('Menstrual timing is profile-gated',
    chatSystemPromptSrc.includes('Apply cycle-phase reasoning only when an active natural menstrual cycle') &&
      chatSystemPromptSrc.includes('Do not infer it for male'),
    'Should not give cycle-phase timing to male/non-cycling profiles');
  assert('Never apologize instruction', chatSystemPromptSrc.includes('do not apologize for absent data'),
    'Should not apologize');
  assert('Never imply absent results', chatSystemPromptSrc.includes('Never imply results or trends that are not present'),
    'Should not hallucinate results');
  assert('Keeps no-data recommendations focused', chatSystemPromptSrc.includes('choose a focused set of tests'),
    'Should avoid turning a concise answer into a universal panel inventory');

  // ═══════════════════════════════════════
  // 4. Dashboard nudge subtitle
  // ═══════════════════════════════════════
  console.log('%c 4. Dashboard Nudge Subtitle ', 'font-weight:bold;color:#f59e0b');

  const catalogSrc = read('js/components/ContextCardCatalog.svelte');
  const ccSrc = read('js/context-cards.js') + '\n' + catalogSrc;
  const healthDotsSrc = read('js/context-card-health-dots.js');
  const ctxEditorSrc = read('js/context-card-editor-ui.js');
  const lifestyleEditorSrc = read('js/context-card-lifestyle-editors-impl.js');
  const medicalHistoryEditorSrc = read('js/context-card-medical-history-editor-impl.js');

  assert('context-cards imports getActiveData', ccSrc.includes("import { saveImportedData, getActiveData } from './data.js'"),
    'Should import getActiveData for lab data check');
  assert('health-dot module imports hasCardContent', /import\s+{[^}]*hasCardContent[^}]*}\s+from '\.\/utils\.js'/.test(healthDotsSrc),
    'Should import hasCardContent for health dots fix');
  assert('Checks hasLabs for subtitle', ccSrc.includes('_ccHasLabs'),
    'Should compute hasLabs in renderProfileContextCards');
  assert('Profile context copy stays optional', ccSrc.includes('Add only what is relevant'),
    'Should not pressure users to fill every context area');
  assert('No-lab subtitle offers a useful next step', ccSrc.includes('use Chat to plan which labs may be useful for you'),
    'Should explain the no-lab workflow without requiring all 9 cards');
  assert('Lab-aware subtitle explains context value', ccSrc.includes('help interpretations reflect your goals, history, and daily life'),
    'Should explain why context matters when labs are present');
  assert('context-section-subtitle class used', ccSrc.includes('context-section-subtitle'),
    'Should use the CSS class');
  assert('Dashboard checks missing demographics', ccSrc.includes('_ccMissingDemo'),
    'Should detect missing sex/DOB');
  assert('Dashboard sex/DOB hint in subtitle', ccSrc.includes('Age and sex in Settings also shape interpretation'),
    'Should nudge sex/DOB when missing');
  assert('Subtitle adapts when labs are present', /_ccHasLabs\s*\?/.test(ccSrc),
    'Should adapt the explanation to whether the profile has labs');

  // CSS check
  const cssSrc = readCssBundle();
  assert('.context-section-subtitle uses scoped styling', catalogSrc.includes('context-section-subtitle gb:context-catalog:'),
    'CSS should define the subtitle class');
  assert('Subtitle font-size 13px', /context-section-subtitle[^\n]*gb:context-catalog:text-\[13px\]/.test(catalogSrc),
    'Subtitle should be 13px');
  assert('Profile context grid is container-aware',
    catalogSrc.includes('[container-type:inline-size]')
      && catalogSrc.includes('@min-[580px]:grid-cols-2')
      && catalogSrc.includes('@min-[860px]:grid-cols-3'),
    'Context cards should move between one, two, and three columns based on their widget width');
  assert('Context card labels remain readable instead of truncating',
    catalogSrc.includes('context-card-label')
      && !/context-card-label[^\n]*(?:truncate|text-ellipsis)/.test(catalogSrc)
      && !/\.context-card-label\s*{[^}]*text-overflow:\s*ellipsis/.test(cssSrc),
    'Card labels should wrap when needed instead of hiding their meaning');
  assert('Context editors use redesigned modal shell', (ccSrc + ctxEditorSrc).includes("modal gb-form-modal ctx-editor-modal") && ctxEditorSrc.includes('gb-modal-head ctx-editor-head'),
    'Context editors should use the newer solid modal chrome');
  assert('Context editor actions stay module-owned without dynamic window or bridge dispatch',
    ctxEditorSrc.includes("import { closeContextCardModalRuntime } from './context-cards-runtime.js';") &&
      ctxEditorSrc.includes('closeContextCardModalRuntime();') &&
      !ctxEditorSrc.includes('getViewRuntimeFunction') &&
      !ctxEditorSrc.includes('ctxEditorFn') &&
      !/\bwindow(?:\.|\s*\[)/.test(ctxEditorSrc) &&
      lifestyleEditorSrc.includes("from './context-lifestyle-form-view.js'") &&
      sourceFunctionHasStatement(lifestyleEditorSrc, 'saveDiet', "return saveLifestyleForm('diet');") &&
      sourceFunctionHasStatement(lifestyleEditorSrc, 'clearEnvironment', "return saveLifestyleForm('environment', true);") &&
      lifestyleFormViewSrc.includes("from './components/LifestyleContextForm.svelte.native.js'") &&
      lifestyleFormViewSrc.includes('save: () => { void save(owned, false); }') &&
      lifestyleFormViewSrc.includes('const confirmed = await showConfirmDialog(`Clear all saved ${model.title.toLowerCase()} information? This cannot be undone.`') &&
      /if \(confirmed && current\(owned\)\)\s+await save\(owned, true\);/.test(lifestyleFormViewSrc) &&
      lifestyleFormComponentSrc.includes('onclick={() => { if (current() && !busy) save(); }}') &&
      lifestyleFormComponentSrc.includes('onclick={() => { if (current() && !busy) clear(); }}') &&
      !/\bwindow(?:\.|\s*\[)/.test(lifestyleFormViewSrc) &&
      medicalHistoryEditorSrc.includes("from './context-medical-history-view.js'") &&
      medicalHistoryViewSrc.includes("from './components/ContextMedicalHistory.svelte.native.js'") &&
      medicalHistoryViewSrc.includes('close: () => close(owned)') &&
      medicalHistoryComponentSrc.includes('onclick={() => { if (current()) close(); }}') &&
      sourceFunctionHasStatement(medicalHistoryViewSrc, 'close', 'closeModalOverlay(owned.overlay);') &&
      !/\bwindow(?:\.|\s*\[)/.test(medicalHistoryViewSrc),
    'Context editor controls should delegate to their owning modules');
  assert('Context editor actions are sticky', cssSrc.includes('.ctx-editor-modal .ctx-editor-actions') && cssSrc.includes('position: sticky') && cssSrc.includes('bottom: 0'),
    'Long context editors need reachable actions while scrolling');
  assert('Glass theme hardens Profile Context surfaces', (() => {
    const themeSrc = read('themes-extra.css');
    return themeSrc.includes('[data-theme="glass"] .ctx-editor-head') &&
      themeSrc.includes('[data-theme="glass"] .dashboard-widget[data-widget-id="profile-context"]') &&
      themeSrc.includes('rgba(24, 18, 48, 0.98)');
  })(), 'Glass theme should not leave context widget/editor chrome translucent');
  assert('Insight Profile Context widget is full-width', (() => {
    const insightSrc = read('js/lens-pages.js');
    const lensStart = insightSrc.indexOf('function showInsightLens');
    const cardStart = insightSrc.indexOf("id: 'profile-context'", lensStart);
    const cardEnd = insightSrc.indexOf('\n', cardStart);
    return cardStart !== -1 && insightSrc.substring(cardStart, cardEnd).includes("size: 'full'");
  })(), 'Insight page should not cram Profile Context into a half-width column');
  const settingsShellSrc = read('js/components/SettingsShell.svelte');
  assert('Settings modal content owns vertical scroll',
    /settings-content[^"\n]*(?:\n[^"\n]*)*?gb:settings:min-h-0/.test(settingsShellSrc)
      && /settings-content[^"\n]*(?:\n[^"\n]*)*?gb:settings:overflow-y-auto/.test(settingsShellSrc),
    'The owned Settings content must shrink and scroll instead of clipping long sections');
  assert('Settings modal layout shrinks to viewport height',
    settingsShellSrc.includes('settings-layout gb:settings:grid')
      && settingsShellSrc.includes('gb:settings:h-[min(560px,calc(90dvh-78px))] gb:settings:min-h-0')
      && settingsShellSrc.includes('gb:settings:max-h-[calc(90dvh-78px)]'),
    'The owned Settings layout must remain bounded in short desktop viewports');
  assert('Settings modal wheel scrolling is not blocked by global wheel guard', (() => {
    const appEventsSrc = read('js/app-event-listeners.js');
    return appEventsSrc.includes('.settings-content') && appEventsSrc.includes('e.preventDefault()');
  })(), 'Settings content must be whitelisted before the modal overflow guard prevents wheel events');
  assert('Dashboard biometric picker wheel scrolling is not blocked by global wheel guard', (() => {
    const appEventsSrc = read('js/app-event-listeners.js');
    return appEventsSrc.includes('.dashboard-biometric-widget-grid') && appEventsSrc.includes('.dashboard-marker-widget-grid') && appEventsSrc.includes('e.preventDefault()');
  })(), 'Dashboard picker grids must be whitelisted before the modal overflow guard prevents wheel events');
  const prelabCssTree = postcss.parse(cssSrc);
  function reportScrollDeclaration(className: string, property: string, value: string): boolean {
    const utility = `gb:report-ui:[${property}:${value}]`;
    if (!reportBuilderClasses(className).split(/\s+/).includes(utility)) return false;
    const escaped = utility.replace(/[^A-Za-z0-9_-]/g, character => '\\' + character);
    const selector = `.${escaped}:is([data-report-builder-view],[data-report-builder-view] *)`;
    const matches: postcss.Rule[] = [];
    prelabCssTree.walkRules(rule => { if (rule.selector === selector && rule.parent?.type === 'root') matches.push(rule); });
    const declarations = matches[0]?.nodes.filter(node => node.type === 'decl' && node.prop === property);
    return matches.length === 1 && declarations?.length === 1 && declarations[0]?.type === 'decl'
      && declarations[0].value === value && !declarations[0].important;
  }
  assert('Report AI overview textarea owns mouse wheel scrolling', (() => {
    const appEventsSrc = read('js/app-event-listeners.js');
    return appEventsSrc.includes('.report-ai-summary-text') &&
      reportBuilderAISrc.includes("class={classes('report-ai-summary-text')}") &&
      reportScrollDeclaration('report-ai-summary-text', 'overflow-y', 'auto') &&
      reportScrollDeclaration('report-ai-summary-text', 'overscroll-behavior', 'contain');
  })(), 'Generated practitioner overview textarea must scroll before the modal wheel guard prevents the event');
  assert('Report builder content pane owns mouse wheel scrolling', (() => {
    const appEventsSrc = read('js/app-event-listeners.js');
    return appEventsSrc.includes('.report-builder-scroll') &&
      reportBuilderViewSrc.includes("class={classes('report-builder-scroll')}") &&
      reportScrollDeclaration('report-builder-scroll', 'overflow-y', 'auto') &&
      reportScrollDeclaration('report-builder-scroll', 'overscroll-behavior', 'contain');
  })(), 'Long report builder category lists must scroll before the modal wheel guard prevents the event');

  // ═══════════════════════════════════════
  // 5. Health dots sentinel fix
  // ═══════════════════════════════════════
  console.log('%c 5. Health Dots Sentinel Fix ', 'font-weight:bold;color:#f59e0b');

  assert('Old sentinel check removed from context-card health dots', !healthDotsSrc.includes("=== 'No lab data is currently loaded for this profile.'"),
    'Should not compare against old sentinel string');
  assert('Content-based stale check', healthDotsSrc.includes('staleCardsHaveAssessableData'),
    'Should check if stale cards have content');
  assert('Falls through to AI when stale cards have content', healthDotsSrc.includes('if (!staleCardsHaveAssessableData(staleKeys))'),
    'Should only skip AI when stale cards are empty AND no lab data');
  assert('Uses hasCardContent for stale check', healthDotsSrc.includes("hasCardContent(state.importedData[k])"),
    'Should use hasCardContent to check each stale card');
  assert('Checks lab data in health dots', healthDotsSrc.includes("state.importedData.entries || []"),
    'Should check lab data availability as fallback');

  // ═══════════════════════════════════════
  // 6. Integration: buildLabContext with context cards, no labs
  // ═══════════════════════════════════════
  console.log('%c 6. Integration: No-Lab Context Assembly ', 'font-weight:bold;color:#f59e0b');

  // Verify that _buildLabContextInner doesn't early-return before section 1
  // (buildLabContext wrapper may return cached context — that's intentional)
  assert('buildLabContext has no early return before section 1', (() => {
    const fnStart = labCtxSrc.indexOf('function _buildLabContextInner');
    const section1 = labCtxSrc.indexOf('// ── 1. Health Goals (', fnStart);
    const between = labCtxSrc.substring(fnStart, section1);
    // Should not have a bare return statement (only conditional ctx assignment)
    const returnCount = (between.match(/\breturn\b/g) || []).length;
    return returnCount === 0;
  })(), 'No early return between inner function start and section 1');

  assert('buildLabContext inner builder ends with return ctx',
    sourceFunctionHasStatement(labCtxSrc, '_buildLabContextInner', 'return ctx;', 'last'),
    'Should always return the built context string before the cache wrapper stores it');

  // ═══════════════════════════════════════
  // 7. Chat setup guide (no AI provider)
  // ═══════════════════════════════════════
  console.log('%c 7. Chat Setup Guide (No Provider) ', 'font-weight:bold;color:#f59e0b');

  assert('openChatPanel has no hasAIProvider gate', !(() => {
    const fnStart = chatPanelSrc.indexOf('export async function openChatPanel(');
    const fnEnd = chatPanelSrc.indexOf('\nexport', fnStart + 10);
    const fnBody = chatPanelSrc.substring(fnStart, fnEnd);
    // Check if hasAIProvider is called before the panel opens
    const providerCheck = fnBody.indexOf('hasAIProvider()');
    const panelOpen = fnBody.indexOf("panel.classList.add('open')");
    return providerCheck !== -1 && providerCheck < panelOpen;
  })(), 'openChatPanel should let the panel open without a provider');

  assert('Chat onboarding has profile form', chatEmptyStateSrc.includes('renderChatProfileSetup(container,') && chatProfileStylesSrc.includes('chat-onboard-form') && chatProfileFormSrc.includes('chat-onboard-name'),
    'Should show profile setup form for new visitors');
  assert('Chat onboarding keeps optional profile context collapsed', chatProfileFormSrc.includes('<details class={PROFILE_MORE}>') && !chatProfileFormSrc.includes('<details open') && chatProfileStylesSrc.includes('chat-onboard-more') && chatProfileFormSrc.includes('Optional body and location context'),
    'Optional height/weight/location fields should not crowd the first mobile onboarding step');
  assert('Chat onboarding has compact optional task cards', chatEmptyStateSrc.includes('renderChatOptionalSetup') && read('js/components/ChatOptionalSetup.svelte').includes('chat-onboard-dna') && read('js/chat-optional-onboarding-classes.ts').includes('chat-onboard-task-grid'),
    'Optional setup should use compact cards and preserve DNA import update hook');
  assert('Chat onboarding makes AI provider setup explicit', chatEmptyStateSrc.includes('chat-onboard-provider-requested') && !chatEmptyStateSrc.includes('!providerSkipped'),
    'No-provider users should continue into context first unless they ask to connect AI');
  assert('Chat onboarding embeds context cards for provider and no-provider users',
    chatEmptyStateSrc.includes("import { projectProfileContextCards } from './context-cards.js'") &&
      chatEmptyStateSrc.includes("container.querySelector('[data-chat-empty-context-slot]')") &&
      sourceFunctionHasStatement(chatEmptyStateSrc, 'renderEmptyPresentationState',
        'if (slot) hydrateChatEmptyCatalog(container, view, projectProfileContextCards());') &&
      chatCatalogOwnerSrc.includes("from './components/ChatEmptyState.svelte.native.js'") &&
      sourceFunctionHasStatement(chatCatalogOwnerSrc, 'hydrateChatEmptyCatalog',
        'flushSync(() => component.setCatalog(catalog));') &&
      chatEmptyViewSrc.includes("import ContextCardCatalog from './ContextCardCatalog.svelte'") &&
      chatEmptyViewSrc.includes('{#if catalog}<ContextCardCatalog view={catalog}/>{/if}') &&
      chatEmptyViewSrc.includes('{#if view.contextCards}') &&
      chatEmptyViewSrc.includes('data-chat-empty-context-slot') &&
      [false,true].every(connected => ['initial','partial'].every(kind =>
        projectChatEmpty({kind: kind === 'initial' ? 'initial' : 'partial', personalityLabel:'', connected}).contextCards)) &&
      !chatEmptyStateSrc.includes('${!hasAIProvider() ? `<div class="chat-context-cards"'),
    'Context cards should stay available inside chat even after AI is connected');
  assert('Card onboarding focus opens card UI instead of AI prompt prefill',
    onboardingViewSrc.includes('openOnboardingChatPanelRuntime()') &&
      onboardingRuntimeSrc.includes('onboardingViewRuntimeDeps.openChatPanel') &&
      onboardingViewSrc.includes('chat-onboard-force-context-cards') &&
      chatEmptyStateSrc.includes('forceContextCards') &&
      onboardingViewSrc.includes('#chat-panel .chat-context-cards') &&
      !onboardingViewSrc.includes('Help me collect the health context'),
    'setOnboardingFocus("cards") should scroll to card editors, not prefill a prompt');
  assert('Chat onboarding lab import CTA handles no-provider state', chatEmptyStateSrc.includes('startOnboardingLabImport') &&
    chatEmptyStateSrc.includes("action === 'request-lab-import-provider'") &&
    chatEmptyStateSrc.includes('requestOnboardingLabImportProvider()') &&
    chatEmptyProjectorSrc.includes('Connect AI to import labs') &&
    ['complete','handoff'].every(kind => projectChatEmpty({kind: kind === 'complete' ? 'complete' : 'handoff',
      personalityLabel:'', connected:false}).actions.some(action =>
        action.label === 'Connect AI to import labs' && action.action === 'request-lab-import-provider')),
    'No-provider lab-import CTA should explain AI setup instead of focusing hidden import controls');
  assert('Chat onboarding hides composer while active', read('js/chat-composer-classes.ts').includes('gb:composer:[.chat-onboarding-active_&]:hidden') && read('js/components/ChatComposer.svelte').includes('class={COMPOSER_AREA}'),
    'Onboarding steps should not compete with the disabled composer on mobile');
  assert('Chat onboarding uses solid active surfaces', cssSrc.includes('.chat-panel.chat-onboarding-active .chat-msg.chat-ai') && cssSrc.includes('var(--bg-card) 94%'),
    'Onboarding cards should stay readable in glass/synth themes');
  assert('Chat onboarding has OpenRouter OAuth', chatOnboardingSrc.includes('startOpenRouterOAuth') && providerQuizSrc.includes('paste a key manually') && providerQuizSrc.includes('data-chat-onboarding-action="start-openrouter-oauth"'),
    'Should have OAuth button and manual key option for API step');
  const hasDelegatedProviderSetup = (provider: string) =>
    providerQuizSrc.includes(`provider="${provider}"`) && providerQuizSrc.includes('action="open-provider-settings"') && chatOnboardingSrc.includes("action === 'open-provider-settings'") &&
    chatOnboardingSrc.includes(`'${provider}'`);
  assert('Chat onboarding has PPQ', hasDelegatedProviderSetup('ppq'),
    'Should have PPQ setup link');
  // Venice is intentionally NOT in the onboarding quiz — its
  // uncensored/E2EE positioning hurts non-tech onboarding clarity.
  // Reachable from Settings → AI (provider-panels.js + settings.js).
  assert('Chat onboarding has Local AI', hasDelegatedProviderSetup('ollama'),
    'Should have Local AI setup link');
  assert('Chat onboarding has settings opener', chatOnboardingSrc.includes("openSettingsModal('ai')"),
    'Should have link that opens AI settings tab directly');
  assert('Chat onboarding helpers live in dedicated module',
    chatSrc.includes("from './chat-onboarding.js'") &&
      chatOnboardingSrc.includes('export function _renderProviderQuiz') &&
      chatOnboardingSrc.includes('export function startOnboardingLabImport'),
    'Provider quiz and onboarding handlers should be extracted from chat.js');
  assert('sendChatMessage guards no provider', (() => {
    const fnStart = chatSendSrc.indexOf('export async function sendChatMessage(');
    const fnBody = chatSendSrc.substring(fnStart, fnStart + 300);
    return fnStart >= 0 && fnBody.includes('if (!hasChatResponseBackend())')
      && fnBody.includes('renderChatMessages()');
  })(), 'sendChatMessage should check for provider and re-render setup guide');

  // CSS checks — provider quiz (new) + setup button (legacy, still used)
  assert('.chat-quiz-option in CSS', cssSrc.includes('.chat-quiz-option'),
    'CSS should define quiz option card styles');
  assert('.chat-setup-btn in CSS', cssSrc.includes('.chat-setup-btn'),
    'CSS should define setup button styles');

  // ═══════════════════════════════════════
  // 8. Floating Chat Bubble (FAB)
  // ═══════════════════════════════════════
  console.log('%c 8. Floating Chat Bubble (FAB) ', 'font-weight:bold;color:#f59e0b');

  const htmlSrc = read('index.html');

  assert('FAB button exists in HTML', htmlSrc.includes('id="chat-fab"') && htmlSrc.includes('class="chat-fab"'),
    'index.html should have #chat-fab with .chat-fab class');
  assert('FAB uses delegated toggleChatPanel action', htmlSrc.includes('chat-fab') && htmlSrc.includes('data-chat-action="toggle-panel"'),
    'FAB should route toggleChatPanel through the shell delegate');
  assert('FAB has aria-label', htmlSrc.includes('chat-fab') && htmlSrc.includes('aria-label="Ask AI"'),
    'FAB should be accessible');
  assert('FAB contains SVG icon', (() => {
    const fabStart = htmlSrc.indexOf('id="chat-fab"');
    const fabEnd = htmlSrc.indexOf('</button>', fabStart);
    const fabHtml = htmlSrc.substring(fabStart, fabEnd);
    return fabHtml.includes('<svg');
  })(), 'FAB should contain an inline SVG chat bubble icon');

  // CSS checks
  assert('.chat-fab in CSS with position: fixed', cssSrc.includes('.chat-fab') && cssSrc.includes('position: fixed'),
    'FAB should be fixed position');
  assert('.chat-fab z-index below backdrop', (() => {
    const fabZ = cssSrc.match(/\.chat-fab\s*\{[^}]*z-index:\s*(\d+)/);
    const backdropZ = cssSrc.match(/\.chat-backdrop\s*\{[^}]*z-index:\s*(\d+)/);
    return fabZ && backdropZ && parseInt(fabZ[1]!) < parseInt(backdropZ[1]!);
  })(), 'FAB z-index should be less than chat-backdrop z-index');
  assert('.chat-fab.hidden hides FAB', cssSrc.includes('.chat-fab.hidden') && cssSrc.includes('display: none'),
    '.chat-fab.hidden should set display: none');
  assert('.chat-fab hover scale', cssSrc.includes('.chat-fab:hover') && cssSrc.includes('scale(1.08)'),
    'FAB should scale up on hover');
  assert('FAB responsive at 480px', (() => {
    const idx480 = cssSrc.indexOf('.chat-fab { width: 48px');
    return idx480 !== -1;
  })(), 'FAB should shrink to 48px at 480px breakpoint');

  // JS checks
  assert('openChatPanel hides FAB', chatPanelSrc.includes("getElementById('chat-fab')") && chatPanelSrc.includes("fab.classList.add('hidden')"),
    'openChatPanel should add .hidden to FAB');
  assert('closeChatPanel shows FAB', (() => {
    const closeStart = chatPanelSrc.indexOf('export function closeChatPanel()');
    const nextSection = chatPanelSrc.indexOf('\n// ═══', closeStart);
    const closeEnd = nextSection === -1 ? chatPanelSrc.length : nextSection;
    const closeBody = chatPanelSrc.substring(closeStart, closeEnd);
    return closeBody.includes("fab.classList.remove('hidden')");
  })(), 'closeChatPanel should remove .hidden from FAB');

  // ═══════════════════════════════════════
  // 9. Welcome Hero (empty-state simplification)
  // ═══════════════════════════════════════
  console.log('%c 9. Welcome Hero (Empty State) ', 'font-weight:bold;color:#f59e0b');

  const dashboardPageViewSrc = read('js/dashboard-page-view.js');
  const dashboardWelcomeMarkup = read('js/components/DashboardWelcome.svelte');
  const welcomeWitnesses = [false, true].flatMap(ready => [false, true].map(paused => {
    const dom = new JSDOM(renderDashboardWelcomeFragment(projectDashboardWelcomeView({ ready, paused, reminder: null })));
    const hero = dom.window.document.querySelector('.welcome-hero');
    const dropZone = hero?.querySelector('#drop-zone');
    const chatButton = hero?.querySelector('.welcome-chat-panel [data-dashboard-welcome-action="open-chat"]');
    const witness = {
      hiddenImportProgress: dropZone?.classList.contains('drop-zone-hidden') === true,
      guidedChat: chatButton?.textContent?.trim() === 'Start guided chat',
      delegated: chatButton?.tagName === 'BUTTON' && !chatButton.hasAttribute('onclick'),
    };
    dom.window.close();
    return witness;
  }));
  const dashboardPresentationSources = dashboardPageViewSrc + '\n' + dashboardWelcomeMarkup;

  // CSS checks
  assert('.welcome-hero in CSS with text-align: center', cssSrc.includes('.welcome-hero') && cssSrc.includes('text-align: center'),
    'Welcome hero should be centered');
  assert('.welcome-hero h2 uses display font', cssSrc.includes('.welcome-hero h2') && cssSrc.includes('font-family: var(--font-display)'),
    'Hero heading should use display font');
  assert('.welcome-hero-subtitle in CSS', cssSrc.includes('.welcome-hero-subtitle'),
    'Subtitle class should exist');
  assert('Empty-state manual context details removed from CSS', !cssSrc.includes('.welcome-context-details') && !cssSrc.includes('.welcome-context-summary'),
    'Manual context details should not be a first-run empty-state surface');
  assert('Mobile override at 480px', (() => {
    const matches: postcss.Rule[] = [];
    prelabCssTree.walkRules(rule => {
      if (rule.selector === '.welcome-hero' && rule.parent?.type === 'atrule'
          && rule.parent.name === 'media' && rule.parent.params === '(max-width: 480px)') matches.push(rule);
    });
    const declarations = matches[0]?.nodes.filter(node => node.type === 'decl' && node.prop === 'padding');
    return matches.length === 1 && declarations?.length === 1 && declarations[0]?.type === 'decl'
      && declarations[0].value === '28px 14px 24px' && !declarations[0].important;
  })(),
    'Welcome hero should have compact mobile padding');

  // Dead CSS removed
  assert('Dead .onboarding-step1 CSS removed', !cssSrc.includes('.onboarding-step1'),
    'Old onboarding-step1 styles should be removed');
  assert('Dead .onboarding-import-btn CSS removed', !cssSrc.includes('.onboarding-import-btn'),
    'Old import button styles should be removed');

  // Source structure checks
  assert('!hasData branch renders welcome-hero', dashboardWelcomeMarkup.includes("class=\"welcome-hero\"") && dashboardPageViewSrc.includes('if (!hasData)'),
    'Empty state should use welcome-hero class');
  assert('No onboarding-step1 in dashboard-page-view.js', !dashboardPresentationSources.includes('onboarding-step1'),
    'Old onboarding step1 should be removed from the dashboard page view');
  assert('Hidden drop zone remains available for import progress', (() => {
    return welcomeWitnesses.every(view => view.hiddenImportProgress)
      && dashboardPageViewSrc.includes('renderDashboardWelcomeFragment(projectDashboardWelcomeView(');
  })(), 'Hidden drop zone should remain inside welcome hero');
  assert('Welcome hero has a chat-first start panel', welcomeWitnesses.every(view => view.guidedChat),
    'Empty state should lead with guided chat');
  assert('Welcome guided chat button opens chat through delegated action', welcomeWitnesses.every(view => view.delegated)
      && /if \(action === 'open-chat'\) \{\s*dashboardPageRuntimeDeps\.openChatPanel\?\.\(\);/.test(dashboardPageViewSrc)
      && sourceFunctionHasStatement(dashboardPageViewSrc, 'installDashboardWelcomeActionDelegates',
        "root.addEventListener('click', handleDashboardWelcomeActionClick);"),
    'AI setup should be routed from chat only when needed');
  assert('Demo cards inside welcome hero', (() => {
    const heroStart = dashboardWelcomeMarkup.indexOf("view.mode === 'welcome'");
    const demoStart = dashboardWelcomeMarkup.indexOf('welcome-demo-section', heroStart);
    const renderEnd = dashboardWelcomeMarkup.indexOf('{:else if', heroStart);
    return heroStart !== -1 && demoStart > heroStart && demoStart < renderEnd && dashboardPageViewSrc.includes('main.innerHTML = html');
  })(), 'Demo cards should be inside welcome hero');
  assert('No manual context cards in empty state', !dashboardPresentationSources.includes('welcome-context-details') && !dashboardPresentationSources.includes('welcome-context-summary'),
    'Empty state should route context collection through chat');
  assert('Category header only in hasData path', (() => {
    const catHeader = dashboardPageViewSrc.indexOf('Dashboard Overview');
    const hasDataComment = dashboardPageViewSrc.indexOf('Has data: full dashboard');
    return catHeader > hasDataComment;
  })(), 'Dashboard Overview header should only appear in hasData path');

  // ═══════════════════════════════════════
  // Results
  // ═══════════════════════════════════════
console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
process.exit(legacyAssertions.fail > 0 ? 1 : 0);
