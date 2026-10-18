<svelte:options preserveWhitespace={true}/><script lang="ts">
  import type {DashboardBioAgeView} from '../dashboard-lab-summary-presentation.js';
  let {view}: {view: DashboardBioAgeView} = $props();
</script><svelte:element this={view.interactive ? 'button' : 'div'} class="db-hero-bio" type={view.interactive ? 'button' : undefined} data-dashboard-widget-action={view.interactive ? 'open-marker-detail' : undefined} data-dashboard-widget-id={view.id ?? undefined} aria-label={view.accessibleLabel ?? undefined}>
      <div class="db-hero-bio-left">
        <div class="db-hero-bio-num">{view.display}</div>
        <div class="db-hero-bio-label">
          <span class="top">{view.name}</span>
          <span class="actual">Chronological: {view.chronological}</span>
          <span class="delta">{view.difference}</span>
        </div>
      </div>
      <div class="db-hero-bio-right">
        <div class="db-hero-row"><span>PhenoAge</span><strong>{view.phenoValue}</strong></div>
        <div class="db-hero-row"><span>Bortz Age</span><strong>{view.bortzValue}</strong></div>
        <div class="db-hero-bio-bar"><div style={`width:${view.width}%`}></div></div>
        <div class="db-hero-scale"><span>0</span><span>35</span><span>70 yr</span></div>
      </div>
    </svelte:element>
