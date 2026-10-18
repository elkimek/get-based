<script lang="ts">
  import { projectAttestationBadge, type AttestationBadgeProps } from '../chat-attestation-presentation.js';
  let { attestation, view, footnote = false }: AttestationBadgeProps = $props();
  const badge = $derived(view === undefined ? projectAttestationBadge(attestation) : view);
</script>
{footnote ? ' · ' : ' '}{#if badge}<button type="button" data-chat-attestation-view class="e2ee-attestation-badge gb:attestation:inline-flex gb:attestation:items-baseline gb:attestation:rounded gb:attestation:cursor-help gb:attestation:border-0 gb:attestation:bg-transparent gb:attestation:p-0 gb:attestation:[font:inherit] gb:attestation:text-inherit gb:attestation:focus-visible:outline-2 gb:attestation:focus-visible:outline-accent gb:attestation:focus-visible:outline-offset-2" aria-expanded="false" aria-label={badge.tooltip} data-attestation-tooltip={badge.tooltip}>🔒&nbsp;<span style:color={`color-mix(in srgb, ${badge.color} 50%, var(--text-primary))`} class="gb:attestation:font-bold">{badge.mark}</span>{#if footnote}{' encrypted'}{/if}</button>{:else}🔒{#if footnote} e2ee{/if}{/if}
