<script lang="ts">
  import {untrack} from 'svelte';
  import {BODY_POSITIONS, WAIST_SITES, bodyPositionLabel, measurementDateLabel, measurementNumber, bodyMeasurementHeightCm, waistToHeightRatio, type BodyMeasurement as Reading, type BodyMeasurementKind, type BodyMeasurementDraft, type BodyPosition, type WaistSite} from '../body-measurement-model.js';
  import {isoDay} from '../wearable-adapters.js';
  import {bodyMeasurementCycleLabel, bodyMeasurementTiming} from '../body-measurement-cycle.js';
  import {button, surfaceButton, choiceButton, input as inputClass, closeButton, editorHeader, editorTitle, editorFooter} from '../context-form-classes.js';
  let {kind, initial, initialUnit, initialCycle, initialHeightCm, current, save, remove, close}: {
    kind: BodyMeasurementKind; initial: Reading[]; initialUnit: 'cm' | 'in'; initialCycle: unknown; initialHeightCm: unknown;
    current(): boolean; save(draft: BodyMeasurementDraft): void; remove(row: Reading): void; close(): void;
  } = $props();
  let records = $state.raw(untrack(() => initial));
  let cycle = $state.raw(untrack(() => initialCycle));
  let heightCm = $state(untrack(() => bodyMeasurementHeightCm(initialHeightCm)));
  const recent = untrack(() => [...initial].sort((a, b) => b.updatedAt - a.updatedAt)[0]);
  let position = $state<BodyPosition>(recent?.position || 'standing');
  let site = $state<WaistSite>(recent?.site || 'midpoint');
  let unit = $state<'cm' | 'in'>(untrack(() => initialUnit));
  let value = $state<number | undefined>(), hip = $state<number | undefined>();
  let valueCm = $state<number | undefined>(), hipCm = $state<number | undefined>();
  let original = $state.raw<BodyMeasurementDraft['original']>();
  let date = $state(isoDay()), busy = $state(false), status = $state('');
  let valueInput: HTMLInputElement;
  const isWaist = $derived(kind === 'waist');
  const field = $derived(isWaist ? `waist_${position}_${site}` : 'sad_supine_iliac');
  const matching = $derived(records.filter(row => row.field === field));
  const timing = $derived(bodyMeasurementTiming(cycle, matching, isoDay()));
  const cycleLabel = $derived(bodyMeasurementCycleLabel(cycle, date));
  const latest = $derived(matching[0]);
  const ratio = $derived(valueCm && hipCm ? (valueCm / hipCm).toFixed(2) : null);
  const heightRatio = $derived(isWaist && valueCm !== undefined ? waistToHeightRatio(valueCm, heightCm) : null);
  const latestHeightRatio = $derived(isWaist && latest ? waistToHeightRatio(latest.valueCm, heightCm) : null);
  const series = $derived([...matching].reverse());
  const minimum = $derived(Math.min(...series.map(row => row.valueCm)) - 1);
  const maximum = $derived(Math.max(...series.map(row => row.valueCm)) + 1);
  const points = $derived(series.map((row, index) => `${24 + index * 452 / Math.max(1, series.length - 1)},${104 - (row.valueCm - minimum) / (maximum - minimum) * 80}`).join(' '));
  const small = 'gb:context-form:text-xs gb:context-form:text-secondary';
  const labelClass = 'gb:context-form:mb-2 gb:context-form:block gb:context-form:text-xs gb:context-form:text-ink';
  export function report(message: string, pending: boolean): void {status = message; busy = pending;}
  export function refresh(rows: Reading[], cycleProfile: unknown, profileHeightCm: unknown): void {records = rows; cycle = cycleProfile; heightCm = bodyMeasurementHeightCm(profileHeightCm);}
  export function focusInput(): void {valueInput?.focus({preventScroll: true});}
  function setUnit(next: 'cm' | 'in'): void {
    if (next === unit) return;
    if (valueCm !== undefined) value = Number(measurementNumber(valueCm, next));
    if (hipCm !== undefined) hip = Number(measurementNumber(hipCm, next));
    unit = next;
  }
  function changeValue(event: Event, hips = false): void {
    const number = (event.currentTarget as HTMLInputElement).valueAsNumber;
    const cm = Number.isFinite(number) ? number * (unit === 'in' ? 2.54 : 1) : undefined;
    if (hips) hipCm = cm; else valueCm = cm;
  }
  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (!current() || busy || valueCm === undefined) return;
    save({kind, date, value: valueCm, hip: isWaist ? hipCm ?? null : null, position: isWaist ? position : 'supine', site: isWaist ? site : 'iliac', unit: 'cm', ...(original ? {original} : {})});
  }
  function edit(row: Reading): void {
    if (!current() || busy) return;
    position = row.position; site = row.site; date = row.date;
    original = {field: row.field, date: row.date};
    valueCm = row.valueCm; hipCm = row.hipCm ?? undefined;
    value = Number(measurementNumber(row.valueCm, unit));
    hip = row.hipCm === null ? undefined : Number(measurementNumber(row.hipCm, unit));
    focusInput();
  }
</script>
<div data-context-form-view="body-measurement" data-body-measurement-view class="gb:context-form:min-w-0">
  <header class={editorHeader}>
    <h2 id="body-measurement-title" class={editorTitle}>{isWaist ? 'Waist' : 'Abdominal depth'}</h2>
    <button type="button" class={closeButton} aria-label="Close body measurements" onclick={() => {if (current()) close();}}>×</button>
  </header>
  <div class="gb:context-form:px-[26px] gb:context-form:pt-[22px] gb:context-form:max-[720px]:px-[18px]">
    {#if latest}
      <div class="gb:context-form:mb-5 gb:context-form:flex gb:context-form:flex-wrap gb:context-form:items-baseline gb:context-form:gap-2">
        <strong class="gb:context-form:text-xl gb:context-form:font-semibold gb:context-form:text-ink">{measurementNumber(latest.valueCm, unit)} {unit}</strong>
        <span class={small}>{bodyPositionLabel(latest.position)} · {measurementDateLabel(latest.date)}</span>
        {#if matching[1]}<span class={small}>{latest.valueCm - matching[1].valueCm > 0 ? '+' : ''}{measurementNumber(latest.valueCm - matching[1].valueCm, unit)} {unit} since previous</span>{/if}
      </div>
      {#if latestHeightRatio !== null && heightCm !== null}<p data-latest-waist-height-ratio class={`${small} gb:context-form:mt-0 gb:context-form:mb-5`}>Waist-to-height <strong class="gb:context-form:font-semibold gb:context-form:text-ink">{latestHeightRatio.toFixed(2)}</strong> · current profile height {measurementNumber(heightCm, unit)} {unit}</p>{/if}
    {/if}
    {#if series.length > 1}
      <svg viewBox="0 0 500 138" role="img" aria-label={`${isWaist ? 'Waist' : 'Abdominal depth'} history, same position and tape location`} class="gb:context-form:mb-5 gb:context-form:block gb:context-form:w-full gb:context-form:text-link-ink">
        <polyline points={points} fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" />
        <text x="24" y="132" fill="var(--text-secondary)" font-size="12">{measurementDateLabel(series[0]!.date)}</text>
        <text x="476" y="132" text-anchor="end" fill="var(--text-secondary)" font-size="12">{measurementDateLabel(series[series.length - 1]!.date)}</text>
        <text x="24" y="15" fill="var(--text-secondary)" font-size="12">{unit} · same method</text>
      </svg>
    {/if}
    <form onsubmit={submit}>
      {#if timing}
        <aside aria-label="Cycle measurement timing" class="gb:context-form:mb-5 gb:context-form:rounded-xl gb:context-form:border gb:context-form:border-line gb:context-form:bg-surface gb:context-form:p-4">
          <strong class="gb:context-form:block gb:context-form:text-sm gb:context-form:font-semibold gb:context-form:text-ink">{timing.heading}</strong>
          {#if timing.dateLabel}<span class="gb:context-form:mt-1 gb:context-form:block gb:context-form:text-sm gb:context-form:text-ink">{timing.dateLabel}</span>{/if}
          <p class={`${small} gb:context-form:mt-2 gb:context-form:mb-0`}>{timing.hint}</p>
        </aside>
      {/if}
      <div class="gb:context-form:mb-4 gb:context-form:flex gb:context-form:items-center gb:context-form:gap-2" role="group" aria-label="Measurement unit">
        {#each ['cm', 'in'] as option}<button type="button" class={choiceButton} aria-pressed={unit === option} disabled={busy} onclick={() => setUnit(option as 'cm' | 'in')}>{option}</button>{/each}
      </div>
      <div class="gb:context-form:grid gb:context-form:grid-cols-2 gb:context-form:items-end gb:context-form:gap-4 gb:context-form:max-[480px]:grid-cols-1">
        <label><span class={labelClass}>{isWaist ? 'Waist' : 'Abdominal depth'} · {unit}</span><input class={inputClass} bind:this={valueInput} bind:value oninput={event => changeValue(event)} type="number" step="0.1" min="0.1" max={unit === 'cm' ? 400 : 157.4} inputmode="decimal" aria-label={isWaist ? `Waist in ${unit}` : `Abdominal depth in ${unit}`} placeholder={unit} required disabled={busy}/></label>
        {#if isWaist}<label><span class={labelClass}>Hips · {unit} <span class={small}>(optional)</span></span><input class={inputClass} bind:value={hip} oninput={event => changeValue(event, true)} type="number" step="0.1" min="0.1" max={unit === 'cm' ? 400 : 157.4} inputmode="decimal" aria-label={`Hips in ${unit}`} placeholder={unit} disabled={busy}/></label>{/if}
      </div>
      {#if isWaist}
        <fieldset class="gb:context-form:mx-0 gb:context-form:my-5 gb:context-form:border-0 gb:context-form:p-0">
          <legend class={labelClass}>Position</legend>
          <div class="gb:context-form:flex gb:context-form:flex-wrap gb:context-form:gap-2">{#each BODY_POSITIONS as option}<button type="button" class={choiceButton} aria-pressed={position === option.id} disabled={busy} onclick={() => {position = option.id;}}>{option.label}</button>{/each}</div>
        </fieldset>
        <label><span class={labelClass}>Tape location</span><select class={inputClass} bind:value={site} disabled={busy}>{#each WAIST_SITES as option}<option value={option.id}>{option.label}</option>{/each}</select></label>
        <p class={`${small} gb:context-form:mt-3 gb:context-form:mb-0`}>{WAIST_SITES.find(option => option.id === site)!.hint} Breathe out normally; keep the tape snug without pressing into the skin.</p>
        {#if hip !== undefined}<p class={`${small} gb:context-form:my-2`}>Hips: around the widest part of the buttocks, in the same position.</p>{/if}
        {#if ratio}<p class={`${small} gb:context-form:my-2`}>Waist-to-hip <strong class="gb:context-form:font-semibold gb:context-form:text-ink">{ratio}</strong></p>{/if}
        {#if heightRatio !== null && heightCm !== null}<p data-draft-waist-height-ratio class={`${small} gb:context-form:my-2`}>Waist-to-height <strong class="gb:context-form:font-semibold gb:context-form:text-ink">{heightRatio.toFixed(2)}</strong> · current profile height {measurementNumber(heightCm, unit)} {unit}</p>
        {:else if heightCm === null}<p class={`${small} gb:context-form:my-2`}>Add your height in your profile to see waist-to-height ratio.</p>{/if}
      {:else}
        <p class={`${small} gb:context-form:mt-3 gb:context-form:mb-0`}>Lie on your back, knees bent and feet flat. After a normal breath out, measure belly depth at the top of the hip bones with an abdominal caliper, without pressing.</p>
      {/if}
      <div class="gb:context-form:mt-5 gb:context-form:max-w-[200px]"><label><span class={labelClass}>Date</span><input class={inputClass} type="date" bind:value={date} max={isoDay()} required disabled={busy} aria-label="Measurement date"/></label></div>
      {#if cycleLabel}<p data-measurement-cycle-context class={`${small} gb:context-form:mt-2 gb:context-form:mb-0`}>{cycleLabel}</p>{/if}
      <p class={`${small} gb:context-form:my-3`}>Use the same position and spot each time. We’ll remember them.</p>
      {#if status}<p role="alert" class="gb:context-form:my-2 gb:context-form:text-xs gb:context-form:text-danger-ink">{status}</p>{/if}
      <footer class={editorFooter}><button class={`${button} gb:context-form:border-accent gb:context-form:bg-accent gb:context-form:text-on-accent`} type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save measurement'}</button><button class={surfaceButton} type="button" disabled={busy} onclick={() => {if (current()) close();}}>Cancel</button></footer>
    </form>
    {#if records.length}
      <details class="gb:context-form:my-5"><summary class="gb:context-form:cursor-pointer gb:context-form:text-sm gb:context-form:text-ink">History ({records.length})</summary>
        <ul class="gb:context-form:m-0 gb:context-form:mt-3 gb:context-form:list-none gb:context-form:p-0">{#each records as row (`${row.field}.${row.date}`)}<li class="gb:context-form:flex gb:context-form:flex-wrap gb:context-form:items-center gb:context-form:gap-2 gb:context-form:border-b gb:context-form:border-line gb:context-form:py-3">
          <div class="gb:context-form:min-w-0 gb:context-form:flex-1"><span class="gb:context-form:text-sm gb:context-form:text-ink">{measurementNumber(row.valueCm, unit)} {unit}</span><div class={small}>{row.date} · {bodyPositionLabel(row.position)} · {WAIST_SITES.find(option => option.id === row.site)!.label}</div>{#if bodyMeasurementCycleLabel(cycle, row.date)}<div class={small}>{bodyMeasurementCycleLabel(cycle, row.date)}</div>{/if}{#if row.hipCm !== null}<div class={small}>Hips {measurementNumber(row.hipCm, unit)} {unit} · Waist-to-hip {(row.valueCm / row.hipCm).toFixed(2)}</div>{/if}{#if isWaist && waistToHeightRatio(row.valueCm, heightCm) !== null}<div data-history-waist-height-ratio class={small}>Waist-to-height {waistToHeightRatio(row.valueCm, heightCm)!.toFixed(2)} · current profile height</div>{/if}</div>
          <button class={choiceButton} type="button" disabled={busy} onclick={() => edit(row)}>Edit</button><button class={choiceButton} type="button" disabled={busy} aria-label={`Delete measurement from ${row.date}`} onclick={() => {if (current()) remove(row);}}>Delete</button>
        </li>{/each}</ul>
      </details>
    {/if}
  </div>
</div>
