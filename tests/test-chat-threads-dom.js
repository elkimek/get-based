// test-chat-threads-dom.js — DOM-runtime sections extracted from
// test-chat-threads.js (3 HTML structure + getComputedStyle, 10 rail-toggle
// classList, 11 search-filter rendered .chat-thread-item readback). Stays in
// the puppeteer runner: these need the live chat-panel DOM, getComputedStyle,
// and renderThreadList() painting real .chat-thread-item nodes. The
// window-export + thread-CRUD + state + source-inspection checks live in
// test-chat-threads.js (Vitest).
//
// Run: fetch('tests/test-chat-threads-dom.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  let passed = 0, failed = 0, total = 0;
  function assert(name, condition, detail) {
    total++;
    if (condition) { passed++; console.log(`  %c✓ ${name}`, 'color:#22c55e', detail || ''); }
    else { failed++; console.error(`  %c✗ ${name}`, 'color:#ef4444', detail || ''); }
  }

  console.log('%c Chat Threads DOM Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const stateModule = await import('./js/state.js');
  const st = stateModule.state;
  const profileId = st.currentProfile;
  const origThreads = st.chatThreads.slice();
  const origThreadId = st.currentThreadId;

  // ═══════════════════════════════════════════════
  // 3. HTML Structure
  // ═══════════════════════════════════════════════
  console.group('%c3. HTML Structure', 'font-weight:bold');
  assert('chat-thread-rail exists', !!document.getElementById('chat-thread-rail'));
  assert('chat-thread-list exists', !!document.getElementById('chat-thread-list'));
  assert('chat-thread-search exists', !!document.getElementById('chat-thread-search'));
  assert('.chat-panel-conversation exists', !!document.querySelector('.chat-panel-conversation'));
  assert('.chat-rail-toggle exists', !!document.querySelector('.chat-rail-toggle'));
  assert('.chat-thread-new-btn exists', !!document.querySelector('.chat-thread-new-btn'));
  assert('.chat-header-left exists', !!document.querySelector('.chat-header-left'));
  const chatPanel = document.getElementById('chat-panel');
  const cpStyle = getComputedStyle(chatPanel);
  assert('chat-panel flex-direction is row', cpStyle.flexDirection === 'row');
  console.groupEnd();

  // ═══════════════════════════════════════════════
  // 10. Rail Toggle Persistence
  // ═══════════════════════════════════════════════
  console.group('%c10. Rail Toggle Persistence', 'font-weight:bold');
  const rail = document.getElementById('chat-thread-rail');
  const railKey = `labcharts-${profileId}-chatRailOpen`;
  rail.classList.remove('open');
  localStorage.removeItem(railKey);
  window.toggleThreadRail();
  assert('rail has .open class after toggle', rail.classList.contains('open'));
  assert('rail state persisted as true', localStorage.getItem(railKey) === 'true');
  window.toggleThreadRail();
  assert('rail .open removed after second toggle', !rail.classList.contains('open'));
  assert('rail state persisted as false', localStorage.getItem(railKey) === 'false');
  console.groupEnd();

  // ═══════════════════════════════════════════════
  // 11. Search Filtering
  // ═══════════════════════════════════════════════
  console.group('%c11. Search Filtering', 'font-weight:bold');
  st.chatThreads = [
    { id: 't_a', name: 'Thyroid Panel Discussion', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 5, personality: 'default' },
    { id: 't_b', name: 'Vitamin D Levels', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 3, personality: 'default' },
    { id: 't_c', name: 'Cholesterol Overview', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 2, personality: 'default' }
  ];
  window.saveChatThreadIndex();
  window.renderThreadList();
  const allItems = document.querySelectorAll('.chat-thread-item');
  assert('all 3 threads rendered', allItems.length === 3);
  window.filterThreadList('thyroid');
  const filteredItems = document.querySelectorAll('.chat-thread-item');
  assert('search filter shows 1 result', filteredItems.length === 1, 'Expected 1 got ' + filteredItems.length);
  window.filterThreadList('');
  const resetItems = document.querySelectorAll('.chat-thread-item');
  assert('empty filter shows all', resetItems.length === 3);
  window.filterThreadList('nonexistent');
  const noItems = document.querySelectorAll('.chat-thread-item');
  assert('no match shows empty state', noItems.length === 0);
  const emptyMsg = document.querySelector('#chat-thread-list div');
  assert('empty state message shown', emptyMsg && emptyMsg.textContent.includes('No matching'));
  console.groupEnd();

  // ═══════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════
  st.chatThreads = origThreads;
  st.currentThreadId = origThreadId;
  if (origThreads.length > 0) window.saveChatThreadIndex();
  else localStorage.removeItem(window.getChatThreadsKey());

  console.log(`\n%c Chat Threads DOM: ${passed}/${total} passed `, failed === 0 ? 'background:#22c55e;color:#fff;padding:4px 12px' : 'background:#ef4444;color:#fff;padding:4px 12px');
  if (typeof window.__TEST_RESULTS === 'undefined') window.__TEST_RESULTS = {};
  window.__TEST_RESULTS['test-chat-threads-dom'] = { pass: passed, fail: failed };
})();
