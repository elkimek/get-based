// @ts-check
// nutrition-nutrient-registry.js — canonical meal nutrient field metadata.

const rows = [
  ['energyKcal', 'Energy', 'kcal', '1', 'core'],
  ['proteinG', 'Protein', 'g', '0.1', 'core'],
  ['carbohydrateG', 'Carbohydrate', 'g', '0.1', 'core'],
  ['fatG', 'Fat', 'g', '0.1', 'core'],
  ['fiberG', 'Fiber', 'g', '0.1', 'core'],
  ['sugarG', 'Sugar', 'g', '0.1', 'fats-sugars'],
  ['addedSugarG', 'Added sugar', 'g', '0.1', 'fats-sugars'],
  ['saturatedFatG', 'Saturated fat', 'g', '0.1', 'fats-sugars'],
  ['transFatG', 'Trans fat', 'g', '0.1', 'fats-sugars'],
  ['sodiumMg', 'Sodium', 'mg', '1', 'minerals'],
  ['potassiumMg', 'Potassium', 'mg', '1', 'minerals'],
  ['calciumMg', 'Calcium', 'mg', '1', 'minerals'],
  ['ironMg', 'Iron', 'mg', '0.1', 'minerals'],
  ['magnesiumMg', 'Magnesium', 'mg', '0.1', 'minerals'],
  ['zincMg', 'Zinc', 'mg', '0.1', 'minerals'],
  ['vitaminAMcgRae', 'Vitamin A', 'mcg RAE', '0.1', 'vitamins'],
  ['vitaminCMg', 'Vitamin C', 'mg', '0.1', 'vitamins'],
  ['vitaminDMcg', 'Vitamin D', 'mcg', '0.1', 'vitamins'],
  ['vitaminEMg', 'Vitamin E', 'mg', '0.1', 'vitamins'],
  ['vitaminKMcg', 'Vitamin K', 'mcg', '0.1', 'vitamins'],
  ['thiaminMg', 'Thiamin (B1)', 'mg', '0.01', 'vitamins'],
  ['riboflavinMg', 'Riboflavin (B2)', 'mg', '0.01', 'vitamins'],
  ['niacinMg', 'Niacin (B3)', 'mg', '0.1', 'vitamins'],
  ['vitaminB6Mg', 'Vitamin B6', 'mg', '0.01', 'vitamins'],
  ['folateMcgDfe', 'Folate', 'mcg DFE', '0.1', 'vitamins'],
  ['vitaminB12Mcg', 'Vitamin B12', 'mcg', '0.01', 'vitamins'],
  ['cholineMg', 'Choline', 'mg', '0.1', 'vitamins'],
  ['seleniumMcg', 'Selenium', 'mcg', '0.1', 'minerals'],
  ['cholesterolMg', 'Cholesterol', 'mg', '0.1', 'fats-sugars'],
  ['omega3G', 'Omega-3', 'g', '0.01', 'fats-sugars'],
  ['phosphorusMg', 'Phosphorus', 'mg', '0.1', 'minerals'],
  ['copperMg', 'Copper', 'mg', '0.01', 'minerals'],
  ['manganeseMg', 'Manganese', 'mg', '0.01', 'minerals'],
  ['waterG', 'Water content', 'g', '0.1', 'drinks'],
  ['fluidMl', 'Beverage volume', 'mL', '1', 'drinks'],
  ['plainWaterMl', 'Plain water', 'mL', '1', 'drinks'],
  ['caffeineMg', 'Caffeine', 'mg', '0.1', 'drinks'],
  ['alcoholG', 'Alcohol', 'g', '0.1', 'drinks'],
];

export const NUTRIENT_GROUPS = Object.freeze([
  Object.freeze({ id: 'core', label: 'Core' }),
  Object.freeze({ id: 'drinks', label: 'Drinks and hydration' }),
  Object.freeze({ id: 'fats-sugars', label: 'Fats and sugars' }),
  Object.freeze({ id: 'minerals', label: 'Minerals' }),
  Object.freeze({ id: 'vitamins', label: 'Vitamins and related' }),
]);

export const NUTRIENT_DEFINITIONS = Object.freeze(rows.map(([key, label, unit, step, group]) => Object.freeze({
  key, label, unit, step, group,
})));

export const NUTRITION_KEYS = Object.freeze(NUTRIENT_DEFINITIONS.map(field => field.key));

export function nutrientFieldsForGroup(group) {
  return NUTRIENT_DEFINITIONS.filter(field => field.group === group);
}
