// @ts-check
// demo-nutrition.js — rolling, synthetic meal histories for Demo Alex/Sarah.

const DEMO_NOTE = 'Synthetic demo meal. Illustrative AI estimates, not a real dietary record.';

function nutrients(energyKcal, proteinG, carbohydrateG, fatG, fiberG, detailed = {}) {
  const scale = Math.max(0.35, energyKcal / 650);
  // Keep every current nutrient slot demonstrable. These are
  // deliberately synthetic starting estimates and meal-specific values below
  // override them where the demo story calls for a more distinctive profile.
  const illustrativeDetails = {
    sugarG: round(11 * scale),
    addedSugarG: 0,
    saturatedFatG: round(4.5 * scale),
    transFatG: 0,
    cholesterolMg: 0,
    omega3G: round(0.6 * scale),
    sodiumMg: round(620 * scale, 0),
    potassiumMg: round(1100 * scale, 0),
    calciumMg: round(220 * scale, 0),
    ironMg: round(5.5 * scale),
    magnesiumMg: round(170 * scale, 0),
    zincMg: round(4.5 * scale),
    phosphorusMg: round(650 * scale, 0),
    copperMg: round(0.8 * scale),
    manganeseMg: round(1.8 * scale),
    seleniumMcg: round(42 * scale),
    vitaminAMcgRae: round(520 * scale, 0),
    vitaminCMg: round(55 * scale),
    vitaminDMcg: round(3 * scale),
    vitaminEMg: round(4.8 * scale),
    vitaminKMcg: round(140 * scale, 0),
    thiaminMg: round(0.55 * scale),
    riboflavinMg: round(0.65 * scale),
    niacinMg: round(8 * scale),
    vitaminB6Mg: round(0.8 * scale),
    folateMcgDfe: round(240 * scale, 0),
    vitaminB12Mcg: round(1.8 * scale),
    cholineMg: round(180 * scale, 0),
    waterG: round(210 * scale, 0),
  };
  return { energyKcal, proteinG, carbohydrateG, fatG, fiberG, ...illustrativeDetails, ...detailed };
}

const PROFILE_MEAL_NAMES = {
  male: `Mediterranean chicken quinoa bowl|Baked salmon, potatoes and green beans/Spinach mushroom omelet with rye toast|Lentil tomato soup with sourdough/Turkey avocado wholegrain wrap|High-protein yogurt cup|Beef vegetable stir-fry with brown rice/Tuna and white bean salad|Chickpea vegetable curry with basmati rice/Greek yogurt berries oats and walnuts|Roast chicken sweet potato and broccoli/Tofu soba edamame bowl|Shrimp tomato whole-wheat pasta/Chicken hummus vegetable plate|Three-bean turkey chili`,
  female: `Overnight oats berries and pumpkin seeds|Lentil beet and arugula salad|Salmon buckwheat and broccoli bowl/Tofu scramble spinach and rye toast|Turkey quinoa roasted pepper bowl|Beef spinach skillet with potatoes/Chia pudding with fortified oat drink|Chickpea tahini vegetable plate|Cod white bean and tomato stew/Pea protein berry shake|Chicken red lentil soup|Tofu rice noodles and bok choy/Eggs spinach toast and kiwi|Sardine potato green salad|Turkey meatballs polenta and kale/Buckwheat porridge pear and walnuts|Beef hummus vegetable wrap|Red lentil curry with brown rice/Egg and white bean breakfast plate|Salmon quinoa citrus salad`,
};

function mealTemplates(sex) {
  let mealIndex = 0;
  const templates = PROFILE_MEAL_NAMES[sex].split('/').flatMap((dayNames, day) => {
    const names = dayNames.split('|');
    return names.map((name, slot) => {
      const female = sex === 'female';
      const snack = !female && names.length === 3 && slot === 1;
      const type = female ? ['breakfast', 'lunch', 'dinner'][slot] : snack ? 'snack' : slot === 0 ? 'lunch' : 'dinner';
      const time = female ? [490, 760, 1140][slot] : snack ? 930 : slot === 0 ? 710 : 1160;
      const mealSlot = female ? slot : slot === 0 ? 0 : 1;
      const energyKcal = snack ? 190 : (female ? [500, 630, 700] : [700, 790])[mealSlot] + (day % 3) * 20;
      const proteinG = snack ? 24 : (female ? [25, 40, 46] : [48, 53])[mealSlot];
      const fatG = round(energyKcal * (snack ? 0.14 : 0.32) / 9);
      const carbohydrateG = round((energyKcal - proteinG * 4 - fatG * 9) / 4);
      const fiberG = snack ? 1 : round(energyKcal / 48);
      const detailed = {};
      if (female && [1, 3, 5, 7, 9, 11, 14, 16].includes(mealIndex)) detailed.ironMg = 8 + (mealIndex % 3) * 0.6;
      const label = /yogurt cup|protein berry shake/i.test(name)
        ? { servingSizeText: name.includes('shake') ? '1 bottle (420 mL)' : '1 cup (200 g)', consumedAmount: 1, consumedUnit: 'servings' }
        : null;
      mealIndex += 1;
      return {
        day, time, type, name, grams: round(energyKcal * 0.8, 0), items: [name],
        nutrients: nutrients(energyKcal, proteinG, carbohydrateG, fatG, fiberG, detailed),
        ...(label ? { kind: 'label', label } : {}),
      };
    });
  });
  templates.splice(sex === 'female' ? 3 : 2, 0, { day: 0, time: 930, type: 'drink', name: 'Still water', fluid: sex === 'female' ? 650 : 750 });
  return templates;
}

function round(value, places = 2) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function localDateDaysAgo(now, daysAgo) {
  const value = new Date(now);
  value.setHours(12, 0, 0, 0);
  value.setDate(value.getDate() - daysAgo);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function eatenAt(localDate, minutes, timezoneOffsetMinutes) {
  const [year, month, day] = localDate.split('-').map(Number);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return new Date(Date.UTC(year, month - 1, day, hour, minute) + timezoneOffsetMinutes * 60_000).toISOString();
}

function linkedComponents(names, grams, totals) {
  const componentNutrients = { ...totals };
  const nutrientsPer100g = Object.fromEntries(Object.entries(componentNutrients)
    .map(([key, value]) => [key, round((Number(value) * 100) / grams, 6)]));
  return [{ name: names[0], quantityG: grams, confidence: 0.82, nutrients: componentNutrients, nutrientsPer100g }];
}

function buildMeal(template, index, profile, now) {
  // Seed completed days only. A demo loaded in the morning must not contain a
  // lunch or dinner timestamp from later that same day.
  const localDate = localDateDaysAgo(now, template.day + 1);
  const timestamp = eatenAt(localDate, template.time, profile.timezoneOffsetMinutes);
  if (template.fluid) {
    return {
      id: `demo-${profile.id}-drink-${template.day}-${index}`,
      name: template.name,
      mealType: 'drink',
      eatenAt: timestamp,
      localDate,
      localTimeMinutes: template.time,
      timezoneOffsetMinutes: profile.timezoneOffsetMinutes,
      timeZone: profile.timeZone,
      note: DEMO_NOTE,
      nutrients: { fluidMl: template.fluid, plainWaterMl: template.fluid },
      components: [], images: [], reviewed: true,
      createdAt: timestamp, updatedAt: timestamp,
      source: { kind: 'manual-water', recordedAt: timestamp, demo: true },
    };
  }
  const sourceKind = template.kind === 'label' ? 'ai-label-scan' : 'ai-photo-estimate';
  const source = {
    kind: sourceKind,
    provider: 'demo',
    model: 'demo-v1',
    modelDisplay: 'Bundled demo estimate',
    analysisKind: sourceKind === 'ai-label-scan' ? 'nutrition-label' : 'meal-photo',
    analyzedAt: timestamp,
    demo: true,
    nutrientBasis: sourceKind === 'ai-label-scan' ? 'label-transcription' : 'model-estimated-from-food-identity-and-portions',
    review: { editedNutrients: [], editedComponentIdentities: [], reviewedAt: timestamp },
  };
  if (template.label) source.label = { ...template.label, labelBasis: 'per serving' };
  else source.aiNutritionEstimate = { version: 1, nutrientKeys: Object.keys(template.nutrients), estimatedAt: timestamp };
  return {
    id: `demo-${profile.id}-meal-${template.day}-${index}`,
    name: template.name,
    mealType: template.type,
    eatenAt: timestamp,
    localDate,
    localTimeMinutes: template.time,
    timezoneOffsetMinutes: profile.timezoneOffsetMinutes,
    timeZone: profile.timeZone,
    note: DEMO_NOTE,
    nutrients: { ...template.nutrients },
    components: linkedComponents(template.items, template.grams, template.nutrients),
    assumptions: [],
    warnings: ['Illustrative; review before use.'],
    confidence: 0.82,
    images: [], reviewed: true,
    createdAt: timestamp, updatedAt: timestamp,
    source,
    ...(index % 5 === 0 ? { responseCheckIn: { satiety2h: 3 } } : {}),
  };
}

const profiles = {
  male: {
    id: 'alex', timeZone: 'America/Denver', timezoneOffsetMinutes: 360,
    targets: { configured: true, energyKcal: 2400, proteinBasis: 'active', proteinGPerKg: 1.6, proteinFixedG: 130, carbohydrateG: 240, fatG: 80, fiberG: 35, fluidMl: 3000, sugarG: 55, sodiumMg: 2300, widgetNutrients: ['proteinG', 'fiberG', 'fluidMl', 'sodiumMg'] },
  },
  female: {
    id: 'sarah', timeZone: 'Europe/Prague', timezoneOffsetMinutes: -120,
    targets: { configured: true, energyKcal: 2100, proteinBasis: 'active', proteinGPerKg: 1.6, proteinFixedG: 105, carbohydrateG: 230, fatG: 70, fiberG: 30, fluidMl: 2400, sugarG: 45, sodiumMg: 2000, widgetNutrients: ['proteinG', 'fiberG', 'ironMg', 'fluidMl'] },
  },
};

export function addDemoNutrition(data, sex = 'male', { now = new Date() } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const profile = sex === 'female' ? profiles.female : profiles.male;
  const generatedAt = new Date(now).toISOString();
  data.nutrition = {
    version: 1,
    exportedAt: generatedAt,
    includesPhotos: false,
    meals: mealTemplates(sex === 'female' ? 'female' : 'male').map((meal, index) => buildMeal(meal, index, profile, now)),
  };
  data.nutritionTargets = { ...profile.targets, widgetNutrients: [...profile.targets.widgetNutrients] };
  data.nutritionContextDays = 30;
  data.contextSourceSettings = { ...(data.contextSourceSettings || {}), 'meals-nutrition': true };
  return data;
}

export { DEMO_NOTE };
