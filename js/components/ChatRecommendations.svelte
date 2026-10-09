<script lang="ts">
  import { flushSync } from 'svelte';
  import TipsSection from './TipsSection.svelte';
  import { state as appState } from '../state.js';
  import { startRecommendationAttention } from '../chat-recommendation-disclosure.js';
  import { saveChatHistory } from '../chat-history.js';
  import type { ChatTranscriptMessage } from '../chat-transcript-presentation.js';
  let { view, index, attention = false }: { attention?: boolean; view: NonNullable<ChatTranscriptMessage['recommendations']>; index: number } = $props();
  let isNew = $state(false);
  const firstBanner = $derived(view.sections.findIndex(section => section.banner));
  $effect(() => { isNew = view.isNew; });
  function own(root: HTMLDetailsElement) {
    const profile = appState.currentProfile, thread = appState.currentThreadId, history = appState.chatHistory, message = history[index];
    const toggle = () => {
      if (!root.isConnected || profile !== appState.currentProfile || thread !== appState.currentThreadId || history !== appState.chatHistory || message !== history[index] || !message) return;
      const clears = root.open && message.recNew;
      if (message.recOpen === root.open && !clears) return;
      message.recOpen = root.open;
      if (clears) { message.recNew = false; flushSync(() => { isNew = false; }); }
      void saveChatHistory();
    };
    const cancelAttention = attention ? startRecommendationAttention(root) : () => {};
    const contain = (event: Event) => event.stopPropagation();
    root.addEventListener('click', contain);
    root.addEventListener('toggle', toggle);
    return { destroy() { root.removeEventListener('click', contain); cancelAttention(); root.removeEventListener('toggle', toggle); } };
  }
</script>
<!-- Catalog facts are projected by their owner and composed as escaped authored sections. -->
<details class="rec-chat-wrapper gb:group/recommendations gb:transcript:mt-2 gb:transcript:border-t gb:transcript:border-line gb:transcript:pt-2 gb:transcript:[&.rec-chat-attention>summary]:animate-[recChatAttention_1s_ease-in-out_3] gb:transcript:motion-reduce:[&.rec-chat-attention>summary]:animate-none" class:rec-chat-unseen={isNew} data-chat-recommendations-view data-chat-message-index={index} open={view.open} use:own>
  <summary class="rec-chat-summary gb:transcript:text-[13px] gb:transcript:font-semibold gb:transcript:text-accent gb:transcript:cursor-pointer gb:transcript:list-none gb:transcript:py-[7px] gb:transcript:px-[9px] gb:transcript:border gb:transcript:rounded-lg gb:transcript:transition-[color,border-color,background,box-shadow] gb:transcript:duration-150 gb:transcript:motion-reduce:transition-none gb:transcript:[&::-webkit-details-marker]:hidden gb:transcript:marker:content-[''] gb:transcript:before:content-['▸'] gb:transcript:before:mr-1.5 gb:transcript:before:inline-block gb:transcript:before:text-[11px] gb:transcript:before:transition-transform gb:transcript:before:duration-200 gb:transcript:motion-reduce:before:transition-none gb:transcript:group-open/recommendations:before:rotate-90 gb:transcript:focus-visible:outline-2 gb:transcript:focus-visible:outline-offset-2 gb:transcript:focus-visible:outline-accent {isNew ? 'gb:transcript:border-[color-mix(in_srgb,var(--accent)_52%,var(--border))] gb:transcript:bg-[color-mix(in_srgb,var(--accent)_11%,transparent)]' : 'gb:transcript:border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] gb:transcript:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] gb:transcript:hover:border-[color-mix(in_srgb,var(--accent)_48%,var(--border))] gb:transcript:hover:bg-[color-mix(in_srgb,var(--accent)_9%,transparent)] gb:transcript:group-open/recommendations:border-[color-mix(in_srgb,var(--accent)_38%,var(--border))] gb:transcript:group-open/recommendations:bg-[color-mix(in_srgb,var(--accent)_7%,transparent)]'}">See <span class="rec-chat-count gb:transcript:text-inherit gb:transcript:font-[650]">{view.count} helpful {view.count === 1 ? 'suggestion' : 'suggestions'}</span>{#if isNew}<span class="rec-chat-new gb:transcript:inline-flex gb:transcript:items-center gb:transcript:ml-2 gb:transcript:py-px gb:transcript:px-1.5 gb:transcript:rounded-full gb:transcript:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] gb:transcript:text-accent gb:transcript:text-[9px] gb:transcript:font-bold gb:transcript:tracking-[.04em] gb:transcript:uppercase gb:transcript:align-[1px]">New</span>{/if}</summary>
  {#each view.sections as section, sectionIndex}
    <TipsSection view={section} headingMode="chat" showBanner={sectionIndex === firstBanner}/>
  {/each}
</details>
