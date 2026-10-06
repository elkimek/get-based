<script lang="ts">
  import { untrack } from 'svelte';
  import type { CliAgentModelsAction, CliAgentModelsSnapshot, CliAgentPicker } from '../cli-agent-models-contract.js';
  let { initial, action }: { initial: CliAgentModelsSnapshot; action: CliAgentModelsAction } = $props();
  let snapshot = $state<CliAgentModelsSnapshot>(untrack(() => initial));
  let queries = $state<Record<string, string>>({});
  let opened = $state<Record<string, boolean>>({});
  const query = (picker: CliAgentPicker) => (queries[picker.id] || '').trim().toLowerCase();
  const visibleOptions = (picker: CliAgentPicker) => picker.options.filter(option => !query(picker) || `${option.label} ${option.value}`.toLowerCase().includes(query(picker)));
  const selectedLabel = (picker: CliAgentPicker) => (picker.options.find(option => option.value === picker.value)
    || (!picker.value && !picker.placeholder ? picker.options[0] : null))?.label || picker.placeholder || '';
  export function refresh(next: CliAgentModelsSnapshot): void {
    if (next.context !== snapshot.context) { queries = {}; opened = {}; }
    snapshot = next;
  }
  export function filter(value: string): void { queries['cli-agent-model'] = value; }
  function choose(event: MouseEvent, picker: CliAgentPicker, value: string): void {
    event.stopPropagation(); if (picker.disabled) return;
    opened[picker.id] = false; queries[picker.id] = ''; action(picker.action, value);
    document.getElementById(`${picker.id}-summary`)?.focus();
  }
  function navigate(event: KeyboardEvent): void {
    const button = event.currentTarget as HTMLButtonElement;
    const options = [...button.parentElement!.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    const index = options.indexOf(button);
    const next = event.key === 'ArrowDown' ? (index + 1) % options.length : event.key === 'ArrowUp' ? (index + options.length - 1) % options.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); event.stopPropagation(); options[next]?.focus(); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); const details = button.closest('details');
      if (details) { opened[details.dataset.pickerId!] = false; details.querySelector('summary')?.focus(); } }
  }
</script>
<div data-cli-agent-models-view class="gb:cli-model:grid gb:cli-model:min-w-0 gb:cli-model:grid-cols-1 gb:cli-model:gap-2.5 gb:cli-model:pt-3 gb:cli-model:pb-0.5 {snapshot.pickers.length === 3 ? 'gb:cli-model:min-[721px]:grid-cols-3' : 'gb:cli-model:min-[721px]:grid-cols-2'}">
  {#if snapshot.loading}<div role="status" class="gb:cli-model:col-span-full gb:cli-model:text-xs gb:cli-model:text-secondary">{snapshot.loading}</div>{/if}
  {#each snapshot.pickers as picker (picker.id)}
    <div class="gb:cli-model:min-w-0">
      <span id={`${picker.id}-label`} class="gb:cli-model:mb-1 gb:cli-model:block gb:cli-model:text-[10.5px] gb:cli-model:font-semibold gb:cli-model:text-secondary">{picker.label}</span>
      <details class="cli-agent-picker gb:cli-model:relative gb:cli-model:w-full" data-picker-id={picker.id} data-disabled={picker.disabled ? 'true' : undefined} bind:open={opened[picker.id]}>
        <summary id={`${picker.id}-summary`} aria-labelledby={`${picker.id}-label ${picker.id}-value`} aria-disabled={picker.disabled || undefined} tabindex={picker.disabled ? -1 : undefined}
          onclick={event => { if (picker.disabled) event.preventDefault(); }}
          onkeydown={event => { if (picker.disabled) event.preventDefault(); }}
          class="gb:cli-model:flex gb:cli-model:min-h-11 gb:cli-model:w-full gb:cli-model:min-w-0 gb:cli-model:cursor-pointer gb:cli-model:list-none gb:cli-model:items-center gb:cli-model:justify-between gb:cli-model:gap-2 gb:cli-model:rounded-lg gb:cli-model:border gb:cli-model:border-line gb:cli-model:bg-secondary-surface gb:cli-model:px-2.5 gb:cli-model:py-2 gb:cli-model:text-xs gb:cli-model:text-ink gb:cli-model:focus-visible:outline-2 gb:cli-model:focus-visible:outline-accent gb:cli-model:focus-visible:outline-offset-2 gb:cli-model:[&::-webkit-details-marker]:hidden gb:cli-model:aria-disabled:cursor-default gb:cli-model:aria-disabled:opacity-55">
          <span id={`${picker.id}-value`} title={selectedLabel(picker)} class="gb:cli-model:min-w-0 gb:cli-model:truncate">{selectedLabel(picker)}</span><span aria-hidden="true" class="gb:cli-model:shrink-0 gb:cli-model:text-secondary">{opened[picker.id] ? '⌃' : '⌄'}</span>
        </summary>
        <div class="gb:cli-model:mt-1 gb:cli-model:max-h-[min(360px,52vh)] gb:cli-model:overflow-y-auto gb:cli-model:rounded-lg gb:cli-model:border gb:cli-model:border-line gb:cli-model:bg-select-popup gb:cli-model:p-1 gb:cli-model:shadow-md">
          {#if picker.searchable}
            <div class="gb:cli-model:sticky gb:cli-model:top-0 gb:cli-model:z-1 gb:cli-model:grid gb:cli-model:grid-cols-[minmax(0,1fr)_auto] gb:cli-model:items-center gb:cli-model:gap-2 gb:cli-model:bg-select-popup gb:cli-model:p-1">
              <input type="search" data-cli-agent-model-search aria-label="Search models" placeholder={`Search ${picker.options.length} models`} bind:value={queries[picker.id]}
                oninput={event => event.stopPropagation()}
                onkeydown={event => { if (event.key === 'Escape') { opened[picker.id] = false; document.getElementById(`${picker.id}-summary`)?.focus(); } }}
                class="gb:cli-model:min-h-11 gb:cli-model:w-full gb:cli-model:min-w-0 gb:cli-model:rounded-md gb:cli-model:border gb:cli-model:border-line gb:cli-model:bg-secondary-surface gb:cli-model:px-2 gb:cli-model:py-2 gb:cli-model:text-xs gb:cli-model:text-ink gb:cli-model:focus-visible:outline-2 gb:cli-model:focus-visible:outline-accent gb:cli-model:focus-visible:outline-offset-2">
              <span id="cli-agent-model-result-count" role="status" class="gb:cli-model:text-[10px] gb:cli-model:text-secondary">{visibleOptions(picker).length} {visibleOptions(picker).length === 1 ? 'model' : 'models'}</span>
            </div>
          {/if}
          <div id={picker.searchable ? 'cli-agent-model-options' : undefined} role="listbox" aria-label={picker.label} class="gb:cli-model:grid gb:cli-model:min-w-0">
            {#each visibleOptions(picker) as option (option.value)}
              <button type="button" role="option" aria-selected={option.value === picker.value} disabled={picker.disabled} data-settings-action={picker.action} data-value={option.value}
                onclick={event => choose(event, picker, option.value)} onkeydown={navigate}
                class="gb:cli-model:flex gb:cli-model:min-h-11 gb:cli-model:w-full gb:cli-model:min-w-0 gb:cli-model:cursor-pointer gb:cli-model:items-center gb:cli-model:justify-between gb:cli-model:gap-2 gb:cli-model:rounded-md gb:cli-model:border-0 gb:cli-model:bg-transparent gb:cli-model:px-2 gb:cli-model:py-2 gb:cli-model:text-left gb:cli-model:text-xs gb:cli-model:text-ink gb:cli-model:hover:bg-accent-fill gb:cli-model:focus-visible:bg-accent-fill gb:cli-model:focus-visible:outline-2 gb:cli-model:focus-visible:outline-accent gb:cli-model:aria-selected:font-semibold gb:cli-model:aria-selected:text-accent">
                <span title={option.label} class="gb:cli-model:min-w-0 gb:cli-model:flex-1 gb:cli-model:truncate">{option.label}</span>{#if option.value === picker.value}<span aria-hidden="true" class="gb:cli-model:text-success-ink">✓</span>{/if}
              </button>
            {/each}
          </div>
        </div>
      </details>
    </div>
  {/each}
  {#if snapshot.note}<small class="gb:cli-model:col-span-full gb:cli-model:text-[10.5px] gb:cli-model:leading-relaxed gb:cli-model:text-secondary">{snapshot.note}</small>{/if}
  {#if snapshot.error}<div role="status" class="gb:cli-model:col-span-full gb:cli-model:text-xs gb:cli-model:text-danger-ink">{snapshot.error}</div>{/if}
</div>
