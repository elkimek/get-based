#!/usr/bin/env node
// test-dashboard-knowledge-base.js — KB row + Personalize-AI CTA on the dashboard
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
// Section 5 (picker open/dismiss — needs a live DOM overlay + click events)
// lives in tests/test-dashboard-knowledge-base-dom.js on the puppeteer runner.

import './_node-shim.js';

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
// visibility logic run in Node. Section 5's live picker test stays on
// puppeteer where these are genuinely present.
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
      html.includes('openPersonalizeAIPicker()'));
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
      html.includes('dashboard-cta') && html.includes('openKnowledgeBaseModal()'));
    assert('only lens: CTA copy is KB-specific',
      /Connect a knowledge base/i.test(html));
    assert('only lens: CTA does NOT open picker',
      !html.includes('openPersonalizeAIPicker()'));
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
      html.includes('dashboard-cta') && html.includes('openInterpretiveLensEditor()'));
    assert('only KB: CTA copy is lens-specific',
      /Set an interpretive lens/i.test(html));
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
      !html.includes('openPersonalizeAIPicker') &&
      !/dashboard-cta[^>]*onclick="openKnowledgeBaseModal/.test(html));
  }

  // Section 5 (picker open/dismiss — live DOM) lives in
  // test-dashboard-knowledge-base-dom.js.

  // ─── 6. Window exports ───
  {
    assert('window.openPersonalizeAIPicker exists',
      typeof window.openPersonalizeAIPicker === 'function');
    assert('window.openKnowledgeBaseModal exists',
      typeof window.openKnowledgeBaseModal === 'function');
    assert('window.closeKnowledgeBaseModal exists',
      typeof window.closeKnowledgeBaseModal === 'function');
    assert('window.renderKnowledgeBaseSection exists',
      typeof window.renderKnowledgeBaseSection === 'function');
    assert('window.triggerDNAFilePicker exists (used by genetics empty stub)',
      typeof window.triggerDNAFilePicker === 'function');
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
