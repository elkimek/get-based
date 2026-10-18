import {expect,test} from './coverage-fixture.js';

test('genuine Emoji controller retains focus caret classes Unicode and callback chronology',async({page})=>{
  await page.goto('/app',{waitUntil:'load'});
  const result=await page.evaluate(async()=>{
    const {showEmojiPicker}=await import('/js/category-customization.js');
    const anchor=document.createElement('button');anchor.textContent='Synthetic emoji anchor';document.body.append(anchor);
    const calls:Array<{emoji:string|null|undefined;present:boolean}>=[];
    const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
    try{
      showEmojiPicker(anchor,emoji=>calls.push({emoji,present:!!document.querySelector('.emoji-picker')}),{showReset:true});
      await wait(80);
      const picker=document.querySelector<HTMLElement>('.emoji-picker')!,first=picker.querySelector<HTMLInputElement>('input')!;
      const focused=first===document.activeElement;
      const inactive=[...picker.querySelectorAll('button:not([data-cat="__reset"])')].every(button=>button.hasAttribute('class')&&button.getAttribute('class')==='');
      const defaults=[...picker.querySelectorAll('button')].every(button=>(button as HTMLButtonElement).type==='submit'&&!(button as HTMLButtonElement).disabled);
      picker.querySelector<HTMLElement>('[data-cat="body"]')!.click();
      const active=document.querySelector('.emoji-picker [data-cat="body"]')!.getAttribute('class');
      const input=document.querySelector<HTMLInputElement>('.emoji-picker input')!;input.value='SCIENCE';input.dispatchEvent(new Event('input',{bubbles:true}));
      const next=document.querySelector<HTMLInputElement>('.emoji-picker input')!;
      const search={replaced:input!==next,value:next.value,focused:document.activeElement===next,start:next.selectionStart,end:next.selectionEnd,
        categories:[...document.querySelectorAll('.emoji-picker-label')].map(node=>node.textContent)};
      const chosen=document.querySelector<HTMLElement>('.emoji-picker [data-emoji="🧬"]')!;chosen.click();
      const removed=!document.querySelector('.emoji-picker');
      showEmojiPicker(anchor,emoji=>calls.push({emoji,present:!!document.querySelector('.emoji-picker')}),{showReset:true});
      document.querySelector<HTMLElement>('.emoji-picker [data-cat="__reset"]')!.click();
      showEmojiPicker(anchor,()=>{throw new Error('Dismissal must not select');});await wait(20);
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));const escaped=!document.querySelector('.emoji-picker');
      showEmojiPicker(anchor,()=>{throw new Error('Outside dismissal must not select');});await wait(20);
      document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
      return {focused,inactive,defaults,active,search,calls,removed,escaped,outside:!document.querySelector('.emoji-picker')};
    }finally{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));anchor.remove();}
  });
  expect(result).toEqual({focused:true,inactive:true,defaults:true,active:'active',search:{replaced:true,value:'SCIENCE',focused:true,start:7,end:7,categories:['Science & Medical']},
    calls:[{emoji:'🧬',present:true},{emoji:null,present:true}],removed:true,escaped:true,outside:true});
});

test('genuine Emoji serializer preserves literal hostile search and catalog data in the browser',async({page})=>{
  await page.goto('/app',{waitUntil:'load'});
  const result=await page.evaluate(async()=>{
    const {renderEmojiPicker}=await import('/js/emoji-picker-presentation.js');
    const literal='<b data-probe>literal & "quoted"</b><!--[0-->getbased-emoji-search-private-slot';
    const catalog=[{id:literal,label:literal,icon:literal,emojis:[literal,'👩🏽‍🔬','⚕️']}];
    const host=document.createElement('div');host.innerHTML=renderEmojiPicker('',null,catalog,()=>true);
    const button=host.querySelector('button:not([data-cat="__reset"])')!;
    const fields={id:button.getAttribute('data-cat'),title:button.getAttribute('title'),className:button.getAttribute('class'),icon:button.textContent,
      label:host.querySelector('.emoji-picker-label')!.textContent,emojis:[...host.querySelectorAll('[data-emoji]')].map(node=>[node.getAttribute('data-emoji'),node.textContent]),
      injection:!!host.querySelector('b,script,textarea,style,[data-probe],[onclick]')};
    host.innerHTML=renderEmojiPicker(literal,null,[],()=>false);
    const input=host.querySelector<HTMLInputElement>('input')!;
    return {literal,fields,input:{value:input.value,defaultValue:input.defaultValue,disabled:input.disabled,type:input.type},empty:host.querySelector('.emoji-picker-label')!.textContent};
  });
  const text=result.literal;
  expect(result.fields).toEqual({id:text,title:text,className:'',icon:text,label:text,emojis:[[text,text],['👩🏽‍🔬','👩🏽‍🔬'],['⚕️','⚕️']],injection:false});
  expect(result.input).toEqual({value:text,defaultValue:text,disabled:false,type:'text'});expect(result.empty).toBe('No results');
});
