import type { SupplementRecord } from '../types/supplement-data.js';

// Fictional, clinician-managed histories for bundled demos only. These values
// illustrate one possible course; they are neither dosing advice nor predictions.
export const DEMO_DRAW_OFFSETS = [406, 348, 290, 232, 174, 116, 58, 0] as const;
const DAY = 86400000;
type Series = Record<string, readonly number[]>;
interface Entry { date: string; markers: Record<string, number>; context?: Record<string, unknown>; markerSources?: Record<string, { file: string; at: number }> }
interface Note { date: string; text: string }
interface DemoTreatmentData extends Record<string, unknown> {
  entries: Entry[]; supplements: SupplementRecord[];
  diagnoses: { conditions: Record<string, unknown>[]; familyHistory: Record<string, unknown>[]; note: string };
  diet: Record<string, unknown>; exercise: Record<string, unknown>; sleepRest: Record<string, unknown>;
  stress: Record<string, unknown>; loveLife: Record<string, unknown>;
  notes: Note[]; markerNotes: Record<string, string>; markerValueNotes: Record<string, string>;
  healthGoals: Record<string, unknown>[]; focusCard: { text: string };
  contextHealth: { summaries: Record<string, string>; cardSummaries: Record<string, string> };
}

// Moderate-intensity statin response, a modest concurrent glycemic change, and
// muscle symptoms with normal CK. Attribution remains uncertain, not automatic.
const MALE: Series = {
  'lipids.ldl': [4.5, 4.4, 2.55, 2.45, 2.4, 2.35, 2.4, 2.35],
  'lipids.apoB': [1.32, 1.3, 0.9, 0.86, 0.84, 0.82, 0.84, 0.82],
  'lipids.hdl': [1.05, 1.08, 1.12, 1.16, 1.18, 1.2, 1.2, 1.22],
  'lipids.triglycerides': [1.95, 1.85, 1.65, 1.52, 1.42, 1.36, 1.32, 1.3],
  'diabetes.hba1c': [37, 37, 39, 39, 38, 38, 38, 38],
  'biochemistry.glucose': [5.4, 5.3, 5.4, 5.3, 5.25, 5.2, 5.2, 5.15],
  'diabetes.insulin': [14, 12.5, 12, 10.5, 10, 9, 8.5, 8],
  'biochemistry.creatineKinase': [2.5, 2.4, 2.9, 3.1, 2.6, 2.2, 2.4, 2],
  'biochemistry.alt': [0.65, 0.62, 0.72, 0.58, 0.55, 0.5, 0.48, 0.46],
  'biochemistry.ast': [0.42, 0.4, 0.44, 0.4, 0.36, 0.34, 0.33, 0.32],
};

// Confirmed primary hypothyroidism, partial initial response, clinician titration,
// an over-replacement episode, then stable replacement after clinician reduction.
const FEMALE: Series = {
  'thyroid.tsh': [8.8, 7.9, 5.6, 0.8, 0.14, 2.3, 2.1, 2.2],
  'thyroid.ft4': [9.6, 10.3, 13.1, 20.4, 23.8, 15.7, 15.9, 15.8],
  'thyroid.ft3': [3.3, 3.4, 3.8, 4.9, 5.8, 4.3, 4.4, 4.4],
  'thyroid.t4total': [59, 63, 83, 128, 151, 103, 105, 104],
  'thyroid.t3total': [1.32, 1.35, 1.5, 1.8, 2.1, 1.62, 1.65, 1.64],
  'lipids.ldl': [3.5, 3.55, 2.95, 2.45, 1.95, 2.45, 2.48, 2.45],
  'lipids.apoB': [0.98, 1, 0.84, 0.72, 0.61, 0.71, 0.72, 0.7],
  'lipids.hdl': [1.65, 1.66, 1.7, 1.74, 1.78, 1.76, 1.78, 1.78],
  'lipids.triglycerides': [1.1, 1.1, 0.95, 0.85, 0.78, 0.84, 0.83, 0.82],
  'iron.ferritin': [16, 18, 25, 31, 35, 38, 41, 42],
  'iron.transferrinSat': [16, 17, 20, 23, 25, 27, 28, 28],
  'iron.tibc': [78, 76, 72, 68, 64, 62, 60, 60],
  'hematology.hemoglobin': [122, 124, 128, 132, 134, 136, 137, 138],
  'hematology.rbc': [4.4, 4.45, 4.5, 4.55, 4.6, 4.6, 4.65, 4.65],
  'hematology.mcv': [80, 81, 83, 85, 86, 87, 87, 87],
  'biochemistry.glucose': [4.8, 4.85, 4.85, 4.9, 5, 4.85, 4.8, 4.8],
  'diabetes.insulin': [7, 7, 6.5, 6.2, 6.3, 6, 5.8, 6],
  'diabetes.hba1c': [33, 33, 33, 34, 34, 33, 33, 33],
};

const round = (value: number) => Math.round(value * 1000) / 1000;
const dateAt = (anchor: string, daysAgo: number) => new Date(Date.parse(`${anchor}T00:00:00Z`) - daysAgo * DAY).toISOString().slice(0, 10);

function valueAt(series: readonly number[], offset: number, female: boolean) {
  const points = DEMO_DRAW_OFFSETS.map((day, i) => ({ day: Number(day), value: series[i]! }));
  // A response must not begin before the actual prescription/change date.
  points.push({ day: 338, value: series[1]! });
  if (female) points.push({ day: 280, value: series[2]! }, { day: 164, value: series[4]! });
  points.sort((a, b) => b.day - a.day);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    if (offset <= a.day && offset >= b.day) return round(a.value + (b.value - a.value) * (a.day - offset) / (a.day - b.day));
  }
  return offset > points[0]!.day ? points[0]!.value : points.at(-1)!.value;
}

function recalculate(markers: Record<string, number>) {
  const finite = (...keys: string[]) => keys.every(key => Number.isFinite(markers[key]));
  if (finite('biochemistry.glucose', 'diabetes.insulin')) markers['diabetes.homaIR'] = round(markers['biochemistry.glucose']! * markers['diabetes.insulin']! / 22.5);
  if (finite('lipids.ldl', 'lipids.hdl', 'lipids.triglycerides')) markers['lipids.cholesterol'] = round(markers['lipids.ldl']! + markers['lipids.hdl']! + markers['lipids.triglycerides']! / 2.2);
  if (finite('lipids.cholesterol', 'lipids.hdl')) {
    markers['lipids.nonHdl'] = round(markers['lipids.cholesterol']! - markers['lipids.hdl']!);
    markers['lipids.cholHdlRatio'] = round(markers['lipids.cholesterol']! / markers['lipids.hdl']!);
  }
  if (finite('hematology.rbc', 'hematology.mcv', 'hematology.hemoglobin')) {
    const hematocrit = markers['hematology.rbc']! * markers['hematology.mcv']! / 10;
    markers['hematology.hematocrit'] = round(hematocrit);
    markers['hematology.mch'] = round(markers['hematology.hemoglobin']! / markers['hematology.rbc']!);
    markers['hematology.mchc'] = round(markers['hematology.hemoglobin']! / (hematocrit / 100));
  }
  if (finite('iron.tibc', 'iron.transferrinSat')) {
    markers['iron.iron'] = round(markers['iron.tibc']! * markers['iron.transferrinSat']! / 100);
    markers['iron.transferrin'] = round(markers['iron.tibc']! / 25.1);
  } else if (finite('iron.iron', 'iron.transferrin')) {
    markers['iron.transferrinSat'] = round(markers['iron.iron']! / (markers['iron.transferrin']! * 25.1) * 100);
  }
  delete markers['iron.transferrinSaturation'];
  // Native derived views own these ratios; do not keep contradictory snapshots.
  for (const key of Object.keys(markers)) if (key.startsWith('calculatedRatios.')) delete markers[key];
}

/** Update only a cloned bundled fixture, never an existing saved profile. */
export function applyDemoTreatmentData(input: unknown, sex: unknown) {
  const data = input as DemoTreatmentData;
  if (data?._source !== 'demo' || !Array.isArray(data.entries)) throw new Error('Only bundled demo data can receive a treatment scenario.');
  const female = sex === 'female';
  const anchor = data.entries.map(entry => entry.date).sort().at(-1)!;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) throw new Error('A dated demo panel is required.');
  const date = (daysAgo: number) => dateAt(anchor, daysAgo);
  const series = female ? FEMALE : MALE;
  for (const offset of DEMO_DRAW_OFFSETS) {
    if (!data.entries.some(entry => entry.date === date(offset))) data.entries.push({ date: date(offset), markers: {}, context: { fasting: true, sampleTime: '08:05', ...(female ? { cycleDay: 10, cyclePhase: 'follicular', cyclePhaseDetail: 'late_follicular', cyclePhaseSource: 'recorded' } : {}) } });
  }
  for (const entry of data.entries) {
    const offset = (Date.parse(`${anchor}T00:00:00Z`) - Date.parse(`${entry.date}T00:00:00Z`)) / DAY;
    const focusedPanel = DEMO_DRAW_OFFSETS.some(day => offset === day);
    const mainPanel = focusedPanel && data.entries.find(item => item.date === entry.date) === entry;
    if (offset <= 406) for (const [key, values] of Object.entries(series)) {
      if (mainPanel || key in entry.markers) entry.markers[key] = valueAt(values, offset, female);
    }
    if (female && mainPanel && offset === 406) entry.markers['thyroid.tpoAb'] = 280;
    recalculate(entry.markers);
    if (female && Number.isFinite(entry.markers['thyroid.tsh'])) entry.context = { ...entry.context, notes: entry.date < date(338) ? 'Pretreatment thyroid sample; levothyroxine had not been started.' : 'Morning sample before the levothyroxine dose; B-complex held for 48 hours under laboratory instructions.' };
    entry.markerSources ||= {};
    for (const key of Object.keys(entry.markers)) if (key in series || key === 'thyroid.tpoAb') entry.markerSources[key] = { file: 'Synthetic demo treatment follow-up.pdf', at: Date.parse(`${entry.date}T08:05:00Z`) };
  }
  data.entries.sort((a, b) => a.date.localeCompare(b.date));
  const dose = (value: number, unit: string) => ({ value, unit, basis: 'day' as const, text: `${value} ${unit}/day` });
  const medication: SupplementRecord = female ? {
    id: 'demo-sarah-levothyroxine', schemaVersion: 2, name: 'Levothyroxine', genericName: 'levothyroxine sodium', type: 'medication',
    startDate: date(338), endDate: null, dosage: '50 µg each morning, prescribed by her endocrinologist', currentDose: dose(50, 'µg'),
    schedule: { mode: 'daily', timesPerDay: 1, details: '06:30 with water, before breakfast. Iron at 13:00; magnesium in the evening. On thyroid blood-test days, morning dose follows the draw as instructed by the clinic.' },
    periods: [{ start: date(338), end: date(281), dose: dose(50, 'µg'), endReason: 'Clinician increased dose after persistent elevated TSH at follow-up.' }, { start: date(280), end: date(165), dose: dose(75, 'µg'), endReason: 'Clinician reduced dose after suppressed TSH, high FT4 and palpitations/heat intolerance.' }, { start: date(164), end: null, dose: dose(50, 'µg') }],
    lifecycle: { state: 'active', reason: 'Ongoing clinician-managed thyroid replacement.' }, prescriber: 'Demo endocrinologist',
    note: 'Primary hypothyroidism with positive TPO antibodies. Energy and constipation improved. A clinician-reviewed over-replacement episode resolved after dose reduction; latest thyroid results are stable. Iron is taken more than four hours apart.',
  } : {
    id: 'demo-alex-atorvastatin', schemaVersion: 2, name: 'Atorvastatin', genericName: 'atorvastatin', type: 'medication',
    startDate: date(338), endDate: null, dosage: '20 mg nightly, prescribed by his doctor', currentDose: dose(20, 'mg'),
    schedule: { mode: 'daily', timesPerDay: 1, details: '21:00; current clinician prescription.' }, periods: [{ start: date(338), end: null, dose: dose(20, 'mg') }],
    lifecycle: { state: 'active', reason: 'Ongoing clinician-managed lipid lowering.' }, prescriber: 'Demo prescribing doctor',
    note: 'Prescribed for persistently raised LDL/ApoB and premature coronary disease in his father. LDL response is substantial. Intermittent thigh aches after cycling and a small HbA1c rise are under clinician review; causality is unconfirmed and CK remains within range.',
  };
  data.supplements = [...data.supplements.filter(item => item.id !== medication.id && !/^(?:levothyroxine|atorvastatin)$/i.test(item.name)), medication];
  if (female) updateSarah(data, date);
  else updateAlex(data, date);
  delete data.biologyScoreAI;
  delete data.biologyScoreContextAI;
  return data;
}

function updateAlex(data: DemoTreatmentData, date: (offset: number) => string) {
  data.diagnoses.conditions = [...data.diagnoses.conditions.filter(item => !String(item.name).includes('hyperlipidemia')), { name: 'Primary hyperlipidemia', since: date(348), severity: 'moderate', status: 'controlled' }];
  if (!data.diagnoses.familyHistory.some(item => item.condition === 'Premature coronary artery disease')) data.diagnoses.familyHistory.push({ relative: 'father', condition: 'Premature coronary artery disease', onsetAge: 52, note: 'Myocardial infarction at 52; separate from his later type 2 diabetes.' });
  data.diagnoses.note = 'Atorvastatin is prescribed for primary prevention after persistent high LDL/ApoB and family-history review. No personal cardiovascular event or diabetes diagnosis. Mild intermittent thigh aches after cycling have no established cause; no weakness or dark urine was reported, and CK is within range. Prescriber follow-up is planned.';
  data.exercise.note = 'Strength training three times weekly, zone 2 cycling and walking. Cycling volume increased around the onset of intermittent thigh aches. Symptoms improve with recovery days; exercise and medication remain alternative explanations under clinician review.';
  data.diet.note = 'Mediterranean-style meals with reduced refined carbohydrates and adequate protein; changes predate the statin. Diet and training can contribute to trends but do not establish the cause of the post-prescription LDL change.';
  data.loveLife.note = 'Married, generally satisfied. Variable libido was reported before statin initiation; it has not been attributed to the prescription.';
  data.healthGoals = [{ text: 'Review LDL/ApoB benefit, muscle symptoms and glycemic trend with the prescribing doctor', severity: 'major' }, ...data.healthGoals.filter(item => !/HOMA-IR|^Review LDL\/ApoB benefit|^Maintain improved insulin sensitivity/.test(String(item.text))), { text: 'Maintain improved insulin sensitivity with sustainable diet, activity and recovery', severity: 'mild' }];
  data.notes = [
    { date: date(406), text: 'Persistent high LDL and ApoB despite earlier diet changes. Family history includes a paternal heart attack at 52. Fasting insulin is elevated; no diabetes diagnosis.' },
    { date: date(348), text: 'Repeat lipid panel remains high. Doctor and patient discussed benefits and risks and agreed to start atorvastatin after this baseline.' },
    { date: date(338), text: 'Doctor prescribed atorvastatin 20 mg nightly after a shared benefit/risk discussion.' },
    { date: date(290), text: 'First follow-up 48 days after starting atorvastatin: LDL 4.40→2.55 mmol/L and ApoB 1.30→0.90 g/L. HbA1c 37→39 mmol/mol; a small concurrent rise with pre-existing metabolic risk, not proof of a drug effect.' },
    { date: date(232), text: 'Intermittent bilateral thigh aches after longer cycling sessions. No weakness or dark urine. CK 3.1 µkat/L is within the reporting range. Prescriber reviewed the symptoms; training load and statin association remain possible, with no confirmed drug causality. Prescription continued under supervision.' },
    { date: date(58), text: 'Mild aches recur only after harder rides and improve with recovery. The prescription is unchanged; a benefit/tolerability review remains planned.' },
    { date: date(0), text: 'Current atorvastatin prescription remains 20 mg nightly. LDL 2.35 mmol/L, ApoB 0.82 g/L, HbA1c 38 mmol/mol and CK 2.0 µkat/L. Lipid benefit remains evident; symptoms and glycemia require context rather than automatic attribution.' },
  ];
  data.markerNotes['lipids.ldl'] = 'Interpret with the documented atorvastatin start and pretreatment values; it is not a lifestyle-only trend.';
  data.markerNotes['diabetes.hba1c'] = 'Small increase after statin initiation; pre-existing insulin resistance and concurrent changes limit causal attribution. No diabetes diagnosis.';
  data.markerNotes['biochemistry.creatineKinase'] = 'Muscle symptoms were reviewed with normal CK; normal CK does not establish or exclude statin-associated myalgia.';
  data.markerNotes['diabetes.homaIR'] = 'Calculated from matched fasting glucose and insulin at the same draw.';
  data.markerValueNotes = { [`lipids.ldl:${date(290)}`]: 'First response measurement 48 days after the recorded prescription start.', [`biochemistry.creatineKinase:${date(232)}`]: 'Measured during clinician evaluation of intermittent thigh aches. No intense exercise for 36 hours before this draw.' };
  data.focusCard.text = 'LDL decreased from 4.40 to 2.35 mmol/L and ApoB from 1.30 to 0.82 g/L after the atorvastatin prescription, alongside continued lifestyle work. HbA1c is 38 mmol/mol after a small earlier rise. Intermittent post-cycling aches have been reviewed with normal CK; exercise and medication remain possible contributors. The prescribing doctor is following benefit and tolerability.';
  data.contextHealth.summaries.healthGoals = 'Lipid benefit, tolerability, insulin sensitivity and recovery follow-up';
  data.contextHealth.summaries.diagnoses = 'Treated hyperlipidemia; metabolic risk improving; muscle symptoms under review';
  data.contextHealth.cardSummaries.diagnoses = data.diagnoses.note;
  data.contextHealth.cardSummaries.exercise = String(data.exercise.note);
  data.contextHealth.cardSummaries.healthGoals = 'Balance lipid-lowering benefit, tolerability, glucose monitoring and sustainable recovery with clinician follow-up.';
}

function updateSarah(data: DemoTreatmentData, date: (offset: number) => string) {
  data.diagnoses.conditions = [...data.diagnoses.conditions.filter(item => !/thyroid|Hashimoto/i.test(String(item.name))), { name: 'Primary hypothyroidism — autoimmune thyroiditis', since: date(406), severity: 'moderate', status: 'controlled' }];
  data.diagnoses.note = 'Primary hypothyroidism was diagnosed from repeated high TSH/low FT4 and positive TPO antibodies. Endocrinology manages levothyroxine. An earlier over-replacement episode was reviewed and corrected by the clinician; the current dose is 50 µg/day with stable thyroid results. Iron deficiency is improving; menstrual losses and fatigue remain relevant.';
  data.diet.note = 'Protein-rich dairy-free meals. Levothyroxine at 06:30 with water before breakfast; iron at 13:00 away from coffee/tea and more than four hours after levothyroxine. Magnesium is taken in the evening. Blood-test mornings follow the clinic instruction to take levothyroxine after collection.';
  data.sleepRest.quality = 'fair';
  data.sleepRest.note = 'Usual 22:30–05:30 time in bed; actual sleep varies with deadlines and late-luteal insomnia. Palpitations and marked sleep disruption during the earlier high-dose thyroid phase resolved after clinician review. Recent recovery variation is not automatically thyroid related.';
  data.exercise.note = 'Yoga, easy running, light strength work and walking. Aims for 6000 steps daily; recent busy workdays are below that goal. Recovery varies with sleep and menstrual symptoms, without assuming an ongoing thyroid-dose problem.';
  data.stress.note = 'Moderate work and health stress. Confidence improved after thyroid treatment stabilized; iron-related fatigue, menstrual symptoms and sleep remain separate review topics.';
  data.healthGoals = [{ text: 'Maintain clinician-managed thyroid replacement and review any recurrent symptoms with endocrinology', severity: 'major' }, ...data.healthGoals.filter(item => !/thyroid status|subclinical|Hashimoto|^Maintain clinician-managed thyroid replacement/i.test(String(item.text)))];
  data.notes = [
    { date: date(406), text: 'Fatigue, cold intolerance and constipation. TSH 8.8 mU/L with FT4 9.6 pmol/L; TPO antibodies 280 kU/L. Iron depletion is a second possible contributor to fatigue, not an explanation for all thyroid findings.' },
    { date: date(348), text: 'Repeat TSH 7.9 mU/L and FT4 10.3 pmol/L support persistent primary hypothyroidism. Endocrinology reviewed the results and arranged replacement treatment.' },
    { date: date(338), text: 'Endocrinologist started levothyroxine 50 µg each morning. Recorded instructions separate the morning tablet from iron by more than four hours.' },
    { date: date(290), text: 'After 48 days on 50 µg/day, TSH is still 5.6 mU/L and FT4 13.1 pmol/L. Energy and constipation partly improved. Clinician arranged a dose increase after review.' },
    { date: date(280), text: 'Clinician increased levothyroxine to 75 µg/day after reviewing symptoms and the follow-up results.' },
    { date: date(232), text: '48-day follow-up on 75 µg/day: TSH 0.8 mU/L and FT4 20.4 pmol/L. Symptoms improved; clinician continued the prescription with follow-up.' },
    { date: date(174), text: 'Palpitations, heat intolerance and poorer sleep accompanied TSH 0.14 mU/L and FT4 23.8 pmol/L. Clinician assessed possible over-replacement despite the lower LDL at this draw.' },
    { date: date(164), text: 'Endocrinologist reduced levothyroxine to 50 µg/day after reviewing symptoms and biochemistry.' },
    { date: date(116), text: '48 days after the prescribed reduction, TSH is 2.3 mU/L and FT4 15.7 pmol/L. Palpitations and heat intolerance resolved; energy is better than before treatment.' },
    { date: date(0), text: 'Current 50 µg/day prescription is unchanged under endocrinology follow-up. TSH 2.2 mU/L and FT4 15.8 pmol/L are stable. Ferritin 42 µg/L, hemoglobin 138 g/L and transferrin saturation 28% show improving iron status. Some fatigue remains around deadlines and menstrual symptoms.' },
  ];
  data.markerNotes['thyroid.tsh'] = 'Confirmed primary hypothyroidism treated with levothyroxine. Review the dated 50→75→50 µg clinician-managed history; low TSH during the earlier high-dose phase was assessed as possible over-replacement.';
  data.markerNotes['thyroid.ft4'] = 'Morning samples precede the daily levothyroxine tablet; B-complex held for 48 hours under laboratory instructions.';
  data.markerNotes['iron.ferritin'] = 'Iron status is improving with the recorded iron regimen. Iron and levothyroxine are taken more than four hours apart.';
  data.markerValueNotes = { [`thyroid.tsh:${date(174)}`]: 'Suppressed TSH with high FT4 and symptoms during the 75 µg phase; clinician reviewed and later reduced the dose.', [`thyroid.tsh:${date(0)}`]: 'Stable results on the current clinician-prescribed 50 µg/day. Morning sample before the tablet.' };
  data.focusCard.text = 'TSH 2.2 mU/L and FT4 15.8 pmol/L are stable on the current prescribed 50 µg/day of levothyroxine. Energy, cold intolerance and constipation improved after treatment. Earlier palpitations and heat intolerance during the 75 µg phase resolved after the endocrinologist reduced the dose. Ferritin 42 µg/L and hemoglobin 138 g/L show iron recovery, while sleep, workload and menstrual symptoms remain relevant to fatigue.';
  data.contextHealth.summaries.diagnoses = 'Treated autoimmune hypothyroidism; iron status improving';
  data.contextHealth.cardSummaries.diagnoses = data.diagnoses.note;
  data.contextHealth.cardSummaries.healthGoals = 'Stable prescribed thyroid replacement, iron recovery, energy and bone health with clinician follow-up.';
  data.contextHealth.cardSummaries.diet = String(data.diet.note);
  data.contextHealth.cardSummaries.sleepRest = String(data.sleepRest.note);
  data.contextHealth.cardSummaries.exercise = String(data.exercise.note);
  const wearable = data.wearableSummary as { metrics?: Record<string, Record<string, unknown>> } | undefined;
  const temperature = wearable?.metrics?.body_temp_delta;
  if (temperature) Object.assign(temperature, { latest: 0, baseline: 0, baselineP25: -0.15, baselineP75: 0.2, rolling: { d7: 0, d30: 0.02, d90: 0.05 }, trend30d: 'stable', weekly: [0, -0.1, 0.15, 0.2, -0.05, -0.1, 0.2, 0.25, 0, -0.1, 0.15, 0] });
}
