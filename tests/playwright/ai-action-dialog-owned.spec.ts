import { expect, test } from './coverage-fixture.js';
import { routeHtml } from '../helpers/browser-static-routes.js';

async function fixture(page: import('@playwright/test').Page, settingsStyles = true) {
  await routeHtml(page,'**/ai-action-dialog-test',`<!doctype html><html lang="en"><head><title>AI notice dialog</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/modal-shared.css">${settingsStyles ? '<link rel="stylesheet" href="/css/settings.css">' : ''}</head><body><main><button id="launch">Import lab results</button></main></body></html>`);
  await page.goto('/ai-action-dialog-test');
  await page.locator('#launch').focus();
}

test('AI notice dialogs preserve themes layouts accessibility and keyboard ownership', async ({ page, context }) => {
  test.setTimeout(180_000);
  await context.addInitScript({ path:'node_modules/axe-core/axe.min.js' });await fixture(page);
  for (const kind of ['import','credits']) {
    await page.evaluate(async kind => {
      if (kind === 'import') (await import('/js/pdf-import.js')).showAINeededDialog('image');
      else (await import('/js/provider-panels.js')).showInsufficientBalanceDialog();
    },kind);
    const dialog = page.locator('[data-ai-action-dialog-view]');
    const first = kind === 'import' ? '#ai-needed-or' : '#or-add-credits';
    const last = kind === 'import' ? '#ai-needed-cancel' : '#or-nb-cancel';
    await expect(page.locator(first)).toBeFocused();
    if (kind === 'import') await expect(page.locator(first)).toContainText('login. Recommended');
    for (const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']) {
      await page.evaluate(async theme => { const themes=await import('/js/theme.js');await themes.loadExtraThemesStylesheet();themes.setTheme(theme); },theme);
      for (const width of [1280,700,390,320]) {
        await page.setViewportSize({ width,height:900 });const label=`${kind}/${theme}/${width}`;
        expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1),label).toBe(true);
        for (const control of await dialog.locator('button:visible').all()) {
          const bounds=await control.boundingBox();expect(Number(bounds?.height.toFixed(3)),label).toBeGreaterThanOrEqual(44);expect(Number(bounds?.width.toFixed(3)),label).toBeGreaterThanOrEqual(44);
        }
        const violations=await dialog.evaluate(async element => (await (window as unknown as { axe:typeof import('axe-core') }).axe.run(element,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
        expect(violations,label).toEqual([]);
      }
    }
    await page.evaluate(async () => (await import('/js/theme.js')).setTheme('dark'));
    await page.setViewportSize({width:390,height:320});
    const compact=await dialog.boundingBox();expect(compact!.y).toBeGreaterThanOrEqual(16);expect(compact!.y+compact!.height).toBeLessThanOrEqual(304.001);
    expect(await dialog.evaluate(element=>getComputedStyle(element).overflowY)).toBe('auto');
    await page.locator(last).focus();await expect(page.locator(last)).toBeInViewport();
    await page.setViewportSize({ width:390,height:900 });
    await page.screenshot({ path:test.info().outputPath(`${kind}-mobile.png`),fullPage:true });await page.setViewportSize({width:1280,height:900});await page.screenshot({path:test.info().outputPath(`${kind}-desktop.png`),fullPage:true});
    await page.locator(last).focus();await page.keyboard.press('Tab');await expect(page.locator(first)).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(page.locator(last)).toBeFocused();
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.locator('#launch')).toBeFocused();expect(await page.evaluate(()=>document.body.style.overflow)).toBe('');
  }
});

test('AI notice entry points preserve contextual copy and private extension action ordering', async ({ page }) => {
  await fixture(page);
  const verbs = { image:'an image',csv:'a CSV',text:'a text file',xlsx:'an Excel workbook',import:'a PDF' };
  for (const [action,verb] of Object.entries(verbs)) {
    await page.evaluate(async action => (await import('/js/pdf-import.js')).showAINeededDialog(action),action);
    await expect(page.locator('[data-ai-action-dialog-view]')).toContainText(`Reading lab values from ${verb}`);await page.locator('#ai-needed-cancel').click();
  }
  await page.evaluate(async () => {
    const panels=await import('/js/provider-panels.js');const extension=await import('/js/app-extension-runtime.js');
    panels.configureProviderPanelDeps({ openExternal:()=>{document.body.dataset.external='opened';} });
    extension.configureAppExtension({id:'ai-dialog-test',ai:{getInsufficientBalanceView:()=>({ title:'<img src=x> Account balance',description:'<b>Literal description</b>',primaryLabel:'<b>Manage credits</b>',primaryDescription:'Account action',ariaLabel:'Account balance empty',onPrimary:()=>{document.body.dataset.extensionAction=document.querySelector('[data-ai-action-dialog-view]') ? 'too-early' : 'after-close';} })}});
    panels.showInsufficientBalanceDialog();
    const retired=document.getElementById('or-add-credits')!;
    extension.configureAppExtension({id:'ai-dialog-new',ai:{getInsufficientBalanceView:()=>({title:'Current account balance',onPrimary:()=>{document.body.dataset.currentAction='called';}})}});
    panels.showInsufficientBalanceDialog();retired.click();
  });
  await expect(page.locator('[data-ai-action-dialog-view]')).toContainText('Current account balance');await expect(page.locator('body')).not.toHaveAttribute('data-extension-action');await expect(page.locator('body')).not.toHaveAttribute('data-current-action');
  await page.evaluate(async () => {
    (await import('/js/app-extension-runtime.js')).configureAppExtension({id:'ai-dialog-original',ai:{getInsufficientBalanceView:()=>({title:'<img src=x> Account balance',description:'<b>Literal description</b>',primaryLabel:'<b>Manage credits</b>',onPrimary:()=>{document.body.dataset.extensionAction=document.querySelector('[data-ai-action-dialog-view]') ? 'too-early' : 'after-close';}})}});
    (await import('/js/provider-panels.js')).showInsufficientBalanceDialog();
  });
  await expect(page.getByRole('dialog')).toContainText('<img src=x> Account balance');await expect(page.getByRole('dialog').locator('img,b')).toHaveCount(0);
  await page.locator('#or-add-credits').click();await expect(page.locator('body')).toHaveAttribute('data-extension-action','after-close');await expect(page.locator('body')).not.toHaveAttribute('data-external');
  await page.evaluate(async()=>{(await import('/js/app-extension-runtime.js')).configureAppExtension(null);(await import('/js/provider-panels.js')).showInsufficientBalanceDialog();});
  await page.locator('#or-add-credits').click();await expect(page.locator('body')).toHaveAttribute('data-external','opened');
});

test('AI notice stylesheet failure retries without reviving a closed dialog', async ({ page }) => {
  let failed=true;
  await page.route('**/css/settings.css*',async route=>{if(failed) await route.abort('failed');else await route.continue();});await fixture(page,false);
  await page.evaluate(async()=> (await import('/js/pdf-import.js')).showAINeededDialog('image'));
  await expect(page.locator('[data-ai-dialog-retry-styles]')).toBeVisible();failed=false;await page.locator('[data-ai-dialog-retry-styles]').click();await expect(page.locator('[data-ai-dialog-retry-styles]')).toHaveCount(0);
  await expect.poll(()=>page.locator('#ai-needed-or').evaluate(element=>getComputedStyle(element).display)).toBe('flex');
  await page.locator('#ai-needed-cancel').click();await expect(page.locator('[data-ai-action-dialog-view]')).toHaveCount(0);
  await page.evaluate(async()=> (await import('/js/pdf-import.js')).showAINeededDialog('csv'));await expect(page.locator('[data-ai-action-dialog-view]')).toContainText('a CSV');
  await page.locator('#ai-needed-or').dispatchEvent('mousedown');await page.locator('#ai-needed-overlay').dispatchEvent('click');await expect(page.locator('[data-ai-action-dialog-view]')).toBeVisible();
  await page.locator('#ai-needed-overlay').dispatchEvent('mousedown');await page.locator('#ai-needed-overlay').dispatchEvent('click');await expect(page.locator('[data-ai-action-dialog-view]')).toHaveCount(0);
});
