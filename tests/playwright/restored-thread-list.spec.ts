import { expect, test } from './coverage-fixture.js';
import { prepareDemoProfile } from './biology-score-fixture.js';

test('import recovery renders safe conversation metadata and scoped empty styling in the real browser', async ({ page }) => {
  await prepareDemoProfile(page);
  await page.evaluate(async () => {
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/css/chat-panel-open.css';
    await new Promise<void>((resolve, reject) => { link.onload = () => resolve(); link.onerror = () => reject(new Error('Chat stylesheet failed')); document.head.append(link); });
  });
  const result = await page.evaluate(async () => {
    const [{ state }, runtime] = await Promise.all([import('/js/state.js'), import('/js/export-runtime.js')]);
    const savedThreads = state.chatThreads, savedId = state.currentThreadId;
    const oldHost = document.getElementById('chat-thread-list'); oldHost?.removeAttribute('id');
    const host = document.createElement('div'); host.id = 'chat-thread-list'; document.body.append(host);
    const deps = runtime.configureExportImportRuntimeDeps({ loadChatThreads: () => true, ensureActiveThread: () => {},
      renderThreadList: null, refreshChatPersonalities: null, buildSidebar: null, updateHeaderDates: null,
      renderProfileButton: null, navigate: null });
    const oldGlobal = window as unknown as Record<string, unknown>;
    const globalRenderer = oldGlobal.renderThreadList;
    oldGlobal.renderThreadList = null;
    try {
      state.chatThreads = [{ id: 'restored', name: '<script>literal</script>', personalityIcon: '&',
        personalityName: '"literal title', createdAt: '2026-08-07T11:58:00Z', updatedAt: '2026-08-07T11:58:00Z', messageCount: 1 }];
      state.currentThreadId = 'restored'; await runtime.refreshImportRuntimeShell({ chat: true });
      const button = host.querySelector<HTMLButtonElement>('button')!; button.focus();
      const populated = { name: host.querySelector('.chat-thread-item-name')?.textContent,
        title: host.querySelector('.chat-thread-item-meta > span')?.getAttribute('title'),
        text: host.querySelector('.chat-thread-item-meta')?.textContent, active: button.getAttribute('aria-current'),
        type: button.type, focused: document.activeElement === button, noScript: !host.querySelector('script') };
      state.chatThreads = []; await runtime.refreshImportRuntimeShell({ chat: true });
      const empty = host.querySelector<HTMLElement>('[data-chat-thread-navigation-view]')!;
      const style = getComputedStyle(empty);
      return { populated, empty: { text: empty.textContent, font: style.fontSize, top: style.paddingTop,
        left: style.paddingLeft, alignment: style.textAlign, inline: empty.hasAttribute('style') } };
    } finally {
      state.chatThreads = savedThreads; state.currentThreadId = savedId; runtime.configureExportImportRuntimeDeps(deps);
      oldGlobal.renderThreadList = globalRenderer; host.remove(); oldHost?.setAttribute('id', 'chat-thread-list');
    }
  });
  expect(result.populated).toMatchObject({ name: '<script>literal</script>', title: '"literal title', active: 'true',
    type: 'button', focused: true, noScript: true });
  expect(result.populated.text).toContain('2m ago'); expect(result.populated.text).toContain('1 msg');
  expect(result.empty).toEqual({ text: 'No conversations yet', font: '12px', top: '12px', left: '10px', alignment: 'center', inline: false });
});
