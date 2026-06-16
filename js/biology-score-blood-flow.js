// @ts-check
// biology-score-blood-flow.js — Blood Flow Signals (formerly Blood Flow Viscosity).

import {
  applyScoreRecency,
  finalizeCustomScore,
  getMarkerHit,
  scoreAgainstRange,
  scoreHighOnly,
} from './biology-score-engine.js';

export function computeBloodFlowSignals(data, def) {
  const hct = getMarkerHit(data, 'hematology.hematocrit');
  const hgb = getMarkerHit(data, 'hematology.hemoglobin');
  const platelets = getMarkerHit(data, 'hematology.platelets');
  const fibrinogen = getMarkerHit(data, 'coagulation.fibrinogen');
  const dDimer = getMarkerHit(data, ['coagulation.dDimer', 'coagulation.d_dimer']);
  const albumin = getMarkerHit(data, 'proteins.albumin');
  const sodium = getMarkerHit(data, 'electrolytes.sodium');
  const bunCreat = getMarkerHit(data, 'calculatedRatios.bunCreatRatio');
  const crp = getMarkerHit(data, ['proteins.hsCRP', 'proteins.crp']);
  const flags = [];
  const parts = [];
  const missing = [];
  const add = (hit, key, label, weight, partial) => {
    if (!hit || partial == null) missing.push({ key, label, weight });
    else parts.push({ ...hit, key, label, weight, partial: Math.round(partial) });
  };
  add(hct, 'hct', 'Hematocrit concentration', 1.15, hct ? scoreAgainstRange(hct.value, hct.range) : null);
  add(hgb, 'hgb', 'Hemoglobin concentration', 0.75, hgb ? scoreAgainstRange(hgb.value, hgb.range) : null);
  add(platelets, 'platelets', 'Platelet count context', 0.55, platelets ? scoreAgainstRange(platelets.value, platelets.range) : null);
  add(fibrinogen, 'fibrinogen', 'Fibrinogen / plasma viscosity context', 0.95, fibrinogen ? scoreHighOnly(fibrinogen.value, fibrinogen.range?.max ?? 4, (fibrinogen.range?.max ?? 4) * 2) : null);
  add(dDimer, 'dDimer', 'D-dimer activation context', 0.8, dDimer ? scoreHighOnly(dDimer.value, dDimer.range?.max ?? 0.5, (dDimer.range?.max ?? 0.5) * 4) : null);
  add(albumin, 'albumin', 'Albumin plasma context', 0.35, albumin ? scoreAgainstRange(albumin.value, albumin.range) : null);
  add(sodium, 'sodium', 'Sodium hydration context', 0.25, sodium ? scoreAgainstRange(sodium.value, sodium.range) : null);
  add(bunCreat, 'bunCreatRatio', 'BUN/creatinine hydration context', 0.35, bunCreat ? scoreAgainstRange(bunCreat.value, bunCreat.range) : null);
  add(crp, 'crp', 'Inflammation context', 0.35, crp ? scoreHighOnly(crp.value, crp.range?.max ?? 3, (crp.range?.max ?? 3) * 4) : null);
  if (hct && hct.range?.max != null && hct.value > hct.range.max) flags.push('High hematocrit pattern: hemoconcentration/viscosity context, not a direct viscosity measurement.');
  if (fibrinogen) flags.push('Fibrinogen is the strongest mapped plasma-viscosity context marker here.');
  if (dDimer) flags.push('D-dimer is acute/contextual; elevated results need clinical context rather than wellness scoring.');
  return finalizeCustomScore(def, parts, missing, flags);
}
