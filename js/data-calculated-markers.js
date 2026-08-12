// @ts-check
// data-calculated-markers.js — derived ratios and biological-age calculations

import { state } from './state.js';
import { getBiologyProfileContext } from './profile-context.js';
import { wholeAgeAtDate } from './marker-context-ranges.js';

/**
 * @typedef {() => Array<number | null | undefined> | undefined} MarkerValueGetter
 * @typedef {[MarkerValueGetter | 'age' | 'crp', number, number, boolean, number | null, 'ceil' | 'floor' | null, (number | undefined)?]} BortzFeature
 */

/**
 * Populate calculated-marker values and date-specific guidance in-place.
 *
 * @param {{
 *   data: any,
 *   sortedDates: string[],
 *   entryContextByDate: Record<string, any>,
 *   refOverrides: Record<string, any>,
 * }} input
 */
export function populateCalculatedMarkers({ data, sortedDates, entryContextByDate, refOverrides }) {
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
    // A value explicitly printed by the reporting lab is the canonical value
    // for that draw. Calculate the ratio only when the report did not provide
    // it, so rounding/formula differences never create a second visible value.
    const preferDirectReport = (direct, computed) => computed.map((value, i) => direct?.[i] ?? value ?? null);
    const hasReferenceOverride = (dotKey) => {
      const override = refOverrides[dotKey];
      return !!override && (Object.prototype.hasOwnProperty.call(override, 'refMin')
        || Object.prototype.hasOwnProperty.call(override, 'refMax'));
    };
    const setContextGuidance = (markerKey, resolveGuidance) => {
      if (hasReferenceOverride(`calculatedRatios.${markerKey}`)) return;
      const marker = ratios.markers[markerKey];
      if (!marker) return;
      const guidance = sortedDates.map((dateStr, i) => resolveGuidance(dateStr, i));
      if (!guidance.some(Boolean)) return;
      marker.contextRefRanges = guidance.map(item => item?.range || null);
      marker.contextRangeLabels = guidance.map(item => item?.label || null);
    };
    // Helper: chronological age at blood draw date
    const _ageAt = (dateStr) => {
      if (!state.profileDob) return null;
      const dob = new Date(state.profileDob + 'T00:00:00');
      const draw = new Date(dateStr + 'T00:00:00');
      const age = (draw.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return age > 0 ? age : null;
    };
    const directTgHdlVals = getVals('calculatedRatios', 'tgHdlRatio');
    ratios.markers.tgHdlRatio.values = preferDirectReport(
      directTgHdlVals,
      divide(getVals('lipids', 'triglycerides'), getVals('lipids', 'hdl')),
    );
    const directLdlHdlVals = getVals('calculatedRatios', 'ldlHdlRatio');
    ratios.markers.ldlHdlRatio.values = preferDirectReport(
      directLdlHdlVals,
      divide(getVals('lipids', 'ldl'), getVals('lipids', 'hdl')),
    );
    const directCholHdlVals = getVals('calculatedRatios', 'cholHdlRatio');
    const computedCholHdlVals = divide(getVals('lipids', 'cholesterol'), getVals('lipids', 'hdl'));
    ratios.markers.cholHdlRatio.values = preferDirectReport(directCholHdlVals, computedCholHdlVals);
    const directApoRatioVals = getVals('calculatedRatios', 'apoBapoAIRatio');
    ratios.markers.apoBapoAIRatio.values = preferDirectReport(
      directApoRatioVals,
      divide(getVals('lipids', 'apoB'), getVals('lipids', 'apoAI')),
    );
    const directNlrVals = getVals('calculatedRatios', 'nlr');
    ratios.markers.nlr.values = preferDirectReport(
      directNlrVals,
      divide(getVals('differential', 'neutrophils'), getVals('differential', 'lymphocytes')),
    );
    const directPlrVals = getVals('calculatedRatios', 'plr');
    ratios.markers.plr.values = preferDirectReport(
      directPlrVals,
      divide(getVals('hematology', 'platelets'), getVals('differential', 'lymphocytes')),
    );
    const directMlrVals = getVals('calculatedRatios', 'mlr');
    ratios.markers.mlr.values = preferDirectReport(
      directMlrVals,
      divide(getVals('differential', 'monocytes'), getVals('differential', 'lymphocytes')),
    );
    const directDeRitisVals = getVals('calculatedRatios', 'deRitisRatio');
    ratios.markers.deRitisRatio.values = preferDirectReport(
      directDeRitisVals,
      divide(getVals('biochemistry', 'ast'), getVals('biochemistry', 'alt')),
    );
    const directCopperZincVals = getVals('calculatedRatios', 'copperZincRatio');
    ratios.markers.copperZincRatio.values = preferDirectReport(
      directCopperZincVals,
      divide(getVals('electrolytes', 'copper'), getVals('electrolytes', 'zinc')),
    );
    const directFt3Ft4Vals = getVals('calculatedRatios', 'ft3ft4Ratio');
    ratios.markers.ft3ft4Ratio.values = preferDirectReport(
      directFt3Ft4Vals,
      divide(getVals('thyroid', 'ft3'), getVals('thyroid', 'ft4')),
    );

    // BUN/Creatinine Ratio — computed in US units: (urea×2.801) / (creatinine×0.01131)
    const ureaVals = getVals('biochemistry', 'urea');
    const creatVals = getVals('biochemistry', 'creatinine');
    const directBunCreatVals = getVals('calculatedRatios', 'bunCreatRatio');
    const computedBunCreatVals = sortedDates.map((_, i) => {
      const u = ureaVals?.[i], c = creatVals?.[i];
      if (u == null || c == null || c === 0) return null;
      return Math.round((u * 2.801) / (c * 0.01131) * 10) / 10;
    });
    ratios.markers.bunCreatRatio.values = preferDirectReport(directBunCreatVals, computedBunCreatVals);

    // Free Water Deficit — TBW × (Na/140 − 1), uses latest weight or 70kg fallback.
    // Weight now lives in the wearables summary (single source of truth after
    // the Health Metrics unification; manual entries write kg-canonicalized).
    // Legacy importedData.biometrics.weight is kept as a backstop for old
    // profiles that somehow haven't seen the migration run yet.
    const sodiumVals = getVals('electrolytes', 'sodium');
    const summaryWeight = state.importedData?.wearableSummary?.metrics?.weight?.latest;
    const legacyWeightArr = state.importedData?.biometrics?.weight;
    const legacyWeightEntry = Array.isArray(legacyWeightArr) && legacyWeightArr.length > 0
      ? [...legacyWeightArr].sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || '')))[0]
      : null;
    const legacyWeightRaw = Number(legacyWeightEntry?.value);
    const legacyWeight = Number.isFinite(legacyWeightRaw)
      ? (/^lb/i.test(legacyWeightEntry?.unit || '') ? legacyWeightRaw * 0.45359237 : legacyWeightRaw)
      : null;
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
    const directCrpHdlVals = getVals('calculatedRatios', 'crpHdlRatio');
    const computedCrpHdlVals = sortedDates.map((_, i) => {
      const crp = getVals('proteins', 'hsCRP')?.[i] ?? null; // mg/L — requires hs-CRP
      const hdl = getVals('lipids', 'hdl')?.[i]; // mmol/L
      if (crp == null || hdl == null || hdl <= 0) return null;
      // App convention: CRP mg/L ÷ HDL mg/dL; published papers rescale this ratio differently.
      return Math.round((crp / (hdl * 38.67)) * 10000) / 10000;
    });
    ratios.markers.crpHdlRatio.values = preferDirectReport(directCrpHdlVals, computedCrpHdlVals);

    const triglycerideVals = getVals('lipids', 'triglycerides');
    const hdlVals = getVals('lipids', 'hdl');
    const glucoseVals = getVals('biochemistry', 'glucose');
    const albuminVals = getVals('proteins', 'albumin');
    const globulinVals = getVals('proteins', 'globulin');
    const totalProteinVals = getVals('proteins', 'totalProtein');
    const astVals = getVals('biochemistry', 'ast');
    const altVals = getVals('biochemistry', 'alt');
    const plateletVals = getVals('hematology', 'platelets');
    const neutrophilVals = getVals('differential', 'neutrophils');
    const lymphocyteVals = getVals('differential', 'lymphocytes');

    const directAipVals = getVals('calculatedRatios', 'atherogenicIndexPlasma');
    const computedAipVals = sortedDates.map((_, i) => {
      const triglycerides = triglycerideVals?.[i];
      const hdl = hdlVals?.[i];
      if (triglycerides == null || hdl == null || triglycerides <= 0 || hdl <= 0) return null;
      return Math.round(Math.log10(triglycerides / hdl) * 1000) / 1000;
    });
    ratios.markers.atherogenicIndexPlasma.values = preferDirectReport(directAipVals, computedAipVals);

    const directTygVals = getVals('calculatedRatios', 'tygIndex');
    const computedTygVals = sortedDates.map((_, i) => {
      const triglycerides = triglycerideVals?.[i];
      const glucose = glucoseVals?.[i];
      if (triglycerides == null || glucose == null || triglycerides <= 0 || glucose <= 0) return null;
      const triglyceridesMgDl = triglycerides * 88.57;
      const glucoseMgDl = glucose * 18.018;
      return Math.round(Math.log((triglyceridesMgDl * glucoseMgDl) / 2) * 1000) / 1000;
    });
    ratios.markers.tygIndex.values = preferDirectReport(directTygVals, computedTygVals);

    const directAlbuminGlobulinVals = getVals('calculatedRatios', 'albuminGlobulinRatio');
    const computedAlbuminGlobulinVals = sortedDates.map((_, i) => {
      const albumin = albuminVals?.[i];
      const measuredGlobulin = globulinVals?.[i];
      const calculatedGlobulin = albumin != null && totalProteinVals?.[i] != null
        ? totalProteinVals[i] - albumin
        : null;
      const globulin = measuredGlobulin != null ? measuredGlobulin : calculatedGlobulin;
      if (albumin == null || globulin == null || globulin <= 0) return null;
      return Math.round((albumin / globulin) * 1000) / 1000;
    });
    ratios.markers.albuminGlobulinRatio.values = preferDirectReport(directAlbuminGlobulinVals, computedAlbuminGlobulinVals);

    const directFib4Vals = getVals('calculatedRatios', 'fib4Index');
    const computedFib4Vals = sortedDates.map((dateStr, i) => {
      const age = _ageAt(dateStr);
      const ast = astVals?.[i];
      const alt = altVals?.[i];
      const platelets = plateletVals?.[i];
      if (age == null || ast == null || alt == null || platelets == null || ast < 0 || alt <= 0 || platelets <= 0) return null;
      const astUnitsPerLitre = ast * 60;
      const altUnitsPerLitre = alt * 60;
      return Math.round((age * astUnitsPerLitre) / (platelets * Math.sqrt(altUnitsPerLitre)) * 100) / 100;
    });
    ratios.markers.fib4Index.values = preferDirectReport(directFib4Vals, computedFib4Vals);

    const directSiiVals = getVals('calculatedRatios', 'systemicImmuneInflammationIndex');
    const computedSiiVals = sortedDates.map((_, i) => {
      const platelets = plateletVals?.[i];
      const neutrophils = neutrophilVals?.[i];
      const lymphocytes = lymphocyteVals?.[i];
      if (platelets == null || neutrophils == null || lymphocytes == null || platelets < 0 || neutrophils < 0 || lymphocytes <= 0) return null;
      return Math.round((platelets * neutrophils / lymphocytes) * 10) / 10;
    });
    ratios.markers.systemicImmuneInflammationIndex.values = preferDirectReport(directSiiVals, computedSiiVals);

    const directAnionGapVals = getVals('calculatedRatios', 'anionGap');
    const sodiumValsForGap = getVals('electrolytes', 'sodium');
    const chlorideVals = getVals('electrolytes', 'chloride');
    const bicarbonateVals = getVals('biochemistry', 'bicarbonate');
    const computedAnionGapVals = sortedDates.map((_, i) => {
      const sodium = sodiumValsForGap?.[i];
      const chloride = chlorideVals?.[i];
      const bicarbonate = bicarbonateVals?.[i];
      if (sodium == null || chloride == null || bicarbonate == null) return null;
      return Math.round((sodium - chloride - bicarbonate) * 10) / 10;
    });
    ratios.markers.anionGap.values = preferDirectReport(directAnionGapVals, computedAnionGapVals);

    // Date-specific guidance augments the broad schema defaults. A range from
    // the user's report or a manual edit takes priority and disables these
    // built-in contextual bands for that marker.
    /** @type {Record<string, Array<[number, number, number, number, string]>>} */
    const immunePopulationGuidance = {
      nlr: [
        [45, 55, 0.8, 3.44, 'Population range (45–54)'],
        [55, 65, 0.79, 3.53, 'Population range (55–64)'],
        [65, 75, 0.86, 3.92, 'Population range (65–74)'],
        [75, 85, 0.96, 4.53, 'Population range (75–84)'],
        [85, Infinity, 0.89, 5.86, 'Population range (85+)'],
      ],
      plr: [
        [45, 55, 62, 211, 'Population range (45–54)'],
        [55, 65, 60, 226, 'Population range (55–64)'],
        [65, 75, 60, 239, 'Population range (65–74)'],
        [75, 85, 61, 268, 'Population range (75–84)'],
        [85, Infinity, 63, 282, 'Population range (85+)'],
      ],
      systemicImmuneInflammationIndex: [
        [45, 55, 189, 1063, 'Population range (45–54)'],
        [55, 65, 186, 1109, 'Population range (55–64)'],
        [65, 75, 186, 1131, 'Population range (65–74)'],
        [75, 85, 196, 1373, 'Population range (75–84)'],
        [85, Infinity, 205, 1798, 'Population range (85+)'],
      ],
    };
    for (const [markerKey, bands] of Object.entries(immunePopulationGuidance)) {
      setContextGuidance(markerKey, (dateStr) => {
        const age = wholeAgeAtDate(state.profileDob, dateStr);
        if (age == null || age < 45) return null;
        const band = bands.find(([minAge, maxAge]) => age >= minAge && age < maxAge);
        return band ? { range: { min: band[2], max: band[3] }, label: band[4] } : null;
      });
    }

    setContextGuidance('tygIndex', (dateStr) => {
      if (entryContextByDate[dateStr]?.fasting !== false) return null;
      return { range: { min: null, max: null }, label: 'Requires fasting sample' };
    });

    setContextGuidance('fib4Index', (dateStr) => {
      if (entryContextByDate[dateStr]?.acuteIllness === true) {
        return { range: { min: null, max: null }, label: 'Not validated in acute illness' };
      }
      const age = wholeAgeAtDate(state.profileDob, dateStr);
      if (age == null) return null;
      if (age < 35) return { range: { min: null, max: null }, label: 'Not validated under 35' };
      if (age >= 65) return { range: { min: 0, max: 2.0 }, label: 'AASLD threshold (65+)' };
      return { range: { min: 0, max: 1.3 }, label: 'AASLD threshold (35–64)' };
    });

    // hs-CRP only — standard CRP is a different assay (different sample,
    // different detection range, ~10× higher quantification floor) and
    // substituting silently would corrupt biological-age estimates the user
    // can't see is contaminated. The detail modal already explains the
    // hs-CRP requirement. Returns null when hs-CRP is missing → row drops.
    const _getCRP = (i) => getVals('proteins', 'hsCRP')?.[i] ?? null;
    const profileContext = getBiologyProfileContext();
    const creatinineContaminated = !!profileContext.lowMuscleMass;

    // PhenoAge (Levine 2018) — biological age from 9 biomarkers + chronological age
    ratios.markers.phenoAge.values = sortedDates.map((dateStr, i) => {
      if (creatinineContaminated) return null;
      const age = _ageAt(dateStr);
      if (age == null) return null;
      const albumin_si   = getVals('proteins', 'albumin')?.[i];        // g/L
      const creatinine_si = getVals('biochemistry', 'creatinine')?.[i]; // µmol/L
      const glucose_si   = getVals('biochemistry', 'glucose')?.[i];    // mmol/L
      const crp_si       = _getCRP(i);                                  // mg/L
      const lymphPct_si  = getVals('differential', 'lymphocytesPct')?.[i]; // fraction 0–1
      const mcv          = getVals('hematology', 'mcv')?.[i];          // fL
      const rdw          = getVals('hematology', 'rdwcv')?.[i];        // %
      const alp_si       = getVals('biochemistry', 'alp')?.[i];        // µkat/L
      const wbc          = getVals('hematology', 'wbc')?.[i];          // 10^9/L
      if ([albumin_si, creatinine_si, glucose_si, crp_si, lymphPct_si, mcv, rdw, alp_si, wbc].some(v => v == null)) return null;
      const crp_mgdl = crp_si / 10;
      const lymphPct = lymphPct_si * 100;
      const alp_ul = alp_si * 60;
      if (crp_mgdl <= 0) return null; // ln(CRP) undefined for non-positive

      // Levine 2018 coefficients use a mixed clinical-unit formula. Albumin,
      // creatinine, and glucose already match; convert hs-CRP mg/L→mg/dL,
      // lymphocyte fraction→percent, and ALP µkat/L→U/L.
      const xb = -19.907
        - 0.0336  * albumin_si
        + 0.0095  * creatinine_si
        + 0.1953  * glucose_si
        + 0.0954  * Math.log(crp_mgdl)
        - 0.0120  * lymphPct
        + 0.0268  * mcv
        + 0.3306  * rdw
        + 0.00188 * alp_ul
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
    const _bortzFeatures = /** @type {BortzFeature[]} */ ([
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
    ]);

    ratios.markers.bortzAge.values = sortedDates.map((dateStr, i) => {
      if (creatinineContaminated) return null;
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

}
