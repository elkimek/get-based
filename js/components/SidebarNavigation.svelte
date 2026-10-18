<script lang="ts">import SidebarIcon from './SidebarIcon.svelte';import ConditionalSidebarItem from './ConditionalSidebarItem.svelte';import SidebarCategoryItem from './SidebarCategoryItem.svelte';import type {SidebarView} from '../sidebar-presentation.js';let {view}:{view:SidebarView}=$props();</script><svelte:options preserveWhitespace={true}/><div class="sidebar-search-wrap">
    <span class="sidebar-search-icon" aria-hidden="true"><SidebarIcon name={view.searchIcon}/></span>
    <input type="text" class="sidebar-search" id="sidebar-search" placeholder="Search markers..." data-nav-input-action="filter-sidebar">
  </div><div class="nav-section">Home</div><div class="nav-item active is-active" data-category="dashboard" tabindex="0" role="button" data-nav-action={view.dashboard.action.name} data-nav-route={view.dashboard.action.route}>
    <span class="nav-item-icon" aria-hidden="true"><SidebarIcon name={view.dashboard.icon}/></span>
    <span class="nav-item-label">Dashboard</span>
    <span class="nav-item-count">{view.dashboardCount}</span></div><div class="nav-section">Lenses</div><div class="nav-item" data-category="labs" tabindex="0" role="button" data-nav-action={view.labs.action.name} data-nav-route={view.labs.action.route}>
    <span class="nav-item-icon" aria-hidden="true"><SidebarIcon name={view.labs.icon}/></span>
    <span class="nav-item-label">Labs</span>
    <span class="nav-item-count">{view.labsCount}</span></div><div class="nav-item" data-category="biology-scores" tabindex="0" role="button" data-nav-action={view.biology.action.name} data-nav-route={view.biology.action.route}>
    <span class="nav-item-icon" aria-hidden="true"><SidebarIcon name={view.biology.icon}/></span>
    <span class="nav-item-label">Biology Scores</span>
    <span class="nav-item-dot"></span></div><div class="nav-item" data-category="genome" tabindex="0" role="button" data-nav-action={view.genome.action.name} data-nav-route={view.genome.action.route}>
    <span class="nav-item-icon" aria-hidden="true"><SidebarIcon name={view.genome.icon}/></span>
    <span class="nav-item-label">Genome</span>
    {#if view.genomeBadge.kind==='dot'}<span class="nav-item-dot"></span>{:else}<span class="nav-item-count">{view.genomeBadge.text}</span>{/if}</div><div class="nav-item" data-category="body" tabindex="0" role="button" data-nav-action={view.body.action.name} data-nav-route={view.body.action.route}>
    <span class="nav-item-icon" aria-hidden="true"><SidebarIcon name={view.body.icon}/></span>
    <span class="nav-item-label">Body</span>
    {#if view.bodyBadge.kind==='dot'}<span class="nav-item-dot"></span>{:else}<span class="nav-item-count">{view.bodyBadge.text}</span>{/if}</div><ConditionalSidebarItem view={view.light}/><div class="nav-item" data-category="insight" tabindex="0" role="button" data-nav-action={view.insight.action.name} data-nav-route={view.insight.action.route}>
    <span class="nav-item-icon" aria-hidden="true"><SidebarIcon name={view.insight.icon}/></span>
    <span class="nav-item-label">Insight</span>
    <span class="nav-item-dot"></span></div><div class="nav-item" data-category="recommendations" tabindex="0" role="button" data-nav-action={view.recommendations.action.name} data-nav-route={view.recommendations.action.route}>
    <span class="nav-item-icon" aria-hidden="true"><SidebarIcon name={view.recommendations.icon}/></span><span class="nav-item-label">Tips</span><span class="nav-item-dot"></span></div><div class="nav-section">Analysis tools</div><div class="nav-item" data-category="compare" tabindex="0" role="button" data-nav-action={view.compare.action.name} data-nav-route={view.compare.action.route}>
    <span class="nav-item-icon" aria-hidden="true"><SidebarIcon name={view.compare.icon}/></span><span class="nav-item-label">Compare dates</span><span class="nav-item-dot"></span></div><div class="nav-item" data-category="correlations" tabindex="0" role="button" data-nav-action={view.correlations.action.name} data-nav-route={view.correlations.action.route}>
    <span class="nav-item-icon" aria-hidden="true"><SidebarIcon name={view.correlations.icon}/></span><span class="nav-item-label">Correlations</span><span class="nav-item-dot"></span></div><ConditionalSidebarItem view={view.emf}/><ConditionalSidebarItem view={view.lightAssessment}/><div class="nav-section">Manage</div><div class="nav-item" data-category="reports" tabindex="0" role="button" data-nav-action={view.reports.action.name}>
    <span class="nav-item-icon" aria-hidden="true"><SidebarIcon name={view.reports.icon}/></span><span class="nav-item-label">Reports</span><span class="nav-item-dot"></span></div><div class="nav-item" data-category="context" tabindex="0" role="button" data-nav-action={view.context.action.name}>
    <span class="nav-item-icon" aria-hidden="true"><SidebarIcon name={view.context.icon}/></span><span class="nav-item-label">Context</span><span class="nav-item-dot"></span></div><div class="nav-item" data-category="knowledge-base" tabindex="0" role="button" data-nav-action={view.knowledge.action.name}>
    <span class="nav-item-icon" aria-hidden="true"><SidebarIcon name={view.knowledge.icon}/></span><span class="nav-item-label">Knowledge Base</span><span class="nav-item-dot"></span></div><div class="nav-item" data-category="custom-markers" tabindex="0" role="button" data-nav-action={view.custom.action.name}>
    <span class="nav-item-icon" aria-hidden="true"><SidebarIcon name={view.custom.icon}/></span><span class="nav-item-label">Custom markers</span><span class="nav-item-dot"></span></div><div class="nav-section sidebar-title">Lab categories <button class="sidebar-add-marker" data-nav-action={view.labAction.name} title="Create custom biomarker">+</button></div>{#each view.categories as category}<SidebarCategoryItem view={category}/>{/each}{#each view.groups as group}<div class={group.className} data-group-name={group.name} data-nav-action={group.headerAction.name} data-nav-group={group.headerAction.group}>
      <button class="sidebar-group-toggle" data-nav-action={group.toggleAction.name} data-nav-group={group.toggleAction.group} aria-expanded={group.expanded} aria-label={group.accessibleName}>
        <span class="sidebar-group-label">{group.label}</span>
        {#if group.flagged!==null}<span class="flag-count">{group.flagged}</span>{/if}
      </button>
      <span class="sidebar-group-arrow" aria-hidden="true">▸</span>
    </div><div class="sidebar-group-items" data-group-items={group.itemsName} style={group.collapsedStyle}>{#each group.items as item}<SidebarCategoryItem view={item}/>{/each}</div>{/each}