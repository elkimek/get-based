<script lang="ts">
  import {syncInlineStyles} from '../sync-inline-style-map.generated.js';
  import type { SyncPopoverView } from '../sync-status-rendering.js';
  let { view }: { view: SyncPopoverView } = $props();
</script><svelte:options preserveWhitespace={true} />
    <div style={syncInlineStyles.relayHeader}><span style={(syncInlineStyles.relayDotGeometry + "background:") + view.relayDot + (";" + syncInlineStyles.inlineDot)}></span><span style={syncInlineStyles.relayLabel}>{view.relayLabel}</span></div>
    {#if view.relay !== null}<div style={syncInlineStyles.relayAddress}>{view.relay}</div>{/if}
    <div style={syncInlineStyles.transferDetails}>
      <div>Push: {#if view.push.danger}<span style={syncInlineStyles.dangerText}>{view.push.text}</span>{:else}{view.push.text}{/if}</div>
      <div>Pull: {view.pullLabel}</div>
      {#if view.quota}<div style={syncInlineStyles.quotaRow}><span style={(syncInlineStyles.quotaDotGeometry + "background:") + view.quota.dot + (";" + syncInlineStyles.inlineDot)}></span><span style={'color:' + view.quota.color}>{view.quota.text}</span></div>{/if}
    </div>
    {#if view.error}<div style={syncInlineStyles.recentError}>{view.error.type} {view.error.age}</div>{/if}
    {#if view.events.length}
    <div style={syncInlineStyles.eventsPanel}>
      <div style={syncInlineStyles.eventsHeading}>
        <span style={syncInlineStyles.eventsTitle}>Recent activity</span>
        <button class="ctx-btn-option" style={syncInlineStyles.copyEventsAction} data-sync-ui-action="copy-events" title="Copy events to clipboard">Copy</button>
      </div>
      {#each view.events as event}<div style={syncInlineStyles.eventRow}><span style={'color:' + event.color + (";" + syncInlineStyles.strongText)}>{event.kind}</span> · {event.age} · <span style={syncInlineStyles.eventText}>{event.text}</span></div>{/each}
    </div>{/if}
    <div style={syncInlineStyles.popoverActions}>
      <button class="ctx-btn-option" style={syncInlineStyles.popoverAction} data-sync-ui-action="sync-now">Sync now</button>
      {#if view.stuckPush}<button class="ctx-btn-option" style={syncInlineStyles.reloadAction} data-sync-ui-action="reload" title="Reloads the page to re-init the sync worker.">Reload</button>{/if}
      <button class="ctx-btn-option" style={syncInlineStyles.popoverAction} data-sync-ui-action="open-settings">Settings</button>
      <button class="ctx-btn-option" style={syncInlineStyles.popoverAction} data-sync-ui-action="show-diagnose">Sync status</button>
      {#if view.debugControls}
        <button class="ctx-btn-option" style={syncInlineStyles.popoverAction + (view.stuckPush ? ';' + syncInlineStyles.forceResendWarning : '')} data-sync-ui-action="force-resend" title="Bypasses the in-flight guard. Use when Sync now isn't reaching the relay (typically because a prior push got stuck and the worker still thinks it's running).">Force resend</button>
        <button class="ctx-btn-option" style={syncInlineStyles.popoverAction} data-sync-ui-action="clean-storage" title="Trim changeHistory to its 200-entry cap and clear cached AI model lists. Use when localStorage is full and pushes throw QuotaExceededError silently.">Clean storage</button>
        <button class="ctx-btn-option" style={syncInlineStyles.popoverAction} data-sync-ui-action="test-relay">Test relay</button>
      {/if}
    </div>