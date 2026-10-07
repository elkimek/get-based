<script lang="ts">
  import { chatAttachmentActions, openOwnedChatContext } from '../chat-attachment-view.js';
  import { COMPOSER_TOOL_BUTTON } from '../chat-composer-classes.js';
  import { ATTACHMENT_MENU, ATTACHMENT_ACTION, ATTACHMENT_ICON, ATTACHMENT_LABEL, ATTACHMENT_HINT } from '../chat-attachment-classes.js';
  let { root, canAttach, discussionActive }: { root: HTMLElement; canAttach: boolean; discussionActive: boolean;} = $props();
  let menu: HTMLDetailsElement, trigger: HTMLElement, imageInput: HTMLInputElement, fileInput: HTMLInputElement;
  let open = $state(false);
  function close(focus = false) { open = false; if (menu) menu.open = false; if (focus) trigger.focus(); }
  function outside(event: MouseEvent) { if (open && event.target instanceof Node && !menu.contains(event.target)) close(); }
  function escape(event: KeyboardEvent) { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopImmediatePropagation(); close(true); } }
  function choose(kind: 'photo' | 'health' | 'context') {
    if (!chatAttachmentActions(root)) return;
    close(true);
    if (kind === 'context') openOwnedChatContext(root);
    else if (kind === 'photo' && canAttach && !discussionActive) imageInput.click();
    else if (kind === 'health') root.ownerDocument.getElementById('pdf-input')?.click();
  }
  function files(input: HTMLInputElement) { const files = Array.from(input.files || []); input.value = ''; void chatAttachmentActions(root)?.files(files); }
</script>
<svelte:document onclick={outside} onkeydowncapture={escape}/>
<details class="chat-context-menu gb:attachment:relative" id="chat-context-menu" bind:this={menu} ontoggle={()=>{open=menu.open;}}>
  <summary bind:this={trigger} class="chat-context-menu-toggle {COMPOSER_TOOL_BUTTON} gb:attachment:list-none gb:attachment:[&::-webkit-details-marker]:hidden" id="chat-attach-btn" aria-label="Add to message" title="Add to message" aria-expanded={open} onclick={event=>{event.preventDefault();open=!open;menu.open=open;}}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></summary>
  <div class={ATTACHMENT_MENU} role="group" aria-label="Add to message" data-chat-owned-attachment-actions>
    <button type="button" id="chat-add-photo-action" class={ATTACHMENT_ACTION} hidden={!canAttach} disabled={discussionActive} title={discussionActive ? 'End the discussion to attach photos' : undefined} data-chat-action="attach-image" onclick={()=>choose('photo')}>
      <span class={ATTACHMENT_ICON}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/></svg></span><span><strong class={ATTACHMENT_LABEL}>Add photos</strong></span>
    </button>
    <button type="button" class={ATTACHMENT_ACTION} data-chat-action="import-health-file" onclick={()=>choose('health')}><span class={ATTACHMENT_ICON}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg></span><span><strong class={ATTACHMENT_LABEL}>Import health file</strong><small class={ATTACHMENT_HINT}>PDF, spreadsheet, JSON, or export</small></span></button>
    <button type="button" class={ATTACHMENT_ACTION} data-chat-action="open-chat-context" onclick={()=>choose('context')}><span class={ATTACHMENT_ICON}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M7 12h10M10 19h4"/><circle cx="8" cy="5" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></span><span><strong class={ATTACHMENT_LABEL}>Manage AI context</strong><small class={ATTACHMENT_HINT}>Choose which profile data can be used</small></span></button>
  </div>
</details>
<input type="file" id="chat-image-input" bind:this={imageInput} class="gb:attachment:hidden" aria-label="Attach photos" accept="image/jpeg,image/png,image/gif,image/webp" multiple onchange={()=>files(imageInput)}>
<input type="file" id="chat-file-input" bind:this={fileInput} class="gb:attachment:hidden" aria-label="Choose a chat attachment or health file" accept=".pdf,.json,.cluedata,.txt,.csv,.xlsx,.xml,.zip,.jpg,.jpeg,.png,.gif,.webp,application/xml,text/xml,application/zip,image/jpeg,image/png,image/gif,image/webp" multiple onchange={()=>files(fileInput)}>
