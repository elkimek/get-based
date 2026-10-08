<script lang="ts">
  let { urls }: { urls: readonly string[] } = $props();
</script>
{#if urls.length}
  <span class="nutrition-benchmark-photo-grid gb:nutrition:grid gb:nutrition:h-full gb:nutrition:min-h-[88px] gb:nutrition:w-full gb:nutrition:auto-rows-[minmax(0,1fr)] gb:nutrition:grid-cols-2 gb:nutrition:gap-0.5">
    {#each urls as url, index}<img src={url} alt={`Benchmark meal view ${index + 1}`} class="gb:nutrition:h-full gb:nutrition:min-h-0 gb:nutrition:w-full gb:nutrition:object-cover gb:nutrition:only:col-span-full gb:nutrition:only:row-span-full"/>{/each}
  </span>
  <span class="nutrition-benchmark-photo-change gb:nutrition:absolute gb:nutrition:right-[5px] gb:nutrition:bottom-[5px] gb:nutrition:rounded-full gb:nutrition:bg-black/75 gb:nutrition:px-1.5 gb:nutrition:py-[3px] gb:nutrition:text-[9px] gb:nutrition:text-white">{urls.length} view{urls.length === 1 ? '' : 's'} · replace</span>
{:else}
  <span aria-hidden="true" class="gb:nutrition:text-[22px] gb:nutrition:text-accent">＋</span><strong class="gb:nutrition:px-[5px] gb:nutrition:text-[10px]">Add benchmark photos</strong><small class="gb:nutrition:text-[9px] gb:nutrition:text-secondary">Up to 4 views</small>
{/if}
