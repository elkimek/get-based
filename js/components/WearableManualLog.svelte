<script lang="ts">
  import WearableManualTags from './WearableManualTags.svelte';
  import WearableManualNote from './WearableManualNote.svelte';
  import type {ManualLogView} from "../wearables-entry-presentation.js";
  let {view}: {view: ManualLogView} = $props();
</script><svelte:options preserveWhitespace={true} />{#if view.mode === "strip-weight"}
      <div class="wearable-card-top"><span class="wearable-metric-name">Weight</span></div>
      <div class="wearable-log-form">
        <!-- svelte-ignore a11y_autofocus --><input type="number" step="0.1" inputmode="decimal" class="wearable-log-input" id="wl-weight-val" placeholder="{view.placeholder}" aria-label="{view.label}" autofocus>
        {#if view.note}<WearableManualNote view={view.note}/>{/if}
        <div class="wearable-log-row">
          <input type="date" class="wearable-log-date" id="wl-weight-date" value={view.date} max={view.max} aria-label="Date">
          <button type="button" class="wearable-log-save" {...view.save}>Save</button>
          <button type="button" class="wearable-log-cancel" {...view.cancel} aria-label="Cancel">✕</button>
        </div>
      </div>{:else if view.mode === "strip-bp"}
      <div class="wearable-card-top"><span class="wearable-metric-name">Blood pressure</span></div>
      <div class="wearable-log-form">
        <div class="wearable-log-bp-row">
          <!-- svelte-ignore a11y_autofocus --><input type="number" inputmode="numeric" class="wearable-log-input wearable-log-bp" id="wl-bp-sys" placeholder="sys" aria-label="Systolic" autofocus>
          <span class="wearable-log-sep">/</span>
          <input type="number" inputmode="numeric" class="wearable-log-input wearable-log-bp" id="wl-bp-dia" placeholder="dia" aria-label="Diastolic">
        </div>
        <input type="number" inputmode="numeric" class="wearable-log-input wearable-log-pulse-optional" id="wl-bp-pulse" placeholder="pulse (optional)" aria-label="Pulse (optional)">
        {#if view.tags}<WearableManualTags view={view.tags}/>{/if}
        {#if view.note}<WearableManualNote view={view.note}/>{/if}
        <div class="wearable-log-row">
          <input type="date" class="wearable-log-date" id="wl-bp-date" value={view.date} max={view.max} aria-label="Date">
          <button type="button" class="wearable-log-save" {...view.save}>Save</button>
          <button type="button" class="wearable-log-cancel" {...view.cancel} aria-label="Cancel">✕</button>
        </div>
      </div>{:else if view.mode === "strip-rhr"}
      <div class="wearable-card-top"><span class="wearable-metric-name">Resting HR</span></div>
      <div class="wearable-log-form">
        <!-- svelte-ignore a11y_autofocus --><input type="number" inputmode="numeric" class="wearable-log-input" id="wl-rhr-val" placeholder="bpm" aria-label="Resting heart rate in bpm" autofocus>
        {#if view.tags}<WearableManualTags view={view.tags}/>{/if}
        {#if view.note}<WearableManualNote view={view.note}/>{/if}
        <div class="wearable-log-row">
          <input type="date" class="wearable-log-date" id="wl-rhr-date" value={view.date} max={view.max} aria-label="Date">
          <button type="button" class="wearable-log-save" {...view.save}>Save</button>
          <button type="button" class="wearable-log-cancel" {...view.cancel} aria-label="Cancel">✕</button>
        </div>
      </div>{:else if view.mode === "detail-weight"}<form class="wearable-manual-add-form" {...view.form}>
      <!-- svelte-ignore a11y_autofocus --><input type="number" step="0.1" inputmode="decimal" class="wearable-log-input" id="wlad-val" placeholder="{view.placeholder}" aria-label="Weight in {view.label}" autofocus>
      {#if view.note}<WearableManualNote view={view.note}/>{/if}
      <input type="date" class="wearable-log-date" id="wlad-date" value={view.date}>
      <button type="submit" class="wearable-log-save">Save</button>
      <button type="button" class="wearable-log-cancel" {...view.cancel}>✕</button>
    </form>{:else if view.mode === "detail-rhr"}<form class="wearable-manual-add-form" {...view.form}>
      <!-- svelte-ignore a11y_autofocus --><input type="number" inputmode="numeric" class="wearable-log-input" id="wlad-val" placeholder="bpm" autofocus>
      {#if view.tags}<WearableManualTags view={view.tags}/>{/if}
      {#if view.note}<WearableManualNote view={view.note}/>{/if}
      <input type="date" class="wearable-log-date" id="wlad-date" value={view.date}>
      <button type="submit" class="wearable-log-save">Save</button>
      <button type="button" class="wearable-log-cancel" {...view.cancel}>✕</button>
    </form>{:else if view.mode === "detail-bp"}<form class="wearable-manual-add-form wearable-manual-add-form-bp" {...view.form}>
      <span class="wearable-log-bp-row">
        <!-- svelte-ignore a11y_autofocus --><input type="number" inputmode="numeric" class="wearable-log-input wearable-log-bp" id="wlad-sys" placeholder="sys" autofocus>
        <span class="wearable-log-sep">/</span>
        <input type="number" inputmode="numeric" class="wearable-log-input wearable-log-bp" id="wlad-dia" placeholder="dia">
      </span>
      <input type="number" inputmode="numeric" class="wearable-log-input wearable-log-pulse-optional" id="wlad-pulse" placeholder="pulse (optional)">
      {#if view.tags}<WearableManualTags view={view.tags}/>{/if}
      {#if view.note}<WearableManualNote view={view.note}/>{/if}
      <input type="date" class="wearable-log-date" id="wlad-date" value={view.date}>
      <button type="submit" class="wearable-log-save">Save</button>
      <button type="button" class="wearable-log-cancel" {...view.cancel}>✕</button>
    </form>{:else if view.mode === "tags"}{#if view.tags}<WearableManualTags view={view.tags}/>{/if}{:else if view.mode === "chip"}<button type="button" class="wearable-log-chip" data-wearable-log-action="toggle-chip" data-tag={view.tag}>{view.tagLabel}</button>{:else if view.mode === "note"}<textarea class="wearable-log-note" id={view.noteId} rows="2" placeholder="Optional note — e.g. retook because cuff felt loose, different arm, different lab, just after coffee..." aria-label="Optional note"></textarea>{/if}