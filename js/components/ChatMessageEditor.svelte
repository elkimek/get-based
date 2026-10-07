<script lang="ts">
  import { EDIT_BUBBLE, EDIT_BUTTON } from '../chat-message-editor-classes.js';
  let { draft, current, cancel, submit, busy = $bindable(false) }: { draft: string; current(): boolean; cancel(): void; submit(): void; busy?: boolean } = $props();
  export function setBusy(next: boolean): void { busy = next; }
  function decorate(root: HTMLElement) {
    const bubble = root.parentElement!;
    const classes = EDIT_BUBBLE.split(' ');
    bubble.dataset.chatMessageEditView = ''; bubble.classList.add('chat-msg-editing', ...classes);
    return { destroy() { delete bubble.dataset.chatMessageEditView; bubble.classList.remove('chat-msg-editing', ...classes); } };
  }
  function resize(input: HTMLTextAreaElement) {
    input.style.height = 'auto'; const height = input.scrollHeight;
    input.style.height = `${Math.min(Math.max(height + input.offsetHeight - input.clientHeight, 72), 240)}px`;
    input.style.overflowY = height > 240 ? 'auto' : 'hidden';
  }
  function focus(input: HTMLTextAreaElement) {
    resize(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    let width = input.clientWidth;
    let frame: number | null = null;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (input.clientWidth === width) return;
      width = input.clientWidth;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        if (current()) resize(input);
      });
    });
    observer?.observe(input);
    return { destroy() {
      observer?.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    } };
  }
  function key(event: KeyboardEvent) {
    if (!current()) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); }
    else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.stopPropagation(); submit(); }
  }
</script>
<div data-chat-message-editor-view class="gb:message-edit:contents" use:decorate>
  <label for="chat-message-edit-input" class="chat-message-edit-label gb:message-edit:block gb:message-edit:mb-[7px] gb:message-edit:text-secondary gb:message-edit:text-[11px] gb:message-edit:font-semibold">Edit your latest message</label>
  <textarea id="chat-message-edit-input" class="chat-message-edit-input gb:message-edit:block gb:message-edit:w-full gb:message-edit:min-h-[72px] gb:message-edit:max-h-60 gb:message-edit:box-border gb:message-edit:resize-none gb:message-edit:overflow-y-hidden gb:message-edit:px-[11px] gb:message-edit:py-2.5 gb:message-edit:border gb:message-edit:border-line gb:message-edit:rounded-lg gb:message-edit:bg-primary-surface gb:message-edit:text-ink gb:message-edit:font-body gb:message-edit:text-sm gb:message-edit:leading-normal gb:message-edit:max-[768px]:text-base gb:message-edit:focus:outline-none gb:message-edit:focus:border-accent gb:message-edit:focus:ring-[3px] gb:message-edit:focus:ring-[color-mix(in_srgb,var(--accent)_16%,transparent)]" rows="3" aria-describedby="chat-message-edit-hint" bind:value={draft} disabled={busy} use:focus oninput={event=>resize(event.currentTarget)} onkeydown={key}></textarea>
  <span id="chat-message-edit-hint" class="chat-message-edit-hint gb:message-edit:block gb:message-edit:mt-1.5 gb:message-edit:text-secondary gb:message-edit:text-[11px]">The current response will be replaced.</span>
  <div class="chat-message-edit-controls gb:message-edit:flex gb:message-edit:justify-end gb:message-edit:gap-[7px] gb:message-edit:mt-2.5">
    <button type="button" class="chat-message-edit-cancel {EDIT_BUTTON}" data-chat-message-action="cancel-message-edit" onclick={event=>{event.stopPropagation();if(current())cancel();}}>Cancel</button>
    <button type="button" class="chat-message-edit-submit {EDIT_BUTTON} gb:message-edit:border-accent gb:message-edit:bg-accent gb:message-edit:text-on-accent" data-chat-message-action="submit-message-edit" disabled={busy} onclick={event=>{event.stopPropagation();if(current())submit();}}>{busy ? 'Sending…' : 'Send again'}</button>
  </div>
</div>
