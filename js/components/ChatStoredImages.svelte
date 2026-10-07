<script lang="ts">
  import type { ChatStoredImages } from '../chat-message-content-contract.js';
  import { CONTENT_FOCUS } from '../chat-message-content-classes.js';
  let { view }: { view: ChatStoredImages } = $props();
</script>
{#if view.thumbnails.length}
  <div class="chat-image-thumbs gb:message-content:flex gb:message-content:gap-1.5 gb:message-content:mb-2 gb:message-content:flex-wrap" data-chat-message-content>
    {#each view.thumbnails as src, index}
      <button type="button" class="chat-image-open gb:message-content:size-16 gb:message-content:p-0 gb:message-content:border-0 gb:message-content:rounded-md gb:message-content:bg-transparent gb:message-content:cursor-pointer gb:message-content:transition-opacity gb:message-content:duration-150 gb:message-content:motion-reduce:transition-none gb:message-content:hover:opacity-80 {CONTENT_FOCUS}" aria-label={`Open attached image ${index + 1} of ${view.thumbnails.length}`} data-chat-message-action="open-image-lightbox" data-chat-message-src={src}>
        <img {src} class="chat-image-thumb gb:message-content:size-16 gb:message-content:box-border gb:message-content:object-cover gb:message-content:rounded-md gb:message-content:border gb:message-content:border-line" alt="Attachment">
      </button>
    {/each}
  </div>
{:else}
  <div class="chat-image-badge gb:message-content:text-[11px] gb:message-content:text-secondary gb:message-content:mb-1 gb:message-content:italic" data-chat-message-content>🖼 {view.count} image{view.count !== 1 ? 's' : ''} attached</div>
{/if}
