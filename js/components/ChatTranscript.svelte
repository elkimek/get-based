<script lang="ts">
  import ChatMessage from './ChatMessage.svelte';
  import ChatPersonaLabel from './ChatPersonaLabel.svelte';
  import type { ChatTranscriptView } from '../chat-transcript-presentation.js';
  let view = $state.raw<ChatTranscriptView>({ entries: [], earlier: 0, fork: null });
  export function setView(next: ChatTranscriptView): void { view = next; }
</script>
<div data-chat-transcript-view class="gb:transcript:contents">
  {#if view.fork}
    <div class="chat-fork-notice gb:transcript:self-center gb:transcript:flex gb:transcript:flex-wrap gb:transcript:items-center gb:transcript:justify-center gb:transcript:gap-2 gb:transcript:max-w-[min(100%,560px)] gb:transcript:py-1.5 gb:transcript:px-2.5 gb:transcript:border gb:transcript:border-line gb:transcript:rounded-full gb:transcript:bg-surface gb:transcript:text-secondary gb:transcript:text-[11px] gb:transcript:leading-[1.3]" role="note">
      {#if view.fork.name}<span>Forked from <strong>{view.fork.name}</strong></span>{:else}Forked from another conversation{/if}
      {#if view.fork.threadId}<button type="button" class="gb:transcript:border-0 gb:transcript:bg-transparent gb:transcript:text-accent gb:transcript:font-semibold gb:transcript:cursor-pointer gb:transcript:py-0.5 gb:transcript:px-[5px] gb:transcript:pointer-coarse:min-h-11 gb:transcript:focus-visible:outline-2 gb:transcript:focus-visible:outline-accent" data-chat-message-action="switch-fork-source" data-chat-message-thread-id={view.fork.threadId}>View original</button>{/if}
    </div>
  {/if}
  {#if view.earlier > 0}<div class="chat-history-window gb:transcript:self-stretch gb:transcript:flex gb:transcript:justify-center gb:transcript:pt-0.5 gb:transcript:pb-2"><button type="button" class="chat-history-earlier gb:transcript:border gb:transcript:border-line gb:transcript:rounded-full gb:transcript:bg-surface gb:transcript:text-secondary gb:transcript:cursor-pointer gb:transcript:text-xs gb:transcript:min-h-9 gb:transcript:py-[7px] gb:transcript:px-3.5 gb:transcript:pointer-coarse:min-h-11 gb:transcript:hover:border-accent gb:transcript:hover:text-accent gb:transcript:focus-visible:outline-2 gb:transcript:focus-visible:outline-accent" data-chat-message-action="show-earlier-messages">Show earlier messages <span>({view.earlier} remaining)</span></button></div>{/if}
  {#each view.entries as entry (entry.key)}
    {#if 'joined' in entry}<div class="chat-persona-joined gb:transcript:self-center gb:transcript:text-xs gb:transcript:text-secondary gb:transcript:italic gb:transcript:py-1.5">{entry.joined}</div>
    {:else}
      {#if entry.persona}<ChatPersonaLabel text={entry.persona}/>{/if}
      <ChatMessage view={entry.message}/>
    {/if}
  {/each}
</div>
