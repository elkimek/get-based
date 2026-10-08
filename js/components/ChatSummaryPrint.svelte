<script lang="ts">
  import type { SummaryPrintView } from '../chat-summary-presentation.js';
  import { renderMarkdown } from '../markdown.js';
  let { view }: { view: SummaryPrintView } = $props();
  // Printing is synchronous in a standalone document. Inline, document-owned
  // CSS preserves offline output without waiting for the app's lazy stylesheet.
  const printStyles = `body{font-family:-apple-system,system-ui,sans-serif;max-width:700px;margin:40px auto;padding:0 20px;line-height:1.6;color:#1a1a1a;overflow-wrap:anywhere}
h1{font-size:20px;border-bottom:1px solid #ddd;padding-bottom:8px}h2{font-size:16px;margin-top:24px}
ul,ol{padding-left:20px}li{margin:4px 0}.meta{color:#666;font-size:13px;margin-bottom:20px}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}.attribution{color:#555;font-size:12px;font-weight:700;margin-top:18px}
@media print{body{margin:20px}}`;
</script>
<html lang="en">
  <head><meta charset="utf-8"/><title>{view.name} - Summary</title><svelte:element this={'style'}>{printStyles}</svelte:element></head>
  <body>
    <h1>{view.name}</h1>
    {#if view.dateLine}<div class="meta">{view.dateLine}</div>{/if}
    {@html renderMarkdown(view.content)}
    {#if view.attribution}<p class="attribution">{view.attribution}</p>{/if}
  </body>
</html>
