// constants.js — Option arrays, chat personalities, system prompt, country data

// ── Profile context card option arrays ──
export const COMMON_CONDITIONS = [
  'Type 2 Diabetes', 'Type 1 Diabetes', 'Pre-diabetes', 'Insulin Resistance',
  'Hypothyroidism', 'Hashimoto\'s', 'Hyperthyroidism', 'Graves\' Disease',
  'PCOS', 'Endometriosis', 'Iron Deficiency Anemia', 'B12 Deficiency',
  'Celiac Disease', 'Crohn\'s Disease', 'Ulcerative Colitis', 'IBS',
  'Fatty Liver (NAFLD)', 'Hypertension', 'High Cholesterol', 'Metabolic Syndrome',
  'Chronic Kidney Disease', 'Gout', 'Rheumatoid Arthritis', 'Lupus (SLE)',
  'Asthma', 'Sleep Apnea', 'Depression/Anxiety'
];
export const DIET_TYPES = ['omnivore', 'pescatarian', 'vegetarian', 'vegan', 'keto', 'low-carb', 'paleo', 'carnivore', 'mediterranean', 'other'];
export const DIET_RESTRICTIONS = ['gluten-free', 'dairy-free', 'nut-free', 'soy-free', 'egg-free', 'sugar-free', 'seed oil-free', 'low-sodium', 'low-FODMAP'];
export const DIET_PATTERNS = ['3 meals/day', '2 meals/day', 'IF 16:8', 'IF 18:6', 'IF 20:4', 'OMAD', 'no pattern'];
export const EXERCISE_FREQ = ['none', '1-2x/week', '3-4x/week', '5-6x/week', 'daily'];
export const EXERCISE_TYPES = ['strength', 'cardio/running', 'cycling', 'swimming', 'yoga/mobility', 'walking', 'HIIT', 'sports', 'martial arts'];
export const EXERCISE_INTENSITY = ['light', 'moderate', 'intense', 'mixed'];
export const DAILY_MOVEMENT = ['sedentary desk job', 'some walking', 'active job', 'very active'];
export const SLEEP_DURATIONS = ['<5h', '5-6h', '6-7h', '7-8h', '8-9h', '9+h'];
export const SLEEP_QUALITY = ['poor', 'fair', 'good', 'excellent'];
export const SLEEP_SCHEDULE = ['consistent', 'somewhat variable', 'very irregular', 'shift work'];
export const SLEEP_ROOM_TEMP = ['cold (<18°C / 65°F)', 'cool (18-20°C / 65-68°F)', 'neutral (20-22°C / 68-72°F)', 'warm (>22°C / 72°F)'];
export const SLEEP_ISSUES = ['trouble falling asleep', 'waking at night', 'early waking', 'sleep apnea', 'snoring', 'restless legs', 'teeth grinding'];
export const SLEEP_ENVIRONMENT = ['blackout curtains', 'eye mask', 'no EMF (WiFi off)', 'grounding sheet', 'magnetico pad', 'white noise', 'earplugs', 'cool mattress'];
export const SLEEP_PRACTICES = ['mouth taping', 'CPAP', 'weighted blanket', 'evening magnesium', 'no food 3h before bed', 'cold shower before bed', 'evening walk'];
// Light & Circadian
export const LIGHT_AM = ['sunrise outdoor (10+ min)', 'sunrise outdoor (<10 min)', 'morning outdoor (after sunrise)', 'light therapy lamp', 'no AM light habit'];
export const LIGHT_DAYTIME = ['mostly outdoors', '2-4h outdoor', '1-2h outdoor', '<1h outdoor', 'mostly indoor'];
export const LIGHT_UV = ['regular sun exposure (skin)', 'midday sun when possible', 'UVB lamp', 'avoid sun / always sunscreen', 'no UV awareness'];
export const SKIN_TYPE = ['I \u2014 very fair', 'II \u2014 fair', 'III \u2014 medium', 'IV \u2014 olive', 'V \u2014 brown', 'VI \u2014 dark'];
export const LIGHT_EVENING = ['blue blockers after sunset', 'dim lights after sunset', 'no screens 1-2h before bed', 'f.lux / night shift on devices', 'bright lights until bed', 'screen in bed'];
export const LIGHT_COLD = ['cold plunge / ice bath', 'cold shower', 'cold face immersion', 'cold ocean / lake', 'winter cold exposure', 'no cold practice'];
export const LIGHT_GROUNDING = ['barefoot on earth daily', 'grounding mat / sheet', 'barefoot occasionally', 'ocean swimming', 'no grounding practice'];
export const LIGHT_SCREEN_TIME = ['<2h', '2-4h', '4-8h', '8-12h', '12+h'];
export const LIGHT_TECH_ENV = ['multiple monitors at work', 'phone in bedroom', 'smart watch 24/7', 'work from home (all day screens)', 'TV before bed', 'gaming (evening)', 'e-reader before bed'];
export const LIGHT_MEAL_TIMING = ['eat within daylight only', 'early dinner (before 6pm)', 'late dinner (after 8pm)', 'skip breakfast', 'time-restricted eating'];
export const STRESS_LEVELS = ['low', 'moderate', 'high', 'chronic'];
export const STRESS_SOURCES = ['work', 'financial', 'relationships', 'health', 'family', 'caregiving', 'loneliness', 'major life change'];
export const STRESS_MGMT = ['meditation', 'therapy', 'exercise', 'nature', 'breathing exercises', 'journaling', 'social support', 'none'];
export const LOVE_STATUS = ['single', 'dating', 'in relationship', 'married', 'divorced/separated', 'widowed', 'it\'s complicated'];
export const LOVE_SATISFACTION = ['very satisfied', 'satisfied', 'neutral', 'unsatisfied', 'not applicable'];
export const LOVE_LIBIDO = ['high', 'normal', 'low', 'very low', 'variable'];
export const LOVE_FREQUENCY = ['daily', 'few times/week', 'weekly', 'few times/month', 'monthly', 'rarely', 'none'];
export const LOVE_ORGASM = ['consistently', 'usually', 'sometimes', 'rarely', 'never', 'not applicable'];
export const LOVE_RELATIONSHIP = ['supportive & secure', 'mostly good', 'strained', 'conflicted', 'emotionally distant', 'codependent', 'new & exciting'];
export const LOVE_CONCERNS = ['low desire', 'erectile issues', 'vaginal dryness', 'pain during sex', 'performance anxiety', 'mismatched libido', 'hormonal changes', 'medication side effects', 'body image', 'trust issues', 'communication problems'];
export const ENV_SETTING = ['urban city center', 'urban residential', 'suburban', 'rural', 'near ocean/lake', 'mountain/altitude', 'island'];
export const ENV_CLIMATE = ['tropical', 'dry/arid', 'temperate', 'cold/northern', 'Mediterranean', 'monsoon/humid'];
export const ENV_WATER = ['spring water', 'well water', 'reverse osmosis', 'filtered (carbon)', 'tap water (unfiltered)', 'deuterium-depleted', 'distilled', 'bottled'];
export const ENV_WATER_CONCERNS = ['fluoridated', 'chlorinated', 'hard water', 'unknown source quality'];
export const ENV_EMF = ['WiFi router in bedroom', 'WiFi router nearby', 'smart meter on home', 'cell tower <500m', 'cell tower <2km', 'Bluetooth always on', '5G dense area', 'high-voltage power lines nearby', 'dirty electricity (old wiring)', 'smart home devices'];
export const ENV_EMF_MITIGATION = ['WiFi off at night', 'airplane mode sleep', 'wired ethernet', 'EMF meters used', 'faraday canopy', 'no smart meter', 'minimal Bluetooth'];

// EMF Assessment — room presets, source options, mitigation options
export const EMF_ROOM_PRESETS = ['Bedroom', 'Children\'s Room', 'Living Room', 'Kitchen', 'Office / Home Office', 'Nursery', 'Bathroom', 'Basement', 'Outdoor / Yard'];
export const EMF_SOURCES = ['WiFi router', 'smart meter', 'cell tower', 'power lines', 'electrical panel', 'dimmer switch', 'LED driver', 'solar inverter', 'baby monitor', 'cordless phone (DECT)', 'Bluetooth devices', 'smart TV', 'microwave oven', 'induction cooktop', 'electric underfloor heating', 'ungrounded wiring', 'knob-and-tube wiring', 'unshielded cables', 'neighboring apartments'];
export const EMF_MITIGATIONS = ['demand switch (Netzfreischalter)', 'WiFi off at night', 'wired ethernet', 'shielding paint (Yshield)', 'shielding fabric / canopy', 'Stetzerizer filters', 'grounding rod', 'router relocated', 'smart meter opt-out', 'breaker off at night', 'shielded cables', 'ferrite beads', 'distance from source', 'phone airplane mode at night'];

// Common EMF meters — each entry lists which measurement types it covers
export const EMF_METER_PRESETS = [
  { name: 'Gigahertz NFA1000', types: ['acElectric', 'acMagnetic'] },
  { name: 'Gigahertz NFA400', types: ['acElectric', 'acMagnetic'] },
  { name: 'Gigahertz HFE35C', types: ['rfMicrowave'] },
  { name: 'Gigahertz HFW35C', types: ['rfMicrowave'] },
  { name: 'Gigahertz ME3830B', types: ['acElectric', 'acMagnetic'] },
  { name: 'Gigahertz ME3840B', types: ['acElectric', 'acMagnetic'] },
  { name: 'Gigahertz ME3951A', types: ['acElectric', 'acMagnetic'] },
  { name: 'Alpha Lab UHS2', types: ['rfMicrowave'] },
  { name: 'Safe Living Technologies Safe and Sound Pro II', types: ['rfMicrowave'] },
  { name: 'Safe Living Technologies Body Voltage Kit', types: ['acElectric'] },
  { name: 'Safe Living Technologies EM3', types: ['acElectric', 'acMagnetic'] },
  { name: 'Safe Living Technologies Line EMI Meter', types: ['dirtyElectricity'] },
  { name: 'Graham-Stetzer Microsurge Meter', types: ['dirtyElectricity'] },
  { name: 'Alpha Lab GM2', types: ['dcMagnetic'] },
  { name: 'TriField TF2', types: ['acElectric', 'acMagnetic', 'rfMicrowave'] },
  { name: 'Cornet ED88TPlus5G', types: ['acElectric', 'acMagnetic', 'rfMicrowave'] },
  { name: 'GQ EMF-390', types: ['acElectric', 'acMagnetic', 'rfMicrowave'] },
];
export const ENV_HOME_LIGHT = ['mostly LED lighting', 'incandescent bulbs', 'full-spectrum bulbs', 'fluorescent/CFL', 'natural daylight (large windows)', 'mixed lighting'];
export const ENV_AIR = ['HEPA air purifier', 'open windows daily', 'houseplants', 'air quality monitor', 'near highway/traffic', 'industrial area nearby', 'wildfire smoke region', 'high pollen area'];
export const ENV_TOXINS = ['mold exposure', 'heavy metals (lead/mercury)', 'pesticide exposure', 'plastic containers for food', 'non-stick cookware (PFAS)', 'conventional cleaning products', 'new car/furniture off-gassing', 'amalgam dental fillings', 'BPA/phthalate exposure', 'organic food mostly'];
export const ENV_BUILDING = ['new construction (<5yr)', 'old building (pre-1970)', 'concrete/steel', 'wood frame', 'natural materials', 'carpet (VOCs)', 'hardwood/tile floors'];
// Diet & Digestion
export const BOWEL_FREQUENCY = ['1x/day', '2x/day', '3+/day', 'every other day', 'irregular'];
export const STOOL_CONSISTENCY = ['hard/pellets', 'firm', 'smooth', 'soft', 'loose', 'watery'];
export const BLOATING_SEVERITY = ['none', 'mild', 'moderate', 'severe'];
export const GAS_SEVERITY = ['none', 'mild', 'moderate', 'excessive'];
export const ACID_REFLUX = ['none', 'occasional', 'frequent', 'daily'];
export const BURPING = ['none', 'occasional', 'frequent', 'after meals'];
export const NAUSEA = ['none', 'occasional', 'frequent', 'daily'];
export const APPETITE = ['normal', 'low', 'excessive', 'variable'];
export const ABDOMINAL_PAIN = ['none', 'occasional', 'frequent', 'chronic'];
export const FOOD_SENSITIVITIES = ['gluten', 'dairy', 'eggs', 'soy', 'nuts', 'FODMAPs', 'histamine', 'nightshades', 'corn', 'shellfish'];

// ── Menstrual cycle symptoms ──
export const PERIOD_SYMPTOMS = [
  'Cramps', 'Mood swings', 'Fatigue', 'Bloating', 'Headache',
  'Acne', 'Breast tenderness', 'Insomnia', 'Back pain', 'Nausea',
  'Hot flashes', 'Night sweats', 'Anxiety', 'Food cravings', 'Spotting', 'Clots', 'Dizziness'
];

// ── Country/Latitude data ──
export const COUNTRY_LATITUDES = {
  // Tropical (<25°)
  'singapore':0,'malaysia':0,'indonesia':0,'thailand':0,'philippines':0,'colombia':0,'ecuador':0,'peru':0,'venezuela':0,'kenya':0,'nigeria':0,'ghana':0,'cameroon':0,'tanzania':0,'uganda':0,'costa rica':0,'panama':0,'cuba':0,'dominican republic':0,'jamaica':0,'puerto rico':0,'hawaii':0,'india':0,'vietnam':0,'myanmar':0,'cambodia':0,'sri lanka':0,'bangladesh':0,'brazil':0,
  // Subtropical (25-40°)
  'mexico':1,'egypt':1,'morocco':1,'tunisia':1,'israel':1,'jordan':1,'saudi arabia':1,'uae':1,'iran':1,'pakistan':1,'nepal':1,'japan':1,'south korea':1,'taiwan':1,'china':1,'australia':1,'new zealand':1,'south africa':1,'argentina':1,'chile':1,'greece':1,'turkey':1,'spain':1,'españa':1,'espana':1,'portugal':1,'cyprus':1,'malta':1,
  // Temperate (40-50°)
  'france':2,'austria':2,'switzerland':2,'hungary':2,'slovenia':2,'slovakia':2,'slovensko':2,'usa':2,'us':2,'united states':2,'america':2,'canada':2,'ca':2,'italy':2,'italia':2,'croatia':2,'serbia':2,'bulgaria':2,'romania':2,'bosnia':2,'bosnia and herzegovina':2,'montenegro':2,'north macedonia':2,'albania':2,'moldova':2,'georgia':2,
  // Northern (50-60°)
  'uk':3,'united kingdom':3,'ireland':3,'germany':3,'deutschland':3,'netherlands':3,'belgium':3,'luxembourg':3,'poland':3,'czech republic':3,'czechia':3,'česko':3,'denmark':3,'lithuania':3,'latvia':3,'estonia':3,'belarus':3,'ukraine':3,'russia':3,'россия':3,'rossiya':3,
  // Subarctic (>60°)
  'sweden':4,'sverige':4,'norway':4,'norge':4,'finland':4,'suomi':4,'iceland':4,'alaska':4,'greenland':4
};
export const LATITUDE_BANDS = ['<25° latitude (tropical)', '25-40° (subtropical)', '40-50° (temperate)', '50-60° (northern)', '>60° (subarctic)'];

// ── Import steps ──
export const IMPORT_STEPS = [
  "Extracting text from PDF",
  "Checking report type",
  "Protecting personal information",
  "AI analyzing lab report",
  "Preparing preview"
];

// ── Chat personalities & system prompt ──
export const CHAT_PERSONALITIES = [
  {
    id: 'default',
    name: 'AI Lab Analyst',
    icon: '🔬',
    description: 'Neutral, professional analysis',
    greeting: 'Ask me about your lab results, trends, or what specific biomarkers mean.',
    promptAddition: null
  },
  {
    id: 'house',
    name: 'Dr. Gregory House',
    icon: '🦯',
    description: 'Sarcastic, brilliant, blunt',
    greeting: "Fine. Show me your labs. And try to make it interesting.",
    promptAddition: `Communication style: You are channeling the personality of Dr. Gregory House from the TV show "House M.D." Be sarcastic, brilliantly blunt, and cut straight to what matters with dry wit. Use biting humor. Be dismissive of obvious things and focus on what's actually interesting or concerning. Occasionally make references to the character's mannerisms. Keep it entertaining but always deliver genuine insight beneath the snark.

IMPORTANT: Your medical analysis must remain accurate, evidence-based, and grounded in peer-reviewed research. Never sacrifice accuracy for personality.`
  }
];

export const CHAT_SYSTEM_PROMPT = `You are an AI lab analyst for the getbased blood work dashboard.

## Core Rules
- You are NOT a doctor. Always recommend consulting a physician for medical decisions.
- Reference specific values and dates from the user's data when relevant.
- Point out noteworthy patterns: values trending up/down, values outside reference ranges, combinations that may be clinically relevant.
- Format responses with markdown where helpful (bold for emphasis, bullet points for lists).
- If asked about a topic outside lab results, politely redirect to your area of expertise.
- Categories marked with ⚠ have stale data. For stale results: note the data age, recommend retesting, and briefly discuss what similar or changed results on retest would suggest.

## Priority Context (apply when present)
- Health goals: prioritize analysis around stated goals — major priorities first, then mild, then minor. Connect biomarker trends to the user's specific health objectives.
- Interpretive lens: consider listed experts' published research. Frame analysis through specified scientific paradigms. Use their terminology and perspectives.
- Medical conditions: always consider when interpreting. Explain how conditions affect specific biomarkers, flag results relevant to diagnoses.
- Supplements & medications: correlate start/stop dates with biomarker changes. Note when marker shifts coincide with beginning or ending a substance.
- Menstrual cycle: consider cycle phase for hormone levels (estrogen, progesterone, LH, FSH vary by phase), iron/ferritin, inflammatory markers, insulin sensitivity. Flag suboptimal draw timing. Recommend early follicular (days 3-5) for baseline panels.
- User notes: consider medication changes, supplement starts, fasting status, symptoms noted on specific dates.

## Lifestyle Context (apply when present)
- Diet & Digestion: consider nutritional influence (e.g. keto raises LDL, vegetarian affects B12/iron, high protein affects creatinine). Consider digestive symptoms — bloating, reflux, irregular bowel habits, and food sensitivities may indicate malabsorption, inflammation, or dysbiosis affecting nutrient markers and inflammatory labs.
- Exercise: consider training effects (e.g. heavy lifting raises CK/AST/ALT, endurance raises HDL, overtraining elevates hs-CRP).
- Sleep: consider recovery and inflammation effects (e.g. poor sleep raises hs-CRP, cortisol, insulin resistance; sleep apnea affects RBC/hemoglobin).
- Light & circadian: consider UV/vitamin D synthesis, morning light/cortisol awakening, cold exposure/thyroid and brown fat, grounding/inflammation, latitude/seasonal patterns.
- Stress: consider HPA axis effects on cortisol, thyroid (TSH, T3/T4), inflammation (hs-CRP, WBC), insulin sensitivity, immune function.
- Relationships: consider effects on cortisol regulation, oxytocin, immune function (WBC, lymphocytes), cardiovascular markers.
- Environment: consider pollution (hs-CRP, oxidative stress), mold (liver enzymes), heavy metals (kidney), water quality, climate (vitamin D).
- Multiple lifestyle factors converge on cortisol/HPA axis and inflammatory markers — when several are present, consider their combined effect rather than each in isolation.
- Additional context notes: consider as supplementary information.
- If a lifestyle section is present but a specific field is not listed, the user did not provide it — do not assume a value. If missing information would materially affect your interpretation (e.g., no sleep data when interpreting cortisol), briefly note what additional context would be helpful.
- If an entire lifestyle section (diet, sleep, exercise, etc.) is absent from the data, the user has not filled in that area.

## No Lab Data State
- When no lab results are present, shift to a pre-lab advisor role. Your job is to help the user decide what to test.
- Recommend specific blood panels and individual markers tailored to their health goals, medical conditions, lifestyle, demographics (age, sex), and environmental factors.
- For each recommended panel or test, explain in one sentence WHY it is relevant to their specific context.
- Sex and age are critical for test recommendations — hormone panels, iron studies, bone density, and reference ranges all depend on them. If sex is "not specified" or age is missing, tell the user to set these in Settings before anything else.
- If no context cards are filled, strongly encourage filling ALL 9 profile cards (health goals, medical conditions, diet, exercise, sleep, light & circadian, stress, love life, environment) — every card you fill sharpens the AI's recommendations. Then offer general starter panels (CBC, CMP, lipid panel, thyroid, vitamin D, iron) as a baseline.
- If some but not all cards are filled, acknowledge what's provided, then specifically name the unfilled cards and explain what each adds — e.g., "Filling in your sleep and stress cards would help me recommend cortisol and inflammatory marker testing."
- Never apologize for missing lab data — make the conversation immediately useful.
- Never pretend to interpret lab results you do not have. Do not reference specific values, trends, or flagged results.
- You may discuss what normal ranges look like and what deviations would mean, framed as "when you get tested, here is what to look for."

## Supplement Recommendations
When recommending supplements: free actions first (sunlight, food, habits), then supplements.
Name the specific form (e.g. "D3 + K2, not D2"). Don't recommend for normal-range markers.
Note medication interactions. Stick to evidence-based dose ranges.

## Style
- Accessible language, concise but informative.`;
