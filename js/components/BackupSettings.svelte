<script lang="ts">
  import { untrack } from 'svelte';
  import FolderBackupSettings from './FolderBackupSettings.svelte';
  import type { BackupSettingsSnapshot, BackupSnapshotRow, FolderBackupSnapshot } from '../settings-protection-contract.js';
  import { PROTECTION_PRIMARY, PROTECTION_SECONDARY, PROTECTION_RESTORE, PROTECTION_ACTIONS } from '../settings-protection-classes.js';
  let { initial }: { initial: BackupSettingsSnapshot } = $props();
  let snapshot = $state(untrack(() => initial));
  let rows: readonly BackupSnapshotRow[] = $state([]);
  let open = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();
  export function refresh(next: BackupSettingsSnapshot): void { snapshot = next; }
  export function refreshFolder(folder: FolderBackupSnapshot): void { snapshot = { ...snapshot, folder }; }
  export function setSnapshots(next: readonly BackupSnapshotRow[]): void { rows = next; if (!rows.length) open = false; }
  export function toggleSnapshots(): void { if (rows.length) open = !open; }
</script>
<div data-protection-view="backup">
  <div class="ai-provider-desc gb:protection:text-[12px] gb:protection:text-secondary gb:protection:leading-[1.5] gb:protection:mb-2.5">Back up saved profiles, settings, sent chat history, and supported local records.
    {#if snapshot.encrypted}Backups inherit encryption — same passphrase required to restore.
    {:else}Backups are unencrypted and omit provider credentials. To include API keys, enable passphrase encryption in Security before downloading.{/if}
    Restore Backup also accepts Export All Clients files and merges their client data.
  </div>
  <details class="gb:protection:text-[12px] gb:protection:text-secondary gb:protection:mb-2.5">
    <summary>What needs separate recovery?</summary>
    <p>Wearable connections must be reconnected. Unsent chat drafts, WHOOP and Google Health raw histories, local Knowledge Base libraries, downloaded models, and wallet funds are not included in this backup. Keep this browser's data until you have checked your new installation.</p>
  </details>
  <div class={PROTECTION_ACTIONS}>
    <button type="button" class={PROTECTION_PRIMARY} data-crypto-action="open-migration">Start migration</button>
    <button type="button" class={PROTECTION_PRIMARY} data-crypto-action="export-backup">Download Backup</button>
    <button type="button" class={PROTECTION_SECONDARY} onclick={() => fileInput?.click()}>Restore Backup</button>
    <input bind:this={fileInput} type="file" accept=".json" class="gb:protection:hidden" hidden aria-label="Restore Backup file" data-crypto-action="import-backup">
  </div>
  <div class="backup-auto-status gb:protection:text-[12px] gb:protection:text-secondary gb:protection:mt-3 gb:protection:mb-2">{snapshot.autoStatus}</div>
  <button type="button" id="backup-snapshots-toggle" class="backup-snapshots-toggle gb:protection:text-[13px] gb:protection:text-secondary gb:protection:bg-transparent gb:protection:border-0 gb:protection:[font-family:inherit] gb:protection:cursor-pointer gb:protection:py-1 gb:protection:px-0 gb:protection:mb-1.5 gb:protection:[@media(pointer:coarse)]:min-h-11 gb:protection:select-none gb:protection:[&[hidden]]:hidden gb:protection:hover:text-ink gb:protection:focus-visible:outline-2 gb:protection:focus-visible:outline-offset-2 gb:protection:focus-visible:outline-accent" data-crypto-action="toggle-backup-snapshots" hidden={!rows.length} aria-expanded={open} aria-controls="backup-snapshot-list">
    <span class="privacy-configure-arrow" id="backup-snapshots-arrow" aria-hidden="true">{open ? '▼' : '▶'}</span> Recent snapshots
  </button>
  <div id="backup-snapshot-list" class="backup-snapshot-list gb:protection:[&[hidden]]:hidden gb:protection:flex gb:protection:flex-col gb:protection:gap-1.5" hidden={!open}>
    <p class="gb:protection:text-[12px] gb:protection:text-secondary">Download a saved snapshot to recover it in another browser or installation. Restore replaces the current data in this browser.</p>
    {#each rows as row, index (`${typeof row.id}:${row.id ?? index}`)}
      <div class="backup-snapshot-item gb:protection:flex gb:protection:items-center gb:protection:justify-between gb:protection:gap-2 gb:protection:px-3 gb:protection:py-2 gb:protection:rounded-control gb:protection:border gb:protection:border-line gb:protection:bg-surface">
        <div class="backup-snapshot-info gb:protection:flex gb:protection:flex-col gb:protection:gap-0.5 gb:protection:min-w-0">
          <span class="backup-snapshot-date gb:protection:text-[13px] gb:protection:text-ink gb:protection:break-words">{row.dateLabel}</span>
          <span class="backup-snapshot-meta gb:protection:text-[11px] gb:protection:text-secondary">{row.profileCount} profile(s){row.encrypted ? ' • encrypted' : ''}</span>
        </div>
        <div class={PROTECTION_ACTIONS}>
          <button type="button" class={PROTECTION_RESTORE} data-crypto-action="export-auto-backup" data-crypto-snapshot-id={row.id ?? undefined} data-crypto-snapshot-id-type={typeof row.id === 'number' ? 'number' : 'string'} aria-label={'Download snapshot from ' + row.dateLabel} disabled={row.id === null}>Download</button>
          <button type="button" class={PROTECTION_RESTORE} data-crypto-action="restore-auto-backup" data-crypto-snapshot-id={row.id ?? undefined} data-crypto-snapshot-id-type={typeof row.id === 'number' ? 'number' : 'string'} disabled={row.id === null}>Restore</button>
        </div>
      </div>
    {/each}
  </div>
  <div id="backup-folder-section"><FolderBackupSettings snapshot={snapshot.folder}/></div>
</div>
