<script lang="ts">
  import { closeOwnedDiscussionPicker, discussionPickerLimit, guardDiscussionAction, selectDiscussionPersona, type ChatDiscussionView } from '../chat-discussion-view.js';
  import { DISCUSSION_BUTTON, DISCUSSION_COPY, DISCUSSION_FOCUS, DISCUSSION_ITEM } from '../chat-discussion-classes.js';
  let { view, root }: { view: ChatDiscussionView; root: HTMLElement; } = $props();
  let picker = $derived(view.picker);
  let count = $derived(picker?.selected.length || 0);
  let limit = $derived(picker ? discussionPickerLimit(picker) : 0);
  let futureCount = $derived((picker?.options.filter(option => option.locked).length || 0) + count);
  let round = $derived(view.round);
  function escape(event: KeyboardEvent) {
    if (event.key === 'Escape' && picker && root?.contains(root.ownerDocument.activeElement)) {
      event.preventDefault(); event.stopImmediatePropagation(); closeOwnedDiscussionPicker(root, true);
    }
  }
</script>
<svelte:document onkeydowncapture={escape}/>
{#if picker}
  <div class="discuss-persona-picker gb:composer:min-w-0 gb:composer:box-border gb:composer:max-w-full gb:composer:flex gb:composer:flex-col gb:composer:gap-2.5 gb:composer:px-4 gb:composer:py-3 gb:composer:border gb:composer:border-line gb:composer:rounded-[10px] gb:composer:bg-surface gb:composer:shadow-[var(--shadow-md)] gb:composer:max-[480px]:p-3 gb:composer:max-[480px]:max-h-[min(52vh,440px)] gb:composer:max-[480px]:overflow-y-auto"
    role="dialog" aria-modal="false" aria-labelledby="discuss-picker-title" data-existing-discussion={String(picker.addingToExisting)} onclickcapture={event=>guardDiscussionAction(root,event)}>
    <div class="discuss-picker-heading gb:composer:flex gb:composer:items-start gb:composer:justify-between gb:composer:gap-3">
      <div><div class="discuss-picker-header gb:composer:text-[13px] gb:composer:font-semibold gb:composer:text-ink" id="discuss-picker-title">{picker.addingToExisting ? 'Add a participant' : 'Start a discussion'}</div>
        <div class="discuss-picker-help gb:composer:mt-[3px] {DISCUSSION_COPY}">{picker.addingToExisting ? 'The new participant responds once, then joins future rounds.' : 'Choose one additional perspective. They respond now; both perspectives join your next message.'}</div></div>
      <button type="button" class="discuss-picker-close gb:composer:size-8 gb:composer:shrink-0 gb:composer:border-0 gb:composer:rounded-[7px] gb:composer:bg-transparent gb:composer:text-secondary gb:composer:text-xl gb:composer:cursor-pointer gb:composer:hover:bg-hover gb:composer:hover:text-ink gb:composer:pointer-coarse:size-11 {DISCUSSION_FOCUS}" aria-label="Close participant picker" onclick={()=>closeOwnedDiscussionPicker(root,true)}>×</button>
    </div>
    <fieldset class="discuss-picker-fieldset gb:composer:min-w-0 gb:composer:m-0 gb:composer:p-0 gb:composer:border-0">
      <legend class="gb:composer:sr-only">Discussion participants</legend>
      <div class="discuss-picker-list gb:composer:flex gb:composer:flex-wrap gb:composer:gap-1.5 gb:composer:max-[480px]:grid gb:composer:max-[480px]:grid-cols-1">
        {#each picker.options as option (option.id)}
          <label class={DISCUSSION_ITEM} class:locked={option.locked}>
            <input type="checkbox" class="gb:composer:sr-only" value={option.id} data-name={option.name} data-icon={option.icon} data-locked={option.locked ? '1' : ''}
              checked={option.locked || picker.selected.includes(option.id)} disabled={option.locked || (count >= limit && !picker.selected.includes(option.id))}
              onchange={event=>selectDiscussionPersona(root,option.id,event.currentTarget.checked)}>
            <span>{option.icon} {option.name}</span>
          </label>
        {/each}
      </div>
    </fieldset>
    <div class="discuss-picker-usage {DISCUSSION_COPY}" role="note">{count ? `Starts ${count} AI response${count === 1 ? '' : 's'} now. Future messages use ${futureCount} sequential responses; provider usage is charged for each.` : 'Each participant adds a separate AI request and provider charge to future messages.'}</div>
    <button type="button" class="discuss-picker-start {DISCUSSION_BUTTON} gb:composer:self-end gb:composer:px-4 gb:composer:rounded-2xl gb:composer:disabled:opacity-50 gb:composer:disabled:cursor-default gb:composer:max-[480px]:self-stretch gb:composer:max-[480px]:min-h-11" disabled={count !== limit} data-chat-message-action="start-discussion-from-picker">{count !== limit ? `Choose ${limit - count} more` : `${picker.addingToExisting ? 'Add participant' : 'Start discussion'} · ${count} response${count === 1 ? '' : 's'}`}</button>
  </div>
{/if}
{#if round}
  <section class="chat-discussion-mode gb:composer:min-w-0 gb:composer:box-border gb:composer:max-w-full gb:composer:flex gb:composer:flex-col gb:composer:gap-1.5 gb:composer:px-3 gb:composer:py-2.5 gb:composer:border gb:composer:border-[color-mix(in_srgb,var(--accent)_42%,var(--border))] gb:composer:rounded-[10px] gb:composer:bg-[color-mix(in_srgb,var(--accent)_8%,var(--bg-card))]" aria-label="Active discussion" onclickcapture={event=>guardDiscussionAction(root,event)}>
    <div class="chat-discussion-mode-main gb:composer:flex gb:composer:flex-wrap gb:composer:items-start gb:composer:justify-between gb:composer:gap-2.5">
      <div class="chat-discussion-mode-copy gb:composer:flex gb:composer:flex-col gb:composer:gap-[5px] gb:composer:min-w-0"><strong class="gb:composer:text-ink gb:composer:text-xs">Discussion</strong>
        <span class="chat-discussion-participants gb:composer:flex gb:composer:flex-wrap gb:composer:gap-1">{#each round.participants as participant}<span class="gb:composer:px-[7px] gb:composer:py-0.5 gb:composer:rounded-full gb:composer:bg-hover gb:composer:text-secondary gb:composer:text-[11px] gb:composer:[overflow-wrap:anywhere] gb:composer:min-w-0 gb:composer:max-w-full">{participant}</span>{/each}</span>
      </div>
      <div class="chat-discussion-mode-actions gb:composer:flex gb:composer:items-center gb:composer:flex-wrap gb:composer:justify-end gb:composer:gap-[5px]">
        {#if round.pending}<button type="button" class="chat-discussion-resume {DISCUSSION_BUTTON}" data-chat-message-action="resume-discussion">Resume {round.pending}</button>{/if}
        <button type="button" class="chat-discussion-pause {DISCUSSION_BUTTON} gb:composer:border-danger gb:composer:text-danger-ink" hidden={!round.progress} data-chat-message-action="pause-discussion">Pause round</button>
        <button type="button" class="chat-discussion-add {DISCUSSION_BUTTON}" data-chat-action="start-discussion">Add participant</button>
        <button type="button" class="chat-discussion-end {DISCUSSION_BUTTON}" data-chat-message-action="end-discussion">End</button>
      </div>
    </div>
    <div class="chat-discussion-expectation {DISCUSSION_COPY}" id="chat-discussion-composer-help">{round.pending ? `Round paused · ${round.pending} response${round.pending === 1 ? '' : 's'} remaining.` : `Each message sends ${round.participants.length} sequential AI requests, one per participant. Provider usage is charged for every response.`}</div>
    <div class="chat-discussion-progress {DISCUSSION_COPY} gb:composer:font-semibold" role="status" aria-live="polite" hidden={!round.progress}>{round.progress}</div>
  </section>
{/if}
