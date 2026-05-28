#!/usr/bin/env node
// test-prelab.js — Verify pre-lab onboarding: context cards → test recommendations
//
// Static source inspection only — fs.readFileSync instead of fetch.
//
// Run: node tests/test-prelab.js  (or via npm test)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');
const CSS_FILES = ['styles.css', 'css/app-shell.css', 'css/import.css', 'css/emf.css', 'css/modal-shared.css', 'css/dashboard-core.css', 'css/dashboard-widgets.css', 'css/dashboard-welcome.css', 'css/dashboard-data.css', 'css/category-views.css', 'css/context-profile.css', 'css/genetics.css', 'css/data-protection.css', 'css/settings.css', 'css/mobile-dashboard.css', 'css/cycle.css', 'css/marker-detail-modal.css', 'css/recommendations.css', 'css/client-list.css', 'css/wearables.css', 'css/light-sun.css', 'css/light-conditions-now.css', 'css/light-setup.css', 'css/light-tools.css', 'css/light-env.css', 'css/chat-panel.css', 'css/chat-personality.css', 'css/chat-messages.css', 'css/chat-composer.css', 'css/chat-onboarding.css', 'css/chat-responsive.css', 'css/chat-actions.css', 'css/chat-mobile.css', 'css/redesign-shell.css', 'css/chat-redesign.css'];
const readCssBundle = () => CSS_FILES.map(read).join('\n');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Pre-Lab Onboarding Tests ===\n');

const chatSrc = read('js/chat.js');
const chatPanelSrc = read('js/chat-panel.js');
const chatOnboardingSrc = read('js/chat-onboarding.js');
const chatEmptyStateSrc = read('js/chat-empty-state.js');
const chatRenderSrc = read('js/chat-render.js');
const chatSendSrc = read('js/chat-send.js');
const labCtxSrc = read('js/lab-context.js');

  assert('No sentinel return string', !labCtxSrc.includes("return 'No lab data is currently loaded for this profile.'"),
    'The old sentinel early-return should be removed');
  assert('hasLabData variable declared', labCtxSrc.includes('const hasLabData = data.dates.length > 0 || Object.values(data.categories).some(c => c.singleDate)'),
    'Should compute hasLabData from dates + singleDate categories');
  assert('No-data header includes profile context', labCtxSrc.includes("Profile context (sex:"),
    'No-data header should say "Profile context" not "Lab data"');
  assert('No-data NOTE recommends tests and encourages all cards', labCtxSrc.includes('recommend which blood panels') && labCtxSrc.includes('encourage filling all of them'),
    'NOTE should instruct AI to recommend panels and push for all cards');
  assert('No-data path flags missing demographics', labCtxSrc.includes('missingDemo') && labCtxSrc.includes("urge the user to set"),
    'Should add IMPORTANT warning when sex/DOB missing');
  assert('Lab values section gated by hasLabData', labCtxSrc.includes('if (hasLabData) {') && labCtxSrc.includes("const rangeLabel"),
    'Lab values + flagged results should be wrapped in if (hasLabData)');
  assert('Flagged results inside hasLabData guard', labCtxSrc.includes("const allFlags = getAllFlaggedMarkers(data)") && labCtxSrc.includes("if (flags.length > 0)"),
    'Flagged results should be inside the hasLabData block');
  assert('Staleness uses hasLabData guard', labCtxSrc.includes('if (hasLabData && data.dates.length > 0)'),
    'Staleness signal should check hasLabData first');

  // Sections 5-16 (notes, conditions, supplements, cycle, lifestyle cards) should NOT be gated by hasLabData
  assert('User Notes section not gated by hasLabData', labCtxSrc.includes("// ── 5. User Notes ──\n  const notes"),
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
  assert('empty state uses _getNoDataPrompts', chatEmptyStateSrc.includes('const noDataPrompts = _getNoDataPrompts()'),
    'Empty-state renderer should call the helper');
  assert('Prompts rendered dynamically', chatEmptyStateSrc.includes('prompts.map(p =>'),
    'Prompt buttons should be generated from array');
  assert('Has lab data returns null', chatEmptyStateSrc.includes('if (hasLabs) return null'),
    '_getNoDataPrompts should return null when labs exist');
  assert('Counts filled cards', chatEmptyStateSrc.includes('filledCount === 0'),
    'Should branch on card fill count');

  // ═══════════════════════════════════════
  // 3. System prompt — no-data instructions
  // ═══════════════════════════════════════
  console.log('%c 3. System Prompt No-Data Section ', 'font-weight:bold;color:#f59e0b');

  const constSrc = read('js/constants.js');

  assert('Has ## No Lab Data State section', constSrc.includes('## No Lab Data State'),
    'CHAT_SYSTEM_PROMPT should have no-data section');
  assert('Advises pre-lab advisor role', constSrc.includes('pre-lab advisor role'),
    'Should tell AI to shift to advisor role');
  assert('Recommends tailored panels', constSrc.includes('tailored to their health goals'),
    'Should instruct personalized recommendations');
  assert('Explains WHY for each panel', constSrc.includes('explain in one sentence WHY'),
    'Should instruct per-panel reasoning');
  assert('Encourages filling ALL 9 cards', constSrc.includes('encourage filling ALL 9 profile cards'),
    'Should push for all cards, not just a few');
  assert('Sex and age critical instruction', constSrc.includes('Sex and age are critical for test recommendations'),
    'Should instruct AI about importance of demographics');
  assert('Urge to set sex/DOB in Settings', constSrc.includes('tell the user to set these in Settings'),
    'Should direct user to Settings for demographics');
  assert('Menstrual timing is profile-gated',
    constSrc.includes('only apply cycle-phase timing when a menstrualCycle context section is present') &&
      constSrc.includes('For male') &&
      constSrc.includes('do not recommend follicular/luteal/ovulatory timing'),
    'Should not give cycle-phase timing to male/non-cycling profiles');
  assert('Never apologize instruction', constSrc.includes('Never apologize for missing lab data'),
    'Should not apologize');
  assert('Never pretend instruction', constSrc.includes('Never pretend to interpret lab results'),
    'Should not hallucinate results');
  assert('Suggests starter panels', constSrc.includes('CBC, CMP, lipid panel, thyroid, vitamin D, iron'),
    'Should suggest general starter panels');

  // ═══════════════════════════════════════
  // 4. Dashboard nudge subtitle
  // ═══════════════════════════════════════
  console.log('%c 4. Dashboard Nudge Subtitle ', 'font-weight:bold;color:#f59e0b');

  const ccSrc = read('js/context-cards.js');

  assert('context-cards imports getActiveData', ccSrc.includes("import { saveImportedData, getActiveData } from './data.js'"),
    'Should import getActiveData for lab data check');
  assert('context-cards imports hasCardContent', /import\s+{[^}]*hasCardContent[^}]*}\s+from '\.\/utils\.js'/.test(ccSrc),
    'Should import hasCardContent for health dots fix');
  assert('Checks hasLabs for subtitle', ccSrc.includes('_ccHasLabs'),
    'Should compute hasLabs in renderProfileContextCards');
  assert('0-cards subtitle text', ccSrc.includes('Fill all 9 cards and the AI can recommend exactly which labs to get'),
    'Should show fill-all-cards nudge');
  assert('Some-cards subtitle text', ccSrc.includes('The more you fill in, the better the recommendations'),
    'Should nudge toward filling all 9');
  assert('All-cards subtitle text', ccSrc.includes('All filled'),
    'Should show chat nudge when all cards filled');
  assert('context-section-subtitle class used', ccSrc.includes('context-section-subtitle'),
    'Should use the CSS class');
  assert('Dashboard checks missing demographics', ccSrc.includes('_ccMissingDemo'),
    'Should detect missing sex/DOB');
  assert('Dashboard sex/DOB hint in subtitle', ccSrc.includes('Set your sex and date of birth in Settings'),
    'Should nudge sex/DOB when missing');
  assert('No subtitle when has labs', ccSrc.includes("_ccSubtitle = ''") && ccSrc.includes("if (!_ccHasLabs"),
    'Should only show subtitle when no labs');

  // CSS check
  const cssSrc = readCssBundle();
  assert('.context-section-subtitle in CSS', cssSrc.includes('.context-section-subtitle'),
    'CSS should define the subtitle class');
  assert('Subtitle font-size 13px', cssSrc.includes('.context-section-subtitle') && cssSrc.includes('font-size: 13px'),
    'Subtitle should be 13px');
  assert('Profile context grid is container-aware', cssSrc.includes('repeat(auto-fit, minmax(min(100%, 220px), 1fr))'),
    'Context cards should not force tiny 3-column tracks inside narrow widgets');
  assert('Context card labels truncate instead of overflowing', cssSrc.includes('.context-card-label') && cssSrc.includes('text-overflow: ellipsis'),
    'Card labels should fit compact widget widths');
  assert('Context editors use redesigned modal shell', ccSrc.includes("modal gb-form-modal ctx-editor-modal") && ccSrc.includes('gb-modal-head ctx-editor-head'),
    'Context editors should use the newer solid modal chrome');
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
  assert('Settings modal content owns vertical scroll', (() => {
    const block = (cssSrc.match(/\.settings-modal \.settings-content\s*{([\s\S]*?)}/) || [null, ''])[1];
    return block.includes('min-height: 0') && block.includes('overflow-y: auto');
  })(), 'Long settings sections should scroll inside the modal instead of being clipped');
  assert('Settings modal layout shrinks to viewport height', (() => {
    const block = (cssSrc.match(/\.settings-modal \.settings-layout\s*{([\s\S]*?)}/) || [null, ''])[1];
    return block.includes('height: min(560px, calc(90vh - 78px))') &&
      block.includes('height: min(560px, calc(90dvh - 78px))') &&
      block.includes('min-height: 0');
  })(), 'Short desktop viewports should not clip long settings panels');
  assert('Settings modal wheel scrolling is not blocked by global wheel guard', (() => {
    const appEventsSrc = read('js/app-event-listeners.js');
    return appEventsSrc.includes('.settings-content') && appEventsSrc.includes('e.preventDefault()');
  })(), 'Settings content must be whitelisted before the modal overflow guard prevents wheel events');
  assert('Dashboard biometric picker wheel scrolling is not blocked by global wheel guard', (() => {
    const appEventsSrc = read('js/app-event-listeners.js');
    return appEventsSrc.includes('.dashboard-biometric-widget-grid') && appEventsSrc.includes('.dashboard-marker-widget-grid') && appEventsSrc.includes('e.preventDefault()');
  })(), 'Dashboard picker grids must be whitelisted before the modal overflow guard prevents wheel events');

  // ═══════════════════════════════════════
  // 5. Health dots sentinel fix
  // ═══════════════════════════════════════
  console.log('%c 5. Health Dots Sentinel Fix ', 'font-weight:bold;color:#f59e0b');

  assert('Old sentinel check removed from context-cards', !ccSrc.includes("=== 'No lab data is currently loaded for this profile.'"),
    'Should not compare against old sentinel string');
  assert('Content-based stale check', ccSrc.includes('_staleHaveContent'),
    'Should check if stale cards have content');
  assert('Falls through to AI when stale cards have content', ccSrc.includes('if (!_staleHaveContent)'),
    'Should only skip AI when stale cards are empty AND no lab data');
  assert('Uses hasCardContent for stale check', ccSrc.includes("hasCardContent(state.importedData[k])"),
    'Should use hasCardContent to check each stale card');
  assert('Checks lab data in health dots', ccSrc.includes('_dotHasLabs'),
    'Should check lab data availability as fallback');

  // ═══════════════════════════════════════
  // 6. Integration: buildLabContext with context cards, no labs
  // ═══════════════════════════════════════
  console.log('%c 6. Integration: No-Lab Context Assembly ', 'font-weight:bold;color:#f59e0b');

  // Verify that _buildLabContextInner doesn't early-return before section 1
  // (buildLabContext wrapper may return cached context — that's intentional)
  assert('buildLabContext has no early return before section 1', (() => {
    const fnStart = labCtxSrc.indexOf('function _buildLabContextInner');
    const section1 = labCtxSrc.indexOf('// ── 1. Health Goals', fnStart);
    const between = labCtxSrc.substring(fnStart, section1);
    // Should not have a bare return statement (only conditional ctx assignment)
    const returnCount = (between.match(/\breturn\b/g) || []).length;
    return returnCount === 0;
  })(), 'No early return between inner function start and section 1');

  assert('buildLabContext ends with return ctx', (() => {
    const fnStart = labCtxSrc.indexOf('function _buildLabContextInner');
    const fnEnd = labCtxSrc.indexOf('\n// ═══', fnStart + 100);
    const fnBody = labCtxSrc.substring(fnStart, fnEnd);
    return fnBody.includes('return ctx;\n}');
  })(), 'Should always return the built context string');

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

  assert('Chat onboarding has profile form', chatEmptyStateSrc.includes('chat-onboard-form') && chatEmptyStateSrc.includes('chat-onboard-name'),
    'Should show profile setup form for new visitors');
  assert('Chat onboarding keeps optional profile context collapsed', chatEmptyStateSrc.includes('chat-onboard-more') && chatEmptyStateSrc.includes('Optional body and location context'),
    'Optional height/weight/location fields should not crowd the first mobile onboarding step');
  assert('Chat onboarding has compact optional task cards', chatEmptyStateSrc.includes('chat-onboard-task-grid') && chatEmptyStateSrc.includes('chat-onboard-dna'),
    'Optional setup should use compact cards and preserve DNA import update hook');
  assert('Chat onboarding makes AI provider setup explicit', chatEmptyStateSrc.includes('chat-onboard-provider-requested') && !chatEmptyStateSrc.includes('!providerSkipped'),
    'No-provider users should continue into context first unless they ask to connect AI');
  assert('Chat onboarding embeds context cards when AI is not connected', chatEmptyStateSrc.includes("import { renderProfileContextCards } from './context-cards.js'") && chatEmptyStateSrc.includes('chat-context-cards'),
    'No-provider users should still be able to add context inside chat');
  assert('Chat onboarding lab import CTA handles no-provider state', chatEmptyStateSrc.includes('startOnboardingLabImport') && chatEmptyStateSrc.includes('requestOnboardingLabImportProvider') && chatEmptyStateSrc.includes('Connect AI to import labs'),
    'No-provider lab-import CTA should explain AI setup instead of focusing hidden import controls');
  assert('Chat onboarding hides composer while active', cssSrc.includes('.chat-panel.chat-onboarding-active .chat-input-area') && cssSrc.includes('display: none'),
    'Onboarding steps should not compete with the disabled composer on mobile');
  assert('Chat onboarding uses solid active surfaces', cssSrc.includes('.chat-panel.chat-onboarding-active .chat-msg.chat-ai') && cssSrc.includes('var(--bg-card) 94%'),
    'Onboarding cards should stay readable in glass/synth themes');
  assert('Chat onboarding has OpenRouter OAuth', chatOnboardingSrc.includes('startOpenRouterOAuth') && chatOnboardingSrc.includes('paste a key manually'),
    'Should have OAuth button and manual key option for API step');
  assert('Chat onboarding has PPQ', chatOnboardingSrc.includes("switchAIProvider('ppq')"),
    'Should have PPQ setup link');
  // Venice is intentionally NOT in the onboarding quiz — its
  // uncensored/E2EE positioning hurts non-tech onboarding clarity.
  // Reachable from Settings → AI (provider-panels.js + settings.js).
  assert('Chat onboarding has Local AI', chatOnboardingSrc.includes("switchAIProvider('ollama')"),
    'Should have Local AI setup link');
  assert('Chat onboarding has settings opener', chatOnboardingSrc.includes("openSettingsModal('ai')"),
    'Should have link that opens AI settings tab directly');
  assert('Chat onboarding helpers live in dedicated module',
    chatSrc.includes("from './chat-onboarding.js'") &&
      chatOnboardingSrc.includes('export function _renderProviderQuiz') &&
      chatOnboardingSrc.includes('export function startOnboardingLabImport'),
    'Provider quiz and onboarding handlers should be extracted from chat.js');
  assert('sendChatMessage guards no provider', (() => {
    const fnStart = chatSendSrc.indexOf('export async function sendChatMessage()');
    const fnBody = chatSendSrc.substring(fnStart, fnStart + 300);
    return fnBody.includes('if (!hasAIProvider())');
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
  assert('FAB has onclick=toggleChatPanel', htmlSrc.includes('chat-fab') && htmlSrc.includes('onclick="toggleChatPanel()"'),
    'FAB should call toggleChatPanel on click');
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
    return fabZ && backdropZ && parseInt(fabZ[1]) < parseInt(backdropZ[1]);
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

  // CSS checks
  assert('.welcome-hero in CSS with text-align: center', cssSrc.includes('.welcome-hero') && cssSrc.includes('text-align: center'),
    'Welcome hero should be centered');
  assert('.welcome-hero h2 uses display font', cssSrc.includes('.welcome-hero h2') && cssSrc.includes('font-family: var(--font-display)'),
    'Hero heading should use display font');
  assert('.welcome-hero-subtitle in CSS', cssSrc.includes('.welcome-hero-subtitle'),
    'Subtitle class should exist');
  assert('Empty-state manual context details removed from CSS', !cssSrc.includes('.welcome-context-details') && !cssSrc.includes('.welcome-context-summary'),
    'Manual context details should not be a first-run empty-state surface');
  assert('Mobile override at 480px', cssSrc.includes('.welcome-hero { padding: 28px 14px 24px; }'),
    'Welcome hero should have compact mobile padding');

  // Dead CSS removed
  assert('Dead .onboarding-step1 CSS removed', !cssSrc.includes('.onboarding-step1'),
    'Old onboarding-step1 styles should be removed');
  assert('Dead .onboarding-import-btn CSS removed', !cssSrc.includes('.onboarding-import-btn'),
    'Old import button styles should be removed');

  // Source structure checks
  assert('!hasData branch renders welcome-hero', dashboardPageViewSrc.includes("class=\"welcome-hero\"") && dashboardPageViewSrc.includes('if (!hasData)'),
    'Empty state should use welcome-hero class');
  assert('No onboarding-step1 in dashboard-page-view.js', !dashboardPageViewSrc.includes('onboarding-step1'),
    'Old onboarding step1 should be removed from the dashboard page view');
  assert('Hidden drop zone remains available for import progress', (() => {
    const heroStart = dashboardPageViewSrc.indexOf('welcome-hero');
    const heroEnd = dashboardPageViewSrc.indexOf('</div>\\n      </div>`;', heroStart);
    const dropZoneInHero = dashboardPageViewSrc.indexOf('id="drop-zone"', heroStart);
    return heroStart !== -1 && dropZoneInHero !== -1 && dropZoneInHero > heroStart;
  })(), 'Hidden drop zone should remain inside welcome hero');
  assert('Welcome hero has a chat-first start panel', dashboardPageViewSrc.includes('welcome-chat-panel') && dashboardPageViewSrc.includes('Start guided chat'),
    'Empty state should lead with guided chat');
  assert('Welcome guided chat button opens chat, not provider setup', dashboardPageViewSrc.includes('const chatAction = "window.openChatPanel && window.openChatPanel()"'),
    'AI setup should be routed from chat only when needed');
  assert('Demo cards inside welcome hero', (() => {
    const heroStart = dashboardPageViewSrc.indexOf('welcome-hero');
    const demoStart = dashboardPageViewSrc.indexOf('welcome-demo-section', heroStart);
    const renderEnd = dashboardPageViewSrc.indexOf('main.innerHTML = html', heroStart);
    return heroStart !== -1 && demoStart > heroStart && demoStart < renderEnd;
  })(), 'Demo cards should be inside welcome hero');
  assert('No manual context cards in empty state', !dashboardPageViewSrc.includes('welcome-context-details') && !dashboardPageViewSrc.includes('welcome-context-summary'),
    'Empty state should route context collection through chat');
  assert('Category header only in hasData path', (() => {
    const catHeader = dashboardPageViewSrc.indexOf('Dashboard Overview');
    const hasDataComment = dashboardPageViewSrc.indexOf('Has data: full dashboard');
    return catHeader > hasDataComment;
  })(), 'Dashboard Overview header should only appear in hasData path');

  // ═══════════════════════════════════════
  // Results
  // ═══════════════════════════════════════
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
