import { expect, test } from './coverage-fixture.js';

for (const boundary of ['new-render', 'navigate-away', 'old-rejection']) {
  test(`delayed Light devices cannot replace content after ${boundary}`, async ({page}) => {
    await page.route('**/light-navigation-recovery', route => route.fulfill({contentType:'text/html',body:'<main id="main-content"></main>'}));
    await page.goto('/light-navigation-recovery');
    const result = await page.evaluate(async boundary => {
      const view = await import('/js/light-page-view.js');
      const {state} = await import('/js/state.js');
      state.importedData = {entries:[],sunSessions:[],deviceSessions:[]};
      let resolve, reject;
      const pending = new Promise((done,fail) => { resolve=done; reject=fail; });
      view.configureLightPageView({getDevices:()=>[{id:'fixture'}],renderDevicesSection:()=>pending});
      view.showLight(state.importedData);
      if (boundary === 'navigate-away') document.getElementById('main-content').innerHTML='<p id="destination">Another page</p>';
      else {
        view.configureLightPageView({renderDevicesSection:async()=>'<section id="current-devices">Current devices</section>'});
        view.showLight(state.importedData);
        await Promise.resolve();
      }
      if (boundary === 'old-rejection') reject(new Error('Old request failed'));
      else resolve('<section id="stale-devices">Stale devices</section>');
      await Promise.resolve(); await Promise.resolve();
      return {stale:!!document.getElementById('stale-devices'),current:!!document.getElementById('current-devices'),destination:!!document.getElementById('destination'),error:document.body.textContent.includes('Devices could not load')};
    }, boundary);
    expect(result.stale).toBe(false);
    expect(result.error).toBe(false);
    expect(boundary === 'navigate-away' ? result.destination : result.current).toBe(true);
  });
}
