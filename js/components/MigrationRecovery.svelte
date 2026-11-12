<script lang="ts">
  import { untrack } from 'svelte';
  import type { MigrationViewState, MigrationActions } from '../migration-view.js';
  import { PROTECTION_PRIMARY, PROTECTION_SECONDARY, PROTECTION_ACTIONS } from '../settings-protection-classes.js';
  let {initial, actions}: {initial: MigrationViewState; actions: MigrationActions} = $props();
  let view = $state(untrack(() => initial));
  let password = $state(''), confirm = $state(''), original = $state(''), importPassword = $state(''), importOriginal = $state('');
  let file: File | null = $state(null);
  let fileInput: HTMLInputElement | undefined = $state();
  let consent = $state(false);
  const inputClass = 'gb:protection:block gb:protection:w-full gb:protection:box-border gb:protection:min-h-11 gb:protection:mt-1 gb:protection:mb-4 gb:protection:px-3 gb:protection:py-2 gb:protection:rounded-control gb:protection:border gb:protection:border-line gb:protection:bg-surface gb:protection:text-ink gb:protection:[font-family:inherit]';
  const sectionClass = 'gb:protection:mt-6 gb:protection:p-5 gb:protection:rounded-control gb:protection:border gb:protection:border-line gb:protection:bg-surface';
  export function update(next: MigrationViewState) {view = next;}
  export function clearSecrets() {password = ''; confirm = ''; original = ''; importPassword = ''; importOriginal = ''; file = null; consent = false; if (fileInput) fileInput.value = '';}
</script>
<main class="gb:protection:max-w-[760px] gb:protection:mx-auto gb:protection:p-4 gb:protection:text-ink gb:protection:[font-family:inherit]" data-migration-view aria-busy={view.busy}>
  <a href="https://docs.getbased.health/guides/self-hosting" target="_blank" rel="noreferrer">Installation guide</a>
  {#if !view.pending}<a href="/app">Back to getbased</a>{/if}
  <h1>{view.recoveryOnly ? 'Recover your hosted records' : 'Move your getbased data'}</h1>
  <p>Keep this browser's data until you have restored your migration file and checked the records at your new address.</p>
  <p role="status" aria-live="polite">{view.status}</p>
  {#if view.downloadKind}<button type="button" class={PROTECTION_PRIMARY} disabled={view.busy} onclick={() => actions.download()}>{view.downloadKind === 'migration' ? 'Download migration file' : 'Download saved backup'}</button>{/if}
  {#if view.error}<p role="alert" class="gb:protection:text-red">{view.error}</p>{/if}
  {#if view.recoveryOnly}<p>Personal use of this hosted app has ended. Download your saved records here, then restore them at your own self-hosted address. Recovery remains available at this original address. Keep this browser data until you have checked the destination.</p>{/if}
  {#if view.complete}
    <section class={sectionClass}>
      <h2>Recovery verified</h2>
      <p>All archived records and local Knowledge Base files passed the read-back check. Open the app to check your profiles, important dates, notes, meals and sent chats. The original application passphrase still protects encrypted records.</p>
      <p>Sync is off. Its saved identity and relay are retained; enable it after checking your records. Reconnect wearable providers, pair the Companion and select your backup folder again. Downloaded models can be downloaded again.</p>
      <p>If you recovered a wallet, keep only one active installation for spending. Its proofs and recovery journals are included in the file; recovery does not move or spend funds.</p>
      <div class={PROTECTION_ACTIONS}>
        <a class={PROTECTION_PRIMARY} href="/app">Open getbased</a>
        {#if view.summary?.syncRecovery}<button type="button" class={PROTECTION_SECONDARY} onclick={() => actions.recoveryWords()}>Copy Sync recovery words</button>{/if}
      </div>
    </section>
  {:else}
    {#if !view.pending}
      <section class={sectionClass}>
        <h2>1. Download from this browser</h2>
        <p>Close other getbased tabs and installed windows first. Use <strong>Start migration</strong> in Settings to save pending text drafts before arriving here. Save or remove unsent image attachments first; their originals exist only in memory.</p>
        {#if view.sourceEncrypted}<label for="migration-original">Original application passphrase</label><input class={inputClass} id="migration-original" type="password" autocomplete="current-password" bind:value={original} disabled={view.busy}/>{/if}
        <label for="migration-password">Migration file password (at least 12 characters)</label>
        <input class={inputClass} id="migration-password" type="password" autocomplete="new-password" bind:value={password} disabled={view.busy}/>
        <label for="migration-confirm">Repeat migration file password</label>
        <input class={inputClass} id="migration-confirm" type="password" autocomplete="new-password" bind:value={confirm} disabled={view.busy}/>
        <button type="button" class={PROTECTION_PRIMARY} disabled={view.busy || password.length < 12 || password !== confirm} onclick={async () => {try {await actions.export(password, original);} finally {password = ''; confirm = ''; original = '';}}}>Prepare migration file</button>
        <p>The password protects all archived data, including credentials and wallet recovery records. Keep it separately from the file. Wearable logins, Companion pairing, backup folder permissions and downloaded models need setup again.</p>
      </section>
    {/if}
    {#if !view.recoveryOnly}<section class={sectionClass}>
      <h2>{view.pending ? 'Resume recovery' : '2. Restore at your new address'}</h2>
      <p>Some browsers keep installed-app storage separate. If you plan to use the installed app, install and open it before restoring.</p>
      <p>Use the same full HTTPS address on each device. This browser must be a fresh installation. Existing records and connected accounts are protected from being overwritten.</p>
        <label for="migration-file">Migration file{view.pending ? ' (reselect if needed)' : ''}</label>
        <input class={inputClass} id="migration-file" type="file" bind:this={fileInput} accept="application/json,.json" disabled={view.busy} onchange={event => {file = event.currentTarget.files?.[0] ?? null; consent = false; importPassword = ''; importOriginal = ''; actions.cancel();}}/>
      {#if view.pending}<p>Enter the password to resume the retained encrypted file. If its saved copy is unavailable, reselect your original downloaded file. Keep the original browser data.</p>{/if}
      <label for="migration-import-password">Migration file password</label>
      <input class={inputClass} id="migration-import-password" type="password" autocomplete="off" bind:value={importPassword} disabled={view.busy}/>
      <button type="button" class={PROTECTION_SECONDARY} disabled={view.busy || (!file && !view.pending) || !importPassword} onclick={() => actions.inspect(file, importPassword)}>Check file</button>
      {#if view.summary}
        <div data-migration-summary>
          <p>From {view.summary.sourceOrigin}</p>
          <p>{view.summary.profiles} profiles · {view.summary.meals} meals · {view.summary.wearableRows} wearable day records</p>
          <p>{view.summary.chatRecords} saved chat records · {view.summary.textDrafts} text drafts · {view.summary.savedSnapshots} saved backups</p>
          <p>{view.summary.files} local Knowledge Base files{view.summary.walletRecovery ? ' · wallet recovery included' : ''}</p>
        </div>
        {#if view.summary.encrypted}<label for="migration-import-original">Original application passphrase</label><input class={inputClass} id="migration-import-original" type="password" autocomplete="off" bind:value={importOriginal} disabled={view.busy}/>{/if}
        <label><input type="checkbox" bind:checked={consent} disabled={view.busy}/> I am restoring into the intended installation and will keep the source until I check my records.</label>
        <div class={PROTECTION_ACTIONS}>
          <button type="button" class={PROTECTION_PRIMARY} disabled={view.busy || !consent || (view.summary.encrypted && !importOriginal)} onclick={async () => {try {await actions.restore(importPassword, importOriginal);} finally {importPassword = ''; importOriginal = '';}}}>Restore migration file</button>
          {#if view.summary.syncRecovery}<button type="button" class={PROTECTION_SECONDARY} disabled={view.busy} onclick={() => actions.recoveryWords()}>Copy Sync recovery words</button>{/if}
          {#if !view.pending}<button type="button" class={PROTECTION_SECONDARY} disabled={view.busy} onclick={() => {actions.cancel(); clearSecrets();}}>Cancel</button>{/if}
        </div>
      {/if}
    </section>
    {/if}
    {#if view.snapshots.length && !view.pending}
      <section class={sectionClass}>
        <h2>Recover an older saved backup</h2>
        <p>Download a saved snapshot without restoring it over this browser. An encrypted snapshot needs its original passphrase. These ordinary backups do not include every store in a migration file.</p>
        {#each view.snapshots as snapshot}
          <p>{snapshot.date}{snapshot.encrypted ? ' · encrypted' : ''} <button type="button" class={PROTECTION_SECONDARY} disabled={view.busy} onclick={() => actions.snapshot(snapshot.index)}>Prepare saved backup</button></p>
        {/each}
      </section>
    {/if}
  {/if}
</main>
