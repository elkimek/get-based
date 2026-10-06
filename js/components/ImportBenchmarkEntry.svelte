<script lang="ts">
  import { BENCHMARK_LABEL, BENCHMARK_PRIMARY } from '../import-benchmark-classes.js';
  let { label, onOpen }: { label: string; onOpen: (button: HTMLButtonElement) => unknown } = $props();
</script>
<div class="import-benchmarks-entrypoint gb:benchmark:flex gb:benchmark:w-full gb:benchmark:items-center gb:benchmark:justify-between gb:benchmark:gap-3 gb:benchmark:max-[500px]:flex-col gb:benchmark:max-[500px]:items-stretch" data-import-benchmarks-entry>
  <div class="gb:benchmark:min-w-0"><strong class="gb:benchmark:block gb:benchmark:text-sm gb:benchmark:text-ink">Test models on lab reports</strong><span class={BENCHMARK_LABEL}>{label}</span></div>
  <button type="button" class="import-btn import-btn-primary {BENCHMARK_PRIMARY} gb:benchmark:shrink-0" data-settings-action="open-import-benchmarks" onclick={event => { event.stopPropagation(); onOpen(event.currentTarget); }}>Open model tests</button>
</div>
