<script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
  import ClientListRow from './ClientListRow.svelte';
  import ClientListIcon from './ClientListIcon.svelte';
  import type {ClientListOverviewView} from '../client-list-presentation.js';
  let {view}: {view: ClientListOverviewView} = $props();
</script><svelte:options preserveWhitespace={true} /><div class="cl-header">
    <div class="cl-header-left">
      <div>
        <h2 class="cl-title">Clients</h2>
        <div class="cl-count">{view.activeCount} active profile{view.activeCount === 1 ? '' : 's'}</div>
      </div>
    </div>
    <div class="cl-header-right">
      <input type="file" id="cl-json-import" accept=".json" style={componentStaticStyles.hidden} data-cl-change-action="import-json">
      <div class="cl-tools-wrap">
        <button type="button" class="cl-icon-btn cl-tools-btn" data-cl-action="toggle-tools-menu" aria-label="More client actions" title="More actions"><ClientListIcon name="more" /></button>
        <div class="cl-tools-menu" id="cl-tools-menu">
          <button type="button" class="cl-tools-item" data-cl-action="trigger-json-import"><ClientListIcon name="import" /><span>Import JSON</span></button>
          <button type="button" class="cl-tools-item" data-cl-action="export-all"><ClientListIcon name="export" /><span>Export all</span></button>
          <button type="button" class="cl-tools-item" data-cl-action="load-demo" data-cl-demo="female"><ClientListIcon name="user" /><span>Demo Sarah</span></button>
          <button type="button" class="cl-tools-item" data-cl-action="load-demo" data-cl-demo="male"><ClientListIcon name="user" /><span>Demo Alex</span></button>
        </div>
      </div>
      <button type="button" class="cl-new-btn" data-cl-action="open-form" aria-label="New Client"><ClientListIcon name="plus" /><span>New Client</span></button>
      <button type="button" class="modal-close cl-icon-btn" data-cl-action="close" aria-label="Close"><ClientListIcon name="close" /></button>
    </div>
  </div>
  <div class="cl-toolbar">
    <label class="cl-search-wrap" for="cl-search">
      <ClientListIcon name="search" />
      <input type="text" class="cl-search" id="cl-search" placeholder="Search clients..." value="{view.search}" data-cl-input-action="search">
    </label>
    <div class="cl-filter-group">
      <select class="cl-sort" aria-label="Sort clients" data-cl-change-action="sort">
        <option value="lastUpdated" selected={view.sort === 'lastUpdated'}>Last Updated</option>
        <option value="az" selected={view.sort === 'az'}>A → Z</option>
        <option value="za" selected={view.sort === 'za'}>Z → A</option>
        <option value="created" selected={view.sort === 'created'}>Created</option>
      </select>
      <select class="cl-status-filter" aria-label="Filter client status" data-cl-change-action="status-filter">
        <option value="active" selected={view.status === 'active'}>Active</option>
        <option value="flagged" selected={view.status === 'flagged'}>Flagged</option>
        <option value="all" selected={view.status === 'all'}>All</option>
        <option value="archived" selected={view.status === 'archived'}>Archived</option>
      </select>
    </div>
  </div>{#if view.showTags}<div class="cl-tag-filters">{#each view.tags as tag}<button class="cl-tag-chip{tag.active ? ' active' : ''}" data-cl-action="tag-filter" data-cl-tag={tag.value}>{tag.text}</button>{/each}{#if view.clearTag}<button class="cl-tag-chip cl-tag-clear" data-cl-action="tag-filter" data-cl-tag="">Clear</button>{/if}</div>{/if}<div class="cl-list">{#if view.empty}<div class="cl-empty">No clients match your filters</div>{/if}{#each view.rows as row}<ClientListRow view={row} />{/each}{#if view.archivedRows !== null}<details class="cl-archived-section">
      <summary class="cl-archived-header">Archived ({view.archivedCount})</summary>{#each view.archivedRows as row}<ClientListRow view={row} />{/each}</details>{/if}</div><div class="cl-row-menu" id="cl-active-menu"></div>