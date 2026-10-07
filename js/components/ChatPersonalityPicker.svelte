<script lang="ts">
  import {flushSync} from 'svelte';
  import {INITIAL_PERSONALITY_PICKER,ownPersonalityPicker,personalityPickerActions,type PersonalityPickerState,type PersonalityOption} from '../chat-personality-picker-view.js';
  import {PERSONA_BAR,PERSONA_CURRENT,PERSONA_OPTIONS,PERSONA_OPTION,PERSONA_DIVIDER,PERSONA_EDIT,PERSONA_ADD,PERSONA_THEME_BAR,PERSONA_THEME_POPUP,PERSONA_THEME_OPTION} from '../chat-personality-classes.js';
  let view=$state<PersonalityPickerState>({...INITIAL_PERSONALITY_PICKER});
  let open=$state(false); let root:HTMLElement; let trigger:HTMLButtonElement;
  function register(element:HTMLElement) {
    return ownPersonalityPicker(element,{
      render(next){flushSync(()=>{view=next;});},isOpen:()=>open,
      setOpen(next,focusId){flushSync(()=>{open=next;});if(focusId==='trigger') trigger.focus();else if(focusId) (focusId==='new'?root.querySelector<HTMLButtonElement>('.chat-personality-add-btn'):[...root.querySelectorAll<HTMLButtonElement>('[data-personality]')].find(button=>button.dataset.personality===focusId))?.focus();},
    });
  }
  function outside(event:MouseEvent){if(event.composedPath().some(target=>target instanceof HTMLElement&&target.hasAttribute('data-chat-persona-editor-view')))return;if(open && event.target instanceof Node && !root.contains(event.target)) open=false;}
  function escape(event:KeyboardEvent){if(event.key==='Escape' && open){event.preventDefault();event.stopImmediatePropagation();open=false;trigger.focus();}}
</script>
<svelte:document onclick={outside} onkeydown={escape}/>
{#snippet option(item:PersonalityOption, version:number)}
  <button type="button" class="{PERSONA_OPTION} {PERSONA_THEME_OPTION} {item.id===view.current?'active':''} {item.custom?'gb:persona:pr-[58px] gb:persona:pointer-coarse:min-h-[52px] gb:persona:pointer-coarse:pr-[98px]':''}" data-personality={item.id} data-chat-action="set-personality" aria-pressed={item.id===view.current} onclick={()=>personalityPickerActions(root)?.select(item.id,version)}>
    <span class="chat-personality-opt-icon gb:persona:text-lg gb:persona:shrink-0 gb:persona:w-6 gb:persona:text-center" aria-hidden="true">{item.icon}</span>
    <span class="chat-personality-opt-info gb:persona:min-w-0 gb:persona:flex-1 gb:persona:flex gb:persona:flex-col gb:persona:gap-px"><span class="chat-personality-opt-name gb:persona:text-[13px] gb:persona:text-ink gb:persona:font-medium gb:persona:break-words">{item.name}</span><span class="chat-personality-opt-desc gb:persona:text-[11px] gb:persona:text-secondary">{item.description}</span></span>
    <span class="chat-personality-opt-check gb:persona:text-[13px] gb:persona:text-accent gb:persona:shrink-0 {item.id===view.current?'':'gb:persona:opacity-0'}" aria-hidden="true">✓</span>
  </button>
{/snippet}
<div bind:this={root} use:register data-chat-personality-view class="{PERSONA_BAR} {PERSONA_THEME_BAR} {open?'open':''}">
  <button type="button" bind:this={trigger} class={PERSONA_CURRENT} aria-expanded={open} aria-controls="chat-personality-options" data-chat-action="toggle-personality" onclick={()=>personalityPickerActions(root)?.toggle()}>
    <span class="chat-personality-current-icon gb:persona:text-sm" aria-hidden="true">{view.icon}</span><span class="chat-personality-current-name gb:persona:text-xs gb:persona:font-mono gb:persona:text-secondary gb:persona:flex-1 gb:persona:min-w-0 gb:persona:truncate">{view.name}</span><span class="chat-personality-current-arrow gb:persona:text-[10px] gb:persona:text-secondary {open?'gb:persona:rotate-180':''}" aria-hidden="true">▾</span>
  </button>
  <div class="{PERSONA_OPTIONS} {PERSONA_THEME_POPUP}" id="chat-personality-options" role="group" aria-label="Chat personality" hidden={!open}>
    {#each view.options.filter(item=>!item.custom) as item}{#if item.id==='house'}<div class={PERSONA_DIVIDER}>Fictional Characters</div>{/if}{@render option(item,view.version)}{/each}
    <div id="chat-personality-custom-section"><div class={PERSONA_DIVIDER}>Custom</div>
      {#each view.options.filter(item=>item.custom) as item (item.id)}
        {@const version=view.version}
        <div class="chat-personality-opt-wrapper gb:persona:relative">{@render option(item,version)}
          <button type="button" class="chat-personality-edit {PERSONA_EDIT} gb:persona:right-[30px] gb:persona:pointer-coarse:right-12 gb:persona:hover:text-accent gb:persona:hover:bg-hover" data-chat-personality-action="edit-custom" data-chat-personality-id={item.id} title="Edit personality" aria-label="Edit personality" onclick={()=>personalityPickerActions(root)?.edit(item.id,version)}> <svg class="gb:persona:size-4 gb:persona:fill-none gb:persona:stroke-current gb:persona:stroke-2 gb:persona:[stroke-linecap:round] gb:persona:[stroke-linejoin:round]" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
          <button type="button" class="chat-personality-delete {PERSONA_EDIT} gb:persona:right-2 gb:persona:pointer-coarse:right-0.5 gb:persona:hover:text-danger gb:persona:hover:bg-hover" data-chat-personality-action="delete-custom" data-chat-personality-id={item.id} title="Delete personality" aria-label="Delete personality" onclick={()=>personalityPickerActions(root)?.delete(item.id,version)}> <svg class="gb:persona:size-4 gb:persona:fill-none gb:persona:stroke-current gb:persona:stroke-2 gb:persona:[stroke-linecap:round] gb:persona:[stroke-linejoin:round]" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
        </div>
      {/each}
      <button type="button" class="{PERSONA_ADD} {PERSONA_THEME_OPTION}" data-chat-personality-action="start-new-custom" onclick={()=>personalityPickerActions(root)?.add(view.version)}>+ New Personality</button>
    </div>
  </div>
</div>
