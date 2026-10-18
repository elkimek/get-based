<script lang="ts">
  import {syncInlineStyles} from '../sync-inline-style-map.generated.js';
  import type { SyncDiagnoseView } from '../sync-diagnose-projector.js';
  let { view }: { view: SyncDiagnoseView } = $props();
  function storageValueAttributes(value: string): Record<string, string> {
    return {'aria-valuenow': value};
  }
</script><svelte:options preserveWhitespace={true} />{#snippet summary(s: SyncDiagnoseView['summary'])}<section
        class="sync-diagnose-summary sync-diagnose-summary-{s.tone}" data-sync-diagnose-summary="{s.tone}">
    <div
        class="sync-diagnose-summary-icon" aria-hidden="true">{s.icon}</div>
    <div
        class="sync-diagnose-summary-content">
      <div
        class="sync-diagnose-summary-eyebrow">{s.eyebrow}</div>
      <h4>{s.title}</h4>
      <p>{s.detail}</p>
      <div
        class="sync-diagnose-summary-badges">
        <span>{s.syncLabel}</span>
        <span>{s.relayLabel}</span>
        <span>{s.storageLabel}</span>
      </div>
    </div>
  </section>{/snippet}{#snippet device()}<section
        class="sync-diagnose-device-check">
    <div>
      <div
        class="sync-diagnose-card-label">Checking another device?</div>
      <div
        class="sync-diagnose-device-title">Compare the Sync identity code first</div>
      <p>Open Settings → Data → Cross-device sync on both devices. The safe identity codes must match. Then press <b>Sync now</b> on each device.</p>
    </div>
    <div
        class="sync-diagnose-device-code"><span>This device</span><strong>{view.device}</strong></div>
  </section>{/snippet}{#snippet health(h: SyncDiagnoseView['health'])}<section
        class="sync-diagnose-card sync-diagnose-health-card">
    <div
        class="sync-diagnose-card-head">
      <div>
        <div
        class="sync-diagnose-card-label">Relay connection</div>
        <div
        class="sync-diagnose-card-title">{h.label}</div>
      </div>
      <span
        class="sync-diagnose-badge sync-diagnose-badge-{h.tone}">{h.badge}</span>
    </div>
    <p
        class="sync-diagnose-card-copy">{h.detail}</p>
  </section>{/snippet}{#snippet storage(s: NonNullable<SyncDiagnoseView['storage']>)}<section
        class="sync-diagnose-card sync-diagnose-storage-card">
    <div
        class="sync-diagnose-card-head">
      <div>
        <div
        class="sync-diagnose-card-label">Relay storage</div>
        <div
        class="sync-diagnose-card-title"><span
        style="color:{s.color}">{s.mb} of {s.capMb} MB used</span></div>
      </div>
      <button

        class="ctx-btn-option sync-diagnose-refresh"
        data-sync-diagnose-action="refresh-relay-storage"
        title="Get the current usage directly from the relay.">Refresh usage</button>
    </div>
    <div
        class="sync-diagnose-storage-track"
        role="progressbar"
        aria-label="Relay storage used" aria-valuemin="0" aria-valuemax="100" {...storageValueAttributes(s.pct)}><span
        style="width:{s.width}%;background:{s.color}"></span></div>
    <div
        class="sync-diagnose-card-footer"><p
        class="sync-diagnose-card-copy">{s.note}</p>{#if s.compact}<button

        class="ctx-btn-option sync-diagnose-storage-action"
        data-sync-diagnose-action="compact-relay"
        title="Rebuilds the encrypted relay history from this device after confirmation.">Reduce storage…</button>{/if}</div>
  </section>{/snippet}{#snippet rows()}{#if view.rows.empty}<tr><td colspan="7"
        style={syncInlineStyles.emptyTable}>No rows in local Evolu DB</td></tr>{:else}{#each view.rows.rows as row}<tr><td
        style={syncInlineStyles.storageName}>{row.profileId}{#if row.payload} <span
        style={syncInlineStyles.storageOverflowHint}
        title="profileId column empty; recovered from payload">*</span>{/if}</td><td
        style={syncInlineStyles.storageBytes}>{#if row.deleted}<span
        style={syncInlineStyles.storageWarning}>yes</span>{:else}no{/if}</td><td
        style={syncInlineStyles.storageType}>{row.syncedAt}</td><td
        style={syncInlineStyles.storageValue}>{row.sun}</td><td
        style={syncInlineStyles.storageValue}>{row.dev}</td><td
        style={syncInlineStyles.storagePercent}>{row.bytes}b</td><td
        style={syncInlineStyles.storageBytes}>{#if row.format === 'gz'}<span
        title="gzip envelope (v1.6.4)"
        style={syncInlineStyles.successText}>gz</span>{:else if row.format === 'invalid'}<span
        title="payload could not be decoded"
        style={syncInlineStyles.warningText}>invalid</span>{:else}plain{/if}</td></tr>{/each}{/if}{/snippet}{#snippet telemetry(t: NonNullable<SyncDiagnoseView['telemetry']>)}<div
        style={syncInlineStyles.diagnosticCard}>
    <div
        style={syncInlineStyles.diagnosticCardHeader}>
      <b>Push efficiency <span
        style={syncInlineStyles.diagnosticCaption}>(last {t.count} pushes — lower % = leaner sync)</span></b>
      <button

        class="ctx-btn-option"
        style={syncInlineStyles.diagnosticControl}
        data-sync-diagnose-action="reset-delta-telemetry"
        title="Clears just the recent-push log shown here. Your data and relay state aren't touched.">Reset</button>
    </div>
    <div
        style={syncInlineStyles.sectionTitle}>
      <span
        style="color:{t.ratioColor};{syncInlineStyles.strongText}">{t.pct}%</span>
      <span
        style={syncInlineStyles.mutedText}> · {t.blobBytes}b full · {t.deltaBytes}b deltas · {t.ops} row ops</span>
    </div>
    <div
        style={syncInlineStyles.mutedParagraph}>{t.healthy ? 'Looking good — sync is mostly riding the lightweight per-row path.' : 'Still hefty — most state is going as a full blob. Will trim down as more changes flow through.'}</div>
    <table
        style={syncInlineStyles.telemetryTable}>
      <thead><tr
        style={syncInlineStyles.telemetryTableHeader}><th
        style={syncInlineStyles.telemetryCell}>when</th><th
        style={syncInlineStyles.telemetryNumber}>blob</th><th
        style={syncInlineStyles.telemetryNumber}>delta</th><th
        style={syncInlineStyles.telemetryNumber}>ops</th><th
        style={syncInlineStyles.telemetryCell}>arrays(ins/upd/tom)</th></tr></thead>
      <tbody>{#each t.recentRows as row}<tr><td
        style={syncInlineStyles.telemetryName}>{row.when}</td><td
        style={syncInlineStyles.telemetryValue}>{row.blobBytes}b</td><td
        style={syncInlineStyles.telemetryValue}>{row.deltaBytes}b</td><td
        style={syncInlineStyles.telemetryValue}>{row.ops}</td><td
        style={syncInlineStyles.telemetryDescription}>{row.arrays}</td></tr>{/each}</tbody>
    </table>
    {#if t.pull}<div
        style={syncInlineStyles.telemetryFootnote}>
      <div
        style={syncInlineStyles.sectionTitle}><b>Pull-side rows (latest merge {t.pull.mergedAt}):</b></div>
      <div
        style={syncInlineStyles.technicalValue}>{t.pull.arrays}</div>
      <div
        style={syncInlineStyles.spacingTop}>Compare across devices — diverging counts mean relay replication isn't propagating per-row state evenly.</div>
    </div>{/if}
  </div>{/snippet}{#snippet cutover(c: NonNullable<SyncDiagnoseView['cutover']>)}<div
        style={syncInlineStyles.diagnosticCard}>
    <div
        style={syncInlineStyles.diagnosticCardHeader}>
      <div><b>Lean sync mode</b>{#if c.enabled}<span

        style={syncInlineStyles.readyBadge}>ON</span>{/if}<div
        style={syncInlineStyles.cutoverCaption}>drops the full-blob backup once everything is reliably moving as per-row deltas — saves bandwidth + relay storage</div></div>
      <div
        style={syncInlineStyles.cutoverActions}>
        <span
        style="color:{c.headerColor};{syncInlineStyles.strongText}">{c.headerLabel}</span>
        {#if c.action === 'disable'}<button

        class="ctx-btn-option"
        style={syncInlineStyles.warningAction}
        data-sync-diagnose-action="disable-phase2"
        title="Switches back to full-blob sync. Use this if a peer device shows missing data.">Disable</button>{:else if c.action === 'enable'}<button

        class="ctx-btn-option"
        style={syncInlineStyles.successAction}
        data-sync-diagnose-action="enable-phase2"
        title="Switch this device to lean sync (per-row deltas only). Reversible.">Enable</button>{:else}<button

        class="ctx-btn-option"
        style={syncInlineStyles.disabledAction} disabled
        title="Push the pending items below first.">Enable</button>{/if}
      </div>
    </div>
    <div
        style={syncInlineStyles.mutedText}>{c.okCount} of {c.surfaceCount} synced · {c.noDataCount} empty{c.pending}</div>
    <div
        style={syncInlineStyles.cutoverHint}>Wait for <b>Ready</b> on both devices and let the efficiency above settle below ~5% before flipping. Reversible per device any time.</div>
    {#if c.blockerRows.length}
    <div
        style={syncInlineStyles.blockerPanel}>
      <div
        style={syncInlineStyles.blockerHeading}>
        <div
        style={syncInlineStyles.blockerTitle}>These bits of data haven't been re-pushed yet:</div>
        <button

        class="ctx-btn-option"
        style={syncInlineStyles.smallText}
        data-sync-diagnose-action="backfill-blockers"
        title="Forces a fresh push so each pending item ships as new. Safe — no data loss.">Push now</button>
      </div>
      <table
        style={syncInlineStyles.blockerTable}>
        {#each c.blockerRows as row}<!-- svelte-ignore node_invalid_placement_ssr (Preserve original table fragment; native innerHTML inserts its tbody.) --><tr><td
        style={syncInlineStyles.blockerName}>{row.name}</td><td
        style={syncInlineStyles.blockerShape}>{row.shape}</td><td
        style={syncInlineStyles.blockerCount}>local={row.local} rows={row.rows}</td></tr>{/each}
      </table>
      <div
        style={syncInlineStyles.blockerHint}>Tap <b>Push now</b> to take care of all of them at once.</div>
    </div>{/if}
  </div>{/snippet}<div
        class="modal sync-diagnose-modal"
        role="dialog"
        aria-label="Cross-device sync status">
    <div
        class="modal-header"><div><div
        class="sync-diagnose-modal-kicker">Cross-device sync</div><h3>Sync status</h3></div><button
        class="modal-close" data-sync-diagnose-close
        aria-label="Close">×</button></div>
    <div
        class="modal-body sync-diagnose-body">
      {@render summary(view.summary)}
      {@render device()}
      {@render health(view.health)}
      {#if view.storage}{@render storage(view.storage)}{/if}
      <details
        class="sync-diagnose-technical">
        <summary>
          <span><b>Technical details</b><small>For troubleshooting and support{view.isDebug ? ' · developer metrics included' : ''}</small></span>
          <span
        class="sync-diagnose-disclosure" aria-hidden="true">›</span>
        </summary>
        <div
        class="sync-diagnose-technical-content">
          <div
        class="sync-diagnose-facts">
            <div><span>Sync enabled</span><b>{view.syncEnabled}</b></div>
            <div><span>Recovery phrase</span><b>{view.mnemonic}</b></div>
            <div><span>Owner ID</span><code>{view.owner}</code></div>
            <div><span>Active profile</span><code>{view.activeProfile}</code></div>
            <div
        class="sync-diagnose-fact-wide"><span>Relay</span><code>{view.relay}</code></div>
            <div
        class="sync-diagnose-fact-wide"><span>Local summary</span><b>{view.sunSessions} sun sessions · {view.lightDevices} light devices</b></div>
          </div>
          {#if view.technicalReason !== null}<div
        class="sync-diagnose-technical-reason"><b>Relay check detail:</b> {view.technicalReason}</div>{/if}
          {#if view.isDebug}<div
        class="sync-diagnose-developer-block"><div
        class="sync-diagnose-section-heading">Developer metrics</div>{#if view.telemetry}{@render telemetry(view.telemetry)}{/if}{#if view.cutover}{@render cutover(view.cutover)}{/if}</div>{/if}
          <details
        class="sync-diagnose-row-details" open={view.hasWarnings}>
            <summary><span>Local sync database</span><span>{view.rowCount} row{view.plural}{view.hasWarnings ? ' · check warning' : ''}</span></summary>
            <div
        class="sync-diagnose-row-content">
              {#if view.hasWarnings}<div
        class="sync-diagnose-row-warning">{view.warning}</div>{/if}
              <div
        class="sync-diagnose-table-wrap">
                <table>
                  <thead><tr><th>profileId</th><th>deleted</th><th>syncedAt (ms)</th><th>sun</th><th>dev</th><th>size</th><th>format</th></tr></thead>
                  <tbody>{@render rows()}</tbody>
                </table>
              </div>
              <p>Support may ask you to compare these rows across devices. <b>gz</b> and <b>plain</b> are valid formats; <b>invalid</b> means a row could not be decoded. An asterisk marks an ID recovered safely from its payload.</p>
            </div>
          </details>
          <div
        class="sync-diagnose-maintenance">
            <div
        class="sync-diagnose-section-heading">Recovery and maintenance</div>
            <p>These actions are rarely needed. Use them only when the status above recommends it or support asks you to.</p>
            <div
        class="sync-diagnose-maintenance-actions">
    {#if !view.compactInStorageCard}<button

        class="ctx-btn-option"
        data-sync-diagnose-action="compact-relay"
        title="Rebuilds the encrypted relay history from this device after confirmation.">Reduce storage…</button>{/if}
    {#if view.rotate}<button

        class="ctx-btn-option sync-diagnose-danger-action"
        data-sync-diagnose-action="rotate-identity"
        title="Creates a new recovery phrase and requires reconnecting every device.">Rotate sync identity…</button>{/if}
    <button

        class="ctx-btn-option"
        data-sync-diagnose-action="copy-snapshot"
        title="Copy a privacy-safe technical report for troubleshooting.">Copy diagnostic report</button></div>
          </div>
        </div>
      </details>
      <div
        class="sync-diagnose-footer">
        <button
        class="ctx-btn-option" data-sync-diagnose-close>Close</button>
      </div>
    </div>
  </div>