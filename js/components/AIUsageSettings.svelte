<script lang="ts">
  import { untrack } from 'svelte';
  import type { AIUsageSnapshot } from '../settings-records-contract.js';
  import { RECORD_USAGE_BUTTON } from '../settings-records-classes.js';
  let { initial }: { initial: AIUsageSnapshot } = $props();
  let snapshot = $state(untrack(() => initial));
  export function refresh(next: AIUsageSnapshot): void { snapshot = next; }
</script>
<div class="gb:records:text-[13px] gb:records:text-secondary gb:records:leading-[2]">
  {#each [snapshot.profile, snapshot.global] as usage}
    <div><strong>{usage.label}</strong>: {usage.cost} · {usage.requests} · {usage.tokens} tokens</div>
  {/each}
</div>
{#if snapshot.canReset}
  <button type="button" class={RECORD_USAGE_BUTTON} data-settings-action="reset-profile-usage">Reset profile usage</button>
{/if}
