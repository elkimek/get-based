import EmptyState, {hydrate,unmount,flushSync} from './components/ChatEmptyState.svelte.native.js';
import {state} from './state.js';
import type {ChatEmptyView} from './chat-empty-presentation.js';
import type {ContextCatalogView} from './context-card-catalog-presentation.js';
interface CatalogOwner {
  container:HTMLElement;root:HTMLElement;component:ReturnType<typeof hydrate>;
  profile:typeof state.currentProfile;thread:typeof state.currentThreadId;
  history:typeof state.chatHistory;data:typeof state.importedData;connected:boolean;
}
const owners=new Map<HTMLElement,CatalogOwner>();
let observer:MutationObserver|null=null;
function release(owner:CatalogOwner):void {
  if(owners.get(owner.container)!==owner)return;
  owners.delete(owner.container);void unmount(owner.component);flushSync();
  if(!owners.size){observer?.disconnect();observer=null;}
}
function sweep(records:MutationRecord[]=[]):void {
  for(const owner of owners.values()){
    const removed=owner.connected&&records.some(record=>[...record.removedNodes].some(node=>node===owner.root||node.contains(owner.root)));
    owner.connected||=owner.root.isConnected;
    if(removed||(owner.connected&&(!owner.root.isConnected||!owner.container.contains(owner.root)))
      ||owner.profile!==state.currentProfile||owner.thread!==state.currentThreadId
      ||owner.history!==state.chatHistory||owner.data!==state.importedData)release(owner);
  }
}
export function disposeChatEmptyCatalog(container?:HTMLElement):void {
  for(const owner of [...owners.values()])if(!container||owner.container===container)release(owner);
}
/** Hydrate the committed empty parent, then compose the projected catalog as its genuine child. */
export function hydrateChatEmptyCatalog(container:HTMLElement,view:ChatEmptyView,catalog:ContextCatalogView):void {
  disposeChatEmptyCatalog(container);
  const root=container.querySelector<HTMLElement>('[data-chat-empty-view]');
  if(!root)throw new Error('Chat empty parent is missing');
  const component=hydrate(EmptyState,{target:container,props:{view},recover:false});flushSync();
  const owner:CatalogOwner={container,root,component,profile:state.currentProfile,thread:state.currentThreadId,
    history:state.chatHistory,data:state.importedData,connected:root.isConnected};
  owners.set(container,owner);
  flushSync(()=>component.setCatalog(catalog));
  if(!observer){observer=new MutationObserver(sweep);observer.observe(container.ownerDocument.documentElement,{childList:true,subtree:true});}
}
if(typeof globalThis.addEventListener==='function')globalThis.addEventListener('labcharts-profile-switched',()=>sweep());
