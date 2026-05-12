// data.js — Data pipeline, unit conversion, date range, trend detection

import { state } from './state.js';
import { MARKER_SCHEMA, UNIT_CONVERSIONS, OPTIMAL_RANGES, PHASE_RANGES } from './schema.js';
import { hashString, getStatus, formatValue, linearRegression, showNotification } from './utils.js';
import { profileStorageKey, touchProfileTimestamp } from './profile.js';
import { encryptedSetItem, broadcastDataChanged, scheduleAutoBackup } from './crypto.js';
import { onDataSaved } from './sync.js';

// ═══════════════════════════════════════════════
// PRIVATE CYCLE PHASE HELPER (avoids circular dep with cycle.js)
// ═══════════════════════════════════════════════
function _getCyclePhase(dateStr, mc) {
  if (!mc || !mc.periods || mc.periods.length === 0) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const sorted = mc.periods.slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
  let periodStart = null;
  for (const p of sorted) {
    if (new Date(p.startDate + 'T00:00:00') <= target) { periodStart = p.startDate; break; }
  }
  if (!periodStart) return null;
  const startDate = new Date(periodStart + 'T00:00:00');
  const cycleDay = Math.floor((target - startDate) / 86400000) + 1;
  const cycleLen = mc.cycleLength || 28;
  if (cycleDay > cycleLen + 7) return null;
  const periodLen = mc.periodLength || 5;
  const ovulationDay = cycleLen - 14;
  let phase, phaseName;
  if (cycleDay <= periodLen) { phase = 'menstrual'; phaseName = 'Menstrual'; }
  else if (cycleDay < ovulationDay - 1) { phase = 'follicular'; phaseName = 'Follicular'; }
  else if (cycleDay <= ovulationDay + 1) { phase = 'ovulatory'; phaseName = 'Ovulatory'; }
  else { phase = 'luteal'; phaseName = 'Luteal'; }
  return { cycleDay, phase, phaseName };
}

// ═══════════════════════════════════════════════
// REFRESH CALLBACK
// ═══════════════════════════════════════════════
let _refreshCallback = null;
export function registerRefreshCallback(fn) { _refreshCallback = fn; }

// ═══════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════
export async function saveImportedData() {
  try {
    const key = profileStorageKey(state.currentProfile, 'imported');
    const value = JSON.stringify(state.importedData);
    // Always route through encryptedSetItem — it skips encryption when
    // disabled (just a localStorage.setItem) but also routes big-blob
    // keys to IndexedDB. Going through localStorage.setItem directly
    // would bypass that routing and re-introduce the 5 MB quota wall.
    await encryptedSetItem(key, value);
    broadcastDataChanged(state.currentProfile);
    scheduleAutoBackup();
    touchProfileTimestamp(state.currentProfile);
    if (window.invalidateLabContextCache) window.invalidateLabContextCache();
    onDataSaved();
  } catch (e) {
    showNotification('Storage limit reached — clear old data or profiles to free space.', 'error');
  }
}

export function getFocusCardFingerprint() {
  const parts = [
    (state.importedData.entries || []).map(e => e.date + ':' + Object.keys(e.markers || {}).length).join(','),
    state.profileSex || '',
    state.profileDob || '',
    JSON.stringify(state.importedData.diagnoses || null),
    (state.importedData.healthGoals || []).map(g => g.severity + ':' + g.text).join(','),
    state.importedData.interpretiveLens || '',
    state.importedData.contextNotes || '',
    (state.importedData.supplements || []).map(s => s.name + s.startDate + (s.endDate || '')).join(','),
    JSON.stringify(state.importedData.markerNotes || {})
  ];
  return hashString(parts.join('|'));
}

// ═══════════════════════════════════════════════
// DATA PIPELINE
// ═══════════════════════════════════════════════
export function getActiveData() {
  const data = {
    dates: [],
    dateLabels: [],
    categories: JSON.parse(JSON.stringify(MARKER_SCHEMA))
  };

  // Merge custom markers into categories
  const custom = (state.importedData && state.importedData.customMarkers) ? state.importedData.customMarkers : {};
  for (const [fullKey, def] of Object.entries(custom)) {
    const [catKey, markerKey] = fullKey.split('.');
    if (!markerKey) continue;
    if (!data.categories[catKey]) {
      // Create new category — infer icon from label/key
      const _label = (def.categoryLabel || catKey).toLowerCase();
      const _inferIcon = (l) => {
        if (/urine|urinal/.test(l)) return '\uD83E\uDDEA';
        if (/environ|toxic|heavy.?metal|pollut/.test(l)) return '\uD83C\uDF0D';
        if (/amino/.test(l)) return '\uD83E\uDDEC';
        if (/antioxid/.test(l)) return '\uD83D\uDEE1\uFE0F';
        if (/fatty.?acid|omega|lipid/.test(l)) return '\uD83D\uDC1F';
        if (/vitamin/.test(l)) return '\u2600\uFE0F';
        if (/mineral|element/.test(l)) return '\u2696\uFE0F';
        if (/hormone|endocrin/.test(l)) return '\uD83E\uDDEC';
        if (/liver|hepat/.test(l)) return '\uD83E\uDDEA';
        if (/kidney|renal/.test(l)) return '\uD83E\uDDEB';
        if (/thyroid/.test(l)) return '\uD83E\uDD8B';
        if (/bone|osteo/.test(l)) return '\uD83E\uDDB4';
        if (/immune|inflam/.test(l)) return '\uD83D\uDEE1\uFE0F';
        if (/cardio|heart/.test(l)) return '\uD83E\uDEC0';
        if (/neuro|brain/.test(l)) return '\uD83E\uDDE0';
        if (/digest|gut|gi|gastro|microb/.test(l)) return '\uD83E\uDDA0';
        if (/blood|hemat/.test(l)) return '\uD83E\uDE78';
        if (/metabol|energy|mitochond/.test(l)) return '\u26A1';
        if (/oxalate|organic.?acid/.test(l)) return '\u2697\uFE0F';
        if (/nutri|diet/.test(l)) return '\uD83C\uDF4E';
        return null;
      };
      data.categories[catKey] = {
        label: def.categoryLabel || catKey.charAt(0).toUpperCase() + catKey.slice(1),
        icon: def.icon || _inferIcon(_label) || '\uD83D\uDD16',
        singlePoint: !!def.singlePoint,
        group: def.group || null,
        markers: {}
      };
    }
    // Add marker if not already in schema
    if (!data.categories[catKey].markers[markerKey]) {
      data.categories[catKey].markers[markerKey] = {
        name: def.name,
        unit: def.unit || '',
        refMin: def.refMin,
        refMax: def.refMax,
        custom: true
      };
    }
  }

  // Apply sex-specific reference ranges
  if (state.profileSex === 'female') {
    for (const cat of Object.values(data.categories)) {
      for (const marker of Object.values(cat.markers)) {
        if (marker.refMin_f !== undefined) { marker.refMin = marker.refMin_f; marker.refMax = marker.refMax_f; }
      }
    }
  }

  // Merge optimal ranges into markers
  for (const [fullKey, opt] of Object.entries(OPTIMAL_RANGES)) {
    const [catKey, markerKey] = fullKey.split('.');
    const cat = data.categories[catKey];
    if (cat && cat.markers[markerKey]) {
      const marker = cat.markers[markerKey];
      if (state.profileSex === 'female' && opt.optimalMin_f !== undefined) {
        marker.optimalMin = opt.optimalMin_f;
        marker.optimalMax = opt.optimalMax_f;
      } else {
        marker.optimalMin = opt.optimalMin;
        marker.optimalMax = opt.optimalMax;
      }
    }
  }

  // Apply user range overrides (ref + optimal, after schema defaults are set)
  const refOverrides = state.importedData?.refOverrides || {};
  for (const [fullKey, ovr] of Object.entries(refOverrides)) {
    const [catKey, markerKey] = fullKey.split('.');
    const cat = data.categories[catKey];
    if (cat && cat.markers[markerKey]) {
      const m = cat.markers[markerKey];
      if ('refMin' in ovr) m.refMin = ovr.refMin;
      if ('refMax' in ovr) m.refMax = ovr.refMax;
      if ('optimalMin' in ovr) m.optimalMin = ovr.optimalMin;
      if ('optimalMax' in ovr) m.optimalMax = ovr.optimalMax;
    }
  }

  // Apply user category label + icon overrides
  const catLabels = state.importedData?.categoryLabels || {};
  for (const [catKey, label] of Object.entries(catLabels)) {
    if (data.categories[catKey]) data.categories[catKey].label = label;
  }
  const catIcons = state.importedData?.categoryIcons || {};
  for (const [catKey, icon] of Object.entries(catIcons)) {
    if (data.categories[catKey]) data.categories[catKey].icon = icon;
  }
  // Apply user marker label overrides (category.markerKey → display name)
  const markerLabels = state.importedData?.markerLabels || {};
  for (const [dotKey, label] of Object.entries(markerLabels)) {
    const [catKey, mKey] = dotKey.split('.');
    if (data.categories[catKey]?.markers[mKey]) data.categories[catKey].markers[mKey].name = label;
  }

  const entries = (state.importedData && state.importedData.entries) ? state.importedData.entries : [];
  const hasEntries = entries.length > 0;

  // Build entry lookup: date → merged markers
  const entryLookup = {};
  for (const entry of entries) {
    if (!entryLookup[entry.date]) entryLookup[entry.date] = {};
    Object.assign(entryLookup[entry.date], entry.markers);
  }

  // Identify singlePoint categories
  const singlePointCats = new Set();
  for (const [catKey, cat] of Object.entries(data.categories)) {
    if (cat.singlePoint) singlePointCats.add(catKey);
  }

  // Collect dates from entries that have non-singlePoint markers
  const regularDates = new Set();
  if (hasEntries) {
    for (const entry of entries) {
      for (const key of Object.keys(entry.markers || {})) {
        if (!singlePointCats.has(key.split('.')[0])) {
          regularDates.add(entry.date);
          break;
        }
      }
    }
  }

  const sortedDates = [...regularDates].sort();
  data.dates = sortedDates;
  data.dateLabels = sortedDates.map(d => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  });

  // Cycle phase gating — shared by phase labels (charts) and phase-specific ref ranges
  const isFemale = state.profileSex === 'female';
  const mc = state.importedData && state.importedData.menstrualCycle;
  const _hormonalContraceptives = ['ocp', 'pill', 'patch', 'ring', 'implant', 'mirena', 'hormonal iud', 'depo', 'injection'];
  const _isHormonalBC = mc?.contraceptive && _hormonalContraceptives.some(h => mc.contraceptive.toLowerCase().includes(h));
  const _isActiveCycle = !mc?.cycleStatus || mc.cycleStatus === 'regular' || mc.cycleStatus === 'perimenopause';
  const _hasCyclePhases = isFemale && mc && mc.periods && mc.periods.length > 0 && !_isHormonalBC && _isActiveCycle;

  // Compute top-level phase labels for charts (female + active cycle, no hormonal BC)
  if (_hasCyclePhases) {
    data.phaseLabels = sortedDates.map(d => {
      const p = _getCyclePhase(d, mc);
      return p ? p.phase : null;
    });
  }

  // Populate values for each category
  for (const [catKey, cat] of Object.entries(data.categories)) {
    if (cat.singlePoint) {
      // Find the latest entry that has any marker in this category
      let singleDate = null;
      for (let ei = entries.length - 1; ei >= 0; ei--) {
        for (const key of Object.keys(entries[ei].markers || {})) {
          if (key.startsWith(catKey + '.')) { singleDate = entries[ei].date; break; }
        }
        if (singleDate) break;
      }
      cat.singleDate = singleDate;
      const singleDateLabel = singleDate
        ? new Date(singleDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        : null;
      cat.singleDateLabel = singleDateLabel;
      for (const [markerKey, marker] of Object.entries(cat.markers)) {
        marker.singlePoint = true;
        marker.singleDateLabel = singleDateLabel;
        const fullKey = `${catKey}.${markerKey}`;
        if (singleDate && entryLookup[singleDate] && entryLookup[singleDate][fullKey] !== undefined) {
          marker.values = [entryLookup[singleDate][fullKey]];
        } else {
          marker.values = [];
        }
      }
    } else {
      for (const [markerKey, marker] of Object.entries(cat.markers)) {
        const fullKey = `${catKey}.${markerKey}`;
        marker.values = sortedDates.map(date => {
          if (entryLookup[date] && entryLookup[date][fullKey] !== undefined) {
            return entryLookup[date][fullKey];
          }
          return null;
        });
      }
    }
  }

  // Compute phase-specific reference ranges for cycle-dependent markers
  if (_hasCyclePhases) {
    for (const [fullKey, phaseMap] of Object.entries(PHASE_RANGES)) {
      const [catKey, markerKey] = fullKey.split('.');
      const marker = data.categories[catKey] && data.categories[catKey].markers[markerKey];
      if (!marker) continue;
      marker.phaseRefRanges = sortedDates.map(d => {
        const p = _getCyclePhase(d, mc);
        return p ? (phaseMap[p.phase] || null) : null;
      });
      marker.phaseLabels = sortedDates.map(d => {
        const p = _getCyclePhase(d, mc);
        return p ? p.phaseName : null;
      });
    }
  }

  // Calculate ratios from component markers
  const ratios = data.categories.calculatedRatios;
  if (ratios) {
    const getVals = (catKey, markerKey) => {
      const cat = data.categories[catKey];
      return cat && cat.markers[markerKey] ? cat.markers[markerKey].values : null;
    };
    const divide = (numVals, denVals) => {
      if (!numVals || !denVals) return sortedDates.map(() => null);
      return sortedDates.map((_, i) => {
        const n = numVals[i], d = denVals[i];
        return (n != null && d != null && d !== 0) ? Math.round((n / d) * 1000) / 1000 : null;
      });
    };
    ratios.markers.tgHdlRatio.values = divide(getVals('lipids', 'triglycerides'), getVals('lipids', 'hdl'));
    ratios.markers.ldlHdlRatio.values = divide(getVals('lipids', 'ldl'), getVals('lipids', 'hdl'));
    ratios.markers.apoBapoAIRatio.values = divide(getVals('lipids', 'apoB'), getVals('lipids', 'apoAI'));
    ratios.markers.nlr.values = divide(getVals('differential', 'neutrophils'), getVals('differential', 'lymphocytes'));
    ratios.markers.plr.values = divide(getVals('hematology', 'platelets'), getVals('differential', 'lymphocytes'));
    ratios.markers.deRitisRatio.values = divide(getVals('biochemistry', 'ast'), getVals('biochemistry', 'alt'));
    ratios.markers.copperZincRatio.values = divide(getVals('electrolytes', 'copper'), getVals('electrolytes', 'zinc'));

    // BUN/Creatinine Ratio — computed in US units: (urea×2.801) / (creatinine×0.01131)
    const ureaVals = getVals('biochemistry', 'urea');
    const creatVals = getVals('biochemistry', 'creatinine');
    ratios.markers.bunCreatRatio.values = sortedDates.map((_, i) => {
      const u = ureaVals?.[i], c = creatVals?.[i];
      if (u == null || c == null || c === 0) return null;
      return Math.round((u * 2.801) / (c * 0.01131) * 10) / 10;
    });

    // Free Water Deficit — TBW × (Na/140 − 1), uses latest weight or 70kg fallback.
    // Weight now lives in the wearables summary (single source of truth after
    // the Health Metrics unification; manual entries write kg-canonicalized).
    // Legacy importedData.biometrics.weight is kept as a backstop for old
    // profiles that somehow haven't seen the migration run yet.
    const sodiumVals = getVals('electrolytes', 'sodium');
    const summaryWeight = state.importedData?.wearableSummary?.metrics?.weight?.latest;
    const legacyWeightArr = state.importedData?.biometrics?.weight;
    const legacyWeight = Array.isArray(legacyWeightArr) && legacyWeightArr.length > 0 ? legacyWeightArr[legacyWeightArr.length - 1].value : null;
    const latestWeight = (typeof summaryWeight === 'number' && isFinite(summaryWeight)) ? summaryWeight : legacyWeight;
    ratios.markers.freeWaterDeficit.values = sortedDates.map((_, i) => {
      const na = sodiumVals ? sodiumVals[i] : null;
      if (na == null || na <= 0) return null;
      const tbwFactor = state.profileSex === 'female' ? 0.5 : 0.6;
      const tbw = (latestWeight || 70) * tbwFactor;
      const fwd = tbw * (na / 140 - 1);
      return Math.round(fwd * 100) / 100;
    });

    // hs-CRP/HDL Ratio — inflammation-lipid composite (hs-CRP only, no standard CRP fallback)
    ratios.markers.crpHdlRatio.values = sortedDates.map((_, i) => {
      const crp = getVals('proteins', 'hsCRP')?.[i] ?? null; // mg/L — requires hs-CRP
      const hdl = getVals('lipids', 'hdl')?.[i]; // mmol/L
      if (crp == null || hdl == null || hdl <= 0) return null;
      // CRP mg/L ÷ HDL mg/dL — matches NHANES convention used in published cutoffs
      return Math.round((crp / (hdl * 38.67)) * 10000) / 10000;
    });

    // Helper: chronological age at blood draw date
    const _ageAt = (dateStr) => {
      if (!state.profileDob) return null;
      const dob = new Date(state.profileDob + 'T00:00:00');
      const draw = new Date(dateStr + 'T00:00:00');
      const age = (draw - dob) / (365.25 * 24 * 60 * 60 * 1000);
      return age > 0 ? age : null;
    };

    // hs-CRP only — standard CRP is a different assay (different sample,
    // different detection range, ~10× higher quantification floor) and
    // substituting silently would corrupt biological-age estimates the user
    // can't see is contaminated. The detail modal already explains the
    // hs-CRP requirement. Returns null when hs-CRP is missing → row drops.
    const _getCRP = (i) => getVals('proteins', 'hsCRP')?.[i] ?? null;

    // PhenoAge (Levine 2018) — biological age from 9 biomarkers + chronological age
    ratios.markers.phenoAge.values = sortedDates.map((dateStr, i) => {
      const age = _ageAt(dateStr);
      if (age == null) return null;
      const albumin_si   = getVals('proteins', 'albumin')?.[i];        // g/L
      const creatinine_si = getVals('biochemistry', 'creatinine')?.[i]; // µmol/L
      const glucose_si   = getVals('biochemistry', 'glucose')?.[i];    // mmol/L
      const crp          = _getCRP(i);                                  // mg/L
      const lymphPct_si  = getVals('differential', 'lymphocytesPct')?.[i]; // fraction 0–1
      const mcv          = getVals('hematology', 'mcv')?.[i];          // fL
      const rdw          = getVals('hematology', 'rdwcv')?.[i];        // %
      const alp_si       = getVals('biochemistry', 'alp')?.[i];        // µkat/L
      const wbc          = getVals('hematology', 'wbc')?.[i];          // 10^9/L
      if ([albumin_si, creatinine_si, glucose_si, crp, lymphPct_si, mcv, rdw, alp_si, wbc].some(v => v == null)) return null;
      if (crp <= 0) return null; // ln(CRP) undefined for non-positive

      // Levine 2018 coefficients — calibrated for SI units as stored in the schema
      const xb = -19.907
        - 0.0336  * albumin_si
        + 0.0095  * creatinine_si
        + 0.1953  * glucose_si
        + 0.0954  * Math.log(crp)
        - 0.0120  * lymphPct_si
        + 0.0268  * mcv
        + 0.3306  * rdw
        + 0.00188 * alp_si
        + 0.0554  * wbc
        + 0.0804  * age;

      const mortalityScore = 1 - Math.exp(-Math.exp(xb) * (Math.exp(120 * 0.0076927) - 1) / 0.0076927);
      if (mortalityScore <= 0 || mortalityScore >= 1) return null;
      const phenoAge = 141.50225 + Math.log(-0.00553 * Math.log(1 - mortalityScore)) / 0.090165;
      return Math.round(phenoAge * 10) / 10;
    });

    // Bortz Age (Bortz et al. 2023, Nature Communications)
    // BAA = 10 × sum((centered - mean) × coeff), biological age = chronological age + BAA
    // Coefficients and means from longevityworldcup.com (inspired by their open implementation)
    // Units: all SI as stored in schema, except ALP/GGT/ALT which need µkat/L→U/L (×60)
    // and lymphocytesPct which needs fraction→% (×100)
    const _bortzFeatures = [
      // [getValue fn,                                    mean,     coeff,   log, capVal, capMode]
      ['age',                                             56.049,  -0.026,  false, null,  null],
      [() => getVals('proteins', 'albumin'),              45.124,  -0.011,  false, 54,    'ceil'],
      [() => getVals('biochemistry', 'alp'),              82.685,   0.0016, false, null,  null,  60],  // µkat/L→U/L
      [() => getVals('biochemistry', 'urea'),              5.355,  -0.030,  false, 9.3,   'ceil'],
      [() => getVals('lipids', 'cholesterol'),              5.618, -0.0806, false, 7.58,  'ceil'],
      [() => getVals('biochemistry', 'creatinine'),        71.566, -0.0110, false, null,  null],
      [() => getVals('biochemistry', 'cystatinC'),          0.901,  1.860,  false, 0.38,  'floor'],
      [() => getVals('diabetes', 'hba1c'),                 35.479,  0.0181, false, 26,    'floor'],
      ['crp',                                               0.300,  0.0791, true,  null,  null],       // log-transformed
      [() => getVals('biochemistry', 'ggt'),                3.380,  0.2656, true,  null,  null,  60],  // µkat/L→U/L, log
      [() => getVals('hematology', 'rbc'),                  4.499, -0.2044, false, 5.77,  'ceil'],
      [() => getVals('hematology', 'mcv'),                 91.925,  0.0172, false, null,  null],
      [() => getVals('hematology', 'rdwcv'),               13.434,  0.2020, false, 11.4,  'floor'],
      [() => getVals('differential', 'monocytes'),          0.475,  0.369,  false, 0.3,   'floor'],
      [() => getVals('differential', 'neutrophils'),        4.185,  0.0668, false, 2,     'floor'],
      [() => getVals('differential', 'lymphocytesPct'),    28.582, -0.0108, false, 60,    'ceil', 100], // fraction→%
      [() => getVals('biochemistry', 'alt'),                3.078, -0.312,  true,  29,    'ceil', 60],  // µkat/L→U/L, log
      [() => getVals('hormones', 'shbg'),                   3.820,  0.292,  true,  null,  null],        // log
      [() => getVals('vitamins', 'vitaminD'),               3.605, -0.265,  true,  112.6, 'ceil', 0.4006], // nmol/L→ng/mL, log
      [() => getVals('biochemistry', 'glucose'),            4.956,  0.0322, false, 4.44,  'floor'],
      [() => getVals('hematology', 'mch'),                 31.840,  0.0275, false, 25.7,  'floor'],
      [() => getVals('lipids', 'apoAI'),                    1.524, -0.185,  false, 1.82,  'ceil'],
    ];

    ratios.markers.bortzAge.values = sortedDates.map((dateStr, i) => {
      const age = _ageAt(dateStr);
      if (age == null) return null;
      const crp = _getCRP(i);

      let baa = 0;
      for (const feat of _bortzFeatures) {
        const [src, mean, coeff, useLog, capVal, capMode, scaleFactor] = feat;
        let val;
        if (src === 'age') val = age;
        else if (src === 'crp') val = crp;
        else val = src()?.[i] ?? null;
        if (val == null) return null; // all inputs required
        if (scaleFactor) val *= scaleFactor; // unit conversion (µkat/L→U/L, fraction→%)
        if (capVal != null) {
          if (capMode === 'ceil') val = Math.min(val, capVal);
          else if (capMode === 'floor') val = Math.max(val, capVal);
        }
        if (useLog) {
          if (val <= 0) return null;
          val = Math.log(val);
        }
        baa += (val - mean) * coeff;
      }
      const bortzAge = age + 10 * baa;
      return Math.round(bortzAge * 10) / 10;
    });

    // Biological Age — combined estimate from PhenoAge and Bortz Age
    ratios.markers.biologicalAge.values = sortedDates.map((_, i) => {
      const pheno = ratios.markers.phenoAge.values[i];
      const bortz = ratios.markers.bortzAge.values[i];
      if (pheno != null && bortz != null) return Math.round(((pheno + bortz) / 2) * 10) / 10;
      if (pheno != null) return pheno;
      if (bortz != null) return bortz;
      return null;
    });
  }

  if (state.unitSystem === 'US') applyUnitConversion(data);
  return data;
}

export function convertDisplayToSI(dotKey, value) {
  if (state.unitSystem !== 'US') return value;
  const conv = UNIT_CONVERSIONS[dotKey];
  if (!conv) return value;
  if (conv.type === 'multiply') return parseFloat((value / conv.factor).toPrecision(6));
  if (conv.type === 'hba1c') return parseFloat(((value - 2.15) * 10.929).toFixed(1));
  return value;
}

export function applyUnitConversion(data) {
  for (const [catKey, cat] of Object.entries(data.categories)) {
    for (const [markerKey, marker] of Object.entries(cat.markers)) {
      const conv = UNIT_CONVERSIONS[`${catKey}.${markerKey}`];
      if (!conv) continue;
      if (conv.type === 'multiply') {
        marker.values = marker.values.map(v => v !== null ? parseFloat((v * conv.factor).toPrecision(4)) : null);
        if (marker.refMin != null) marker.refMin = parseFloat((marker.refMin * conv.factor).toPrecision(4));
        if (marker.refMax != null) marker.refMax = parseFloat((marker.refMax * conv.factor).toPrecision(4));
        if (marker.optimalMin != null) marker.optimalMin = parseFloat((marker.optimalMin * conv.factor).toPrecision(4));
        if (marker.optimalMax != null) marker.optimalMax = parseFloat((marker.optimalMax * conv.factor).toPrecision(4));
        if (marker.phaseRefRanges) {
          marker.phaseRefRanges = marker.phaseRefRanges.map(r =>
            r ? { min: parseFloat((r.min * conv.factor).toPrecision(4)),
                  max: parseFloat((r.max * conv.factor).toPrecision(4)) } : null
          );
        }
        marker.unit = conv.usUnit;
      } else if (conv.type === 'hba1c') {
        marker.values = marker.values.map(v => v !== null ? parseFloat(((v / 10.929) + 2.15).toFixed(1)) : null);
        if (marker.refMin != null) marker.refMin = parseFloat(((marker.refMin / 10.929) + 2.15).toFixed(1));
        if (marker.refMax != null) marker.refMax = parseFloat(((marker.refMax / 10.929) + 2.15).toFixed(1));
        if (marker.optimalMin != null) marker.optimalMin = parseFloat(((marker.optimalMin / 10.929) + 2.15).toFixed(1));
        if (marker.optimalMax != null) marker.optimalMax = parseFloat(((marker.optimalMax / 10.929) + 2.15).toFixed(1));
        marker.unit = '%';
      }
    }
  }
}

// ═══════════════════════════════════════════════
// DATE RANGE FILTER
// ═══════════════════════════════════════════════
export function filterDatesByRange(data) {
  if (state.dateRangeFilter === 'all') return data;
  const months = state.dateRangeFilter === '3m' ? 3 : state.dateRangeFilter === '6m' ? 6 : 12;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const indices = [];
  for (let i = 0; i < data.dates.length; i++) {
    if (data.dates[i] >= cutoffStr) indices.push(i);
  }
  if (indices.length === 0) return data; // fallback: show all if no dates in range
  const filtered = {
    dates: indices.map(i => data.dates[i]),
    dateLabels: indices.map(i => data.dateLabels[i]),
    ...(data.phaseLabels && { phaseLabels: indices.map(i => data.phaseLabels[i]) }),
    categories: {}
  };
  for (const [catKey, cat] of Object.entries(data.categories)) {
    const filteredCat = { ...cat, markers: {} };
    for (const [mKey, marker] of Object.entries(cat.markers)) {
      if (marker.singlePoint || cat.singlePoint) {
        // Hide single-point markers whose date is outside the filtered range
        const spDate = marker.singleDate || cat.singleDate;
        if (spDate && spDate < cutoffStr) {
          filteredCat.markers[mKey] = { ...marker, values: [null], singleDate: null };
        } else {
          filteredCat.markers[mKey] = marker;
        }
      } else {
        filteredCat.markers[mKey] = {
          ...marker,
          values: indices.map(i => marker.values[i]),
          ...(marker.phaseRefRanges && { phaseRefRanges: indices.map(i => marker.phaseRefRanges[i]) }),
          ...(marker.phaseLabels && { phaseLabels: indices.map(i => marker.phaseLabels[i]) }),
        };
      }
    }
    filtered.categories[catKey] = filteredCat;
  }
  return filtered;
}

export function renderDateRangeFilter() {
  const ranges = [
    { key: '3m', label: '3M' },
    { key: '6m', label: '6M' },
    { key: '1y', label: '1Y' },
    { key: 'all', label: 'All' }
  ];
  return `<div class="date-range-filter">${ranges.map(r =>
    `<button class="range-btn${state.dateRangeFilter === r.key ? ' active' : ''}" onclick="setDateRange('${r.key}')">${r.label}</button>`
  ).join('')}</div>`;
}

export function setDateRange(range) {
  state.dateRangeFilter = range;
  // Order matters: buildSidebar() resets the .active class to Dashboard
  // by default. If we navigate first then buildSidebar, the next
  // range-button click reads .nav-item.active as Dashboard and bounces
  // the user there. Rebuild the sidebar first, then navigate — navigate
  // re-applies the correct active class. Source the target view from
  // state.currentView (set by navigate) rather than the DOM, since the
  // DOM's active class has just been clobbered by buildSidebar.
  window.buildSidebar();
  window.navigate(state.currentView || 'dashboard');
}

export function renderChartLayersDropdown() {
  const hasNotes = (state.importedData.notes || []).length > 0;
  const hasSupps = (state.importedData.supplements || []).length > 0;
  const hasCycle = state.profileSex === 'female' && state.importedData.menstrualCycle?.periods?.length > 0;
  if (!hasNotes && !hasSupps && !hasCycle) return '';
  return `<div class="chart-layers-wrapper">
    <button class="view-btn chart-layers-trigger" aria-haspopup="true" aria-expanded="false" aria-controls="chart-layers-dropdown" onclick="toggleChartLayersDropdown(event)">Layers \u25BE</button>
    <div class="chart-layers-dropdown" id="chart-layers-dropdown" role="menu">
      ${hasNotes ? `<label class="chart-layers-row" onclick="event.stopPropagation()">
        <input type="checkbox" ${state.noteOverlayMode === 'on' ? 'checked' : ''} onchange="setNoteOverlay(this.checked?'on':'off')">
        <span>\uD83D\uDCDD Notes</span>
      </label>` : ''}
      ${hasSupps ? `<label class="chart-layers-row" onclick="event.stopPropagation()">
        <input type="checkbox" ${state.suppOverlayMode === 'on' ? 'checked' : ''} onchange="setSuppOverlay(this.checked?'on':'off')">
        <span>\uD83D\uDC8A Supplements</span>
      </label>` : ''}
      ${hasCycle ? `<label class="chart-layers-row" onclick="event.stopPropagation()">
        <input type="checkbox" ${state.phaseOverlayMode === 'on' ? 'checked' : ''} onchange="setPhaseOverlay(this.checked?'on':'off')">
        <span>\uD83D\uDD34 Cycle Phases</span>
      </label>` : ''}
    </div>
  </div>`;
}

export function toggleChartLayersDropdown(e) {
  e.stopPropagation();
  const dd = document.getElementById('chart-layers-dropdown');
  if (!dd) return;
  const trigger = dd.parentElement?.querySelector('.chart-layers-trigger');
  const isOpen = dd.classList.contains('open');
  dd.classList.toggle('open', !isOpen);
  if (trigger) trigger.setAttribute('aria-expanded', String(!isOpen));
  if (!isOpen) {
    const close = (ev) => {
      // Allow keyboard close (Escape) without requiring an event target
      if (!ev || !ev.target || !ev.target.closest || !ev.target.closest('.chart-layers-wrapper')) {
        dd.classList.remove('open');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        document.removeEventListener('click', close);
        document.removeEventListener('keydown', closeOnEsc);
      }
    };
    const closeOnEsc = (ev) => {
      if (ev.key === 'Escape') {
        dd.classList.remove('open');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        if (trigger) trigger.focus();
        document.removeEventListener('click', close);
        document.removeEventListener('keydown', closeOnEsc);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', close);
      document.addEventListener('keydown', closeOnEsc);
    }, 0);
  }
}

export function setSuppOverlay(mode) {
  state.suppOverlayMode = mode === 'off' ? 'off' : 'on';
  localStorage.setItem(profileStorageKey(state.currentProfile, 'suppOverlay'), state.suppOverlayMode);
  const activeNav = document.querySelector('.nav-item.active');
  const activeCat = activeNav ? activeNav.dataset.category : 'dashboard';
  window.navigate(activeCat);
}

export function setNoteOverlay(mode) {
  state.noteOverlayMode = mode === 'off' ? 'off' : 'on';
  localStorage.setItem(profileStorageKey(state.currentProfile, 'noteOverlay'), state.noteOverlayMode);
  const activeNav = document.querySelector('.nav-item.active');
  const activeCat = activeNav ? activeNav.dataset.category : 'dashboard';
  window.navigate(activeCat);
}

export function setPhaseOverlay(mode) {
  state.phaseOverlayMode = mode === 'off' ? 'off' : 'on';
  localStorage.setItem(profileStorageKey(state.currentProfile, 'phaseOverlay'), state.phaseOverlayMode);
  const activeNav = document.querySelector('.nav-item.active');
  const activeCat = activeNav ? activeNav.dataset.category : 'dashboard';
  window.navigate(activeCat);
}

export function recalculateHOMAIR(entry) {
  const glucose = entry.markers["biochemistry.glucose"];
  const insulin = entry.markers["hormones.insulin"] || entry.markers["diabetes.insulin_d"];
  if (glucose !== undefined && insulin !== undefined) {
    entry.markers["diabetes.homaIR"] = Math.round((glucose * insulin) / 22.5 * 100) / 100;
  }
}

// ═══════════════════════════════════════════════
// CHART LIFECYCLE
// ═══════════════════════════════════════════════
export function destroyAllCharts() {
  for (const c of Object.values(state.chartInstances)) c.destroy();
  state.chartInstances = {};
}

// ═══════════════════════════════════════════════
// MARKER STATUS HELPERS
// ═══════════════════════════════════════════════
export function countFlagged(markers) {
  let c = 0;
  for (const m of markers) { const i = getLatestValueIndex(m.values); if (i!==-1) { const r = getEffectiveRangeForDate(m, i); if (getStatus(m.values[i],r.min,r.max)!=="normal") c++; } }
  return c;
}

export function getLatestValueIndex(values) {
  for (let i=values.length-1;i>=0;i--) if (values[i]!==null) return i;
  return -1;
}

export function getAllFlaggedMarkers(data) {
  if (!data) data = getActiveData();
  const flags = [];
  for (const [ck, cat] of Object.entries(data.categories)) {
    for (const [k, m] of Object.entries(cat.markers)) {
      const i = getLatestValueIndex(m.values);
      if (i!==-1) { const v=m.values[i], r=getEffectiveRangeForDate(m, i), s=getStatus(v,r.min,r.max);
        if (s==="high"||s==="low") flags.push({categoryKey:ck,markerKey:k,id:ck+'_'+k,name:m.name,value:formatValue(v),rawValue:v,unit:m.unit,refMin:m.refMin,refMax:m.refMax,optimalMin:m.optimalMin,optimalMax:m.optimalMax,effectiveMin:r.min,effectiveMax:r.max,status:s});
      }
    }
  }
  return flags;
}

export function statusIcon(s) {
  if (s === 'normal') return '\u2713';
  if (s === 'high') return '\u25B2';
  if (s === 'low') return '\u25BC';
  return '';
}

// ═══════════════════════════════════════════════
// TREND DETECTION
// ═══════════════════════════════════════════════
// Tunables — kept inside data.js because they're tightly coupled to the
// trend-alert algorithm. Bump with care: the dashboard's "needs attention"
// callouts are calibrated against these.
const TREND_SUDDEN_JUMP_FRAC = 0.25;   // jump > 25% of ref range → sudden change
const TREND_MIN_NORM_SLOPE = 0.02;     // |normalized slope| floor — below = noise
const TREND_MIN_R2 = 0.5;              // 4+-point regressions must clear this fit
const TREND_APPROACH_BAND = 0.15;      // within 15% of an edge → "approaching"
const KEY_TRENDS_MAX = 8;              // dashboard "Key Trends" cap

export function detectTrendAlerts(data) {
  const alerts = [];
  for (const [catKey, cat] of Object.entries(data.categories)) {
    if (cat.singlePoint) continue;
    for (const [mKey, marker] of Object.entries(cat.markers)) {
      if (marker.singlePoint) continue;
      const nonNull = marker.values.map((v, i) => ({ v, i })).filter(x => x.v !== null);
      if (nonNull.length < 2) continue;
      const r = getEffectiveRange(marker); // aggregate range for normalization width
      if (r.min == null || r.max == null) continue;
      const range = r.max - r.min;
      if (range <= 0) continue;
      const id = catKey + '_' + mKey;
      const latestEntry = nonNull[nonNull.length - 1];
      const latestVal = latestEntry.v;
      const lr = getEffectiveRangeForDate(marker, latestEntry.i); // phase-aware range for latest
      const prevVal = nonNull[nonNull.length - 2].v;
      const sparkVals = nonNull.slice(-Math.min(5, nonNull.length));

      // Sudden change detection (2+ values)
      const jump = Math.abs(latestVal - prevVal);
      if (jump > range * TREND_SUDDEN_JUMP_FRAC) {
        if (latestVal > lr.max) {
          alerts.push({ id, name: marker.name, category: cat.label, concern: 'sudden_high',
            spark: sparkVals.map(x => formatValue(x.v)), direction: 'rising' });
          continue;
        }
        if (latestVal < lr.min) {
          alerts.push({ id, name: marker.name, category: cat.label, concern: 'sudden_low',
            spark: sparkVals.map(x => formatValue(x.v)), direction: 'falling' });
          continue;
        }
      }

      // Linear regression (3+ values)
      if (nonNull.length < 3) continue;
      const vals = nonNull.map(x => x.v);
      const reg = linearRegression(vals);
      const normSlope = reg.slope / range;
      if (Math.abs(normSlope) < TREND_MIN_NORM_SLOPE) continue;
      // R-squared filter only for 4+ points (2-3 points inherently have high R²)
      if (nonNull.length >= 4 && reg.r2 < TREND_MIN_R2) continue;
      const rising = normSlope > 0;
      let concern = null;
      if (rising && latestVal > lr.max) concern = 'past_high';
      else if (!rising && latestVal < lr.min) concern = 'past_low';
      else if (rising && latestVal >= lr.max - range * TREND_APPROACH_BAND) concern = 'approaching_high';
      else if (!rising && latestVal <= lr.min + range * TREND_APPROACH_BAND) concern = 'approaching_low';
      if (!concern) continue;
      alerts.push({ id, name: marker.name, category: cat.label, concern,
        spark: sparkVals.map(x => formatValue(x.v)), direction: rising ? 'rising' : 'falling' });
    }
  }
  // Sort: sudden first, then past, then approaching
  alerts.sort((a, b) => {
    const priority = c => c.startsWith('sudden_') ? 0 : c.startsWith('past_') ? 1 : 2;
    return priority(a.concern) - priority(b.concern);
  });
  return alerts;
}

export function getKeyTrendMarkers(filteredData) {
  const selected = [];
  const seen = new Set();
  const MAX = KEY_TRENDS_MAX;

  function hasData(cat, key) {
    const c = filteredData.categories[cat];
    if (!c || c.singlePoint) return false;
    const m = c.markers[key];
    return m && m.values && m.values.some(v => v !== null);
  }

  function add(cat, key) {
    if (selected.length >= MAX) return;
    const id = cat + '_' + key;
    if (seen.has(id)) return;
    if (!hasData(cat, key)) return;
    seen.add(id);
    selected.push({ cat, key });
  }

  // Tier 1: Trend alerts (sudden > past > approaching — already sorted)
  const alerts = detectTrendAlerts(filteredData);
  for (const a of alerts) {
    const dot = a.id.indexOf('_');
    add(a.id.substring(0, dot), a.id.substring(dot + 1));
  }

  // Tier 2: Flagged (out-of-range) markers
  const flags = getAllFlaggedMarkers(filteredData);
  for (const f of flags) {
    add(f.categoryKey, f.markerKey);
  }

  // Tier 3: Sex-aware defaults
  const defaults = state.profileSex === 'female'
    ? [['diabetes','hba1c'],['diabetes','homaIR'],['lipids','ldl'],['vitamins','vitaminD'],
       ['thyroid','tsh'],['iron','ferritin'],['hormones','estradiol'],['proteins','hsCRP']]
    : state.profileSex === 'male'
    ? [['diabetes','hba1c'],['diabetes','homaIR'],['lipids','ldl'],['vitamins','vitaminD'],
       ['thyroid','tsh'],['hormones','testosterone'],['proteins','hsCRP'],['biochemistry','ggt']]
    : [['diabetes','hba1c'],['diabetes','homaIR'],['lipids','ldl'],['vitamins','vitaminD'],
       ['thyroid','tsh'],['proteins','hsCRP'],['biochemistry','ggt'],['hematology','hemoglobin']];
  for (const [cat, key] of defaults) add(cat, key);

  return selected;
}

// ═══════════════════════════════════════════════
// UNIT TOGGLE
// ═══════════════════════════════════════════════
export function switchUnitSystem(system) {
  state.unitSystem = system;
  localStorage.setItem(profileStorageKey(state.currentProfile, 'units'), system);
  const data = getActiveData();
  window.buildSidebar(data);
  updateHeaderDates(data);
  window.navigate(state.currentView || 'dashboard', data);
}

export function getEffectiveRange(marker) {
  if (state.rangeMode === 'optimal' || state.rangeMode === 'both') {
    if (marker.optimalMin != null || marker.optimalMax != null) {
      return { min: marker.optimalMin ?? null, max: marker.optimalMax ?? null };
    }
  }
  return { min: marker.refMin, max: marker.refMax };
}

export function getEffectiveRangeForDate(marker, dateIndex) {
  if (marker.phaseRefRanges && marker.phaseRefRanges[dateIndex]) {
    return marker.phaseRefRanges[dateIndex];
  }
  return getEffectiveRange(marker);
}

export function getPhaseRefEnvelope(marker) {
  if (!marker.phaseRefRanges) return null;
  let min = Infinity, max = -Infinity;
  for (const r of marker.phaseRefRanges) {
    if (!r) continue;
    if (r.min < min) min = r.min;
    if (r.max > max) max = r.max;
  }
  return min === Infinity ? null : { min, max };
}

export function switchRangeMode(mode) {
  state.rangeMode = mode;
  localStorage.setItem(profileStorageKey(state.currentProfile, 'rangeMode'), mode);
  updateHeaderRangeToggle();
  const data = getActiveData();
  window.buildSidebar(data);
  window.navigate(state.currentView || 'dashboard', data);
}

export function updateHeaderDates(data) {
  if (!data) data = getActiveData();
  const el = document.getElementById("header-dates");
  if (el) {
    if (data.dateLabels.length > 0) {
      const labels = data.dateLabels;
      const dateText = labels.length === 1 ? labels[0] : `${labels[0]} – ${labels[labels.length - 1]}`;
      el.innerHTML = `<span class="label">Dates:</span> ${dateText}`;
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  }
}

export function updateHeaderRangeToggle() {
  const el = document.getElementById('header-range-toggle');
  if (!el) return;
  el.innerHTML = ['optimal', 'reference', 'both'].map(m =>
    `<button class="range-toggle-btn${state.rangeMode === m ? ' active' : ''}" onclick="switchRangeMode('${m}')">${m.charAt(0).toUpperCase() + m.slice(1)}</button>`
  ).join('');
}

Object.assign(window, { saveImportedData, getFocusCardFingerprint, getActiveData, applyUnitConversion, filterDatesByRange, recalculateHOMAIR, renderDateRangeFilter, setDateRange, renderChartLayersDropdown, toggleChartLayersDropdown, setSuppOverlay, setNoteOverlay, setPhaseOverlay, destroyAllCharts, countFlagged, getLatestValueIndex, getAllFlaggedMarkers, statusIcon, detectTrendAlerts, getKeyTrendMarkers, switchUnitSystem, getEffectiveRange, getEffectiveRangeForDate, getPhaseRefEnvelope, switchRangeMode, updateHeaderDates, updateHeaderRangeToggle, registerRefreshCallback });
