<script lang="ts">
  import type { FoodContaminantSection } from '../context-food-contaminants-model.js';
  let { sections, current, close, discuss }: { sections: FoodContaminantSection[]; current(): boolean; close(): void; discuss(): void } = $props();
  const focus = 'gb:context-form:focus-visible:outline-2 gb:context-form:focus-visible:outline-accent gb:context-form:focus-visible:outline-offset-2';
  const button = `gb:context-form:min-h-11 gb:context-form:rounded-control gb:context-form:border gb:context-form:border-line gb:context-form:px-3 gb:context-form:py-2 gb:context-form:font-body gb:context-form:text-[13px] gb:context-form:leading-snug gb:context-form:cursor-pointer ${focus}`;
  const link = `gb:context-form:inline-flex gb:context-form:min-h-11 gb:context-form:items-center gb:context-form:text-link-ink gb:context-form:underline gb:context-form:underline-offset-2 ${focus}`;
</script>
<div data-context-form-view="foodContaminants" data-food-contaminants-view class="gb:context-form:min-w-0 gb:context-form:[overflow-wrap:anywhere]">
  <header class="gb:context-form:sticky gb:context-form:top-0 gb:context-form:z-[8] gb:context-form:flex gb:context-form:items-start gb:context-form:justify-between gb:context-form:gap-4 gb:context-form:border-b gb:context-form:border-line gb:context-form:bg-dialog-head gb:context-form:px-[26px] gb:context-form:py-5 gb:context-form:max-[720px]:px-[18px]">
    <div><div class="gb:context-form:text-[10px] gb:context-form:uppercase gb:context-form:tracking-wider gb:context-form:text-secondary">Profile context</div><h2 id="context-food-contaminants-title" class="gb:context-form:m-0 gb:context-form:text-xl gb:context-form:font-semibold gb:context-form:text-ink">Food Contaminant Signals</h2></div>
    <button type="button" aria-label="Close Food Contaminant Signals" class={`gb:context-form:min-h-11 gb:context-form:min-w-11 gb:context-form:shrink-0 gb:context-form:border-0 gb:context-form:bg-transparent gb:context-form:text-2xl gb:context-form:text-secondary gb:context-form:cursor-pointer ${focus}`} onclick={() => { if (current()) close(); }}>×</button>
  </header>
  <div class="gb:context-form:px-[26px] gb:context-form:pt-[22px] gb:context-form:max-[720px]:px-[18px]">
    <p class="gb:context-form:mt-0 gb:context-form:mb-5 gb:context-form:text-[13px] gb:context-form:leading-normal gb:context-form:text-secondary">Based on foods mentioned in your diet card, cross-referenced against public contaminant databases.</p>
    {#each sections as section}<section aria-labelledby={`food-signals-${section.type}`} class="gb:context-form:mb-5">
      <h3 id={`food-signals-${section.type}`} class="gb:context-form:mb-2 gb:context-form:text-sm gb:context-form:font-semibold gb:context-form:text-ink">{section.title}</h3>
      <ul class="gb:context-form:m-0 gb:context-form:list-none gb:context-form:p-0">{#each section.items as item}<li class={`gb:context-form:mb-1.5 gb:context-form:rounded-control gb:context-form:border-l-[3px] gb:context-form:bg-surface gb:context-form:px-3 gb:context-form:py-2 gb:context-form:text-[13px] gb:context-form:leading-normal gb:context-form:text-ink ${section.caution ? 'gb:context-form:border-warning' : 'gb:context-form:border-success'}`}>
        {#if section.caution}<span aria-hidden="true">⚠️ </span>{/if}{item.warning} {#if item.href}<a href={item.href} target="_blank" rel="noopener" class={`${link} gb:context-form:ml-1 gb:context-form:text-xs`}>{item.source}</a>{:else}<span class="gb:context-form:text-secondary">{item.source}</span>{/if}
      </li>{/each}</ul>
    </section>{/each}
    <p class="gb:context-form:my-3 gb:context-form:text-center gb:context-form:text-xs gb:context-form:leading-normal gb:context-form:text-secondary">Sources: <a href="https://www.ewg.org/foodnews/" target="_blank" rel="noopener" class={link}>EWG Shopper's Guide 2025</a> · <a href="https://www.plasticlist.org/report" target="_blank" rel="noopener" class={link}>PlasticList</a></p>
    <footer class="gb:context-form:sticky gb:context-form:bottom-0 gb:context-form:z-[7] gb:context-form:-mx-[26px] gb:context-form:mt-[22px] gb:context-form:flex gb:context-form:flex-wrap gb:context-form:gap-2 gb:context-form:border-t gb:context-form:border-line gb:context-form:bg-secondary-surface gb:context-form:px-[26px] gb:context-form:pt-3.5 gb:context-form:pb-[calc(14px+env(safe-area-inset-bottom))] gb:context-form:max-[720px]:-mx-[18px] gb:context-form:max-[720px]:px-[18px]">
      <button type="button" class={`${button} gb:context-form:border-accent gb:context-form:bg-accent gb:context-form:text-on-accent`} onclick={() => { if (current()) discuss(); }}>Discuss with AI</button>
      <button type="button" class={`${button} gb:context-form:bg-surface gb:context-form:text-ink gb:context-form:hover:bg-hover`} onclick={() => { if (current()) close(); }}>Close</button>
    </footer>
  </div>
</div>
