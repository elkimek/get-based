// Import identity guards for whole-blood lymphocyte subsets. Unit conversion
// remains in schema.ts; these helpers never change report values or intervals.
const SUBSET_IMPORT_STEMS = new Map([
  ['cd3', 'cd3'], ['cd3tcells', 'cd3'], ['totaltcells', 'cd3'],
  ['cd4', 'cd4'], ['cd3cd4', 'cd4'], ['cd4tcells', 'cd4'],
  ['cd8', 'cd8'], ['cd3cd8', 'cd8'], ['cd8tcells', 'cd8'],
  ['cd19', 'cd19'], ['cd19bcells', 'cd19'], ['bcellscd19', 'cd19'],
  ['nk', 'nkCells'], ['nkcells', 'nkCells'], ['naturalkillercells', 'nkCells'],
  ['cd16cd56', 'nkCells'], ['cd16cd56nkcells', 'nkCells'],
  ['cd3cd16cd56', 'nkCells'],
]);

export function resolveLymphocyteSubsetImportKey(hints: {
  compactName: string; absolute: boolean; percent: boolean; unit: string;
}) {
  const stem = SUBSET_IMPORT_STEMS.get(hints.compactName.replace(/(?:absolutecount|absolute|count|abs|percentage|percent|pct)$/, ''));
  if (!stem) return null;
  const percent = !hints.absolute && (hints.percent || ['fraction', '1', 'l/l'].includes(hints.unit));
  return `lymphocyteSubsets.${stem}${percent ? 'Pct' : ''}`;
}

const OTHER_POPULATION = String.raw`(?:CD\d+|[TB][ -]?cells|WBC|leukocytes|white[ -]blood[ -]cells|PBMC|mononuclear[ -]cells)\b`;
const EXPLICIT_DENOMINATOR = new RegExp(String.raw`(?:/|\bof\b)\s*${OTHER_POPULATION}`, 'i');
const PERCENT_DENOMINATOR = new RegExp(String.raw`(?:%|\bpercent(?:age)?\b)\s*(?:of\s+)?${OTHER_POPULATION}`, 'i');

function hasOtherPercentageDenominator(name: string, key: string) {
  // CD16/CD56 names the NK phenotype; its slash is not a ratio denominator.
  const label = name.replace(/\bCD16\s*\+?\s*\/\s*(?:CD)?56\b/gi, 'CD16+CD56');
  if (EXPLICIT_DENOMINATOR.test(label)) return true;
  const marker = key.slice('lymphocyteSubsets.'.length).replace(/Pct$/, '');
  const numerator = marker === 'nkCells' ? /\b(?:NK|natural\s+killer|CD16|CD56)\b/i : new RegExp(`\\b${marker}\\b`, 'i');
  const match = numerator.exec(label);
  // A leading "% CD3" names the numerator. Only a later "% CD3" (for
  // example CD4 (% CD3+)) supplies another population as the denominator.
  const suffix = match ? label.slice(match.index + match[0].length) : label;
  return PERCENT_DENOMINATOR.test(suffix);
}

export function hasUnsupportedSubsetDefinition(rawName: unknown, key: string) {
  if (!key.startsWith('lymphocyteSubsets.')) return false;
  const name = String(rawName || '');
  // These are different denominators/gates, even if an AI chose a built-in key.
  return (/Pct$/.test(key) && hasOtherPercentageDenominator(name, key))
    || (/nkCells/.test(key) && /\bNKT\b|CD3\s*\+|\bactivity\b|\bfunction/i.test(name));
}
