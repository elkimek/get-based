import {readFileSync} from 'node:fs';
import {expect,test} from './coverage-fixture.js';

const appVersion=/self\.APP_VERSION\s*=\s*'([^']+)'/.exec(readFileSync('version.ts','utf8'))?.[1];
if(!appVersion)throw Error('Application version required');
const sheets=['app-shell','redesign-shell'] as const;
const original=Object.fromEntries(sheets.map(name=>[name,readFileSync(`tests/fixtures/shared-${name}-original.css`,'utf8')]));
const candidate=Object.fromEntries(sheets.map(name=>[name,readFileSync(`css/${name}.css`,'utf8')]));
const themes=['dark','light','cyberterm','glass','synth-sunrise','neuromancer'];
const widths=[320,393,768,799,800,1440];

for (const selectedTheme of themes) {
test(`shared Shell Tailwind preserves native header/footer geometry, colors, controls and focus across six widths: ${selectedTheme}`,async({page})=>{
 test.setTimeout(60_000);
 let native=true;
 for(const name of sheets)await page.route(`**/css/${name}.css`,route=>route.fulfill({contentType:'text/css',body:(native?original:candidate)[name]!}));
 await page.addInitScript(version=>{
  localStorage.setItem('labcharts-default-emptyTour','completed');
  localStorage.setItem('labcharts-default-tour','completed');
  localStorage.setItem('labcharts-default-ai-reminder-dismissed','1');
  localStorage.setItem('labcharts-analytics-consent-seen','1');
  localStorage.setItem('labcharts-changelog-seen',version);
 },appVersion);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 async function snapshots(){
  await page.goto('/app');await page.evaluate(()=>document.fonts.ready);
  const values=[];
  for(const theme of [selectedTheme]){
   const appliedTheme=await page.evaluate(async name=>{
    const themes=await import('/js/theme.js');const ready=await themes.setTheme(name);await document.fonts.ready;
    return{ready,selected:themes.getTheme(),stored:localStorage.getItem('labcharts-theme'),attribute:document.documentElement.getAttribute('data-theme')};
   },theme);
   expect(appliedTheme).toEqual({ready:true,selected:theme,stored:theme,attribute:theme==='dark'?null:theme});
   for(const width of widths){
    await page.setViewportSize({width,height:900});await page.mouse.move(0,899);
    await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});
    // The transition duration is part of the byte-exact CSS assertion. Wait
    // until actual visual properties settle before comparing both sources.
    await page.waitForTimeout(350);
    const normal=await page.evaluate(()=>{
     const properties=['display','position','box-sizing','width','height','min-width','max-width','padding','margin','border','border-radius','background','color','font-family','font-size','font-weight','line-height','gap','align-items','justify-content','overflow','visibility','opacity','transform','outline','box-shadow','z-index'];
     return [...document.querySelectorAll<HTMLElement>('.header,.header *,.app-footer,.app-footer *')].map(node=>{
      const rect=node.getBoundingClientRect(),style=getComputedStyle(node);
      return {tag:node.tagName,attributes:[...node.attributes].map(a=>[a.name,a.value]),text:node.childElementCount?null:node.textContent,rect:[rect.x,rect.y,rect.width,rect.height],style:properties.map(property=>[property,style.getPropertyValue(property)])};
     });
    });
    await page.locator('.settings-btn').focus();await page.waitForTimeout(350);
    const focus=await page.locator('.settings-btn').evaluate(node=>{const style=getComputedStyle(node);return{focused:document.activeElement===node,outline:style.outline,shadow:style.boxShadow,color:style.color,background:style.background};});
    expect(focus.focused).toBe(true);expect(normal.length).toBeGreaterThan(20);
    values.push({theme,width,normal,focus});
   }
  }
  return values;
 }
 const before=await snapshots();native=false;const after=await snapshots();
 expect(before).toHaveLength(6);expect(after).toEqual(before);expect(errors).toEqual([]);
});
}
