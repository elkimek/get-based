<script lang="ts">
  import type { AgentDraftCard } from '../agent-draft-presentation.js';
  import { DRAFT_CONTROL } from '../chat-message-actions-classes.js';
  let { cards, index }: { cards: AgentDraftCard[]; index?: string | undefined } = $props();
</script>
{#each cards as card}
  <section class="chat-agent-draft chat-agent-draft-{card.status} gb:message-actions:mt-3 gb:message-actions:p-3 gb:message-actions:border gb:message-actions:border-[color-mix(in_srgb,var(--accent)_38%,var(--border))] gb:message-actions:rounded-[10px] gb:message-actions:bg-[color-mix(in_srgb,var(--accent)_7%,var(--bg-card))] gb:message-actions:text-ink gb:message-actions:[&.chat-agent-draft-discarded]:opacity-[.72] gb:message-actions:[&.chat-agent-draft-applying]:opacity-70" aria-label="Agent-proposed change" data-chat-agent-draft-view>
    <div class="chat-agent-draft-heading gb:message-actions:flex gb:message-actions:items-center gb:message-actions:justify-between gb:message-actions:gap-2.5 gb:message-actions:text-xs gb:message-actions:font-bold"><span>Proposed change</span><small class="gb:message-actions:text-secondary gb:message-actions:text-[10px] gb:message-actions:uppercase gb:message-actions:tracking-[.04em]">Review required</small></div>
    <p class="gb:message-actions:my-[7px] gb:message-actions:text-xs gb:message-actions:[overflow-wrap:anywhere]">{card.summary}</p>
    <div class="chat-agent-draft-details gb:message-actions:grid gb:message-actions:gap-1">
      {#each card.rows as row}<div class="chat-agent-draft-row gb:message-actions:grid gb:message-actions:grid-cols-[minmax(72px,.35fr)_minmax(0,1fr)] gb:message-actions:max-[480px]:grid-cols-1 gb:message-actions:max-[480px]:gap-y-0.5 gb:message-actions:gap-[9px] gb:message-actions:text-[11px]"><span class="gb:message-actions:text-secondary gb:message-actions:[overflow-wrap:anywhere]">{row.label}</span><strong class="gb:message-actions:font-medium gb:message-actions:whitespace-pre-wrap gb:message-actions:[overflow-wrap:anywhere]">{row.value}</strong></div>{/each}
    </div>
    {#if card.status === 'pending'}
      <div class="chat-agent-draft-controls gb:message-actions:flex gb:message-actions:flex-wrap gb:message-actions:gap-[7px] gb:message-actions:mt-2.5">
        <button type="button" class="chat-agent-draft-apply {DRAFT_CONTROL} gb:message-actions:bg-accent gb:message-actions:text-on-accent gb:message-actions:border-accent" data-chat-message-action="apply-agent-draft" data-chat-message-index={index} data-chat-message-draft-id={card.id}>Apply</button>
        <button type="button" class="chat-agent-draft-discard {DRAFT_CONTROL} gb:message-actions:bg-surface gb:message-actions:text-secondary" data-chat-message-action="discard-agent-draft" data-chat-message-index={index} data-chat-message-draft-id={card.id}>Discard</button>
      </div>
    {:else}
      <div class="chat-agent-draft-status chat-agent-draft-status-{card.status} gb:message-actions:mt-[9px] gb:message-actions:text-[11px] gb:message-actions:font-semibold gb:message-actions:text-secondary">{card.status === 'applying' ? 'Applying…' : card.status === 'applied' ? 'Applied to getbased' : card.status === 'discarded' ? 'Discarded' : 'Outcome unconfirmed — check your data before proposing this change again.'}</div>
    {/if}
  </section>
{/each}
