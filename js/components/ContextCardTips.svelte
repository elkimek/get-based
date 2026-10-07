<script lang="ts">
  import type { ContextTipsView } from '../context-card-tips-presentation.js';
  let { view }: { view: ContextTipsView } = $props();
  const section = 'ctx-tip-slot gb:context-tips:mb-4 gb:context-tips:pb-4 gb:context-tips:border-b gb:context-tips:border-line gb:context-tips:last:mb-0 gb:context-tips:last:pb-0 gb:context-tips:last:border-0';
  const label = 'ctx-tip-slot-label gb:context-tips:text-[13px] gb:context-tips:font-semibold gb:context-tips:text-ink gb:context-tips:mb-2';
  const tier = 'ctx-tip-tier gb:context-tips:mb-2 gb:context-tips:last:mb-0';
  const tierLabel = 'ctx-tip-tier-label gb:context-tips:text-[10px] gb:context-tips:font-semibold gb:context-tips:uppercase gb:context-tips:tracking-[0.05em] gb:context-tips:text-secondary gb:context-tips:mb-1';
  const item = 'ctx-tip-item gb:context-tips:text-[13px] gb:context-tips:leading-[1.6] gb:context-tips:py-0.5';
  const hint = 'rec-tier-hint gb:context-tips:font-normal gb:context-tips:normal-case gb:context-tips:tracking-normal gb:context-tips:opacity-100 gb:context-tips:italic';
</script>
<section data-context-tips-view class="gb:context-tips:min-w-0 gb:context-tips:[overflow-wrap:anywhere]" aria-label={`${view.label} tips`}>
  <button type="button" class="modal-close gb:context-tips:text-secondary gb:context-tips:focus-visible:outline-2 gb:context-tips:focus-visible:outline-accent gb:context-tips:focus-visible:outline-offset-2 gb:context-tips:[@media(pointer:coarse)]:min-h-11 gb:context-tips:[@media(pointer:coarse)]:min-w-11" data-rec-action="close-modal" aria-label="Close">×</button>
  <h2 class="ctx-tips-modal-header gb:context-tips:text-base gb:context-tips:font-semibold gb:context-tips:text-ink gb:context-tips:mt-0 gb:context-tips:mb-4 gb:context-tips:pr-12"><span aria-hidden="true">{view.emoji}</span> {view.label} — Tips</h2>
  <div class="ctx-tips-modal-body">
    {#if view.genetics.length}
      <div class={section}>
        <div class={label}>Your Genetics</div>
        {#each view.genetics as finding}
          <div class={`${item} ${finding.avoid ? 'ctx-tip-avoid gb:context-tips:text-[var(--orange)] gb:context-tips:[[data-theme=light]_&]:text-warning-ink' : 'ctx-tip-free gb:context-tips:text-success-ink'}`}>
            <span aria-hidden="true">{finding.avoid ? '⚠' : '→'}</span> <strong>{finding.gene}</strong> {finding.genotype} — {finding.text}
            <span class="rec-dna-evidence gb:context-tips:inline-flex gb:context-tips:ml-1 gb:context-tips:py-px gb:context-tips:px-[5px] gb:context-tips:border gb:context-tips:border-line gb:context-tips:rounded-full gb:context-tips:text-secondary gb:context-tips:text-[9px] gb:context-tips:font-bold gb:context-tips:whitespace-normal">Evidence · {finding.evidence} · {finding.relevance}</span>
            {#if finding.study}<a href={finding.study} target="_blank" rel="noopener" class="gb:context-tips:text-[11px] gb:context-tips:text-link-ink gb:context-tips:opacity-100 gb:context-tips:focus-visible:outline-2 gb:context-tips:focus-visible:outline-accent">study</a>{/if}
          </div>
        {/each}
      </div>
    {/if}
    {#each view.sections as slot}
      <div class={section}>
        <div class={label}>{slot.label}</div>
        {#if slot.actions.length}
          <div class={tier}>
            <div class={tierLabel}>Lifestyle ideas <span class={hint}>general information</span></div>
            {#each slot.actions as action}<div class={`${item} ctx-tip-free gb:context-tips:text-success-ink`}><span aria-hidden="true" class="gb:context-tips:opacity-50">→ </span>{action}</div>{/each}
          </div>
        {/if}
        {#if slot.forms.length}
          <div class={tier}>
            <div class={tierLabel}>Tools &amp; supplements <span class={hint}>options to review</span></div>
            <div class={`${item} ctx-tip-form gb:context-tips:text-xs gb:context-tips:text-secondary gb:context-tips:italic gb:context-tips:mt-0.5`}>{slot.forms.join(' · ')}</div>
          </div>
        {/if}
      </div>
    {/each}
    {#if view.environment}
      <div class="ctx-tip-emf-nudge gb:context-tips:text-xs gb:context-tips:text-secondary gb:context-tips:mt-3 gb:context-tips:py-2 gb:context-tips:px-2.5 gb:context-tips:bg-[rgba(99,102,241,0.05)] gb:context-tips:border-l-[3px] gb:context-tips:border-accent gb:context-tips:rounded-r-[var(--radius)] gb:context-tips:leading-[1.5]">
        <span aria-hidden="true">💡</span> {view.environment.text}
        <button type="button" data-rec-action="open-emf-assessment" data-umami-event={view.environment.event} class="gb:context-tips:bg-transparent gb:context-tips:border-0 gb:context-tips:p-0 gb:context-tips:[font:inherit] gb:context-tips:text-left gb:context-tips:cursor-pointer gb:context-tips:text-link-ink gb:context-tips:no-underline gb:context-tips:font-medium gb:context-tips:hover:underline gb:context-tips:focus-visible:outline-2 gb:context-tips:focus-visible:outline-accent">{view.environment.action}</button>
      </div>
    {/if}
  </div>
  <div class="rec-mini-disclaimer gb:context-tips:text-[9px] gb:context-tips:text-secondary gb:context-tips:mt-3">General information only — not individualized medical advice or a care plan. Do not start, stop, or change medication or supplements based only on these tips. Discuss relevant options with a qualified healthcare professional.</div>
</section>
