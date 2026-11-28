<script lang="ts">
  import { untrack } from 'svelte';
  import type { MigrationViewState, MigrationActions } from '../migration-view.js';
  import { PROTECTION_PRIMARY, PROTECTION_SECONDARY, PROTECTION_ACTIONS } from '../settings-protection-classes.js';
  import { VERCEL_DEPLOY_URL, CLOUDFLARE_DEPLOY_URL, normalizeDestinationOrigin } from '../migration-handoff.js';
  let {initial, actions}: {initial: MigrationViewState; actions: MigrationActions} = $props();
  let view = $state(untrack(() => initial));
  let destinationUrl = $state('');
  let confirmDestinationOrigin = $state('');
  let autoOriginal = $state('');
  let password = $state(''), confirm = $state(''), original = $state(''), importPassword = $state(''), importOriginal = $state('');
  let showExportPassword = $state(false), showImportPassword = $state(false);
  let file: File | null = $state(null);
  let fileInput: HTMLInputElement | undefined = $state();
  let consent = $state(false);
  let allowWithoutSyncIdentity = $state(false);
  const passwordReady = $derived(password.length >= 12);
  const passwordMismatch = $derived(confirm.length > 0 && password !== confirm);
  const destinationCheck = $derived.by(() => {
    if (!destinationUrl.trim()) return {origin: '', error: ''};
    try { return {origin: normalizeDestinationOrigin(destinationUrl), error: ''}; }
    catch (error) { return {origin: '', error: error instanceof Error ? error.message : 'Enter a valid self-hosted URL.'}; }
  });
  const canPrepare = $derived(!view.busy && passwordReady && password === confirm && (!view.recoveryOnly || !view.legacySyncBlocked || allowWithoutSyncIdentity));
  const canAutoTransfer = $derived(!view.busy && destinationCheck.origin.length > 0 && confirmDestinationOrigin === destinationCheck.origin && (!view.sourceEncrypted || autoOriginal.length > 0) && (!view.recoveryOnly || !view.legacySyncBlocked || allowWithoutSyncIdentity));
  const isIncomingHandoff = $derived(view.handoffMode === 'receiving' || view.handoffMode === 'ready');
  export function update(next: MigrationViewState) {
    view = next;
  }
  export function clearSecrets() {password = ''; confirm = ''; original = ''; autoOriginal = ''; confirmDestinationOrigin = ''; importPassword = ''; importOriginal = ''; showExportPassword = false; showImportPassword = false; file = null; consent = false; allowWithoutSyncIdentity = false; if (fileInput) fileInput.value = '';}
</script>
<header class="mig-topbar">
  <div class="mig-topbar-inner">
    <div class="mig-brand">
      <span class="mig-brand-wordmark">getbased</span>
      <span class="mig-badge">{view.recoveryOnly ? 'Hosted Recovery' : 'Data Migration'}</span>
    </div>
    <nav class="mig-nav" aria-label="Migration navigation">
      {#if view.recoveryOnly}
        <a class="mig-nav-link" href="https://getbased.health/self-hosting" target="_blank" rel="noreferrer">Self-hosting announcement</a>
      {:else if !view.pending}
        <a class="mig-nav-link" href="/app">Back to getbased</a>
      {/if}
      <a class="mig-nav-link" href="https://docs.getbased.health/guides/self-hosting" target="_blank" rel="noreferrer">Self-hosting guide</a>
      <a class="mig-nav-link mig-nav-link-accent" href="https://github.com/elkimek/get-based/fork" target="_blank" rel="noreferrer">Fork on GitHub</a>
    </nav>
  </div>
</header>

<main class="mig-shell" data-migration-view aria-busy={view.busy}>
  <div class="mig-hero">
    <h1>{view.recoveryOnly ? 'Recover your hosted records' : isIncomingHandoff ? 'Finish moving your getbased data' : 'Move getbased to your own URL'}</h1>
    <p class="mig-hero-sub">{isIncomingHandoff ? 'Your records were transferred directly from your original browser tab — zero servers saw your health data.' : 'Deploy your personal copy in one click, paste your new URL, and transfer everything automatically — no transfer password or manual file upload needed.'}</p>
  </div>

  {#if view.recoveryOnly}
    <div class="mig-banner mig-banner-warn">
      <p><strong>Personal use of this hosted address has ended.</strong> Move your saved records to your own self-hosted address below. Keep this browser's data until you have checked the destination.</p>
    </div>
  {/if}

  {#if view.error}
    <div class="mig-banner mig-banner-error">
      <p role="alert">{view.error}</p>
    </div>
  {/if}

  <div class={view.downloadKind || view.handoffMode === 'sent' || view.handoffMode === 'ready' ? 'mig-banner mig-banner-ready' : 'mig-banner'}>
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
        <li>Open your new app and check your profiles, lab dates, notes, meals, wearables, and sent chats after a reload.</li>
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
  {:else if isIncomingHandoff}
    <section class="mig-card mig-card-featured">
      <span class="mig-card-kicker">Automatic browser-to-browser transfer</span>
      <h2>{view.handoffMode === 'receiving' ? 'Receiving your data…' : 'Ready to restore into this app'}</h2>
      {#if view.handoffMode === 'receiving'}
        <p class="mig-card-lead">Connecting directly to <strong>{view.handoffOrigin}</strong> in your browser. Keep the original tab open — this takes just a few seconds.</p>
      {:else if view.summary}
        <p class="mig-card-lead">Everything transferred cleanly directly in your browser. Review the summary and confirm below to finish.</p>
        <div class="mig-summary" data-migration-summary>
          <p class="mig-summary-origin">Transferred from <strong>{view.summary.sourceOrigin}</strong>{view.summary.walletRecovery ? ' · Wallet recovery included' : ''}</p>
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
            <input class="mig-input" id="migration-import-original" type="password" autocomplete="off" placeholder="Enter your existing getbased unlock passphrase" bind:value={importOriginal} disabled={view.busy}/>
          </div>
        {/if}
        <label class="mig-check"><input type="checkbox" bind:checked={consent} disabled={view.busy}/> <span>I am restoring into my own getbased installation and will keep the original browser tab until I check my records.</span></label>
        <div class="mig-actions">
          <button type="button" class={PROTECTION_PRIMARY} disabled={view.busy || !consent || (view.summary.encrypted && !importOriginal)} onclick={async () => {try {await actions.restoreHandoff(importOriginal);} finally {importOriginal = '';}}}>Restore migration file</button>
          {#if view.summary.syncRecovery}<button type="button" class={PROTECTION_SECONDARY} disabled={view.busy} onclick={() => actions.recoveryWords()}>Copy Sync recovery words</button>{/if}
          <button type="button" class={PROTECTION_SECONDARY} disabled={view.busy} onclick={() => {actions.cancel(); clearSecrets();}}>Cancel</button>
        </div>
      {/if}
    </section>
  {:else}
    {#if !view.pending}
      <section class="mig-card mig-card-featured">
        <span class="mig-card-kicker">Recommended · Fastest path</span>
        <h2>One-click deploy &amp; automatic transfer</h2>
        <p class="mig-card-lead">No terminal, no transfer password to invent, and no manual file upload. Your data transfers encrypted directly between your two browser tabs.</p>

        <div class="mig-deploy-block">
          <div class="mig-substep-title"><span class="mig-step-num">1</span> Deploy your own personal copy</div>
          <div class="mig-deploy-grid">
            <a class="mig-deploy-btn mig-deploy-vercel" href={VERCEL_DEPLOY_URL} target="_blank" rel="noreferrer">
              <span class="mig-deploy-logo" aria-hidden="true">
                <svg width="18" height="16" viewBox="0 0 76 65" fill="currentColor"><path d="M37.5274 0L75.0548 65H0L37.5274 0Z"/></svg>
              </span>
              <span class="mig-deploy-copy">
                <strong>Deploy with Vercel</strong>
                <span>Recommended · includes /api/proxy · free tier</span>
              </span>
              <span class="mig-deploy-arrow" aria-hidden="true">↗</span>
            </a>
            <a class="mig-deploy-btn mig-deploy-cloudflare" href={CLOUDFLARE_DEPLOY_URL} target="_blank" rel="noreferrer">
              <span class="mig-deploy-logo" aria-hidden="true">
                <svg width="22" height="15" viewBox="0 0 48 32" fill="currentColor"><path d="M36.3 15.2c-.3 0-.6 0-.9.1.4-1.1.6-2.2.6-3.4C36 6.4 31.5 2 26 2c-4.3 0-8 2.7-9.4 6.5-.8-.3-1.7-.5-2.6-.5-4.1 0-7.5 3.2-7.9 7.2C2.6 15.8 0 18.8 0 22.4 0 26.6 3.4 30 7.6 30h28.7c4.2 0 7.7-3.3 7.7-7.4 0-4.1-3.5-7.4-7.7-7.4z"/></svg>
              </span>
              <span class="mig-deploy-copy">
                <strong>Deploy to Cloudflare</strong>
                <span>Static PWA · global edge · free tier</span>
              </span>
              <span class="mig-deploy-arrow" aria-hidden="true">↗</span>
            </a>
          </div>
          <p class="mig-deploy-note">Sign in with GitHub, choose <strong>Private repository</strong> (recommended), click <strong>Create / Deploy</strong>, and copy your new address (for example <code>https://my-getbased.vercel.app</code>).</p>
        </div>

        <div class="mig-transfer-block">
          <div class="mig-substep-title"><span class="mig-step-num">2</span> Transfer your data automatically</div>
          {#if view.sourceEncrypted}
            <div class="mig-field">
              <label class="mig-label" for="migration-auto-original">Your current getbased unlock passphrase</label>
              <input class="mig-input" id="migration-auto-original" type="password" autocomplete="current-password" placeholder="Enter your existing getbased unlock passphrase" bind:value={autoOriginal} disabled={view.busy}/>
            </div>
          {/if}
          <div class="mig-transfer-row">
            <div class="mig-field mig-transfer-input-col">
              <label class="mig-label" for="migration-destination">Your new getbased URL</label>
              <input class="mig-input" id="migration-destination" type="url" inputmode="url" placeholder="https://my-getbased.vercel.app" bind:value={destinationUrl} disabled={view.busy}/>
            </div>
            <button type="button" class={`${PROTECTION_PRIMARY} mig-transfer-cta`} disabled={!canAutoTransfer} onclick={async () => {try {await actions.transfer(destinationCheck.origin, autoOriginal, {allowMissingLegacySync: allowWithoutSyncIdentity});} finally {autoOriginal = ''; confirmDestinationOrigin = '';}}}>Move my data automatically →</button>
          </div>
          {#if destinationCheck.error}
            <p class="mig-hint mig-hint-warn" role="alert">{destinationCheck.error}</p>
          {:else if destinationCheck.origin}
            <label class="mig-check">
              <input type="checkbox" data-handoff-confirm checked={confirmDestinationOrigin === destinationCheck.origin} disabled={view.busy} onchange={event => {confirmDestinationOrigin = event.currentTarget.checked ? destinationCheck.origin : '';}}/>
              <span>I deployed <strong>{destinationCheck.origin}</strong> myself and want to send all my getbased records to this address.</span>
            </label>
          {/if}
          {#if view.recoveryOnly && view.legacySyncBlocked}
            <label class="mig-check"><input type="checkbox" bind:checked={allowWithoutSyncIdentity} disabled={view.busy}/> <span>Transfer all local health records without legacy Sync recovery words (you can set up Sync again after restoring).</span></label>
          {/if}
        </div>
      </section>

      <div class="mig-divider"><span>Or move manually with an encrypted file (offline or another device)</span></div>
    {/if}

    {#if !view.pending}
      <section class="mig-card">
        <div class="mig-card-head">
          <div>
            <span class="mig-card-kicker">Manual export · Source browser</span>
            <h2>1. Download from this browser</h2>
          </div>
        </div>
        <p class="mig-card-lead">Create a <strong>new temporary password</strong> (at least 12 characters) to encrypt a portable migration file for offline transfer or moving to another device.</p>

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
            <span class="mig-card-kicker">{view.pending ? 'Interrupted restore' : 'Manual restore · Destination browser'}</span>
            <h2>{view.pending ? 'Resume recovery' : '2. Restore at your new address'}</h2>
          </div>
        </div>
        <p class="mig-card-lead">{view.pending ? (view.pendingHandoff ? 'An automatic transfer was interrupted before finishing. Return to your original getbased tab and click Move my data automatically again, or choose a manual migration file below.' : 'Enter the transfer password to resume the retained encrypted file, or reselect the original file if needed.') : 'Open this page on a fresh self-hosted installation (or installed PWA) to verify and restore a downloaded migration file.'}</p>

        <div class="mig-field-grid">
          <div class="mig-field">
            <label class="mig-label" for="migration-file">Migration file{view.pending && !view.pendingHandoff ? ' (reselect if needed)' : ''}</label>
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
          <button type="button" class={PROTECTION_SECONDARY} disabled={view.busy || (!file && (!view.pending || view.pendingHandoff)) || !importPassword} onclick={() => actions.inspect(file, importPassword)}>Check file</button>
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
