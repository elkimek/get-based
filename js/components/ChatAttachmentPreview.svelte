<script lang="ts">
  import { tick } from 'svelte';
  import { type ChatAttachmentView, chatAttachmentActions, chatAttachmentName, chatAttachmentImageURL } from '../chat-attachment-view.js';
  import type { ChatAttachment } from '../chat-attachment-drafts.js';
  import { ATTACHMENT_PREVIEW, ATTACHMENT_THUMB, ATTACHMENT_REMOVE } from '../chat-attachment-classes.js';
  let { view, root }: { view: ChatAttachmentView; root: HTMLElement ;} = $props();
  let preview: HTMLElement;
  async function remove(attachment: ChatAttachment, index: number, event: MouseEvent) {
    event.stopPropagation();
    const scope = view.scope;
    const actions = chatAttachmentActions(root);
    if (!actions) return;
    actions.remove(attachment, scope);
    await tick();
    if (!chatAttachmentActions(root) || view.scope !== scope) return;
    const buttons = preview.querySelectorAll<HTMLButtonElement>('button');
    (buttons[Math.min(index, buttons.length - 1)] || root.querySelector<HTMLTextAreaElement>('#chat-input'))?.focus();
  }
</script>
<div class={ATTACHMENT_PREVIEW} id="chat-attach-preview" hidden={!view.attachments.length} bind:this={preview}>
  {#each view.attachments as attachment, index (attachment)}
    <div class={ATTACHMENT_THUMB} title={chatAttachmentName(attachment.name)}>
      {#if chatAttachmentImageURL(attachment.previewUrl)}<img src={chatAttachmentImageURL(attachment.previewUrl)} alt={chatAttachmentName(attachment.name)} class="gb:attachment:size-full gb:attachment:object-cover gb:attachment:rounded-control"/>{/if}
      <button class={ATTACHMENT_REMOVE} type="button" aria-label={`Remove ${chatAttachmentName(attachment.name)}`} onclick={event=>remove(attachment,index,event)}>×</button>
    </div>
  {/each}
  {#if view.attachments.length}<span class="chat-attach-count gb:attachment:text-[11px] gb:attachment:text-secondary gb:attachment:whitespace-nowrap" aria-live="polite">{view.attachments.length}/{view.limit}</span>{/if}
</div>
