import {expect,test} from './coverage-fixture.js';
import {installDiscussionFixture,installDiscussionProvider} from '../helpers/chat-discussion-fixture.js';
test('genuine empty Chat catalog preserves notes focus async status explanations and skip/reentry',async({page,context})=>{
 await installDiscussionFixture(context);await installDiscussionProvider(context);await page.goto('/app');
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.evaluate(async()=>{
  await(await import('/js/chat-loader.js')).openChatPanel();const[{state},profile,data]=await Promise.all([import('/js/state.js'),import('/js/profile.js'),import('/js/data.js')]);
  if(!state.profiles)throw new Error('Synthetic profile fixture unavailable');
  state.profiles=state.profiles.map(item=>item.id===state.currentProfile?{...item,name:'Synthetic Ada'}:item);state.profileSex='male';state.profileDob='1990-01-01';
  state.importedData=profile.createDefaultProfileData();state.importedData.diet={breakfast:'Reported eggs'};state.chatHistory=[];data.invalidateActiveDataCache();
  localStorage.setItem(`labcharts-onboard-extras-done-${state.currentProfile}`,'1');sessionStorage.setItem(`chat-onboard-force-step-${state.currentProfile}`,'cards');
  (await import('/js/chat-render.js')).renderChatMessages();
 });
 const root=page.locator('[data-chat-empty-view]'),catalog=root.locator('[data-context-cards-view]'),input=catalog.locator('.ctx-notes-textarea');
 await expect(catalog).toHaveCount(1);await expect(catalog.locator('article.context-card')).toHaveCount(9);
 const text='Genuine empty catalog <literal> & retained';await input.fill(text);await expect(catalog.locator('.ctx-notes-status')).toHaveText('Saved');
 await input.focus();await input.evaluate(node=>(node as HTMLTextAreaElement).setSelectionRange(2,7));const retained=await input.elementHandle();
 await page.evaluate(async()=>{
  const[notes,status,service]=await Promise.all([import('/js/context-notes-view.js'),import('/js/context-card-status-view.js'),import('/js/context-card-status.js')]);
  service.publishContextCardStatus('diet',{visible:true,label:'Genuine browser status',summary:'Native summary <literal>',tips:true});notes.ensureContextNotes();status.ensureContextCardStatus();notes.ensureContextNotes();status.ensureContextCardStatus();
 });
 expect(await retained!.evaluate(node=>({same:node===document.querySelector('[data-chat-empty-view] .ctx-notes-textarea'),start:(node as HTMLTextAreaElement).selectionStart,end:(node as HTMLTextAreaElement).selectionEnd}))).toEqual({same:true,start:2,end:7});
 await expect(input).toBeFocused();await expect(catalog.locator('[data-context-status-key="diet"] .ctx-tips-badge')).toHaveCount(1);
 await expect(catalog.locator('[data-context-status-slot="summary"][data-context-status-key="diet"]')).toHaveText('Native summary <literal>');
 const explanation=catalog.locator('[data-context-card-key="healthGoals"] .context-info-icon');await explanation.click();await expect(explanation).toHaveAttribute('aria-expanded','true');
 const id=await explanation.getAttribute('aria-controls');await expect(catalog.locator(`[id="${id}"]`)).toBeVisible();
 await root.getByRole('button',{name:'Skip context cards',exact:true}).click();await expect(root).toContainText('Context cards are skipped for now');
 expect(await retained!.evaluate(node=>node.isConnected)).toBe(false);
 await page.evaluate(async()=>{(await import('/js/context-card-status.js')).publishContextCardStatus('diet',{summary:'Late retired status'});});
 expect(await retained!.evaluate(node=>(node as HTMLTextAreaElement).value)).toBe(text);
 await root.getByRole('button',{name:'Add context cards',exact:true}).click();await expect(catalog).toHaveCount(1);await expect(input).toHaveValue(text);
 expect(await page.evaluate(async()=>(await import('/js/state.js')).state.importedData.contextNotes)).toBe(text);expect(errors).toEqual([]);
});
