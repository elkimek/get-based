import {expect,test} from './coverage-fixture.js';
import type {Page} from '@playwright/test';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {seedNutritionMealDetail} from '../helpers/nutrition-meal-detail-fixture.js';
async function open(page:Page){
 expect(await page.evaluate(async()=>{await import('/js/nutrition.js');return (await import('/js/nutrition-entry-forms.js')).openMealDetail('detail-owned',{returnTo:'history'});})).toBe(true);
 await expect(page.locator('[data-nutrition-meal-detail-view]')).toBeVisible();
}
test.beforeEach(async({page,context})=>{await installDiscussionFixture(context);await context.addInitScript(seedNutritionMealDetail);await page.goto('/app');await expect(page.locator('html[data-app-ready]')).toBeAttached();});
test('authored meal detail preserves provenance, unknown nutrients, navigation and keyboard check-in saves',async({page})=>{
 await open(page);const modal=page.locator('#detail-modal');await expect(modal).toContainText('Fixture vision label scan via ollama');await expect(modal).toContainText('150 tokens (100 in · 50 out)');
 await expect(modal).toContainText('Keep this meal note');await expect(modal.locator('.nutrition-detail-photo')).toHaveCount(2);await expect(modal.locator('.nutrition-detail-nutrients')).toContainText('Protein0 g');
 await modal.locator('[data-nutrition-action="save-response"]').click();await expect(modal.getByRole('status')).toContainText('Choose hunger, energy, or both');
 await modal.getByLabel('Still satisfied',{exact:true}).check();await modal.getByLabel('Steady',{exact:true}).check();
 await modal.locator('[data-nutrition-action="save-response"]').focus();await modal.locator('[data-nutrition-action="save-response"]').press('Enter');await expect(modal.locator('.nutrition-response-card')).toContainText('Checked in');
 await page.reload();await open(page);await expect(modal.getByLabel('Still satisfied',{exact:true})).toBeChecked();await expect(modal.getByLabel('Steady',{exact:true})).toBeChecked();
 expect(await page.evaluate(async()=>{const {state}=await import('/js/state.js');const meal=await(await import('/js/nutrition-store.js')).getActiveProfileMeal('detail-owned');return{response:meal?.responseCheckIn,synced:state.importedData.nutritionMeals?.find(value=>value.id==='detail-owned')?.responseCheckIn,notes:state.importedData.contextNotes,context:state.nutritionSummary?.contextByDays?.d30||''};})).toMatchObject({response:{satiety2h:3,energy2h:2},synced:{satiety2h:3,energy2h:2},notes:'Keep detail notes',context:expect.not.stringContaining('satiety')});
 await modal.locator('[data-nutrition-action="clear-response"]').click();await expect(modal.locator('.nutrition-response-card')).toContainText('Optional');await expect(modal.locator('input:checked')).toHaveCount(0);
 await modal.locator('[data-nutrition-action="edit"]').click();await expect(page.locator('#nutrition-meal-name')).toHaveValue('Reviewed detail lunch');
 await page.locator('[data-nutrition-action="return-detail"]').click();await page.getByRole('alertdialog',{name:'Discard meal changes and return to details'}).getByRole('button',{name:'Return to details',exact:true}).click();await expect(page.locator('[data-nutrition-meal-detail-view]')).toBeVisible();
 await modal.locator('[data-nutrition-action="back"]').click();await expect(page.locator('[data-nutrition-history-view]')).toBeVisible();
});
// Dense fine-pointer controls retain their native sizing; touch targets use the coarse-pointer styles.
test.describe('coarse-pointer touch targets', () => {
  test.use({ hasTouch: true });
  test.beforeEach(async ({ page }) => {
    expect(await page.evaluate(() => ({
      coarse: matchMedia('(pointer: coarse)').matches,
      fine: matchMedia('(pointer: fine)').matches,
      touch: navigator.maxTouchPoints > 0,
    }))).toEqual({ coarse: true, fine: false, touch: true });
  });

  test('authored meal detail remains accessible and contained across six themes and narrow layouts',async({page})=>{
   test.setTimeout(120000);await open(page);await page.evaluate(async()=>{const link=document.createElement('link');link.rel='stylesheet';link.href='/themes-extra.css';const ready=new Promise<void>((resolve,reject)=>{link.onload=()=>resolve();link.onerror=()=>reject(new Error('Themes unavailable'));});document.head.append(link);await ready;});
   const modal=page.locator('#detail-modal');
   for(const width of [320,1100])for(const theme of ['dark','light','cyberterm','glass','neuromancer','synth-sunrise']){
    await page.setViewportSize({width,height:900});await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
    await modal.evaluate(async root=>{const animations=[...root.getAnimations({subtree:true})];for(let element:Element|null=root;element;element=element.parentElement){getComputedStyle(element).backgroundColor;animations.push(...element.getAnimations());}await Promise.all(animations.filter(animation=>animation.effect?.getComputedTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>undefined)));});
    const size=await modal.evaluate(root=>({scroll:root.scrollWidth,client:root.clientWidth}));expect(size.scroll<=size.client+1,`${theme}/${width} overflow`).toBe(true);
    for(const action of await modal.locator('button,.nutrition-response-choice').all()){const box=await action.boundingBox();if(box){expect(box.height,`${theme}/${width} target height`).toBeGreaterThanOrEqual(44);expect(box.width,`${theme}/${width} target width`).toBeGreaterThanOrEqual(44);}}
    expect(await modal.evaluate(async root=>(await(window as unknown as{axe:typeof import('axe-core')}).axe.run(root,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(value=>({id:value.id,nodes:value.nodes.map(node=>({target:node.target,summary:node.failureSummary}))}))),`${theme}/${width} accessibility`).toEqual([]);
   }
  });
});
test('a delayed detail stylesheet cannot replace a newer surface',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});await page.route('**/css/nutrition.css',async route=>{await gate;await route.continue();});
 await page.evaluate(()=>{void import('/js/nutrition.js').then(async()=>{await(await import('/js/nutrition-entry-forms.js')).openMealDetail('detail-owned');});});
 await expect(page.locator('link[data-nutrition-stylesheet]')).toBeAttached();await page.evaluate(()=>document.getElementById('detail-modal')!.replaceChildren(Object.assign(document.createElement('p'),{textContent:'Replacement surface'})));
 release();await expect.poll(()=>page.locator('link[data-nutrition-stylesheet]').evaluate((link:HTMLLinkElement)=>!!link.sheet)).toBe(true);await expect(page.locator('#detail-modal')).toHaveText('Replacement surface');
});
test('a delayed meal read cannot replace another modal',async({page})=>{
 await page.evaluate(async()=>{await import('/js/nutrition.js');await(await import('/js/nutrition-render.js')).ensureNutritionStylesheet();await(await import('/js/nutrition-store.js')).listActiveProfileMeals();
  const original=crypto.subtle.decrypt.bind(crypto.subtle);let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  Object.assign(window,{releaseDetailRead:release,detailReadStarted:false});crypto.subtle.decrypt=async(...args:Parameters<SubtleCrypto['decrypt']>)=>{crypto.subtle.decrypt=original;Object.assign(window,{detailReadStarted:true});await gate;return original(...args);};
  Object.assign(window,{pendingDetailOpen:import('/js/nutrition-entry-forms.js').then(module=>module.openMealDetail('detail-owned'))});
 });
 await expect.poll(()=>page.evaluate(()=>(window as unknown as{detailReadStarted:boolean}).detailReadStarted)).toBe(true);
 await page.evaluate(()=>{document.getElementById('detail-modal')!.replaceChildren(Object.assign(document.createElement('p'),{textContent:'Newer modal'}));(window as unknown as{releaseDetailRead():void}).releaseDetailRead();});
 expect(await page.evaluate(()=>(window as unknown as{pendingDetailOpen:Promise<boolean>}).pendingDetailOpen)).toBe(false);await expect(page.locator('#detail-modal')).toHaveText('Newer modal');
});
test('retired meal controls cannot write to another profile or reopen its modal',async({page})=>{
 await open(page);await page.getByLabel('Still satisfied',{exact:true}).check();
 await page.evaluate(async()=>{const {state}=await import('/js/state.js');const {createDefaultProfileData}=await import('/js/profile.js');const button=document.querySelector<HTMLButtonElement>('[data-nutrition-action="save-response"]')!;
  state.currentProfile='detail-retired-profile';state.importedData=createDefaultProfileData();state.importedData.contextNotes='Other profile';button.click();window.dispatchEvent(new CustomEvent('labcharts-profile-switched'));
  await(await import('/js/nutrition-entry-forms.js')).saveMealResponse('detail-owned');
 });
 await expect(page.locator('[data-nutrition-meal-detail-view]')).toHaveCount(0);await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
 expect(await page.evaluate(async()=>{const {state}=await import('/js/state.js');return{notes:state.importedData.contextNotes,meals:state.importedData.nutritionMeals||[],original:(await(await import('/js/nutrition-store.js')).getNutritionMeal('default','detail-owned'))?.responseCheckIn};})).toEqual({notes:'Other profile',meals:[],original:undefined});
});
