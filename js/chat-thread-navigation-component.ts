import ChatThreadNavigation, { mount, unmount, flushSync } from './components/ChatThreadNavigation.svelte.native.js';
import type { ChatThreadNavigationState, ChatThreadNavigationActions, ChatThreadNavigationComponentView, ChatThreadNavigationView } from './chat-thread-navigation-contract.js';
let active: { host: HTMLElement; owner: ChatThreadNavigationComponentView; view: ChatThreadNavigationView } | null = null;
export function getChatThreadNavigationView(): ChatThreadNavigationView | null { return active?.view.isCurrent() ? active.view : null; }
export function disposeChatThreadNavigation(): void {
  const previous = active; active = null;
  if (previous) { flushSync(() => previous.owner.clear()); void unmount(previous.owner); flushSync(); }
}
export function mountChatThreadNavigation(host: HTMLElement, initial: ChatThreadNavigationState, actions: ChatThreadNavigationActions, contextCurrent: () => boolean): ChatThreadNavigationView {
  if (active?.host === host && active.view.isCurrent()) { active.view.setState(initial); return active.view; }
  disposeChatThreadNavigation(); host.replaceChildren();
  let view: ChatThreadNavigationView | null = null;
  const wrapped: ChatThreadNavigationActions = {
    switch: id => view?.isCurrent() ? actions.switch(id) : undefined,
    pin: id => view?.isCurrent() ? actions.pin(id) : undefined,
    rename: id => view?.isCurrent() ? actions.rename(id) : undefined,
    delete: id => view?.isCurrent() ? actions.delete(id) : undefined,
    move: (id, project) => view?.isCurrent() ? actions.move(id, project) : undefined,
    renameProject: project => view?.isCurrent() ? actions.renameProject(project) : undefined,
    deleteProject: project => view?.isCurrent() ? actions.deleteProject(project) : undefined,
    jump: result => view?.isCurrent() ? actions.jump(result) : undefined,
  };
  const owner = mount(ChatThreadNavigation, { target: host, props: { initial, actions: wrapped } }); flushSync();
  const root = host.querySelector('[data-chat-thread-navigation-view]');
  const isCurrent = () => active?.owner === owner && host.isConnected && !!root && host.contains(root) && contextCurrent();
  view = { isCurrent, setState: next => { if (isCurrent()) flushSync(() => owner.setState(next)); }, setSearch: next => { if (isCurrent()) flushSync(() => owner.setSearch(next)); }, clear: () => { if (isCurrent()) flushSync(() => owner.clear()); } };
  active = { host, owner, view }; return view;
}
