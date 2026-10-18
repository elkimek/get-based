// @vitest-environment jsdom
import{afterEach,expect,it,vi}from'vitest';
import FocusBody,{mount,unmount,flushSync}from'../js/components/FocusCardBody.svelte.native.js';
import ExtensionSlot,{mount as mountExtension,unmount as unmountExtension,flushSync as flushExtension}from'../js/components/AppExtensionSlot.svelte.native.js';
import{projectFocusCardMarkdown,renderFocusCardView}from'../js/focus-card-presentation.js';
import{configureAppExtension,renderAppExtensionSettingsSlot,renderAppExtensionOnboardingSlot}from'../js/app-extension-runtime.js';
afterEach(()=>{configureAppExtension(null);document.body.replaceChildren();vi.restoreAllMocks();});
function host(){const root=document.createElement('div');document.body.append(root);return root;}
function secureFocus(root:HTMLElement){
 expect(root.querySelectorAll('script,img,svg,iframe,object,[onerror],[onload],[onclick]')).toHaveLength(0);
 for(const element of root.querySelectorAll('*'))for(const attribute of element.attributes)expect(attribute.name.startsWith('on')).toBe(false);
 for(const anchor of root.querySelectorAll('a')){expect(anchor.getAttribute('href')).toMatch(/^(https?:\/\/|mailto:|#)/);expect(anchor.rel.split(/\s+/)).toEqual(expect.arrayContaining(['noopener','noreferrer']));}
}
it.each(['<img src=x onerror="alert(1)"> **safe bold** [bad](javascript:alert(1))', '&lt;svg onload=alert(1)&gt; [valid](https://example.com/a?x=1&y=2)', '`<script>alert(1)</script>` <iframe srcdoc="bad">'])('qualifies actual Focus SSR and client markdown nodes for hostile input %s',async text=>{
 const view=projectFocusCardMarkdown(text),ssr=host();ssr.innerHTML=renderFocusCardView({body:view});secureFocus(ssr);
 const target=host(),instance=mount(FocusBody,{target,props:{view}});flushSync();
 try{secureFocus(target);expect(target.textContent).toBe(ssr.querySelector('.focus-card-body')?.textContent);expect(target.textContent).not.toBe('');
  if(text.includes('safe bold')){expect(target.querySelector('strong')?.textContent).toBe('safe bold');expect(target.querySelector('a')?.getAttribute('href')).toBe('#');}
 }finally{await unmount(instance);expect(target.children).toHaveLength(0);}
});
it('keeps Focus stream/message text escaped through live mode changes and releases its live element',async()=>{
 const outside=document.createElement('input');document.body.append(outside);outside.focus();const target=host();
 const instance=mount(FocusBody,{target,props:{view:{kind:'shimmer'}}});flushSync();
 instance.setView({kind:'stream',text:'<img src=x onerror=alert(1)> **stream**'});flushSync();
 const stream=instance.getStreamElement();expect(stream).toBe(target.querySelector('.focus-card-text'));expect(stream?.textContent).toBe('<img src=x onerror=alert(1)> **stream**');secureFocus(target);
 instance.setView({kind:'stream',text:'next <svg onload=alert(1)>'});flushSync();expect(instance.getStreamElement()).toBe(stream);expect(stream?.textContent).toBe('next <svg onload=alert(1)>');
 instance.setView(projectFocusCardMarkdown('**complete** [source](https://example.com)'));flushSync();expect(target.querySelector('strong')?.textContent).toBe('complete');secureFocus(target);
 instance.setView({kind:'message',text:'<script>literal error</script>'});flushSync();expect(target.textContent).toBe('<script>literal error</script>');secureFocus(target);expect(document.activeElement).toBe(outside);
 await unmount(instance);expect(target.children).toHaveLength(0);expect(instance.getStreamElement()).toBeNull();expect(outside.isConnected).toBe(true);
});
it('does not swallow a failed Focus markdown conversion',()=>{const error=new Error('text getter failed');expect(()=>projectFocusCardMarkdown({toString(){throw error;}})).toThrow(error);});
it('keeps core and unavailable edition slots empty before actual component mounting',async()=>{
 for(const unavailable of [false,true]){
  const callback=vi.fn(()=>'<button>should not render</button>');if(unavailable)configureAppExtension({id:'unavailable-test',isAvailable:()=>false,settings:{renderSlot:callback}});
  const html=renderAppExtensionSettingsSlot('tabs');expect(html).toBe('');const target=host();const instance=mountExtension(ExtensionSlot,{target,props:{html}});flushExtension();expect(target.children).toHaveLength(0);expect(callback).not.toHaveBeenCalled();await unmountExtension(instance);
 }
});
it('preserves configured trusted edition HTML and its native listener only for its mounted lifetime',async()=>{
 const hook=vi.fn((slot:string,context:Record<string,unknown>)=>'<button data-edition="trusted">'+slot+':'+String(context.label)+'</button>');
 configureAppExtension({id:'trusted-test',settings:{renderSlot:hook},onboarding:{renderSlot:()=>'<strong>onboarding</strong>'}});
 const html=renderAppExtensionSettingsSlot('tabs',{label:'edition'}),target=host(),outside=host();outside.textContent='outside';
 const instance=mountExtension(ExtensionSlot,{target,props:{html}});flushExtension();const button=target.querySelector<HTMLButtonElement>('[data-edition="trusted"]')!;expect(button.textContent).toBe('tabs:edition');expect(hook).toHaveBeenCalledExactlyOnceWith('tabs',{label:'edition'});
 const click=vi.fn();button.addEventListener('click',click);button.click();expect(click).toHaveBeenCalledOnce();expect(target.querySelector('button')).toBe(button);
 expect(renderAppExtensionOnboardingSlot('provider-quiz')).toBe('<strong>onboarding</strong>');
 await unmountExtension(instance);expect(button.isConnected).toBe(false);expect(target.children).toHaveLength(0);expect(outside.textContent).toBe('outside');
 configureAppExtension(null);expect(renderAppExtensionSettingsSlot('tabs')).toBe('');
});
it('renders no extension nodes when the configured trusted hook throws',async()=>{
 vi.spyOn(console,'warn').mockImplementation(()=>{});configureAppExtension({id:'failed-test',settings:{renderSlot(){throw new Error('adapter failed');}}});
 const target=host(),html=renderAppExtensionSettingsSlot('tabs');expect(html).toBe('');const instance=mountExtension(ExtensionSlot,{target,props:{html}});flushExtension();expect(target.children).toHaveLength(0);expect(console.warn).toHaveBeenCalledWith('[extension] settings slot tabs failed',expect.any(Error));await unmountExtension(instance);
});
