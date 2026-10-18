<script lang="ts">
  import { ownContextChild } from '../context-child-ownership.js';
  import { onMount, untrack, flushSync } from 'svelte';
  import { CONTEXT_ACTION, CONTEXT_FOCUS } from '../context-card-catalog-classes.js';
  import { acceptContextNotes, contextNotesPresentation, subscribeContextNotes, useSavedContextNotes } from '../context-notes-session.js';
  import type { ContextNotesPresentation } from '../context-notes-session.js';
  let { initial, renderId }: { initial: ContextNotesPresentation; renderId: string } = $props();
  let notes = $state.raw(untrack(() => initial));
  let root: HTMLDivElement;
  function current(): boolean { return root?.isConnected && contextNotesPresentation().ticket === initial.ticket; }
  function submit(value: string, reviewedSaved: string | null = null): void { if (current()) acceptContextNotes(initial.ticket, value, reviewedSaved); }
  onMount(() => {
    const host = root?.closest('[data-context-notes-host]');
    const releaseHost = host ? ownContextChild(host) : () => {};
    const update = (value: ContextNotesPresentation) => {
      if (current() && value.ticket === initial.ticket) flushSync(() => { notes = value; });
    };
    update(contextNotesPresentation());
    const stop = subscribeContextNotes(update);
    return () => { stop(); releaseHost(); };
  });
</script>
  <div bind:this={root} class="ctx-notes-section gb:context-catalog:mt-1 gb:context-catalog:mb-4 gb:context-catalog:py-4 gb:context-catalog:px-[18px] gb:context-catalog:border gb:context-catalog:border-line gb:context-catalog:rounded-control gb:context-catalog:bg-surface gb:context-catalog:[@media(max-width:480px)]:p-3.5">
    <div class="ctx-notes-head gb:context-catalog:flex gb:context-catalog:flex-wrap gb:context-catalog:items-baseline gb:context-catalog:justify-between gb:context-catalog:gap-3 gb:context-catalog:mb-1"><label class="ctx-notes-label gb:context-catalog:text-ink gb:context-catalog:text-[13px] gb:context-catalog:font-bold" for={`${renderId}-notes-input`}>Additional context</label><span class="ctx-notes-status gb:context-catalog:text-muted gb:context-catalog:text-[11px] gb:context-catalog:whitespace-nowrap" id={`${renderId}-notes-status`} role="status" aria-live="polite">{notes.status}</span><button type="button" class="ctx-notes-retry {CONTEXT_ACTION} {CONTEXT_FOCUS} gb:context-catalog:bg-transparent gb:context-catalog:text-accent gb:context-catalog:px-2 gb:context-catalog:[&[hidden]]:hidden" onclick={(event) => { event.stopPropagation(); submit(notes.notes, notes.saved); }} data-context-notes-reviewed-saved={notes.saved ?? undefined} hidden={notes.status !== 'Not saved — try again'}>{notes.saved !== null && notes.saved !== undefined ? 'Save draft instead' : 'Retry save'}</button></div>
    <div class="ctx-notes-hint gb:context-catalog:mb-2.5 gb:context-catalog:text-muted gb:context-catalog:text-[12px] gb:context-catalog:leading-[1.45]" id={`${renderId}-notes-hint`}>Anything else that may affect your labs or health patterns.</div>
    <div class="ctx-notes-conflict gb:context-catalog:mb-2.5 gb:context-catalog:p-2.5 gb:context-catalog:rounded-control gb:context-catalog:border gb:context-catalog:border-line gb:context-catalog:text-[12px] gb:context-catalog:text-secondary gb:context-catalog:[&[hidden]]:hidden" hidden={notes.saved === null || notes.saved === undefined}>
      <p class="gb:context-catalog:mt-0 gb:context-catalog:mb-2">Saved notes changed while this draft was unsaved. Review both before saving.</p>
      <p class="ctx-notes-conflict-saved gb:context-catalog:whitespace-pre-wrap gb:context-catalog:break-words gb:context-catalog:my-2">{notes.saved === '' ? 'Saved notes are empty.' : notes.saved || ''}</p>
      <button type="button" class="ctx-notes-use-saved {CONTEXT_ACTION} {CONTEXT_FOCUS} gb:context-catalog:bg-transparent gb:context-catalog:text-accent gb:context-catalog:px-2 gb:context-catalog:disabled:opacity-50" onclick={(event) => { event.stopPropagation(); if (current()) useSavedContextNotes(initial.ticket); }} disabled={notes.status === 'Saving…'}>Use saved notes</button>
    </div>
    <textarea class="ctx-notes-textarea gb:context-catalog:w-full gb:context-catalog:min-h-[76px] gb:context-catalog:max-h-[180px] gb:context-catalog:resize-y gb:context-catalog:bg-[var(--bg-primary)] gb:context-catalog:border gb:context-catalog:border-line gb:context-catalog:rounded-control gb:context-catalog:text-ink gb:context-catalog:text-[13px] gb:context-catalog:py-[11px] gb:context-catalog:px-[13px] gb:context-catalog:[font-family:inherit] gb:context-catalog:leading-[1.5] gb:context-catalog:transition-[border-color] gb:context-catalog:duration-150 gb:context-catalog:box-border gb:context-catalog:focus:border-accent gb:context-catalog:focus:outline-none gb:context-catalog:placeholder:text-muted" id={`${renderId}-notes-input`} aria-describedby={`${renderId}-notes-hint`} placeholder="For example: shift work, a recent illness, or an upcoming treatment change" oninput={(event) => { event.stopPropagation(); submit(event.currentTarget.value); }}>{notes.notes}</textarea>
  </div>
