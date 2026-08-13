#!/usr/bin/env node
// test-dashboard-knowledge-base.js — Context hub rows and Personalize-AI CTA
//
// UX contract (v1.3.23):
//   - Interpretive Lens row → ONLY when set
//   - Knowledge Base row    → ONLY when configured
//   - Inline pill CTA       → when at least one of them is unset
//       · both unset      → generic label, opens picker
//       · only KB unset   → "+ Connect a knowledge base", direct
//       · only lens unset → "+ Set an interpretive lens", direct
//   - Both set              → no pill, just two compact rows
//
// Run: node tests/test-dashboard-knowledge-base.js  (or via npm test)
//
// Section 5 (Context hub open/dismiss — needs a live DOM overlay + click events)
// lives in tests/playwright/dashboard-knowledge-base.spec.js.

import './_node-shim.js';
import fs from 'fs';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Dashboard KB / Personalize-AI Tests ===\n');

// hasLens() gates the in-browser backend on navigator.storage + Worker —
// a capability check so the dashboard never shows "active" on a browser
// that can't run the embedding worker. The KB-row *render* path itself is
// pure-synchronous (reads cfg + the localStorage count-shadow, never the
// worker), so stubbing these capabilities lets the real count-driven
// visibility logic run in Node. Section 5's live picker test runs in
// Playwright where these are genuinely present.
//
// The stub install + module imports happen INSIDE the try block so the
// finally cleanup runs even if an import throws — otherwise a stub Worker
// / empty navigator.storage would leak into later legacy tests.
const _hadNavStorage = !!(globalThis.navigator && globalThis.navigator.storage);
const _hadWorker = typeof globalThis.Worker !== 'undefined';

// Snapshot vars are assigned inside the try once `state` is imported;
// declared here so the finally-scoped restore() can see them.
let savedCfg = null, savedCount = null, savedLens;
let _state = null;
const restore = () => {
  if (savedCfg === null) localStorage.removeItem('labcharts-lens-config');
  else localStorage.setItem('labcharts-lens-config', savedCfg);
  if (savedCount === null) localStorage.removeItem('labcharts-lens-local-count');
  else localStorage.setItem('labcharts-lens-local-count', savedCount);
  if (_state && _state.importedData) _state.importedData.interpretiveLens = savedLens;
  // Undo the capability stubs so they don't leak into later legacy tests.
  if (!_hadNavStorage && globalThis.navigator) delete globalThis.navigator.storage;
  if (!_hadWorker) delete globalThis.Worker;
};

try {
  if (globalThis.navigator && !globalThis.navigator.storage) {
    globalThis.navigator.storage = {};
  }
  if (typeof globalThis.Worker === 'undefined') {
    globalThis.Worker = class { constructor() {} postMessage() {} terminate() {} };
  }

  const lens = await import('../js/lens.js');
  const cards = await import('../js/context-cards.js');
  const contextCardsSrc = fs.readFileSync(new URL('../js/context-cards.js', import.meta.url), 'utf8');
  const dashboardAISrc = fs.readFileSync(new URL('../js/context-card-dashboard-ai-impl.js', import.meta.url), 'utf8');
  const { state } = await import('../js/state.js');
  _state = state;

  // Snapshot everything we touch + restore in finally.
  savedCfg = localStorage.getItem('labcharts-lens-config');
  savedCount = localStorage.getItem('labcharts-lens-local-count');
  savedLens = state.importedData?.interpretiveLens;

  if (!state.importedData) state.importedData = {};

  // ─── 1. Both unset → only the picker CTA renders ───
  {
    localStorage.removeItem('labcharts-lens-config');
    localStorage.removeItem('labcharts-lens-local-count');
    state.importedData.interpretiveLens = '';
    const html = cards.renderInterpretiveLensSection();
    assert('both unset: no Interpretive Lens row',
      !/lens-section-label[^>]*>Interpretive Lens/.test(html), html);
    assert('both unset: no Knowledge Base row',
      !/lens-section-label[^>]*>Knowledge Base/.test(html));
    assert('both unset: CTA pill present', html.includes('dashboard-cta'));
    assert('both unset: picker opener wired',
      html.includes('data-dashboard-ai-action="open-personalize-ai-picker"'));
    assert('both unset: generic copy used',
      /Personalize how AI answers/i.test(html));
  }

  // ─── 2. Only Lens set → KB-direct CTA ───
  {
    localStorage.removeItem('labcharts-lens-config');
    localStorage.removeItem('labcharts-lens-local-count');
    state.importedData.interpretiveLens = 'Functional endocrinology';
    const html = cards.renderInterpretiveLensSection();
    assert('only lens: lens row present',
      /lens-section-label[^>]*>Interpretive Lens/.test(html));
    assert('only lens: KB row absent',
      !/lens-section-label[^>]*>Knowledge Base/.test(html));
    assert('only lens: CTA opens KB modal directly',
      html.includes('dashboard-cta') && html.includes('data-dashboard-ai-action="open-knowledge-base"'));
    assert('only lens: CTA copy is KB-specific',
      /Connect a knowledge base/i.test(html));
    assert('only lens: CTA does NOT open picker',
      !html.includes('data-dashboard-ai-action="open-personalize-ai-picker"'));
  }

  // ─── 3. Only KB set → Lens-direct CTA ───
  {
    lens.saveLensConfig({
      backend: 'in-browser', enabled: true, name: 'Research Notes', topK: 5, multiQuery: true,
    });
    localStorage.setItem('labcharts-lens-local-count', '12');
    state.importedData.interpretiveLens = '';
    const html = cards.renderInterpretiveLensSection();
    assert('only KB: lens row absent',
      !/lens-section-label[^>]*>Interpretive Lens/.test(html));
    assert('only KB: KB row present', /lens-section-label[^>]*>Knowledge Base/.test(html));
    assert('only KB: KB row shows library name', html.includes('Research Notes'));
    assert('only KB: CTA opens lens editor directly',
      html.includes('dashboard-cta') && html.includes('data-dashboard-ai-action="open-interpretive-lens"'));
    assert('only KB: CTA copy is lens-specific',
      /Set an interpretive lens/i.test(html));
  }

  // ─── 3b. KB toggle enabled but no indexed library → honest setup state ───
  {
    lens.saveLensConfig({
      backend: 'in-browser', enabled: true, name: 'Research Notes', topK: 5, multiQuery: true,
    });
    localStorage.removeItem('labcharts-lens-local-count');
    state.importedData.interpretiveLens = '';
    const html = cards.renderInterpretiveLensSection();
    assert('KB enabled-empty: KB row present as setup state',
      /lens-section-label[^>]*>Knowledge Base/.test(html));
    assert('KB enabled-empty: row says no documents indexed yet',
      /enabled, no documents indexed yet/.test(html));
    assert('KB enabled-empty: CTA still opens KB modal to finish setup',
      html.includes('dashboard-cta') && html.includes('data-dashboard-ai-action="open-knowledge-base"'));
  }

  // ─── 4. Both Lens + KB set → no AI-personalize CTA ───
  {
    lens.saveLensConfig({
      backend: 'in-browser', enabled: true, name: 'My Library', topK: 5, multiQuery: true,
    });
    localStorage.setItem('labcharts-lens-local-count', '99');
    state.importedData.interpretiveLens = 'Longevity medicine';
    const html = cards.renderInterpretiveLensSection();
    assert('both set: lens row present',
      /lens-section-label[^>]*>Interpretive Lens/.test(html));
    assert('both set: KB row present',
      /lens-section-label[^>]*>Knowledge Base/.test(html));
    assert('both set: AI-personalize CTA absent',
      !html.includes('data-dashboard-ai-action="open-personalize-ai-picker"') &&
      !/dashboard-cta[^>]*data-dashboard-ai-action="open-knowledge-base"/.test(html));
    assert('both set: lens and KB rows use delegated actions',
      !/on(click|keydown)=/.test(html) &&
      html.includes('data-dashboard-ai-action="open-interpretive-lens"') &&
      html.includes('data-dashboard-ai-action="open-knowledge-base"'));
  }

  // ─── 5. Profile Context stays person-facts only; AI context lives in Manage → Context ───
  {
    localStorage.removeItem('labcharts-lens-config');
    localStorage.removeItem('labcharts-lens-local-count');
    state.importedData.interpretiveLens = 'Functional endocrinology';
    const html = cards.renderProfileContextCards();
    assert('Profile Context does not duplicate Interpretive Lens rows',
      !/lens-section-label[^>]*>Interpretive Lens/.test(html));
    assert('Profile Context does not mount AI grounding actions',
      !html.includes('data-dashboard-ai-action="open-interpretive-lens"')
      && !html.includes('data-dashboard-ai-action="open-knowledge-base"')
      && !html.includes('data-dashboard-ai-action="open-personalize-ai-picker"'));
    assert('Profile Context does not mount data-protection setup pills',
      !/Protect your data|Enable encryption|Sync to other devices|Set up auto-backup/.test(html)
      && !/data-dashboard-ai-action="(open-data-protection-picker|enable-encryption|setup-sync|setup-backup)"/.test(html));
    assert('Profile Context still renders the personal context cards',
      /Your health context/.test(html) && /profile-context-cards/.test(html));
    assert('Profile Context renderer does not prepend the Interpretive Lens surface',
      /export function renderProfileContextCards\(\) \{[\s\S]{0,3200}Your health context/.test(contextCardsSrc)
      && !/export function renderProfileContextCards\(\) \{[\s\S]{0,2200}renderInterpretiveLensSection\(\)/.test(contextCardsSrc));
  }

  // Section 5b (picker open/dismiss — live DOM) lives in
  // tests/playwright/dashboard-knowledge-base.spec.js.

  // ─── 6. Module exports ───
  {
    assert('cards.openContextModal exists',
      typeof cards.openContextModal === 'function');
    assert('cards.openPersonalizeAIPicker exists',
      typeof cards.openPersonalizeAIPicker === 'function');
    assert('lens.openKnowledgeBaseModal exists',
      typeof lens.openKnowledgeBaseModal === 'function');
    assert('lens.closeKnowledgeBaseModal exists',
      typeof lens.closeKnowledgeBaseModal === 'function');
    assert('cards.renderKnowledgeBaseSection exists',
      typeof cards.renderKnowledgeBaseSection === 'function');
    assert('cards.triggerDNAFilePicker exists',
      typeof cards.triggerDNAFilePicker === 'function');
    assert('context-card APIs stay module-only',
      !('openContextModal' in window)
      && !('openPersonalizeAIPicker' in window)
      && !('renderKnowledgeBaseSection' in window)
      && !('triggerDNAFilePicker' in window));
  }

  // ─── 8. Current-head Greptile regressions ───
  {
    const chatSrc = fs.readFileSync('js/chat-personalities.js', 'utf8');
    const chatContextStatusSrc = fs.readFileSync('js/chat-context-status.js', 'utf8');
    assert('chat header hides AI Context chip when no provider is configured',
      /function updateChatContextStatus\(\)[\s\S]*?const clearStatus = \(\) => \{[\s\S]*?status\.hidden = true;[\s\S]*?if \(!hasAIProvider\(\)\) \{[\s\S]*?clearStatus\(\);[\s\S]*?return;[\s\S]*?const contextState/.test(chatContextStatusSrc));
    assert('chat header clears model before refreshing hidden context state in no-provider path',
      /if \(!hasAIProvider\(\)\) \{ el\.textContent = ''; updateChatContextStatus\(\); return; \}/.test(chatSrc));
    assert('chat header reads Genome lookup status from Context source registry helper',
      chatContextStatusSrc.includes("import { CONTEXT_SOURCE_IDS, isContextSourceEnabled } from './context-source-registry.js';")
      && /function isGenomeLookupContextActive\(\) \{[\s\S]{0,160}isContextSourceEnabled\(CONTEXT_SOURCE_IDS\.GENOME_INVENTORY\)/.test(chatContextStatusSrc)
      && !chatContextStatusSrc.includes('labcharts-ai-ctx-genetics-inventory'));

    const appEventsSrc = fs.readFileSync('js/app-event-listeners.js', 'utf8');
    assert('global modal focus trap includes Context hub overlay id',
      appEventsSrc.includes('"context-hub-overlay"') && appEventsSrc.includes('"ai-personalize-picker-overlay"'));
    const lensSrc = fs.readFileSync('js/lens.js', 'utf8');
    assert('saveLensKey refreshes chat header after external KB key cache updates',
      /export\s+async\s+function\s+saveLensKey[\s\S]*updateKeyCache\(SECRET_KEY, key\)[\s\S]*updateChatHeaderModelRuntime\(\)/.test(lensSrc));
    assert('Context hub owns optional AI data-source controls',
      dashboardAISrc.includes('renderContextSourceControls')
      && dashboardAISrc.includes('renderContextSourceSummary')
      && dashboardAISrc.includes('context-source-affects')
      && dashboardAISrc.includes('context-grounding-panel')
      && dashboardAISrc.includes('getImportSnapshotProductLabel')
      && dashboardAISrc.includes('hasInsightContextData')
      && dashboardAISrc.includes("key: 'insight-cards'")
      && dashboardAISrc.includes('hasSupplementsMedsData')
      && dashboardAISrc.includes("key: 'supplements-meds'")
      && dashboardAISrc.includes("key: 'lab-markers'")
      && dashboardAISrc.includes("toggleKey: 'lab-group'")
      && dashboardAISrc.includes('labStats.groups.map((group, index)')
      && dashboardAISrc.includes('key: `lab-group-${index}-${group.name')
      && dashboardAISrc.includes("key: 'genome-summary'")
      && dashboardAISrc.includes("key: 'genome-priority'")
      && dashboardAISrc.includes("key: 'light-sun'")
      && dashboardAISrc.includes("key: 'body-wearables'")
      && dashboardAISrc.includes("key: 'genome-lookup'")
      && !dashboardAISrc.includes("key: 'body-regions'"));
  }

  // ─── 7. renderKnowledgeBaseSection still empty when not configured ───
  {
    localStorage.removeItem('labcharts-lens-config');
    localStorage.removeItem('labcharts-lens-local-count');
    const html = cards.renderKnowledgeBaseSection();
    assert('renderKnowledgeBaseSection() returns empty string when no library',
      html === '', JSON.stringify(html));
  }
} finally {
  restore();
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
