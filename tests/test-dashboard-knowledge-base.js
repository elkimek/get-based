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
// Empty UI should ask for one click, not stretch full-width — the heavy
// dashed stubs from the first iteration are gone.

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Dashboard KB / Personalize-AI tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const lens = await import('../js/lens.js');
  const cards = await import('../js/context-cards.js');
  const { state } = await import('../js/state.js');

  // Snapshot everything we touch + restore in finally.
  const savedCfg = localStorage.getItem('labcharts-lens-config');
  const savedCount = localStorage.getItem('labcharts-lens-local-count');
  const savedLens = state.importedData?.interpretiveLens;
  const restore = () => {
    if (savedCfg === null) localStorage.removeItem('labcharts-lens-config');
    else localStorage.setItem('labcharts-lens-config', savedCfg);
    if (savedCount === null) localStorage.removeItem('labcharts-lens-local-count');
    else localStorage.setItem('labcharts-lens-local-count', savedCount);
    if (state.importedData) state.importedData.interpretiveLens = savedLens;
  };

  if (!state.importedData) state.importedData = {};

  try {
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
    // (v1.3.28 reverted DNA from this picker — DNA is data, not a
    // personalization preference. DNA discovery now lives in the
    // genetics dashboard section's empty-state stub instead.)
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
      // AI-personalize CTA must be gone. Data-protection CTA may still appear.
      assert('both set: AI-personalize CTA absent',
        !html.includes('openPersonalizeAIPicker') &&
        // Only the KB row's onclick should reference the modal opener.
        !/dashboard-cta[^>]*onclick="openKnowledgeBaseModal/.test(html));
    }

    // ─── 5. Picker opens + dismisses on Escape ───
    {
      // First the existing overlay should not be there.
      const before = document.getElementById('ai-personalize-picker-overlay');
      assert('picker overlay not present before open', !before || !before.classList.contains('show'));

      cards.openPersonalizeAIPicker();
      const overlay = document.getElementById('ai-personalize-picker-overlay');
      assert('picker overlay attached on open',
        !!overlay && overlay.classList.contains('show'));
      // v1.3.28 reverted to 2 cards — DNA was a category mistake (it's
      // biological data, not a personalization preference).
      assert('picker has two option cards (Lens + KB)',
        overlay.querySelectorAll('.ai-picker-card').length === 2);
      const titles = Array.from(overlay.querySelectorAll('.ai-picker-title')).map(t => t.textContent.trim());
      assert('picker offers Interpretive Lens and Knowledge Base',
        titles.includes('Interpretive Lens') && titles.includes('Knowledge Base'));
      assert('picker does NOT offer DNA Data', !titles.includes('DNA Data'));
      assert('picker has cancel button',
        !!overlay.querySelector('#ai-personalize-picker-cancel'));

      // Dismiss via the Cancel button click handler.
      overlay.querySelector('#ai-personalize-picker-cancel').click();
      assert('cancel dismisses overlay', !overlay.classList.contains('show'));
    }

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
})();
