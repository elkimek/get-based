// test-chat-panel-ux.js — Chat panel interactive-while-open + fullscreen (v1.3.29)
//
// Two related UX fixes covered:
//   1. Dashboard stays interactive while chat is open: the .chat-backdrop
//      is now pointer-events: none, and openChatPanel no longer locks
//      body scroll.
//   2. Fullscreen toggle: ⛶ button in the chat header switches the panel
//      between its responsive side-rail width and full viewport.
//      Preference persists across sessions via localStorage.

return (async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Chat panel UX tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  // Snapshot localStorage so the test doesn't bleed user state.
  const savedFullscreen = localStorage.getItem('labcharts-chat-fullscreen');
  // Make sure chat starts closed + clean fullscreen state.
  if (typeof window.closeChatPanel === 'function') window.closeChatPanel();
  localStorage.removeItem('labcharts-chat-fullscreen');
  document.getElementById('chat-panel')?.classList.remove('chat-panel-fullscreen');

  try {
    // ─── 1. Window exports ────────────────────────────────────
    {
      assert('window.toggleChatFullscreen exists',
        typeof window.toggleChatFullscreen === 'function');
      assert('window.openChatPanel exists',
        typeof window.openChatPanel === 'function');
      assert('window.closeChatPanel exists',
        typeof window.closeChatPanel === 'function');
    }

    // ─── 2. DOM: fullscreen button is present + accessible ────
    {
      const btn = document.querySelector('.chat-fullscreen-btn');
      assert('.chat-fullscreen-btn exists in the chat header', !!btn);
      assert('fullscreen button has aria-label',
        btn?.getAttribute('aria-label')?.length > 0);
      assert('fullscreen button has title (tooltip on hover)',
        btn?.getAttribute('title')?.length > 0);
      assert('fullscreen button onclick wired to toggleChatFullscreen',
        btn?.getAttribute('onclick') === 'toggleChatFullscreen()');
    }

    // ─── 3. Backdrop is pointer-events: none (dashboard interactive) ─
    {
      const backdrop = document.getElementById('chat-backdrop');
      const cs = getComputedStyle(backdrop);
      assert('chat-backdrop pointer-events is "none"',
        cs.pointerEvents === 'none', `actual: ${cs.pointerEvents}`);
    }

    // ─── 4. openChatPanel does NOT lock body scroll ───────────
    {
      const beforeOverflow = document.body.style.overflow;
      window.openChatPanel();
      // Skip the chat-render await — only check side effects.
      await new Promise(r => setTimeout(r, 50));
      const afterOverflow = document.body.style.overflow;
      assert('opening chat does not set body.style.overflow',
        afterOverflow === '' || afterOverflow === beforeOverflow,
        `before: "${beforeOverflow}" / after: "${afterOverflow}"`);
      window.closeChatPanel();
    }

    // ─── 5. Fullscreen toggle toggles class + persists ────────
    {
      const panel = document.getElementById('chat-panel');
      panel.classList.remove('chat-panel-fullscreen');
      localStorage.removeItem('labcharts-chat-fullscreen');

      window.toggleChatFullscreen();
      assert('toggleChatFullscreen ON adds .chat-panel-fullscreen',
        panel.classList.contains('chat-panel-fullscreen'));
      assert('toggleChatFullscreen ON saves "true" to localStorage',
        localStorage.getItem('labcharts-chat-fullscreen') === 'true');

      window.toggleChatFullscreen();
      assert('toggleChatFullscreen OFF removes .chat-panel-fullscreen',
        !panel.classList.contains('chat-panel-fullscreen'));
      assert('toggleChatFullscreen OFF saves "false" to localStorage',
        localStorage.getItem('labcharts-chat-fullscreen') === 'false');
    }

    // ─── 6. CSS: fullscreen class actually sets width to viewport ─
    {
      const panel = document.getElementById('chat-panel');
      panel.classList.add('chat-panel-fullscreen');
      panel.classList.add('open');
      // Wait past the 250ms width transition.
      await new Promise(r => setTimeout(r, 600));
      const cs = getComputedStyle(panel);
      const widthPx = parseFloat(cs.width);
      assert('fullscreen panel width matches viewport (within 5px)',
        Math.abs(widthPx - window.innerWidth) <= 5,
        `panel: ${widthPx}px / viewport: ${window.innerWidth}px`);
      panel.classList.remove('chat-panel-fullscreen', 'open');
    }

    // ─── 7. openChatPanel restores fullscreen from localStorage ─
    {
      const panel = document.getElementById('chat-panel');
      panel.classList.remove('chat-panel-fullscreen');

      // Set localStorage = true → opening should add the class.
      localStorage.setItem('labcharts-chat-fullscreen', 'true');
      window.openChatPanel();
      await new Promise(r => setTimeout(r, 50));
      assert('opening chat with localStorage=true applies fullscreen',
        panel.classList.contains('chat-panel-fullscreen'));
      window.closeChatPanel();

      // Set localStorage = false → opening should NOT apply (and must
      // explicitly remove if previously set, since we use toggle(force)).
      panel.classList.add('chat-panel-fullscreen'); // simulate stale
      localStorage.setItem('labcharts-chat-fullscreen', 'false');
      window.openChatPanel();
      await new Promise(r => setTimeout(r, 50));
      assert('opening chat with localStorage=false explicitly removes fullscreen class',
        !panel.classList.contains('chat-panel-fullscreen'));
      window.closeChatPanel();
    }

    // ─── 8. Backdrop click does NOT trigger modal-nudge anymore ─
    {
      // The legacy nudge handler was removed (backdrop is now pointer-
      // events:none, so clicks never reach it anyway). Verify by
      // inspecting main.js source — the nudge code path is gone.
      const mainSrc = await fetch('js/main.js').then(r => r.text());
      assert('main.js no longer contains chat-backdrop modal-nudge handler',
        !/e\.target\.id === "chat-backdrop".*modal-nudge/.test(mainSrc));
    }

    // ─── 9. body.style.overflow restoration on close (no-op now) ─
    {
      // closeChatPanel used to restore overflow; verify the comment
      // is in place so future readers don't accidentally re-add the
      // body-overflow lock.
      const chatSrc = await fetch('js/chat-panel.js').then(r => r.text());
      assert('closeChatPanel comment notes body.style.overflow is no longer set',
        /body\.style\.overflow no longer set on open/.test(chatSrc));
    }

    // ─── 10. Toggle persists across panel close+reopen ────────
    {
      const panel = document.getElementById('chat-panel');
      window.openChatPanel();
      await new Promise(r => setTimeout(r, 50));
      window.toggleChatFullscreen(); // ON
      await new Promise(r => setTimeout(r, 50));
      window.closeChatPanel();
      panel.classList.remove('chat-panel-fullscreen'); // simulate fresh DOM
      window.openChatPanel();
      await new Promise(r => setTimeout(r, 50));
      assert('reopening chat after fullscreen-on restores fullscreen',
        panel.classList.contains('chat-panel-fullscreen'));
      window.closeChatPanel();
    }

    // ─── 11. Body class wiring drives dashboard auto-shift ────
    {
      localStorage.removeItem('labcharts-chat-fullscreen');
      document.body.classList.remove('chat-open', 'chat-fullscreen');

      window.openChatPanel();
      await new Promise(r => setTimeout(r, 50));
      assert('opening chat adds body.chat-open',
        document.body.classList.contains('chat-open'));
      assert('opening chat with fullscreen=false does not add body.chat-fullscreen',
        !document.body.classList.contains('chat-fullscreen'));

      window.toggleChatFullscreen(); // ON
      assert('toggling fullscreen ON mirrors body.chat-fullscreen',
        document.body.classList.contains('chat-fullscreen'));

      window.toggleChatFullscreen(); // OFF
      assert('toggling fullscreen OFF removes body.chat-fullscreen',
        !document.body.classList.contains('chat-fullscreen'));

      window.closeChatPanel();
      assert('closing chat drops both body classes',
        !document.body.classList.contains('chat-open') &&
        !document.body.classList.contains('chat-fullscreen'));
    }

    // ─── 12. Dashboard padding-right shifts when chat is open ─
    {
      const main = document.querySelector('.main, #main-content');
      if (main) {
        const beforePadding = parseFloat(getComputedStyle(main).paddingRight);
        window.openChatPanel();
        await new Promise(r => setTimeout(r, 400)); // wait past 0.3s transition
        const afterPadding = parseFloat(getComputedStyle(main).paddingRight);
        assert('opening chat increases main padding-right (dashboard shifts left)',
          afterPadding > beforePadding + 100,
          `before: ${beforePadding}px / after: ${afterPadding}px`);

        // Toggle fullscreen — padding should drop back down (chat covers all)
        window.toggleChatFullscreen();
        await new Promise(r => setTimeout(r, 400));
        const fullscreenPadding = parseFloat(getComputedStyle(main).paddingRight);
        assert('fullscreen mode releases the shift (padding-right drops)',
          fullscreenPadding < afterPadding - 100,
          `non-fullscreen: ${afterPadding}px / fullscreen: ${fullscreenPadding}px`);

        window.toggleChatFullscreen(); // back to non-fullscreen
        await new Promise(r => setTimeout(r, 100));
        window.closeChatPanel();
        // Wait past the 0.3s transition + a generous margin.
        await new Promise(r => setTimeout(r, 600));
        const closedPadding = parseFloat(getComputedStyle(main).paddingRight);
        assert('closing chat shrinks padding-right back below the open value',
          closedPadding < afterPadding - 100,
          `before: ${beforePadding}px / open: ${afterPadding}px / closed: ${closedPadding}px`);
      } else {
        assert('main content element exists for shift testing', false, 'no .main / #main-content found');
      }
    }
  } finally {
    // Restore any pre-existing user state.
    if (savedFullscreen === null) localStorage.removeItem('labcharts-chat-fullscreen');
    else localStorage.setItem('labcharts-chat-fullscreen', savedFullscreen);
    document.getElementById('chat-panel')?.classList.remove('chat-panel-fullscreen');
  }

  console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
})();
