<svelte:options preserveWhitespace={true} /><script lang="ts">
  import type {DashboardWelcomeView} from "../dashboard-welcome-presentation.js";
  import DashboardWelcomeSecondary from "./DashboardWelcomeSecondary.svelte";
  import DashboardWelcomePrimary from "./DashboardWelcomePrimary.svelte";
  import DashboardOnboarding from "./DashboardOnboarding.svelte";
  let {view}: {view: DashboardWelcomeView} = $props();
</script>{#if view.mode === 'loading'}<div class="welcome-hero" aria-busy="true" role="status" aria-live="polite">
        <h2>Loading demo data…</h2>
        <p class="welcome-hero-subtitle">Setting up the demo profile — this takes a few seconds the first time.</p>
      </div>{:else if view.mode === 'secondary'}<DashboardWelcomeSecondary {view} />{:else if view.mode === 'primary'}<DashboardWelcomePrimary {view} />{:else if view.mode === 'welcome'}{#if view.reminder}<DashboardOnboarding view={view.reminder} />{/if}<div class="{view.className}" {...view.prerendered ? {'data-prerendered-welcome': ''} : {}}>
        <h2>Welcome to getbased</h2>
        <p class="welcome-hero-subtitle">Health intelligence that's actually yours — five lenses on your biology, one private dashboard.</p>
        <DashboardWelcomePrimary view={view.primary} />
        <div class="welcome-demo-section">
          <span class="welcome-section-label">Preview with demo data</span>
          <div class="demo-cards">
            <button type="button" class="demo-card" data-dashboard-welcome-action="load-demo" data-dashboard-welcome-demo="female">
              <span class="demo-card-avatar">👩</span>
              <span class="demo-card-name">Sarah, 34</span>
              <span class="demo-card-desc">Iron + Oura: overtraining clues</span>
            </button>
            <button type="button" class="demo-card" data-dashboard-welcome-action="load-demo" data-dashboard-welcome-demo="male">
              <span class="demo-card-avatar">👨</span>
              <span class="demo-card-name">Alex, 38</span>
              <span class="demo-card-desc">Metabolic + Withings body comp</span>
            </button>
          </div>
        </div>
      </div>{:else if view.mode === 'empty'}<div class="dashboard-widget dashboard-widget-full is-empty">
        <div class="dashboard-widget-empty">No widgets are visible.</div>
      </div>{/if}