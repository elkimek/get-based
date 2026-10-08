<script lang="ts">
  import type { ChannelDetailView } from '../light-channel-presentation.js';
  import { channelDetailClasses as classes } from '../light-channel-classes.js';
  let { research }: { research: NonNullable<ChannelDetailView['research']> } = $props();
</script>
<details class={classes('light-channel-cit')}>
  <summary class={classes('research-summary')}>Research &amp; sources</summary>
  <p class={classes('light-channel-cit-spec')}><strong class={classes('research-label')}>Spectrum:</strong> {research.spectrum}</p>
  <ul class={classes('light-channel-cit-refs')}>
    {#each research.refs as ref}
      <li class={classes('research-item')}><a class={classes('research-link')} href={ref.href} target="_blank" rel="noopener">{ref.cite}</a>
        {#if ref.why}<div class={classes('light-channel-cit-why')}>{ref.why}</div>{/if}
      </li>
    {/each}
  </ul>
  <div class={classes('light-channel-cit-suggest')}><a class={classes('research-suggest-link')} href={research.suggestURL} target="_blank" rel="noopener noreferrer">Suggest a better study →</a></div>
</details>
