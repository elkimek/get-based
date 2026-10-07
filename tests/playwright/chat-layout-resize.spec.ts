import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(() => {
    for (const key of [
      'labcharts-chat-panel-width',
      'labcharts-chat-panel-with-rail-width',
      'labcharts-chat-rail-width',
    ]) localStorage.removeItem(key);
    localStorage.setItem('labcharts-ai-provider', 'ollama');
    localStorage.setItem('labcharts-ai-paused', 'false');
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({
      accepted: true,
      termsVersion: '2026-08-22',
      privacyVersion: '2026-08-22',
      policyScope: 'self-hosted-notice',
      acceptedAt: '2026-09-04T00:00:00.000Z',
      appVersion: 'chat-layout-resize-test',
      location: 'chat-layout-resize-test',
    }));
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => (await import('/js/chat-panel.js')).openChatPanel());
});

test('desktop chat and conversation rail resize independently and persist', async ({ page }) => {
  const panel = page.locator('#chat-panel');
  const rail = page.locator('#chat-thread-rail');
  const main = page.locator('#main-content');
  const panelHandle = page.locator('#chat-panel-resize-handle');
  const railHandle = page.locator('#chat-rail-resize-handle');

  await expect(panel).toHaveCSS('width', '600px');
  await expect(main).toHaveCSS('padding-right', '632px');
  await page.evaluate(async () => (await import('/js/chat-threads.js')).toggleThreadRail());
  await expect(panel).toHaveCSS('width', '820px');
  await expect(rail).toHaveCSS('width', '220px');
  await expect(main).toHaveCSS('padding-right', '852px');
  await expect(panelHandle).toHaveAttribute('aria-valuemin', '580');
  await expect(railHandle).toHaveAttribute('aria-valuemax', '360');

  const panelBox = await panelHandle.boundingBox();
  expect(panelBox).toBeTruthy();
  await page.mouse.move(panelBox!.x + panelBox!.width / 2, 300);
  await page.mouse.down();
  await page.mouse.move(panelBox!.x - 80, 300);
  const livePanelWidth = Math.round((await panel.boundingBox())!.width);
  expect(livePanelWidth).toBeGreaterThanOrEqual(895);
  expect(livePanelWidth).toBeLessThanOrEqual(910);
  await expect(main).toHaveCSS('padding-right', `${livePanelWidth + 32}px`);
  await page.mouse.up();
  const panelWidthAfterDrag = Math.round((await panel.boundingBox())!.width);
  expect(panelWidthAfterDrag).toBe(livePanelWidth);
  await expect(main).toHaveCSS('padding-right', `${panelWidthAfterDrag + 32}px`);

  const railBox = await railHandle.boundingBox();
  expect(railBox).toBeTruthy();
  await page.mouse.move(railBox!.x, 300);
  await page.mouse.down();
  await page.mouse.move(railBox!.x + 40, 300);
  await page.mouse.up();
  const railWidthAfterDrag = Math.round((await rail.boundingBox())!.width);
  expect(railWidthAfterDrag).toBeGreaterThanOrEqual(255);
  expect(railWidthAfterDrag).toBeLessThanOrEqual(265);
  expect(Math.round((await panel.boundingBox())!.width)).toBe(panelWidthAfterDrag);
  await expect(main).toHaveCSS('padding-right', `${panelWidthAfterDrag + 32}px`);

  await panelHandle.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(panel).toHaveCSS('width', `${panelWidthAfterDrag + 16}px`);
  await railHandle.focus();
  await page.keyboard.press('ArrowRight');
  await expect(rail).toHaveCSS('width', `${railWidthAfterDrag + 16}px`);

  const saved = await page.evaluate(() => ({
    panel: localStorage.getItem('labcharts-chat-panel-with-rail-width'),
    rail: localStorage.getItem('labcharts-chat-rail-width'),
  }));
  expect(saved).toEqual({
    panel: String(panelWidthAfterDrag + 16),
    rail: String(railWidthAfterDrag + 16),
  });
});

test('resize handles stay out of the mobile takeover layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#chat-panel-resize-handle')).toBeHidden();
  await expect(page.locator('#chat-rail-resize-handle')).toBeHidden();
  await expect(page.locator('#chat-panel')).toHaveCSS('width', '390px');
});

for (const boundary of ['blur','capture','close','fullscreen','rail','mobile'] as const) {
  test(`owned resize cancels at the ${boundary} boundary`, async ({page}) => {
    if(boundary==='rail') await page.evaluate(async()=> (await import('/js/chat-threads.js')).toggleThreadRail());
    // Real pointer coordinates must follow the completed panel slide-in.
    await expect(page.locator('#chat-panel')).toHaveCSS('transform','matrix(1, 0, 0, 1, 0, 0)');
    if(boundary==='rail') {
      await expect(page.locator('#chat-panel')).toHaveCSS('width','820px');
      await expect(page.locator('#chat-thread-rail')).toHaveCSS('width','220px');
    }
    const handle=page.locator(boundary==='rail'?'#chat-rail-resize-handle':'#chat-panel-resize-handle');
    const box=(await handle.boundingBox())!;
    await page.mouse.move(box.x+box.width/2,300);await page.mouse.down();
    await expect(page.locator('body')).toHaveClass(/chat-layout-resizing/);
    const saved=await page.evaluate(()=>['labcharts-chat-panel-width','labcharts-chat-panel-with-rail-width','labcharts-chat-rail-width'].map(key=>localStorage.getItem(key)));
    if(boundary==='mobile') await page.setViewportSize({width:390,height:844});
    else if(boundary==='blur') await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    else if(boundary==='capture') await handle.dispatchEvent('lostpointercapture');
    else if(boundary==='rail') await page.evaluate(async()=> (await import('/js/chat-threads.js')).toggleThreadRail());
    else await page.evaluate(async boundary=>{
      const panel=await import('/js/chat-panel.js');
      if(boundary==='close') panel.closeChatPanel();else panel.toggleChatFullscreen();
    },boundary);
    await expect(page.locator('body')).not.toHaveClass(/chat-layout-resizing/);
    if(['fullscreen','rail','mobile'].includes(boundary)) await expect(handle).toBeHidden();
    if(boundary==='close') await expect(page.locator('#chat-panel')).toHaveAttribute('aria-hidden','true');
    await page.mouse.move(box.x-50,300);await page.mouse.up();
    expect(await page.evaluate(()=>['labcharts-chat-panel-width','labcharts-chat-panel-with-rail-width','labcharts-chat-rail-width'].map(key=>localStorage.getItem(key)))).toEqual(saved);
  });
}
