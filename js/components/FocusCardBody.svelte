<script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
  import type {FocusCardBodyView} from '../focus-card-presentation.js';
  let {view}: {view: FocusCardBodyView} = $props();
  let override = $state<FocusCardBodyView | undefined>();
  let current = $derived(override ?? view);
  let streamElement: HTMLSpanElement | null = $state(null);
  export function setView(next: FocusCardBodyView): void { override = next; }
  export function getStreamElement(): HTMLSpanElement | null { return streamElement; }
</script><svelte:options preserveWhitespace />{#if current.kind === 'shimmer'}<span class="focus-card-shimmer"></span>{:else if current.kind === 'markdown'}<span class="focus-card-text">{@html current.markdown}</span>{:else if current.kind === 'message'}<span class="focus-card-text" style={componentStaticStyles.muted}>{current.text}</span>{:else}<span class="focus-card-text" bind:this={streamElement}>{current.text}</span>{/if}
