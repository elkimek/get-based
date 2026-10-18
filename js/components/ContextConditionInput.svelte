<script lang="ts">
  import { input, label, focus } from '../context-form-classes.js';
  let { id, listId, title, placeholder, value, suggestions, disabled, current, change, add }: {
    id: string; listId: string; title: string; placeholder: string; value: string; suggestions: string[];
    disabled: boolean; current(): boolean; change(value: string): void; add(): void;
  } = $props();
  let expanded = $state(false), active = $state(-1), control: HTMLInputElement;
  const visible = $derived(expanded && suggestions.length > 0 && !disabled);
  export function hide(): void { expanded = false; active = -1; }
  export function refresh(): void { if (current() && !disabled) { change(control.value); expanded = true; active = -1; } }
  export function select(text: string): void { if (current() && !disabled) { change(text); hide(); control.focus(); } }
  function keydown(event: KeyboardEvent): void {
    if (!current() || disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!suggestions.length) return;
      event.preventDefault(); expanded = true;
      active = event.key === 'ArrowDown' ? (active + 1) % suggestions.length : (active <= 0 ? suggestions.length - 1 : active - 1);
      return;
    }
    if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); hide(); }
    if (event.key === 'Enter') {
      event.preventDefault(); const choice = visible && active >= 0 ? suggestions[active] : undefined;
      if (choice) select(choice); else { hide(); add(); }
    }
  }
</script>
<div class="gb:context-form:relative gb:context-form:min-w-0">
  <label class={label} for={id}>{title}</label>
  <input bind:this={control} {id} type="text" role="combobox" aria-autocomplete="list" aria-expanded={visible} aria-controls={listId} aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined} autocomplete="off" {placeholder} {value} {disabled} class={input}
    oninput={event => { if (current() && !disabled) { change(event.currentTarget.value); expanded = true; active = -1; } }}
    onfocus={() => { if (current()) expanded = true; }} onblur={() => hide()} onkeydown={keydown} />
  <div id={listId} role="listbox" aria-label={`${title} suggestions`} hidden={!visible} class="gb:context-form:absolute gb:context-form:top-full gb:context-form:left-0 gb:context-form:right-0 gb:context-form:z-50 gb:context-form:max-h-[200px] gb:context-form:overflow-y-auto gb:context-form:rounded-control gb:context-form:border gb:context-form:border-line gb:context-form:bg-secondary-surface gb:context-form:shadow-dialog">
    {#each suggestions as suggestion, index}<button type="button" id={`${listId}-${index}`} role="option" aria-selected={active === index} tabindex="-1" class={`ctx-suggestion-item gb:context-form:block gb:context-form:w-full gb:context-form:pointer-coarse:min-h-11 gb:context-form:max-[720px]:min-h-11 gb:context-form:border-0 gb:context-form:bg-transparent gb:context-form:px-3.5 gb:context-form:py-2 gb:context-form:text-left gb:context-form:text-[13px] gb:context-form:[font-family:inherit] gb:context-form:leading-normal gb:context-form:text-secondary gb:context-form:cursor-pointer gb:context-form:hover:bg-hover gb:context-form:aria-selected:bg-hover ${focus}`} onmousedown={event => event.preventDefault()} onclick={() => select(suggestion)}>{suggestion}</button>{/each}
  </div>
</div>
