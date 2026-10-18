import { expect, test } from './coverage-fixture.js';
import { installChatVoiceFixture, type Fixture } from '../helpers/chat-voice-fixture.js';
test.beforeEach(async ({ page, context }) => {
  await installChatVoiceFixture(context);
  await page.goto('/app'); await expect(page.locator('html[data-app-ready]')).toBeAttached();
  await page.evaluate(async () => { await (await import('/js/chat-loader.js')).openChatPanel(); const { state } = await import('/js/state.js'); state.chatHistory = [{ role: 'user', content: 'Voice fixture question' }, { role: 'assistant', content: 'Review ferritin with your clinician.' }]; (await import('/js/chat-render.js')).renderChatMessages(); });
  await expect(page.locator('[data-chat-voice-view]')).toBeVisible(); await expect(page.locator('#chat-listen-btn-1')).toHaveAttribute('data-chat-speech-owned', '');
});
test('owned voice button records once, transcribes into the draft and updates accessible status', async ({ page }) => {
  await page.locator('#chat-input').fill('Draft:'); await page.locator('#chat-input').press('End');
  await page.getByRole('button', { name: 'Speak message', exact: true }).click(); await expect(page.locator('#chat-voice-btn')).toHaveAttribute('aria-pressed', 'true'); await expect(page.locator('#chat-voice-status')).toContainText('audio goes to');
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click(); await expect(page.locator('#chat-input')).toHaveValue('Draft: check my ferritin'); await expect(page.locator('#chat-voice-status')).toBeHidden(); await expect(page.locator('#chat-input')).toBeFocused();
  expect(await page.evaluate(() => { const f = (window as unknown as { voiceFixture: Fixture; }).voiceFixture; return [f.mediaCalls, f.starts, f.stops, f.requests.length]; })).toEqual([1, 1, 1, 1]);
});
test('owned requesting control cancels a late microphone permission without starting recording', async ({ page }) => {
  await page.evaluate(() => { (window as unknown as { voiceFixture: Fixture; }).voiceFixture.holdPermission = true; });
  await page.getByRole('button', { name: 'Speak message', exact: true }).click(); await expect(page.getByRole('button', { name: 'Cancel microphone preparation', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Cancel microphone preparation', exact: true }).click(); await page.evaluate(() => { (window as unknown as { voiceFixture: Fixture; }).voiceFixture.permission?.(); });
  await expect.poll(() => page.evaluate(() => (window as unknown as { voiceFixture: Fixture; }).voiceFixture.stops)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { voiceFixture: Fixture; }).voiceFixture.starts)).toBe(0); await expect(page.locator('#chat-voice-status')).toBeHidden();
});
for (const boundary of ['profile', 'thread', 'input'] as const) test(`owned voice discards late transcription after ${boundary} changes`, async ({ page }) => {
  await page.locator('#chat-input').fill('Original'); await page.evaluate(() => { (window as unknown as { voiceFixture: Fixture; }).voiceFixture.holdTranscript = true; });
  await page.getByRole('button', { name: 'Speak message', exact: true }).click(); await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Stop recording', exact: true }).click(); await expect(page.getByRole('button', { name: 'Cancel transcription', exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { voiceFixture: Fixture; }).voiceFixture.transcript)).toBe(true);
  await page.evaluate(async boundary => { const { state } = await import('/js/state.js'); if (boundary === 'profile') state.currentProfile = 'retired-profile'; else if (boundary === 'thread') state.currentThreadId = 'retired-thread'; else { const input = document.createElement('textarea'); input.id = 'chat-input'; input.value = 'Replacement'; document.getElementById('chat-input')!.replaceWith(input); } (window as unknown as { voiceFixture: Fixture; }).voiceFixture.transcript?.(); }, boundary);
  await expect(page.locator('#chat-voice-status')).toBeHidden(); await expect(page.locator('#chat-input')).toHaveValue(boundary === 'input' ? 'Replacement' : 'Original');
});
test('owned speech controls preserve button identity, preparation cancellation and background playback', async ({ page }) => {
  await page.evaluate(() => { (window as unknown as { voiceFixture: Fixture; }).voiceFixture.holdSpeech = true; });
  const listen = page.locator('#chat-listen-btn-1'); await listen.focus(); await page.keyboard.press('Enter'); await expect(listen).toHaveText('Preparing…'); await expect(listen).toHaveAccessibleName('Cancel speech preparation'); await expect(listen).toBeFocused();
  await listen.click(); await expect(listen).toHaveText('Listen');
  await page.evaluate(() => { const f = (window as unknown as { voiceFixture: Fixture; }).voiceFixture; f.speech?.(); f.holdSpeech = false; });
  await listen.click(); await expect(listen).toHaveText('Stop'); await expect(listen).toHaveAccessibleName('Stop reading');
  await page.evaluate(async () => { (await import('/js/chat-panel.js')).closeChatPanel(); });
  expect(await page.evaluate(async () => (await import('/js/voice-controller.js')).isVoicePlaybackActive())).toBe(true);
  await page.evaluate(async () => { await (await import('/js/chat-loader.js')).openChatPanel(); (await import('/js/chat-render.js')).renderChatMessages(); (await import('/js/voice-controller.js')).restoreVoicePlaybackUi(); });
  await expect(listen).toHaveText('Stop'); await listen.click(); await expect(listen).toHaveText('Listen');
});
test('owned voice controls retain layout, contrast and reduced motion across themes', async ({ page }) => {
  test.setTimeout(90000); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Speak message', exact: true }).click(); await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
  for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
    await page.evaluate(async theme => { const t = await import('/js/theme.js'); await t.loadExtraThemesStylesheet(); t.setTheme(theme); }, theme);
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(async () => {
        const violations = await page.locator('[data-chat-voice-view]').evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core'); }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, html: n.html, failure: n.failureSummary })) })));
        expect(violations, `${theme}/${width}`).toEqual([]);
      }).toPass({ timeout: 5000 });
      await expect(async () => {
        const box = await page.locator('#chat-voice-btn').boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      }).toPass({ timeout: 5000 });
      expect(await page.locator('#chat-voice-btn').evaluate(e => getComputedStyle(e).animationName)).toBe('none');
    }
  }
  await page.locator('#chat-voice-btn').click(); await page.screenshot({ path: test.info().outputPath('voice-narrow.png') });
});

for (const boundary of ['profile', 'thread'] as const) test(`owned speech rejects obsolete ${boundary} replies before playback`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => { (window as unknown as { voiceFixture: Fixture; }).voiceFixture.holdSpeech = true; });
  await page.locator('#chat-listen-btn-1').click(); await expect(page.locator('#chat-listen-btn-1')).toHaveText('Preparing…');
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { voiceFixture: Fixture; }).voiceFixture.speech)).toBe(true);
  await page.evaluate(async boundary => {
    const { state } = await import('/js/state.js'); if (boundary === 'profile') state.currentProfile = 'retired-profile'; else state.currentThreadId = 'retired-thread';
    (window as unknown as { voiceFixture: Fixture; }).voiceFixture.speech?.();
  }, boundary);
  await expect.poll(() => page.evaluate(async () => (await import('/js/voice-controller.js')).isVoicePlaybackActive())).toBe(false);
  expect(await page.evaluate(() => (window as unknown as { voiceFixture: Fixture; }).voiceFixture.playedAudio.filter(url => url === 'blob:voice-audio'))).toEqual([]);
  expect(errors).toEqual([]);
});

test('owned speech states remain readable and keyboard accessible in every theme', async ({ page }) => {
  test.setTimeout(90000); await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'synth-sunrise', 'neuromancer']) {
    await page.evaluate(async theme => { const t = await import('/js/theme.js'); await t.loadExtraThemesStylesheet(); t.setTheme(theme); }, theme);
    for (const mode of ['idle', 'busy', 'waiting', 'speaking'] as const) {
      await page.evaluate(async mode => { (await import('/js/chat-speech-component.js')).publishChatSpeech(1, mode); }, mode);
      await expect(async () => {
        const violations = await page.locator('#chat-listen-btn-1').evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core'); }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.failureSummary) })));
        expect(violations, `${theme}/${mode}`).toEqual([]);
      }).toPass({ timeout: 5000 });
      await page.locator('#chat-listen-btn-1').focus(); await expect(page.locator('#chat-listen-btn-1')).toBeFocused();
      expect(await page.locator('#chat-listen-btn-1 svg').evaluate(e => getComputedStyle(e).animationName)).toBe('none');
    }
  }
});
