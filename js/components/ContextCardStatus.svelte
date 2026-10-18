<script lang="ts">
  import { ownContextChild } from '../context-child-ownership.js';
  import { onMount, flushSync } from 'svelte';
  import { contextCardStatus, contextCardStatusTicket, emptyContextCardStatus, subscribeContextCardStatus } from '../context-card-status.js';
  import type { ContextCardStatusSlot } from '../context-card-status.js';
  import { CONTEXT_BODY, CONTEXT_FOCUS } from '../context-card-catalog-classes.js';
  let { cardKey, slot, renderId, ticket, localSummary = '', cardLabel = '' }: { cardKey: string; slot: ContextCardStatusSlot; renderId: string; ticket: string; localSummary?: string; cardLabel?: string } = $props();
  let model = $state.raw(emptyContextCardStatus());
  let root = $state<HTMLElement>();
  onMount(() => {
    const host = root?.closest('[data-context-status-host]');
    const releaseHost = host ? ownContextChild(host) : () => {};
    const update = (owner: string, key: string, value: typeof model) => {
      if (root?.isConnected && owner === ticket && key === cardKey && contextCardStatusTicket() === ticket) flushSync(() => { model = value; });
    };
    update(ticket, cardKey, contextCardStatus(cardKey));
    const stop = subscribeContextCardStatus(update);
    return () => { stop(); releaseHost(); };
  });
</script>
{#if slot === 'indicator'}
  <span bind:this={root} class="ctx-health-indicator gb:context-catalog:flex-[0_0_auto] gb:context-catalog:inline-flex gb:context-catalog:items-center gb:context-catalog:gap-[5px] gb:context-catalog:text-muted gb:context-catalog:text-[11px] gb:context-catalog:font-[650] gb:context-catalog:[&[hidden]]:hidden" id={`${renderId}-health-${cardKey}`} hidden={!model.visible} aria-label={model.visible ? `AI assessment: ${model.label}` : undefined}>
    <span class="ctx-health-dot ctx-health-dot-{model.color} {model.loading ? 'ctx-health-dot-shimmer' : ''} gb:context-catalog:inline-block gb:context-catalog:size-2.5 gb:context-catalog:rounded-full gb:context-catalog:shrink-0 gb:context-catalog:transition-[background,box-shadow] gb:context-catalog:duration-300 gb:context-catalog:motion-reduce:transition-none {model.loading ? '' : model.color === 'green' ? 'gb:context-catalog:bg-success gb:context-catalog:shadow-[0_0_6px_rgba(52,211,153,0.5)]' : model.color === 'yellow' ? 'gb:context-catalog:bg-[var(--yellow)] gb:context-catalog:shadow-[0_0_6px_rgba(251,191,36,0.5)]' : model.color === 'red' ? 'gb:context-catalog:bg-danger gb:context-catalog:shadow-[0_0_6px_rgba(248,113,113,0.5)]' : 'gb:context-catalog:bg-[var(--text-muted)] gb:context-catalog:opacity-40'}" id={`${renderId}-dot-${cardKey}`} title={model.visible ? model.label : undefined} aria-hidden="true"></span>
    <span class="ctx-health-label gb:context-catalog:sr-only" id={`${renderId}-health-label-${cardKey}`}>{model.label}</span>
  </span>
{:else if slot === 'summary'}
  <div bind:this={root} class="context-card-body {CONTEXT_BODY}" id={`${renderId}-summary-${cardKey}`} data-summary-source={model.summarySource} data-local-summary={localSummary}>{model.summary ?? localSummary}</div>
{:else if slot === 'insight'}
  <div bind:this={root} class="ctx-ai-summary-slot gb:context-catalog:mt-auto gb:context-catalog:max-h-0 gb:context-catalog:overflow-hidden {model.insight ? 'gb:context-catalog:min-h-[60px] gb:context-catalog:max-h-[60px] gb:context-catalog:box-border gb:context-catalog:pt-2 gb:context-catalog:overflow-visible' : ''}">
    <div class="ctx-ai-summary {model.insight ? 'ctx-ai-summary-visible gb:context-catalog:min-h-[52px] gb:context-catalog:max-h-[52px] gb:context-catalog:box-border gb:context-catalog:opacity-100 gb:context-catalog:pt-2 gb:context-catalog:border-t-[color-mix(in_srgb,var(--border)_82%,transparent)]' : 'gb:context-catalog:max-h-0 gb:context-catalog:opacity-0 gb:context-catalog:pt-0 gb:context-catalog:border-transparent'} {model.insightColor ? `ctx-ai-summary-${model.insightColor}` : ''} gb:context-catalog:block gb:context-catalog:text-[12px] gb:context-catalog:leading-[1.45] gb:context-catalog:overflow-hidden gb:context-catalog:transition-[max-height,opacity] gb:context-catalog:duration-200 gb:context-catalog:motion-reduce:transition-none gb:context-catalog:border-t gb:context-catalog:mt-0 {model.insightColor === 'green' ? 'gb:context-catalog:text-success' : model.insightColor === 'yellow' ? 'gb:context-catalog:text-[var(--yellow)]' : model.insightColor === 'red' ? 'gb:context-catalog:text-danger' : 'gb:context-catalog:text-muted'}" id={`${renderId}-ai-${cardKey}`} data-severity={model.insight ? model.severity : undefined} data-insight-label={model.insight ? model.insightLabel : undefined} aria-label={model.insight ? model.insightAria : undefined}>
      {#if model.insight}<span aria-hidden="true" class="gb:context-catalog:block gb:context-catalog:mb-0.5 gb:context-catalog:text-muted gb:context-catalog:text-[9px] gb:context-catalog:font-extrabold gb:context-catalog:tracking-[0.06em] gb:context-catalog:uppercase gb:context-catalog:not-italic">{model.insightLabel} · {model.severity}</span>{/if}{model.insight}
    </div>
  </div>
{:else}
  <span bind:this={root} class="context-card-tips-host gb:context-catalog:relative gb:context-catalog:z-[2]" id={`${renderId}-tips-${cardKey}`}>
    {#if model.tips}<button type="button" class="ctx-tips-badge {CONTEXT_FOCUS} gb:context-catalog:text-[9px] gb:context-catalog:font-semibold gb:context-catalog:tracking-[0.05em] gb:context-catalog:text-accent gb:context-catalog:py-px gb:context-catalog:px-[5px] gb:context-catalog:rounded-[4px] gb:context-catalog:border gb:context-catalog:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] gb:context-catalog:whitespace-nowrap gb:context-catalog:shrink-0 gb:context-catalog:cursor-pointer gb:context-catalog:transition-colors gb:context-catalog:duration-150 gb:context-catalog:motion-reduce:transition-none gb:context-catalog:ml-1.5 gb:context-catalog:align-middle gb:context-catalog:bg-transparent gb:context-catalog:[font-family:inherit] gb:context-catalog:[line-height:inherit] gb:context-catalog:hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] gb:context-catalog:hover:border-accent gb:context-catalog:[@media(pointer:coarse)]:min-h-11" title="Lifestyle tips for this area" aria-label={`Lifestyle tips for ${cardLabel || cardKey}`} data-context-card-action="open-card-tips" data-context-card-key={cardKey} data-context-status-ticket={ticket}>Tips</button>{/if}
  </span>
{/if}
