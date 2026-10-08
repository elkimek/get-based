import path from 'node:path';
import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createDefaultProfileData } from '../../js/profile.js';
import type { ProfileData } from '../../types/app-state.js';
import type { LightDeviceRecord } from '../../js/light-devices-store.js';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { readComparisonAcceptanceProfile } from '../helpers/nutrition-comparison-fixture.js';
import { installOfflineStartupDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { readyLightArtifact as ready, openLightArtifact as openLight } from '../helpers/light-artifact-navigation.js';

function seed({defaults}:{defaults:ProfileData}) {
  if (!['http:','https:'].includes(location.protocol)) return;
  localStorage.setItem('labcharts-ai-paused','true');
  if (localStorage.getItem('device-setup-seeded')) return;
  localStorage.setItem('device-setup-seeded','1');
  localStorage.setItem('labcharts-profiles',JSON.stringify([{id:'default',name:'Ada',sex:'male',dob:'1990-01-01',createdAt:1}]));
  localStorage.setItem('labcharts-active-profile','default');
  localStorage.setItem('labcharts-default-lastViewV1','insight');
  localStorage.setItem('labcharts-default-units','US');
  for (const key of ['emptyTour','tour']) localStorage.setItem(`labcharts-default-${key}`,'completed');
  localStorage.setItem('labcharts-default-imported',JSON.stringify({
    ...defaults,contextNotes:'Unrelated device-setup data stays intact',
    sunDefaults:{fitzpatrick:'II',completedAt:1,coords:{lat:50.1,lon:14.4}},
    lightDevices:[],deviceSessions:[],sunSessions:[],lightEnvironment:{rooms:[],screens:[]},
    lightMeasurements:[],lightAudits:[],lightDailyVerdicts:{},
  }));
}
async function profile(page:Page) { return await page.evaluate(readComparisonAcceptanceProfile) as ProfileData; }
async function openPresetDialog(page:Page) {
  await page.locator('.light-page [data-widget-id="light-devices"]').getByRole('button',{name:/^(?:\+ )?Add device$/}).click();
  const dialog=page.getByRole('dialog',{name:'Add light device',exact:true});
  await expect(dialog).toHaveAttribute('data-light-device-setup','');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#add-device-confirm')).toBeDisabled();
  await expect(dialog.locator('.light-device-preset-row')).not.toHaveCount(0);
  return dialog;
}
async function inspectCold(page:Page,expected:ProfileData) {
  await openLight(page);
  await expect(page.locator('.light-device-card')).toHaveCount(2);
  await expect(page.locator('.light-device-name').filter({hasText:'Offline <Panel> & lab'})).toHaveCount(1);
  const preset=await openPresetDialog(page);
  await preset.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(preset).not.toBeVisible();
  const reopened=await openPresetDialog(page);
  await reopened.locator('#add-device-custom').click();
  const custom=page.getByRole('dialog',{name:'Add custom light device',exact:true});
  await expect(custom).toBeVisible();
  await expect(custom.locator('#custom-dev-distance')).toHaveAttribute('data-unit','in');
  await expect(custom.locator('#custom-dev-url,#custom-dev-scan')).toHaveCount(0);
  await custom.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(custom).not.toBeVisible();
  expect(await profile(page)).toEqual(expected);
}
test('static device setup first opens offline, saves real preset and custom specifications, and persists unchanged through two cold launches',async({page,context})=>{
  test.setTimeout(120000);
  await installDiscussionFixture(context);
  await context.route('https://**',route=>route.abort());
  await installOfflineStartupDiagnostics(context);
  await context.addInitScript(seed,{defaults:createDefaultProfileData()});
  const errors:string[]=[],csp:string[]=[];
  const observe=(page:Page)=>page.on('pageerror',error=>errors.push(error.message));
  observe(page);context.on('page',observe);
  await context.exposeBinding('deviceSetupCsp',(_,value:string)=>csp.push(value));
  await context.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>{
    void(window as unknown as{deviceSetupCsp(value:string):Promise<void>}).deviceSetupCsp(event.violatedDirective);
  }));
  const server=await startKitServer(process.env.GETBASED_KIT_ARTIFACT||path.resolve('.local-notes/sveltekit-build'));
  try {
    const loading=[{phase:'initial-online',readyMs:await ready(page,server.origin)}];
    await expect(page.locator('[data-light-device-setup]')).toHaveCount(0);
    const before=await profile(page);server.state.offline=true;
    await openLight(page);
    const preset=await openPresetDialog(page);
    const row=preset.locator('[data-preset-id="mitochondriak-pulse"]');
    await row.focus();await page.keyboard.press('Enter');
    await expect(row).toHaveAttribute('aria-pressed','true');
    await expect(preset.locator('.light-device-preset-row.active')).toHaveCount(1);
    await expect(preset.locator('#add-device-confirm')).toBeEnabled();
    await preset.locator('#add-device-confirm').click();
    await expect(preset).not.toBeVisible();
    await expect(page.locator('.light-device-card')).toHaveCount(1);
    const afterPreset=await profile(page);
    const presetRecord=afterPreset.lightDevices![0]!;
    const registry=JSON.parse(await fs.readFile('data/light-device-presets.json','utf8')) as {presets:LightDeviceRecord[]};
    const curated=registry.presets.find(record=>record.id==='mitochondriak-pulse')!;
    for(const key of ['brand','model','type','peakWavelengths','channels','channelGroups','modes','coupling','irradianceBasis'] as const) {
      expect(presetRecord[key]??null,key).toEqual(curated[key]??null);
    }
    expect(presetRecord.presetId).toBe(curated.id);
    expect({...afterPreset,lightDevices:before.lightDevices}).toEqual(before);
    const again=await openPresetDialog(page);
    await again.locator('#add-device-custom').focus();await page.keyboard.press('Enter');
    const custom=page.getByRole('dialog',{name:'Add custom light device',exact:true});
    await expect(custom).toBeVisible();
    await custom.locator('#custom-dev-save').click();
    await expect(custom).toBeVisible();
    expect(await profile(page)).toEqual(afterPreset);
    await expect(custom.locator('#custom-dev-url,#custom-dev-scan')).toHaveCount(0);
    await custom.locator('#custom-dev-brand').fill('Offline <Panel>');
    await custom.locator('#custom-dev-model').fill('& lab');
    await custom.locator('#custom-dev-type').selectOption('combined');
    await custom.locator('#custom-dev-peaks').fill('850, 660, 660, 50');
    await custom.locator('#custom-dev-irradiance').fill('20');
    const distance=custom.locator('#custom-dev-distance');
    await expect(distance).toHaveAttribute('data-unit','in');await distance.fill('10');
    await custom.getByRole('tab',{name:'cm',exact:true}).focus();await page.keyboard.press('Enter');
    await expect(distance).toHaveAttribute('data-unit','cm');await expect(distance).toHaveValue('25.4');
    await custom.getByRole('tab',{name:'in',exact:true}).focus();await page.keyboard.press('Space');
    await expect(distance).toHaveAttribute('data-unit','in');await expect(distance).toHaveValue('10');
    await custom.locator('#custom-dev-save').click();await expect(custom).not.toBeVisible();
    await expect(page.locator('.light-device-card')).toHaveCount(2);
    const after=await profile(page);const stored=after.lightDevices![1]!;
    expect(stored).toMatchObject({brand:'Offline <Panel>',model:'& lab',type:'combined',peakWavelengths:[660,850],mwPerCm2At15cm:20,recommendedDistanceCm:25.4,channels:['pbm_red','pbm_nir'],distanceModel:'reference-only',irradianceBasis:'user-entered',presetId:null});
    expect(after.lightDevices![0]).toEqual(presetRecord);
    expect({...after,lightDevices:before.lightDevices}).toEqual(before);
    await page.close();
    for(let launch=0;launch<2;launch++) {
      const cold=await context.newPage();loading.push({phase:`offline-cold-${launch+1}`,readyMs:await ready(cold,server.origin)});
      await inspectCold(cold,after);await cold.close();
    }
    expect(errors).toEqual([]);expect(csp).toEqual([]);
    await fs.writeFile(test.info().outputPath('device-setup-loading.json'),JSON.stringify(loading,null,2));
  } finally {await server.close();}
});
