// @ts-check
// Panel routes and minimum interpretable inputs. These are product heuristics.
import { getMarkerHit } from './biology-score-inputs.js';
import { getScoreInputs } from './biology-score-contract.js';
import { getAgeDays, SCORE_DATE_SPAN_DAYS, SCORE_STALE_DAYS } from './biology-score-dates.js';

// Alternative assays can corroborate one sampling period, but an older route
// must not invalidate a complete newer one. Invalid/context-only hits cannot win.
export function selectCurrentCoreAlternatives(available) {
  const groups = new Map();
  for (const item of available) {
    if (!item.core || !item.coreGroup || item.profileContextOnly || !Number.isFinite(item.partial)) continue;
    const age = getAgeDays(item.date);
    if (age == null || age < 0) continue;
    if (!groups.has(item.coreGroup)) groups.set(item.coreGroup, []);
    groups.get(item.coreGroup).push(item);
  }
  for (const members of groups.values()) {
    const newest = members.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
    const latestAge = getAgeDays(newest.date);
    if (latestAge == null) continue;
    for (const item of available.filter(i => i.core && i.coreGroup === newest.coreGroup && i !== newest && !i.profileContextOnly)) {
      const age = getAgeDays(item.date);
      if (age != null && age >= 0 && age - latestAge <= SCORE_DATE_SPAN_DAYS && !(age > SCORE_STALE_DAYS && latestAge <= SCORE_STALE_DAYS)) continue;
      item.profileContextOnly = true; item.partial = null; item.weight = 0; item.recencyRequired = false;
      item.contextReason = 'Superseded by an interpretable alternative in the newer sampling period; retained as historical context.';
    }
  }
}

export function specimenLabel(hit) {
  const explicit = String(hit?.specimen || '').trim();
  if (explicit) return explicit;
  const path = String(hit?.dotKey || hit?.path || '');
  if (/^(oat|nutrientElements\.|urinalysis\.)/.test(path)) return 'Urine';
  if (/^(stool|gut)\./.test(path)) return 'Stool';
  if (/RBC|biostarksMineral/.test(path)) return 'RBC';
  if (/biochemistry\.(lactate|pyruvate)/.test(path)) return 'Blood';
  return '';
}

function specimenKind(hit) {
  const text = specimenLabel(hit).toLowerCase();
  if (/urine|urinary/.test(text)) return 'urine';
  if (/blood|serum|plasma/.test(text)) return 'blood';
  if (/stool|fecal|faecal/.test(text)) return 'stool';
  return text;
}

function sameDrawPair(data, inputs, kind) {
  const latest = inputs.map(i => getMarkerHit(data, i.paths));
  const dates = [...new Set([...(data?.dates || []), ...latest.map(i => i?.date)])].filter(Boolean).sort().reverse();
  for (const date of dates) {
    const hits = inputs.map(i => getMarkerHit(data, i.paths, { date }));
    if (hits.every(hit => hit && (!kind || specimenKind(hit) === kind))) return hits;
  }
  return null;
}

export function resolveScorePanel(data, def) {
  let inputs = getScoreInputs(def);
  const hits = new Map();
  const extra = [];
  let panelLabel = '', panelRoute = '';
  if (def.id === 'cellularEnergyCoherence' || def.id === 'gutImmuneSignal') {
    const energy = def.id === 'cellularEnergyCoherence';
    const routes = energy ? [
      { id: 'urine', label: 'Urine organic-acid panel', keys: ['lactate', 'pyruvate'], kind: 'urine' },
      { id: 'blood', label: 'Blood lactate / pyruvate panel', keys: ['bloodLactate', 'bloodPyruvate'], kind: 'blood' },
    ] : [
      { id: 'stool', label: 'Stool inflammation', keys: ['calprotectin'], kind: 'stool' },
      { id: 'microbial', label: 'Exploratory urine metabolites', keys: ['arabinose', 'hphpa'], kind: 'urine' },
    ];
    const candidates = routes.map(route => ({ ...route, pair: sameDrawPair(data, route.keys.map(key => inputs.find(i => i.key === key)), route.kind),
      latest: route.keys.map(key => getMarkerHit(data, inputs.find(i => i.key === key).paths)?.date || '').sort().at(-1) }));
    // Prefer the newest complete route. An unmatched newer sample stays visible below.
    const selected = candidates.filter(r => r.pair).sort((a, b) => b.pair[0].date.localeCompare(a.pair[0].date))[0]
      || candidates.slice().sort((a, b) => b.latest.localeCompare(a.latest))[0];
    panelLabel = selected.label; panelRoute = selected.id;
    const routeKeys = routes.flatMap(r => r.keys);
    inputs = inputs.map(input => {
      if (!routeKeys.includes(input.key)) return input;
      const core = selected.keys.includes(input.key);
      return { ...input, core, coreGroup: core ? input.key : '', coreGroupLabel: '',
        ...(core ? {} : { contextOnly: 'A different specimen or biological route; retained as additional context.' }) };
    });
    selected.pair?.forEach((hit, index) => {
      const key = selected.keys[index];
      hits.set(key, hit);
      const input = inputs.find(i => i.key === key);
      const recent = getMarkerHit(data, input.paths);
      if (recent && recent.date > hit.date) extra.push({ input: { ...input, key: `${key}Unpaired`, label: `${input.label} (newer unpaired result)`, core: false, coreGroup: '',
        contextOnly: 'A newer result without a matching panel partner; retained for comparison.' }, hit: recent });
    });
  }
  return { inputs, hits, extra, panelLabel, panelRoute };
}

export function panelAnchorWarning(def, available, profile) {
  const core = available.filter(i => i.core && !i.profileContextOnly && Number.isFinite(i.partial));
  const has = key => core.some(i => i.key === key || i.coreGroup === key);
  const all = keys => keys.every(has);
  const any = keys => keys.some(has);
  const checks = {
    metabolicFlexibility: () => has('homaIR') || all(['glucose', 'insulin']),
    thyroidCoherence: () => all(['tsh', 'ft4']),
    cardiovascularLipoprotein: () => has('apoB'),
    redoxStress: () => has('inflammation'),
    fluidFiltrationCoherence: () => has('filtration'),
    bloodFlowViscosity: () => any(['hct', 'hgb']) && has('platelets'),
    ironHandling: () => has('ferritin') && any(['transferrinSat', 'hgb']),
    oneCarbonCoherence: () => has('homocysteine') && any(['b12Status', 'folate']),
    liverBileSignal: () => any(['alt', 'ast']) && any(['ggt', 'alp']),
    boneMineralSignal: () => has('calciumStatus') && any(['vitaminD', 'phosphorus']),
    immuneCellBalance: () => has('wbc') && any(['neutrophils', 'lymphocytes']),
    anabolicRecoverySignal: () => !!profile.sex && has('sexHormone') && any(['albumin', 'totalProtein']),
    stressResilience: () => all(['cortisol', 'dheaS']),
    hormoneAxis: () => !!profile.sex && any(['maleAndrogenStatus', 'femaleSexHormoneStatus']) && any(['lh', 'fsh']),
    lipidMembrane: () => has('omega3Index'),
    nerveMuscleSignal: () => has('ck') && any(['b12Status', 'homocysteine']),
  };
  if (def.id === 'cellularEnergyCoherence' || def.id === 'gutImmuneSignal') {
    const keys = def.panelRoute === 'blood' ? ['bloodLactate', 'bloodPyruvate'] : def.panelRoute === 'urine' ? ['lactate', 'pyruvate']
      : def.panelRoute === 'microbial' ? ['arabinose', 'hphpa'] : ['calprotectin'];
    if (!all(keys) || new Set(core.map(i => i.date)).size !== 1) return `Needs the ${def.panelLabel.toLowerCase()} from one collection before scoring this route.`;
    return '';
  }
  if (checks[def.id] && !checks[def.id]()) {
    const anchors = {
      metabolicFlexibility: 'fasting glucose and insulin, or HOMA-IR', thyroidCoherence: 'TSH and Free T4',
      cardiovascularLipoprotein: 'ApoB', redoxStress: 'CRP or hs-CRP', fluidFiltrationCoherence: 'an interpretable eGFR',
      bloodFlowViscosity: 'hemoglobin or hematocrit, plus platelets', ironHandling: 'ferritin plus transferrin saturation or hemoglobin',
      oneCarbonCoherence: 'homocysteine plus B12 or folate', liverBileSignal: 'ALT or AST, plus GGT or ALP',
      boneMineralSignal: 'calcium plus vitamin D or phosphorus', immuneCellBalance: 'WBC plus neutrophil or lymphocyte counts',
      anabolicRecoverySignal: 'profile-appropriate sex hormones plus albumin or total protein', stressResilience: 'timed cortisol and DHEA-S',
      hormoneAxis: 'profile-appropriate sex hormones plus LH or FSH', lipidMembrane: 'a reported Omega-3 Index',
      nerveMuscleSignal: 'CK plus B12 or homocysteine',
    };
    return `Needs ${anchors[def.id]} with usable collection and profile context before scoring.`;
  }
  if (def.id === 'metabolicFlexibility' && new Set(core.filter(i => i.evidenceGroup === 'glucoseInsulin').map(i => i.date)).size > 1) {
    return 'Needs glucose, insulin and HOMA-IR from the same draw to interpret fasting regulation together.';
  }
  return '';
}

export function applyPanelContext(def, available, flags) {
  if (def.id !== 'boneMineralSignal') return;
  const total = available.find(i => i.key === 'calcium');
  const ionized = available.find(i => i.key === 'calciumIonized' && !i.profileContextOnly);
  if (!total || total.profileContextOnly) return;
  if (ionized) {
    total.profileContextOnly = true; total.weight = 0; total.partial = null; total.recencyRequired = false;
    total.contextReason = 'Ionized calcium supplies the calcium route; total calcium remains supporting context.';
    return;
  }
  const albumin = available.find(i => i.key === 'albumin' && !i.profileContextOnly && i.date === total.date);
  if (!albumin || albumin.partial < 100) {
    total.contextLimited = true;
    total.contextNote = !albumin ? 'Total calcium needs same-draw albumin or an ionized-calcium result for interpretation.'
      : 'Albumin is outside the selected range; total calcium needs albumin context or an ionized-calcium result.';
    flags.push(total.contextNote);
  }
}
