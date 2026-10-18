<script lang="ts">
 import LegalFirstLaunchBody from './LegalFirstLaunchBody.svelte';
 import type { FirstLaunchLegalView } from '../legal-first-launch-view.js';
 let { view }: { view: FirstLaunchLegalView } = $props();
</script>
<svelte:options preserveWhitespace />
  <div
    id="legal-consent-overlay"
    class="modal-overlay legal-consent-overlay show"
    data-terms-version={view.termsVersion}
    data-privacy-version={view.privacyVersion}
    data-policy-scope=""
  ><LegalFirstLaunchBody {view} />
  </div>
