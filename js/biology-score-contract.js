// @ts-check
// Shared panel contract: computation, marker lists, and the lab planner use this source.
import { CUSTOM_BIOLOGY_SCORE_MAPPINGS } from './biology-score-mappings.js';
export const BIOLOGY_SCORE_VERSION = '2026-09-16.3';

const GROUPS = {
  metabolicFlexibility: { glucose: 'glucoseInsulin', insulin: 'glucoseInsulin', homaIR: 'glucoseInsulin', tgHdlRatio: 'lipidHandling', tag: 'lipidHandling', hdl: 'lipidHandling' },
  cardiovascularLipoprotein: { apoB: 'atherogenicParticles', apoBA1Ratio: 'atherogenicParticles', ldl: 'atherogenicParticles', nonHdl: 'atherogenicParticles', apoA1: 'hdlContext', cholHdlRatio: 'hdlContext' },
  fluidFiltrationCoherence: { egfr: 'filtration', creatinine: 'filtration', cystatinC: 'filtration', gfrCystatin: 'filtration', egfrCombined: 'filtration', bunCreatRatio: 'filtration' },
  liverBileSignal: { alt: 'hepatocellular', ast: 'hepatocellular', deRitis: 'hepatocellular', ggt: 'biliary', alp: 'biliary' },
  immuneCellBalance: { neutrophils: 'differential', lymphocytes: 'differential', nlr: 'differential', monocytes: 'differential', eosinophils: 'differential', basophils: 'differential' },
  anabolicRecoverySignal: { testosterone: 'androgens', freeTestosterone: 'androgens', fai: 'androgens', albumin: 'protein', totalProtein: 'protein' },
  bloodFlowViscosity: { hct: 'redCells', hgb: 'redCells' },
  lipidMembrane: { omega3Index: 'omega3', epa: 'omega3', dha: 'omega3', dpa: 'omega3', aaEpa: 'fattyAcidBalance', omega6to3: 'fattyAcidBalance', linoleic: 'fattyAcidBalance', arachidonic: 'fattyAcidBalance' },
  cellularEnergyCoherence: { succinate: 'tca', fumarate: 'tca', malate: 'tca', oxoglutarate: 'tca', aconitate: 'tca', methylglutaconic: 'tca', ethylmalonic: 'fattyAcidOxidation', methylsuccinic: 'fattyAcidOxidation', adipic: 'fattyAcidOxidation', suberic: 'fattyAcidOxidation', sebacic: 'fattyAcidOxidation' },
  ironHandling: { iron: 'transport', transferrin: 'transport', tibc: 'transport', transferrinSat: 'transport', hgb: 'redCells', mch: 'redCells', mcv: 'redCells' },
};
const ANCHORS = {
  cellularEnergyCoherence: ['lactate', 'pyruvate'],
  stressResilience: ['cortisol', 'dheaS'],
  gutImmuneSignal: ['calprotectin'],
  nerveMuscleSignal: ['ck', 'activeB12', 'b12', 'homocysteine'],
};

export function getScoreInputs(def) {
  return (def.inputs || CUSTOM_BIOLOGY_SCORE_MAPPINGS[def.id] || []).map(original => {
    const input = { ...original };
    if (def.id === 'metabolicFlexibility' && ['glucose', 'insulin', 'homaIR', 'tgHdlRatio'].includes(input.key)) input.fastingRequired = true;
    input.evidenceGroup = GROUPS[def.id]?.[input.key] || input.coreGroup || input.key;
    if (['activeB12', 'b12'].includes(input.key)) input.evidenceGroup = 'b12Status';
    if (['hsCrp', 'crp'].includes(input.key)) input.evidenceGroup = 'inflammation';
    if (ANCHORS[def.id]?.includes(input.key)) {
      input.core = true;
      if (def.id === 'gutImmuneSignal') {
        input.coreGroup = 'stoolInflammation'; input.coreGroupLabel = 'Stool calprotectin';
      }
      if (def.id === 'nerveMuscleSignal' && ['activeB12', 'b12'].includes(input.key)) {
        input.coreGroup = 'b12Status'; input.coreGroupLabel = 'Active or total B12';
      }
    }
    if (def.id === 'cardiovascularLipoprotein') input.core = input.key === 'apoB';
    if (def.id === 'redoxStress' && input.key === 'ggt') input.core = false;
    if (def.id === 'redoxStress' && ['hsCrp', 'crp'].includes(input.key)) {
      input.core = true; input.coreGroup = 'inflammation'; input.coreGroupLabel = 'hs-CRP or CRP';
    }
    if (def.id === 'fluidFiltrationCoherence') {
      if (['egfr', 'gfrCystatin', 'egfrCombined'].includes(input.key)) {
        input.weight = 7; input.core = true; input.coreGroup = 'filtration'; input.coreGroupLabel = 'eGFR (creatinine, cystatin C or combined)';
      }
      if (input.key === 'creatinine') input.core = false;
      if (['sodium', 'potassium'].includes(input.key)) input.weight = 1.5;
    }
    if (def.id === 'anabolicRecoverySignal') {
      if (['testosterone', 'freeTestosterone', 'estradiol'].includes(input.key)) {
        input.core = true; input.coreSex = input.key === 'estradiol' ? ['female'] : ['male'];
        input.coreGroup = 'sexHormone'; input.coreGroupLabel = 'Sex hormone appropriate to profile';
      }
    }
    if (def.id === 'thyroidCoherence') {
      input.core = ['tsh', 'ft4'].includes(input.key);
      if (['tsh', 'ft4'].includes(input.key)) input.weight = 1;
      if (input.key === 'ft4') input.label = 'Free T4';
      if (input.key === 'reverseT3') input.contextOnly = 'Reverse T3 adds exploratory context; it does not measure tissue hypothyroidism or conversion efficiency.';
    }
    if (def.id === 'boneMineralSignal' && ['calcium', 'calciumIonized'].includes(input.key)) {
      input.core = true; input.coreGroup = 'calciumStatus'; input.coreGroupLabel = 'Calcium (total with albumin context, or ionized)'; input.evidenceGroup = 'calciumStatus'; input.weight = 1;
    }
    if (def.id === 'hormoneAxis' && input.key === 'progesterone') { input.core = false; delete input.coreGroup; delete input.coreGroupLabel; input.evidenceGroup = 'progesterone'; }
    if (def.id === 'hormoneAxis' && input.key === 'estradiol') input.coreGroupLabel = 'Estradiol with cycle or treatment context';
    if (['reverseT3', 'dDimer', 'calcitriol', 'nfl', 'zonulin'].includes(input.key)) input.plannerOptional = false;
    if (def.id === 'gutImmuneSignal' && ['zonulin', 'secretoryIga'].includes(input.key)) input.contextOnly = 'Assay-specific stool context; this does not determine the route score.';
    if (def.id === 'oneCarbonCoherence' && input.key === 'creatinine') input.contextOnly = 'Kidney-function context for B-vitamin markers; not a methylation measurement.';
    if (def.id === 'ironHandling') input.core = ['ferritin', 'transferrinSat', 'hgb'].includes(input.key);
    if (def.id === 'bloodFlowViscosity') {
      input.core = ['hct', 'hgb', 'platelets'].includes(input.key);
      if (input.key === 'dDimer') input.contextOnly = 'D-dimer requires symptom and testing context; it is not a wellness performance measure.';
    }
    return input;
  });
}
