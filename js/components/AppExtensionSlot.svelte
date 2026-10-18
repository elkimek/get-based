<script lang="ts">
  import type {AppExtensionHTML} from '../app-extension-runtime.js';
  let {html}: {html: AppExtensionHTML} = $props();
</script><svelte:options preserveWhitespace />{@html html}
