import {openStaticSettings, awaitStaticThemeReady} from './settings-entry.js';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { startKitServer } from './kit-server.js';
test.use({ actionTimeout: 15_000 });
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
async function ready(page: Page) {
  await expect(page.locator('html[data-app-ready][data-shell-framework="sveltekit"]')).toBeAttached({ timeout:30_000 });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller),{timeout:30_000}).toBe(true);
}
async function openPpq(page: Page) {
  await openStaticSettings(page); await page.locator('#settings-nav-ai').click();
  await expect(page.locator('[data-ppq-settings-view]')).toBeVisible();
  // AI-tab entrance fades its whole provider subtree; contrast needs its settled paint.
  await expect(page.locator('#settings-tab-ai')).toHaveCSS('opacity', '1');
}
test('PPQ Settings uses cached assets with an unavailable origin and retains private selections through cold launch',async({page,context})=>{
  test.setTimeout(150_000);await context.addInitScript({path:'node_modules/axe-core/axe.min.js'});
  await context.addInitScript(()=>{
    if(!['http:','https:'].includes(location.protocol))return;
    // A controlling worker can bypass Playwright routing in WPE WebKit.
    // Fail only the external provider transport; local requests still exercise
    // the deployed worker and unavailable-origin artifact without a UI mock.
    const transport = window as unknown as { offlinePpqFetches: number; syntheticPpqInvoice?: boolean };
    transport.offlinePpqFetches = 0;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.origin === 'https://api.ppq.ai') {
        ++transport.offlinePpqFetches;
        // Only this synthetic invoice response is supplied by the fixture.
        // The real bundled UI, QR loader, vendor, CSP and worker stay intact.
        if (transport.syntheticPpqInvoice && url.pathname.startsWith('/topup/create/')) {
          return Promise.resolve(new Response(JSON.stringify({ invoice_id: 'synthetic-offline-invoice', payment_address: 'synthetic-offline-payment-address', crypto_amount_due: '0.02', expires_at: Math.floor(Date.now()/1000)+120 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return Promise.reject(new TypeError('Provider unavailable in offline acceptance'));
      }
      return originalFetch(input, init);
    };
    for(const key of ['emptyTour','tour'])localStorage.setItem(`labcharts-default-${key}`,'completed');
    localStorage.setItem('labcharts-encryption-nudge-dismissed','true');localStorage.setItem('labcharts-analytics-consent-seen','1');
    localStorage.setItem('labcharts-legal-acceptance',JSON.stringify({accepted:true,termsVersion:'2026-08-22',privacyVersion:'2026-08-22',policyScope:'self-hosted-notice',acceptedAt:'2026-10-06T00:00:00Z',appVersion:'test',location:'local-test'}));
    if(localStorage.getItem('ppq-settings-fixture-seeded'))return;
    localStorage.setItem('ppq-settings-fixture-seeded','1');localStorage.setItem('labcharts-ai-provider','ppq');localStorage.setItem('labcharts-ai-paused','false');
    localStorage.setItem('labcharts-ppq-key','synthetic-nonfunctional-key');localStorage.setItem('labcharts-ppq-model','synthetic-a');
    localStorage.setItem('labcharts-ppq-models',JSON.stringify([{id:'synthetic-a',name:'Synthetic A'},{id:'synthetic-b',name:'Synthetic B'}]));
    localStorage.setItem('labcharts-ppq-private-mode','off');
    localStorage.setItem('labcharts-ppq-private-models',JSON.stringify([{id:'private/a',name:'Private A'},{id:'private/b',name:'Private B'}]));
    localStorage.setItem('labcharts-ppq-model-private','private/b');
    localStorage.setItem('labcharts-ppq-pricing',JSON.stringify({'synthetic-a':{input:1,output:2},'synthetic-b':{input:3,output:6},'private/a':{input:1,output:2},'private/b':{input:2,output:4}}));
  });
  const server=await startKitServer(artifact);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try {
    await page.goto(server.origin+'/app?dev-sw=1');await ready(page);server.state.offline=true;await openPpq(page);
    const panel=page.locator('[data-ppq-settings-view]');const select=panel.locator('#ppq-model-select');
    await expect(panel.locator('#ppq-key-input')).toHaveAttribute('type','password');
    await expect(select).toHaveValue('synthetic-a');await select.selectOption('synthetic-b');await expect(select).toHaveValue('synthetic-b');
    expect(await page.evaluate(()=>localStorage.getItem('labcharts-ppq-model'))).toBe('synthetic-b');
    await expect(panel.locator('#ppq-model-pricing')).toContainText('$3.00/M in');
    await expect(panel.locator('#ppq-balance')).toHaveText('Balance: unavailable');
    await expect.poll(() => page.evaluate(() => (window as unknown as {offlinePpqFetches:number}).offlinePpqFetches)).toBeGreaterThan(0);
    const toggle=panel.locator('#ppq-private-toggle');
    await toggle.check();await expect(select).toHaveValue('private/b');
    await select.selectOption('private/a');await expect(select).toHaveValue('private/a');
    await toggle.uncheck();await expect(select).toHaveValue('synthetic-b');
    await toggle.check();await expect(select).toHaveValue('private/a');
    await expect(panel.locator('#ppq-private-indicator')).toBeVisible();
    await expect(panel).toContainText('verified PPQ/Tinfoil TEE');
    await expect(panel).toContainText('Web search is disabled');
    expect(await page.evaluate(()=>({privateMode:localStorage.getItem('labcharts-ppq-private-mode'),regular:localStorage.getItem('labcharts-ppq-model-regular'),private:localStorage.getItem('labcharts-ppq-model-private')}))).toEqual({privateMode:'on',regular:'synthetic-b',private:'private/a'});

    await panel.locator('#ppq-topup-toggle').click();
    await expect(panel.locator('#ppq-topup-area')).toBeVisible();
    await panel.locator('[data-ppq-method="xmr"]').click();
    await expect(panel.locator('[data-ppq-method="xmr"]')).toHaveAttribute('aria-pressed','true');
    await panel.locator('[data-provider-panel-action="ppq-topup-preset"][data-amount="5"]').click();
    await expect(panel.locator('#ppq-topup-area')).toContainText('Could not create this invoice. Please retry.');
    await panel.locator('[data-provider-panel-action="cancel-ppq-topup"]').click();
    await expect(panel.locator('#ppq-topup-area')).toBeHidden();

    // Exercise the actual invoice and QR path with synthetic provider data.
    // No real account, invoice or payment is created.
    await page.evaluate(()=>{(window as unknown as {syntheticPpqInvoice:boolean}).syntheticPpqInvoice=true;});
    await panel.locator('#ppq-topup-toggle').click();await panel.locator('[data-ppq-method="xmr"]').click();
    await panel.locator('[data-provider-panel-action="ppq-topup-preset"][data-amount="5"]').click();
    const qr=panel.locator('#ppq-topup-area img');await expect(qr).toBeVisible();await expect(qr).toHaveAttribute('src',/^data:image\/svg\+xml/);
    expect(await qr.evaluate(element=>(element as HTMLImageElement).complete&&(element as HTMLImageElement).naturalWidth>0)).toBe(true);
    await expect(panel.locator('a[href="monero:synthetic-offline-payment-address"]')).toBeVisible();
    await panel.locator('summary').click();await expect(panel.locator('details')).toContainText('synthetic-offline-payment-address');
    expect(await panel.locator('[data-clipboard-text]').count()).toBe(0);
    await panel.locator('[data-provider-panel-action="cancel-ppq-topup"]').click();await expect(panel.locator('#ppq-topup-area')).toBeHidden();

    for(const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']) {
      await page.locator('#settings-nav-display').click();await page.locator('#settings-tab-display [data-settings-action="open-tweaks"]').click();
      await page.locator(`[data-tweaks-action="select-theme"][data-theme-id="${theme}"]`).click();await page.locator('[data-tweaks-action="close"]').click();
      await awaitStaticThemeReady(page, theme);
      const closeChat=page.getByRole('button',{name:'Close chat',exact:true});if(await closeChat.isVisible())await closeChat.click();await openPpq(page);
      for(const width of [1280,700,390]) {
        await page.setViewportSize({width,height:900});await panel.scrollIntoViewIfNeeded();expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
        const violations=await panel.evaluate(async e=>(await(window as unknown as {axe:typeof import('axe-core')}).axe.run(e,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
        expect(violations,`${theme} ${width}`).toEqual([]);
      }
      await expect(select).toHaveValue('private/a');
    }
    await page.close();const cold=await context.newPage();cold.on('pageerror',error=>errors.push(error.message));await cold.goto(server.origin+'/app?dev-sw=1');await ready(cold);await openPpq(cold);
    await expect(cold.locator('#ppq-model-select')).toHaveValue('private/a');await expect(cold.locator('#ppq-key-input')).toHaveAttribute('type','password');
    await expect(cold.locator('#ppq-model-pricing')).toContainText('$1.00/M in');await expect(cold.locator('#ppq-private-toggle')).toBeChecked();await expect(cold.locator('#ppq-topup-area')).toBeHidden();
    expect(await cold.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).map(r=>new URL(r.active!.scriptURL).pathname))).toEqual(['/service-worker.js']);expect(errors).toEqual([]);
  } finally {await server.close();}
});
