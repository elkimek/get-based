<script lang="ts">
  import type {DashboardPickerCard, DashboardPickerView} from '../dashboard-picker-presentation.js';
  import {dashboardPickerClasses as classes} from '../dashboard-picker-classes.js';
  let {view}: {view: DashboardPickerView} = $props();
</script>

{#snippet card(option: DashboardPickerCard, kind: 'fixed' | 'biometric' | 'marker')}
  <button type="button"
    class={classes(`dashboard-widget-picker-card${kind === 'biometric' ? ' dashboard-biometric-widget-option' : kind === 'marker' ? ' dashboard-marker-widget-option' : ''}`)}
    data-biometric-search={kind === 'biometric' ? option.search : undefined}
    data-marker-search={kind === 'marker' ? option.search : undefined}
    data-dashboard-widget-action={option.action} data-dashboard-widget-id={option.id}>
    <span class={classes('dashboard-widget-picker-title')}>{option.title}{#if option.hasTitleDetail}{' '}<small>{option.titleDetail}</small>{/if}</span>
    <span class={classes('dashboard-widget-picker-sub')}>{option.subtitle}</span>
    <span class={classes('dashboard-widget-picker-action')}>{option.actionLabel}</span>
  </button>
{/snippet}

<div class="modal-overlay" id="dashboard-widget-picker-overlay" data-dashboard-widget-overlay>
  <div class={classes(`modal dashboard-widget-picker${view.kind === 'biometric' ? ' dashboard-biometric-picker' : ''}`)}
    data-dashboard-picker-view role="dialog" aria-modal="true"
    aria-labelledby={view.kind === 'dashboard' ? 'dashboard-widget-picker-title' : 'dashboard-biometric-picker-title'}>
    <button class="modal-close" aria-label="Close" data-dashboard-widget-action="close-picker">×</button>
    <h3 id={view.kind === 'dashboard' ? 'dashboard-widget-picker-title' : 'dashboard-biometric-picker-title'}>{view.kind === 'dashboard' ? 'Add dashboard widget' : 'Add biometric metrics'}</h3>
    {#if view.kind === 'dashboard'}
      <div class={classes('dashboard-widget-picker-section')}>
        <div class={classes('dashboard-widget-picker-label')}>Lens and tool widgets</div>
        <div class={classes('dashboard-widget-picker-grid')}>
          {#if view.fixedGroups.length}
            {#each view.fixedGroups as group}
              <div class={classes('dashboard-widget-picker-source')}>
                <div class={classes('dashboard-widget-picker-label')}>{group.source}</div>
                <div class={classes('dashboard-widget-picker-grid dashboard-picker-source-grid')}>
                  {#each group.cards as option}{@render card(option, 'fixed')}{/each}
                </div>
              </div>
            {/each}
          {:else}
            <div class={classes('dashboard-widget-picker-empty')}>All dashboard widgets are visible.</div>
          {/if}
        </div>
      </div>
    {/if}
    <div class={classes(`dashboard-widget-picker-section${view.kind === 'biometric' ? ' dashboard-biometric-picker-section' : ''}`)}>
      <label class={classes('dashboard-widget-picker-label')} for="dashboard-biometric-widget-search">{view.kind === 'dashboard' ? 'Body / Biometrics Overview metrics' : 'Manual and wearable metrics'}</label>
      <input id="dashboard-biometric-widget-search" class={classes('dashboard-widget-picker-search')} type="search" placeholder="Search biometrics to add" data-dashboard-widget-input="filter-biometric-picker">
      <div class={classes(`dashboard-widget-picker-grid dashboard-biometric-widget-grid${view.kind === 'biometric' ? ' dashboard-biometric-picker-grid' : ''}`)}>
        {#each view.biometrics as option}{@render card(option, 'biometric')}{/each}
      </div>
      <div class={classes('dashboard-widget-picker-empty')} id="dashboard-biometric-widget-empty" hidden={view.biometrics.length > 0}>All available biometrics are already in the overview.</div>
    </div>
    {#if view.kind === 'dashboard'}
      <div class={classes('dashboard-widget-picker-section')}>
        <label class={classes('dashboard-widget-picker-label')} for="dashboard-marker-widget-search">Labs / Single marker widgets</label>
        <input id="dashboard-marker-widget-search" class={classes('dashboard-widget-picker-search')} type="search" placeholder="Search markers" data-dashboard-widget-input="filter-marker-picker">
        <div class={classes('dashboard-widget-picker-grid dashboard-marker-widget-grid')}>
          {#each view.markers as option}{@render card(option, 'marker')}{/each}
        </div>
        <div class={classes('dashboard-widget-picker-empty')} id="dashboard-marker-widget-empty" hidden={view.markers.length > 0}>No available markers to add.</div>
      </div>
    {/if}
    <div class={classes(`dashboard-widget-picker-actions${view.kind === 'biometric' ? ' dashboard-biometric-picker-actions' : ''}`)}>
      {#if view.kind === 'dashboard'}
        <button type="button" class="dashboard-action-btn" data-dashboard-widget-action="customize-layout">Customize layout</button>
        <button type="button" class="dashboard-action-btn" data-dashboard-widget-action="reset-layout">Reset layout</button>
      {:else}
        <button type="button" class="dashboard-action-btn" data-dashboard-widget-action="connect-source">Connect source</button>
      {/if}
    </div>
  </div>
</div>
