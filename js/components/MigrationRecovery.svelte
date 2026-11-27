<script lang="ts">
  import { untrack } from 'svelte';
  import type { MigrationViewState, MigrationActions } from '../migration-view.js';
  import { PROTECTION_PRIMARY, PROTECTION_SECONDARY, PROTECTION_ACTIONS } from '../settings-protection-classes.js';
  let {initial, actions}: {initial: MigrationViewState; actions: MigrationActions} = $props();
  let view = $state(untrack(() => initial));
  let password = $state(''), confirm = $state(''), original = $state(''), importPassword = $state(''), importOriginal = $state('');
  let showExportPassword = $state(false), showImportPassword = $state(false);
  let file: File | null = $state(null);
  let fileInput: HTMLInputElement | undefined = $state();
  let consent = $state(false);
  let allowWithoutSyncIdentity = $state(false);
  const passwordReady = $derived(password.length >= 12);
  const passwordMismatch = $derived(confirm.length > 0 && password !== confirm);
  const canPrepare = $derived(!view.busy && passwordReady && password === confirm && (!view.recoveryOnly || !view.legacySyncBlocked || allowWithoutSyncIdentity));
  export function update(next: MigrationViewState) {view = next;}
  export function clearSecrets() {password = ''; confirm = ''; original = ''; importPassword = ''; importOriginal = ''; showExportPassword = false; showImportPassword = false; file = null; consent = false; allowWithoutSyncIdentity = false; if (fileInput) fileInput.value = '';}
</script>
<header class="mig-topbar">
  <div class="mig-topbar-inner">
    <div class="mig-brand">
      <span class="mig-brand-wordmark">getbased</span>
      <span class="mig-badge">{view.recoveryOnly ? 'Hosted Recovery' : 'Data Migration'}</span>
    </div>
    <nav class="mig-nav" aria-label="Migration navigation">
      {#if view.recoveryOnly}
        <a class="mig-nav-link" href="https://getbased-demo.vercel.app" target="_blank" rel="noreferrer">Try the read-only demo</a>
      {:else if !view.pending}
        <a class="mig-nav-link" href="/app">Back to getbased</a>
      {/if}
      <a class="mig-nav-link" href="https://docs.getbased.health/guides/self-hosting" target="_blank" rel="noreferrer">Self-hosting guide</a>
      <a class="mig-nav-link mig-nav-link-accent" href="https://github.com/elkimek/get-based/fork" target="_blank" rel="noreferrer">Fork to self-host</a>
    </nav>
  </div>
</header>

<main class="mig-shell" data-migration-view aria-busy={view.busy}>
  <div class="mig-hero">
    <h1>{view.recoveryOnly ? 'Recover your hosted records' : 'Move your getbased data'}</h1>
    <p class="mig-hero-sub">Export everything in this browser into one encrypted transfer file, then restore it on your own self-hosted address. Nothing here is modified or deleted.</p>
  </div>

  {#if !view.complete && !view.pending}
    <div class="mig-steps" aria-label="Migration overview">
      <div class="mig-step">
        <span class="mig-step-num">1</span>
        <p class="mig-step-title">Deploy your own copy</p>
        <p class="mig-step-desc"><a href="https://github.com/elkimek/get-based/fork" target="_blank" rel="noreferrer">Fork on GitHub</a> and deploy on Vercel or Cloudflare Pages (no terminal), or run locally.</p>
      </div>
      <div class="mig-step">
        <span class="mig-step-num">2</span>
        <p class="mig-step-title">Export from this browser</p>
        <p class="mig-step-desc">Set a new temporary transfer password below to pack your profiles, labs, wearables, meals &amp; files.</p>
      </div>
      <div class="mig-step">
        <span class="mig-step-num">3</span>
        <p class="mig-step-title">Restore at your new URL</p>
        <p class="mig-step-desc">Open <code>/app/migration.html</code> on your new HTTPS address, check the file summary, and restore.</p>
      </div>
    </div>
  {/if}

  {#if view.recoveryOnly}
    <div class="mig-banner mig-banner-warn">
      <p><strong>Personal use of this hosted address has ended.</strong> Download your saved records below and restore them at your self-hosted address. Keep this browser's data until you have verified the destination.</p>
    </div>
  {/if}

  {#if view.error}
    <div class="mig-banner mig-banner-error">
      <p role="alert">{view.error}</p>
    </div>
  {/if}

  <div class={view.downloadKind ? 'mig-banner mig-banner-ready' : 'mig-banner'}>
    <p role="status" aria-live="polite">{view.status}</p>
    {#if view.downloadKind}
      <button type="button" class={PROTECTION_PRIMARY} disabled={view.busy} onclick={() => actions.download()}>{view.downloadKind === 'migration' ? 'Download migration file' : 'Download saved backup'}</button>
    {/if}
  </div>

  {#if view.complete}
    <section class="mig-card mig-card-success">
      <span class="mig-card-kicker">Verified</span>
      <h2>Recovery verified</h2>
      <p class="mig-card-lead">All archived records and local Knowledge Base files passed the read-back check. Your original browser data was not erased.</p>
      <ul class="mig-checklist">
        <li>Open the app and verify your profiles, lab dates, notes, meals, wearables, and sent chats after a reload.</li>
        <li>If your records used an application passphrase, that original passphrase still protects them.</li>
        <li>Sync starts <strong>off</strong> with your saved identity and relay retained — re-enable it after checking your records.</li>
        <li>Reconnect wearable OAuth providers, re-pair Companion, and re-select your backup folder if used.</li>
        <li>If you recovered a wallet, spend from only one active installation; recovery does not move or spend funds.</li>
      </ul>
      <div class={PROTECTION_ACTIONS}>
        <a class={PROTECTION_PRIMARY} href="/app">Open getbased</a>
        {#if view.summary?.syncRecovery}<button type="button" class={PROTECTION_SECONDARY} onclick={() => actions.recoveryWords()}>Copy Sync recovery words</button>{/if}
      </div>
    </section>
  {:else}
    {#if !view.pending}
      <section class="mig-card">
        <div class="mig-card-head">
          <div>
            <span class="mig-card-kicker">Source browser</span>
            <h2>1. Download from this browser</h2>
          </div>
        </div>
        <p class="mig-card-lead">Create a <strong>new temporary password</strong> (at least 12 characters) to encrypt your transfer file — you will enter it once when restoring on your self-hosted address.</p>

        {#if view.sourceEncrypted}
          <div class="mig-field">
            <label class="mig-label" for="migration-original">Original application passphrase</label>
            <input class="mig-input" id="migration-original" type="password" autocomplete="current-password" placeholder="Enter your existing getbased unlock passphrase" bind:value={original} disabled={view.busy}/>
          </div>
        {/if}

        <div class="mig-field-grid">
          <div class="mig-field">
            <div class="mig-label-row">
              <label class="mig-label" for="migration-password">New transfer password (12+ chars)</label>
              <span class={passwordReady ? 'mig-hint mig-hint-ok' : 'mig-hint'}>{passwordReady ? 'Ready' : `${password.length} / 12`}</span>
            </div>
            <div class="mig-input-wrap">
              <input class="mig-input mig-input-with-toggle" id="migration-password" type={showExportPassword ? 'text' : 'password'} autocomplete="new-password" placeholder="Choose a temporary password" bind:value={password} disabled={view.busy}/>
              <button type="button" class="mig-toggle-btn" onclick={() => {showExportPassword = !showExportPassword;}}>{showExportPassword ? 'Hide' : 'Show'}</button>
            </div>
          </div>

          <div class="mig-field">
            <div class="mig-label-row">
              <label class="mig-label" for="migration-confirm">Repeat transfer password</label>
              {#if passwordMismatch}
                <span class="mig-hint mig-hint-warn">Does not match</span>
              {:else if confirm.length > 0 && passwordReady}
                <span class="mig-hint mig-hint-ok">Matches</span>
              {/if}
            </div>
            <input class="mig-input" id="migration-confirm" type={showExportPassword ? 'text' : 'password'} autocomplete="new-password" placeholder="Repeat the password" bind:value={confirm} disabled={view.busy}/>
          </div>
        </div>

        {#if view.recoveryOnly && view.legacySyncBlocked}
          <label class="mig-check"><input type="checkbox" bind:checked={allowWithoutSyncIdentity} disabled={view.busy}/> <span>Export all local health records without legacy Sync recovery words (you can set up Sync again after restoring).</span></label>
        {/if}

        <div class="mig-actions">
          <button type="button" class={PROTECTION_PRIMARY} disabled={!canPrepare} onclick={async () => {try {await actions.export(password, original, {allowMissingLegacySync: allowWithoutSyncIdentity});} finally {password = ''; confirm = ''; original = '';}}}>Prepare migration file</button>
        </div>

        <details class="mig-details">
          <summary>What is included &amp; before you export</summary>
          <ul>
            <li>Close other getbased tabs and installed windows first so saved records do not change mid-export.</li>
            <li>Use <strong>Start migration</strong> in Settings to flush pending text drafts; save or remove unsent image attachments beforehand.</li>
            <li>Includes all profiles, labs, meals, wearable history, local Knowledge Base files, chats, settings, saved snapshots, credentials, and wallet recovery records.</li>
            <li>Keep the transfer password separately from the file. Wearable OAuth logins, Companion pairing, backup folder permissions, and downloaded local models need setup again at the destination.</li>
          </ul>
        </details>
      </section>
    {/if}

    {#if !view.recoveryOnly}
      <section class="mig-card">
        <div class="mig-card-head">
          <div>
            <span class="mig-card-kicker">{view.pending ? 'Interrupted restore' : 'Destination browser'}</span>
            <h2>{view.pending ? 'Resume recovery' : '2. Restore at your new address'}</h2>
          </div>
        </div>
        <p class="mig-card-lead">{view.pending ? 'Enter the transfer password to resume the retained encrypted file, or reselect the original file if needed.' : 'Open this page on a fresh self-hosted installation (or installed PWA) to verify and restore your downloaded migration file.'}</p>

        <div class="mig-field-grid">
          <div class="mig-field">
            <label class="mig-label" for="migration-file">Migration file{view.pending ? ' (reselect if needed)' : ''}</label>
            <input class="mig-input" id="migration-file" type="file" bind:this={fileInput} accept="application/json,.json" disabled={view.busy} onchange={event => {file = event.currentTarget.files?.[0] ?? null; consent = false; importPassword = ''; importOriginal = ''; actions.cancel();}}/>
          </div>

          <div class="mig-field">
            <label class="mig-label" for="migration-import-password">Transfer password</label>
            <div class="mig-input-wrap">
              <input class="mig-input mig-input-with-toggle" id="migration-import-password" type={showImportPassword ? 'text' : 'password'} autocomplete="off" placeholder="Password used when exporting" bind:value={importPassword} disabled={view.busy}/>
              <button type="button" class="mig-toggle-btn" onclick={() => {showImportPassword = !showImportPassword;}}>{showImportPassword ? 'Hide' : 'Show'}</button>
            </div>
          </div>
        </div>

        <div class="mig-actions">
          <button type="button" class={PROTECTION_SECONDARY} disabled={view.busy || (!file && !view.pending) || !importPassword} onclick={() => actions.inspect(file, importPassword)}>Check file</button>
        </div>

        {#if view.summary}
          <div class="mig-summary" data-migration-summary>
            <p class="mig-summary-origin">Exported from <strong>{view.summary.sourceOrigin}</strong>{view.summary.walletRecovery ? ' · Wallet recovery included' : ''}</p>
            <div class="mig-summary-grid">
              <div class="mig-stat"><span class="mig-stat-val">{view.summary.profiles}</span><span class="mig-stat-lbl">Profiles</span></div>
              <div class="mig-stat"><span class="mig-stat-val">{view.summary.meals}</span><span class="mig-stat-lbl">Meals</span></div>
              <div class="mig-stat"><span class="mig-stat-val">{view.summary.wearableRows}</span><span class="mig-stat-lbl">Wearable days</span></div>
              <div class="mig-stat"><span class="mig-stat-val">{view.summary.chatRecords}</span><span class="mig-stat-lbl">Saved chats</span></div>
              <div class="mig-stat"><span class="mig-stat-val">{view.summary.textDrafts}</span><span class="mig-stat-lbl">Text drafts</span></div>
              <div class="mig-stat"><span class="mig-stat-val">{view.summary.savedSnapshots}</span><span class="mig-stat-lbl">Saved backups</span></div>
              <div class="mig-stat"><span class="mig-stat-val">{view.summary.files}</span><span class="mig-stat-lbl">KB files</span></div>
            </div>
          </div>

          {#if view.summary.encrypted}
            <div class="mig-field mig-field-spaced">
              <label class="mig-label" for="migration-import-original">Original application passphrase</label>
              <input class="mig-input" id="migration-import-original" type="password" autocomplete="off" placeholder="Enter the original getbased unlock passphrase" bind:value={importOriginal} disabled={view.busy}/>
            </div>
          {/if}

          <label class="mig-check"><input type="checkbox" bind:checked={consent} disabled={view.busy}/> <span>I am restoring into the intended installation and will keep the source until I check my records.</span></label>

          <div class="mig-actions">
            <button type="button" class={PROTECTION_PRIMARY} disabled={view.busy || !consent || (view.summary.encrypted && !importOriginal)} onclick={async () => {try {await actions.restore(importPassword, importOriginal);} finally {importPassword = ''; importOriginal = '';}}}>Restore migration file</button>
            {#if view.summary.syncRecovery}<button type="button" class={PROTECTION_SECONDARY} disabled={view.busy} onclick={() => actions.recoveryWords()}>Copy Sync recovery words</button>{/if}
            {#if !view.pending}<button type="button" class={PROTECTION_SECONDARY} disabled={view.busy} onclick={() => {actions.cancel(); clearSecrets();}}>Cancel</button>{/if}
          </div>
        {/if}

        <details class="mig-details">
          <summary>Destination &amp; PWA notes</summary>
          <ul>
            <li>Some browsers keep installed PWA storage separate from browser tabs. If you plan to use an installed PWA, install and open it first before restoring.</li>
            <li>Use the same full HTTPS address on every device. Existing records at the destination are protected from accidental overwrite.</li>
          </ul>
        </details>
      </section>
    {/if}

    {#if view.snapshots.length && !view.pending}
      <section class="mig-card">
        <div class="mig-card-head">
          <div>
            <span class="mig-card-kicker">Optional fallback</span>
            <h2>Recover an older saved backup</h2>
          </div>
        </div>
        <p class="mig-card-lead">Download a saved snapshot without restoring it over this browser. Ordinary snapshots do not include every store in a full migration file.</p>
        <div class="mig-snapshot-list">
          {#each view.snapshots as snapshot}
            <div class="mig-snapshot-row">
              <span>{snapshot.date}{#if snapshot.encrypted}<span class="mig-pill">Encrypted</span>{/if}</span>
              <button type="button" class={PROTECTION_SECONDARY} disabled={view.busy} onclick={() => actions.snapshot(snapshot.index)}>Prepare saved backup</button>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</main>
