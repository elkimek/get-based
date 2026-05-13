// test-chat-actions.js — Browser test for chat action buttons + scientific sources
// Run: fetch('tests/test-chat-actions.js').then(r=>r.text()).then(s=>Function(s)())

return (async function() {
  const results = [];
  let passed = 0, failed = 0;

  function assert(name, condition, detail) {
    if (condition) {
      passed++;
      results.push({ name, status: 'PASS', detail });
    } else {
      failed++;
      results.push({ name, status: 'FAIL', detail });
      console.error(`FAIL: ${name}`, detail);
    }
  }

  // Access the module's shared state object
  const S = window._labState;
  const hasState = S && typeof S === 'object';
  assert('window._labState exists', hasState, hasState ? 'found' : 'not found — hard-reload (Ctrl+Shift+R) to bust SW cache');

  // ─── Section 1: Window exports ───
  console.log('%c Section 1: Window Exports', 'font-weight:bold;color:#6366f1');

  const requiredExports = [
    'getContextSummary', 'buildActionBar', 'regenerateLastMessage',
    'copyMessage', 'toggleContextDetails'
  ];
  for (const fn of requiredExports) {
    assert(`window.${fn} exists`, typeof window[fn] === 'function', typeof window[fn]);
  }
  // readAloud should NOT be exported (removed)
  assert('window.readAloud removed', typeof window.readAloud === 'undefined', typeof window.readAloud);

  // ─── Section 2: getContextSummary() ───
  console.log('%c Section 2: getContextSummary()', 'font-weight:bold;color:#6366f1');

  const summary = window.getContextSummary();
  assert('getContextSummary returns array', Array.isArray(summary), typeof summary);
  if (summary.length > 0) {
    assert('Summary items have label', typeof summary[0].label === 'string', summary[0].label);
    assert('Summary items have detail', typeof summary[0].detail === 'string', summary[0].detail);
  } else {
    assert('Summary is empty (no data loaded)', summary.length === 0, 'expected with no data');
  }
  const allLabelsStr = summary.every(s => typeof s.label === 'string' && s.label.length > 0);
  assert('All summary labels are non-empty strings', allLabelsStr, summary.map(s => s.label).join(', '));

  // ─── Section 3: buildActionBar() ───
  console.log('%c Section 3: buildActionBar()', 'font-weight:bold;color:#6366f1');

  let origHistory;
  if (hasState) {
    origHistory = JSON.parse(JSON.stringify(S.chatHistory || []));

    S.chatHistory = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!', context: [{ label: 'Lab values', detail: '5 markers' }] },
      { role: 'user', content: 'More info' },
      { role: 'assistant', content: 'Sure, here is more.', context: [{ label: 'Diet', detail: 'filled' }, { label: 'Sleep & Rest', detail: 'filled' }] }
    ];

    // User messages should return empty
    const userBar = window.buildActionBar(0);
    assert('buildActionBar returns empty for user msg', userBar === '', `got: "${userBar.substring(0, 50)}"`);

    // First AI message (index 1) — NOT last, should NOT have Regenerate
    const bar1 = window.buildActionBar(1);
    assert('buildActionBar for AI msg has action bar', bar1.includes('chat-action-bar'), 'contains .chat-action-bar');
    assert('Non-last AI msg has NO Regenerate', !bar1.includes('Regenerate'), 'no Regenerate for non-last');
    assert('AI msg has NO Read button (removed)', !bar1.includes('Read'), 'no Read button');
    assert('AI msg has Copy button', bar1.includes('Copy'), 'contains Copy');

    // Last AI message (index 3) — should have Regenerate
    const bar3 = window.buildActionBar(3);
    assert('Last AI msg has Regenerate', bar3.includes('Regenerate'), 'contains Regenerate');
    assert('Last AI msg has Copy', bar3.includes('Copy'), 'contains Copy');
    assert('Last AI msg has NO Read', !bar3.includes('Read'), 'no Read');

    // Context section
    assert('AI msg with context has context toggle', bar1.includes('chat-context-toggle'), 'contains toggle');
    assert('Context shows area count', bar1.includes('1 area'), 'shows 1 area');
    assert('Context details are hidden by default', bar1.includes('display:none'), 'hidden');
    assert('Context item has checkmark', bar1.includes('\u2713'), 'has checkmark');

    // Second AI msg has 2 context areas
    assert('Second AI msg shows 2 areas', bar3.includes('2 areas'), 'shows 2 areas');
  } else {
    console.warn('Skipping buildActionBar tests — _labState not available (hard-reload needed)');
  }

  // ─── Section 4: renderChatMessages() with action bars ───
  console.log('%c Section 4: renderChatMessages() integration', 'font-weight:bold;color:#6366f1');

  if (hasState) {
    const realContainer = document.getElementById('chat-messages');
    // renderChatMessages shows setup guide when no AI provider is configured,
    // so fall back to HTML-parsing approach when provider is missing
    const hasProvider = typeof window.hasAIProvider === 'function' ? window.hasAIProvider() : true;
    if (realContainer && hasProvider) {
      window.renderChatMessages();
      const aiMsgs = realContainer.querySelectorAll('.chat-msg.chat-ai');
      const userMsgs = realContainer.querySelectorAll('.chat-msg.chat-user');
      assert('Rendered AI messages have action bars', aiMsgs.length > 0 && aiMsgs[0].querySelector('.chat-action-bar') !== null, `${aiMsgs.length} AI msgs`);
      assert('User messages have NO action bars', userMsgs.length > 0 && userMsgs[0].querySelector('.chat-action-bar') === null, `${userMsgs.length} user msgs`);
    } else {
      const bar1 = window.buildActionBar(1);
      const parser = new DOMParser();
      const doc = parser.parseFromString('<div class="chat-msg chat-ai">' + bar1 + '</div>', 'text/html');
      assert('Action bar HTML has .chat-action-bar div', doc.querySelector('.chat-action-bar') !== null, 'found in parsed HTML');
      assert('Action bar HTML has buttons', doc.querySelectorAll('.chat-action-btn').length >= 1, `${doc.querySelectorAll('.chat-action-btn').length} buttons`);
    }
  } else {
    console.warn('Skipping render tests — _labState not available');
  }

  // ─── Section 5: Backward compatibility ───
  console.log('%c Section 5: Backward compatibility', 'font-weight:bold;color:#6366f1');

  if (hasState) {
    S.chatHistory = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' }  // No .context, no .sources
    ];

    const barNoCtx = window.buildActionBar(1);
    assert('Msg without .context has no context toggle', !barNoCtx.includes('chat-context-toggle'), 'no toggle');
    assert('Msg without .sources has no sources toggle', !barNoCtx.includes('chat-sources-toggle'), 'no sources toggle');
    assert('Msg without .context still has action bar', barNoCtx.includes('chat-action-bar'), 'has action bar');
  } else {
    console.warn('Skipping backward compat tests — _labState not available');
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
  testDiv.innerHTML = `<div id="chat-ctx-details-1" style="display:none">content</div><span id="chat-ctx-arrow-1">\u25B8</span>`;
  document.body.appendChild(testDiv);

  window.toggleContextDetails(1);
  const det = document.getElementById('chat-ctx-details-1');
  assert('toggleContextDetails opens details', det && det.style.display === 'flex', det?.style.display);

  const ctxArrow = document.getElementById('chat-ctx-arrow-1');
  assert('Arrow changes to down', ctxArrow && ctxArrow.textContent === '\u25BE', ctxArrow?.textContent);

  window.toggleContextDetails(1);
  assert('toggleContextDetails closes details', det && det.style.display === 'none', det?.style.display);
  assert('Arrow changes back to right', ctxArrow && ctxArrow.textContent === '\u25B8', ctxArrow?.textContent);

  testDiv.remove();

  // ─── Section 14: Settings UI ───
  console.log('%c Section 14: Settings UI', 'font-weight:bold;color:#6366f1');

  const settingsSrc = await fetchWithRetry('js/settings.js');
  assert('settings.js NO longer has Chat Sources section', !settingsSrc.includes('Chat Sources'), 'removed from settings');
  assert('settings.js NO longer has chat-sources-btn', !settingsSrc.includes('chat-sources-btn'), 'removed');
  assert('settings.js NO longer has data-sources attribute', !settingsSrc.includes('data-sources'), 'removed');

  // ─── Section 15: Service worker bypass ───
  console.log('%c Section 15: Service worker', 'font-weight:bold;color:#6366f1');

  const swSrc = await fetchWithRetry('service-worker.js');
  assert('SW bypasses OpenRouter', swSrc.includes('openrouter.ai'), 'found');
  assert('SW bypasses Venice', swSrc.includes('api.venice.ai'), 'found');
  assert('SW bypasses Routstr', swSrc.includes('api.routstr.com'), 'found');
  assert('SW bypasses PPQ', swSrc.includes('api.ppq.ai'), 'found');
  assert('SW uses importScripts for version', swSrc.includes("importScripts('/version.js')"), 'found');
  assert('SW CACHE_NAME uses semver', swSrc.includes('`labcharts-v${self.APP_VERSION}`'), 'found');

  // ─── Section 16: CSS classes ───
  console.log('%c Section 16: CSS classes', 'font-weight:bold;color:#6366f1');

  const cssSrc = await fetchWithRetry('styles.css');
  const cssClasses = [
    'chat-action-bar', 'chat-action-btn', 'chat-context-toggle',
    'chat-context-details', 'chat-context-item',
    'chat-toggle-arrow', 'chat-toggle-slider'
  ];
  for (const cls of cssClasses) {
    assert(`CSS .${cls} defined`, cssSrc.includes('.' + cls), 'found in styles.css');
  }
  assert('CSS has shimmer animation', cssSrc.includes('@keyframes shimmer'), 'found');
  assert('CSS .chat-action-btn.active removed', !cssSrc.includes('.chat-action-btn.active'), 'removed');

  // ─── Section 17: Source inspection — chat.js ───
  console.log('%c Section 17: Source inspection', 'font-weight:bold;color:#6366f1');

  const chatSrc = await fetchWithRetry('js/chat.js');
  const labCtxSrc = await fetchWithRetry('js/lab-context.js');
  assert('lab-context.js has getContextSummary', labCtxSrc.includes('function getContextSummary'), 'found');
  assert('chat.js has buildActionBar', chatSrc.includes('function buildActionBar'), 'found');
  assert('chat.js has regenerateLastMessage', chatSrc.includes('function regenerateLastMessage'), 'found');
  assert('chat.js does NOT have readAloud', !chatSrc.includes('function readAloud'), 'removed');
  assert('chat.js has copyMessage', chatSrc.includes('function copyMessage'), 'found');
  assert('sendChatMessage snapshots context', chatSrc.includes('contextSnapshot'), 'found');
  assert('regenerateLastMessage checks _chatAbortController', chatSrc.includes('_chatAbortController') && chatSrc.includes('regenerateLastMessage'), 'found');
  assert('renderChatMessages calls buildActionBar', chatSrc.includes('buildActionBar(i)'), 'found');
  assert('API messages tag other personas', chatSrc.includes('Response from') && chatSrc.includes('personalityName'), 'tags messages from different personas');

  // ─── Section 18: Regenerate only on last AI message ───
  console.log('%c Section 18: Regenerate placement', 'font-weight:bold;color:#6366f1');

  if (hasState) {
    S.chatHistory = [
      { role: 'user', content: 'Q1' },
      { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'Q2' },
      { role: 'assistant', content: 'A2' }
    ];

    const bar0 = window.buildActionBar(1); // first AI msg
    const barLast = window.buildActionBar(3); // last AI msg
    assert('First AI msg (non-last) has no Regenerate', !bar0.includes('regenerateLastMessage'), 'no regenerate');
    assert('Last AI msg has Regenerate', barLast.includes('regenerateLastMessage'), 'has regenerate');
  } else {
    console.warn('Skipping regenerate placement tests — _labState not available');
  }

  // ─── Section 19: setChatPersonality thread behavior ───
  console.log('%c Section 19: setChatPersonality thread behavior', 'font-weight:bold;color:#6366f1');

  if (hasState) {
    assert('setChatPersonality is async', chatSrc.includes('async function setChatPersonality'), 'found in source');
    // Personality switch stays in current thread (no forced new thread)
    assert('setChatPersonality switches in-place', chatSrc.includes('state.currentChatPersonality = id'), 'found');
    assert('Updates thread personality in-place', chatSrc.includes('thread.personality = id'), 'found in setChatPersonality');
    assert('Updates thread metadata on switch', chatSrc.includes('thread.personalityName') && chatSrc.includes('thread.personalityIcon'), 'found');
    // The previous sourcesPending-strip assertion tested behavior of the
    // OpenAlex Sources feature, removed in 18ae2bc (Mar 2026). No code path
    // writes sourcesPending into chatHistory anymore, so saveChatHistory
    // doesn't need a strip step. The check was only passing on main by
    // coincidence (different currentThreadId timing routed through the
    // encrypted-key branch).
  }

  // ─── Section 20: state.js exposes _labState ───
  console.log('%c Section 20: State exposure', 'font-weight:bold;color:#6366f1');

  const stateSrc = await fetchWithRetry('js/state.js');
  assert('state.js exports _labState to window', stateSrc.includes('window._labState'), 'found');

  // ─── Cleanup ───
  if (hasState && origHistory) S.chatHistory = origHistory;

  // ─── Summary ───
  console.log('\n%c ═══════════════════════════════════════', 'color:#6366f1');
  console.log(`%c Chat Actions Test: ${passed} passed, ${failed} failed (${passed + failed} total)`, `font-weight:bold;color:${failed ? '#ef4444' : '#22c55e'}`);
  console.log('%c ═══════════════════════════════════════', 'color:#6366f1');

  if (failed > 0) {
    console.table(results.filter(r => r.status === 'FAIL'));
  }

  return { passed, failed, total: passed + failed, results };
})();
