import {expect,test} from '@playwright/test';
import {createDefaultProfileData,migrateProfileData} from '../../js/profile.js';
import {categorySeedFields,categoryRegistry,categoryRoutes} from '../helpers/category-pwa-receipt.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
test('genuine Category page retains real routes chart paint table manual entry keyboard gaps and range actions',async({page,context})=>{
 const seed=migrateProfileData({...createDefaultProfileData(),...structuredClone(categorySeedFields)});
 await installDiscussionFixture(context,{paused:true});
 await page.clock.setFixedTime(new Date('2024-05-15T12:00:00Z'));
 await context.addInitScript(({seed,registry})=>{
  localStorage.setItem('labcharts-profiles',JSON.stringify(registry));localStorage.setItem('labcharts-active-profile','default');localStorage.setItem('labcharts-default-imported',JSON.stringify(seed));
  localStorage.setItem('labcharts-theme','dark');localStorage.setItem('labcharts-default-rangeMode','reference');localStorage.setItem('labcharts-default-lastViewV1','dashboard');localStorage.setItem('labcharts-analytics-disabled','true');localStorage.setItem('labcharts-show-product-recs','false');
 },{seed,registry:categoryRegistry});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/app');await expect(page.locator('html[data-app-ready]')).toBeAttached();
 const notice=page.getByRole('dialog',{name:'Review self-hosted app notice'});if(await notice.isVisible()){await notice.getByRole('checkbox').check();await notice.getByRole('button',{name:'Acknowledge & continue',exact:true}).click();}
 const baseline=await page.evaluate(async()=>({data:JSON.stringify((await import('/js/state.js')).state.importedData),profiles:localStorage.getItem('labcharts-profiles')}));
 await page.locator('#sidebar-nav [data-nav-route="'+categoryRoutes.series+'"]').click();
 const main=page.locator('#main-content');await expect(main.locator('.category-title-text')).toHaveText('Synthetic Category');await expect(main.locator('.chart-card:not(.chart-card-add)')).toHaveCount(3);
 await expect.poll(()=>page.evaluate(async()=>{const {state}=await import('/js/state.js');return Object.entries(state.chartInstances).filter(([id])=>id.startsWith('categoryPilot_')).map(([,value])=>{const chart=value as {canvas?:HTMLCanvasElement};const canvas=chart.canvas;if(!canvas||!canvas.isConnected)return false;const pixels=canvas.getContext('2d')?.getImageData(0,0,canvas.width,canvas.height).data;return !!pixels?.some((value,index)=>index%4===3&&value>0);});})).toEqual([true,true,true]);
 const rename=main.getByRole('button',{name:'Rename category',exact:true});await rename.focus();await page.keyboard.press('Enter');await expect(page.locator('#prompt-dialog-input')).toHaveValue('Synthetic Category');await page.keyboard.press('Escape');await expect(rename).toBeFocused();
 const tab=(name:string)=>main.getByRole('tab',{name,exact:true});await tab('Table').focus();await page.keyboard.press('Enter');await expect(tab('Table')).toHaveAttribute('aria-selected','true');await expect(main.locator('.data-table-wrapper tbody tr')).toHaveCount(3);
 const missing=main.locator('.data-table-wrapper [data-marker-detail-action="open-manual-entry"][data-marker-detail-id="categoryPilot_ranged"][data-marker-detail-date="2024-02-10"]');await missing.click();await expect(page.locator('#me-date')).toHaveValue('2024-02-10');await expect(page.locator('#me-value')).toBeFocused();await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 await tab('Heatmap').focus();await page.keyboard.press('Space');await expect(tab('Heatmap')).toHaveAttribute('aria-selected','true');const heat=main.locator('.heatmap-wrapper td[data-marker-detail-id="categoryPilot_ranged"]').first();await heat.focus();await page.keyboard.press('Enter');await expect(page.locator('#detail-modal h3')).toContainText('Synthetic ApoB <&>');await page.keyboard.press('Escape');await expect(heat).toBeFocused();
 await tab('Charts').click();await main.locator('.date-range-filter [data-lab-data-range="3m"]').click();await expect(main.locator('.chart-card-gap-section > p')).toHaveText(['Results outside the last 3 months','No data yet']);
 const gap=main.locator('.chart-card-add[data-marker-detail-id="categoryPilot_empty"]');await gap.focus();await page.keyboard.press('Enter');await expect(page.locator('#detail-modal h3')).toContainText('Synthetic Empty');await page.keyboard.press('Escape');await expect(gap).toBeFocused();
 await page.clock.setFixedTime(new Date('2026-10-15T12:00:00Z'));await main.locator('.date-range-filter [data-lab-data-range="all"]').click();await main.locator('.date-range-filter [data-lab-data-range="3m"]').click();await expect(main.locator('#view-content h3')).toHaveText('No results in the last 3 months');await main.getByRole('button',{name:'Show all results',exact:true}).click();await expect(main.locator('.chart-card:not(.chart-card-add)')).toHaveCount(3);
 for(const width of [390,799,1100]){await page.setViewportSize({width,height:900});for(const theme of ['dark','light','glass']){await page.evaluate(async theme=>(await import('/js/theme.js')).setTheme(theme),theme);expect(await main.evaluate(element=>element.scrollWidth<=element.clientWidth+1),`${width}/${theme}`).toBe(true);}}
 expect(await page.evaluate(async()=>({data:JSON.stringify((await import('/js/state.js')).state.importedData),profiles:localStorage.getItem('labcharts-profiles')}))).toEqual(baseline);expect(errors).toEqual([]);
});
