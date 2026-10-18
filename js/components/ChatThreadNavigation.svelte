<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { ChatThreadNavigationState, ChatThreadNavigationActions, ChatThreadSearchState, ChatThreadRow } from '../chat-thread-navigation-contract.js';
  import { THREAD_FOCUS, THREAD_MENU, THREAD_MENU_BUTTON, THREAD_SUMMARY, THREAD_LABEL, THREAD_EMPTY } from '../chat-thread-navigation-classes.js';
  let { initial, actions }: { initial: ChatThreadNavigationState; actions: ChatThreadNavigationActions } = $props();
  let navigation = $state(untrack(() => initial));
  let search = $state<ChatThreadSearchState>({ phase: 'idle', progress: '', results: [], truncated: false });
  let root: HTMLDivElement | null = $state(null);
  let menuUp = $state(false);
  let openMenu = $state<string | null>(null), draggedId = $state(''), dropProject = $state<string | null>(null);
  let pending: { id: string; source: HTMLElement; pointerId: number; x: number; y: number } | null = null;
  let suppressClick = false, clickTimer: ReturnType<typeof setTimeout> | null = null;
  export function setState(next: ChatThreadNavigationState): void {
    if (next.query !== navigation.query) search = { phase: 'idle', progress: '', results: [], truncated: false };
    navigation = next;
  }
  export function setSearch(next: ChatThreadSearchState): void { search = next; }
  export function clear(): void { search = { phase: 'idle', progress: '', results: [], truncated: false }; openMenu = null; clearDrag(); }
  function choose(callback: () => unknown): void { if (!suppressClick) { openMenu = null; callback(); } }
  function toggle(event: MouseEvent, id: string): void {
    event.preventDefault(); event.stopPropagation();
    const button = event.currentTarget as HTMLElement, bounds = button.getBoundingClientRect();
    const viewport = root?.closest('#chat-thread-list')?.getBoundingClientRect();
    menuUp = !!viewport && viewport.bottom - bounds.bottom < 200 && bounds.top - viewport.top > viewport.bottom - bounds.bottom;
    openMenu = openMenu === id ? null : id;
  }
  function outside(event: MouseEvent): void {
    if (openMenu && event.target instanceof Node && !root?.querySelector('details[open]')?.contains(event.target)) openMenu = null;
  }
  function keydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !openMenu || !(event.target instanceof Node) || !root?.contains(event.target)) return;
    event.preventDefault(); event.stopPropagation(); const trigger = root.querySelector<HTMLElement>('details[open] > summary'); openMenu = null; trigger?.focus();
  }
  function clearDrag(): void {
    if (pending) { try { pending.source.releasePointerCapture(pending.pointerId); } catch {} }
    pending = null; draggedId = ''; dropProject = null; document.body?.classList.remove('is-chat-thread-pointer-dragging');
  }
  function pointerDown(event: PointerEvent, thread: ChatThreadRow): void {
    if (event.button !== 0 || !event.isPrimary || event.pointerType === 'touch' || matchMedia('(max-width: 768px)').matches) return;
    pending = { id: thread.id, source: event.currentTarget as HTMLElement, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }
  function targetAt(event: PointerEvent): HTMLElement | null {
    const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-chat-project-drop]');
    return hit && root?.contains(hit) ? hit : null;
  }
  function pointerMove(event: PointerEvent): void {
    if (!pending || event.pointerId !== pending.pointerId) return;
    if (!draggedId) {
      if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < 6) return;
      draggedId = pending.id; openMenu = null; document.body?.classList.add('is-chat-thread-pointer-dragging');
      try { pending.source.setPointerCapture(event.pointerId); } catch {}
    }
    event.preventDefault(); getSelection()?.removeAllRanges(); dropProject = targetAt(event)?.dataset.chatProjectDrop ?? null;
  }
  function pointerUp(event: PointerEvent): void {
    if (!pending || event.pointerId !== pending.pointerId) return;
    const id = draggedId, target = id ? targetAt(event) : null, project = target?.dataset.chatProjectDrop || '';
    clearDrag(); if (!id) return;
    event.preventDefault(); suppressClick = true;
    if (clickTimer) clearTimeout(clickTimer); clickTimer = setTimeout(() => { suppressClick = false; clickTimer = null; }, 0);
    if (target) actions.move(id, project);
  }
  function pointerCancel(event: PointerEvent): void { if (pending?.pointerId === event.pointerId) clearDrag(); }
  onDestroy(() => { clear(); if (clickTimer) clearTimeout(clickTimer); });
</script>
<svelte:document onclickcapture={outside} onkeydowncapture={keydown} onpointermove={pointerMove} onpointerup={pointerUp} onpointercancel={pointerCancel} />
<svelte:window onblur={clearDrag} />
{#snippet icon(kind: string)}
  <svg viewBox="0 0 24 24" aria-hidden="true" class="gb:thread-nav:size-4 gb:thread-nav:shrink-0 gb:thread-nav:fill-none gb:thread-nav:stroke-current gb:thread-nav:stroke-[1.8]">
    {#if kind === 'pin'}<path d="m14 4 6 6-3 1-4 4-1 5-2-2-4 4-1-1 4-4-2-2 5-1 4-4z" />
    {:else if kind === 'folder'}<path d="M3 6h6l2 2h10v11H3z" />
    {:else if kind === 'edit'}<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    {:else if kind === 'delete'}<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
    {:else}<circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />{/if}
  </svg>
{/snippet}
{#snippet threadRow(thread: ChatThreadRow)}
  <div class={'chat-thread-item gb:thread-nav:relative gb:thread-nav:mb-0.5 gb:thread-nav:min-w-0 gb:thread-nav:rounded-control gb:thread-nav:border-l-2 gb:thread-nav:hover:bg-hover ' + (thread.active ? 'active gb:thread-nav:border-accent gb:thread-nav:bg-accent/10 ' : 'gb:thread-nav:border-transparent ') + (thread.pinned ? 'pinned ' : '') + (draggedId === thread.id ? 'is-dragging gb:thread-nav:opacity-35 ' : '') + (openMenu === 'thread:' + thread.id ? 'gb:thread-nav:z-30' : '')} data-thread-id={thread.id} aria-grabbed={draggedId === thread.id} title="Drag into a project">
    <button type="button" class={'chat-thread-item-main gb:thread-nav:flex gb:thread-nav:w-full gb:thread-nav:min-w-0 gb:thread-nav:max-[768px]:min-h-16 gb:thread-nav:pointer-coarse:min-h-16 gb:thread-nav:flex-col gb:thread-nav:gap-0.5 gb:thread-nav:[font:inherit] gb:thread-nav:rounded-[inherit] gb:thread-nav:border-0 gb:thread-nav:bg-transparent gb:thread-nav:pl-2.5 gb:thread-nav:pr-[38px] gb:thread-nav:py-2 gb:thread-nav:max-[768px]:pl-3.5 gb:thread-nav:max-[768px]:pr-[58px] gb:thread-nav:max-[768px]:py-3 gb:thread-nav:pointer-coarse:pr-[58px] gb:thread-nav:text-left gb:thread-nav:text-ink gb:thread-nav:cursor-grab gb:thread-nav:select-none ' + THREAD_FOCUS} data-chat-thread-action="switch" aria-current={thread.active} onpointerdown={event => pointerDown(event, thread)} onclick={event => { event.stopPropagation(); choose(() => actions.switch(thread.id)); }}>
      <span class="chat-thread-item-name gb:thread-nav:block gb:thread-nav:w-full gb:thread-nav:truncate gb:thread-nav:text-xs gb:thread-nav:font-medium gb:thread-nav:leading-[1.3]">{thread.name}</span>
      <span class="chat-thread-item-meta gb:thread-nav:flex gb:thread-nav:items-center gb:thread-nav:gap-1.5 gb:thread-nav:text-[10px] gb:thread-nav:text-secondary"><span title={thread.personalityName || undefined}>{thread.icon}</span><span>{thread.date}</span><span>{thread.messageCount} msg{thread.messageCount === 1 ? '' : 's'}</span></span>
    </button>
    <details class="chat-thread-item-menu gb:thread-nav:absolute gb:thread-nav:right-1.5 gb:thread-nav:top-1.5" open={openMenu === 'thread:' + thread.id}>
      <summary class={'chat-thread-item-action ' + THREAD_SUMMARY} aria-label={'Actions for ' + thread.name} title="Conversation actions" onclick={event => toggle(event, 'thread:' + thread.id)}>{@render icon('more')}</summary>
      <div class={'chat-thread-item-menu-popover ' + THREAD_MENU} style:top={menuUp ? 'auto' : undefined} style:bottom={menuUp ? 'calc(100% + 5px)' : undefined}>
        <button type="button" class={THREAD_MENU_BUTTON} data-chat-thread-action="pin" data-thread-id={thread.id} onclick={event => { event.stopPropagation(); choose(() => actions.pin(thread.id)); }}>{@render icon('pin')}<span>{thread.pinned ? 'Unpin' : 'Pin'}</span></button>
        <button type="button" class={THREAD_MENU_BUTTON} data-chat-thread-action="rename" data-thread-id={thread.id} onclick={event => { event.stopPropagation(); choose(() => actions.rename(thread.id)); }}>{@render icon('edit')}<span>Rename</span></button>
        {#if navigation.projects.some(project => project !== thread.projectName) || thread.projectName}<div class={'chat-thread-move-label gb:thread-nav:mt-1 gb:thread-nav:border-t gb:thread-nav:border-line ' + THREAD_LABEL}>Move to project</div>{/if}
        {#each navigation.projects.filter(project => project !== thread.projectName) as project (project)}
          <button type="button" class={THREAD_MENU_BUTTON} data-chat-thread-action="move-project" data-thread-id={thread.id} data-project-name={project} onclick={event => { event.stopPropagation(); choose(() => actions.move(thread.id, project)); }}>{@render icon('folder')}<span class="gb:thread-nav:break-all">{project}</span></button>
        {/each}
        {#if thread.projectName}<button type="button" class={THREAD_MENU_BUTTON} data-chat-thread-action="move-project" data-thread-id={thread.id} data-project-name="" onclick={event => { event.stopPropagation(); choose(() => actions.move(thread.id, '')); }}>{@render icon('folder')}<span>No project</span></button>{/if}
        <button type="button" class={THREAD_MENU_BUTTON + ' gb:thread-nav:text-danger-ink'} data-chat-thread-action="delete" data-thread-id={thread.id} onclick={event => { event.stopPropagation(); choose(() => actions.delete(thread.id)); }}>{@render icon('delete')}<span>Delete</span></button>
      </div>
    </details>
  </div>
{/snippet}
<div data-chat-thread-navigation-view bind:this={root} class="gb:thread-nav:flex gb:thread-nav:min-w-0 gb:thread-nav:flex-col gb:thread-nav:text-ink" class:is-thread-dragging={!!draggedId}>
  {#if navigation.empty && (!navigation.query.trim() || search.phase !== 'done')}<div class={THREAD_EMPTY}>{navigation.query ? 'No matching conversations' : 'No conversations yet'}</div>{/if}
  {#if navigation.query.trim() && search.phase === 'done' && !navigation.empty}<div class={'chat-search-results-label ' + THREAD_LABEL}>Conversations</div>{/if}
  {#each navigation.groups as group (group.id)}
    <section class={'chat-thread-group gb:thread-nav:mb-2.5 gb:thread-nav:min-w-0 gb:thread-nav:rounded-control ' + (group.projectName !== null ? 'gb:thread-nav:outline-1 gb:thread-nav:outline-offset-[-1px] ' + (dropProject === group.projectName ? 'is-drop-target gb:thread-nav:outline-accent gb:thread-nav:bg-accent/10 ' : 'gb:thread-nav:outline-transparent ') : '') + (openMenu === 'project:' + group.projectName ? 'gb:thread-nav:relative gb:thread-nav:z-30' : '')} data-chat-project-drop={group.projectName ?? undefined}>
      {#if group.label}<div class={'chat-thread-group-title gb:thread-nav:flex gb:thread-nav:min-h-6 gb:thread-nav:items-center gb:thread-nav:gap-1.5 gb:thread-nav:px-2 gb:thread-nav:py-1 gb:thread-nav:text-[10px] gb:thread-nav:font-[650] gb:thread-nav:uppercase gb:thread-nav:tracking-[0.06em] gb:thread-nav:text-secondary'}>
        <span class="chat-thread-group-label gb:thread-nav:flex gb:thread-nav:min-w-0 gb:thread-nav:items-center gb:thread-nav:gap-1.5 gb:thread-nav:truncate">{#if group.icon}{@render icon(group.icon)}{/if}{group.label}</span>
        {#if group.projectName !== null}<details class="chat-project-menu gb:thread-nav:relative gb:thread-nav:ml-auto gb:thread-nav:normal-case" open={openMenu === 'project:' + group.projectName}>
          <summary class={'chat-project-action ' + THREAD_SUMMARY} aria-label={'Actions for ' + group.label} title="Project actions" onclick={event => toggle(event, 'project:' + group.projectName)}>{@render icon('more')}</summary>
          <div class={'chat-project-menu-popover ' + THREAD_MENU} style:top={menuUp ? 'auto' : undefined} style:bottom={menuUp ? 'calc(100% + 5px)' : undefined}>
            <button type="button" class={THREAD_MENU_BUTTON} data-chat-project-action="rename" data-project-name={group.projectName} onclick={event => { event.stopPropagation(); choose(() => actions.renameProject(group.projectName!)); }}>{@render icon('edit')}<span>Rename project</span></button>
            <button type="button" class={THREAD_MENU_BUTTON + ' gb:thread-nav:text-danger-ink'} data-chat-project-action="delete" data-project-name={group.projectName} onclick={event => { event.stopPropagation(); choose(() => actions.deleteProject(group.projectName!)); }}>{@render icon('delete')}<span>Delete project</span></button>
          </div>
        </details>{/if}
      </div>{/if}
      {#each group.threads as thread (thread.id)}{@render threadRow(thread)}{/each}
    </section>
  {/each}
  {#if !navigation.query.trim() && !navigation.empty}<div class={'chat-thread-unfiled-drop gb:thread-nav:sticky gb:thread-nav:bottom-2 gb:thread-nav:z-30 gb:thread-nav:mx-1 gb:thread-nav:my-2 gb:thread-nav:min-h-11 gb:thread-nav:shrink-0 gb:thread-nav:items-center gb:thread-nav:justify-center gb:thread-nav:rounded-control gb:thread-nav:border gb:thread-nav:border-dashed gb:thread-nav:text-xs gb:thread-nav:text-secondary gb:thread-nav:shadow-sm ' + (draggedId ? 'gb:thread-nav:flex ' : 'gb:thread-nav:hidden ') + (dropProject === '' ? 'is-drop-target gb:thread-nav:border-accent gb:thread-nav:bg-accent/10' : 'gb:thread-nav:border-line gb:thread-nav:bg-surface')} data-chat-project-drop="">Drop here for no project</div>{/if}
  {#if search.phase === 'pending'}<div class={'chat-search-progress ' + THREAD_EMPTY} role="status">{search.progress}</div>{/if}
  {#if search.phase === 'done'}
    {#if navigation.empty && search.results.length === 0}<div class={'chat-search-empty ' + THREAD_EMPTY}>No matches in conversations or messages</div>{/if}
    {#if search.results.length}<div class={'chat-search-results-label ' + THREAD_LABEL}>Messages</div>{/if}
    {#each search.results as result (result.threadId + ':' + result.msgIndex)}
      <button type="button" class={'chat-search-result gb:thread-nav:block gb:thread-nav:w-full gb:thread-nav:min-h-11 gb:thread-nav:rounded-control gb:thread-nav:border-0 gb:thread-nav:bg-transparent gb:thread-nav:px-2.5 gb:thread-nav:py-2 gb:thread-nav:text-left gb:thread-nav:cursor-pointer gb:thread-nav:hover:bg-hover ' + THREAD_FOCUS} data-chat-message-action="jump-search-result" data-chat-message-thread-id={result.threadId} data-chat-message-index={result.msgIndex} onclick={event => { event.stopPropagation(); actions.jump(result); }}>
        <span class="chat-search-result-thread gb:thread-nav:block gb:thread-nav:mb-0.5 gb:thread-nav:text-[10px] gb:thread-nav:text-secondary">{result.threadName}</span>
        <span class="chat-search-result-snippet gb:thread-nav:block gb:thread-nav:text-xs gb:thread-nav:leading-relaxed gb:thread-nav:text-secondary gb:thread-nav:break-words">{result.role === 'user' ? '📝' : '🤖'} {result.pre}<mark class="gb:thread-nav:rounded-sm gb:thread-nav:bg-accent gb:thread-nav:text-on-accent gb:thread-nav:px-px">{result.match}</mark>{result.post}</span>
      </button>
    {/each}
    {#if search.truncated}<div class={THREAD_EMPTY}>Showing first 30 matches</div>{/if}
  {/if}
</div>
