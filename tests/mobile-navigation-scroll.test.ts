// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {mobileDashboardSetTab,syncMobileBottomNav} from '../js/mobile-dashboard.js';

afterEach(()=>{document.body.replaceChildren();document.body.className='';vi.restoreAllMocks();vi.unstubAllGlobals();});
it('centers an offscreen selected lens without scrolling the page',()=>{
 document.body.innerHTML='<nav class="m-tabbar"><button class="m-tab" data-tab="nutrition"></button></nav>';
 const navigation=document.querySelector<HTMLElement>('.m-tabbar')!,button=navigation.querySelector<HTMLElement>('button')!;
 Object.defineProperty(navigation,'clientWidth',{value:360});
 vi.spyOn(navigation,'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({x:10,y:700,width:360,height:70}));
 vi.spyOn(button,'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({x:430,y:700,width:80,height:52}));
 const scroll=vi.spyOn(window,'scrollTo');
 mobileDashboardSetTab('nutrition');
 expect(navigation.scrollLeft).toBe(280);expect(button.getAttribute('aria-current')).toBe('page');
 expect(scroll).not.toHaveBeenCalled();
});
it('preserves a swiped rail position when rebuilding navigation for another lens',()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){}}));
 document.body.innerHTML='<nav id="mobile-bottom-tabs" class="m-tabbar"></nav>';
 document.getElementById('mobile-bottom-tabs')!.scrollLeft=150;
 syncMobileBottomNav('supplements');
 const navigation=document.getElementById('mobile-bottom-tabs')!;
 expect(navigation.scrollLeft).toBe(150);
 expect(navigation.querySelector('[aria-current="page"]')?.getAttribute('data-tab')).toBe('supplements');
 expect(navigation.querySelectorAll('button')).toHaveLength(7);
});
