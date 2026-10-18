<script lang="ts">
  import type { RestoredThreadListRow } from '../restored-thread-list-presentation.js';
  import { THREAD_EMPTY } from '../chat-thread-navigation-classes.js';
  let { rows }: { rows: readonly RestoredThreadListRow[] } = $props();
</script><svelte:options preserveWhitespace />{#if rows.length}{#each rows as thread}<div class={'chat-thread-item' + (thread.active ? ' active' : '')} data-thread-id={thread.id}>
      <button type="button" class="chat-thread-item-main" data-chat-thread-action="switch" aria-current={thread.active ? 'true' : 'false'}>
        <span class="chat-thread-item-name">{thread.name}</span>
        <span class="chat-thread-item-meta">
          <span title={thread.iconTitle ?? undefined}>{thread.icon}</span>
          <span>{thread.updatedAt}</span>
          <span>{thread.messageCount} msg{thread.messageCount !== 1 ? 's' : ''}</span>
        </span>
      </button>
    </div>{/each}{:else}<div data-chat-thread-navigation-view class={THREAD_EMPTY}>No conversations yet</div>{/if}
