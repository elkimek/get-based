#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = path.resolve(process.argv[2] || '');
const outputPath = path.join(ROOT, 'data', 'nutrition', 'fndds-2021-2023.json');

if (!process.argv[2]) {
  throw new Error('Usage: node scripts/build-nutrition-food-pack.mjs /path/to/surveyDownload.json');
}

// USDA FoodData Central nutrient IDs. Values in FNDDS are expressed per 100 g.
// Keep this order stable: browser records use positional arrays to avoid
// repeating nutrient names thousands of times in the downloaded data pack.
const nutrientSpecs = Object.freeze([
  ['energyKcal', [1008]],
  ['proteinG', [1003]],
  ['carbohydrateG', [1005]],
  ['fatG', [1004]],
  ['fiberG', [1079]],
  ['sugarG', [2000]],
  ['saturatedFatG', [1258]],
  ['sodiumMg', [1093]],
  ['potassiumMg', [1092]],
  ['calciumMg', [1087]],
  ['ironMg', [1089]],
  ['magnesiumMg', [1090]],
  ['zincMg', [1095]],
  ['vitaminAMcgRae', [1106]],
  ['vitaminCMg', [1162]],
  ['vitaminDMcg', [1114]],
  ['vitaminEMg', [1109]],
  ['vitaminKMcg', [1185]],
  ['thiaminMg', [1165]],
  ['riboflavinMg', [1166]],
  ['niacinMg', [1167]],
  ['vitaminB6Mg', [1175]],
  ['folateMcgDfe', [1190]],
  ['vitaminB12Mcg', [1178]],
  ['cholineMg', [1180]],
  ['seleniumMcg', [1103]],
  ['cholesterolMg', [1253]],
  // FNDDS provides ALA/18:3, DHA, EPA, and DPA separately. Their sum is the
  // supported omega-3 total; a missing constituent remains unknown rather
  // than being silently treated as zero.
  ['omega3G', [1270, 1272, 1278, 1280]],
  ['phosphorusMg', [1091]],
  ['copperMg', [1098]],
  ['waterG', [1051]],
  ['caffeineMg', [1057]],
  ['alcoholG', [1018]],
]);

function compactNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 1_000_000) / 1_000_000 : null;
}

function nutrientValues(food) {
  const values = new Map((food?.foodNutrients || []).map(item => [Number(item?.nutrient?.id), compactNumber(item?.amount)]));
  return nutrientSpecs.map(([, ids]) => {
    const parts = ids.map(id => values.get(id));
    if (parts.some(value => value === null || value === undefined)) return null;
    return compactNumber(parts.reduce((sum, value) => sum + Number(value), 0));
  });
}

const source = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const foods = (Array.isArray(source?.SurveyFoods) ? source.SurveyFoods : [])
  .filter(food => food?.fdcId && food?.description && food?.foodNutrients?.length)
  .map(food => [
    Number(food.fdcId),
    String(food.foodCode || ''),
    String(food.description || '').replace(/\s+/g, ' ').trim(),
    nutrientValues(food),
  ]);

if (foods.length < 5_000) throw new Error(`Expected at least 5,000 FNDDS foods, found ${foods.length}`);

const pack = {
  schemaVersion: 1,
  source: {
    name: 'USDA FoodData Central',
    dataset: 'FNDDS 2021-2023',
    published: '2024-10-31',
    url: 'https://fdc.nal.usda.gov/',
  },
  nutrientKeys: nutrientSpecs.map(([key]) => key),
  foods,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(pack));
const bytes = Buffer.byteLength(JSON.stringify(pack));
console.log(`Wrote ${foods.length.toLocaleString()} foods (${(bytes / 1024).toFixed(1)} KiB) to ${path.relative(ROOT, outputPath)}`);
