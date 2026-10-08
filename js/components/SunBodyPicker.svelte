<script lang="ts">
  import type {} from './svelte-svg-attributes.js';
  import type { BodyPickerView } from '../sun-body-picker-presentation.js';
  let { view }: { view: BodyPickerView } = $props();
</script>

<svg viewBox="0 0 200 220" class={`sun-silhouette${view.stock ? ' sun-silhouette-stock' : ''} gb:sun-body:block gb:sun-body:w-full gb:sun-body:max-w-[380px] gb:sun-body:h-auto gb:sun-body:[@media(max-width:600px)]:max-w-full`} data-sun-body-picker data-sex={view.sex} data-selection-overlay={view.overlayState} role="group" aria-label="Body region picker — tap or press Enter on each region you want to toggle">
  <defs>
    {#each view.views as figure}
      <clipPath id={figure.clipId}><path d={figure.outline} /></clipPath>
    {/each}
    <clipPath id="sun-silhouette-cell-clip"><rect x="0" y="0" width="100" height="210" /></clipPath>
    {#if view.stock}
      {#each view.views as figure}
        <mask id={figure.maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="210" mask-type="alpha">
          <image href={view.mask} {...figure.placement} preserveAspectRatio="none" />
        </mask>
      {/each}
    {/if}
  </defs>
  {#each view.views as figure}
    <g class={`sun-silhouette-view sun-silhouette-${figure.side}`} transform={figure.side === 'back' ? 'translate(100 0)' : undefined}>
      {#if view.stock}
        <g clip-path="url(#sun-silhouette-cell-clip)">
          <image href={view.source} {...figure.placement} preserveAspectRatio="none" pointer-events="none" />
          {#if view.overlay}<image href={view.overlay} {...figure.placement} preserveAspectRatio="none" pointer-events="none" />{/if}
        </g>
        <rect x="0" y="0" width="100" height="210" fill="transparent" data-click-view={figure.side} class="gb:sun-body:cursor-pointer" />
      {:else}
        <path d={figure.outline} class="sun-silhouette-outline gb:sun-body:fill-[var(--fresco-cream)] gb:sun-body:[fill-opacity:0.92] gb:sun-body:stroke-[var(--fresco-umber)] gb:sun-body:stroke-[0.55] gb:sun-body:[stroke-linejoin:round] gb:sun-body:[stroke-linecap:round] gb:sun-body:[paint-order:fill_stroke]" />
        {#each figure.landmarks as path}<path d={path} class="sun-silhouette-landmark gb:sun-body:fill-none gb:sun-body:stroke-[var(--fresco-umber)] gb:sun-body:stroke-[0.32] gb:sun-body:[stroke-linejoin:round] gb:sun-body:[stroke-linecap:round] gb:sun-body:opacity-[0.62] gb:sun-body:pointer-events-none" />{/each}
        {#each figure.details as path}<path d={path} class="sun-silhouette-detail gb:sun-body:fill-[var(--fresco-sienna)] gb:sun-body:[fill-opacity:0.58] gb:sun-body:stroke-[var(--fresco-umber)] gb:sun-body:stroke-[0.25] gb:sun-body:[stroke-opacity:0.55] gb:sun-body:pointer-events-none" />{/each}
      {/if}
      <g clip-path="url(#sun-silhouette-cell-clip)" mask={view.stock ? `url(#${figure.maskId})` : undefined}>
        {#each figure.regions as region}
          <path d={region.path} data-region={region.key} data-view={figure.side} class={`sun-silhouette-region${region.selected ? ' selected' : ''}`} role="button" tabindex="0" aria-pressed={region.selected} aria-label={region.aria}><title>{region.title}</title></path>
        {/each}
      </g>
      <text x="50" y="218" text-anchor="middle" class="sun-silhouette-label gb:sun-body:[font-family:inherit] gb:sun-body:text-[7px] gb:sun-body:fill-[var(--text-secondary)] gb:sun-body:[fill-opacity:0.85] gb:sun-body:tracking-[0.8px] gb:sun-body:uppercase gb:sun-body:font-semibold" aria-hidden="true">{figure.side}</text>
    </g>
  {/each}
</svg>
