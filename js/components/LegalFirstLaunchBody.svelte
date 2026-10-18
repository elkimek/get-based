<script lang="ts">
 import type { FirstLaunchLegalView } from '../legal-first-launch-view.js';
 let { view }: { view: FirstLaunchLegalView } = $props();
</script><svelte:options preserveWhitespace />
    <div class="legal-consent-modal" role="dialog" aria-modal="true" aria-labelledby="legal-consent-title" aria-describedby="legal-consent-desc">
      <div class="legal-consent-kicker">{view.kicker}</div>
      <h2 id="legal-consent-title">{view.title}</h2>
      <p id="legal-consent-desc" class="legal-consent-copy">{view.description}</p>
      <div class="legal-consent-summary">
        <div><strong>Terms:</strong> {view.termsVersion}</div>
        <div><strong>Privacy:</strong> {view.privacyVersion}</div>
      </div>
      <ul class="legal-consent-points">
        <li>getbased is a wellness, self-tracking, and educational tool — not medical advice or a medical device.</li>
        <li>Your health data is stored locally by default; optional network features are described in the Privacy Policy.</li>
        <li>AI transparency is acknowledged separately from destination-specific sensitive-data approval.</li>
        <li>Cookieless product analytics may run on the hosted app and can be turned off in Settings → Privacy; the analytics service does not store the raw IP address, while ordinary hosting metadata is described in the Privacy Policy.</li>
      </ul>
      <label class="legal-consent-check">
        <input type="checkbox" id="legal-consent-checkbox">
        <span>{view.statementPrefix}{#each view.links as link, index}{#if index} and {/if}<a href={link.url} data-legal-kind={link.kind} target="_blank" rel="noopener">{link.label}</a>{/each}{view.statementSuffix}</span>
      </label>
      <div class="legal-consent-actions">
        <button type="button" class="legal-consent-accept" data-legal-consent-action="accept" disabled>{view.acceptLabel}</button>
      </div>
    </div>
