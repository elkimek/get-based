<script lang="ts">
  import { flushSync } from 'svelte';
  import { INITIAL_CHAT_MODEL_PICKER, type ChatModelPickerState } from '../chat-model-picker-contract.js';
  import { chatModelPickerActions, ownChatModelPicker } from '../chat-model-picker-view.js';
  import { MODEL_MENU, MODEL_TOGGLE, MODEL_POPOVER, MODEL_HEAD, MODEL_EFFORT, MODEL_EFFORT_HEAD, MODEL_EFFORT_CONTROL, MODEL_EFFORT_RANGE, MODEL_EFFORT_DOTS,
    MODEL_SEARCH, MODEL_OPTIONS, MODEL_GROUP_LABEL, MODEL_OPTION, MODEL_EMPTY, MODEL_UNAVAILABLE, MODEL_REFRESH } from '../chat-model-picker-classes.js';
  let viewState = $state<ChatModelPickerState>({...INITIAL_CHAT_MODEL_PICKER});
  let query = $state(''); let index = $state(0); let menu: HTMLDetailsElement; let toggle: HTMLElement;
  let open = $state(false); let wasOpen = false;
  const normalized = $derived(query.trim().toLowerCase());
  const selected = $derived(viewState.efforts[index]);
  const progress = $derived(viewState.efforts.length > 1 ? index / (viewState.efforts.length-1)*100 : 0);
  const matches = (search: string) => !normalized || search.includes(normalized);
  function register(root: HTMLElement) {
    return ownChatModelPicker(root,{
      render(next) { flushSync(() => { if(next.version!==viewState.version) query=''; viewState=next;index=next.selectedEffort; }); },
      close(focus=false) { flushSync(() => {open=false;wasOpen=false;});if(focus) toggle.focus(); },
    });
  }
  // Own the state synchronously. Native details toggle events are deferred,
  // which could otherwise erase an immediate query or miss an early Escape.
  function prepareToggle(event: MouseEvent) {
    event.preventDefault();
    if(open) { open=false;wasOpen=false;return; }
    wasOpen=true;query='';open=true;chatModelPickerActions(menu)?.open();
  }
  function opened() {
    if(menu.open && !wasOpen) { wasOpen=true;query='';chatModelPickerActions(menu)?.open(); }
    if(!menu.open) wasOpen=false;
  }
  function outside(event: MouseEvent) { if(open && event.target instanceof Node && !menu.contains(event.target)) open=false; }
  function escape(event: KeyboardEvent) {
    if(event.key!=='Escape'||!open) return;
    event.preventDefault();event.stopImmediatePropagation();open=false;wasOpen=false;toggle.focus();
  }
  function preview(event: Event) {
    index=Math.max(0,Math.min(viewState.efforts.length-1,Number((event.currentTarget as HTMLInputElement).value)||0));
  }
  function commit() { if(selected) void chatModelPickerActions(menu)?.effort(selected.value,viewState.version); }
  const ICON='gb:model-picker:size-3.5 gb:model-picker:fill-none gb:model-picker:stroke-current gb:model-picker:stroke-2 gb:model-picker:[stroke-linecap:round] gb:model-picker:[stroke-linejoin:round]';
</script>
<svelte:document onclick={outside} onkeydown={escape} />
<details bind:this={menu} bind:open ontoggle={opened} use:register data-chat-model-picker-view class={MODEL_MENU} id="chat-model-menu">
  <summary bind:this={toggle} class={MODEL_TOGGLE} id="chat-model-menu-toggle"
    onclick={prepareToggle} aria-label={viewState.provider ? `Choose model and reasoning effort. Current: ${viewState.provider}, ${viewState.label}` : 'Choose model and reasoning effort'} title={viewState.provider ? `${viewState.provider} · ${viewState.label}` : 'Choose model and reasoning effort'}>
    <span class="chat-model-menu-label gb:model-picker:min-w-0 gb:model-picker:truncate" id="chat-model-menu-label">{viewState.label}</span>
    <svg class={ICON+' gb:model-picker:shrink-0 gb:model-picker:[details[open]_&]:rotate-180'} viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
  </summary>
  <div class={MODEL_POPOVER} id="chat-model-menu-popover" aria-live="polite">
    <div class={MODEL_HEAD}><span>{viewState.provider}</span><strong>{viewState.selectedName}</strong></div>
    {#if viewState.efforts.length}
      <div class={MODEL_EFFORT}>
        <div class={MODEL_EFFORT_HEAD}><span>Reasoning</span><strong id="chat-model-effort-value">{selected?.label}</strong></div>
        <div class={MODEL_EFFORT_CONTROL} style:--chat-effort-progress={`${progress}%`}>
          <input type="range" class={MODEL_EFFORT_RANGE} id="chat-model-effort" min="0" max={viewState.efforts.length-1} step="1" value={index} aria-label="Reasoning effort" aria-valuetext={selected?.label} oninput={preview} onchange={commit}>
          <div class={MODEL_EFFORT_DOTS} aria-hidden="true">{#each viewState.efforts as _effort}<span></span>{/each}</div>
        </div>
      </div>
    {:else}<div class={MODEL_UNAVAILABLE}>This model does not expose a separate reasoning control.</div>{/if}
    {#if viewState.searchable}<input type="search" class={MODEL_SEARCH} id="chat-model-search" placeholder="Search models" aria-label="Search models" bind:value={query} />{/if}
    <div class={MODEL_OPTIONS} id="chat-model-options" role="listbox" aria-label="Models">
      {#each viewState.groups as group}
        <section class="chat-model-option-group gb:model-picker:[&[hidden]]:hidden" hidden={!group.options.some(option=>matches(option.search))}>
          {#if group.key}<div class={MODEL_GROUP_LABEL}>{group.label}</div>{/if}
          {#each group.options as option}
            <button type="button" class={MODEL_OPTION} role="option" aria-selected={option.selected} data-chat-model-value={option.value} data-chat-model-search={option.search} hidden={!matches(option.search)} onclick={() => chatModelPickerActions(menu)?.select(option.value,viewState.version)}>
              <span title={option.label}>{option.label}</span>{#if option.selected}<span aria-hidden="true">✓</span>{/if}
            </button>
          {/each}
        </section>
      {:else}<div class={MODEL_EMPTY}>No model catalog is available yet.</div>{/each}
    </div>
    <button type="button" class={MODEL_REFRESH} data-chat-model-refresh disabled={viewState.refreshing} onclick={() => chatModelPickerActions(menu)?.refresh()}>
      <svg class={ICON} viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>{viewState.refreshing?'Refreshing…':'Refresh models'}
    </button>
  </div>
</details>
