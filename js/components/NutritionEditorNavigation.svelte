<script lang="ts">
  import { button, copy, heading, focus } from '../nutrition-view-classes.js';
  let { part }: { part: 'tabs' | 'records' } = $props();
</script>
{#if part === 'tabs'}
  {#each [['meal-photo', 'Photo'], ['nutrition-label', 'Nutrition label'], ['manual', 'Manual']] as [kind, label]}
    <button data-nutrition-view type="button" role="tab" aria-selected={kind === 'meal-photo'} data-nutrition-action="set-kind" data-nutrition-kind={kind}
      class={`${kind === 'meal-photo' ? 'is-active' : ''} gb:nutrition:[@media(pointer:coarse)]:min-h-[45px] gb:nutrition:min-w-0 gb:nutrition:cursor-pointer gb:nutrition:rounded-md gb:nutrition:border-0 gb:nutrition:bg-transparent gb:nutrition:px-[11px] gb:nutrition:py-[9px] gb:nutrition:font-body gb:nutrition:text-xs gb:nutrition:text-secondary gb:nutrition:aria-selected:bg-hover gb:nutrition:aria-selected:font-bold gb:nutrition:aria-selected:text-ink gb:nutrition:disabled:cursor-wait gb:nutrition:disabled:opacity-60 ${focus}`}> {label} </button>
  {/each}
{:else}
  <div data-nutrition-view data-nutrition-records class={`nutrition-section-title ${heading} gb:nutrition:mb-2`}>Your meal records</div>
  <p data-nutrition-view class={`nutrition-meal-records-copy ${copy} gb:nutrition:mt-0 gb:nutrition:mb-2.5`}>Browse every saved meal in the chronological Meals view.</p>
  <button data-nutrition-view type="button" data-nutrition-action="open-history" class={`import-btn import-btn-secondary ${button}`}>Browse meals</button>
{/if}
