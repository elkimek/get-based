<script lang="ts">
  import AppExtensionSlot from './AppExtensionSlot.svelte';
  import type {SettingsPanelsView} from '../settings-shell-contract.js';
  let {panels}: {panels: SettingsPanelsView} = $props();
</script><svelte:options preserveWhitespace />
    <div class="settings-tab-panel{panels.displayActive ? ' active' : ''}" data-tab-panel="display" id="settings-tab-display" role="tabpanel" aria-label="Display"></div>

    <!-- AI Tab -->
    <div class="settings-tab-panel{panels.aiActive ? ' active' : ''}" data-tab-panel="ai" id="settings-tab-ai" role="tabpanel" aria-label="AI">
      <AppExtensionSlot html={panels.extensionAI}/>
      <div data-ai-settings-host></div>

      <div data-nutrition-ai-settings-host></div>

      <div class="settings-group-title gb:settings:text-secondary">Import Benchmarks</div>

      <div class="settings-section" id="import-benchmarks-section">
        <div data-import-benchmark-entry-host={panels.benchmarkEntryEpoch}></div>
      </div>

      {#if panels.showUsage}<div class="settings-group-title gb:settings:text-secondary">AI Usage</div>

      <div class="settings-section" id="ai-usage-section">
        <div id="ai-usage-content"></div>
      </div>{/if}
    </div>

    <div class="settings-tab-panel{panels.voiceActive ? ' active' : ''}" data-tab-panel="voice" id="settings-tab-voice" role="tabpanel" aria-label="Voice"></div>

    <AppExtensionSlot html={panels.extensionPanels}/>

    <!-- Privacy Tab -->
    <div class="settings-tab-panel{panels.privacyActive ? ' active' : ''}" data-tab-panel="privacy" id="settings-tab-privacy" role="tabpanel" aria-label="Privacy">
      <div id="privacy-settings-content"></div>
    </div>

    <!-- Data Tab -->
    <div class="settings-tab-panel{panels.dataActive ? ' active' : ''}" data-tab-panel="data" id="settings-tab-data" role="tabpanel" aria-label="Data">
      <div class="settings-group-title">Security</div>

      <div class="settings-section" id="encryption-section">
        <div data-encryption-settings-root data-settings-protection-view="encryption"></div>
      </div>

      <div class="settings-group-title">Cross-Device Sync</div>

      <div class="settings-section" id="sync-section">
        {#if panels.syncReady}<div data-sync-settings-root></div>{:else}<div class="settings-loading-placeholder" data-settings-sync-placeholder="sync">Loading sync settings…</div>{/if}
      </div>

      <div class="settings-group-title">Backup &amp; Restore</div>

      <div class="settings-section" id="backup-section">
        <div data-backup-settings-root data-settings-protection-view="backup"></div>
      </div>

      <div class="settings-group-title">Imported Data</div>

      <div class="settings-section" id="data-entries-section">
        <div id="data-entries-content"></div>
      </div>
    </div>

    <!-- Wearables Tab — incoming biometric data (Oura, WHOOP, Fitbit, etc.) -->
    <div class="settings-tab-panel{panels.wearablesActive ? ' active' : ''}" data-tab-panel="wearables" id="settings-tab-wearables" role="tabpanel" aria-label="Wearables">
      <div class="settings-section" id="wearables-section">
        <div data-wearables-view-host></div>
      </div>
    </div>

    <!-- Agent Access Tab — outgoing read permission for AI agents (MCP / Hermes / OpenClaw) -->
    <div class="settings-tab-panel{panels.agentActive ? ' active' : ''}" data-tab-panel="agent" id="settings-tab-agent" role="tabpanel" aria-label="Agent Access">
      <div class="settings-section" id="messenger-section">
        {#if panels.messengerReady}<div data-agent-access-root></div>{:else}<div class="settings-loading-placeholder" data-settings-sync-placeholder="messenger">Loading Agent Access…</div>{/if}
      </div>
    </div>{'\n'}
