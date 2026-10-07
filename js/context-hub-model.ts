// Typed presentation only: no live state, storage, HTML strings or event wiring.
export interface ContextLabGroup { name: string; count: number; products: string[]; sections: string[]; enabled: boolean }
export interface ContextHubSnapshot {
  insightOn: boolean; hasInsight: boolean; supplementsOn: boolean; hasSupplements: boolean;
  labStats: { coreMarkers: number; totalMarkers: number; groups: ContextLabGroup[] };
  labOn: boolean; hasGenome: boolean; hasGenomeSummary: boolean; hasLight: boolean; hasBody: boolean; hasNutrition: boolean;
  genomeSummaryOn: boolean; genomePriorityOn: boolean; genomeOn: boolean; lightOn: boolean; bodyOn: boolean; nutritionOn: boolean;
  nutritionContextDays: 7 | 30 | 90; lensSet: boolean; kbSet: boolean; kbEnabled: boolean; kbName: string;
}
export interface ContextSourceRow {
  key: string; toggleKey: string; title: string; description: string; status: string; checked: boolean;
  disabled: boolean; child: boolean; affects: readonly string[]; group?: string;
}
export interface ContextSourceSection { key: string; title: string; subtitle: string; rows: ContextSourceRow[]; wide: boolean }
export interface ContextSourceMetric { tone: string; label: string; items: string[]; detail: string }
export interface ContextGroundingCard { key: 'lens' | 'kb'; kicker: string; title: string; subtitle: string; action: string; configured: boolean }
export interface ContextHubModel { sections: ContextSourceSection[]; metrics: ContextSourceMetric[]; grounding: ContextGroundingCard[]; nutritionDays: 7 | 30 | 90 }
function row(input: Omit<ContextSourceRow, 'toggleKey' | 'disabled' | 'child' | 'affects'> & Partial<Pick<ContextSourceRow, 'toggleKey' | 'disabled' | 'child' | 'affects'>>): ContextSourceRow {
  return { disabled: false, child: false, affects: [], toggleKey: input.key, ...input };
}
function section(key: string, title: string, subtitle: string, rows: ContextSourceRow[], { wide = false } = {}): ContextSourceSection { return { key, title, subtitle, rows, wide }; }
function getLabGroupTitle(group: ContextLabGroup) {
  const products = group.products || [];
  if (products.length === 1 && products[0] !== group.name) return `${products[0]} · ${group.name}`;
  return group.name;
}

function getLabGroupDescription(group: ContextLabGroup) {
  const markerCount = `${group.count} marker${group.count !== 1 ? 's' : ''}`;
  const products = group.products || [];
  if (products.length > 1) return `${markerCount} from ${products.join(', ')}.`;
  if (products.length === 1 && products[0] !== group.name) return `${markerCount} from this imported ${products[0]} section.`;
  const sections = (group.sections || []).filter(label => label && label !== group.name).slice(0, 3);
  if (sections.length > 0) return `${markerCount} across ${sections.join(', ')}.`;
  return `${markerCount} from this specialty group.`;
}

function contextSourceMetrics({ insightOn, hasInsight, supplementsOn, hasSupplements, labStats, labOn, genomeSummaryOn, genomePriorityOn, genomeOn, hasGenomeSummary, hasGenome, lightOn, bodyOn, hasBody, nutritionOn, hasNutrition }: ContextHubSnapshot) {
  const included: string[] = [];
  const excluded: string[] = [];
  const inactive: string[] = [];
  if (hasInsight) {
    if (insightOn) included.push('Insight Cards');
    else excluded.push('Insight Cards');
  } else inactive.push('Insight Cards');
  if (hasSupplements) {
    if (supplementsOn) included.push('Supplements & Meds');
    else excluded.push('Supplements & Meds');
  } else inactive.push('Supplements & Meds');
  if (labStats.totalMarkers > 0) {
    if (labOn) included.push('Blood markers');
    else excluded.push('Blood markers');
  } else inactive.push('Blood markers');
  for (const group of labStats.groups) {
    const title = getLabGroupTitle(group);
    if (!labOn) excluded.push(title);
    else if (group.enabled) included.push(title);
    else excluded.push(title);
  }
  if (hasGenomeSummary) {
    if (genomeSummaryOn) included.push('APOE & mtDNA');
    else excluded.push('APOE & mtDNA');
  } else inactive.push('APOE & mtDNA');
  if (hasGenome) {
    if (genomePriorityOn) included.push('Priority SNPs');
    else excluded.push('Priority SNPs');
    if (genomeOn) included.push('Other SNPs');
    else excluded.push('Other SNPs');
  } else {
    inactive.push('Priority SNPs');
    inactive.push('Other SNPs');
  }
  if (lightOn) included.push('Light & Sun');
  else excluded.push('Light & Sun');
  if (hasBody) {
    if (bodyOn) included.push('Wearables');
    else excluded.push('Wearables');
  } else inactive.push('Wearables');
  if (hasNutrition) {
    if (nutritionOn) included.push('Meals & Nutrition');
    else excluded.push('Meals & Nutrition');
  } else inactive.push('Meals & Nutrition');
  return [
    { tone: 'included', label: 'Included', items: included, detail: 'Can influence results' },
    { tone: 'excluded', label: 'Off', items: excluded, detail: 'Explicitly excluded' },
    { tone: 'unavailable', label: 'No data', items: inactive, detail: 'Waiting for profile data' },
  ];
}
export function projectContextHub(snapshot: ContextHubSnapshot): ContextHubModel {
  const { insightOn, hasInsight, supplementsOn, hasSupplements, labStats, labOn, hasGenome, hasGenomeSummary, hasLight, hasBody, hasNutrition, genomeSummaryOn, genomePriorityOn, genomeOn, lightOn, bodyOn, nutritionOn, nutritionContextDays } = snapshot;
  const insightRows = [
    row({
      key: 'insight-cards',
      title: 'Insight Context Cards',
      description: 'Basic profile demographics, health goals, medical history, diet, exercise, sleep, stress, environment, notes, biometrics, and cycle context.',
      status: insightOn
        ? (hasInsight ? 'Profile and lifestyle cards are included.' : 'Enabled, but no Insight Context Cards are filled yet.')
        : 'Profile and lifestyle cards are ignored by AI context and score modifiers.',
      checked: insightOn,
      affects: ['Chat', 'Scores', 'Warnings'],
    }),
    row({
      key: 'supplements-meds',
      title: 'Supplements & Medications',
      description: 'Tracked supplements, medications, ingredients, timing, mitochondrial warnings, and supplement-impact context.',
      status: supplementsOn
        ? (hasSupplements ? 'Supplements and medications are included independently.' : 'Enabled, but no supplements or medications are tracked yet.')
        : 'Supplements and medications are ignored by AI context and score modifiers.',
      checked: supplementsOn,
      child: true,
      affects: ['Chat', 'Scores', 'Warnings'],
    }),
  ];
  const labRows = [
    row({
      key: 'lab-markers',
      title: 'Blood marker results',
      description: 'Imported lab values, ranges, trends, Biology Score context, marker notes, and flagged-result summaries.',
      status: labOn
        ? (labStats.totalMarkers ? `${labStats.totalMarkers} marker${labStats.totalMarkers !== 1 ? 's' : ''} included.` : 'Enabled, but no lab markers are imported yet.')
        : 'Imported blood marker values are ignored by AI context.',
      checked: labOn,
      affects: ['Chat', 'Scores', 'Warnings'],
    }),
    ...labStats.groups.map((group, index) => row({
      key: `lab-group-${index}-${group.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      toggleKey: 'lab-group',
      title: getLabGroupTitle(group),
      description: getLabGroupDescription(group),
      status: !labOn
        ? 'Prepared, but ignored while Blood marker results is off.'
        : (group.enabled ? 'Included alongside core blood markers.' : 'Excluded until enabled here.'),
      checked: group.enabled,
      group: group.name,
      child: true,
      affects: ['Chat', 'Scores'],
    })),
  ];
  const genomeRows = [
    row({
      key: 'genome-summary',
      title: 'APOE & mtDNA summary',
      description: 'High-level inherited context such as APOE haplotype and mtDNA haplogroup.',
      status: hasGenomeSummary
        ? (genomeSummaryOn ? 'Included in AI context.' : 'Excluded from AI context.')
        : 'No APOE or mtDNA summary is stored yet.',
      checked: genomeSummaryOn && hasGenomeSummary,
      disabled: !hasGenomeSummary,
      affects: ['Chat', 'Scores'],
    }),
    row({
      key: 'genome-priority',
      title: 'Priority SNP findings',
      description: 'Effectful or protective SNPs relevant to interpretation; normal/neutral calls stay out.',
      status: hasGenome
        ? (genomePriorityOn ? 'Included in AI context.' : 'Excluded from AI context.')
        : 'Import SNP data before this source can be enabled.',
      checked: genomePriorityOn && hasGenome,
      disabled: !hasGenome,
      affects: ['Chat', 'Scores'],
    }),
    row({
      key: 'genome-lookup',
      title: 'Other SNP lookup inventory',
      description: 'All imported SNP calls, including neutral/no-impact calls from the Genome Lens Other SNPs inventory.',
      status: hasGenome
        ? (genomeOn ? 'Other SNPs may be included for direct lookup questions.' : 'Other SNPs are hidden from AI context.')
        : 'Import SNP data before this source can be enabled.',
      checked: genomeOn && hasGenome,
      disabled: !hasGenome,
      child: true,
      affects: ['Chat lookup'],
    }),
  ];
  const lightRows = [
    row({
      key: 'light-sun',
      title: 'Light & Sun context',
      description: 'Light & Circadian card, aggregate sun and device logs, indoor light environment and audits, trends, calibration, and correlations. Camera images and raw session tables stay out.',
      status: lightOn
        ? (hasLight ? 'Included when relevant.' : 'No light data logged yet; low-light reminders may still be inferred.')
        : 'Ignored by chat context and light-related Biology Score modifiers.',
      checked: lightOn,
      affects: ['Chat', 'Scores', 'Warnings'],
    }),
  ];
  const bodyRows = [
    row({
      key: 'body-wearables',
      title: 'Wearable recovery context',
      description: 'HRV, sleep, resting pulse, recovery, body metrics, and wearable trend summaries.',
      status: bodyOn
        ? (hasBody ? 'Included when available.' : 'Enabled, but no wearable summary is available yet.')
        : 'Ignored by chat context and Body-related Biology Score modifiers.',
      checked: bodyOn,
      affects: ['Chat', 'Scores'],
    }),
    row({
      key: 'body-nutrition',
      title: 'Meals & Nutrition',
      description: 'Share compact nutrition summaries with chat and Agent Access. Individual meals, names, notes, ingredients, and photos stay out.',
      status: nutritionOn
        ? (hasNutrition
          ? (nutritionContextDays === 7
            ? 'Automatically includes the latest 7-day aggregate.'
            : `Automatically includes the latest 7 days and a ${nutritionContextDays}-day aggregate.`)
          : `Enabled with a ${nutritionContextDays}-day window, but no meals are logged yet.`)
        : 'Nutrition summaries are ignored by chat and external Agent Access.',
      checked: nutritionOn,
      affects: ['Chat', 'Agent'],
    }),
  ];
  return { metrics: contextSourceMetrics(snapshot), grounding: groundingCards(snapshot), nutritionDays: nutritionContextDays, sections: [
    section('profile', 'Profile', 'Personal profile context, with meds and supplements controlled separately.', insightRows),
    section('genome', 'Genome', 'Inherited context split by sensitivity and token cost.', genomeRows),
    section('labs', 'Labs', 'Blood markers and imported specialty panels.', labRows, { wide: true }),
    section('light-sun', 'Light & Sun', 'Light exposure context, logged sessions, and score modifiers.', lightRows),
    section('body', 'Body', 'Wearables and recovery signals.', bodyRows),
  ] };
}
function groundingCards({ lensSet, kbSet, kbEnabled, kbName }: ContextHubSnapshot): ContextGroundingCard[] {
  return [
    { key: 'lens', kicker: 'Interpretive Lens', title: 'Personalize how AI answers', configured: lensSet,
      subtitle: lensSet ? 'Interpretive Lens is enabled. Click to review or edit it.' : 'Set the interpretive lens: researchers, paradigms, or schools of thought.', action: lensSet ? 'Review lens' : 'Set lens' },
    { key: 'kb', kicker: 'Retrieval', title: 'Knowledge Base', configured: kbSet,
      subtitle: kbSet ? `${kbName} is enabled. Click to manage documents and retrieval.` : kbEnabled ? 'Knowledge Base is enabled, but no documents are indexed yet. Add a library before it can ground answers.' : 'Ground answers in your own documents, research papers, notes, and references.', action: kbSet ? 'Manage source' : kbEnabled ? 'Add documents' : 'Connect source' },
  ];
}
