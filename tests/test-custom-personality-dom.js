// test-custom-personality-dom.js — DOM-runtime assertions extracted from
// test-custom-personality.js (sections 11, 12, 17, 21). Stays in the
// puppeteer runner: updatePersonalityBar()/startNewCustomPersonality()
// render real DOM, document.styleSheets must hold resolved CSSOM, and the
// Discuss button is a live page element. The window-export +
// `.toString()` source-inspection checks live in test-custom-personality.js
// (Vitest).
//
// Run: fetch('tests/test-custom-personality-dom.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Custom Personality DOM Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const profileId = localStorage.getItem('labcharts-current-profile') || 'default';
  const key = `labcharts-${profileId}-chatPersonalityCustom`;
  const origVal = localStorage.getItem(key);
  const origPersonality = localStorage.getItem(`labcharts-${profileId}-chatPersonality`);

  const arr = [
    { id: 'custom_abc', name: 'Longevity Expert', icon: '🧠', promptText: 'Expert prompt', evidenceBased: true },
    { id: 'custom_def', name: 'Functional Doc', icon: '🔮', promptText: 'Functional prompt', evidenceBased: false }
  ];

  // ── 11. Dynamic HTML rendering ──
  console.log('%c 11. Dynamic HTML rendering ', 'font-weight:bold;color:#f59e0b');
  localStorage.setItem(key, JSON.stringify(arr));
  localStorage.setItem(`labcharts-${profileId}-chatPersonality`, 'custom_abc');
  window.loadChatPersonality();
  window.updatePersonalityBar();
  const section = document.getElementById('chat-personality-custom-section');
  assert('Custom section container exists', !!section);
  const customBtns = section ? section.querySelectorAll('.chat-personality-opt') : [];
  assert('Custom section has 2 personality buttons', customBtns.length === 2);
  assert('First button data-personality', customBtns[0] && customBtns[0].dataset.personality === 'custom_abc');
  assert('Second button data-personality', customBtns[1] && customBtns[1].dataset.personality === 'custom_def');
  assert('Active button has active class', customBtns[0] && customBtns[0].classList.contains('active'));
  assert('Inactive button no active class', customBtns[1] && !customBtns[1].classList.contains('active'));
  const addBtn = section && section.querySelector('.chat-personality-add-btn');
  assert('Add New button exists', !!addBtn);
  assert('Add New button text', addBtn && addBtn.textContent.includes('New Personality'));
  const deleteBtns = section ? section.querySelectorAll('.chat-personality-delete') : [];
  assert('Delete buttons exist for each custom', deleteBtns.length === 2);
  const customArea = section && section.querySelector('.chat-personality-custom-area');
  assert('Custom area rendered in section', !!customArea);
  const nameInput = document.getElementById('chat-personality-custom-name');
  assert('Name input exists', !!nameInput);
  assert('Name input is text type', nameInput && nameInput.type === 'text');
  assert('Name input has placeholder', nameInput && nameInput.placeholder.toLowerCase().includes('longevity'));
  const genBtn = document.getElementById('chat-personality-generate-btn');
  assert('Generate button exists', !!genBtn);
  assert('Generate button text', genBtn && genBtn.textContent.trim() === 'Generate');
  const textarea = section && section.querySelector('.chat-personality-custom-textarea');
  assert('Textarea exists', !!textarea);
  const saveBtn = section && section.querySelector('.chat-personality-custom-save');
  assert('Save button exists', !!saveBtn);
  assert('Editor name populated', nameInput && nameInput.value === 'Longevity Expert');
  assert('Editor textarea populated', textarea && textarea.value === 'Expert prompt');

  // ── 12. CSS classes for new elements ──
  console.log('%c 12. CSS classes ', 'font-weight:bold;color:#f59e0b');
  const sheets = Array.from(document.styleSheets);
  let foundDelete = false, foundAddBtn = false, foundWrapper = false;
  let foundHeader = false, foundNameInput = false, foundGenBtn = false, foundFooter = false, foundSaveDisabled = false;
  for (const sheet of sheets) {
    try {
      for (const rule of sheet.cssRules || []) {
        const sel = rule.selectorText || '';
        if (sel.includes('.chat-personality-delete')) foundDelete = true;
        if (sel.includes('.chat-personality-add-btn')) foundAddBtn = true;
        if (sel.includes('.chat-personality-opt-wrapper')) foundWrapper = true;
        if (sel.includes('.chat-personality-custom-header')) foundHeader = true;
        if (sel.includes('.chat-personality-custom-name-input')) foundNameInput = true;
        if (sel.includes('.chat-personality-generate-btn')) foundGenBtn = true;
        if (sel.includes('.chat-personality-custom-footer')) foundFooter = true;
        if (sel.includes('.chat-personality-custom-save:disabled')) foundSaveDisabled = true;
      }
    } catch {}
  }
  assert('CSS: .chat-personality-delete exists', foundDelete);
  assert('CSS: .chat-personality-add-btn exists', foundAddBtn);
  assert('CSS: .chat-personality-opt-wrapper exists', foundWrapper);
  assert('CSS: .chat-personality-custom-header exists', foundHeader);
  assert('CSS: .chat-personality-custom-name-input exists', foundNameInput);
  assert('CSS: .chat-personality-generate-btn exists', foundGenBtn);
  assert('CSS: .chat-personality-custom-footer exists', foundFooter);
  assert('CSS: .chat-personality-custom-save:disabled exists', foundSaveDisabled);

  // ── 17. Dirty state tracking ──
  console.log('%c 17. Dirty state tracking ', 'font-weight:bold;color:#f59e0b');
  window.startNewCustomPersonality();
  const saveBtn2 = document.querySelector('.chat-personality-custom-save');
  window.snapshotPersonalityClean();
  assert('After snapshot, save disabled', saveBtn2 && saveBtn2.disabled === true);
  window.markPersonalityDirty();
  assert('No changes, save stays disabled', saveBtn2 && saveBtn2.disabled === true);

  // ── 21. Discuss button DOM ──
  console.log('%c 21. Discuss button DOM ', 'font-weight:bold;color:#f59e0b');
  const discussBtnEl = document.getElementById('chat-discuss-btn');
  assert('Discuss button exists', !!discussBtnEl);
  assert('Discuss button hidden by default', discussBtnEl && discussBtnEl.style.display === 'none');
  assert('Discuss button has onclick', discussBtnEl && discussBtnEl.getAttribute('onclick') === 'startDiscussion()');

  // ── Restore ──
  if (origVal !== null) localStorage.setItem(key, origVal);
  else localStorage.removeItem(key);
  if (origPersonality !== null) localStorage.setItem(`labcharts-${profileId}-chatPersonality`, origPersonality);
  else localStorage.removeItem(`labcharts-${profileId}-chatPersonality`);
  if (window.loadChatPersonality) window.loadChatPersonality();
  if (window.updatePersonalityBar) window.updatePersonalityBar();

  console.log(`\n%c Custom Personality DOM: ${pass} passed, ${fail} failed `, fail > 0 ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS === 'undefined') window.__TEST_RESULTS = {};
  window.__TEST_RESULTS['test-custom-personality-dom'] = { pass, fail };
})();
