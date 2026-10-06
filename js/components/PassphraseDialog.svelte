<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { PassphraseState, PassphraseActions } from '../passphrase-contract.js';
  import { PASSPHRASE_LABELS, PASSPHRASE_RULES, passphraseChecks } from '../passphrase-presentation.js';
  import { PASSPHRASE_INPUT, PASSPHRASE_PRIMARY, PASSPHRASE_SECONDARY, PASSPHRASE_DANGER, PASSPHRASE_LINK } from '../passphrase-classes.js';
  let { initial, actions }: { initial: PassphraseState; actions: PassphraseActions } = $props();
  let snapshot = $state(untrack(() => initial));
  let passphrase = $state(''); let confirmation = $state(''); let oldPassphrase = $state('');
  let dialog: HTMLDivElement | undefined = $state();
  const labels = $derived(PASSPHRASE_LABELS[snapshot.kind]);
  const checks = $derived(passphraseChecks(passphrase));
  const strength = $derived(checks.filter(Boolean).length);
  const colors = ['var(--red)', 'var(--orange)', 'var(--yellow)', 'var(--green)'];
  const primaryId = $derived(({ unlock:'passphrase-unlock-btn', enable:'passphrase-set-btn', change:'passphrase-change-btn', erase:'passphrase-forgot-confirm', 'encryption-nudge':'encryption-nudge-enable', 'backup-nudge':'backup-nudge-download' })[snapshot.kind]);
  const secondaryId = $derived(({ unlock:'', enable:'passphrase-set-cancel', change:'passphrase-change-cancel', erase:'passphrase-forgot-cancel', 'encryption-nudge':'encryption-nudge-dismiss', 'backup-nudge':'backup-nudge-snooze' })[snapshot.kind]);
  export function update(next: PassphraseState): void { snapshot = next; }
  export function clearUnlock(): void { passphrase = ''; }
  export function clearSecrets(): void { passphrase = ''; confirmation = ''; oldPassphrase = ''; }
  export function focusFirst(): void { dialog?.querySelector<HTMLElement>('input:not([disabled]),button:not([disabled])')?.focus(); }
  onMount(focusFirst);
  function submit(event?: Event): void {
    event?.preventDefault(); if (snapshot.pending) return;
    if (snapshot.kind === 'unlock') actions.submit({ kind:'unlock', passphrase });
    else if (snapshot.kind === 'enable') actions.submit({ kind:'enable', passphrase, confirmation });
    else if (snapshot.kind === 'change') actions.submit({ kind:'change', oldPassphrase, newPassphrase:passphrase, confirmation });
    else actions.submit({ kind:snapshot.kind });
  }
  function enter(event: KeyboardEvent): void { if (event.key === 'Enter') submit(event); }
  function trapFocus(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); return; }
    if (event.key !== 'Tab' || !dialog) return;
    const controls = dialog.querySelectorAll<HTMLElement>('input:not([disabled]),button:not([disabled])');
    const first = controls[0]; const last = controls[controls.length-1];
    if (!first) { event.preventDefault(); dialog.focus(); return; }
    if (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
      event.preventDefault(); event.stopPropagation(); (event.shiftKey ? last : first)?.focus();
    } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); event.stopPropagation(); first.focus(); }
  }
</script>
<svelte:window onkeydown={trapFocus}/>
<div class="gb:passphrase:fixed gb:passphrase:inset-0 gb:passphrase:z-[400] gb:passphrase:flex gb:passphrase:items-center gb:passphrase:justify-center gb:passphrase:bg-[rgba(0,0,0,0.85)] gb:passphrase:backdrop-blur-[8px] gb:passphrase:py-3 gb:passphrase:overscroll-contain">
  <div bind:this={dialog} class="passphrase-dialog gb:passphrase:bg-secondary-surface gb:passphrase:rounded-[var(--radius)] gb:passphrase:border gb:passphrase:border-line gb:passphrase:px-8 gb:passphrase:py-9 gb:passphrase:max-w-[420px] gb:passphrase:w-[90vw] gb:passphrase:max-h-[calc(100dvh-24px)] gb:passphrase:overflow-y-auto gb:passphrase:overscroll-contain gb:passphrase:shadow-[0_12px_48px_rgba(0,0,0,0.5)] gb:passphrase:text-center" role="dialog" aria-modal="true" aria-label={labels.label} aria-describedby={snapshot.kind==='change' ? undefined : 'passphrase-description'} aria-busy={snapshot.pending} tabindex="-1">
    <div class="passphrase-icon gb:passphrase:text-[48px] gb:passphrase:mb-3" aria-hidden="true">{snapshot.kind==='erase' ? '⚠️' : snapshot.kind==='backup-nudge' ? '💾' : '🔒'}</div>
    <h3 class="passphrase-title gb:passphrase:text-[20px] gb:passphrase:font-bold gb:passphrase:text-ink gb:passphrase:font-display gb:passphrase:mt-0 gb:passphrase:mb-2">{labels.title}</h3>
    {#if snapshot.kind!=='change'}
      <p id="passphrase-description" class="passphrase-desc gb:passphrase:text-[13px] gb:passphrase:text-secondary gb:passphrase:leading-[1.5] gb:passphrase:mt-0 gb:passphrase:mb-5">
        {#if snapshot.kind==='unlock'}Your data is encrypted. Enter your passphrase to continue.
        {:else if snapshot.kind==='enable'}Set a passphrase to encrypt your medical data at rest. <strong>If you forget this passphrase, your data cannot be recovered.</strong>
        {:else if snapshot.kind==='erase'}If you forgot your passphrase, the only option is to <strong>erase all data</strong> and start fresh. This cannot be undone.
        {:else if snapshot.kind==='encryption-nudge'}Your lab results are stored in your browser's local storage, where browser extensions and anyone with filesystem access can read them. Set a passphrase to encrypt your data at rest.
        {:else}Your lab results only exist in this browser. Download a backup to protect against data loss.{/if}
      </p>
    {/if}
    <form onsubmit={submit}>
      {#if snapshot.kind==='unlock'}
        <input type="password" class={PASSPHRASE_INPUT} id="passphrase-unlock-input" aria-label="Passphrase" placeholder="Passphrase" autocomplete="current-password" bind:value={passphrase} onkeydown={enter} disabled={snapshot.pending || snapshot.credentialsLocked}>
      {:else if snapshot.kind==='enable'}
        <input type="password" class={PASSPHRASE_INPUT} id="passphrase-set-input" aria-label="Enter passphrase" placeholder="Enter passphrase" autocomplete="new-password" aria-describedby="passphrase-rules" bind:value={passphrase} disabled={snapshot.pending || snapshot.credentialsLocked}>
        <input type="password" class={PASSPHRASE_INPUT} id="passphrase-confirm-input" aria-label="Confirm passphrase" placeholder="Confirm passphrase" autocomplete="new-password" bind:value={confirmation} onkeydown={enter} disabled={snapshot.pending || snapshot.credentialsLocked}>
        <div class="passphrase-strength gb:passphrase:mb-2.5" id="passphrase-strength">
          <div class="passphrase-strength-bars gb:passphrase:flex gb:passphrase:gap-1 gb:passphrase:mb-2" aria-hidden="true">
            {#each PASSPHRASE_RULES as rule, index (rule.id)}<div class="passphrase-strength-bar gb:passphrase:flex-1 gb:passphrase:h-1 gb:passphrase:rounded-[2px] gb:passphrase:bg-line" data-index={index} style:background={index < strength ? colors[strength-1] : undefined}></div>{/each}
          </div>
          <ul class="passphrase-rules gb:passphrase:list-none gb:passphrase:p-0 gb:passphrase:m-0 gb:passphrase:text-[12px] gb:passphrase:text-secondary" id="passphrase-rules">
            {#each PASSPHRASE_RULES as rule, index (rule.id)}<li class:met={checks[index]} class={checks[index] ? 'gb:passphrase:py-px gb:passphrase:text-success-ink' : 'gb:passphrase:py-px'} data-rule={rule.id}><span aria-hidden="true" class="gb:passphrase:mr-1.5 gb:passphrase:text-[10px]">{checks[index] ? '✓' : '✕'}</span>{rule.label}<span class="gb:passphrase:sr-only">{checks[index] ? ' — met' : ' — not met'}</span></li>{/each}
          </ul>
        </div>
      {:else if snapshot.kind==='change'}
        <input type="password" class={PASSPHRASE_INPUT} id="passphrase-old-input" aria-label="Current passphrase" placeholder="Current passphrase" autocomplete="current-password" bind:value={oldPassphrase} disabled={snapshot.pending || snapshot.credentialsLocked}>
        <input type="password" class={PASSPHRASE_INPUT} id="passphrase-new1-input" aria-label="New passphrase" placeholder="New passphrase" autocomplete="new-password" bind:value={passphrase} disabled={snapshot.pending || snapshot.credentialsLocked}>
        <input type="password" class={PASSPHRASE_INPUT} id="passphrase-new2-input" aria-label="Confirm new passphrase" placeholder="Confirm new passphrase" autocomplete="new-password" bind:value={confirmation} onkeydown={enter} disabled={snapshot.pending || snapshot.credentialsLocked}>
      {/if}
      {#if labels.errorId && (snapshot.kind!=='erase' || snapshot.error)}<div id={labels.errorId} role="alert" class="passphrase-error gb:passphrase:text-[13px] gb:passphrase:text-danger gb:passphrase:min-h-5 gb:passphrase:mb-2 gb:passphrase:break-words">{snapshot.error}</div>{/if}
      {#if snapshot.credentialsLocked && !snapshot.pending}<p class="gb:passphrase:text-[12px] gb:passphrase:text-secondary gb:passphrase:mb-2">Retry to finish encrypting your data with this passphrase.</p>{/if}
      <div class="gb:passphrase:flex gb:passphrase:gap-2 gb:passphrase:mt-2">
        {#if labels.secondary}<button type="button" class={PASSPHRASE_SECONDARY} id={secondaryId} onclick={actions.secondary} disabled={snapshot.pending || snapshot.credentialsLocked}>{labels.secondary}</button>{/if}
        <button type="submit" class={snapshot.kind==='erase' ? PASSPHRASE_DANGER : PASSPHRASE_PRIMARY} id={primaryId} disabled={snapshot.pending}>{snapshot.primaryLabel}</button>
      </div>
      {#if snapshot.kind==='unlock'}<button type="button" class={PASSPHRASE_LINK} id="passphrase-forgot-btn" onclick={actions.forgot} disabled={snapshot.pending || snapshot.credentialsLocked}>Forgot passphrase?</button>{/if}
    </form>
  </div>
</div>
