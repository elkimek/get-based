<script lang="ts">
  import type { LifestyleLightSetup } from '../context-lifestyle-form-model.js';
  let { view, disabled, activate }: { view: LifestyleLightSetup; disabled: boolean; activate(): void } = $props();
  const borders: Record<number, string> = {
    0: 'gb:context-form:border-success', 1: 'gb:context-form:border-line',
    2: 'gb:context-form:border-warning', 3: 'gb:context-form:border-[var(--orange)]', 4: 'gb:context-form:border-danger'
  };
</script>
<section data-context-light-setup aria-labelledby="context-light-setup-title" class="gb:context-form:mb-4 gb:context-form:text-xs gb:context-form:text-secondary">
  <div class="gb:context-form:flex gb:context-form:flex-wrap gb:context-form:items-center gb:context-form:justify-between gb:context-form:gap-2 gb:context-form:mb-2.5">
    <h3 id="context-light-setup-title" class="gb:context-form:m-0 gb:context-form:text-[11px] gb:context-form:font-semibold gb:context-form:uppercase gb:context-form:tracking-[0.05em] gb:context-form:text-secondary">Light lens setup</h3>
    <button type="button" {disabled} onclick={activate} class="gb:context-form:pointer-coarse:min-h-11 gb:context-form:max-[720px]:min-h-11 gb:context-form:border-0 gb:context-form:bg-transparent gb:context-form:px-0 gb:context-form:py-1 gb:context-form:text-xs gb:context-form:[line-height:normal] gb:context-form:font-medium gb:context-form:text-link-ink gb:context-form:cursor-pointer gb:context-form:hover:bg-hover gb:context-form:focus-visible:outline-2 gb:context-form:focus-visible:outline-accent gb:context-form:focus-visible:outline-offset-2 gb:context-form:disabled:cursor-wait" aria-label={view.populated ? 'Edit Light lens setup' : 'Set up Light lens'}>{view.populated ? 'Edit →' : 'Set up Light lens →'}</button>
  </div>
  {#if view.populated}
    <dl class="gb:context-form:m-0 gb:context-form:grid gb:context-form:grid-cols-2 gb:context-form:gap-x-3.5 gb:context-form:gap-y-1.5 gb:context-form:max-[600px]:grid-cols-1">
      {#each view.rows as row}
        <div class="gb:context-form:flex gb:context-form:items-baseline gb:context-form:gap-2 gb:context-form:min-w-0"><dt class="gb:context-form:shrink-0">{row.label}</dt><dd class="gb:context-form:m-0 gb:context-form:min-w-0 gb:context-form:font-medium gb:context-form:text-ink">{row.value}</dd></div>
      {/each}
      <div class="gb:context-form:flex gb:context-form:items-baseline gb:context-form:gap-2"><dt class="gb:context-form:shrink-0">Light lifestyle</dt><dd class="gb:context-form:m-0">{#if view.burden}<span data-light-burden-tier={view.burden.tier ?? 'skipped'} class={`gb:context-form:inline-block gb:context-form:rounded-full gb:context-form:border gb:context-form:bg-secondary-surface gb:context-form:px-2 gb:context-form:py-0.5 gb:context-form:text-[11px] gb:context-form:font-semibold gb:context-form:text-ink ${view.burden.tier === null ? 'gb:context-form:border-line' : borders[view.burden.tier] || 'gb:context-form:border-line'}`}>{view.burden.label}</span>{:else}—{/if}</dd></div>
    </dl>
    <p class="gb:context-form:mb-0 gb:context-form:mt-2 gb:context-form:border-t gb:context-form:border-line gb:context-form:pt-2 gb:context-form:text-[11px] gb:context-form:leading-normal">Skin type drives UV tolerance and vitamin D math. Home lighting + eyewear shape your indoor light dose. Lifestyle frames the AI's interpretation everywhere.</p>
  {:else}
    <p class="gb:context-form:m-0 gb:context-form:leading-normal">Not set yet — covers skin type, home lighting, eyewear, and indoor/outdoor lifestyle.</p>
  {/if}
</section>
