<script lang="ts">
  import type { LightDeviceAffiliateView } from '../light-device-library-presentation.js';
  import { deviceLibraryClasses as c } from '../light-device-library-classes.js';
  let { view }: { view: LightDeviceAffiliateView } = $props();
</script>
<a class={`rec-product-link ${c('rec-light-device-link')}`} href={view.href} target="_blank" rel="noopener sponsored" data-umami-event={view.event} aria-label={view.label} data-light-device-presentation>View on {view.vendor} →</a>
