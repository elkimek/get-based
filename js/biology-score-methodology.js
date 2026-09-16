// Biology Score interpretation boundaries and reading links. Scores remain exploratory heuristics.
export const SCORE_METHODS = {
  metabolicFlexibility: ['Fasting glucose and insulin describe fasting regulation, not a direct measurement of fuel switching. HOMA-IR shares inputs with them; HbA1c can be distorted by iron deficiency or altered red-cell turnover.', 'https://www.niddk.nih.gov/health-information/diagnostic-tests/a1c-test'],
  thyroidCoherence: ['TSH and FT4 form the equally weighted core; FT3 adds active-hormone context. A same-draw FT3/FT4 ratio is descriptive, not a validated conversion-efficiency target. Medication timing, illness and biotin can change the pattern.', 'https://www.thyroid.org/thyroid-function-tests/'],
  cardiovascularLipoprotein: ['This summarizes lipoproteins; it is not a cardiovascular event-risk percentage. ApoB and its ratios overlap. Lp(a), blood pressure, smoking and family history can matter despite a favorable average.', 'https://www.lipid.org/resource/role-of-apolipoprotein-b-in-the-clinical-management-of-cardiovascular-risk-in-adults-an-expert-clinical-consensus-from-the-national-lipid-association/'],
  redoxStress: ['CRP or hs-CRP anchors inflammation; GGT adds separate liver-metabolic context, not a direct oxidative-stress measurement. Recent illness, exercise and alcohol can affect results.', 'https://www.aasld.org/liver-fellow-network/core-series/back-basics/how-approach-elevated-liver-enzymes'],
  lipidMembrane: ['Fatty-acid results depend on specimen and assay. An EPA + DHA sum from an unspecified specimen is not automatically an RBC Omega-3 Index; generic membrane quality is not directly measured.', 'https://pubmed.ncbi.nlm.nih.gov/15208005/'],
  bloodFlowViscosity: ['CBC and fibrinogen are indirect blood-flow context, not measured viscosity or clot risk. D-dimer is retained as context and does not contribute points.', 'https://www.mayocliniclabs.com/test-catalog/overview/40936'],
  ironHandling: ['Ferritin, transferrin saturation and hemoglobin anchor the score. Normal red cells do not exclude depleted stores. Inflammation can raise ferritin; serum iron and its transport measures overlap.', 'https://arupconsult.com/content/iron-deficiency-anemia'],
  oneCarbonCoherence: ['Homocysteine and B vitamins provide one-carbon context, not measured methylation throughput. Active and total B12 are alternatives. MMA depends on kidney function and on serum versus urine sampling.', 'https://ods.od.nih.gov/factsheets/VitaminB12-HealthProfessional/'],
  fluidFiltrationCoherence: ['Filtration requires an interpretable eGFR and receives 70% of the complete core weight; sodium and potassium receive 15% each. Low muscle mass can make creatinine-based estimates misleading; cystatin-C eGFR offers another route. UACR adds kidney-damage context. Electrolytes alone cannot establish filtration or hydration.', 'https://www.niddk.nih.gov/research-funding/research-programs/kidney-clinical-research-epidemiology/laboratory/factors-affecting-egfr-accuracy/clinical-measurements'],
  liverBileSignal: ['ALT and AST overlap; GGT and ALP add biliary context. These are patterns of injury or enzyme activity, not a detox-capacity measurement. Exercise, alcohol, bone ALP and isolated bilirubin elevation can alter interpretation.', 'https://www.aasld.org/liver-fellow-network/core-series/back-basics/how-approach-elevated-liver-enzymes'],
  boneMineralSignal: ['Calcium needs albumin or ionized-calcium context; PTH helps interpret calcium-phosphate regulation. Vitamin D and calcitriol are different measures. This does not measure bone density.', 'https://arupconsult.com/content/hypercalcemia-hypocalcemia'],
  immuneCellBalance: ['Counts and differential describe a blood-cell pattern, not immune competence. Percentages, absolute counts and derived ratios overlap; recent illness and medication matter.', 'https://www.nhlbi.nih.gov/health/blood-tests'],
  anabolicRecoverySignal: ['Hormones and proteins are indirect recovery clues, not measured anabolic capacity. Sex, age, therapy, draw timing and recent training change their meaning.', 'https://www.endocrine.org/clinical-practice-guidelines/testosterone-therapy'],
  cellularEnergyCoherence: ['Organic acids are exploratory clues, not a mitochondrial-efficiency test. Urine and blood results use their own assay ranges; illness, collection and creatinine normalization can dominate.', 'https://www.mayocliniclabs.com/test-catalog/overview/616609'],
  stressResilience: ['Specimen-appropriate, timed cortisol and DHEA-S anchor an exploratory stress-related pattern. A single cortisol result cannot measure resilience, a daily rhythm or adrenal reserve.', 'https://www.endocrine.org/patient-engagement/endocrine-library/adrenal-fatigue'],
  hormoneAxis: ['Sex hormones and pituitary signals require age, sex, cycle and therapy context. The average is range agreement, not proof that feedback regulation is normal.', 'https://www.endocrine.org/clinical-practice-guidelines/testosterone-therapy'],
  gutImmuneSignal: ['Stool and microbial organic acids offer different, exploratory signals. Calprotectin reflects intestinal inflammation; zonulin assays have specificity limitations. The composite does not establish permeability or identify an organism.', 'https://www.frontiersin.org/journals/endocrinology/articles/10.3389/fendo.2018.00022/full'],
  nerveMuscleSignal: ['CK and B-vitamin markers provide indirect context, not a nerve-function test. Training changes CK; NfL depends on age, kidney function and assay. Interpret urine and serum lactate separately.', 'https://ods.od.nih.gov/factsheets/VitaminB12-HealthProfessional/'],
};

export function addScoreInterpretation(score) {
  const hits = new Map(score.available.map(i => [i.key, i]));
  const flags = [...(score.flags || [])];
  const patterns = [];
  const interpretable = hit => hit && !hit.profileContextOnly && hit.referenceDirection != null;
  const together = (...items) => items.every(interpretable) && items.every(hit => hit.date === items[0].date);
  const high = hit => interpretable(hit) && hit.referenceDirection === 'above';
  const low = hit => interpretable(hit) && hit.referenceDirection === 'below';
  const inRange = hit => interpretable(hit) && hit.referenceDirection === '';
  const context = score.profileContext || {};
  if (score.id === 'thyroidCoherence') {
    const tsh = hits.get('tsh'), ft4 = hits.get('ft4');
    if (together(tsh, ft4) && low(ft4) && !high(tsh)) patterns.push('FT4 is low without a raised TSH in the same draw. Review medication, illness and pituitary context; the average does not resolve this pattern.');
  }
  if (score.id === 'hormoneAxis' && context.sex === 'male') {
    const lh = hits.get('lh');
    const androgen = [hits.get('testosterone'), hits.get('freeTestosterone')].find(low);
    if (together(androgen, lh)) patterns.push(high(lh)
      ? 'Low testosterone with raised LH suggests increased pituitary drive. Confirm a morning result and review the feedback pattern.'
      : 'Low testosterone without raised LH needs pituitary, illness and medication context. Confirm a morning result before interpreting the feedback pattern.');
  }
  if (score.id === 'liverBileSignal') {
    const alt = hits.get('alt'), ast = hits.get('ast'), alp = hits.get('alp'), ggt = hits.get('ggt'), bilirubin = hits.get('bilirubin');
    if (together(alp, ggt) && high(alp) && inRange(ggt)) patterns.push('ALP is high with GGT in range. The source is uncertain; bone and liver context help distinguish it.');
    if (together(bilirubin, alt, ast, alp, ggt) && high(bilirubin) && [alt, ast, alp, ggt].every(inRange)) patterns.push('Bilirubin is high while the measured liver enzymes are in range. Direct and indirect fractions can clarify this isolated pattern.');
    if (high(ast) && (context.recentHardTraining || ast.entryContext?.recentHardTraining)) patterns.push('Recent training can contribute to raised AST. CK and collection timing help distinguish muscle from liver context.');
  }
  if (score.id === 'redoxStress') {
    const crp = score.available.find(hit => hit.coreGroup === 'inflammation' && !hit.profileContextOnly);
    if (crp && (context.acuteInflammationContext || context.recentHardTraining || crp.entryContext?.acuteIllness || crp.entryContext?.recentHardTraining)) patterns.push('Illness or recent hard training may make this an acute inflammation snapshot. Compare with a recovered baseline before treating it as your usual pattern.');
    if (crp?.dotKey === 'proteins.crp') flags.push('Ordinary CRP anchors the inflammatory signal; hs-CRP can resolve lower concentrations when that specific question matters.');
  }
  const ferritin = hits.get('ferritin');
  if (score.id === 'ironHandling' && ferritin?.canonicalValue < 30) flags.unshift('Low ferritin pattern: iron stores may be depleted even when hemoglobin is normal.');
  if (score.id === 'ironHandling' && hits.get('transferrinSat')?.canonicalValue >= 50) flags.unshift('High transferrin saturation: review iron loading and collection context alongside ferritin.');
  if (ferritin?.canonicalValue > 100 && hits.get('crp')?.canonicalValue > 3) flags.unshift('Inflammation may raise ferritin independently of iron stores.');
  const ft3 = hits.get('ft3'), ft4 = hits.get('ft4');
  const descriptiveRatio = score.id === 'thyroidCoherence' && ft3?.date === ft4?.date && ft4?.canonicalValue > 0
    ? { label: 'FT3/FT4 (molar ratio)', value: (ft3.canonicalValue / ft4.canonicalValue).toFixed(3), date: ft3.date } : null;
  const method = SCORE_METHODS[score.id];
  const attention = patterns[0] || (flags.length > (score.flags || []).length && flags[0] !== score.flags?.[0] ? flags[0] : score.attention);
  return { ...score, flags: [...new Set([...patterns, ...flags])], attention, tone: attention && score.score >= 70 ? 'strained' : score.tone,
    descriptiveRatio, methodology: method?.[0] || '', sourceUrl: method?.[1] || '' };
}
