<script lang="ts">
  import type {CameraMessageView} from '../light-camera-presentation.js';
  import {cameraToolClasses as c} from '../light-camera-classes.js';
  import LightCameraLock from './LightCameraLock.svelte';
  let {view}: {view: CameraMessageView} = $props();
  const manualChoices = [
    {value: 'Warm LED (2700–3000K)', label: 'Warm LED'}, {value: 'Cool LED (4000K+)', label: 'Cool LED'},
    {value: 'Fluorescent', label: 'Fluorescent'}, {value: 'Incandescent / halogen', label: 'Incandescent'}, {value: 'Daylight', label: 'Daylight'},
  ];
</script>
{#if view.kind === 'cct-auto'}
  <span class={c('camera-note-warning')}>⚠ camera auto-white-balance is on — CCT reading is the camera's error, not the source. Try a different browser / phone, or use a meter for accurate readings.</span>
{:else if view.kind === 'cct-reading'}
  <span class={c(view.melanopic > 0.32 ? 'camera-note-warning' : 'camera-note-muted')}>{#if view.melanopic > 0.32}blue-rich camera signal ({(view.melanopic * 100).toFixed(0)}% RGB-blue proxy) — not M-EDI{:else if view.melanopic < 0.25}blue-poor camera signal ({(view.melanopic * 100).toFixed(0)}% RGB-blue proxy) — not a sleep-safety determination{:else}mixed camera RGB signal ({(view.melanopic * 100).toFixed(0)}% blue proxy) — not M-EDI{/if}</span>{#if view.banding}<br/><span class={c('camera-note-warning')}>⚠ Rolling-shutter banding detected — use a suitable flicker meter to quantify it</span>{/if}<br/><span class={c('camera-note-muted')}>Warm/cool appearance only. Similar CCT values can have very different spectra.</span>
{:else if view.kind === 'spectrum-auto'}
  <span class={c('camera-warning-body')}>⚠ camera auto-mode partially active — classification reliability is reduced. <LightCameraLock lock={view.lock}/></span>
{:else if view.kind === 'spectrum-reading'}
  <strong>{view.result.label}</strong> <span class={c('camera-muted')}>· {(view.result.confidence * 100).toFixed(0)}% confidence</span><br/><small class={c('camera-secondary')}>{view.result.reason}</small><br/><span class={c(view.result.circadian === 'blue-rich' ? 'camera-note-warning' : 'camera-note-muted')}>{view.result.circadian === 'mixed' ? 'mixed' : view.result.circadian} camera-RGB pattern</span> <span class={c('camera-note-muted')}>· camera blue ratio {(view.result.melanopic * 100).toFixed(0)}% · not a spectrum or M-EDI</span>
{:else if view.kind === 'spectrum-denied'}
  <div class={c('camera-denied-panel')}>
    <div class={c('camera-denied-title')}>Camera access denied</div>
    <div class={c('camera-denied-explanation')}>This tool reads the bulb's RGB profile to classify the source. To re-enable, open your browser's site settings and allow camera access for this page, then reopen the tool.</div>
    <div class={c('camera-denied-choice-label')}>Or pick the closest match manually:</div>
    <div class={c('camera-denied-choices')}>{#each manualChoices as choice}<button type="button" class={c('ctx-btn-option camera-control')} data-spec-manual={choice.value}>{choice.label}</button>{' '}{/each}</div>
  </div>
{:else if view.kind === 'flicker-wait'}
  Hold camera on a light for 5 seconds…{#if view.lock}<br/><LightCameraLock lock={view.lock}/>{/if}{#if view.lock?.frameRate && view.lock.frameRate < 60}<br/><small class={c('camera-warning')}>⚠ camera running at {Math.round(view.lock.frameRate)} fps. Frame rate, rolling-shutter timing, and exposure limit what this screen can detect.</small>{/if}
{:else if view.kind === 'flicker-reading'}
  <strong class={c(`flicker-score-${view.score}`)}>{view.label}</strong><br/><small class={c('camera-muted')}>banding proxy {view.bandingRatio.toFixed(3)} · frame change {view.frameRatio.toFixed(3)}{view.stripes >= 2 ? ` · ${view.stripes} stripes/frame` : ''} · no frequency estimate</small>
{:else if view.kind === 'flicker-denied'}
  Camera access denied — banding screen unavailable. <br/><span class={c('camera-note-muted')}>To re-enable this qualitative camera check, open your browser's site settings and allow camera access. Use a purpose-built meter for flicker frequency and modulation.</span>
{:else if view.kind === 'darkness-reading'}
  <strong class={c(`dark-status-${view.cls}`)}>{view.label}</strong><br/><small class={c('camera-muted')}>Camera level {view.cameraLevel.toFixed(0)}% · peak {view.peakLevel.toFixed(0)}%. Not lux and not a melatonin estimate.</small><br/>{#if view.lock?.iso != null && view.lock.exposure === 'manual'}<small class={c('camera-muted')}>Camera exposure held for this qualitative check. Device-specific low-light response still prevents an absolute lux reading.</small>{:else}<small class={c('camera-warning')}>Camera exposure could not be fully fixed. Treat this only as a check for obvious light or bright points. <LightCameraLock lock={view.lock}/></small>{/if}
{:else if view.kind === 'darkness-denied'}
  Camera access denied — the qualitative camera check is unavailable. <br/><span class={c('camera-note-muted')}>Use the meter-entry option above for a numerical photopic-lux reading.</span>
{:else if view.kind === 'glass-reading'}
  <strong>Camera-visible response through glass: about {(view.transmission * 100).toFixed(0)}% of the direct comparison</strong><br/><small>This is not a calibrated visible-transmission value. Scene movement, reflections, exposure, and phone spectral response affect it. <strong>UV or infrared transmission cannot be inferred</strong>; those require wavelength-appropriate meters.</small>{#if view.lock && view.lock.exposure !== 'manual'}<br/><small class={c('camera-warning')}>⚠ Camera auto-exposure was active, so it may have erased part of the difference. Treat this as qualitative.</small>{/if}
{:else if view.kind === 'lux-camera'}
  {#if view.calibrated && view.exposureHeld}Device-calibrated camera estimate. Repeatable on this phone, but not meter-grade. <LightCameraLock lock={view.lock}/>{:else}<b>Camera brightness proxy only.</b> {view.exposureHeld ? 'Calibrate beside a lux meter before saving an approximate lux value.' : 'This browser could not hold exposure, so camera lux is unavailable.'} <LightCameraLock lock={view.lock}/>{/if}
{:else if view.kind === 'lux-start'}
  {#if view.sensorUnavailable}<b>Phone light sensor unavailable.</b> Using the camera fallback instead.{:else}Starting the camera fallback…{/if}
{:else if view.kind === 'lux-denied'}
  <b>Camera unavailable.</b> Enter a reading from a real lux meter or a trusted meter app. Do not estimate it from the scale.
{/if}
