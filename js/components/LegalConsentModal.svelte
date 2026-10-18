<script lang="ts">
 import type {LegalConsentView} from '../legal-consent-view.js';
 let {view}:{view:LegalConsentView}=$props();
</script><svelte:options preserveWhitespace/>{#if view.kind==='cloud'}
    <div class="legal-consent-modal" role="dialog" aria-modal="true" aria-labelledby={view.titleId} aria-describedby={view.descriptionId}>
      <div class="legal-consent-kicker">{view.kicker}</div>
      <h2 id={view.titleId}>{view.title}</h2>
      <p class="legal-consent-copy" id={view.descriptionId}>{view.description}</p>
      <ul class="legal-consent-points">{#each view.points as point}<li>{point}</li>{/each}</ul>
      <label class="legal-consent-check">
        <input type="checkbox" id={view.checkboxId}>
        <span class="ai-processing-statement">{view.statement}</span>
      </label>
      {#if view.policyGroups.length}<p class="cloud-ai-consent-links">{#each view.policyGroups as group}<span>{#if group.leadingBreak}<br>{/if}{group.label}{#each group.links as link} · <a href={link.url} target="_blank" rel="noopener">{link.label}</a>{/each}</span>{/each}</p>{/if}
      <div class="legal-consent-actions">
        <button type="button" class="cloud-ai-consent-cancel" data-ai-processing-action="cancel" {...(view.remote?{'data-cloud-ai-consent-action':'cancel'}:{})}>{view.cancelLabel}</button>
        <button type="button" class="legal-consent-accept" data-ai-processing-action="approve" disabled {...(view.remote?{'data-cloud-ai-consent-action':'approve'}:{})}>{view.approveLabel}</button>
      </div>
    </div>{:else}
    <div class="legal-consent-modal" role="dialog" aria-modal="true" aria-labelledby="wearable-relay-consent-title" aria-describedby="wearable-relay-consent-desc">
      <div class="legal-consent-kicker">Wearable privacy</div>
      <h2 id="wearable-relay-consent-title">{view.title}</h2>
      <p id="wearable-relay-consent-desc" class="legal-consent-copy">{view.description}</p>
      <div class="legal-consent-summary wearable-relay-consent-summary">
        <div><strong>Purpose</strong><br><span id="wearable-relay-consent-purpose">{view.purpose}</span></div>
        <div><strong>Secure relay</strong><br>Data is readable while being forwarded; request and response contents are not intentionally stored.</div>
        <div><strong>On this device</strong><br>Your connection key is encrypted. Encrypted sync and cloud AI are separate choices.</div>
        <div><strong>Your control</strong><br><span id="wearable-relay-consent-withdrawal">{view.withdrawal}</span></div>
      </div>
      <label class="legal-consent-check">
        <input type="checkbox" id="wearable-relay-consent-checkbox">
        <span id="wearable-relay-consent-statement">{view.statement}</span>
      </label>
      <p class="cloud-ai-consent-links"><a href="https://getbased.health/privacy" target="_blank" rel="noopener">Read the Privacy Policy</a></p>
      <div class="legal-consent-actions">
        <button type="button" class="cloud-ai-consent-cancel" data-wearable-relay-consent-action="cancel">Not now</button>
        <button type="button" class="legal-consent-accept" data-wearable-relay-consent-action="approve" disabled>{view.approveLabel}</button>
      </div>
    </div>{/if}
