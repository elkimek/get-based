import { expect, test } from './coverage-fixture.js';

test('coverage straggler browser rails reject and clean up correctly', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const outcomes = {};

    {
      const { resizeImage } = await import(`/js/image-utils.js?bust=${Date.now()}`);
      const garbage = new File([new Uint8Array([0x00, 0x01, 0x02, 0x03])], 'not-an-image.png', { type: 'image/png' });
      let rejected = false;
      try {
        await resizeImage(garbage, 64, 0.7);
      } catch (e) {
        rejected = /Failed to load image/i.test(e.message);
      }
      outcomes.imageOnErrorRejects = rejected;
    }

    {
      const utils = await import(`/js/utils.js?bust=${Date.now()}`);
      const promise = utils.showConfirmDialog('probe');
      await new Promise(resolve => setTimeout(resolve, 50));
      const overlay = document.getElementById('confirm-dialog-overlay');
      const dialog = overlay?.querySelector('.confirm-dialog');
      overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const nudgeApplied = !!dialog?.classList.contains('modal-nudge');
      dialog?.dispatchEvent(new Event('animationend', { bubbles: true }));
      const nudgeCleared = !!dialog && !dialog.classList.contains('modal-nudge');
      document.getElementById('confirm-cancel')?.click();
      await promise.catch(() => {});
      outcomes.confirmBackdropNudges = nudgeApplied;
      outcomes.confirmAnimationEndClearsNudge = nudgeCleared;
    }

    {
      const api = await import(`/js/api.js?bust=${Date.now()}`);
      const originalFetch = window.fetch;
      const originalProvider = localStorage.getItem('labcharts-ai-provider');
      try {
        localStorage.setItem('labcharts-ai-provider', 'ollama');
        const sseChunks = [
          'data: {"choices":[{"delta":{"content":"hel"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
          'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\n',
          'data: [DONE]\n\n',
        ];
        window.fetch = async () => {
          const stream = new ReadableStream({
            start(controller) {
              const enc = new TextEncoder();
              for (const chunk of sseChunks) controller.enqueue(enc.encode(chunk));
              controller.close();
            },
          });
          return new Response(stream, {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        };
        let streamedText = '';
        try {
          await api.callClaudeAPI({
            messages: [{ role: 'user', content: 'probe' }],
            onStream: full => { streamedText = full; },
            maxTokens: 16,
          });
        } catch (_) {
          // Provider-shape variance is tolerated; this probe only needs the streaming rail.
        }
        outcomes.sseChunksAccumulated = streamedText.length > 0;
      } finally {
        window.fetch = originalFetch;
        if (originalProvider == null) localStorage.removeItem('labcharts-ai-provider');
        else localStorage.setItem('labcharts-ai-provider', originalProvider);
      }
    }

    {
      const originalOpen = indexedDB.open;
      indexedDB.open = function() {
        const req = Object.assign(new EventTarget(), {
          error: new Error('stubbed open failure'),
          result: null,
          onerror: null,
          onsuccess: null,
          onupgradeneeded: null,
        });
        Promise.resolve().then(() => req.onerror?.({ target: req }));
        return req;
      };
      try {
        const cashu = await import(`/js/cashu-wallet.js?bust=${Date.now()}`);
        let rejected = false;
        try {
          await cashu.getWalletBalance();
        } catch (_) {
          rejected = true;
        }
        outcomes.cashuOpenDbOnErrorRejects = rejected;
      } finally {
        indexedDB.open = originalOpen;
      }
    }

    return outcomes;
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
