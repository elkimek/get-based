<script lang="ts">
  import type { ConditionsView } from '../light-conditions-presentation.js';
  import { conditionsClasses as c } from '../light-conditions-classes.js';
  let { view: v, compact = false }: { view: ConditionsView; compact?: boolean } = $props();
</script>
<span class={c(`conditions-now-source${compact ? '-compact' : ''} ${v.sourceStatusClass}`)} data-conditions-tooltip={compact ? v.compactSourceTooltip : v.sourceTooltip}>
  <span class={c('conditions-now-source-dot')}></span>
  {#if !compact}{v.sourceStatusLabel} · via {/if}
  {#each v.attribution.links as link, index}{#if index}{' + '}{/if}<a class={c('conditions-now-attribution')} href={link.href} target="_blank" rel="noopener">{link.label}</a>{:else}{v.attribution.fallbackLabel}{/each}
  {#if !compact} · valid {v.freshnessLabel}{/if}
</span>
