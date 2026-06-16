// @ts-check
// biology-score-iron.js — Iron Handling score.

import {
  applyScoreRecency,
  finalizeCustomScore,
  getMarkerHit,
  scoreAgainstRange,
  scoreHighOnly,
  scoreLowOnly,
} from './biology-score-engine.js';

export function computeIronHandling(data, def) {
  const ferritin = getMarkerHit(data, 'iron.ferritin');
  const tsat = getMarkerHit(data, 'iron.transferrinSat');
  const iron = getMarkerHit(data, 'iron.iron');
  const transferrin = getMarkerHit(data, 'iron.transferrin');
  const tibc = getMarkerHit(data, 'iron.tibc');
  const hgb = getMarkerHit(data, 'hematology.hemoglobin');
  const mch = getMarkerHit(data, 'hematology.mch');
  const mcv = getMarkerHit(data, 'hematology.mcv');
  const crp = getMarkerHit(data, ['proteins.hsCRP', 'proteins.crp']);
  const sTfR = getMarkerHit(data, ['iron.solubleTransferrinReceptor', 'iron.sTfR', 'iron.transferrinReceptor']);
  const copper = getMarkerHit(data, 'electrolytes.copper');
  const cerulo = getMarkerHit(data, 'proteins.ceruloplasmin');
  const flags = [];
  const parts = [];
  const missing = [];
  const add = (hit, key, label, weight, partial) => {
    if (!hit || partial == null) missing.push({ key, label, weight });
    else parts.push({ ...hit, key, label, weight, partial: Math.round(partial) });
  };

  if (ferritin) {
    const ferritinHighPenalty = scoreHighOnly(ferritin.value, 300, 800);
    const ferritinLowPenalty = scoreLowOnly(ferritin.value, 30, 5);
    const ferritinPartial = Math.min(ferritinHighPenalty, ferritinLowPenalty);
    add(ferritin, 'ferritin', 'Ferritin storage context', 1.15, ferritinPartial);
    if (ferritin.value < 30) flags.push('Low ferritin pattern: possible depleted iron stores.');
    if (tsat && tsat.value >= 45 && ferritin.value > 300) flags.push('High TSAT + high ferritin pattern: overload workup context, not a wellness score.');
    if (crp && crp.value > 3 && ferritin.value > 100) flags.push('Ferritin may be inflated by inflammation; interpret storage carefully.');
  } else {
    missing.push({ key: 'ferritin', label: 'Ferritin storage context', weight: 1.15 });
  }
  if (tsat) {
    let partial = scoreAgainstRange(tsat.value, { min: 16, max: 45 });
    if (tsat.value >= 45) partial = scoreHighOnly(tsat.value, 45, 80);
    if (tsat.value < 16) partial = scoreLowOnly(tsat.value, 16, 4);
    add(tsat, 'transferrinSat', 'Transferrin saturation', 1.25, partial);
    if (tsat.value < 16) flags.push('Low transferrin saturation pattern: iron availability may be constrained.');
  } else missing.push({ key: 'transferrinSat', label: 'Transferrin saturation', weight: 1.25 });
  add(hgb, 'hgb', 'Hemoglobin utilization', 0.8, hgb ? scoreAgainstRange(hgb.value, hgb.range) : null);
  add(mch, 'mch', 'MCH red-cell ironization', 0.65, mch ? scoreAgainstRange(mch.value, mch.range) : null);
  add(mcv, 'mcv', 'MCV red-cell size', 0.5, mcv ? scoreAgainstRange(mcv.value, mcv.range) : null);
  add(iron, 'iron', 'Serum iron context', 0.55, iron ? scoreAgainstRange(iron.value, iron.range) : null);
  add(transferrin, 'transferrin', 'Transferrin transport', 0.45, transferrin ? scoreAgainstRange(transferrin.value, transferrin.range) : null);
  add(tibc, 'tibc', 'TIBC transport capacity', 0.35, tibc ? scoreAgainstRange(tibc.value, tibc.range) : null);
  add(sTfR, 'sTfR', 'Soluble transferrin receptor', 0.55, sTfR ? scoreAgainstRange(sTfR.value, sTfR.range) : null);
  add(crp, 'crp', 'Inflammation context for ferritin', 0.45, crp ? scoreHighOnly(crp.value, crp.range?.max ?? 3, (crp.range?.max ?? 3) * 4) : null);
  add(copper, 'copper', 'Copper support', 0.35, copper ? scoreAgainstRange(copper.value, copper.range) : null);
  if (!cerulo) missing.push({ key: 'ceruloplasmin', label: 'Ceruloplasmin', weight: 0.3 });
  else add(cerulo, 'ceruloplasmin', 'Ceruloplasmin', 0.3, scoreAgainstRange(cerulo.value, cerulo.range));
  return finalizeCustomScore(def, parts, missing, flags);
}
