<script lang="ts">
  import { chatToolActivityLabel, type ChatToolActivity } from '../../shared/chat-tool-activity.js';
  import ChatMessageIcon from './ChatMessageIcon.svelte';
  let { activity, live = false }: { activity?: ChatToolActivity[] | undefined; live?: boolean } = $props();
  let details = $state<HTMLDetailsElement>();
  $effect(() => { if (!live && details) details.open = false; });
  const active = $derived(activity?.findLast(step => step.status === 'running'));
  const issue = $derived(activity?.find(step => step.status === 'failed') || activity?.find(step => step.status === 'interrupted'));
  const summary = $derived(active ? chatToolActivityLabel(active).replace(/^(Read|Prepare|Find|Search|Open|Check) /, word => ({ 'Read ': 'Reading ', 'Prepare ': 'Preparing ', 'Find ': 'Finding ', 'Search ': 'Searching ', 'Open ': 'Opening ', 'Check ': 'Checking ' } as Record<string, string>)[word] || word) + '…'
    : live ? 'Preparing response…' : issue ? issue.status === 'failed' ? 'Action needs attention' : 'Action interrupted' : `${activity?.length} ${activity?.length === 1 ? 'action' : 'actions'} completed`);
</script>
{#if activity?.length}
  <details class="chat-tool-activity" data-chat-tool-activity aria-label="App activity" bind:this={details}>
    <summary>
      <span class="chat-tool-glyph" class:chat-tool-running={live} aria-hidden="true"><ChatMessageIcon name={live ? 'refresh' : issue ? 'x' : 'check'} /></span>
      <span class="chat-tool-summary" role={live ? 'status' : undefined} aria-live={live ? 'polite' : undefined}>{summary}</span>
      <span class="chat-tool-chevron" aria-hidden="true">›</span>
    </summary>
    <ol>
      {#each activity as step (step.id)}
        <li data-tool-status={step.status}>
          <span class="chat-tool-glyph" aria-hidden="true"><ChatMessageIcon name={step.status === 'completed' ? 'check' : step.status === 'running' ? 'refresh' : 'x'} /></span>
          <span>{chatToolActivityLabel(step)}<span class="chat-tool-step-status">{step.status === 'running' ? 'Running' : step.status === 'completed' ? 'Completed' : step.status === 'failed' ? 'Failed' : 'Interrupted'}</span></span>
        </li>
      {/each}
    </ol>
    <p>Proposed changes still require Apply.</p>
  </details>
{/if}
