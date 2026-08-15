// @ts-check
// sun-channel-metrics.js - channel unit formatting and vitamin-D rollups.

import { state } from './state.js';
import { BODY_REGIONS } from './sun-body-silhouette.js';
import { liveDosesFor as _liveDosesFor } from './sun-active-session.js';
import { getSessions } from './sun-sessions-store.js';
import { ingredientDailyTotal } from './supplement-impact.js';
import { getSupplementsOverlappingRange, isSupplementExpectedOnDate } from './supplement-medication-domain.js';
import {
  circadianMelanopicLux,
  pbmJoulesPerCm2,
  vitaminDIU,
  vitaminDIUPerSession,
  VITD_DAILY_SATURATION_IU,
} from './sun-spectrum.js';

const VITD_SAT_FLAG = 19000;
export const TOO_SHORT_FOR_CHANNEL_VERDICT_MIN = 2;
const BROAD_DEVICE_BODY_FRACTIONS = {
  face: 0.04,
  arms: 0.10,
  torso: 0.13,
  legs: 0.30,
  'whole-body': 0.92,
  targeted: 0.05,
};

function localDayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function utcDayKey(ts) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function currentDateKeyRange(ts = Date.now()) {
  const local = localDayKey(ts);
  const utc = utcDayKey(ts);
  return local <= utc
    ? { earliest: local, latest: utc }
    : { earliest: utc, latest: local };
}

function localDayStart(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function getSunSessionBucketTs(session) {
  return session.startedAt || session.endedAt || 0;
}

function getBodyFractionByRegion() {
  return Object.fromEntries(BODY_REGIONS.map(region => [region.key, region.fraction]));
}

function getDeviceBodyFraction(session, fractionByKey) {
  if (Array.isArray(session.bodyAreas) && session.bodyAreas.length > 0) {
    return session.bodyAreas.reduce((acc, key) => acc + (fractionByKey[key] || 0), 0);
  }
  if (session.bodyArea) return BROAD_DEVICE_BODY_FRACTIONS[session.bodyArea] ?? null;
  return null;
}

export function formatChannelUnit(channelKey, channelAu, durationMin, fitzpatrick = 'III', uvi = /** @type {number | null} */ (null), _zenith = /** @type {number | null} */ (null), rotatedSides = false, bodyFraction = /** @type {number | null} */ (null)) {
  if (!Number.isFinite(channelAu) || channelAu <= 0) return '';
  if (durationMin > 0 && durationMin < TOO_SHORT_FOR_CHANNEL_VERDICT_MIN) {
    return 'session too short';
  }
  if (channelKey === 'vitamin_d') {
    const useSessionCap = typeof bodyFraction === 'number' && Number.isFinite(bodyFraction) && bodyFraction > 0;
    const central = useSessionCap
      ? vitaminDIUPerSession(channelAu, fitzpatrick, uvi, rotatedSides, state.importedData?.genetics || null, bodyFraction)
      : vitaminDIU(channelAu, fitzpatrick, uvi, rotatedSides, state.importedData?.genetics || null);
    if (central === 0) return 'negligible modeled UVB';
    const fmt = (n) => {
      if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
      if (n >= 1000) return Math.round(n / 100) * 100;
      if (n >= 100) return Math.round(n / 10) * 10;
      return Math.round(n);
    };
    if (central >= VITD_SAT_FLAG) return `~${fmt(central)} IU-eq (reporting ceiling)`;
    return `~${fmt(central)} IU-eq`;
  }
  if (channelKey === 'nir_solar' || channelKey === 'pbm_red' || channelKey === 'pbm_nir') {
    const j = pbmJoulesPerCm2(channelAu);
    if (j >= 10) return j.toFixed(0) + ' J/cm²';
    if (j >= 1) return j.toFixed(1) + ' J/cm²';
    return j.toFixed(2) + ' J/cm²';
  }
  if (channelKey === 'circadian' && durationMin > 0) {
    const lux = circadianMelanopicLux(channelAu, durationMin);
    if (lux >= 1000) return '~' + (lux / 1000).toFixed(1).replace(/\.0$/, '') + 'k estimated melanopic-equivalent lx';
    if (lux >= 100) return '~' + Math.round(lux / 10) * 10 + ' estimated melanopic-equivalent lx';
    return '~' + Math.round(lux) + ' estimated melanopic-equivalent lx';
  }
  return '';
}

export function rollingVitaminDIU(days = 7) {
  const dailyCap = VITD_DAILY_SATURATION_IU;
  const cutoff = Date.now() - days * 86400 * 1000;
  const genetics = state.importedData?.genetics || null;
  const dayTotals = {};
  const add = (key, iu) => { dayTotals[key] = (dayTotals[key] || 0) + iu; };
  for (const sess of getSessions()) {
    if (!sess.endedAt) {
      if ((sess.startedAt || 0) < cutoff) continue;
      const live = _liveDosesFor(sess);
      if (live?.doses?.vitamin_d) {
        const fitz = live.fitzpatrick || sess.safety?.fitzpatrick || 'III';
        const uvi = live.atm?.uvIndex ?? sess.atmosphere?.uvIndex ?? null;
        const bodyFrac = sess.bodyExposure?.fraction;
        add(localDayKey(sess.startedAt), vitaminDIUPerSession(live.doses.vitamin_d, fitz, uvi, !!sess.bodyExposure?.rotatedSides, genetics, bodyFrac));
      }
      continue;
    }
    if (!sess.doses?.vitamin_d) continue;
    const bucketTs = getSunSessionBucketTs(sess);
    if (!bucketTs || bucketTs < cutoff) continue;
    const fitz = sess.safety?.fitzpatrick || 'III';
    const uvi = sess.atmosphere?.uvIndex ?? null;
    const bodyFrac = sess.bodyExposure?.fraction;
    add(localDayKey(bucketTs), vitaminDIUPerSession(sess.doses.vitamin_d, fitz, uvi, !!sess.bodyExposure?.rotatedSides, genetics, bodyFrac));
  }
  const fitzForDevice = state.importedData?.sunDefaults?.fitzpatrick || 'III';
  const fracByKey = getBodyFractionByRegion();
  for (const sess of (state.importedData?.deviceSessions || [])) {
    if (!sess.endedAt || sess.endedAt < cutoff) continue;
    if (!sess.doses?.vitamin_d) continue;
    const bodyFrac = getDeviceBodyFraction(sess, fracByKey);
    add(localDayKey(sess.endedAt), vitaminDIUPerSession(sess.doses.vitamin_d, fitzForDevice, null, false, genetics, bodyFrac));
  }
  let total = 0;
  for (const iu of Object.values(dayTotals)) total += Math.min(iu, dailyCap);
  return total;
}

export function dailyVitaminDIUBreakdown(days = 7) {
  const buckets = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    buckets.push({ date: d, key: localDayKey(d.getTime()), sun: 0, device: 0 });
  }
  const idxFor = (ts) => {
    const day = localDayStart(ts);
    return buckets.findIndex(b => b.date.getTime() === day);
  };
  const dailyCap = VITD_DAILY_SATURATION_IU;
  const genetics = state.importedData?.genetics || null;
  for (const sess of getSessions()) {
    const ts = getSunSessionBucketTs(sess);
    if (!ts) continue;
    const i = idxFor(ts);
    if (i < 0) continue;
    let au, fitz, uvi, rotated;
    if (!sess.endedAt) {
      const live = _liveDosesFor(sess);
      au = live?.doses?.vitamin_d;
      fitz = live?.fitzpatrick || sess.safety?.fitzpatrick || 'III';
      uvi = live?.atm?.uvIndex ?? sess.atmosphere?.uvIndex ?? null;
      rotated = !!sess.bodyExposure?.rotatedSides;
    } else {
      au = sess.doses?.vitamin_d;
      fitz = sess.safety?.fitzpatrick || 'III';
      uvi = sess.atmosphere?.uvIndex ?? null;
      rotated = !!sess.bodyExposure?.rotatedSides;
    }
    if (!Number.isFinite(au) || au <= 0) continue;
    const bodyFrac = sess.bodyExposure?.fraction;
    buckets[i].sun += vitaminDIUPerSession(au, fitz, uvi, rotated, genetics, bodyFrac);
  }
  const fitzForDevice = state.importedData?.sunDefaults?.fitzpatrick || 'III';
  const fracByKey = getBodyFractionByRegion();
  for (const sess of (state.importedData?.deviceSessions || [])) {
    if (!sess.endedAt) continue;
    const i = idxFor(sess.endedAt);
    if (i < 0) continue;
    const au = sess.doses?.vitamin_d;
    if (!Number.isFinite(au) || au <= 0) continue;
    const bodyFrac = getDeviceBodyFraction(sess, fracByKey);
    buckets[i].device += vitaminDIUPerSession(au, fitzForDevice, null, false, genetics, bodyFrac);
  }
  for (const b of buckets) {
    const total = b.sun + b.device;
    if (total > dailyCap) {
      const scale = dailyCap / total;
      b.sun *= scale;
      b.device *= scale;
    }
  }
  return buckets;
}

export function cumulativeVitaminDIUToday() {
  const cap = VITD_DAILY_SATURATION_IU;
  const todayKey = localDayKey(Date.now());
  const genetics = state.importedData?.genetics || null;
  let total = 0;
  for (const sess of getSessions()) {
    const bucketTs = getSunSessionBucketTs(sess);
    if (!bucketTs || localDayKey(bucketTs) !== todayKey) continue;
    if (!sess.endedAt) {
      const live = _liveDosesFor(sess);
      if (live?.doses?.vitamin_d) {
        const fitz = live.fitzpatrick || sess.safety?.fitzpatrick || 'III';
        const uvi = live.atm?.uvIndex ?? sess.atmosphere?.uvIndex ?? null;
        const bodyFrac = sess.bodyExposure?.fraction;
        total += vitaminDIUPerSession(live.doses.vitamin_d, fitz, uvi, !!sess.bodyExposure?.rotatedSides, genetics, bodyFrac);
      }
      continue;
    }
    if (!sess.doses?.vitamin_d) continue;
    const fitz = sess.safety?.fitzpatrick || 'III';
    const uvi = sess.atmosphere?.uvIndex ?? null;
    const bodyFrac = sess.bodyExposure?.fraction;
    total += vitaminDIUPerSession(sess.doses.vitamin_d, fitz, uvi, !!sess.bodyExposure?.rotatedSides, genetics, bodyFrac);
  }
  const dayStart = localDayStart(Date.now());
  const fitzForDevice = state.importedData?.sunDefaults?.fitzpatrick || 'III';
  const fracByKey = getBodyFractionByRegion();
  for (const sess of (state.importedData?.deviceSessions || [])) {
    if (!sess.endedAt || sess.endedAt < dayStart) continue;
    if (!sess.doses?.vitamin_d) continue;
    const bodyFrac = getDeviceBodyFraction(sess, fracByKey);
    total += vitaminDIUPerSession(sess.doses.vitamin_d, fitzForDevice, null, false, genetics, bodyFrac);
  }
  return Math.min(total, cap);
}

function dailySupplementVitaminDIU() {
  const today = currentDateKeyRange();
  const supps = getSupplementsOverlappingRange(
    state.importedData?.supplements || [],
    today.earliest,
    today.latest,
  );
  let total = 0;
  for (const supp of supps) {
    if (!isSupplementExpectedOnDate(supp, today.latest)) continue;
    for (const ing of (supp.ingredients || [])) {
      const name = (ing.name || '').toLowerCase();
      if (!/vit(?:amin)?[\s-]*d[23]?\b|cholecalciferol|ergocalciferol/.test(name)) continue;
      if (/cream|topical|serum/.test(name)) continue;
      const total24h = ingredientDailyTotal(ing, supp);
      if (!total24h) continue;
      const u = (total24h.unit || '').toLowerCase();
      let iu = total24h.value;
      if (/mcg|µg|μg/.test(u)) iu *= 40;
      total += iu;
    }
  }
  return total;
}

export function vitaminDBudgetStatus() {
  const supplementIU = dailySupplementVitaminDIU();
  const sunIU = cumulativeVitaminDIUToday();
  const supplementUL = 4000;
  return {
    supplementIU,
    // This optical model's sunlight IU-equivalent is a comparison aid, not
    // ingested vitamin D. It must never be added to oral intake or tested
    // against a dietary tolerable upper intake level.
    sunIU,
    sunIUEquivalent: sunIU,
    totalIntakeIU: supplementIU,
    // Backward-compatible field: now intentionally means modeled oral
    // supplement intake only instead of an invalid oral+sunlight sum.
    total: supplementIU,
    supplementUL,
    exceedsSupplementUL: supplementIU > supplementUL,
  };
}
