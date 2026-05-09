#!/usr/bin/env node
// upgrade-demos.mjs — apply 2026-05-09 demo expansion to demo-female + demo-male.
//
// Goals:
//   1. Backfill all biomarkers to ≥4 datapoints by adding 2 historical
//      entries (2024-04, 2024-12) so charts show real trend lines.
//   2. Add the entire Light & Sun lens (sunSessions / lightDevices /
//      deviceSessions / lightEnvironment / lightAudits / lightMeasurements
//      / sunDefaults / lightDailyVerdicts / sunCorrelations).
//   3. Add showcase fields for the modern manual-log path (manualValues),
//      specialty custom markers, custom reference ranges (refOverrides),
//      category/marker display labels, wearable card order.
//
// Idempotent: re-running detects the v3 marker on the file and refuses
// to double-apply. Bumps `version` to 3 + sets `upgradedAt`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEMOS = [
  { file: 'data/demo-female.json', sex: 'F', name: 'Demo Female' },
  { file: 'data/demo-male.json',   sex: 'M', name: 'Demo Male' },
];

// ─── Anchors used across all generators ───────────────────────────────
const NOW_ISO = '2026-05-09T08:30:00.000Z';
const NOW_MS  = Date.parse(NOW_ISO);
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS  = 24 * HOUR_MS;

// Historical entries we add. The existing demos run 2025-04 → 2026-01;
// these extend the window back so every marker hits ≥4 datapoints.
const BACKFILL_DATES = ['2024-04-15', '2024-12-08'];

// ─── 1. Marker backfill ───────────────────────────────────────────────
//
// We pad the history with two new comprehensive panels. Each panel
// includes EVERY marker that currently has <4 datapoints so they all
// reach 4. We sample a value from a realistic gaussian around the
// 4-entry mean; this gives natural-looking trend lines without
// hand-crafting per-marker.

function meanOf(arr) {
  const nums = arr.filter(v => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function sampleAround(mean, jitterPct) {
  if (!Number.isFinite(mean)) return null;
  // Deterministic jitter — seed by the mean so repeated runs are stable.
  const seed = Math.abs(Math.sin(mean * 1000)) * 1000;
  const offset = ((seed % 200) - 100) / 100; // [-1, 1]
  const v = mean * (1 + offset * jitterPct);
  // Round sensibly — numbers >100 get integer, <10 get 2 decimals, else 1.
  if (Math.abs(mean) > 100) return Math.round(v);
  if (Math.abs(mean) < 10)  return Math.round(v * 100) / 100;
  return Math.round(v * 10) / 10;
}

function backfillMarkers(data) {
  // Snapshot the existing per-marker values across all entries.
  const valuesByMarker = {};
  for (const e of data.entries) {
    for (const [k, v] of Object.entries(e.markers || {})) {
      if (!valuesByMarker[k]) valuesByMarker[k] = [];
      if (v != null) valuesByMarker[k].push(v);
    }
  }
  // Markers needing more datapoints. Their current count is .length;
  // we fill to 4 across the two new historical entries.
  const shortMarkers = Object.entries(valuesByMarker)
    .filter(([, vals]) => vals.length < 4)
    .map(([k, vals]) => ({ key: k, count: vals.length, mean: meanOf(vals) }));

  // Build the two backfill entries. Each carries 1 "earlier" value for
  // every short marker. Markers needing only +1 datapoint get a value
  // in entry 1 (older); markers needing +2 also get one in entry 2.
  // Markers needing +3 get values in both new entries AND an additional
  // value gets injected into one of the existing entries (rare — only
  // for the 5 singleton markers).
  const entry1Markers = {}; // 2024-04-15
  const entry2Markers = {}; // 2024-12-08
  const additions = []; // {entryIndex, key, value} for filling existing rows
  for (const m of shortMarkers) {
    const need = 4 - m.count;
    if (need <= 0) continue;
    if (m.mean == null) continue; // can't fabricate — skip
    if (need >= 1) entry2Markers[m.key] = sampleAround(m.mean, 0.06);
    if (need >= 2) entry1Markers[m.key] = sampleAround(m.mean, 0.10);
    if (need >= 3) {
      // Find an existing entry that DOESN'T have this marker, add it there.
      // Singleton markers (1 datapoint) need 3 added; we cover 2 via the
      // backfill entries + 1 here.
      for (let i = 0; i < data.entries.length; i++) {
        if (data.entries[i].markers && data.entries[i].markers[m.key] == null) {
          additions.push({ entryIndex: i, key: m.key, value: sampleAround(m.mean, 0.08) });
          break;
        }
      }
    }
  }

  // Apply the in-place additions to existing entries.
  for (const a of additions) {
    data.entries[a.entryIndex].markers[a.key] = a.value;
    if (data.entries[a.entryIndex].markerSources) {
      data.entries[a.entryIndex].markerSources[a.key] = {
        file: 'Backfill 2024 historical lab record.pdf',
        at: Date.parse(data.entries[a.entryIndex].date + 'T08:00:00.000Z'),
      };
    }
  }

  // Construct + push the two new entries.
  function buildEntry(date, markers, label) {
    const at = Date.parse(date + 'T08:00:00.000Z');
    const sources = {};
    for (const k of Object.keys(markers)) sources[k] = { file: label, at };
    return { date, file: null, markers, markerSources: sources };
  }
  if (Object.keys(entry1Markers).length) {
    data.entries.unshift(buildEntry('2024-04-15', entry1Markers, '2024-Q2 specialty + comprehensive panel.pdf'));
  }
  if (Object.keys(entry2Markers).length) {
    data.entries.unshift(buildEntry('2024-12-08', entry2Markers, '2024-Q4 follow-up + specialty panel.pdf'));
  }
  // Re-sort entries chronologically.
  data.entries.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── 2. Light & Sun stack ─────────────────────────────────────────────

function buildSunDefaults(sex) {
  return {
    fitzpatrick: sex === 'F' ? 'II' : 'III',
    eyeColor: sex === 'F' ? 'blue' : 'brown',
    timeOutdoorsMin: 35,
    indoorJobLightConditions: 'office_led',
    photosensitiveMeds: 'none',
    // `coords` is what getSunCoords() in sun.js:2329 reads — earlier
    // draft used `location` (matches session-level shape) which got
    // ignored, leaving the conditions strip empty on the demo because
    // no profile country was set either.
    coords: { lat: 50.0755, lon: 14.4378, source: 'profile-precise', label: 'Prague, CZ' },
    completedAt: NOW_MS - 60 * DAY_MS,
    ottScore: sex === 'F' ? 6 : 5,
    ottAnswers: sex === 'F'
      ? { time_outside: 2, daylight_room: 3, screen_evening: 1, blackout_sleep: 2, sunlight_morning: 0, sunset_visible: 1, midday_outside: 1, glasses_outdoor: 0, blue_blocker: 1, holiday_outside: 1 }
      : { time_outside: 1, daylight_room: 2, screen_evening: 1, blackout_sleep: 1, sunlight_morning: 0, sunset_visible: 0, midday_outside: 1, glasses_outdoor: 1, blue_blocker: 1, holiday_outside: 0 },
  };
}

function buildLightDevices(sex) {
  // Two devices both demos own. Female has the UVB combo; male has the
  // pure-NIR panel — same brands, different SKUs to show variety.
  const base = NOW_MS - 60 * DAY_MS;
  return [
    {
      id: 'dev_demo_uvb',
      brand: 'Mitochondriak',
      model: sex === 'F' ? 'Maxi UVB' : 'Maxi UVB',
      type: 'uvb',
      peakWavelengths: [295, 380, 480, 630, 670, 760, 810, 830, 850],
      mwPerCm2At15cm: 65,
      recommendedDistanceCm: 60,
      lux: 12000,
      addedAt: base,
      modes: [
        { id: 'full',  label: 'Full spectrum',  default: true,  groups: ['uvb', 'visible', 'nir'] },
        { id: 'uv',    label: 'UV only',        default: false, groups: ['uvb'] },
        { id: 'nir',   label: 'NIR only',       default: false, groups: ['nir'] },
      ],
      channelGroups: [
        { id: 'uvb',     label: 'UVB diodes',  peaks: [295, 380] },
        { id: 'visible', label: 'Visible',     peaks: [480, 630, 670] },
        { id: 'nir',     label: 'Near-IR',     peaks: [760, 810, 830, 850] },
      ],
      notes: 'Anchor device — calibrated against dminder app. Use full mode 5×/wk midday.',
    },
    {
      id: 'dev_demo_redlight',
      brand: 'Chroma',
      model: 'D60 Solar',
      type: 'combined',
      peakWavelengths: [630, 670, 760, 810, 830, 850],
      mwPerCm2At15cm: 110,
      recommendedDistanceCm: 30,
      lux: 4500,
      addedAt: base + 14 * DAY_MS,
      notes: 'Bedside — used post-workout for recovery + on workdays as eye-channel anchor.',
    },
  ];
}

function buildSunSessions(sex) {
  // Compressed schedule — 6 sessions in last 7 days + 2 historical for
  // trend continuity. Earlier draft spread 8 sessions over 42 days, so
  // the rolling 7-day channel rollup only saw 2 sessions and every
  // pill stayed at tier 1 ("low") with totals ~1-3% of weekly target.
  // Active-user demos should land in tier 2-3 territory (20-100% of
  // weekly target) so the channel pills + AI rollup look populated.
  const sessions = [];
  const loc = { lat: 50.0755, lon: 14.4378, label: 'Prague, CZ' };
  const fitz = sex === 'F' ? 'II' : 'III';
  const plan = sex === 'F' ? [
    { daysAgo: 0,  hour: 12.5, durationMin: 25, fraction: 0.32, regions: ['face','arms-front','torso-front','legs-front'], glass: false, rotated: false, uvi: 5.8, vitDAu: 105, eyeMode: 'direct' },
    { daysAgo: 1,  hour: 8.0,  durationMin: 22, fraction: 0.05, regions: ['face'],                                         glass: false, rotated: false, uvi: 1.5, vitDAu: 3,   eyeMode: 'direct' },
    { daysAgo: 2,  hour: 12.0, durationMin: 30, fraction: 0.45, regions: ['face','arms-front','arms-back','torso-front','torso-back','legs-front'], glass: false, rotated: true,  uvi: 6.4, vitDAu: 165, eyeMode: 'direct' },
    { daysAgo: 3,  hour: 13.5, durationMin: 20, fraction: 0.18, regions: ['face','arms-front','torso-front'],              glass: false, rotated: false, uvi: 4.5, vitDAu: 60,  eyeMode: 'direct' },
    { daysAgo: 4,  hour: 7.5,  durationMin: 12, fraction: 0.05, regions: ['face'],                                         glass: false, rotated: false, uvi: 1.2, vitDAu: 2,   eyeMode: 'direct' },
    { daysAgo: 6,  hour: 12.5, durationMin: 28, fraction: 0.32, regions: ['face','arms-front','torso-front','legs-front'], glass: false, rotated: true,  uvi: 6.2, vitDAu: 130, eyeMode: 'direct' },
    { daysAgo: 9,  hour: 13.0, durationMin: 18, fraction: 0.18, regions: ['face','arms-front','torso-front'],              glass: false, rotated: false, uvi: 6.1, vitDAu: 70,  eyeMode: 'direct' },
    { daysAgo: 14, hour: 11.5, durationMin: 12, fraction: 0.05, regions: ['face'],                                         glass: true,  rotated: false, uvi: 5.9, vitDAu: 0,   eyeMode: 'indoor' },
  ] : [
    { daysAgo: 0,  hour: 12.5, durationMin: 30, fraction: 0.35, regions: ['face','arms-front','torso-front','legs-front'], glass: false, rotated: true,  uvi: 5.8, vitDAu: 115, eyeMode: 'direct' },
    { daysAgo: 1,  hour: 7.0,  durationMin: 15, fraction: 0.05, regions: ['face'],                                         glass: false, rotated: false, uvi: 0.8, vitDAu: 1,   eyeMode: 'direct' },
    { daysAgo: 2,  hour: 13.0, durationMin: 35, fraction: 0.45, regions: ['face','arms-front','arms-back','torso-front','torso-back','legs-front'], glass: false, rotated: true,  uvi: 6.5, vitDAu: 178, eyeMode: 'direct' },
    { daysAgo: 4,  hour: 12.0, durationMin: 25, fraction: 0.32, regions: ['face','arms-front','torso-front','legs-front'], glass: false, rotated: false, uvi: 6.2, vitDAu: 110, eyeMode: 'direct' },
    { daysAgo: 5,  hour: 8.5,  durationMin: 18, fraction: 0.05, regions: ['face'],                                         glass: false, rotated: false, uvi: 1.5, vitDAu: 3,   eyeMode: 'direct' },
    { daysAgo: 6,  hour: 14.0, durationMin: 22, fraction: 0.28, regions: ['face','arms-front','torso-front'],              glass: false, rotated: false, uvi: 6.0, vitDAu: 92,  eyeMode: 'direct' },
    { daysAgo: 11, hour: 11.0, durationMin: 20, fraction: 0.18, regions: ['face','arms-front','torso-front'],              glass: false, rotated: false, uvi: 5.4, vitDAu: 62,  eyeMode: 'direct' },
  ];
  for (const p of plan) {
    const startedAt = NOW_MS - p.daysAgo * DAY_MS;
    const start = new Date(startedAt);
    start.setHours(Math.floor(p.hour), Math.round((p.hour % 1) * 60), 0, 0);
    const startMs = start.getTime();
    const endMs = startMs + p.durationMin * 60 * 1000;
    // Approximate doses across the 6 + 2 channels — scaled by fraction +
    // duration. Realistic-ish, matches what the spectrum engine would
    // compute given these UVI / body fraction inputs.
    // Channel-au magnitudes calibrated against the docstring targets in
    // sun.js:138 (e.g. "30 min direct outdoor = ~20000 channel-au" for
    // circadian, "60 min @ 30% body = ~30000" for nir_solar). Eye
    // channels gate on eyeMode=direct; skin channels gate on body
    // fraction. Glass between blocks all skin channels except glass-pass
    // visible (~0 for vit-D / no_cv / pomc).
    const eyeFactor = p.eyeMode === 'direct' ? 1 : (p.eyeMode === 'glass-window' ? 0.4 : 0);
    const doses = {
      vitamin_d:  p.glass ? 0 : Math.round(p.vitDAu),
      pomc:       p.glass ? 0 : Math.round(p.vitDAu * 0.4),
      no_cv:      p.glass ? 0 : Math.round(p.durationMin * p.fraction * p.uvi * 25),
      violet_eye: Math.round(p.durationMin * 270 * eyeFactor),
      circadian:  Math.round(p.durationMin * 670 * eyeFactor),
      nir_solar:  p.glass ? 0 : Math.round(p.durationMin * p.fraction * 1666),
      pbm_red:    0,
      pbm_nir:    0,
    };
    const med = Math.min(1.6, p.fraction * (p.uvi / 8) * (p.durationMin / 25));
    sessions.push({
      id: `sun_demo_${p.daysAgo}d`,
      startedAt: startMs,
      endedAt: endMs,
      durationMin: p.durationMin,
      location: loc,
      bodyExposure: {
        preset: p.fraction > 0.4 ? 'full_torso' : p.fraction > 0.15 ? 'arms_chest' : 'face_hands',
        fraction: p.fraction,
        regions: p.regions,
        sunscreenSPF: null,
        glassBetween: p.glass,
        rotatedSides: p.rotated,
      },
      eyeExposure: { mode: p.eyeMode, lensTint: p.eyeMode === 'direct' ? 'clear' : 'clear', durationSec: p.durationMin * 60 },
      posture: 'standing',
      surfaceAlbedo: 'grass',
      atmosphere: {
        uvIndex: p.uvi,
        cloudCover: p.uvi < 3 ? 0.4 : 0.1,
        ozoneDU: 320,
        sunElevationDeg: p.hour >= 11 && p.hour <= 14 ? 55 + (Math.random() - 0.5) * 5 : 22,
        airMass: p.hour >= 11 && p.hour <= 14 ? 1.2 : 2.5,
        snapshotAt: startMs,
        source: 'auto',
        confidence: 0.85,
      },
      doses,
      safety: {
        fitzpatrick: fitz,
        medFraction: Math.round(med * 100) / 100,
        psm: 'none',
        skinTypeIdx: fitz === 'II' ? 1 : 2,
      },
      notes: '',
    });
  }
  return sessions;
}

function buildDeviceSessions(devices) {
  // 6 device sessions over the last ~5 weeks across both devices.
  const uvb = devices.find(d => d.type === 'uvb');
  const red = devices.find(d => d.type === 'combined');
  // Compressed schedule — 4 sessions in last 7 days + 2 in days 8-14
  // for trend continuity. Dose magnitudes calibrated against the
  // CHANNEL_DISPLAY daily targets in sun.js:138:
  //  • UVB Maxi (full mode) at 60cm/6min/torso-front:
  //    vit_d ~100 channel-au (= ~6000 IU after fitz scaling),
  //    pbm_red 1500 (red diodes contribute), pbm_nir 2000.
  //  • Chroma D60 Solar at 25cm/12min/torso-target:
  //    pbm_red 6500, pbm_nir 8400 (full daily target in one session).
  // 7-day rollup: pbm_red ~28000 (tier 3 = good), pbm_nir ~35000
  // (tier 3), vit_d gets supplemented by the 2 UVB sessions.
  const plan = [
    { daysAgo: 0,  deviceId: red.id, mode: null,   durationMin: 12, distanceCm: 25, bodyArea: 'face',         bodyAreas: ['face', 'thyroid-throat'],   eyesProtected: false, doses: { pbm_red: 6500, pbm_nir: 8200, circadian: 1100 } },
    { daysAgo: 2,  deviceId: uvb.id, mode: 'full', durationMin: 6,  distanceCm: 60, bodyArea: 'torso-front', bodyAreas: ['torso-front', 'arms-front'], eyesProtected: true,  doses: { vitamin_d: 105, nir_solar: 600, pbm_red: 1500, pbm_nir: 2000 } },
    { daysAgo: 4,  deviceId: red.id, mode: null,   durationMin: 15, distanceCm: 25, bodyArea: 'torso-back',  bodyAreas: ['torso-back', 'glutes'],     eyesProtected: false, doses: { pbm_red: 8200, pbm_nir: 10500 } },
    { daysAgo: 5,  deviceId: uvb.id, mode: 'full', durationMin: 7,  distanceCm: 60, bodyArea: 'torso-front', bodyAreas: ['torso-front', 'arms-front'], eyesProtected: true,  doses: { vitamin_d: 125, nir_solar: 700, pbm_red: 1800, pbm_nir: 2300 } },
    { daysAgo: 8,  deviceId: red.id, mode: null,   durationMin: 10, distanceCm: 25, bodyArea: 'face',         bodyAreas: ['face'],                     eyesProtected: false, doses: { pbm_red: 5200, pbm_nir: 6800, circadian: 900 } },
    { daysAgo: 11, deviceId: uvb.id, mode: 'full', durationMin: 5,  distanceCm: 60, bodyArea: 'torso-front', bodyAreas: ['torso-front'],              eyesProtected: true,  doses: { vitamin_d: 88,  nir_solar: 500, pbm_red: 1200, pbm_nir: 1700 } },
  ];
  return plan.map(p => {
    const startedAt = NOW_MS - p.daysAgo * DAY_MS - 4 * HOUR_MS;
    return {
      id: `devsess_demo_${p.daysAgo}d`,
      deviceId: p.deviceId,
      startedAt,
      endedAt: startedAt + p.durationMin * 60 * 1000,
      durationMin: p.durationMin,
      distanceCm: p.distanceCm,
      bodyArea: p.bodyArea,
      bodyAreas: p.bodyAreas,
      eyesProtected: p.eyesProtected,
      mode: p.mode,
      doses: p.doses,
      notes: '',
    };
  });
}

function buildLightEnvironment(sex) {
  const base = NOW_MS - 50 * DAY_MS;
  const rooms = [
    {
      id: 'room_demo_bedroom',
      name: 'Bedroom',
      primarySource: 'led_warm',
      cct: 2700,
      flickerScore: 1,
      hoursOccupiedPerDay: 9,
      eveningHoursAfterSunset: '1-3hr',
      eveningUseAfterSunset: true,
      notes: 'Switched to amber bulbs for evening + blackout curtains installed mid-March.',
      updatedAt: base + 30 * DAY_MS,
    },
    {
      id: 'room_demo_office',
      name: 'Office',
      primarySource: 'led_cool',
      cct: 5000,
      flickerScore: 2,
      hoursOccupiedPerDay: 7,
      eveningHoursAfterSunset: '<1hr',
      eveningUseAfterSunset: false,
      notes: 'Window-side desk; natural daylight 9am–4pm. Overhead LED only on cloudy days.',
      updatedAt: base + 12 * DAY_MS,
    },
    {
      id: 'room_demo_kitchen',
      name: 'Kitchen',
      primarySource: 'mixed',
      cct: 3500,
      flickerScore: 0,
      hoursOccupiedPerDay: 3,
      eveningHoursAfterSunset: '1-3hr',
      eveningUseAfterSunset: true,
      notes: '',
      updatedAt: base,
    },
  ];
  const screens = [
    {
      id: 'scr_demo_laptop',
      device: 'laptop',
      roomId: 'room_demo_office',
      hoursPerDay: '6+hr',
      eveningUseAfterSunset: '<1hr',
      blueBlockerEnabled: true,
      flickerScore: 1,
      updatedAt: base + 5 * DAY_MS,
    },
    {
      id: 'scr_demo_phone',
      device: 'phone',
      roomId: 'room_demo_bedroom',
      hoursPerDay: '3-6hr',
      eveningUseAfterSunset: '1-3hr',
      blueBlockerEnabled: false,
      flickerScore: 1,
      updatedAt: base + 5 * DAY_MS,
    },
  ];
  return {
    rooms,
    screens,
    burdenAI: {
      status: 'ok',
      dot: 'yellow',
      tip: 'Indoor light load is moderate — bedroom evening use is the main lever.',
      detail: 'Daytime exposure is good (window-side office, kitchen mixed). Evening bedroom is the weak spot: 1–3hr screen + warm-LED is ok for sleep but 1+ unblocked hr of phone reduces melatonin onset by ~30 min on average. Consider blue-blockers on phone after 9pm OR cutting evening phone use to <1hr.',
      generatedAt: NOW_MS - 4 * DAY_MS,
    },
  };
}

function buildLightAudits(env) {
  // Two snapshots: one before the bedroom amber-bulb upgrade, one after.
  const before = {
    id: 'la_demo_before',
    date: '2026-03-20',
    label: 'Baseline — pre-bedroom upgrade',
    notes: 'Before swapping bedroom bulbs to amber + installing blackout curtains.',
    rooms: env.rooms.map(r => r.id === 'room_demo_bedroom'
      ? { ...r, primarySource: 'led_cool', cct: 4000, flickerScore: 2, notes: 'Cool-white overhead LED', updatedAt: Date.parse('2026-03-20T08:00:00Z') }
      : { ...r }),
    screens: env.screens.map(s => ({ ...s })),
    measurements: [],
    createdAt: Date.parse('2026-03-20T08:00:00Z'),
    aiAnalysis: {
      status: 'ok',
      dot: 'red',
      tip: 'Cool-white bedroom overhead is the main melatonin suppressor.',
      detail: '4000K bedroom lighting at evening use breaks the sleep-onset signal. Pair this with 1–3hr unblocked phone time and you get measurable phase delay. Highest-leverage fix is bulb swap to <2700K + blackout for the sleep window.',
      generatedAt: Date.parse('2026-03-20T08:30:00Z'),
    },
  };
  const after = {
    id: 'la_demo_after',
    date: '2026-04-25',
    label: 'After — amber bulbs + blackout',
    notes: 'Swapped bedroom to 2700K amber + blackout curtains for sleep window.',
    rooms: env.rooms.map(r => ({ ...r })),
    screens: env.screens.map(s => ({ ...s })),
    measurements: [],
    createdAt: Date.parse('2026-04-25T08:00:00Z'),
    aiAnalysis: {
      status: 'ok',
      dot: 'green',
      tip: 'Bedroom melatonin signal restored. Evening phone is now the next lever.',
      detail: 'Amber bedroom lighting + blackout brings the bedroom into the green band for melanopic-EDI. Remaining lever is evening phone use (1–3hr unblocked) — adding a screen-level blue-block schedule would close the loop.',
      generatedAt: Date.parse('2026-04-25T08:30:00Z'),
    },
  };
  return [before, after];
}

function buildLightMeasurements() {
  // 8 measurements across the 4 most-used tools.
  const base = NOW_MS - 30 * DAY_MS;
  return [
    { id: 'm_lux_1',  tool: 'lux',     value: 320,   roomId: 'room_demo_office',  capturedAt: base + 2 * DAY_MS,  extra: { device: 'phone-camera' }, notes: 'Daytime overhead LED, no daylight' },
    { id: 'm_lux_2',  tool: 'lux',     value: 18000, roomId: 'room_demo_office',  capturedAt: base + 5 * DAY_MS,  extra: { device: 'phone-camera' }, notes: 'Window-adjacent at 11am, sunny' },
    { id: 'm_lux_3',  tool: 'lux',     value: 6,     roomId: 'room_demo_bedroom', capturedAt: base + 10 * DAY_MS, extra: { device: 'phone-camera', label: 'Light-tight' }, notes: 'Sleep darkness — post-blackout install' },
    { id: 'm_cct_1',  tool: 'cct',     value: 2700,  roomId: 'room_demo_bedroom', capturedAt: base + 12 * DAY_MS, extra: { device: 'phone-camera' }, notes: 'New amber bulb measured' },
    { id: 'm_cct_2',  tool: 'cct',     value: 4900,  roomId: 'room_demo_office',  capturedAt: base + 14 * DAY_MS, extra: { device: 'phone-camera' }, notes: 'Office overhead LED' },
    { id: 'm_flick_1',tool: 'flicker', value: 1,     roomId: 'room_demo_office',  capturedAt: base + 15 * DAY_MS, extra: { strobeHz: 240, label: 'Mild' }, notes: 'Detectable at 240 Hz, low severity' },
    { id: 'm_spec_1', tool: 'spectrum',value: 'warm-incandescent', roomId: 'room_demo_bedroom', capturedAt: base + 17 * DAY_MS, extra: { label: 'Warm — incandescent-like' }, notes: '' },
    { id: 'm_dark_1', tool: 'darkness',value: 0.2,   roomId: 'room_demo_bedroom', capturedAt: base + 18 * DAY_MS, extra: { label: 'Sleep-spec ✓', mean: 0.2, max: 1.4 }, notes: 'Mean 0.2 lux post-blackout, brief 1.4 peak from streetlight' },
  ];
}

function buildSunCorrelations() {
  // 4 weeks of correlation snapshots — vit-D channel × ferritin / vit D / hsCRP.
  return {
    computedAt: NOW_MS - 3 * DAY_MS,
    weeksAnalyzed: 12,
    pairs: [
      { channel: 'vitamin_d', marker: 'vitamins.vitaminD', r: 0.71, n: 6, pValue: 0.045 },
      { channel: 'circadian', marker: 'thyroid.tsh',       r: -0.42, n: 6, pValue: 0.18 },
      { channel: 'no_card',   marker: 'lipids.triglycerides', r: -0.35, n: 6, pValue: 0.24 },
      { channel: 'red_660',   marker: 'proteins.hsCRP',    r: -0.51, n: 5, pValue: 0.16 },
    ],
  };
}

function buildLightDailyVerdicts(sunSessions, deviceSessions) {
  // One verdict per recent date that has a session. Engine produces these
  // on auto-fire (light-today-ai.js).
  const dates = new Set();
  for (const s of sunSessions) dates.add(new Date(s.startedAt).toISOString().slice(0, 10));
  for (const s of deviceSessions) dates.add(new Date(s.startedAt).toISOString().slice(0, 10));
  const out = {};
  let i = 0;
  for (const date of [...dates].sort().reverse().slice(0, 4)) {
    const dot = i === 0 ? 'green' : i === 1 ? 'yellow' : 'green';
    out[date] = {
      status: 'ok',
      dot,
      tip: dot === 'green'
        ? 'Solid coverage across vitamin D + circadian channels; no overdose.'
        : 'Vit-D channel light, but circadian + NIR were good. Add 10 min midday tomorrow.',
      detail: dot === 'green'
        ? `${date}: Sun + device sessions delivered targeted UVB without burn risk; eye-channel violet within target. Maintain.`
        : `${date}: Vit-D total ~${1500 + i * 500} IU, below 4k weekly pace. Circadian + NIR on target. One more 15-min midday session tomorrow closes the gap.`,
      generatedAt: NOW_MS - i * DAY_MS,
    };
    i++;
  }
  return out;
}

// ─── 3. Showcase fields ───────────────────────────────────────────────

function buildManualValues(sex) {
  // Modern manual-log path. Replaces the legacy biometrics array. Keys
  // are `metric:source:date` with values { value, unit, date, source, tag }.
  const out = {};
  // Weight: weekly logs over the last 8 weeks. Slight downward trend.
  const startW = sex === 'F' ? 64.5 : 82.3;
  for (let w = 0; w < 8; w++) {
    const date = new Date(NOW_MS - w * 7 * DAY_MS).toISOString().slice(0, 10);
    const v = Math.round((startW - w * 0.18) * 10) / 10;
    out[`weight:manual:${date}`] = { value: v, unit: 'kg', date, source: 'manual', tag: 'morning' };
  }
  // Resting heart rate: 4 readings.
  for (const [d, v] of [[35, 62], [21, 60], [10, 58], [3, 57]]) {
    const date = new Date(NOW_MS - d * DAY_MS).toISOString().slice(0, 10);
    out[`pulse:manual:${date}`] = { value: sex === 'F' ? v + 4 : v, unit: 'bpm', date, source: 'manual', tag: 'morning' };
  }
  // Blood pressure: 4 readings (sys, dia stored together in a tuple value).
  for (const [d, sys, dia] of [[42, 118, 76], [28, 116, 74], [14, 114, 72], [4, 113, 71]]) {
    const date = new Date(NOW_MS - d * DAY_MS).toISOString().slice(0, 10);
    out[`bp:manual:${date}`] = { value: { sys, dia }, unit: 'mmHg', date, source: 'manual', tag: 'morning' };
  }
  return out;
}

function buildCustomMarkers() {
  // Two specialty markers added by the user — showcase the custom-marker
  // pipeline that handles markers outside the standard MARKER_SCHEMA.
  // Schema fields mirror what `data.js` reads when building categories:
  // `name`, `unit`, `refMin`, `refMax`, `categoryLabel`, `icon`, `group`.
  return {
    'specialty.glycanAge': {
      name: 'GlycanAge',
      unit: 'years',
      refMin: null, refMax: null,
      categoryLabel: 'Specialty',
      icon: '🔖',
      group: 'Aging biomarkers',
      addedAt: NOW_MS - 90 * DAY_MS,
    },
    'specialty.urinaryIodine': {
      name: 'Urinary iodine',
      unit: 'µg/L',
      refMin: 100, refMax: 200,
      categoryLabel: 'Specialty',
      icon: '🔖',
      group: 'Trace minerals',
      addedAt: NOW_MS - 90 * DAY_MS,
    },
  };
}

// Inject 4 datapoints for each custom marker into the comprehensive
// entries — without these the sidebar group entries don't appear since
// the data pipeline gates them on at-least-one-value-present.
function seedCustomMarkerValues(data, sex) {
  // Pick the 4 most recent comprehensive entries (those with >50 markers).
  const targets = data.entries
    .filter(e => Object.keys(e.markers || {}).length > 50)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-4);
  if (targets.length < 4) return;
  // GlycanAge: starts at +5 over chrono age, drops -2 over the year as
  // the user works on it. Female: chrono ~33 in 2026, GlycanAge 38→36.
  // Male: chrono ~38, GlycanAge 43→40.
  const glycan = sex === 'F' ? [38, 37.2, 36.5, 36.0] : [43, 42, 41, 40];
  // Urinary iodine: gradually rising into optimal band as supplementation kicks in.
  const iodine = sex === 'F' ? [88, 110, 145, 175] : [95, 130, 160, 195];
  for (let i = 0; i < targets.length; i++) {
    const e = targets[i];
    e.markers['specialty.glycanAge']      = glycan[i];
    e.markers['specialty.urinaryIodine']  = iodine[i];
    if (e.markerSources) {
      const at = Date.parse(e.date + 'T08:00:00.000Z');
      e.markerSources['specialty.glycanAge']     = { file: 'GlycanAge plasma test.pdf', at };
      e.markerSources['specialty.urinaryIodine'] = { file: 'Urinary iodine spot test.pdf', at };
    }
  }
}

function buildRefOverrides() {
  // Showcase: tighter functional ranges for ferritin (50–150 vs lab 30–400)
  // and 25-OH vit-D (50–80 vs lab 30–100).
  return {
    'iron.ferritin':      { low: 50, high: 150, source: 'functional medicine target — Wright/Cohen' },
    'vitamins.vitaminD':  { low: 50, high: 80,  source: 'GrassrootsHealth optimal window' },
  };
}

function buildCategoryDisplayOverrides() {
  return {
    categoryLabels: { vitamins: 'Vitamins & Minerals' },
    categoryIcons:  { vitamins: '☀️' },
    markerLabels:   { 'iron.ferritin': 'Ferritin (functional)' },
  };
}

// ─── 4. Apply ─────────────────────────────────────────────────────────

// Pre-populate every AI-verdict surface so the demo doesn't show
// gray "Get AI verdict" CTAs on every row. Without provider, the
// CTAs would do nothing on click; with provider, the user would
// burn 25+ token-budgeted API calls just to see the demo. Both are
// bad UX. Engine treats `status:'ok' + dot` as a renderable cached
// verdict regardless of fingerprint — so omitting fingerprint works
// for display AND prevents auto-fire (renders that detect a stale
// fingerprint trigger fresh analysis; no fingerprint → not stale →
// no auto-fire). On user-driven ↻ refresh the engine fires fresh
// against the real provider.
function _verdict(dot, tip, detail, _ignoredFp, generatedAt) {
  return { status: 'ok', dot, tip, detail, generatedAt };
}

function attachMockAIVerdicts(data, sex) {
  const base = NOW_MS - 30 * DAY_MS;
  // ── Sun sessions — coverage + safety summary
  for (const sess of data.sunSessions || []) {
    const frac = sess.bodyExposure?.fraction || 0;
    const med = sess.safety?.medFraction || 0;
    const glass = !!sess.bodyExposure?.glassBetween;
    const eyes = sess.eyeExposure?.mode;
    let dot, tip, detail;
    if (glass) {
      dot = 'gray';
      tip = 'Glass between you and the sun — no UVB → no vitamin D';
      detail = 'Window glass blocks ~95% of UVB. Other channels (NIR, circadian-eye) still flowed through. Move outside next time for the vit-D path.';
    } else if (frac < 0.1 && eyes === 'direct') {
      dot = 'yellow';
      tip = 'Face-only exposure — circadian + eye good, vit-D minimal';
      detail = `~${Math.round(frac * 100)}% of skin exposed. Strong morning circadian + violet-eye signals at the eye, but vit-D synthesis stays low under 10% body fraction. If vit-D is a goal, a single mid-day arms-out session covers more ground than four face-only ones.`;
    } else if (med >= 0.7) {
      dot = 'yellow';
      tip = `~${Math.round(med * 100)}% of MED — close to burn threshold`;
      detail = `Body got ~${Math.round(med * 100)}% of the dose that triggers redness. You're at the upper end of the safe band; cap at 20-25 min next time at this UVI to keep buffer.`;
    } else {
      dot = 'green';
      tip = `Solid ${sess.durationMin || 0}-min session, well within safe band`;
      detail = `${Math.round(frac * 100)}% body fraction at UVI ${(sess.atmosphere?.uvIndex || 0).toFixed(1)}. Vit-D synthesis on track, ${Math.round(med * 100)}% MED leaves room for one more session today if you want.`;
    }
    sess.aiAnalysis = _verdict(dot, tip, detail, `demo-sun-${sess.id}`, sess.endedAt || base);
  }
  // ── Device sessions — eye protection + distance + dose
  for (const sess of data.deviceSessions || []) {
    const dev = (data.lightDevices || []).find(d => d.id === sess.deviceId);
    const isUVB = dev?.type === 'uvb';
    let dot, tip, detail;
    if (isUVB && !sess.eyesProtected) {
      dot = 'red';
      tip = 'UVB device + uncovered eyes — never look at the panel';
      detail = 'UVB on the cornea drives photokeratitis (welder\'s flash) within minutes. Always wear the included goggles or face away.';
    } else if (sess.distanceCm > (dev?.recommendedDistanceCm || 60) * 1.4) {
      dot = 'yellow';
      tip = `Distance ${sess.distanceCm}cm exceeds device sweet spot`;
      detail = `Inverse-square law — irradiance falls off fast past spec distance. At ${sess.distanceCm}cm vs ${dev?.recommendedDistanceCm || 60}cm spec, effective dose is ~${Math.round(((dev?.recommendedDistanceCm || 60) ** 2 / sess.distanceCm ** 2) * 100)}% of label.`;
    } else {
      dot = 'green';
      tip = `${sess.durationMin}-min session at recommended distance, eyes ${sess.eyesProtected ? 'protected' : 'uncovered (OK at this wavelength)'}`;
      detail = `Distance ${sess.distanceCm}cm sits in the device's optimal band. Doses tracked: ${Object.entries(sess.doses || {}).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(0) : v}`).join(', ')}.`;
    }
    sess.aiAnalysis = _verdict(dot, tip, detail, `demo-dev-${sess.id}`, sess.endedAt || base);
  }
  // ── Rooms — primary source + evening use
  for (const r of (data.lightEnvironment?.rooms || [])) {
    let dot, tip, detail;
    const evening = r.eveningUseAfterSunset;
    if (r.primarySource === 'led_cool' && evening) {
      dot = 'red';
      tip = 'Cool-white LED + evening use → suppresses melatonin';
      detail = 'Blue-rich 4000K+ light after sunset blocks the natural melatonin rise. Either swap to <3000K bulbs for evening, or limit time in this room after dark.';
    } else if (r.primarySource === 'led_warm' && evening) {
      dot = 'green';
      tip = 'Warm bedroom light + evening use — good evening config';
      detail = `2700K amber bulbs + ${r.eveningHoursAfterSunset || ''} of post-sunset use. Melanopic load stays low, sleep onset uninterrupted.`;
    } else if (r.primarySource === 'led_cool' && !evening) {
      dot = 'green';
      tip = 'Cool-white workspace, daytime-only — appropriate for office';
      detail = `5000K + ${r.hoursOccupiedPerDay || 0}h/day during productive hours feeds the daytime alertness signal. Window-adjacent is even better — natural light dominates 9am-4pm.`;
    } else {
      dot = 'gray';
      tip = `${r.hoursOccupiedPerDay || 0} h/day — light-burden moderate`;
      detail = `Mixed/unknown lighting in a low-occupancy room is a low-impact lever. Focus on bedroom + workspace first.`;
    }
    r.aiAnalysis = _verdict(dot, tip, detail, `demo-room-${r.id}`, r.updatedAt || base);
  }
  // ── Screens — blue blocker + evening hours
  for (const s of (data.lightEnvironment?.screens || [])) {
    let dot, tip, detail;
    if (s.blueBlockerEnabled && s.eveningUseAfterSunset === '<1hr') {
      dot = 'green';
      tip = 'Blue blocker + minimal evening use — well managed';
      detail = `${s.device} with active blue-light filter + ${s.eveningUseAfterSunset} after sunset. This is the ideal screen profile.`;
    } else if (!s.blueBlockerEnabled && /1-3hr|3\+hr/.test(s.eveningUseAfterSunset || '')) {
      dot = 'yellow';
      tip = `Unblocked ${s.device} + ${s.eveningUseAfterSunset} after sunset`;
      detail = `Phone/tablet display peaks at ~440nm — same wavelength your circadian system reads as "morning sun". A schedule-based blue-blocker (Night Shift / f.lux) cuts the melatonin-suppression effect ~40% without changing your usage habits.`;
    } else {
      dot = 'gray';
      tip = `Low-impact screen profile`;
      detail = `${s.device} screen in this room — current usage pattern doesn't significantly load the circadian channel.`;
    }
    s.aiAnalysis = _verdict(dot, tip, detail, `demo-screen-${s.id}`, s.updatedAt || base);
  }
  // ── Light-tool measurements
  for (const m of (data.lightMeasurements || [])) {
    let dot, tip, detail;
    if (m.tool === 'lux') {
      if (m.value < 50) { dot = 'green'; tip = `${m.value} lux — sleep-spec dark`; detail = 'Below 50 lux is the ICNIRP-friendly sleep range. Melatonin uninhibited.'; }
      else if (m.value < 500) { dot = 'yellow'; tip = `${m.value} lux — daytime-low for an office`; detail = 'Reasonable but below the 500-lux office baseline. Adding window-side time or a daytime-bright lamp would help alertness.'; }
      else { dot = 'green'; tip = `${m.value} lux — strong daytime signal`; detail = 'Plenty of light for the circadian pathway during productive hours.'; }
    } else if (m.tool === 'cct') {
      if (m.value <= 3000) { dot = 'green'; tip = `${m.value}K — warm, evening-appropriate`; detail = 'Below 3000K means low blue content. Good for sleep prep.'; }
      else if (m.value < 5000) { dot = 'yellow'; tip = `${m.value}K — neutral, room-by-room call`; detail = 'Mid-CCT works for daytime task lighting; in evening rooms it accelerates melatonin suppression.'; }
      else { dot = 'gray'; tip = `${m.value}K — cool/daytime CCT`; detail = 'High blue content suits productive daytime hours, less so for evening rooms.'; }
    } else if (m.tool === 'flicker') {
      dot = m.value <= 1 ? 'green' : (m.value === 2 ? 'yellow' : 'red');
      tip = `Flicker score ${m.value} — ${['pristine', 'mild', 'noticeable', 'severe'][m.value] || 'noticeable'}`;
      detail = `${m.extra?.strobeHz ? `Detected at ${m.extra.strobeHz} Hz. ` : ''}Below 200 Hz is correlated with eye strain + headache susceptibility in flicker-sensitive subjects (Wilkins 2018).`;
    } else if (m.tool === 'darkness') {
      dot = m.value < 1 ? 'green' : (m.value < 5 ? 'yellow' : 'red');
      tip = `${m.extra?.label || ''} mean ${m.value} lux at the pillow`;
      detail = `Sleep darkness goal is <1 lux mean. Brief streetlight peaks (max ${m.extra?.max || ''} lux) are tolerable; constant exposure isn't.`;
    } else if (m.tool === 'spectrum') {
      dot = 'green';
      tip = `${m.extra?.label || m.value}`;
      detail = 'Warm-spectrum lighting in evening rooms minimizes melanopic load.';
    } else { dot = 'gray'; tip = `${m.tool} measurement logged`; detail = ''; }
    m.aiAnalysis = _verdict(dot, tip, detail, `demo-tool-${m.id}`, m.capturedAt || base);
  }
  // ── sunDefaults onboarding AI (guides first-time setup)
  if (data.sunDefaults) {
    data.sunDefaults.aiAnalysis = _verdict(
      'green',
      `Setup complete — ${data.sunDefaults.fitzpatrick} skin, ${data.sunDefaults.coords?.label || 'Prague'}, Ott score ${data.sunDefaults.ottScore}/10`,
      `Skin type ${data.sunDefaults.fitzpatrick} drives the burn-threshold + vit-D yield curves. Prague (~50°N) means winter sun is too low for vit-D synthesis Nov-Feb; cap session length aggressively in summer noon. Ott score ${data.sunDefaults.ottScore}/10 suggests room for evening light-burden reduction.`,
      'demo-onboarding-fp', NOW_MS - 60 * DAY_MS,
    );
  }
  // ── channelMixAI (singleton, weekly profile summary)
  data.channelMixAI = _verdict(
    'yellow',
    'Strong PBM + circadian; vitamin-D channel light',
    'Weekly mix shows good narrowband red-light therapy coverage and morning circadian signal. Vitamin D channel sits at ~70% of weekly target — one more 25-min midday outdoor session would close the gap. NIR-solar matches solar exposure; cellular-repair channel is well covered. POMC + violet-eye good.',
    'demo-channelmix-fp', NOW_MS - 2 * DAY_MS,
  );
}

// ─── Biomarker trend fixes ────────────────────────────────────────────
//
// Coherence audit caught two P0 narrative failures in the original demo:
//   • Sarah supposedly started iron in Aug 2025 with goal "ferritin 50+",
//     but ferritin DECLINED through Dec 2025 (28→22→18) and barely
//     recovered by Jan 2026 (25). Notes claim "two months of high-dose
//     iron working" — directly contradicted by the labs.
//   • Alex's stated goal is "Reverse insulin resistance — HOMA-IR < 2.0"
//     and 2025-11 notes claim "reduced refined carbs + zone 2 cardio";
//     yet HOMA-IR climbed 1.11 → 3.47, insulin doubled, HbA1c rose.
//     Narrative says one thing, labs say the opposite.
//
// Override the trajectory so labs match the goals + supplements + notes.
function fixBiomarkerTrends(data, sex) {
  const setOn = (date, key, value) => {
    const e = (data.entries || []).find(x => x.date === date && x.markers && key in x.markers);
    if (e) e.markers[key] = value;
  };
  if (sex === 'F') {
    // Iron story — supp started 2025-08-10. The 2025-08-05 draw is 5 days
    // BEFORE supp, so values still drifting. Then improvement begins.
    setOn('2025-04-10', 'iron.ferritin',          28);
    setOn('2025-08-05', 'iron.ferritin',          24);
    setOn('2025-12-15', 'iron.ferritin',          35);
    setOn('2026-01-25', 'iron.ferritin',          42);
    setOn('2025-04-10', 'iron.iron',              12.5);
    setOn('2025-08-05', 'iron.iron',              11.0);
    setOn('2025-12-15', 'iron.iron',              16.5);
    setOn('2026-01-25', 'iron.iron',              19.0);
    setOn('2025-04-10', 'iron.transferrinSat',    18);
    setOn('2025-08-05', 'iron.transferrinSat',    16);
    setOn('2025-12-15', 'iron.transferrinSat',    24);
    setOn('2026-01-25', 'iron.transferrinSat',    28);
    setOn('2025-04-10', 'hematology.hemoglobin',  128);
    setOn('2025-08-05', 'hematology.hemoglobin',  126);
    setOn('2025-12-15', 'hematology.hemoglobin',  134);
    setOn('2026-01-25', 'hematology.hemoglobin',  138);
    setOn('2025-04-10', 'hematology.hematocrit',  0.385);
    setOn('2025-08-05', 'hematology.hematocrit',  0.378);
    setOn('2025-12-15', 'hematology.hematocrit',  0.402);
    setOn('2026-01-25', 'hematology.hematocrit',  0.413);
  } else {
    // Metabolic story — intervention claimed in 2025-11 notes (zone 2
    // cardio + reduced refined carbs). Pre-intervention drift, then
    // measurable improvement.
    setOn('2025-03-15', 'diabetes.homaIR',  1.11);
    setOn('2025-07-20', 'diabetes.homaIR',  1.40);
    setOn('2025-11-10', 'diabetes.homaIR',  1.05);
    setOn('2026-02-01', 'diabetes.homaIR',  0.85);
    setOn('2025-03-15', 'diabetes.insulin_d', 5.2);
    setOn('2025-07-20', 'diabetes.insulin_d', 6.5);
    setOn('2025-11-10', 'diabetes.insulin_d', 4.8);
    setOn('2026-02-01', 'diabetes.insulin_d', 3.9);
    setOn('2025-03-15', 'diabetes.hba1c',  31);
    setOn('2025-07-20', 'diabetes.hba1c',  33);
    setOn('2025-11-10', 'diabetes.hba1c',  31);
    setOn('2026-02-01', 'diabetes.hba1c',  29);
    setOn('2025-03-15', 'biochemistry.glucose', 4.8);
    setOn('2025-07-20', 'biochemistry.glucose', 5.1);
    setOn('2025-11-10', 'biochemistry.glucose', 4.9);
    setOn('2026-02-01', 'biochemistry.glucose', 4.7);
    // Homocysteine — goal <10. Move B-complex supp earlier so labs
    // reflect the intervention working.
    setOn('2025-03-15', 'coagulation.homocysteine', 11.5);
    setOn('2025-07-20', 'coagulation.homocysteine', 13.0);
    setOn('2025-11-10', 'coagulation.homocysteine', 10.5);
    setOn('2026-02-01', 'coagulation.homocysteine', 9.2);
    // Free testosterone — keep mild age-decline rather than 38% collapse.
    setOn('2025-03-15', 'hormones.freeTestosterone', 68.2);
    setOn('2025-07-20', 'hormones.freeTestosterone', 64.5);
    setOn('2025-11-10', 'hormones.freeTestosterone', 66.8);
    setOn('2026-02-01', 'hormones.freeTestosterone', 65.4);
    // Pull B-complex start earlier so the homocysteine trend reflects it.
    if (Array.isArray(data.supplements)) {
      const bComp = data.supplements.find(s =>
        /B[\s\-]?complex|methylated B/i.test(s.name || ''));
      if (bComp) bComp.startDate = '2025-08-10';
    }
  }
}

// ─── EMF assessment interpretation ────────────────────────────────────
function attachEMFInterpretation(data, sex) {
  const a = data.emfAssessment?.assessments?.[0];
  if (!a || a.interpretation) return;
  a.interpretation = sex === 'F'
    ? "## Sleep room is the priority\n\n- **Bedroom AC magnetic field** measured high — likely from external wiring or transformer adjacent to the room. Highest-leverage finding because it accumulates 8h/night of exposure.\n  - **Mitigation:** Baubiologie measurement; sleeping head-position relocation; correction from the utility if persistent.\n- **WiFi router** placement could be improved — 4–5 m distance from sleeping/working areas drops exposure ~16× via inverse-square. Alternative: hardwire ethernet + disable WiFi at night via timer.\n- **Phone at bedside** — power off or airplane mode at night eliminates near-field exposure. Removing the phone from the room is even better.\n\nLower priority:\n- Office RF baseline acceptable.\n- Living-area dirty electricity moderate; consider Stetzer filters on heaviest-load circuits."
    : "## Office is the lever\n\n- **Office desk AC electric field** measured high — likely ungrounded desk lamp or PC tower. Drives 8h/day during work.\n  - **Mitigation:** ground the desk circuit, replace ungrounded LED desk lamps with grounded units, route monitor + tower cables behind a metal shield, work with grounded mat/keyboard.\n- **Bedroom WiFi router** at 1.5 m head distance is too close — relocate + hardwire critical devices. Alternative: WiFi timer 7 am–10 pm only.\n- **Living-area dirty electricity** moderate — Stetzer/Greenwave filters on heaviest-load circuits.\n\nLower priority:\n- Bedroom magnetic field: low, no action needed.\n- Cellular signal weak (≈ –100 dBm); phone increases its own output to compensate. Speakerphone + airplane mode at night.";
  a.interpretedAt = NOW_MS - 5 * DAY_MS;
}

function alreadyUpgraded(data) {
  if (data.demoUpgradedAt === '2026-05-09-v9') return true;
  return false;
}

function upgrade(data, sex) {
  if (alreadyUpgraded(data)) {
    console.log('  (already upgraded — skipping)');
    return false;
  }

  // 1. Marker backfill.
  backfillMarkers(data);

  // 2. Light & Sun stack.
  data.sunDefaults = buildSunDefaults(sex);
  data.lightDevices = buildLightDevices(sex);
  data.sunSessions = buildSunSessions(sex);
  data.deviceSessions = buildDeviceSessions(data.lightDevices);
  const env = buildLightEnvironment(sex);
  data.lightEnvironment = env;
  data.lightAudits = buildLightAudits(env);
  data.lightMeasurements = buildLightMeasurements();
  data.sunCorrelations = buildSunCorrelations();
  data.lightDailyVerdicts = buildLightDailyVerdicts(data.sunSessions, data.deviceSessions);
  // Lifelight profile — derived view. Minimal stub so the AI sees the
  // Light & Sun shape without erroring on missing field.
  data.lifelightProfile = {
    chronotype: sex === 'F' ? 'moderate-evening' : 'moderate-morning',
    sleepWindow: { start: '23:00', end: '07:00' },
    morningSunCommit: '15min outdoor face within 30min of waking',
    updatedAt: NOW_MS - 30 * DAY_MS,
  };

  // 3. Showcase fields.
  data.manualValues = buildManualValues(sex);
  Object.assign(data.customMarkers, buildCustomMarkers());
  seedCustomMarkerValues(data, sex);
  data.refOverrides = buildRefOverrides();
  Object.assign(data, buildCategoryDisplayOverrides());
  data.wearableCardOrder = ['weight', 'pulse', 'bp', 'sleep', 'hrv', 'activity'];

  // 4. Coherence fixes — biomarker trajectories must match the goals +
  //    supplements + lifestyle notes the demo ships. Earlier draft had
  //    Sarah's ferritin DECLINE while supposedly on iron supp, and Alex's
  //    HOMA-IR DOUBLE while supposedly doing zone-2 cardio + carb cuts —
  //    both contradicted the explicit health goals + intervention notes.
  fixBiomarkerTrends(data, sex);
  attachEMFInterpretation(data, sex);

  // 5. Pre-populate AI verdicts on every per-row surface so the demo
  //    shows the AI-verdict feature in its populated state instead of
  //    25+ "Get AI verdict" CTAs that either do nothing (no provider)
  //    or burn tokens to regenerate the demo.
  attachMockAIVerdicts(data, sex);

  // 6. Bump version + mark.
  data.version = 3;
  data.demoUpgradedAt = '2026-05-09-v9';
  data.exportedAt = NOW_ISO;

  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────

let totalUpgraded = 0;
for (const d of DEMOS) {
  const fp = path.join(ROOT, d.file);
  console.log(`\n▶ ${d.file} (${d.name})`);
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const beforeCounts = {
    entries: data.entries.length,
    sunSessions: (data.sunSessions || []).length,
    lightDevices: (data.lightDevices || []).length,
    rooms: ((data.lightEnvironment || {}).rooms || []).length,
  };
  const did = upgrade(data, d.sex);
  if (did) {
    fs.writeFileSync(fp, JSON.stringify(data, null, 2) + '\n');
    totalUpgraded++;
    const afterCounts = {
      entries: data.entries.length,
      sunSessions: (data.sunSessions || []).length,
      lightDevices: (data.lightDevices || []).length,
      rooms: ((data.lightEnvironment || {}).rooms || []).length,
    };
    console.log('  before:', beforeCounts);
    console.log('  after :', afterCounts);
  }
}

console.log(`\nUpgraded ${totalUpgraded}/${DEMOS.length} demos.`);
