<script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
  import ClientListIcon from './ClientListIcon.svelte';
  import type {ClientFormAvatar,ClientFormFragmentView,ClientFormView} from '../client-list-form-presentation.js';
  let {view}:{view:ClientFormView|ClientFormFragmentView}=$props();
</script><svelte:options preserveWhitespace={true}/>{#snippet avatar(value:ClientFormAvatar)}{#if value.kind==='image'}<img class="cl-avatar-preview-img" id="cl-avatar-img" src={value.source} alt="">{:else}<span class="cl-avatar-preview-initial" id="cl-avatar-img" style={'background:'+value.color}>{value.initial}</span>{/if}{/snippet}{#snippet tagBody(value:string)}{value}<button type="button" class="cl-tag-remove" data-cl-action="remove-tag" aria-label="Remove tag"><ClientListIcon name="close"/></button>{/snippet}{#if view.kind==='form'}<div class="cl-header cl-form-header">
    <div class="cl-header-left">
      <button type="button" class="cl-back-btn cl-icon-btn" data-cl-action="back-to-list" aria-label="Back to clients"><ClientListIcon name="arrowLeft"/></button>
      <div>
        <h2 class="cl-title">{view.editing?'Edit Client':'New Client'}</h2>
        <div class="cl-count">{view.count}</div>
      </div>
    </div>
    <div class="cl-header-right">
      <button type="button" class="modal-close cl-icon-btn" data-cl-action="close" aria-label="Close"><ClientListIcon name="close"/></button>
    </div>
  </div>
  <form class="cl-form" data-cl-submit-action="save-form">
    <div class="cl-form-body">
      <section class="cl-form-section">
        <div class="cl-section-title">Profile</div>
        <div class="cl-form-row cl-avatar-row">
          <div class="cl-avatar-picker" data-cl-action="choose-avatar" data-cl-key-action="choose-avatar" role="button" tabindex="0">
            {@render avatar(view.avatar)}
            <span class="cl-avatar-edit-icon"><ClientListIcon name="camera"/></span>
          </div>
          <input type="file" id="cl-avatar-input" accept="image/*" style={componentStaticStyles.hidden} data-cl-change-action="avatar-changed">
          {#if view.removeAvatar}<button type="button" class="cl-avatar-remove" data-cl-action="remove-avatar">Remove photo</button>{/if}
        </div>
        <div class="cl-form-row">
          <label class="cl-form-label" for="cl-name">Name <span class="cl-required">*</span></label>
          <!-- svelte-ignore a11y_autofocus (Preserve the existing native form autofocus; managed modal focus remains controller-owned.) --><input type="text" class="cl-form-input" id="cl-name" value="{view.name}" required autofocus>
        </div>
        <div class="cl-form-row-split">
          <div class="cl-form-row cl-form-col">
            <span class="cl-form-label" id="cl-sex-label">Sex</span>
            <div class="cl-sex-toggle" id="cl-sex-toggle" role="group" aria-labelledby="cl-sex-label">
              <button type="button" class="sex-toggle-btn{view.male?' active':''}" data-sex="male" data-cl-action="set-sex" data-cl-sex="male">Male</button>
              <button type="button" class="sex-toggle-btn{view.female?' active':''}" data-sex="female" data-cl-action="set-sex" data-cl-sex="female">Female</button>
            </div>
          </div>
          <div class="cl-form-row cl-form-col">
            <label class="cl-form-label" for="cl-dob">Date of Birth</label>
            <input type="date" class="cl-form-input cl-form-date" id="cl-dob" value="{view.dob}">
          </div>
        </div>
      </section>

      <section class="cl-form-section">
        <div class="cl-section-title">Region</div>
        <div class="cl-form-row">
          <label class="cl-form-label" for="cl-country">Home location <span class="cl-label-detail">circadian, seasonal, and regional context</span></label>
          <div class="cl-form-row-split">
            <div class="cl-form-col">
              <input type="text" class="cl-form-input" id="cl-country" value="{view.country}" placeholder="Country (e.g. Slovakia)" data-cl-input-action="update-lat" list="cl-country-list" autocomplete="country-name">
              <datalist id="cl-country-list">
                <option value="Czech Republic"></option>
                <option value="Slovakia"></option>
                <option value="Germany"></option>
                <option value="Austria"></option>
                <option value="United States"></option>
                <option value="France"></option>
                <option value="Italy"></option>
                <option value="Spain"></option>
                <option value="Netherlands"></option>
                <option value="Belgium"></option>
                <option value="Poland"></option>
                <option value="Hungary"></option>
                <option value="Portugal"></option>
                <option value="Ireland"></option>
                <option value="Denmark"></option>
                <option value="Sweden"></option>
                <option value="Finland"></option>
                <option value="United Kingdom"></option>
                <option value="Canada"></option>
                <option value="Australia"></option>
              </datalist>
            </div>
            <div class="cl-form-col">
              <input type="text" class="cl-form-input" id="cl-zip" value="{view.zip}" placeholder="ZIP / postal code" data-cl-input-action="update-lat">
            </div>
          </div>
          <div id="cl-lat-display" class="cl-lat-display"></div>
          <div class="cl-form-help">{view.help}</div>
        </div>
      </section>

      <section class="cl-form-section">
        <div class="cl-section-title">Health Metadata</div>
        <div class="cl-form-row-split">
          <div class="cl-form-row cl-form-col">
            <label class="cl-form-label" for="cl-height">Height <a href="#cl-height" class="cl-bio-unit-toggle" id="cl-height-unit-toggle" data-unit="{view.unitAttr}" data-cl-action="height-unit">{view.unitText}</a></label>
            <input type="number" class="cl-form-input" id="cl-height" value="{view.height}" step="{view.step}" placeholder="{view.heightPlaceholder}" data-cl-input-action="update-bmi">
            <input type="hidden" id="cl-height-unit" value="{view.hiddenUnit}">
          </div>
          {#if view.editing}<div class="cl-form-row cl-form-col">
            <label class="cl-form-label" for="cl-bmi-display">BMI</label>
            <output class="mc-auto-value cl-bmi-display" id="cl-bmi-display"></output>
          </div>{/if}
        </div>
        <div class="cl-health-note">
          {#if view.editing}<a href="#dashboard" class="cl-health-link" data-cl-action="health-metrics">Log weight, blood pressure and pulse on the dashboard</a>{:else}Log weight, blood pressure and pulse on the dashboard after creating the client.{/if}
        </div>
        <div class="cl-form-row">
          <label class="cl-form-label" for="cl-haplogroup">mtDNA Haplogroup <span class="cl-label-detail">maternal lineage</span></label>
          <div class="cl-haplogroup-row">
            <select class="cl-form-input cl-haplogroup-select" id="cl-haplogroup" data-cl-change-action="haplogroup-changed">
              <option value="">Not set</option>
              {#each view.haplogroups as option}<option value={option.value} selected={option.selected}>{option.text}</option>{/each}
            </select>
            <span id="cl-hg-coupling" class="cl-hg-coupling">{view.coupling}</span>
          </div>
        </div>
      </section>

      <section class="cl-form-section">
        <div class="cl-section-title">Client Notes</div>
        <div class="cl-form-row">
          <label class="cl-form-label" for="cl-tag-input">Tags</label>
          <div class="cl-tags-wrap" id="cl-tags-wrap">
            {#each view.tags as tag}<span class="cl-tag-pill">{@render tagBody(tag)}</span>{/each}
            <input type="text" class="cl-tag-input" id="cl-tag-input" placeholder="Add tag + Enter" data-cl-key-action="tag-input">
          </div>
        </div>
        <div class="cl-form-row">
          <label class="cl-form-label" for="cl-notes">Notes</label>
          <textarea class="cl-form-textarea" id="cl-notes" rows="3" placeholder="Practitioner notes...">{view.notes}</textarea>
        </div>
        <div class="cl-form-row">
          <span class="cl-form-label" id="cl-status-label">Status</span>
          <div class="cl-status-radios" role="group" aria-labelledby="cl-status-label">
            <label class="cl-radio"><input type="radio" name="cl-status" value="active" checked={view.active}> Active</label>
            <label class="cl-radio"><input type="radio" name="cl-status" value="flagged" checked={view.flagged}> Flagged</label>
            <label class="cl-radio"><input type="radio" name="cl-status" value="archived" checked={view.archived}> Archived</label>
          </div>
        </div>
      </section>
    </div>
    <div class="cl-form-actions">
      <button type="button" class="cl-form-cancel" data-cl-action="back-to-list">Cancel</button>
      <button type="submit" class="cl-form-save">{view.editing?'Save Changes':'Create Client'}</button>
    </div>
  </form>{:else if view.kind==='avatar'}{@render avatar(view.avatar)}<span class="cl-avatar-edit-icon"><ClientListIcon name="camera"/></span>{:else}{@render tagBody(view.text)}{/if}