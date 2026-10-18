import {expect,test} from './coverage-fixture.js';
import {routeHtml} from '../helpers/browser-static-routes.js';
test('coherence disclosure padding stays scoped to its own summary and preserves nested native reading spacing',async({page})=>{
 await routeHtml(page,'**/biology-nested-density-test','<!doctype html><html lang="en"><head><title>Biology disclosure spacing</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/dashboard-widgets.css"></head><body><main id="fixture" data-biology-overview-view></main></body></html>');await page.goto('/biology-nested-density-test');
 await page.evaluate(async()=>{
  const {biologyOverviewClasses:c}=await import('/js/biology-overview-classes.js');const {renderHTML}=await import('/js/components/BiologyReadingPresentation.svelte.html.js');
  const host=document.getElementById('fixture')!;
  for(const role of ['biology-coherence-interpretation','biology-coherence-breakdown']){
   const details=document.createElement('details');details.className=c(role);details.open=true;
   const summary=document.createElement('summary');summary.className=c('biology-overview-disclosure');summary.textContent=role;details.append(summary);
   const notes=document.createElement('div');notes.innerHTML=renderHTML({kind:'notes',flags:['A synthetic nested interpretation note.']});details.append(notes);host.append(details);
  }
 });
 for(const theme of ['dark','light','cyberterm','glass','synth-sunrise','neuromancer']){
  await page.evaluate(async theme=>{const m=await import('/js/theme.js');await m.loadExtraThemesStylesheet();m.setTheme(theme);},theme);
  for(const summary of await page.locator('#fixture > details > summary').all())await expect(summary).toHaveCSS('padding','8px 0px');
  for(const summary of await page.locator('.biology-reading-notes > summary').all())await expect(summary).toHaveCSS('padding','10px 0px');
 }
 const summary=page.locator('.biology-reading-notes > summary').first();await summary.focus();await page.keyboard.press('Enter');await expect(summary.locator('..')).toHaveAttribute('open','');await expect(summary.locator('..').locator('li')).toBeVisible();await page.keyboard.press('Space');await expect(summary.locator('..')).not.toHaveAttribute('open');
});
