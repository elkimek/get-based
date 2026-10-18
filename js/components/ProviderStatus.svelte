<script lang="ts">
  import type { ProviderStatusState, ProviderStatusOptions } from '../provider-status-contract.js';
  import { PROVIDER_TONES } from '../provider-settings-classes.js';
  let { status, id, compact = false, emphasis = false, monospace = false, announce = true }: { status: ProviderStatusState; id?: string } & ProviderStatusOptions = $props();
  export function setStatus(next: ProviderStatusState): void { status = next; }
</script>
<span {id} data-provider-status-view data-cloud-provider-settings-view role={announce ? 'status' : undefined} class={(compact ? 'gb:cloud-provider:text-[10px] gb:cloud-provider:leading-[1.5] ' : '') + (status.tone === 'primary' ? 'gb:cloud-provider:text-ink' : PROVIDER_TONES[status.tone]) + (emphasis ? ' gb:cloud-provider:font-semibold gb:cloud-provider:text-xs' : '') + (monospace ? ' gb:cloud-provider:font-mono' : '')}>{status.text}</span>
