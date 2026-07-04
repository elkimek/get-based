// @ts-check
// biology-score-blood-flow.js — Blood Flow Signals (formerly Blood Flow Viscosity).

import {
  finalizeCustomScore,
  getMarkerHit,
  scoreAgainstRange,
  scoreHighOnly,
} from './biology-score-engine.js';
import { getBiologyProfileContext } from './profile-context.js';
import { getInputProfileModifier } from './biology-score-profile-modifiers.js';

export function computeBloodFlowSignals(data, def, options = {}) {
  const hct = getMarkerHit(data, 'hematology.hematocrit');
  const hgb = getMarkerHit(data, 'hematology.hemoglobin');
  const platelets = getMarkerHit(data, 'hematology.platelets');
  const fibrinogen = getMarkerHit(data, 'coagulation.fibrinogen');
  const dDimer = getMarkerHit(data, ['coagulation.dDimer', 'coagulation.d_dimer']);
  const albumin = getMarkerHit(data, 'proteins.albumin');
  const sodium = getMarkerHit(data, 'electrolytes.sodium');
  const bunCreat = getMarkerHit(data, 'calculatedRatios.bunCreatRatio');
  const crp = getMarkerHit(data, 'proteins.crp');
  const profileContext = options.profileContext || getBiologyProfileContext(options);
  const bunCreatModifier = bunCreat ? getInputProfileModifier(bunCreat, { label: 'BUN/creatinine ratio', weight: 0.35, paths: 'calculatedRatios.bunCreatRatio' }, profileContext) : {};
  const flags = [];
  const parts = [];
  const missing = [];
  const add = (hit, key, label, weight, partial, core = false) => {
    if (!hit || partial == null) missing.push({ key, label, weight, core });
    else parts.push({ ...hit, key, label, weight, partial: Math.round(partial), core });
  };
  add(hct, 'hct', 'Hematocrit', 1.15, hct ? scoreAgainstRange(hct.value, hct.range) : null, true);
  add(hgb, 'hgb', 'Hemoglobin', 0.75, hgb ? scoreAgainstRange(hgb.value, hgb.range) : null, true);
  add(platelets, 'platelets', 'Platelets', 0.55, platelets ? scoreAgainstRange(platelets.value, platelets.range) : null, true);
  add(fibrinogen, 'fibrinogen', 'Fibrinogen', 0.95, fibrinogen ? scoreHighOnly(fibrinogen.value, fibrinogen.range?.max ?? 4, (fibrinogen.range?.max ?? 4) * 2) : null);
  add(dDimer, 'dDimer', 'D-dimer', 0.8, dDimer ? scoreHighOnly(dDimer.value, dDimer.range?.max ?? 0.5, (dDimer.range?.max ?? 0.5) * 4) : null);
  add(albumin, 'albumin', 'Albumin', 0.35, albumin ? scoreAgainstRange(albumin.value, albumin.range) : null);
  add(sodium, 'sodium', 'Sodium', 0.25, sodium ? scoreAgainstRange(sodium.value, sodium.range) : null);
  if (bunCreat && bunCreatModifier.score === false) {
    if (bunCreatModifier.flag && !flags.includes(bunCreatModifier.flag)) flags.push(bunCreatModifier.flag);
    parts.push({ ...bunCreat, key: 'bunCreatRatio', label: 'BUN/creatinine ratio', weight: 0, partial: null, profileContextOnly: true, contextReason: bunCreatModifier.flag || '', recencyRequired: false });
  } else {
    add(bunCreat, 'bunCreatRatio', 'BUN/creatinine ratio', 0.35, bunCreat ? scoreAgainstRange(bunCreat.value, bunCreatModifier.rangeOverride ?? bunCreat.range) : null);
  }
  add(crp, 'crp', 'CRP', 0.35, crp ? scoreHighOnly(crp.value, crp.range?.max ?? 3, (crp.range?.max ?? 3) * 4) : null);
  if (hct && hct.range?.max != null && hct.value > hct.range.max) flags.push('High hematocrit pattern: hemoconcentration/viscosity context, not a direct viscosity measurement.');
  if (fibrinogen) flags.push('Fibrinogen is the strongest mapped plasma-viscosity context marker here.');
  if (dDimer) {
    flags.push('D-dimer is acute/contextual; elevated results need clinical context rather than wellness scoring.');
    if (dDimer.range?.max != null && dDimer.value > dDimer.range.max) flags.unshift('Clinical guardrail: elevated D-dimer is not a wellness signal; consider timely clinical review in context.');
  }
  return finalizeCustomScore(def, parts, missing, flags, { ...options, profileContext });
}
