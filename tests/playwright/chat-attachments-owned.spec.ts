import { expect, test } from './coverage-fixture.js';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
test.beforeEach(async ({ page, context }) => {
  await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
  await context.addInitScript(() => {
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-analytics-consent-seen', '1'); localStorage.setItem('labcharts-ai-provider', 'ollama'); localStorage.setItem('labcharts-ai-paused', 'false');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({ accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-10-07T00:00:00Z', appVersion: 'test', location: 'local-test' }));
  });
  await page.goto('/app'); await expect(page.locator('html[data-app-ready]')).toBeAttached();
  await page.evaluate(async () => { await (await import('/js/chat-loader.js')).openChatPanel(); (await import('/js/state.js')).state.chatHistory = [{ role: 'user', content: 'Attachment fixture conversation' }]; (await import('/js/chat-render.js')).renderChatMessages(); });
  await expect(page.locator('[data-chat-attachment-view]')).toBeVisible();
});
test('owned attachment reads enforce limits and cannot revive cleared or switched drafts', async ({ page }) => {
  const result = await page.evaluate(async png => {
    const images = await import('/js/chat-images.js'), { state } = await import('/js/state.js');
    const bytes = Uint8Array.from(atob(png), char => char.charCodeAt(0));
    const gates: Array<() => void> = [];
    const image = (name: string) => { const file = new File([bytes], name, { type: 'image/png' }); const original = file.arrayBuffer.bind(file); Object.defineProperty(file, 'arrayBuffer', { value: () => new Promise<ArrayBuffer>(resolve => gates.push(() => { void original().then(resolve); })) }); return file; };
    images.clearAttachments();
    const first = Array.from({ length: 6 }, (_, i) => images.addImageAttachment(image(`image-${i}.png`)));
    const reserved = gates.length; gates.splice(0).forEach(release => release()); await Promise.all(first);
    const count = images.getPendingAttachments().length, original = images.getPendingAttachments()[0]?.base64;
    images.clearAttachments(); const cleared = images.addImageAttachment(image('cleared.png')); images.clearAttachments(); gates.splice(0).forEach(release => release()); await cleared;
    const afterClear = images.getPendingAttachments().length;
    const oldThread = state.currentThreadId; const switched = images.addImageAttachment(image('wrong-thread.png')); state.currentThreadId = 'other-thread'; images.refreshAttachmentDraft(); gates.splice(0).forEach(release => release()); await switched;
    const afterSwitch = images.getPendingAttachments().length; state.currentThreadId = oldThread; images.refreshAttachmentDraft(); const origin = images.getPendingAttachments().length;
    const consumed = { name: 'submitted' }; images.getPendingAttachments().push(consumed); const retained = images.addImageAttachment(image('during-save.png')); images.consumeAttachments([consumed]); gates.splice(0).forEach(release => release()); await retained;
    const duringSave = images.getPendingAttachments().map(a => a.name);
    images.clearAttachments();
    const imported: string[] = [];
    images.configureChatImages({ importFiles: async (files: File[]) => { imported.push(...files.map(file => file.name)); } });
    const batch = images.handleChatFiles([image('cancelled-first.png'), image('remaining-import.png')]);
    localStorage.setItem('labcharts-ai-paused', 'true');
    gates.splice(0).forEach(release => release()); await batch;
    const afterCapabilityChange = images.getPendingAttachments().length;
    localStorage.setItem('labcharts-ai-paused', 'false');
    const profile = state.currentProfile;
    const profileRead = images.addImageAttachment(image('wrong-profile.png'));
    state.currentProfile = 'other-profile'; images.refreshAttachmentDraft();
    gates.splice(0).forEach(release => release()); await profileRead;
    state.currentProfile = profile; images.refreshAttachmentDraft();
    const afterProfile = images.getPendingAttachments().length;
    const routeRead = images.addImageAttachment(image('wrong-model.png'));
    localStorage.setItem('labcharts-ollama-model', 'changed-during-read');
    gates.splice(0).forEach(release => release()); await routeRead;
    const afterRoute = images.getPendingAttachments().length;
    const retiredRead = images.addImageAttachment(image('retired-composer.png'));
    document.querySelector('[data-chat-attachment-view]')!.remove();
    gates.splice(0).forEach(release => release()); await retiredRead;
    const afterRetire = images.getPendingAttachments().length;
    return { reserved, count, original, afterClear, afterSwitch, origin, duringSave, afterProfile, afterRoute, afterRetire, imported, afterCapabilityChange };

  }, png);
  expect(result).toEqual({ reserved: 5, count: 5, original: png, afterClear: 0, afterSwitch: 0, origin: 0, duringSave: ['during-save.png'], afterProfile: 0, afterRoute: 0, afterRetire: 0, imported: ['remaining-import.png'], afterCapabilityChange: 0 });
});
test('owned attachment controls remove once, restore focus, and route unsupported paste to import', async ({ page }) => {
  await page.locator('#chat-attach-btn').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add photos', exact: true }).click();
  await (await chooser).setFiles([{ name: 'literal <lab>.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }, { name: 'second.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }]);
  await expect(page.locator('#chat-context-menu')).not.toHaveAttribute('open', '');

  await expect(page.locator('.chat-attach-count')).toHaveText('2/5'); await expect(page.locator('#chat-attach-preview img').first()).toHaveAttribute('alt', 'literal <lab>.png'); await expect(page.locator('#chat-attach-preview lab')).toHaveCount(0);
  const first = page.getByRole('button', { name: 'Remove literal <lab>.png', exact: true }); await first.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.chat-attach-count')).toHaveText('1/5'); await expect(page.getByRole('button', { name: 'Remove second.png', exact: true })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('#chat-attach-preview')).toBeHidden(); await expect(page.locator('#chat-input')).toBeFocused();
  await page.locator('#chat-attach-btn').click(); await page.keyboard.press('Escape'); await expect(page.locator('#chat-attach-btn')).toBeFocused(); await expect(page.locator('#chat-panel')).toHaveClass(/open/);
  await page.evaluate(() => {
    document.getElementById('pdf-input')!.addEventListener('click', event => {
      event.preventDefault(); document.body.dataset.attachmentImportCalls = String(Number(document.body.dataset.attachmentImportCalls || 0) + 1);
    }, { once: true });
  });
  await page.locator('#chat-attach-btn').click();
  await page.getByRole('button', { name: /^Import health file/ }).click();
  await expect(page.locator('body')).toHaveAttribute('data-attachment-import-calls', '1');
  await expect(page.locator('#chat-context-menu')).not.toHaveAttribute('open', '');
  const pasted = await page.evaluate(async png => {
    const images = await import('/js/chat-images.js'); let imported: string[] = []; images.configureChatImages({ importFiles: async (files: File[]) => { imported.push(...files.map(f => f.name)); } });
    localStorage.setItem('labcharts-ai-paused', 'true'); window.dispatchEvent(new Event('labcharts-ai-settings-local-changed'));
    const file = new File([Uint8Array.from(atob(png), char => char.charCodeAt(0))], 'unsupported.png', { type: 'image/png' });
    const event = new Event('paste', { bubbles: true, cancelable: true }); Object.defineProperty(event, 'clipboardData', { value: { items: [{ type: file.type, getAsFile: () => file }] } }); document.getElementById('chat-input')!.dispatchEvent(event);
    await Promise.resolve(); return { imported, queued: images.getPendingAttachments().length, hidden: document.getElementById('chat-add-photo-action')!.hidden, prevented: event.defaultPrevented };
  }, png); expect(pasted).toEqual({ imported: ['unsupported.png'], queued: 0, hidden: true, prevented: true });
});
test('owned attachment layout and lightbox remain accessible across themes and narrow screens', async ({ page }) => {
  test.setTimeout(90000);
  await page.locator('#chat-image-input').setInputFiles([{ name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }, { name: 'b.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }]);
  await expect(page.locator('.chat-attach-count')).toHaveText('2/5');
  for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
    await page.evaluate(async theme => { const t = await import('/js/theme.js'); await t.loadExtraThemesStylesheet(); t.setTheme(theme); }, theme);
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 900 }); await page.locator('#chat-attach-btn').click();
      await expect.poll(() => page.locator('.chat-context-menu-popover').evaluate(element => { const box = element.getBoundingClientRect(); return box.left >= -1 && box.right <= innerWidth + 1 && box.top >= 0; }), { message: `${theme}/${width}` }).toBe(true);
      const violations = await page.locator('[data-chat-attachment-view]').evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') ;}).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.failureSummary) })));
      expect(violations, `${theme}/${width}`).toEqual([]); await page.keyboard.press('Escape');
    }
  }
  await page.screenshot({ path: test.info().outputPath('attachments-narrow.png') });
  await page.locator('#chat-input').focus();
  await page.evaluate(async png => { (await import('/js/chat-images.js')).openImageLightbox(`data:image/png;base64,${png}`); }, png);
  const dialog = page.getByRole('dialog', { name: 'Attached image preview', exact: true }); await expect(dialog).toBeVisible(); await expect(page.locator('.chat-lightbox-close')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.locator('.chat-lightbox-close')).toBeFocused();
  const violations = await dialog.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') ;}).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => v.id)); expect(violations).toEqual([]);
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(page.locator('#chat-input')).toBeFocused(); await expect(page.locator('#chat-panel')).toHaveClass(/open/);
});


test('owned attachment delayed portal drops cannot import into a retired composer', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const images = await import('/js/chat-images.js');
    const imported: string[] = [];
    images.configureChatImages({ importFiles: async (files: File[]) => { imported.push(...files.map(file => file.name)); } });
    let release!: (handle: { kind: string; getFile(): Promise<File> }) => void;
    let acquisitions = 0;
    const source = { files: [], items: [{ kind: 'file', getAsFile: () => null,
      getAsFileSystemHandle: () => { acquisitions += 1; return new Promise(resolve => { release = resolve; }); },
    }] } as unknown as DataTransfer;
    const pending = images.handleDroppedChatFiles(source);
    const acquiredBeforeReturning = acquisitions === 1;
    document.querySelector('[data-chat-attachment-view]')!.remove();
    release({ kind: 'file', getFile: async () => new File(['%PDF fixture'], 'retired.pdf', { type: 'application/pdf' }) });
    await pending;
    return { acquiredBeforeReturning, imported };
  });
  expect(result).toEqual({ acquiredBeforeReturning: true, imported: [] });
});
