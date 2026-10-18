import Recommendations,{mount,unmount,flushSync} from './components/EMFMeterRecommendations.svelte.native.js';
import type {TipsSectionView} from './tips-presentation.js';
const owners=new Map<HTMLElement,ReturnType<typeof mount>>();
let observer:MutationObserver|null=null;
function release(slot:HTMLElement):void {
 const component=owners.get(slot);if(!component)return;
 owners.delete(slot);void unmount(component);flushSync();
 if(!owners.size){observer?.disconnect();observer=null;}
}
export function disposeEMFMeterRecommendations(container:HTMLElement):void {
 for(const slot of owners.keys())if(container.contains(slot)||!slot.isConnected)release(slot);
}
/** The async catalog supplies genuine child data; its public serializer stays independent. */
export function mountEMFMeterRecommendations(slot:HTMLElement,view:TipsSectionView|null):void {
 release(slot);slot.replaceChildren();if(!view)return;
 const component=mount(Recommendations,{target:slot,props:{view}});flushSync();owners.set(slot,component);
 if(!observer){observer=new MutationObserver(()=>{for(const target of owners.keys())if(!target.isConnected)release(target);});observer.observe(slot.ownerDocument.documentElement,{childList:true,subtree:true});}
}
