// @ts-check
// pdf-import-ratio-units.js — reportable ratios and unit-convention inference

export const IMPORTABLE_CALCULATED_MARKER_KEYS = new Set([
  'calculatedRatios.tgHdlRatio',
  'calculatedRatios.ldlHdlRatio',
  'calculatedRatios.apoBapoAIRatio',
  'calculatedRatios.cholHdlRatio',
  'calculatedRatios.nlr',
  'calculatedRatios.plr',
  'calculatedRatios.mlr',
  'calculatedRatios.deRitisRatio',
  'calculatedRatios.copperZincRatio',
  'calculatedRatios.ft3ft4Ratio',
  'calculatedRatios.bunCreatRatio',
  'calculatedRatios.crpHdlRatio',
  'calculatedRatios.atherogenicIndexPlasma',
  'calculatedRatios.tygIndex',
  'calculatedRatios.albuminGlobulinRatio',
  'calculatedRatios.fib4Index',
  'calculatedRatios.systemicImmuneInflammationIndex',
  'calculatedRatios.anionGap',
]);

function normalizedUnit(value) {
  return String(value || '').trim().toLowerCase().replace(/[µμ]/g, 'u').replace(/\s+/g, '');
}

function markerUnitByKey(markers, key) {
  return normalizedUnit(markers.find(marker => marker?.mappedKey === key)?.unit);
}

/**
 * A ratio printed without a unit can still use either SI component numbers or
 * conventional US component numbers. Preserve that convention as metadata so
 * storage normalization is deterministic without changing the report's label.
 *
 * @param {any[]} markers
 */
export function annotateImportedRatioUnitConventions(markers) {
  const tgHdl = markers.find(marker => marker?.mappedKey === 'calculatedRatios.tgHdlRatio');
  if (tgHdl) {
    const tgUnit = markerUnitByKey(markers, 'lipids.triglycerides');
    const hdlUnit = markerUnitByKey(markers, 'lipids.hdl');
    if (tgUnit && hdlUnit) {
      delete tgHdl.ratioUnitConvention;
      const massUnits = new Set(['mg/dl', 'mg/l', 'g/l']);
      if (massUnits.has(tgUnit) && massUnits.has(hdlUnit)) tgHdl.ratioUnitConvention = 'conventional';
      else if (tgUnit === 'mmol/l' && hdlUnit === 'mmol/l') tgHdl.ratioUnitConvention = 'si';
    }
  }

  const ftRatio = markers.find(marker => marker?.mappedKey === 'calculatedRatios.ft3ft4Ratio');
  if (ftRatio) {
    const ft3Unit = markerUnitByKey(markers, 'thyroid.ft3');
    const ft4Unit = markerUnitByKey(markers, 'thyroid.ft4');
    if (ft3Unit && ft4Unit) {
      delete ftRatio.ratioUnitConvention;
      if (ft3Unit === 'pg/ml' && ft4Unit === 'ng/dl') ftRatio.ratioUnitConvention = 'conventional';
      else if (ft3Unit === 'pmol/l' && ft4Unit === 'pmol/l') ftRatio.ratioUnitConvention = 'si';
    }
  }
}
