// test-chat-actions-dom.js — DOM-runtime sections extracted from
// test-chat-actions.js (4, 10, 12). Stays in the puppeteer runner:
// section 4 needs renderChatMessages() to paint into a real #chat-messages
// container (or DOMParser to parse the action-bar HTML), section 10 needs
// the real navigator.clipboard API, section 12 drives toggleContextDetails()
// against live DOM nodes. The window-export + buildActionBar HTML-string +
// source-inspection checks live in test-chat-actions.js (Vitest).
//
// Run: fetch('tests/test-chat-actions-dom.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Chat Actions DOM Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  const { buildActionBar } = await import('/js/chat-actions.js');

  const S = window._labState;
  const hasState = S && typeof S === 'object';
  assert('window._labState exists', hasState, hasState ? 'found' : 'not found — hard-reload (Ctrl+Shift+R) to bust SW cache');

  // ─── Section 4: renderChatMessages() with action bars ───
  console.log('%c Section 4: renderChatMessages() integration', 'font-weight:bold;color:#6366f1');
  let origHistory;
  if (hasState) {
    origHistory = JSON.parse(JSON.stringify(S.chatHistory || []));
    S.chatHistory = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!', context: [{ label: 'Lab values', detail: '5 markers' }] },
      { role: 'user', content: 'More info' },
      { role: 'assistant', content: 'Sure, here is more.', context: [{ label: 'Diet', detail: 'filled' }, { label: 'Sleep & Rest', detail: 'filled' }] }
    ];
    const realContainer = document.getElementById('chat-messages');
    const hasProvider = typeof window.hasAIProvider === 'function' ? window.hasAIProvider() : true;
    if (realContainer && hasProvider) {
      window.renderChatMessages();
      const aiMsgs = realContainer.querySelectorAll('.chat-msg.chat-ai');
      const userMsgs = realContainer.querySelectorAll('.chat-msg.chat-user');
      assert('Rendered AI messages have action bars', aiMsgs.length > 0 && aiMsgs[0].querySelector('.chat-action-bar') !== null, `${aiMsgs.length} AI msgs`);
      assert('User messages have NO action bars', userMsgs.length > 0 && userMsgs[0].querySelector('.chat-action-bar') === null, `${userMsgs.length} user msgs`);
    } else {
      const bar1 = buildActionBar(1);
      const parser = new DOMParser();
      const doc = parser.parseFromString('<div class="chat-msg chat-ai">' + bar1 + '</div>', 'text/html');
      assert('Action bar HTML has .chat-action-bar div', doc.querySelector('.chat-action-bar') !== null, 'found in parsed HTML');
      assert('Action bar HTML has buttons', doc.querySelectorAll('.chat-action-btn').length >= 1, `${doc.querySelectorAll('.chat-action-btn').length} buttons`);
    }
  } else {
    console.warn('Skipping render tests — _labState not available');
  }

  // ─── Section 10: Copy message functionality ───
  console.log('%c Section 10: Copy message', 'font-weight:bold;color:#6366f1');
  assert('navigator.clipboard available', typeof navigator.clipboard !== 'undefined', typeof navigator.clipboard);
  if (typeof navigator.clipboard !== 'undefined' && typeof navigator.clipboard.writeText === 'function') {
    assert('clipboard.writeText is function', true, 'available');
  } else {
    assert('clipboard.writeText is function (may need HTTPS)', false, 'not available');
  }

  // ─── Section 12: Context toggle ───
  console.log('%c Section 12: Context toggle', 'font-weight:bold;color:#6366f1');
  const testDiv = document.createElement('div');
  testDiv.innerHTML = `<div id="chat-ctx-details-1" style="display:none">content</div><span id="chat-ctx-arrow-1">▸</span>`;
  document.body.appendChild(testDiv);

  window.toggleContextDetails(1);
  const det = document.getElementById('chat-ctx-details-1');
  assert('toggleContextDetails opens details', det && det.style.display === 'flex', det?.style.display);

  const ctxArrow = document.getElementById('chat-ctx-arrow-1');
  assert('Arrow changes to down', ctxArrow && ctxArrow.textContent === '▾', ctxArrow?.textContent);

  window.toggleContextDetails(1);
  assert('toggleContextDetails closes details', det && det.style.display === 'none', det?.style.display);
  assert('Arrow changes back to right', ctxArrow && ctxArrow.textContent === '▸', ctxArrow?.textContent);

  testDiv.remove();

  // ─── Cleanup ───
  if (hasState && origHistory) S.chatHistory = origHistory;

  console.log(`\n%c Chat Actions DOM: ${pass} passed, ${fail} failed `, fail > 0 ? 'background:#ef4444;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px' : 'background:#22c55e;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');
  if (typeof window.__TEST_RESULTS === 'undefined') window.__TEST_RESULTS = {};
  window.__TEST_RESULTS['test-chat-actions-dom'] = { pass, fail };
})();
