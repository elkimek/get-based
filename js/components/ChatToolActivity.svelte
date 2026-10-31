<script lang="ts">
  import { chatToolActivityLabel, type ChatToolActivity } from '../../shared/chat-tool-activity.js';
  import ChatMessageIcon from './ChatMessageIcon.svelte';
  let { activity, live = false }: { activity?: ChatToolActivity[] | undefined; live?: boolean } = $props();
  const active = $derived(activity?.findLast(step => step.status === 'running'));
</script>
{#if activity?.length}
  <details class="chat-tool-activity" data-chat-tool-activity aria-label="Tool activity">
    <summary >
      <span class:chat-tool-running={live} aria-hidden="true"><ChatMessageIcon name={live ? 'refresh' : activity.some(step => step.status !== 'completed') ? 'x' : 'check'} /></span>
      <span role={live ? "status" : undefined} aria-live={live ? "polite" : undefined}>{active ? chatToolActivityLabel(active) + '…' : live ? 'Preparing response…' : 'App tool activity'} ({activity.length})</span>
    </summary>
    <ol >
      {#each activity as step (step.id)}
        <li data-tool-status={step.status} >
          <span  aria-hidden="true"><ChatMessageIcon name={step.status === 'completed' ? 'check' : step.status === 'running' ? 'refresh' : 'x'} /></span>
          {chatToolActivityLabel(step)} · {step.status === 'running' ? 'Running' : step.status === 'completed' ? 'Completed' : step.status === 'failed' ? 'Failed' : 'Interrupted'}
        </li>
      {/each}
    </ol>
    <p >Tool completion does not save proposed changes. Review cards require Apply.</p>
  </details>
{/if}

{#if !activity?.length && (live || activity !== undefined)}
  <p class="chat-tool-activity-empty" role={live ? 'status' : undefined}>{live ? 'Preparing response…' : 'No app tools used'}</p>
{/if}
