import { expect, test } from './coverage-fixture.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axeScriptPath = require.resolve('axe-core/axe.min.js');

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZcL8AAAAASUVORK5CYII=',
  'base64',
);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-ai-paused', 'false');
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({
      accepted: true,
      termsVersion: '2026-08-22',
      privacyVersion: '2026-08-22',
      acceptedAt: '2026-08-23T00:00:00.000Z',
      appVersion: 'nutrition-module-test',
      location: 'nutrition-module-test',
    }));
  });
});

test('Venice meal analysis supports a correction-aware recalculation with visible progress', async ({ page }) => {
  const requestBodies = [];
  let releaseResponse;
  await page.route('https://api.venice.ai/api/v1/chat/completions', async route => {
    requestBodies.push(route.request().postDataJSON());
    if (requestBodies.length === 1) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: "output_config.format.schema: For 'anyOf', 'minimum' is not supported" },
        }),
      });
      return;
    }
    if (requestBodies.length === 2) await new Promise(resolve => { releaseResponse = resolve; });
    const isCorrection = requestBodies.length === 3;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              result: {
                meal_name: isCorrection ? 'Breaded fried Edam plate' : 'Chicken rice bowl',
                food_items: isCorrection ? [
                  { food: 'Breaded fried Edam cheese', estimated_weight_g: 180, confidence_score: 91, nutrition: { calories: 600, protein: 30, carbs: 20, total_fat: 40, fiber: 1 } },
                  { food: 'French fries', grams: 220, confidence: 0.84, nutrition: { calories: 400, protein: 7, carbs: 75, total_fat: 10, fiber: 8 } },
                  { food: 'Tartar sauce', grams: 45, confidence: 0.72, nutrition: { calories: 210, protein: 5, carbs: 17, total_fat: 6, fiber: 1 } },
                  { food: 'Beer', grams: 500, confidence: 0.95, nutrition: { calories: 0, protein: 0, carbs: 0, total_fat: 0, fiber: 0 } },
                ] : [
                  { food: 'Chicken breast', estimated_grams: '145 g', confidence_score: 82 },
                  { food: 'Rice', grams: 190, confidence: 0.76 },
                ],
                nutrition_totals: isCorrection
                  ? { calories: 1210, protein: 42, carbs: 112, total_fat: 56, sodium: 1640, alcohol: 20 }
                  : { calories: 640, protein: 48, carbs: 71, total_fat: 18, sodium: 720 },
                confidence_score: isCorrection ? 83 : 74,
                uncertainties: [isCorrection ? 'Cheese and frying oil quantities are estimated.' : 'Sauce quantity is partly hidden.'],
              },
            }),
          },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 120, completion_tokens: 80 },
      }),
    });
  });

  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const api = await import('/js/api.js');
    const keys = await import('/js/crypto-key-cache.js');
    keys.updateKeyCache('labcharts-openrouter-key', 'test-openrouter-key');
    keys.updateKeyCache('labcharts-venice-key', 'test-venice-key');
    localStorage.setItem('labcharts-openrouter-model', 'x-ai/grok-4.6');
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify([
      { id: 'x-ai/grok-4.6', name: 'Grok 4.6' },
      { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5' },
    ]));
    localStorage.setItem('labcharts-openrouter-vision-models', JSON.stringify([
      'x-ai/grok-4.6',
      'anthropic/claude-opus-5',
    ]));
    localStorage.setItem('labcharts-venice-models', JSON.stringify([
      { id: 'claude-opus-4.8', name: 'Claude Opus 4.8' },
    ]));
    localStorage.setItem('labcharts-venice-e2ee-models', '[]');
    localStorage.setItem('labcharts-venice-vision-models', JSON.stringify(['claude-opus-4.8']));
    localStorage.setItem('labcharts-venice-pricing', JSON.stringify({
      'claude-opus-4.8': { input: 6, output: 30 },
    }));
    api.setAIProvider('venice');
    (await import('/js/nutrition-ai-settings.js')).setNutritionAIRoute({
      provider: 'venice',
      model: 'claude-opus-4.8',
    });
    await (await import('/js/nutrition.js')).openNutritionEditor();
  });

  await expect(page.locator('.nutrition-modal-head h3')).toHaveText('Log a meal');
  await expect(page.locator('.nutrition-modal-head p')).toHaveText('Use a photo, scan a label, or enter values manually.');
  await expect(page.locator('.nutrition-capture-tabs [role="tab"]')).toHaveCount(3);
  await expect(page.getByRole('tab', { name: 'Manual' })).toBeVisible();
  await expect(page.locator('.nutrition-review-heading')).toHaveText('Review meal');
  await expect(page.locator('#nutrition-privacy-line')).toContainText('originals are not saved');
  await expect(page.locator('#detail-modal')).not.toContainText('Editable review');
  await expect(page.locator('#detail-modal')).not.toContainText('Check the estimate before saving');
  await page.locator('#nutrition-known-details').fill('Fried Edam cheese; the beer was not consumed.');
  await page.locator('#nutrition-photo-input').setInputFiles([
    { name: 'meal-wide.png', mimeType: 'image/png', buffer: TINY_PNG },
    { name: 'meal-side.png', mimeType: 'image/png', buffer: TINY_PNG },
  ]);
  await page.locator('#nutrition-analyze-btn').click();
  await expect(page.locator('#cloud-ai-consent-overlay')).toBeVisible();
  await page.locator('#cloud-ai-consent-checkbox').check();
  await page.locator('[data-cloud-ai-consent-action="approve"]').click();

  await expect.poll(() => typeof releaseResponse).toBe('function');
  await expect(page.locator('#nutrition-analysis-progress')).toBeVisible();
  await expect(page.locator('#nutrition-analysis-progress')).toContainText('Waiting for Claude Opus 4.8');
  await expect(page.getByRole('button', { name: 'Cancel analysis' })).toBeVisible();
  await expect(page.locator('.nutrition-analysis-progress-track')).toHaveAttribute('aria-valuenow', /^(5[8-9]|[6-7]\d|8[0-2])$/);
  await page.locator('#modal-overlay').click({ position: { x: 2, y: 2 } });
  await expect(page.locator('#modal-overlay')).toBeHidden();
  releaseResponse();
  await page.evaluate(async () => (await import('/js/nutrition.js')).openNutritionEditor());
  await expect(page.locator('#modal-overlay')).toBeVisible();

  await expect(page.locator('#nutrition-meal-name')).toHaveValue('Chicken rice bowl');
  await expect(page.locator('#nutrition-energyKcal')).toHaveValue('640');
  await expect(page.locator('#nutrition-proteinG')).toHaveValue('48');
  await expect(page.locator('#nutrition-carbohydrateG')).toHaveValue('71');
  await expect(page.locator('#nutrition-fuel-preview')).toBeVisible();
  await expect(page.locator('#nutrition-fuel-preview')).toContainText('Carb/fat composition');
  await expect(page.locator('#nutrition-fuel-preview')).toContainText('64%');
  await expect(page.locator('#nutrition-fuel-preview')).toContainText('36%');
  await expect(page.locator('#nutrition-fuel-preview')).not.toContainText('optimum');
  await expect(page.locator('#nutrition-fuel-preview')).not.toContainText('/100');
  await expect(page.locator('[data-nutrition-component-name="0"]')).toHaveValue('Chicken breast');
  await expect(page.locator('[data-nutrition-component-grams="0"]')).toHaveValue('145');
  await expect(page.locator('.nutrition-component-columns')).toContainText('Ingredient');
  await expect(page.locator('.nutrition-component-columns')).toContainText('Amount');
  await expect(page.locator('.nutrition-component-columns')).toContainText('Check');
  await expect(page.locator('#nutrition-save-requirement')).toHaveText('Choose a meal occasion to save.');
  await expect(page.locator('#nutrition-analysis-status')).toContainText('Estimate ready');
  await expect(page.locator('#nutrition-review-evidence')).toContainText('Claude Opus 4.8 · $0.0031 · 200 tokens (120 in · 80 out)');
  await expect(page.locator('#nutrition-review-checks')).toContainText('Assumptions and uncertainties');
  await page.locator('#nutrition-meal-type').selectOption('lunch');
  await expect(page.locator('#nutrition-save-btn')).toBeEnabled();
  await page.locator('[data-nutrition-component-grams="0"]').fill('150');
  await page.locator('[data-nutrition-component-grams="0"]').blur();
  await expect(page.locator('#nutrition-energyKcal')).toHaveValue('640');
  await expect(page.locator('#nutrition-proteinG')).toHaveValue('48');
  await expect(page.locator('#nutrition-analysis-status')).toContainText('no linked nutrient profile');
  await expect(page.locator('#nutrition-correction-review')).toContainText('An ingredient amount changed without linked nutrient data.');
  await expect(page.locator('#nutrition-save-requirement')).toHaveText('Recalculate after changing an unlinked ingredient amount.');
  await expect(page.locator('#nutrition-save-btn')).toBeDisabled();
  await expect(page.locator('#nutrition-recalculate-btn')).toBeEnabled();
  await page.locator('[data-nutrition-component-grams="0"]').fill('145');
  await page.locator('[data-nutrition-component-grams="0"]').blur();
  await expect(page.locator('#nutrition-recalculate-btn')).toBeDisabled();
  await expect(page.locator('#nutrition-save-btn')).toBeEnabled();
  await page.locator('#nutrition-meal-type').selectOption('');
  await page.locator('#detail-modal .modal-close').click();
  await expect(page.locator('#confirm-dialog-overlay')).toBeVisible();
  await expect(page.locator('#confirm-dialog-overlay')).toContainText('Discard this unsaved meal draft?');
  await page.locator('#confirm-cancel').click();
  await expect(page.locator('#nutrition-meal-name')).toHaveValue('Chicken rice bowl');
  expect(requestBodies).toHaveLength(2);
  expect(requestBodies[0].model).toBe('claude-opus-4.8');
  expect(requestBodies[0].temperature).toBe(0);
  expect(requestBodies[0].response_format?.type).toBe('json_schema');
  expect(JSON.stringify(requestBodies[0].messages)).toContain('Fried Edam cheese; the beer was not consumed.');
  expect(requestBodies[0].messages[0].content.filter(item => item.type === 'image_url')).toHaveLength(2);
  expect(requestBodies[1]).not.toHaveProperty('response_format');

  const firstIngredient = page.locator('[data-nutrition-component-name="0"]');
  await firstIngredient.fill('Chicken breas');
  await expect(page.locator('#nutrition-correction-review')).toContainText('Estimate needs recalculation.');
  await firstIngredient.fill('Chicken breast');
  await expect(page.locator('#nutrition-correction-review')).not.toContainText('Estimate needs recalculation.');
  await expect(page.locator('#nutrition-recalculate-btn')).toBeDisabled();
  expect(requestBodies).toHaveLength(2);

  const correctedName = 'Fried Edam cheese with fries, tartar sauce, and beer';
  await expect(page.locator('#nutrition-correction-review')).toBeVisible();
  await expect(page.locator('#nutrition-recalculate-btn')).toBeDisabled();
  await page.locator('[data-nutrition-component-name="0"]').fill('Breaded fried Edam cheese');
  await page.locator('#nutrition-meal-name').fill(correctedName);
  await expect(page.locator('#nutrition-correction-review')).toContainText('Ingredient list changed.');
  await expect(page.locator('#nutrition-correction-review')).toContainText('Meal name changed from “Chicken rice bowl”');
  await expect(page.locator('#nutrition-save-btn')).toBeDisabled();
  await expect(page.locator('#nutrition-analyze-btn')).toBeDisabled();
  await expect(page.locator('#nutrition-recalculate-btn')).toBeEnabled();
  await page.locator('#nutrition-recalculate-btn').click();

  await expect(page.locator('#nutrition-meal-name')).toHaveValue(correctedName);
  await expect(page.locator('#nutrition-energyKcal')).toHaveValue('1210');
  await expect(page.locator('[data-nutrition-component-name="0"]')).toHaveValue('Breaded fried Edam cheese');
  await expect(page.locator('[data-nutrition-component-grams="0"]')).toHaveValue('180');
  await expect(page.locator('#nutrition-analysis-status')).toContainText('Recalculated estimate');
  await expect(page.locator('#nutrition-save-btn')).toBeDisabled();
  expect(requestBodies).toHaveLength(3);
  expect(requestBodies[2].temperature).toBe(0);
  expect(requestBodies[2].response_format?.type).toBe('json_schema');
  expect(JSON.stringify(requestBodies[2].messages)).toContain(correctedName);
  expect(JSON.stringify(requestBodies[2].messages)).toContain('User-reviewed ingredients and portions: Breaded fried Edam cheese (145 g)');
  expect(JSON.stringify(requestBodies[2].messages)).toContain('from scratch');

  await page.locator('#nutrition-meal-type').selectOption('dinner');
  await expect(page.locator('#nutrition-save-btn')).toBeEnabled();
  await page.locator('[data-nutrition-component-grams="0"]').fill('200');
  await page.locator('[data-nutrition-component-grams="0"]').blur();
  await expect(page.locator('#nutrition-energyKcal')).toHaveValue('1276.67');
  await expect(page.locator('#nutrition-proteinG')).toHaveValue('45.33');
  await expect(page.locator('#nutrition-carbohydrateG')).toHaveValue('114.22');
  await expect(page.locator('#nutrition-fatG')).toHaveValue('60.44');
  await expect(page.locator('#nutrition-save-btn')).toBeEnabled();
  await page.locator('[data-nutrition-component-grams="0"]').fill('150');
  await page.locator('[data-nutrition-component-grams="0"]').blur();
  await expect(page.locator('#nutrition-energyKcal')).toHaveValue('1110');
  await expect(page.locator('#nutrition-proteinG')).toHaveValue('37');
  await expect(page.locator('#nutrition-carbohydrateG')).toHaveValue('108.67');
  await expect(page.locator('#nutrition-fatG')).toHaveValue('49.33');
  await page.locator('[data-nutrition-component-grams="0"]').fill('180');
  await page.locator('[data-nutrition-component-grams="0"]').blur();
  await expect(page.locator('#nutrition-energyKcal')).toHaveValue('1210');
  await expect(page.locator('#nutrition-proteinG')).toHaveValue('42');
  await expect(page.locator('#nutrition-analysis-status')).toContainText('Linked nutrients recalculated');
  await page.locator('#nutrition-save-btn').click();
  await expect(page.locator('#detail-modal')).toContainText(correctedName);
  await expect(page.locator('#detail-modal')).toContainText('Dinner');
  await expect(page.locator('#detail-modal')).toContainText('Identification corrected');
  await expect(page.locator('#detail-modal')).toContainText('AI request usage');
  await expect(page.locator('#detail-modal')).toContainText('Claude Opus 4.8 · $0.0031 · 200 tokens');
  await expect(page.locator('#detail-modal .nutrition-fuel-card')).toBeVisible();
  await expect(page.locator('#detail-modal .nutrition-fuel-card')).toContainText('About this estimate');
  await expect(page.locator('#detail-modal .nutrition-fuel-card')).toContainText('do not measure Randle-cycle activity');
  await expect(page.locator('.nutrition-detail-gallery img')).toHaveCount(2);
  const savedImages = await page.evaluate(async () => {
    const meals = await (await import('/js/nutrition-store.js')).listActiveProfileMeals();
    return meals.find(meal => meal.name === 'Fried Edam cheese with fries, tartar sauce, and beer')?.images || [];
  });
  expect(savedImages).toHaveLength(2);
  expect(savedImages.every(image => image.thumbnailUrl
    && !image.dataUrl && !image.base64 && !image.analysisImage)).toBe(true);
  const savedMealLayout = await page.locator('.nutrition-detail-layout').evaluate(element => {
    const gallery = element.querySelector('.nutrition-detail-gallery')?.getBoundingClientRect();
    const overview = element.querySelector('.nutrition-detail-overview')?.getBoundingClientRect();
    const content = element.querySelector('.nutrition-detail-content-grid')?.getBoundingClientRect();
    return { galleryAboveOverview: !!gallery && !!overview && gallery.bottom <= overview.top + 1, contentBelowOverview: !!overview && !!content && overview.bottom <= content.top + 1 };
  });
  expect(savedMealLayout).toEqual({ galleryAboveOverview: true, contentBelowOverview: true });
});

test('a slow meal analysis can be canceled without refreshing the editor', async ({ page }) => {
  let releaseResponse;
  await page.route('https://api.venice.ai/api/v1/chat/completions', async route => {
    await new Promise(resolve => { releaseResponse = resolve; });
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] }),
      });
    } catch {
      // The browser request is expected to be gone after AbortController fires.
    }
  });

  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const api = await import('/js/api.js');
    const keys = await import('/js/crypto-key-cache.js');
    keys.updateKeyCache('labcharts-venice-key', 'test-venice-key');
    localStorage.setItem('labcharts-venice-models', JSON.stringify([{ id: 'slow-vision', name: 'Slow Vision' }]));
    localStorage.setItem('labcharts-venice-e2ee-models', '[]');
    localStorage.setItem('labcharts-venice-vision-models', JSON.stringify(['slow-vision']));
    api.setAIProvider('venice');
    (await import('/js/nutrition-ai-settings.js')).setNutritionAIRoute({ provider: 'venice', model: 'slow-vision' });
    await (await import('/js/nutrition.js')).openNutritionEditor();
  });
  await page.locator('#nutrition-photo-input').setInputFiles({ name: 'slow-meal.png', mimeType: 'image/png', buffer: TINY_PNG });
  await page.locator('#nutrition-analyze-btn').click();
  await page.locator('#cloud-ai-consent-checkbox').check();
  await page.locator('[data-cloud-ai-consent-action="approve"]').click();
  await expect.poll(() => typeof releaseResponse).toBe('function');

  await page.getByRole('button', { name: 'Cancel analysis' }).click();
  await expect(page.locator('#nutrition-analysis-status')).toContainText('Analysis canceled');
  await expect(page.locator('#nutrition-analysis-progress')).toContainText('Analysis stopped');
  await expect(page.locator('#nutrition-analyze-btn')).toBeEnabled();
  await expect(page.locator('#nutrition-meal-name')).toHaveValue('');
  releaseResponse();
});

test('fresh photo analysis keeps complete nutrient profiles model-owned', async ({ page }) => {
  await page.route('https://api.venice.ai/api/v1/chat/completions', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              mealName: 'Grilled chicken and rice',
              components: [
                {
                  name: 'Chicken breast, grilled without sauce, skin not eaten',
                  quantityG: 150,
                  confidence: 0.9,
                  nutrients: { energyKcal: 264, proteinG: 44.4, carbohydrateG: 0, fatG: 8.18, fiberG: 0, sodiumMg: 111, potassiumMg: 384, vitaminDMcg: 1 },
                },
                {
                  name: 'Rice, white, cooked, as ingredient',
                  quantityG: 180,
                  confidence: 0.86,
                  nutrients: { energyKcal: 234, proteinG: 4.57, carbohydrateG: 52.2, fatG: 0.67, fiberG: 0, sodiumMg: 2, potassiumMg: 216, vitaminDMcg: 0 },
                },
              ],
              nutrients: { energyKcal: 498, proteinG: 48.97, carbohydrateG: 52.2, fatG: 8.85, fiberG: 0, sodiumMg: 113, potassiumMg: 600, calciumMg: 30, ironMg: 2.9, magnesiumMg: 61.8, vitaminDMcg: 1, vitaminB12Mcg: 0.5 },
              confidence: 0.86,
              assumptions: [], warnings: [], label: null,
            }),
          },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 100, completion_tokens: 60 },
      }),
    });
  });

  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const api = await import('/js/api.js');
    const keys = await import('/js/crypto-key-cache.js');
    keys.updateKeyCache('labcharts-venice-key', 'test-venice-key');
    localStorage.setItem('labcharts-venice-models', JSON.stringify([{ id: 'claude-opus-4.8', name: 'Claude Opus 4.8' }]));
    localStorage.setItem('labcharts-venice-e2ee-models', '[]');
    localStorage.setItem('labcharts-venice-vision-models', JSON.stringify(['claude-opus-4.8']));
    api.setAIProvider('venice');
    (await import('/js/nutrition-ai-settings.js')).setNutritionAIRoute({ provider: 'venice', model: 'claude-opus-4.8' });
    await (await import('/js/nutrition.js')).openNutritionEditor();
  });

  await expect(page.locator('.nutrition-review-section-title')).toContainText('Energy & macros');
  await page.locator('#nutrition-photo-input').setInputFiles({
    name: 'chicken-rice.png', mimeType: 'image/png', buffer: TINY_PNG,
  });
  await page.locator('#nutrition-analyze-btn').click();
  await page.locator('#cloud-ai-consent-checkbox').check();
  await page.locator('[data-cloud-ai-consent-action="approve"]').click();

  await expect(page.locator('#nutrition-analysis-status')).toContainText('Estimate ready');
  await expect(page.locator('#nutrition-review-evidence')).toContainText('model-estimated nutrients');
  await expect(page.locator('[data-nutrition-food-match]')).toHaveCount(0);
  await expect(page.locator('.nutrition-component-food-data')).toHaveCount(0);

  await page.locator('.nutrition-more-nutrients summary').click();
  await expect(page.locator('.nutrition-more-nutrients')).toContainText('Detailed nutrition');
  await expect(page.locator('.nutrition-more-nutrients')).toContainText('Minerals');
  await expect(page.locator('.nutrition-more-nutrients')).toContainText('Vitamins and related');
  await expect(page.locator('#nutrition-zincMg')).toBeVisible();
  await expect(page.locator('#nutrition-vitaminB12Mcg')).toBeVisible();
  await expect(page.locator('#nutrition-phosphorusMg')).toBeVisible();
  await expect(page.locator('#nutrition-caffeineMg')).toBeVisible();
  await expect(page.locator('#nutrition-nutrient-estimate-summary')).toContainText('estimated by Claude Opus 4.8');
  await expect(page.locator('#nutrition-sodiumMg')).toHaveValue('113');
  await expect(page.locator('#nutrition-sodiumMg-source')).toContainText('AI estimate');
  await expect(page.locator('#nutrition-potassiumMg')).toHaveValue('600');
  await expect(page.locator('#nutrition-calciumMg')).toHaveValue('30');
  await expect(page.locator('#nutrition-ironMg')).toHaveValue('2.9');
  await expect(page.locator('#nutrition-magnesiumMg')).toHaveValue('61.8');

  await page.locator('[data-nutrition-component-grams="0"]').fill('200');
  await page.locator('[data-nutrition-component-grams="0"]').blur();
  await expect(page.locator('#nutrition-energyKcal')).toHaveValue('586');
  await expect(page.locator('#nutrition-sodiumMg')).toHaveValue('150');
  await expect(page.locator('#nutrition-potassiumMg')).toHaveValue('728');
  await expect(page.locator('#nutrition-analysis-status')).toContainText('Linked nutrients recalculated');

  await page.locator('#nutrition-meal-type').selectOption('lunch');
  await page.locator('#nutrition-save-btn').click();
  await expect(page.locator('#detail-modal')).not.toContainText('FNDDS');
  const saved = await page.evaluate(async () => {
    const meals = await (await import('/js/nutrition-store.js')).listActiveProfileMeals();
    const meal = meals.find(item => item.name === 'Grilled chicken and rice');
    return {
      sodiumMg: meal?.nutrients?.sodiumMg,
      nutrientBasis: meal?.source?.nutrientBasis,
      hasFoodComposition: !!meal?.source?.foodComposition,
      hasDatabaseCandidates: meal?.components?.some(component => component.foodDataCandidates || component.foodData),
    };
  });
  expect(saved).toEqual({
    sodiumMg: 150,
    nutrientBasis: 'model-estimated-from-food-identity-and-portions',
    hasFoodComposition: false,
    hasDatabaseCandidates: false,
  });
});

test('Debug mode compares meal models against local reference data and can use the closest estimate', async ({ page }) => {
  const requestedModels = [];
  let geminiAttempts = 0;
  let activeRequests = 0;
  let peakConcurrentRequests = 0;
  await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
    const body = route.request().postDataJSON();
    requestedModels.push(body.model);
    activeRequests += 1;
    peakConcurrentRequests = Math.max(peakConcurrentRequests, activeRequests);
    await new Promise(resolve => setTimeout(resolve, 45));
    try {
      if (body.model === 'google/gemini-3.7-flash' && ++geminiAttempts === 1) {
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Rate limit reached for Gemini 3.7 Flash' } }),
        });
        return;
      }
      const close = body.model === 'openai/gpt-5.6-sol';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                mealName: close ? 'Fried Edam cheese with fries and tartar sauce' : 'Fish and chips with beer',
                components: close ? [
                  { name: 'Breaded Edam cheese', quantityG: 180, confidence: 0.74 },
                  { name: 'French fries', quantityG: 220, confidence: 0.8 },
                  { name: 'Tartar sauce', quantityG: 45, confidence: 0.65 },
                ] : [
                  { name: 'Fried cod', quantityG: 260, confidence: 0.98 },
                  { name: 'French fries', quantityG: 310, confidence: 0.98 },
                  { name: 'Beer', quantityG: 500, confidence: 0.99 },
                  { name: 'House-made lemon and caper tartar sauce', quantityG: 55, confidence: 0.91 },
                  { name: 'Fresh parsley garnish with lemon zest', quantityG: 8, confidence: 0.84 },
                  { name: 'Malted vinegar and sea salt seasoning', quantityG: 6, confidence: 0.88 },
                ],
                nutrients: close
                  ? {
                      energyKcal: 1100, proteinG: 40, carbohydrateG: 101, fatG: 60,
                      sugarG: 6, saturatedFatG: 18, sodiumMg: 1350,
                      potassiumMg: 900, calciumMg: 750, vitaminCMg: 12,
                    }
                  : {
                      energyKcal: 1690, proteinG: 62, carbohydrateG: 178, fatG: 78,
                      sugarG: 25, saturatedFatG: 12, sodiumMg: 2200,
                      potassiumMg: 1400, calciumMg: 200, vitaminCMg: 4,
                    },
                confidence: close ? 0.71 : 0.98,
                assumptions: [], warnings: [], label: null,
              }),
            },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        }),
      });
    } finally {
      activeRequests -= 1;
    }
  });

  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const api = await import('/js/api.js');
    const keys = await import('/js/crypto-key-cache.js');
    keys.updateKeyCache('labcharts-openrouter-key', 'test-openrouter-key');
    keys.updateKeyCache('labcharts-venice-key', 'test-venice-key');
    localStorage.setItem('labcharts-debug', 'true');
    localStorage.setItem('labcharts-openrouter-model', 'openai/gpt-5.6-sol');
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify([
      { id: 'openai/gpt-5.6-sol', name: 'Meal Close' },
      { id: 'anthropic/claude-opus-5', name: 'Meal Confident' },
      { id: 'anthropic/claude-sonnet-5', name: 'Vision Sonnet' },
      { id: 'anthropic/claude-opus-4.8', name: 'Legacy Opus' },
      { id: 'google/gemini-3.5-flash', name: 'Vision Gemini' },
      { id: 'google/gemini-3.7-flash', name: 'Vision Gemini 3.7' },
      { id: 'z-ai/glm-5.2', name: 'Text-only GLM 5.2' },
      { id: 'z-ai/glm-5.3', name: 'Text-only GLM 5.3' },
      { id: 'moonshotai/kimi-k3', name: 'Vision Kimi' },
      { id: 'x-ai/grok-4.6', name: 'Vision Grok' },
    ]));
    localStorage.setItem('labcharts-openrouter-vision-models', JSON.stringify([
      'openai/gpt-5.6-sol', 'anthropic/claude-opus-5', 'anthropic/claude-opus-4.8',
      'google/gemini-3.5-flash', 'google/gemini-3.7-flash', 'moonshotai/kimi-k3', 'x-ai/grok-4.6',
    ]));
    localStorage.setItem('labcharts-openrouter-pricing', JSON.stringify({
      'openai/gpt-5.6-sol': { input: 4, output: 20 },
      'anthropic/claude-opus-5': { input: 5, output: 25 },
      'google/gemini-3.7-flash': { input: 0.5, output: 2 },
    }));
    localStorage.setItem('labcharts-venice-models', JSON.stringify([
      { id: 'gemini-3-5-flash', name: 'Venice Vision' },
    ]));
    localStorage.setItem('labcharts-venice-e2ee-models', '[]');
    localStorage.setItem('labcharts-venice-vision-models', JSON.stringify(['gemini-3-5-flash']));
    api.setAIProvider('openrouter');
    await (await import('/js/nutrition.js')).openNutritionEditor();
  });

  await expect(page.locator('.nutrition-compare-launch')).toBeVisible();
  await expect(page.locator('.nutrition-compare-launch')).toContainText('Open benchmark');
  await expect(page.locator('#nutrition-meal-model-control [data-nutrition-action="toggle-comparison"]')).toHaveCount(0);
  await page.locator('[data-nutrition-action="toggle-comparison"]').first().click();
  await expect(page.locator('#detail-modal')).toHaveClass(/nutrition-benchmark-modal/);
  await expect(page.locator('#nutrition-photo-input')).toHaveCount(0);
  await expect(page.locator('.nutrition-benchmark-photo-picker')).toBeVisible();
  await expect(page.locator('#nutrition-benchmark-photo-input')).toHaveCount(1);
  await expect(page.locator('#nutrition-run-comparison')).toBeDisabled();
  await page.locator('#nutrition-benchmark-photo-input').setInputFiles({ name: 'fried-cheese.png', mimeType: 'image/png', buffer: TINY_PNG });
  await expect(page.locator('#nutrition-benchmark-photo-status')).toContainText('Log meal remains unchanged');
  await expect(page.locator('#nutrition-run-comparison')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Log meal' })).toBeVisible();
  await expect(page.locator('#nutrition-model-comparison')).toBeVisible();
  await expect(page.locator('.nutrition-comparison-head')).toContainText('Each model receives the same photos.');
  await expect(page.locator('.nutrition-comparison-pace')).toHaveCount(0);
  await expect(page.locator('#nutrition-model-comparison')).toContainText('Selected models run together.');
  await page.getByRole('button', { name: 'Log meal' }).click();
  await expect(page.locator('#detail-modal')).not.toHaveClass(/nutrition-benchmark-modal/);
  expect(await page.locator('#nutrition-photo-input').evaluate(input => input.files.length)).toBe(0);
  await expect(page.locator('#nutrition-analyze-btn')).toBeDisabled();
  await page.locator('[data-nutrition-action="toggle-comparison"]').first().click();
  await expect(page.locator('#detail-modal')).toHaveClass(/nutrition-benchmark-modal/);
  await expect(page.locator('#nutrition-benchmark-photo-status')).toContainText('benchmark view ready');
  await expect(page.locator('#nutrition-run-comparison')).toBeEnabled();
  await expect(page.locator('#nutrition-model-comparison')).not.toContainText('Auto-active');
  await expect(page.locator('[data-nutrition-comparison-model]')).toHaveCount(6);
  await expect(page.locator('.nutrition-comparison-models')).toContainText('Venice Vision');
  await expect(page.locator('.nutrition-comparison-models')).toContainText('Vision Gemini 3.7');
  await expect(page.locator('.nutrition-comparison-models').getByText('Vision Gemini', { exact: true })).toHaveCount(0);
  await expect(page.locator('.nutrition-comparison-models')).not.toContainText('Text-only GLM');
  await expect(page.locator('.nutrition-comparison-models')).not.toContainText('Vision Sonnet');
  await expect(page.locator('.nutrition-comparison-models')).not.toContainText('Legacy Opus');
  const modelSearch = page.locator('[data-nutrition-comparison-search]');
  await expect(modelSearch).toHaveAttribute('placeholder', 'Provider, model name, or ID');
  await modelSearch.fill('venice');
  await expect(page.locator('.nutrition-comparison-model:visible')).toHaveCount(1);
  await expect(page.locator('.nutrition-comparison-model:visible')).toContainText('Venice Vision');
  await expect(page.locator('[data-nutrition-comparison-model]:checked')).toHaveCount(2);
  await page.evaluate(async () => (await import('/js/nutrition-comparison-ui.js')).refreshComparisonModelPicker());
  await expect(page.locator('[data-nutrition-comparison-search]')).toHaveValue('venice');
  await expect(page.locator('.nutrition-comparison-model:visible')).toHaveCount(1);
  await page.locator('[data-nutrition-comparison-search]').fill('openrouter anthropic/claude-opus-5');
  await expect(page.locator('.nutrition-comparison-model:visible')).toHaveCount(1);
  await expect(page.locator('.nutrition-comparison-model:visible')).toContainText('Meal Confident');
  await page.locator('[data-nutrition-comparison-search]').fill('model-that-does-not-exist');
  await expect(page.locator('.nutrition-comparison-model:visible')).toHaveCount(0);
  await expect(page.locator('[data-nutrition-comparison-search-empty]')).toBeVisible();
  await page.locator('[data-nutrition-comparison-search]').fill('');
  await expect(page.locator('.nutrition-comparison-model:visible')).toHaveCount(6);
  await expect(page.locator('[data-nutrition-comparison-search-status]')).toHaveText('6 available');
  const geminiChoice = page.locator('.nutrition-comparison-model').filter({ hasText: 'Vision Gemini 3.7' });
  const confidentChoice = page.locator('.nutrition-comparison-model').filter({ hasText: 'Meal Confident' });
  const veniceChoice = page.locator('.nutrition-comparison-model').filter({ hasText: 'Venice Vision' });
  const kimiChoice = page.locator('.nutrition-comparison-model').filter({ hasText: 'Vision Kimi' });
  await expect(veniceChoice.locator('input')).toBeChecked();
  await veniceChoice.locator('input').setChecked(false);
  await geminiChoice.locator('input').setChecked(false);
  await confidentChoice.locator('input').setChecked(true);
  await expect(page.locator('[data-nutrition-comparison-model]:checked')).toHaveCount(2);
  const modelList = page.locator('.nutrition-comparison-models');
  await expect(confidentChoice).toHaveClass(/is-selected/);
  await expect(geminiChoice).not.toHaveClass(/is-selected/);
  const selectedBeforeRoundTrip = await page.locator('[data-nutrition-comparison-model]:checked').evaluateAll(inputs => inputs.map(input => input.value).sort());
  await page.getByRole('button', { name: 'Log meal' }).click();
  await page.locator('[data-nutrition-action="toggle-comparison"]').first().click();
  await expect.poll(() => page.locator('[data-nutrition-comparison-model]:checked').evaluateAll(inputs => inputs.map(input => input.value).sort())).toEqual(selectedBeforeRoundTrip);
  await expect(page.locator('#nutrition-benchmark-photo-status')).toContainText('benchmark view ready');
  const pickerLayout = await modelList.evaluate(element => {
    const cards = Array.from(element.querySelectorAll('.nutrition-comparison-model'));
    const first = cards[0]?.getBoundingClientRect();
    const second = cards[1]?.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { display: style.display, overflowY: style.overflowY, firstRowHasMultipleCards: !!first && !!second && Math.abs(first.top - second.top) < 2, hasInternalScroll: element.scrollHeight > element.clientHeight + 1 };
  });
  expect(pickerLayout).toEqual({ display: 'grid', overflowY: 'visible', firstRowHasMultipleCards: true, hasInternalScroll: false });
  await modelList.hover();
  const modalBeforeWheel = await page.locator('#detail-modal').evaluate(element => ({
    scrollTop: element.scrollTop,
    canScrollDown: element.scrollTop + element.clientHeight < element.scrollHeight - 1,
  }));
  await page.mouse.wheel(0, modalBeforeWheel.canScrollDown ? 420 : -420);
  await expect.poll(() => page.locator('#detail-modal').evaluate(element => element.scrollTop)).not.toBe(modalBeforeWheel.scrollTop);
  const knownValues = page.locator('.nutrition-comparison-known-values');
  await expect(knownValues).not.toHaveAttribute('open', '');
  await knownValues.locator('summary').first().click();
  await expect(knownValues).toHaveAttribute('open', '');
  await page.locator('[data-nutrition-reference="mealName"]').fill('Fried Edam cheese with fries and tartar sauce');
  await page.locator('[data-nutrition-reference="ingredients"]').fill('Breaded Edam cheese\nFrench fries\nTartar sauce');
  await page.locator('[data-nutrition-reference="totalWeightG"]').fill('445');
  await page.locator('[data-nutrition-reference="energyKcal"]').fill('1120');
  await page.locator('[data-nutrition-reference="proteinG"]').fill('39');
  await page.locator('[data-nutrition-reference="carbohydrateG"]').fill('104');
  await page.locator('[data-nutrition-reference="fatG"]').fill('61');
  const detailedReference = page.locator('.nutrition-comparison-reference-details');
  await detailedReference.locator('summary').click();
  await page.locator('[data-nutrition-reference="sugarG"]').fill('7');
  await page.locator('[data-nutrition-reference="saturatedFatG"]').fill('19');
  await page.locator('[data-nutrition-reference="sodiumMg"]').fill('1400');
  await page.locator('[data-nutrition-reference="potassiumMg"]').fill('950');
  await page.locator('[data-nutrition-reference="calciumMg"]').fill('800');
  await page.locator('[data-nutrition-reference="vitaminCMg"]').fill('10');
  await page.locator('#nutrition-run-comparison').click();
  await expect(page.locator('#cloud-ai-consent-overlay')).toBeVisible();
  await page.locator('#cloud-ai-consent-checkbox').check();
  await page.locator('[data-cloud-ai-consent-action="approve"]').click();

  await expect(page.locator('.nutrition-comparison-card')).toHaveCount(2);
  await expect(page.locator('.nutrition-comparison-card').first()).toContainText('Meal Close');
  await expect(page.locator('.nutrition-comparison-card').first()).toContainText('Closest');
  await expect(page.locator('.nutrition-comparison-method')).toContainText('identity self-checks are excluded');
  await expect(page.locator('.nutrition-comparison-card').first()).not.toContainText('Identity self-check is uncalibrated');
  await expect(page.locator('.nutrition-comparison-card').first()).toContainText('Known-value agreement / 100');
  await expect(page.locator('.nutrition-comparison-card').first()).toContainText('$0.0014');
  await expect(page.locator('.nutrition-comparison-card').first()).toContainText('150 tokens · 100 in / 50 out');
  await expect(page.locator('.nutrition-comparison-card').nth(1)).toContainText('$0.0018');
  const ingredientPanels = page.locator('.nutrition-comparison-ingredient-panel');
  await expect(ingredientPanels).toHaveCount(2);
  await expect(ingredientPanels.nth(0)).toContainText('3 returned');
  await expect(ingredientPanels.nth(1)).toContainText('6 returned');
  const alignedResultCards = await page.locator('.nutrition-comparison-card').evaluateAll(cards => ({
    cardHeights: cards.map(card => card.getBoundingClientRect().height),
    ingredientHeights: cards.map(card => card.querySelector('.nutrition-comparison-ingredient-panel')?.getBoundingClientRect().height),
    ingredientTops: cards.map(card => card.querySelector('.nutrition-comparison-ingredient-panel')?.getBoundingClientRect().top),
  }));
  expect(Math.max(...alignedResultCards.cardHeights) - Math.min(...alignedResultCards.cardHeights)).toBeLessThan(1);
  expect(Math.max(...alignedResultCards.ingredientHeights) - Math.min(...alignedResultCards.ingredientHeights)).toBeLessThan(1);
  expect(Math.max(...alignedResultCards.ingredientTops) - Math.min(...alignedResultCards.ingredientTops)).toBeLessThan(1);
  await expect(page.getByRole('button', { name: 'Open full-screen comparison' })).toBeVisible();
  await expect(page.locator('.nutrition-comparison-reference-banner')).toContainText('Known values active.');
  await expect(page.locator('#nutrition-comparison-progress')).toContainText('Comparison ready');
  expect([...requestedModels].sort()).toEqual(['openai/gpt-5.6-sol', 'anthropic/claude-opus-5'].sort());
  expect(peakConcurrentRequests).toBeGreaterThanOrEqual(2);

  const detailedComparison = page.locator('.nutrition-comparison-card').first().locator('.nutrition-comparison-detailed');
  await expect(detailedComparison.locator('summary')).toContainText('6 returned · 6 compared');
  await detailedComparison.locator('summary').click();
  await expect(detailedComparison.locator('tbody tr')).toHaveCount(6);
  await expect(detailedComparison.locator('tbody tr').filter({ hasText: 'Sodium' })).toContainText('1,350 mg');
  await expect(detailedComparison.locator('tbody tr').filter({ hasText: 'Vitamin C' })).toContainText('+20%');

  const differenceDetails = page.locator('.nutrition-comparison-card').first().locator('.nutrition-comparison-errors');
  await differenceDetails.locator('summary').click();
  await expect(differenceDetails.getByRole('columnheader')).toHaveCount(4);
  await expect(differenceDetails.locator('tbody tr')).toHaveCount(11);
  const alignedReferenceColumns = await differenceDetails.locator('table').evaluate(table => {
    const rows = Array.from(table.rows);
    const expected = Array.from(rows[0].cells).map(cell => cell.getBoundingClientRect().left);
    return rows.every(row => row.cells.length === 4 && Array.from(row.cells).every((cell, index) => Math.abs(cell.getBoundingClientRect().left - expected[index]) < 1));
  });
  expect(alignedReferenceColumns).toBe(true);
  await page.addScriptTag({ path: axeScriptPath });
  const benchmarkViolations = await page.evaluate(async () => {
    const result = await window.axe.run(document.querySelector('#nutrition-model-comparison'), {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    return result.violations.map(violation => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map(node => ({ target: node.target, html: node.html, message: node.failureSummary })),
    }));
  });
  expect(benchmarkViolations).toEqual([]);

  const cards = page.locator('.nutrition-comparison-card');
  const closeCard = cards.filter({ hasText: 'Meal Close' });
  const confidentCard = cards.filter({ hasText: 'Meal Confident' });
  await closeCard.getByRole('button', { name: 'Use as baseline' }).click();
  await expect(closeCard).toContainText('Baseline');
  await expect(confidentCard).toContainText('+53.6%');
  await expect(confidentCard).toContainText('+55%');
  const confidentDetailed = confidentCard.locator('.nutrition-comparison-detailed');
  await confidentDetailed.locator('summary').click();
  await expect(confidentDetailed.locator('tbody tr').filter({ hasText: 'Sodium' })).toContainText('+63%');
  await closeCard.getByRole('button', { name: 'Use this estimate' }).click();
  await expect(page.locator('#nutrition-model-comparison')).toBeHidden();
  await expect(page.locator('#nutrition-comparison-return')).toBeVisible();
  await expect(page.locator('#nutrition-meal-name')).toHaveValue('Fried Edam cheese with fries and tartar sauce');
  await expect(page.locator('#nutrition-sodiumMg')).toHaveValue('1350');
  await expect(page.locator('#nutrition-save-requirement')).toHaveText('Choose a meal occasion to save.');
  await page.getByRole('button', { name: 'Benchmark →', exact: true }).click();
  await expect(page.locator('#detail-modal')).toHaveClass(/nutrition-benchmark-modal/);
  await expect(page.locator('#nutrition-model-comparison')).toBeVisible();
  await expect(page.locator('.nutrition-comparison-card')).toHaveCount(2);
  await expect(page.locator('.nutrition-comparison-card').first()).toContainText('Baseline');

  await confidentCard.getByRole('button', { name: 'Remove Meal Confident result' }).click();
  await expect(page.locator('.nutrition-comparison-card')).toHaveCount(1);
  await expect(confidentChoice.locator('input')).not.toBeChecked();
  await expect(closeCard).toContainText('Baseline');
  await geminiChoice.locator('input').check();
  await kimiChoice.locator('input').check();
  await expect(page.locator('#nutrition-run-comparison')).toBeEnabled();
  await expect(page.locator('#nutrition-run-comparison')).toHaveText('Add 2 model results');
  peakConcurrentRequests = 0;
  await page.locator('#nutrition-run-comparison').click();
  await expect(page.locator('.nutrition-comparison-card')).toHaveCount(3);
  await expect(page.locator('#nutrition-comparison-progress')).toContainText('1 model needs retry');
  await expect(page.locator('#nutrition-comparison-model-limit')).toHaveText('3 selected · 3 of 4 results');
  await expect(geminiChoice).toContainText('Compared');
  await expect(page.locator('.nutrition-comparison-reference-banner')).toContainText('Comparing against Meal Close');
  const failedGemini = page.locator('.nutrition-comparison-card.is-error').filter({ hasText: 'Vision Gemini 3.7' });
  await expect(failedGemini).toContainText('Rate limited. Please wait a moment and try again.');
  await expect(failedGemini.getByRole('button', { name: 'Retry this model' })).toBeVisible();
  expect([...requestedModels].sort()).toEqual([
    'openai/gpt-5.6-sol', 'anthropic/claude-opus-5',
    'google/gemini-3.7-flash', 'moonshotai/kimi-k3',
  ].sort());
  expect(peakConcurrentRequests).toBeGreaterThanOrEqual(2);
  await expect(failedGemini.getByRole('button', { name: 'Replace model' })).toBeVisible();
  await failedGemini.getByRole('button', { name: 'Replace model' }).click();
  await expect(page.locator('.nutrition-comparison-card')).toHaveCount(2);
  await expect(geminiChoice.locator('input')).not.toBeChecked();
  await expect(page.locator('[data-nutrition-comparison-search]')).toBeFocused();
  await confidentChoice.locator('input').check();
  await expect(page.locator('#nutrition-run-comparison')).toHaveText('Run replacement model');
  await page.locator('#nutrition-run-comparison').click();
  await expect(page.locator('.nutrition-comparison-card')).toHaveCount(3);
  expect([...requestedModels].sort()).toEqual([
    'openai/gpt-5.6-sol', 'anthropic/claude-opus-5',
    'google/gemini-3.7-flash', 'moonshotai/kimi-k3', 'anthropic/claude-opus-5',
  ].sort());
  await geminiChoice.locator('input').check();
  await expect(page.locator('#nutrition-run-comparison')).toHaveText('Add 1 model result');
  await page.locator('#nutrition-run-comparison').click();
  await expect(page.locator('.nutrition-comparison-card')).toHaveCount(4);
  await expect(page.locator('#nutrition-comparison-progress')).toContainText('Comparison ready');
  await expect(page.locator('#nutrition-comparison-results')).toHaveAttribute('data-result-count', '4');
  expect([...requestedModels].sort()).toEqual([
    'openai/gpt-5.6-sol', 'anthropic/claude-opus-5',
    'google/gemini-3.7-flash', 'moonshotai/kimi-k3',
    'anthropic/claude-opus-5', 'google/gemini-3.7-flash',
  ].sort());
  await page.setViewportSize({ width: 1100, height: 768 });
  const presentationButton = page.getByRole('button', { name: 'Open full-screen comparison' });
  await presentationButton.click();
  await expect(page.locator('#detail-modal')).toHaveClass(/nutrition-comparison-presentation/);
  await expect(page.locator('#nutrition-model-comparison')).toHaveClass(/is-presentation/);
  await expect(page.getByRole('button', { name: 'Exit full-screen comparison' })).toHaveAttribute('aria-pressed', 'true');
  const presentationLayout = await page.evaluate(() => {
    const modal = document.getElementById('detail-modal');
    const cards = [...document.querySelectorAll('.nutrition-comparison-card')];
    const cardRects = cards.map(card => card.getBoundingClientRect());
    const ingredientRects = cards.map(card => card.querySelector('.nutrition-comparison-ingredient-panel')?.getBoundingClientRect());
    const modalRect = modal.getBoundingClientRect();
    return {
      modalRect: { top: modalRect.top, left: modalRect.left, right: modalRect.right, bottom: modalRect.bottom },
      setupDisplay: getComputedStyle(document.querySelector('.nutrition-comparison-setup')).display,
      actionsDisplay: getComputedStyle(document.querySelector('.nutrition-comparison-card-actions')).display,
      columns: new Set(cardRects.map(rect => Math.round(rect.left))).size,
      cardHeightSpread: Math.max(...cardRects.map(rect => rect.height)) - Math.min(...cardRects.map(rect => rect.height)),
      ingredientHeightSpread: Math.max(...ingredientRects.map(rect => rect.height)) - Math.min(...ingredientRects.map(rect => rect.height)),
      allCardsOnScreen: cardRects.every(rect => rect.top >= -1 && rect.bottom <= innerHeight + 1),
      modalHasScroll: modal.scrollHeight > modal.clientHeight + 1,
      workspaceHasScroll: document.querySelector('#nutrition-model-comparison').scrollHeight > document.querySelector('#nutrition-model-comparison').clientHeight + 1,
    };
  });
  expect(presentationLayout.modalRect).toEqual({ top: 0, left: 0, right: 1100, bottom: 768 });
  expect(presentationLayout.setupDisplay).toBe('none');
  expect(presentationLayout.actionsDisplay).toBe('none');
  expect(presentationLayout.columns).toBe(4);
  expect(presentationLayout.cardHeightSpread).toBeLessThan(1);
  expect(presentationLayout.ingredientHeightSpread).toBeLessThan(1);
  expect(presentationLayout.allCardsOnScreen).toBe(true);
  expect(presentationLayout.modalHasScroll).toBe(false);
  expect(presentationLayout.workspaceHasScroll).toBe(false);
  await page.keyboard.press('Escape');
  await expect(page.locator('#detail-modal')).not.toHaveClass(/nutrition-comparison-presentation/);
  await expect(page.locator('#nutrition-model-comparison')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open full-screen comparison' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#nutrition-comparison-history')).toContainText('Comparison saved');
  await page.locator('#detail-modal .modal-close').click();
  await page.locator('#confirm-ok').click();
  await page.evaluate(async () => (await import('/js/nutrition.js')).openNutritionEditor());
  await page.locator('[data-nutrition-action="toggle-comparison"]').first().click();
  await expect(page.locator('#nutrition-comparison-history')).toContainText('Last comparison restored');
  await expect(page.locator('.nutrition-comparison-card')).toHaveCount(4);
  await expect(page.locator('.nutrition-comparison-reference-banner')).toContainText('Comparing against Meal Close');
  await expect(page.locator('.nutrition-comparison-card').filter({ hasText: 'Vision Gemini 3.7' })).toContainText('$0.0001');
  expect(requestedModels).toHaveLength(6);
});

test('a running benchmark can close, cancel one model, and never cross profiles', async ({ page }) => {
  const releases = new Map();
  await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
    const body = route.request().postDataJSON();
    await new Promise(resolve => releases.set(body.model, resolve));
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                mealName: body.model.includes('openai') ? 'OpenAI background meal' : 'Anthropic background meal',
                components: [{ name: 'Test meal', quantityG: 250, confidence: 0.75 }],
                nutrients: { energyKcal: 500, proteinG: 30, carbohydrateG: 50, fatG: 20 },
                confidence: 0.75,
                assumptions: [],
                warnings: [],
                label: null,
              }),
            },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 40, completion_tokens: 20 },
        }),
      });
    } catch {
      // A canceled model request may already have closed its browser fetch.
    }
  });

  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const api = await import('/js/api.js');
    const keys = await import('/js/crypto-key-cache.js');
    keys.updateKeyCache('labcharts-openrouter-key', 'test-openrouter-key');
    localStorage.setItem('labcharts-debug', 'true');
    localStorage.setItem('labcharts-openrouter-model', 'openai/gpt-5.6-sol');
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify([
      { id: 'openai/gpt-5.6-sol', name: 'Model One' },
      { id: 'anthropic/claude-opus-5', name: 'Model Two' },
    ]));
    localStorage.setItem('labcharts-openrouter-vision-models', JSON.stringify([
      'openai/gpt-5.6-sol', 'anthropic/claude-opus-5',
    ]));
    api.setAIProvider('openrouter');
    (await import('/js/nutrition-ai-settings.js')).setNutritionAIRoute({ provider: 'openrouter', model: 'openai/gpt-5.6-sol' });
    await (await import('/js/nutrition.js')).openNutritionEditor();
  });
  await page.locator('[data-nutrition-action="toggle-comparison"]').first().click();
  await page.locator('#nutrition-benchmark-photo-input').setInputFiles({ name: 'benchmark.png', mimeType: 'image/png', buffer: TINY_PNG });
  await page.locator('#nutrition-run-comparison').click();
  await page.locator('#cloud-ai-consent-checkbox').check();
  await page.locator('[data-cloud-ai-consent-action="approve"]').click();
  await expect.poll(() => releases.size).toBe(2);
  await expect(page.locator('[data-nutrition-action="cancel-comparison-run"]')).toHaveCount(2);

  await page.getByRole('button', { name: 'Cancel Model One analysis' }).click();
  await expect(page.locator('.nutrition-comparison-card.is-cancelled')).toContainText('Canceled');
  await expect(page.locator('.nutrition-comparison-card.is-running')).toHaveCount(1);
  await page.locator('.nutrition-benchmark-modal .modal-close').click();
  await expect(page.locator('#modal-overlay')).toBeHidden();
  await page.evaluate(() => {
    const modal = document.getElementById('detail-modal');
    modal.innerHTML = '<section id="other-app-workspace">Other app workspace</section>';
    modal.className = 'modal';
  });
  await expect(page.locator('#nutrition-background-workspace')).toBeHidden();

  for (const release of releases.values()) release();
  await page.evaluate(async () => (await import('/js/nutrition.js')).openNutritionEditor());
  await expect(page.locator('#detail-modal')).toHaveClass(/nutrition-benchmark-modal/);
  await expect(page.locator('.nutrition-comparison-card.is-running')).toHaveCount(0);
  await expect(page.locator('.nutrition-comparison-card.is-cancelled')).toContainText('Canceled by user');
  await expect(page.locator('.nutrition-comparison-card:not(.is-cancelled)')).toContainText('Anthropic background meal');
  await expect(page.locator('#nutrition-comparison-progress')).toContainText('1 model needs retry');

  await page.evaluate(async () => {
    const lifecycle = await import('/js/nutrition-request-lifecycle.js');
    const comparison = await import('/js/nutrition-comparison-ui.js');
    const { closeModalOverlay } = await import('/js/modal-lifecycle.js');
    const { state } = await import('/js/state.js');
    lifecycle.beginNutritionBackgroundSession();
    closeModalOverlay('modal-overlay');
    state.currentProfile = `${state.currentProfile}-other`;
    await comparison.useComparisonEstimate(1);
    await (await import('/js/nutrition.js')).openNutritionEditor();
  });
  await expect(page.locator('#notification-container')).toContainText('benchmark belongs to another profile');
  await expect(page.locator('#notification-container')).toContainText('active profile changed');
  await expect(page.locator('#nutrition-background-workspace')).toHaveCount(0);
  await expect(page.locator('#detail-modal')).toHaveClass(/nutrition-modal/);
  await expect(page.locator('#detail-modal')).not.toHaveClass(/nutrition-benchmark-modal/);
  await expect(page.locator('.nutrition-comparison-card')).toHaveCount(0);
  await expect(page.locator('#nutrition-meal-name')).toHaveValue('');
});

test('model comparison preselects and routes models from separate configured providers', async ({ page }) => {
  const requests = [];
  const fulfillAnalysis = async (route, provider) => {
    const body = route.request().postDataJSON();
    requests.push({ provider, model: body.model });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              mealName: `${provider} meal`,
              components: [{ name: 'Meal', quantityG: 320, confidence: 0.8 }],
              nutrients: { energyKcal: 540, proteinG: 32, carbohydrateG: 58, fatG: 20 },
              confidence: 0.8,
              assumptions: [],
              warnings: [],
              label: null,
            }),
          },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 80, completion_tokens: 40 },
      }),
    });
  };
  await page.route('https://openrouter.ai/api/v1/chat/completions', route => fulfillAnalysis(route, 'OpenRouter'));
  await page.route('https://api.venice.ai/api/v1/chat/completions', route => fulfillAnalysis(route, 'Venice'));

  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const api = await import('/js/api.js');
    const keys = await import('/js/crypto-key-cache.js');
    keys.updateKeyCache('labcharts-openrouter-key', 'test-openrouter-key');
    keys.updateKeyCache('labcharts-venice-key', 'test-venice-key');
    localStorage.setItem('labcharts-debug', 'true');
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify([
      { id: 'openai/gpt-5.6-sol', name: 'OpenRouter meal model' },
    ]));
    localStorage.setItem('labcharts-openrouter-vision-models', JSON.stringify(['openai/gpt-5.6-sol']));
    localStorage.setItem('labcharts-venice-models', JSON.stringify([
      { id: 'gemini-3-5-flash', name: 'Venice meal model' },
    ]));
    localStorage.setItem('labcharts-venice-e2ee-models', '[]');
    localStorage.setItem('labcharts-venice-vision-models', JSON.stringify(['gemini-3-5-flash']));
    localStorage.setItem('labcharts-cloud-ai-consent', JSON.stringify({
      version: '2026-08-19',
      approvals: {
        openrouter: { accepted: true },
        venice: { accepted: true },
      },
    }));
    api.setOpenRouterModel('openai/gpt-5.6-sol');
    api.setVeniceModel('gemini-3-5-flash');
    api.setAIProvider('openrouter');
    await (await import('/js/nutrition.js')).openNutritionEditor();
  });

  await page.locator('#nutrition-photo-input').setInputFiles({
    name: 'meal.png', mimeType: 'image/png', buffer: TINY_PNG,
  });
  await page.locator('[data-nutrition-action="toggle-comparison"]').first().click();
  await expect(page.locator('.nutrition-comparison-model-picker')).toContainText('2 providers available · cross-provider pair selected');
  await expect(page.locator('[data-nutrition-comparison-model]:checked')).toHaveCount(2);
  const selectedCards = page.locator('.nutrition-comparison-model:has(input:checked)');
  await expect(selectedCards.nth(0)).toContainText('OpenRouter · meal model');
  await expect(selectedCards.nth(1)).toContainText('Venice · active model');

  await page.locator('#nutrition-run-comparison').click();
  await expect(page.locator('.nutrition-comparison-card')).toHaveCount(2);
  await expect(page.locator('#nutrition-comparison-progress')).toContainText('Comparison ready');
  expect(requests).toHaveLength(2);
  expect(requests).toEqual(expect.arrayContaining([
    { provider: 'OpenRouter', model: 'openai/gpt-5.6-sol' },
    { provider: 'Venice', model: 'gemini-3-5-flash' },
  ]));
});

test('Log Meal restores the Local AI photo model after refresh without opening Settings', async ({ page }) => {
  const discoveryRequests = [];
  await page.route('http://localhost:11434/**', async route => {
    const url = new URL(route.request().url());
    discoveryRequests.push(url.pathname);
    if (url.pathname === '/api/v1/models') {
      await route.fulfill({ status: 404, body: '' });
      return;
    }
    if (url.pathname === '/v1/models') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{
            id: 'qwen-refresh-vision', owned_by: 'unsloth-studio',
            input_modalities: ['text', 'image'], context_length: 32768,
          }],
        }),
      });
      return;
    }
    if (url.pathname === '/api/inference/status') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          active_model: 'qwen-refresh-vision', context_length: 32768, is_vision: true,
        }),
      });
      return;
    }
    await route.abort('failed');
  });
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-ai-provider', 'ollama');
    localStorage.setItem('labcharts-ollama-model', 'qwen-refresh-vision');
  });

  await page.goto('/app', { waitUntil: 'load' });
  const cachedBeforeOpen = await page.evaluate(async () => (
    await import('/js/provider-local-ai-runtime.js')
  ).getCachedLocalAiModelDetails().modelDetails.length);
  expect(cachedBeforeOpen).toBe(0);
  await page.evaluate(async () => (await import('/js/nutrition.js')).openNutritionEditor());

  await expect(page.locator('#nutrition-meal-model-control')).toContainText('Local AI');
  await expect(page.locator('.nutrition-meal-model-status')).toHaveText('Local');
  await expect(page.locator('[data-nutrition-model-route]')).toContainText('qwen-refresh-vision');
  await expect(page.locator('#settings-modal-overlay')).not.toBeVisible();
  await page.locator('#nutrition-photo-input').setInputFiles({
    name: 'meal.png', mimeType: 'image/png', buffer: TINY_PNG,
  });
  await expect(page.locator('#nutrition-analyze-btn')).toBeEnabled();
  expect(discoveryRequests).toEqual(expect.arrayContaining([
    '/api/v1/models', '/v1/models', '/api/inference/status',
  ]));
});

test('model comparison discovers a saved Local AI connection while cloud AI is main', async ({ page }) => {
  const discoveryRequests = [];
  await page.route('http://localhost:11434/**', async route => {
    const url = new URL(route.request().url());
    discoveryRequests.push(url.pathname);
    if (url.pathname === '/api/v1/models') {
      await route.fulfill({ status: 404, body: '' });
      return;
    }
    if (url.pathname === '/v1/models') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{
            id: 'local-comparison-vision', owned_by: 'unsloth-studio',
            input_modalities: ['text', 'image'], context_length: 32768,
          }],
        }),
      });
      return;
    }
    if (url.pathname === '/api/inference/status') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          active_model: 'local-comparison-vision', context_length: 32768, is_vision: true,
        }),
      });
      return;
    }
    await route.abort('failed');
  });

  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const api = await import('/js/api.js');
    const keys = await import('/js/crypto-key-cache.js');
    keys.updateKeyCache('labcharts-openrouter-key', 'test-openrouter-key');
    keys.updateKeyCache('labcharts-ollama', JSON.stringify({
      url: 'http://localhost:11434', model: 'local-comparison-vision', mode: 'unsloth', apiKey: '',
    }));
    localStorage.setItem('labcharts-debug', 'true');
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify([
      { id: 'openai/gpt-5.6-sol', name: 'Cloud meal model' },
    ]));
    localStorage.setItem('labcharts-openrouter-vision-models', JSON.stringify(['openai/gpt-5.6-sol']));
    api.setOpenRouterModel('openai/gpt-5.6-sol');
    api.setOllamaMainModel('local-comparison-vision');
    api.setAIProvider('openrouter');
    await (await import('/js/nutrition.js')).openNutritionEditor();
  });
  await page.locator('[data-nutrition-action="toggle-comparison"]').first().click();
  await expect(page.locator('.nutrition-comparison-models')).toContainText('local-comparison-vision');
  await expect(page.locator('.nutrition-comparison-model-picker')).toContainText('2 providers available · cross-provider pair selected');
  await expect(page.locator('[data-nutrition-comparison-model]:checked')).toHaveCount(2);
  await expect(page.locator('.nutrition-comparison-model:has(input:checked)').nth(0)).toContainText('OpenRouter · meal model');
  await expect(page.locator('.nutrition-comparison-model:has(input:checked)').nth(1)).toContainText('Local AI · active model');
  await page.evaluate(async () => {
    const results = document.getElementById('nutrition-comparison-results');
    if (results) results.innerHTML = '<article class="nutrition-comparison-card">Earlier comparison</article>';
    (await import('/js/nutrition-comparison-ui.js')).refreshComparisonModelPicker();
  });
  await expect(page.locator('.nutrition-comparison-card')).toContainText('Earlier comparison');
  await expect(page.locator('#settings-modal-overlay')).not.toBeVisible();
  expect(discoveryRequests).toEqual(expect.arrayContaining([
    '/api/v1/models', '/v1/models', '/api/inference/status',
  ]));
});

test('meal drafts ignore backdrop clicks and Escape uses the guarded discard path', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => (await import('/js/nutrition.js')).openNutritionEditor());
  await page.locator('#nutrition-meal-name').fill('Unsaved lunch');

  await page.locator('#modal-overlay').click({ position: { x: 2, y: 2 } });
  await expect(page.locator('#modal-overlay')).toBeVisible();
  await expect(page.locator('#nutrition-meal-name')).toHaveValue('Unsaved lunch');

  await page.keyboard.press('Escape');
  await expect(page.locator('#confirm-dialog-overlay')).toBeVisible();
  await page.locator('#confirm-cancel').click();
  await expect(page.locator('#nutrition-meal-name')).toHaveValue('Unsaved lunch');
  await page.keyboard.press('Escape');
  await page.locator('#confirm-ok').click();
  await expect(page.locator('#modal-overlay')).toBeHidden();
});

test('the meal editor, nutrition setup, and drink logger have no automated WCAG A/AA violations', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => (await import('/js/nutrition.js')).openNutritionEditor());
  await expect(page.locator('.nutrition-compare-launch')).toHaveCount(0);
  await expect(page.locator('#nutrition-model-comparison')).toHaveCount(0);
  await page.locator('#nutrition-carbohydrateG').fill('90');
  await page.locator('#nutrition-fatG').fill('40');
  await expect(page.locator('#nutrition-fuel-preview')).toBeVisible();
  await page.addScriptTag({ path: axeScriptPath });
  const editorViolations = await page.evaluate(async () => {
    const result = await window.axe.run(document.querySelector('#detail-modal'), {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    return result.violations.map(violation => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map(node => ({ target: node.target, html: node.html, message: node.failureSummary })),
    }));
  });
  expect(editorViolations).toEqual([]);
  await page.evaluate(async () => (await import('/js/nutrition.js')).openNutritionTargets());
  const targetViolations = await page.evaluate(async () => {
    const result = await window.axe.run(document.querySelector('#detail-modal'), {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    return result.violations.map(violation => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map(node => ({ target: node.target, html: node.html, message: node.failureSummary })),
    }));
  });
  expect(targetViolations).toEqual([]);
  await page.evaluate(async () => (await import('/js/nutrition.js')).openFluidLog());
  const drinkViolations = await page.evaluate(async () => {
    const result = await window.axe.run(document.querySelector('#detail-modal'), {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    return result.violations.map(violation => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map(node => ({ target: node.target, html: node.html, message: node.failureSummary })),
    }));
  });
  expect(drinkViolations).toEqual([]);
});

test('nutrition label mode scales the scanned values to the amount eaten', async ({ page }) => {
  const requestBodies = [];
  await page.route('https://api.venice.ai/api/v1/chat/completions', async route => {
    requestBodies.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              mealName: 'Greek yogurt',
              components: [{ name: 'Greek yogurt', quantityG: 300, confidence: 0.98 }],
              nutrients: {
                energyKcal: 240, proteinG: 30, carbohydrateG: 18, fatG: 4,
                fiberG: 0, sugarG: 12, addedSugarG: 8, saturatedFatG: 2,
                transFatG: 0, sodiumMg: 140, potassiumMg: 420, calciumMg: 360,
              },
              confidence: 0.96,
              assumptions: [],
              warnings: [],
              label: {
                servingSizeText: '1 tub (150 g)',
                servingSizeG: 150,
                servingsPerContainer: 2,
                labelBasis: 'per serving',
                consumedAmount: 2,
                consumedUnit: 'servings',
              },
            }),
          },
          finish_reason: 'stop',
        }],
      }),
    });
  });

  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const api = await import('/js/api.js');
    const keys = await import('/js/crypto-key-cache.js');
    keys.updateKeyCache('labcharts-venice-key', 'test-venice-key');
    localStorage.setItem('labcharts-venice-models', JSON.stringify([{ id: 'claude-opus-4.8', name: 'Claude Opus 4.8' }]));
    localStorage.setItem('labcharts-venice-e2ee-models', '[]');
    localStorage.setItem('labcharts-venice-vision-models', JSON.stringify(['claude-opus-4.8']));
    api.setAIProvider('venice');
    (await import('/js/nutrition-ai-settings.js')).setNutritionAIRoute({ provider: 'venice', model: 'claude-opus-4.8' });
    await (await import('/js/nutrition.js')).openNutritionEditor();
  });

  await page.locator('[data-nutrition-action="set-kind"][data-nutrition-kind="nutrition-label"]').click();
  await expect(page.locator('#nutrition-label-consumption')).toBeVisible();
  await expect(page.locator('#nutrition-barcode')).toHaveCount(0);
  await expect(page.locator('#nutrition-barcode-btn')).toHaveCount(0);
  await expect(page.locator('#nutrition-analyze-btn')).toHaveText('Scan label');
  await expect(page.locator('#nutrition-model-purpose')).toHaveText('Label model');
  await expect(page.locator('[data-nutrition-model-route] option:checked')).toContainText('Claude Opus 4.8');
  await expect(page.locator('#nutrition-privacy-line')).toContainText('choose Scan label');
  await page.locator('#nutrition-consumed-amount').fill('2');
  await page.locator('#nutrition-photo-input').setInputFiles({
    name: 'label.png', mimeType: 'image/png', buffer: TINY_PNG,
  });
  await page.locator('#nutrition-analyze-btn').click();
  await page.locator('#cloud-ai-consent-checkbox').check();
  await page.locator('[data-cloud-ai-consent-action="approve"]').click();

  await expect(page.locator('#nutrition-analysis-status')).toContainText('Label scan ready');
  await expect(page.locator('#nutrition-meal-name')).toHaveValue('Greek yogurt');
  await expect(page.locator('#nutrition-energyKcal')).toHaveValue('240');
  await expect(page.locator('#nutrition-addedSugarG')).toHaveValue('8');
  await expect(page.locator('#nutrition-potassiumMg')).toHaveValue('420');
  await expect(page.locator('#nutrition-calciumMg')).toHaveValue('360');
  await expect(page.locator('#nutrition-review-evidence')).toContainText('1/1 linked to component nutrients');
  await expect(page.locator('#nutrition-label-details')).toContainText('Serving size 1 tub (150 g)');
  await expect(page.locator('#nutrition-label-details')).toContainText('Logged 2 servings');
  expect(requestBodies).toHaveLength(1);
  expect(JSON.stringify(requestBodies[0].messages)).toContain('Nutrition Facts');
  expect(JSON.stringify(requestBodies[0].messages)).toContain('User-reported consumption: 2 servings');

  await page.locator('.nutrition-more-nutrients summary').click();
  await page.locator('[data-nutrition-component-grams="0"]').fill('150');
  await page.locator('[data-nutrition-component-grams="0"]').blur();
  await expect(page.locator('#nutrition-energyKcal')).toHaveValue('120');
  await expect(page.locator('#nutrition-addedSugarG')).toHaveValue('4');
  await expect(page.locator('#nutrition-potassiumMg')).toHaveValue('210');
  await expect(page.locator('#nutrition-calciumMg')).toHaveValue('180');
  await page.locator('[data-nutrition-component-grams="0"]').fill('450');
  await page.locator('[data-nutrition-component-grams="0"]').blur();
  await expect(page.locator('#nutrition-energyKcal')).toHaveValue('360');
  await expect(page.locator('#nutrition-addedSugarG')).toHaveValue('12');
  await expect(page.locator('#nutrition-potassiumMg')).toHaveValue('630');
  await expect(page.locator('#nutrition-calciumMg')).toHaveValue('540');
  await expect(page.locator('#nutrition-analysis-status')).toContainText('Linked nutrients recalculated');
  await page.locator('[data-nutrition-component-grams="0"]').fill('300');
  await page.locator('[data-nutrition-component-grams="0"]').blur();
  await expect(page.locator('#nutrition-addedSugarG')).toHaveValue('8');
  await expect(page.locator('#nutrition-potassiumMg')).toHaveValue('420');

  await page.locator('#nutrition-meal-type').selectOption('snack');
  await page.locator('#nutrition-save-btn').click();
  await expect(page.locator('#detail-modal')).toContainText('Snack');
  await expect(page.locator('#detail-modal')).toContainText('label scan');
  await expect(page.locator('#detail-modal')).toContainText('2 servings logged');
});

test('meal modal navigation round-trips through browse, details, setup, and edit without a dashboard restart', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const now = new Date();
    await (await import('/js/nutrition-store.js')).saveActiveProfileMeal({
      name: 'Navigation meal', mealType: 'lunch', eatenAt: now.toISOString(),
      localDate: now.toISOString().slice(0, 10), localTimeMinutes: 720,
      nutrients: { energyKcal: 520, proteinG: 28 },
      components: [{ name: 'Navigation ingredient', quantityG: 240, nutrients: { energyKcal: 520, proteinG: 28 } }],
      source: { kind: 'manual' }, reviewed: true,
    });
    await (await import('/js/nutrition.js')).openNutritionEditor();
  });

  await page.getByRole('tab', { name: 'Manual' }).click();
  await page.locator('#nutrition-meal-name').fill('Preserved draft meal');
  await page.locator('#nutrition-note').fill('Keep this draft while browsing.');
  await page.getByRole('button', { name: 'Browse meals' }).click();
  await expect(page.getByRole('button', { name: 'Meal entry' })).toBeVisible();
  await expect(page.locator('.nutrition-history-modal')).toBeVisible();
  await page.locator('.nutrition-history-modal .modal-close').click();
  await expect(page.locator('.confirm-overlay.show')).toBeVisible();
  await page.locator('#confirm-cancel').click();
  await expect(page.locator('.nutrition-history-modal')).toBeVisible();

  await page.locator('[data-nutrition-action="detail"]').click();
  await expect(page.locator('#detail-modal')).toContainText('Navigation meal');
  await page.locator('[data-nutrition-action="back"]').click();
  await expect(page.locator('.nutrition-history-modal')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Meal entry' })).toBeVisible();

  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  await expect(page.locator('#nutrition-target-settings')).toBeVisible();
  await expect(page.locator('.nutrition-route-back')).toContainText('Meals & Nutrition');
  await page.locator('.nutrition-route-back').click();
  await expect(page.locator('.nutrition-history-modal')).toBeVisible();
  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  await page.locator('[data-nutrition-action="save-targets"]').click();
  await expect(page.locator('.nutrition-history-modal')).toBeVisible();
  await page.getByRole('button', { name: 'Meal entry' }).click();
  await expect(page.locator('.nutrition-modal-head h3')).toHaveText('Log a meal');
  await expect(page.locator('#nutrition-meal-name')).toHaveValue('Preserved draft meal');
  await expect(page.locator('#nutrition-note')).toHaveValue('Keep this draft while browsing.');
  await expect(page.locator('#detail-modal')).toHaveClass(/nutrition-manual-mode/);

  await page.getByRole('button', { name: 'Browse meals' }).click();
  await page.getByRole('button', { name: 'New meal' }).click();
  await expect(page.locator('.confirm-overlay.show')).toBeVisible();
  await page.locator('#confirm-cancel').click();
  await expect(page.locator('.nutrition-history-modal')).toBeVisible();
  await page.getByRole('button', { name: 'Meal entry' }).click();
  await expect(page.locator('#nutrition-meal-name')).toHaveValue('Preserved draft meal');

  await page.locator('.modal-close').click();
  await page.locator('#confirm-ok').click();
  await page.evaluate(async () => (await import('/js/nutrition.js')).openNutritionHistory());
  await page.getByRole('button', { name: 'Log meal' }).click();
  await expect(page.locator('.nutrition-route-back')).toContainText('Meals & Nutrition');
  await page.locator('.nutrition-route-back').click();
  await expect(page.locator('.nutrition-history-modal')).toBeVisible();

  await page.locator('[data-nutrition-action="detail"]').click();
  await page.getByRole('button', { name: 'Edit meal' }).click();
  await expect(page.locator('.nutrition-modal-head h3')).toHaveText('Edit meal');
  await page.getByRole('button', { name: 'Meal details' }).click();
  await expect(page.locator('.confirm-overlay.show')).toBeVisible();
  await page.locator('#confirm-ok').click();
  await expect(page.locator('#detail-modal')).toContainText('Navigation meal');
  await expect(page.locator('[data-nutrition-action="back"]')).toBeVisible();
});

test('saved meals can be edited deterministically and logged again without another model call', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const store = await import('/js/nutrition-store.js');
    await store.saveActiveProfileMeal({
      name: 'White rice', mealType: 'dinner', eatenAt: new Date().toISOString(),
      localDate: new Date().toISOString().slice(0, 10), localTimeMinutes: 1140,
      nutrients: { energyKcal: 325, proteinG: 6, carbohydrateG: 70 },
      components: [{
        name: 'White rice', quantityG: 250, confidence: 0.8,
        nutrients: { energyKcal: 325, proteinG: 6, carbohydrateG: 70 },
        nutrientsPer100g: { energyKcal: 130, proteinG: 2.4, carbohydrateG: 28 },
      }],
      responseCheckIn: { satiety2h: 3, energy2h: 2, recordedAt: new Date().toISOString() },
      source: { kind: 'ai-photo-estimate', provider: 'openrouter', model: 'test-model' },
      reviewed: true,
    });
    await (await import('/js/nutrition.js')).openNutritionEditor();
  });

  await page.getByRole('button', { name: 'Browse meals' }).click();
  const deleteButton = page.locator('.nutrition-meal-delete').first();
  await deleteButton.focus();
  const deleteGeometry = await deleteButton.evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    rowWidth: element.parentElement?.getBoundingClientRect().width || 0,
  }));
  expect(deleteGeometry.clientWidth).toBeGreaterThanOrEqual(52);
  expect(deleteGeometry.scrollWidth).toBeLessThanOrEqual(deleteGeometry.clientWidth);
  expect(deleteGeometry.rowWidth).toBeGreaterThan(deleteGeometry.clientWidth);
  await page.locator('[data-nutrition-action="detail"]').click();
  await page.locator('[data-nutrition-action="edit"]').click();
  await expect(page.locator('#detail-modal')).toContainText('Edit meal');
  // Set the visible field without dispatching change: Save must synchronize it
  // instead of depending on blur/change event ordering.
  await page.locator('[data-nutrition-component-grams="0"]').evaluate(input => { input.value = '200'; });
  await page.locator('#nutrition-save-btn').click();
  await expect(page.locator('#detail-modal')).toContainText('260 kcal');
  await expect(page.locator('#detail-modal')).toContainText('56 g');
  const corrected = await page.evaluate(async () => {
    const meals = await (await import('/js/nutrition-store.js')).listActiveProfileMeals();
    const meal = meals.find(item => item.name === 'White rice');
    return {
      quantityG: meal?.components?.[0]?.quantityG,
      componentCarbs: meal?.components?.[0]?.nutrients?.carbohydrateG,
      totalCarbs: meal?.nutrients?.carbohydrateG,
      totalEnergy: meal?.nutrients?.energyKcal,
      response: meal?.responseCheckIn,
    };
  });
  expect(corrected).toMatchObject({
    quantityG: 200, componentCarbs: 56, totalCarbs: 56, totalEnergy: 260,
    response: { satiety2h: 3, energy2h: 2 },
  });
  await expect(page.locator('#detail-modal')).toContainText('1 portion adjusted');
  await page.locator('[data-nutrition-action="reuse"]').click();
  await expect(page.locator('#detail-modal')).toContainText('Log this meal again');
  await page.locator('#nutrition-save-btn').click();
  await expect(page.locator('#detail-modal')).toContainText('Logged again from a reviewed meal');
  const result = await page.evaluate(async () => {
    const meals = await (await import('/js/nutrition-store.js')).listActiveProfileMeals();
    const reused = meals.find(meal => meal.source.kind === 'reused-meal');
    return { count: meals.length, hasReused: !!reused, reusedImages: reused?.images?.length || 0, reusedResponse: reused?.responseCheckIn || null };
  });
  expect(result).toEqual({ count: 2, hasReused: true, reusedImages: 0, reusedResponse: null });
});

test('deleting a meal records a durable sync tombstone and stays deleted after reload', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const mealId = await page.evaluate(async () => {
    const saved = await (await import('/js/nutrition-store.js')).saveActiveProfileMeal({
      name: 'Throwaway lunch', mealType: 'lunch', eatenAt: new Date().toISOString(),
      nutrients: { energyKcal: 510, proteinG: 28, carbohydrateG: 58, fatG: 18 },
      source: { kind: 'manual' }, reviewed: true,
    });
    await (await import('/js/nutrition.js')).openNutritionEditor();
    return saved.id;
  });

  await page.getByRole('button', { name: 'Browse meals' }).click();
  await page.getByRole('button', { name: 'Delete Throwaway lunch' }).click();
  await expect(page.locator('#confirm-dialog-overlay')).toContainText('Delete this meal and its thumbnail from synced devices?');
  await page.locator('#confirm-ok').click();
  await expect(page.getByRole('button', { name: 'Delete Throwaway lunch' })).toHaveCount(0);
  const deleted = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const meals = await (await import('/js/nutrition-store.js')).listActiveProfileMeals();
    return {
      localIds: meals.map(meal => meal.id),
      syncedIds: (state.importedData.nutritionMeals || []).map(meal => meal.id),
      tombstones: state.importedData._deleted?.nutritionMeals || [],
      totalMeals: state.nutritionSummary?.totalMeals,
    };
  });
  expect(deleted.localIds).not.toContain(mealId);
  expect(deleted.syncedIds).not.toContain(mealId);
  expect(deleted.tombstones).toContain(mealId);
  expect(deleted.totalMeals).toBe(0);

  await page.reload({ waitUntil: 'load' });
  await page.evaluate(async () => (await import('/js/nutrition.js')).openNutritionHistory());
  await expect(page.getByRole('button', { name: 'Delete Throwaway lunch' })).toHaveCount(0);
});

test('ingredient correction evidence records final ingredients, not individual keystrokes', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => (await import('/js/nutrition.js')).openNutritionEditor());
  await page.locator('#nutrition-meal-name').fill('Rice bowl');
  await page.locator('#nutrition-meal-type').selectOption('lunch');
  await page.locator('[data-nutrition-action="add-component"]').click();
  await page.locator('[data-nutrition-component-name="0"]').pressSequentially('Temporary ingredient');
  await page.locator('[data-nutrition-action="add-component"]').click();
  await page.locator('[data-nutrition-component-name="1"]').pressSequentially('Brown rice');
  await page.locator('[data-nutrition-action="remove-component"][data-nutrition-index="0"]').click();
  await page.locator('#nutrition-save-btn').click();

  await expect(page.locator('#detail-modal')).toContainText('1 ingredient identity corrected');
  const review = await page.evaluate(async () => {
    const meals = await (await import('/js/nutrition-store.js')).listActiveProfileMeals();
    return meals.find(meal => meal.name === 'Rice bowl')?.source?.review?.editedComponentIdentities;
  });
  expect(review).toEqual(['Brown rice']);
});

test('the nutrition widget shows visual seven-day coverage and weight-aware personal targets', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const nutrition = await import('/js/nutrition.js');
    const { state } = await import('/js/state.js');
    const localDay = offset => {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    state.importedData.wearableSummary = {
      metrics: { weight: { latest: 80, latestDate: localDay(0), primarySource: 'fitbit' } },
    };
    state.importedData.nutritionTargets = {
      configured: true,
      proteinBasis: 'active',
      energyKcal: 2000,
      carbohydrateG: 151,
      fatG: 67,
      fiberG: 25,
      widgetNutrients: ['proteinG', 'fatG', 'fiberG', 'fluidMl', 'sugarG', 'sodiumMg'],
    };
    state.nutritionSummary = {
      totalMeals: 9,
      windows: {
        d7: {
          days: 7,
          meals: 9,
          loggedDays: 5,
          loggedDayKeys: [localDay(6), localDay(4), localDay(2), localDay(1), localDay(0)],
          dailyAverages: { energyKcal: 2150, proteinG: 96, carbohydrateG: 210, fatG: 74, fiberG: 28, fluidMl: 1400, sugarG: 44, sodiumMg: 1820 },
          nutrientCoverage: {
            energyKcal: { completeDays: 5 }, proteinG: { completeDays: 5 }, carbohydrateG: { completeDays: 5 },
            fatG: { completeDays: 5 }, fiberG: { completeDays: 4 }, fluidMl: { completeDays: 5 }, sugarG: { completeDays: 4 }, sodiumMg: { completeDays: 5 },
          },
          fuelOverlap: {
            available: true,
            totalMeals: 9,
            completeMeals: 8,
            contributingMeals: 8,
            coverageRatio: 0.889,
            carbEnergyPercent: 56,
            fatEnergyPercent: 44,
            carbFatEnergyKcal: 4000,
            overlapScore: 72,
            direction: 'Mixed intake',
            ratioLabel: '1.3:1 carb:fat energy',
          },
          fuelResponses: { checkIns: 0, minimum: 6, remaining: 6, ready: false },
        },
      },
    };
    const host = document.createElement('div');
    host.id = 'nutrition-widget-test-host';
    host.innerHTML = nutrition.renderNutritionWidget();
    const fuelHost = document.createElement('div');
    fuelHost.id = 'nutrition-fuel-widget-test-host';
    fuelHost.innerHTML = nutrition.renderNutritionFuelWidget();
    const configuredTargets = state.importedData.nutritionTargets;
    state.importedData.nutritionTargets = { ...configuredTargets, configured: false };
    const starterHost = document.createElement('div');
    starterHost.id = 'nutrition-starter-widget-test-host';
    starterHost.innerHTML = nutrition.renderNutritionWidget();
    state.importedData.nutritionTargets = {
      ...configuredTargets,
      widgetNutrients: ['proteinG', 'carbohydrateG', 'fatG', 'fiberG'],
    };
    const macroHost = document.createElement('div');
    macroHost.id = 'nutrition-macro-widget-test-host';
    macroHost.innerHTML = nutrition.renderNutritionWidget();
    state.importedData.nutritionTargets = configuredTargets;
    document.body.append(host, fuelHost, starterHost, macroHost);
  });

  const widget = page.locator('#nutrition-widget-test-host');
  await expect(widget.locator('.nutrition-goal-list-head strong')).toHaveText('Recorded daily averages');
  await expect(widget.locator('.nutrition-goal-list-head span')).toHaveText('Last 7 days · 6 nutrient rows');
  await expect(widget).not.toContainText('Daily nutrition dashboard');
  await expect(widget).toContainText('5 of 7 days');
  await expect(widget).toContainText('Recorded intake, not verified full days');
  await expect(widget).toContainText('Protein');
  await expect(widget).toContainText('128 g');
  await expect(widget).toContainText('1.6 g/kg × 80 kg from Fitbit');
  await expect(widget).toContainText('Logged drinks');
  await expect(widget).toContainText('1,400 mL recorded · 2,000 guide');
  await expect(widget).toContainText('Sugar guide');
  await expect(widget).toContainText('Sodium guide');
  await expect(widget.locator('.nutrition-goal-row')).toHaveCount(6);
  await expect(widget.locator('.nutrition-goal-grid')).toHaveClass(/is-expanded/);
  await expect(widget.locator('.nutrition-target-ring')).toHaveCount(1);
  await expect(widget.locator('.nutrition-target-ring-label')).toHaveText('Energy');
  await expect(widget.locator('.nutrition-target-ring-guide')).toHaveText('Target 2,000');
  await expect(widget.locator('.nutrition-target-ring')).not.toContainText('Energy · target');
  expect(await widget.locator('.nutrition-target-ring > div').evaluate(element =>
    element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight
  )).toBe(true);
  await expect(widget.locator('.nutrition-day.is-logged')).toHaveCount(5);
  await expect(widget.locator('.nutrition-fuel-card')).toHaveCount(0);
  await expect(widget).not.toContainText('Fuel Mix Context');
  await expect(widget.getByRole('button', { name: 'Customize' })).toHaveCount(1);
  await expect(widget.getByRole('button', { name: 'Log meal' })).toHaveCount(1);
  await expect(widget.getByRole('button', { name: 'Log drink' })).toHaveCount(1);
  await expect(widget.locator('.nutrition-drink-action')).toHaveCount(0);
  const fuelWidget = page.locator('#nutrition-fuel-widget-test-host');
  await expect(fuelWidget.locator('button')).toHaveCount(0);
  await expect(fuelWidget).not.toContainText('Nutrition plan');
  await expect(fuelWidget).not.toContainText('Log meal');
  await expect(fuelWidget.locator('.nutrition-fuel-card')).toBeVisible();
  await expect(fuelWidget.locator('.nutrition-fuel-index')).toHaveCount(0);
  await expect(fuelWidget.locator('.nutrition-fuel-target-marker')).toHaveCount(0);
  await expect(fuelWidget).toContainText('Worth reviewing');
  await expect(fuelWidget).toContainText('Energy is the stronger lever');
  await expect(fuelWidget).not.toContainText('after-meal check-ins');
  await expect(fuelWidget).toContainText('56%');
  await expect(fuelWidget).toContainText('44%');
  await expect(fuelWidget).toContainText('8 of 9 meals included');
  await expect(fuelWidget).not.toContainText('1.3:1 carb:fat energy');
  await expect(fuelWidget).toContainText('Avg 500 kcal/meal from carbs + fat');
  await expect(fuelWidget).toContainText('A centered split is not automatically good or bad');
  await expect(fuelWidget).not.toContainText('Seven-day logged pattern');
  await expect(fuelWidget).not.toContainText('Logged carb–fat composition');
  await expect(fuelWidget).toContainText('About this estimate');
  await expect(fuelWidget).not.toContainText('/100');
  const fatGoal = widget.locator('.nutrition-goal-row').filter({ hasText: 'Fat' });
  await expect(fatGoal).not.toHaveClass(/is-above-target/);
  await expect(fatGoal).toContainText('partial-day logs may be below actual intake');
  await expect(fatGoal).not.toHaveClass(/is-on-target/);
  await expect(fatGoal).toHaveClass(/is-excellent/);
  await expect(fatGoal.locator('.nutrition-goal-grade')).toHaveText('On target');
  await expect(widget.locator('.nutrition-goal-row').filter({ hasText: 'Protein' })).toHaveClass(/is-strained/);
  await expect(widget.locator('.nutrition-goal-row').filter({ hasText: 'Logged drinks' })).toHaveClass(/is-strained/);
  await expect(widget.locator('.nutrition-goal-row').filter({ hasText: 'Sugar guide' })).toHaveClass(/is-excellent/);
  await expect(widget.locator('.nutrition-target-ring')).toHaveClass(/is-excellent/);
  await expect(widget).not.toContainText('30 days');
  await expect(widget).not.toContainText('90 days');

  const starterWidget = page.locator('#nutrition-starter-widget-test-host');
  await expect(starterWidget).toContainText('Using starter guides');
  await expect(starterWidget).toContainText('Review and personalize');
  await expect(starterWidget).toContainText('starter guide');
  await expect(starterWidget).not.toContainText('personal target');
  await expect(starterWidget.locator('.nutrition-target-ring')).not.toHaveClass(/is-(excellent|good|strained|poor)/);
  await expect(starterWidget.locator('.nutrition-goal-grade')).toHaveCount(0);

  const macroWidget = page.locator('#nutrition-macro-widget-test-host');
  await expect(macroWidget.locator('.nutrition-goal-row')).toHaveCount(4);
  await expect(macroWidget.locator('.nutrition-goal-grid')).not.toHaveClass(/is-expanded/);
  expect(await macroWidget.locator('.nutrition-goal-grid').evaluate(element =>
    getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length
  )).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await widget.locator('.nutrition-goal-grid').evaluate(element =>
    getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length
  )).toBe(1);
});

test('nutrition history defaults to 30D and offers 3M, 6M, 1Y, and All on desktop and mobile', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const nutrition = await import('/js/nutrition.js');
    const store = await import('/js/nutrition-store.js');
    const summary = await import('/js/nutrition-summary.js');
    const { state } = await import('/js/state.js');
    localStorage.removeItem('nutrition-history-range');
    localStorage.removeItem('nutrition-history-view');
    const historicMeal = (id, name, monthsAgo, energyKcal) => {
      const local = new Date();
      local.setHours(12, 0, 0, 0);
      local.setMonth(local.getMonth() - monthsAgo);
      const localDate = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
      return {
        id, name, localDate, localTimeMinutes: 720, eatenAt: local.toISOString(), mealType: 'lunch', reviewed: true,
        nutrients: { energyKcal, proteinG: energyKcal / 20, carbohydrateG: energyKcal / 10, fatG: energyKcal / 40, fiberG: 10 },
        source: { kind: 'manual' },
      };
    };
    const meals = [
      historicMeal('history-now', 'PRIVATE CURRENT MEAL', 0, 600),
      historicMeal('history-4m', 'PRIVATE FOUR MONTH MEAL', 4, 700),
      historicMeal('history-8m', 'PRIVATE EIGHT MONTH MEAL', 8, 800),
      historicMeal('history-2y', 'PRIVATE TWO YEAR MEAL', 24, 900),
    ];
    for (const meal of meals) await store.putNutritionMeal(state.currentProfile, meal, { preserveUpdatedAt: true });
    state.importedData.nutritionTargets = {
      configured: true,
      energyKcal: 2000,
      proteinBasis: 'fixed',
      proteinFixedG: 100,
      carbohydrateG: 200,
      fatG: 70,
      fiberG: 25,
      widgetNutrients: ['proteinG', 'carbohydrateG', 'fatG', 'fiberG'],
    };
    state.importedData.contextSourceSettings = { ...(state.importedData.contextSourceSettings || {}), 'meals-nutrition': true };
    state.nutritionSummary = summary.computeNutritionSummary(meals);
    const host = document.createElement('div');
    host.id = 'nutrition-history-widget-host';
    host.innerHTML = nutrition.renderNutritionWidget();
    document.body.append(host);
  });

  const widget = page.locator('#nutrition-history-widget-host');
  await expect(widget).toContainText('Last 7 days');
  await widget.getByRole('button', { name: 'History' }).evaluate(button => button.click());
  await expect(page.locator('.nutrition-history-modal')).toBeVisible();
  await expect(page.locator('.nutrition-history-head h3')).toHaveText('Meals & Nutrition');
  await expect(page.getByRole('tab', { name: 'Meals' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.nutrition-history-range .ctx-btn-option')).toHaveCount(5);
  await expect(page.locator('[data-nutrition-action="set-history-range"][data-nutrition-range="30d"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.nutrition-meal-timeline')).toContainText('PRIVATE CURRENT MEAL');
  await expect(page.locator('.nutrition-history-stat-grid')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Trends' }).click();
  await expect(page.locator('.nutrition-history-stat-grid > div').filter({ hasText: 'Meals' }).locator('strong')).toHaveText('1');
  await expect(page.locator('.nutrition-history-averages .nutrition-target-ring')).toHaveClass(/is-poor/);
  await expect(page.locator('.nutrition-history-averages .nutrition-goal-grade')).toHaveCount(4);
  await expect(page.locator('.nutrition-history-modal')).not.toContainText('PRIVATE CURRENT MEAL');
  await expect(page.locator('.nutrition-history-ai').getByRole('button', { name: 'Ask AI', exact: true })).toBeEnabled();
  await expect(page.locator('.nutrition-history-ai')).toContainText('replaces the automatic nutrition summary for this message');

  await page.getByRole('button', { name: '3M', exact: true }).click();
  await expect(page.locator('.nutrition-history-stat-grid > div').filter({ hasText: 'Meals' }).locator('strong')).toHaveText('1');
  await page.getByRole('button', { name: '6M', exact: true }).click();
  await expect(page.locator('.nutrition-history-stat-grid > div').filter({ hasText: 'Meals' }).locator('strong')).toHaveText('2');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('nutrition-history-range'))).toBe('6m');
  await page.getByRole('button', { name: '1Y', exact: true }).click();
  await expect(page.locator('.nutrition-history-stat-grid > div').filter({ hasText: 'Meals' }).locator('strong')).toHaveText('3');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.locator('.nutrition-history-stat-grid > div').filter({ hasText: 'Meals' }).locator('strong')).toHaveText('4');
  await expect(page.locator('.nutrition-history-coverage-chart')).toBeVisible();
  await expect(page.locator('.nutrition-history-caveat')).toContainText('A day with entries may still be partial');
  await expect(page.locator('.nutrition-history-coverage-bar > span').first()).toContainText('/');

  await page.addScriptTag({ path: axeScriptPath });
  const accessibility = await page.evaluate(async () => {
    const result = await window.axe.run(document.querySelector('.nutrition-history-modal'), {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    return result.violations.filter(violation => ['critical', 'serious'].includes(violation.impact));
  });
  expect(accessibility).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('.nutrition-history-layout').evaluate(element =>
    getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length
  )).toBe(1);
  const rangeFits = await page.locator('.nutrition-history-range').evaluate(element =>
    element.scrollWidth <= element.clientWidth + 1
  );
  expect(rangeFits).toBe(true);

  await page.getByRole('tab', { name: 'Meals' }).click();
  await page.locator('.nutrition-history-modal .modal-close').click();
  await page.evaluate(async () => {
    await (await import('/js/nutrition-context.js')).openNutritionHistoryModule({ view: 'trends', focus: 'timing' });
  });
  await expect(page.getByRole('tab', { name: 'Trends' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.nutrition-history-timing')).toBeVisible();
  await page.locator('.nutrition-history-modal .modal-close').click();
  await widget.getByRole('button', { name: 'History' }).evaluate(button => button.click());
  await expect(page.locator('[data-nutrition-action="set-history-range"][data-nutrition-range="all"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.nutrition-history-ai').getByRole('button', { name: 'Ask AI', exact: true }).click();
  await expect(page.locator('#chat-panel')).toHaveClass(/open/);
  await expect(page.locator('#chat-input')).toHaveValue(/Review my Meals & Nutrition history for the all recorded history/);
  await expect(page.locator('#chat-input')).toHaveValue(/coverage-limited aggregate/);
  expect(await page.locator('#chat-input').inputValue()).not.toContain('PRIVATE');
  await expect(page.locator('.nutrition-history-modal')).not.toBeVisible();
});

test('saved nutrition summary hydrates after a cache-bypassing hard reload on Dashboard and Body', async ({ page, context }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const now = new Date();
    await (await import('/js/nutrition-store.js')).saveActiveProfileMeal({
      name: 'Reload rice bowl',
      mealType: 'lunch',
      eatenAt: now.toISOString(),
      localDate: now.toISOString().slice(0, 10),
      localTimeMinutes: 720,
      nutrients: { energyKcal: 640, proteinG: 38, carbohydrateG: 72, fatG: 18, fiberG: 8 },
      components: [{ name: 'Rice', quantityG: 220 }],
      source: { kind: 'manual' },
      reviewed: true,
    });
  });

  const cdp = await context.newCDPSession(page);
  const navigation = page.waitForEvent('framenavigated', frame => frame === page.mainFrame());
  await cdp.send('Page.reload', { ignoreCache: true });
  await navigation;
  await page.waitForLoadState('load');
  await expect.poll(() => page.evaluate(async () => (await import('/js/state.js')).state.nutritionSummary?.totalMeals)).toBe(1);
  const dashboardWidget = page.locator('.dashboard-widget[data-widget-id="nutrition"]');
  await expect(dashboardWidget).toBeVisible();
  await expect(dashboardWidget).toContainText('Recorded daily averages');
  await expect(dashboardWidget).toContainText('38');
  await page.evaluate(async () => (await import('/js/views.js')).navigate('body'));
  const bodyWidget = page.locator('.lens-page-widgets[data-lens-route="body"] .dashboard-widget[data-widget-id="nutrition"]');
  await expect(bodyWidget).toBeVisible();
  await expect(bodyWidget).toContainText('Recorded daily averages');
  await expect(bodyWidget).toContainText('38');
});

test('after-meal check-ins create personal evidence without entering AI summary context', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const now = new Date();
    await (await import('/js/nutrition-store.js')).saveActiveProfileMeal({
      name: 'Checked lunch', mealType: 'lunch', eatenAt: now.toISOString(),
      localDate: now.toISOString().slice(0, 10), localTimeMinutes: 720,
      nutrients: { energyKcal: 620, proteinG: 30, carbohydrateG: 72, fatG: 28, fiberG: 9 },
      source: { kind: 'manual' }, reviewed: true,
    });
    await (await import('/js/nutrition.js')).openNutritionEditor();
  });

  await page.getByRole('button', { name: 'Browse meals' }).click();
  await page.locator('[data-nutrition-action="detail"]').click();
  const checkIn = page.locator('.nutrition-response-card');
  await expect(checkIn).toContainText('How did this meal feel 2–3 hours later?');
  await checkIn.locator('input[name="nutrition-response-satiety"][value="3"]').check();
  await checkIn.locator('input[name="nutrition-response-energy"][value="2"]').check();
  await checkIn.locator('[data-nutrition-action="save-response"]').click();
  await expect(page.locator('.nutrition-response-card')).toContainText('Checked in');

  const stored = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const meals = await (await import('/js/nutrition-store.js')).listActiveProfileMeals();
    return {
      response: meals[0]?.responseCheckIn,
      syncedResponse: state.importedData.nutritionMeals?.[0]?.responseCheckIn,
      contextText: state.nutritionSummary?.contextByDays?.d30 || '',
    };
  });
  expect(stored.response).toMatchObject({ satiety2h: 3, energy2h: 2 });
  expect(stored.syncedResponse).toMatchObject({ satiety2h: 3, energy2h: 2 });
  expect(stored.contextText).not.toContain('satiety');
  expect(stored.contextText).not.toContain('post-meal energy');
});

test('personal nutrition targets persist with the profile and expose weight-aware presets', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.wearableSummary = {
      metrics: { weight: { latest: 80, latestDate: '2026-08-24', primarySource: 'fitbit' } },
    };
    await (await import('/js/nutrition.js')).openNutritionTargets();
  });

  await expect(page.locator('#nutrition-target-settings')).toBeVisible();
  await expect(page.locator('#detail-modal')).toContainText('Nutrition setup');
  await expect(page.locator('#detail-modal')).toContainText('Starter guides');
  await expect(page.locator('#detail-modal')).not.toContainText('Carb/fat plan');
  await expect(page.locator('#nutrition-photo-input')).toHaveCount(0);
  await expect(page.locator('#nutrition-widget-metric-count')).toHaveText('4 selected');
  await expect(page.locator('[data-nutrition-widget-metric]:checked')).toHaveCount(4);
  expect(await page.locator('[data-nutrition-widget-metric]:checked').evaluateAll(inputs =>
    inputs.map(input => input instanceof HTMLInputElement ? input.value : '')
  )).toEqual(['proteinG', 'carbohydrateG', 'fatG', 'fiberG']);
  const widgetOptionValues = await page.locator('[data-nutrition-widget-metric]').evaluateAll(inputs =>
    inputs.map(input => input instanceof HTMLInputElement ? input.value : '').filter(Boolean).sort()
  );
  const trackedNutrientValues = await page.evaluate(async () =>
    (await import('/js/nutrition-summary.js')).NUTRITION_KEYS.filter(key => key !== 'energyKcal').sort()
  );
  expect(widgetOptionValues).toEqual(trackedNutrientValues);
  await page.locator('#nutrition-target-energy').fill('2400');
  await page.locator('#nutrition-target-carbohydrate').fill('225');
  await page.locator('#nutrition-target-fat').fill('100');
  await page.locator('#nutrition-target-protein-basis').selectOption('active');
  await page.locator('[data-nutrition-widget-metric][value="fatG"]').uncheck();
  await page.locator('[data-nutrition-widget-metric][value="fiberG"]').uncheck();
  await page.locator('[data-nutrition-widget-metric][value="sugarG"]').check();
  await page.locator('[data-nutrition-widget-metric][value="magnesiumMg"]').check();
  await expect(page.locator('#nutrition-target-protein-preview')).toContainText('128 g/day');
  await expect(page.locator('#nutrition-widget-metric-count')).toHaveText('4 selected');
  await expect(page.locator('[data-nutrition-widget-metric][value="calciumMg"]')).toBeEnabled();
  await page.locator('[data-nutrition-widget-metric][value="calciumMg"]').check();
  await page.locator('[data-nutrition-widget-metric][value="vitaminDMcg"]').check();
  await expect(page.locator('#nutrition-widget-metric-count')).toHaveText('6 selected');
  await expect(page.locator('[data-nutrition-widget-metric]:disabled')).toHaveCount(0);
  await page.locator('#nutrition-target-energy').fill('100');
  await page.locator('[data-nutrition-action="save-targets"]').click();
  await expect(page.locator('#nutrition-target-settings')).toBeVisible();
  await expect(page.locator('#nutrition-target-status')).toContainText('Review Energy');
  await page.locator('#nutrition-target-energy').fill('2400');
  await page.locator('[data-nutrition-action="save-targets"]').click();
  await expect(page.locator('#modal-overlay')).not.toBeVisible();
  await expect.poll(() => page.evaluate(async () => (await import('/js/state.js')).state.importedData.nutritionTargets?.energyKcal)).toBe(2400);

  await page.reload({ waitUntil: 'load' });
  await expect.poll(() => page.evaluate(async () => (await import('/js/state.js')).state.importedData.nutritionTargets)).toMatchObject({
    energyKcal: 2400,
    proteinBasis: 'active',
    proteinGPerKg: 1.6,
    widgetNutrients: ['proteinG', 'carbohydrateG', 'sugarG', 'calciumMg', 'magnesiumMg', 'vitaminDMcg'],
  });

  await page.evaluate(async () => (await import('/js/nutrition.js')).openNutritionTargets());
  await expect(page.locator('#nutrition-widget-metric-count')).toHaveText('6 selected');
  await expect(page.locator('[data-nutrition-widget-metric]:checked')).toHaveCount(6);
  await page.evaluate(async () => (await import('/js/nutrition.js')).openNutritionEditor());
  await expect(page.locator('.nutrition-modal-head h3')).toHaveText('Log a meal');
  await expect(page.getByRole('tab', { name: 'Manual' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#nutrition-meal-name')).toBeVisible();
  await expect(page.locator('#nutrition-photo-input')).toHaveCount(1);
  await expect(page.locator('#nutrition-target-settings')).toHaveCount(0);
});

test('quick drink logging stores total beverage volume and plain water separately', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const [{ state }, targets, data, nutrition] = await Promise.all([
      import('/js/state.js'),
      import('/js/nutrition-targets.js'),
      import('/js/data.js'),
      import('/js/nutrition.js'),
    ]);
    state.importedData.nutritionTargets = {
      ...targets.getNutritionTargets(),
      widgetNutrients: [...targets.DEFAULT_NUTRITION_WIDGET_NUTRIENTS, 'fluidMl'],
    };
    data.saveImportedData();
    await nutrition.openFluidLog();
  });

  await expect(page.locator('#nutrition-fluid-amount')).toBeVisible();
  await expect(page.locator('#nutrition-photo-input')).toHaveCount(0);
  await expect(page.locator('#nutrition-target-settings')).toHaveCount(0);
  await page.locator('input[name="nutrition-fluid-kind"][value="water"]').check();
  await page.locator('[data-nutrition-action="set-fluid-amount"][data-nutrition-amount="500"]').click();
  await expect(page.locator('#nutrition-fluid-amount')).toHaveValue('500');
  await expect(page.locator('#nutrition-fluid-preview')).toContainText('500 mL water');
  await expect(page.locator('#nutrition-fluid-preview')).toContainText('logged drinks and plain water');
  await expect(page.locator('[data-nutrition-action="save-fluid"]')).toHaveText('Log 500 mL');
  await page.locator('#nutrition-fluid-label').fill('Sparkling water');
  await page.locator('[data-nutrition-action="save-fluid"]').click();

  await expect(page.locator('#modal-overlay')).not.toBeVisible();
  await expect.poll(() => page.evaluate(async () => (await import('/js/state.js')).state.nutritionSummary?.windows?.d7?.dailyAverages?.fluidMl)).toBe(500);
  const result = await page.evaluate(async () => {
    const meals = await (await import('/js/nutrition-store.js')).listActiveProfileMeals();
    const drink = meals.find(meal => meal.source?.kind === 'manual-water');
    return { name: drink?.name, mealType: drink?.mealType, nutrients: drink?.nutrients };
  });
  expect(result).toEqual({ name: 'Sparkling water', mealType: 'drink', nutrients: { fluidMl: 500, plainWaterMl: 500 } });
  await page.reload({ waitUntil: 'load' });
  await expect.poll(() => page.evaluate(async () => (await import('/js/state.js')).state.nutritionSummary?.windows?.d7?.dailyAverages?.fluidMl)).toBe(500);
  const widget = page.locator('.dashboard-widget[data-widget-id="nutrition"]');
  await expect(widget).toContainText('500 mL recorded · 2,000 guide');
  await expect(widget).toContainText('1 day with values for logged drinks');
});

test('AI Settings can route meal photos to Opus without changing the Grok chat model', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const api = await import('/js/api.js');
    const keys = await import('/js/crypto-key-cache.js');
    keys.updateKeyCache('labcharts-openrouter-key', 'test-openrouter-key');
    keys.updateKeyCache('labcharts-venice-key', 'test-venice-key');
    localStorage.setItem('labcharts-openrouter-model', 'z-ai/glm-5.3');
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify([
      { id: 'z-ai/glm-5.3', name: 'GLM 5.3' },
      { id: 'x-ai/grok-4.6', name: 'Grok 4.6' },
      { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5' },
      { id: 'anthropic/claude-opus-4.8', name: 'Legacy Opus' },
      { id: 'anthropic/claude-sonnet-5', name: 'Text-only Sonnet' },
    ]));
    localStorage.setItem('labcharts-openrouter-vision-models', JSON.stringify([
      'x-ai/grok-4.6',
      'anthropic/claude-opus-5',
      'anthropic/claude-opus-4.8',
    ]));
    localStorage.setItem('labcharts-venice-models', JSON.stringify([
      { id: 'gemini-3-5-flash', name: 'Venice Vision' },
    ]));
    localStorage.setItem('labcharts-venice-e2ee-models', '[]');
    localStorage.setItem('labcharts-venice-vision-models', JSON.stringify(['gemini-3-5-flash']));
    api.setAIProvider('openrouter');
    (await import('/js/nutrition-ai-settings.js')).setNutritionAIRoute({
      provider: 'venice', model: 'gemini-3-5-flash',
    });
    (await import('/js/settings.js')).openSettingsModal('ai');
  });

  const selector = page.locator('[data-settings-action="set-nutrition-ai-route"]');
  await expect(selector).toBeVisible();
  await expect(page.locator('#nutrition-ai-model-settings')).toContainText('Meal photos and labels');
  await expect(page.locator('#nutrition-ai-model-settings')).toContainText('Only image-capable OpenRouter models are shown');
  await expect(selector.locator('option').first()).toContainText('Main cannot analyze photos — Z.ai: GLM 5.3');
  await expect(selector.locator('option').first()).toBeDisabled();
  await expect(selector).toHaveValue('');
  await expect(selector).not.toContainText('Venice Vision');
  await expect(selector).not.toContainText('Legacy Opus');
  await expect(selector).not.toContainText('Text-only Sonnet');
  await page.locator('#openrouter-model-select').selectOption('x-ai/grok-4.6');
  await expect(page.locator('[data-settings-action="set-nutrition-ai-route"] option').first()).toContainText('Grok 4.6');
  await expect(page.locator('[data-settings-action="set-nutrition-ai-route"] option').first()).not.toBeDisabled();
  const inherited = await page.evaluate(async () => (await import('/js/nutrition-ai-settings.js')).getMealAISelection());
  expect(inherited).toMatchObject({ provider: 'openrouter', model: 'x-ai/grok-4.6', usesChatModel: true });
  await page.locator('#openrouter-model-select').selectOption('anthropic/claude-opus-5');
  await expect(page.locator('[data-settings-action="set-nutrition-ai-route"] option').first()).toContainText('Claude Opus 5');
  await page.locator('#openrouter-model-select').selectOption('x-ai/grok-4.6');
  await expect(page.locator('[data-settings-action="set-nutrition-ai-route"] option').first()).toContainText('Grok 4.6');
  await page.locator('[data-settings-action="switch-ai-provider"][data-provider="venice"]').click();
  await expect(page.locator('#nutrition-ai-model-settings')).toContainText('Only image-capable Venice models are shown');
  await expect(page.locator('[data-settings-action="set-nutrition-ai-route"]')).toContainText('Venice Vision');
  await expect(page.locator('[data-settings-action="set-nutrition-ai-route"]')).not.toContainText('Claude Opus 5');
  await page.locator('[data-settings-action="switch-ai-provider"][data-provider="openrouter"]').click();
  const openRouterSelector = page.locator('[data-settings-action="set-nutrition-ai-route"]');
  await expect(page.locator('#nutrition-ai-model-settings')).toContainText('Only image-capable OpenRouter models are shown');
  await expect(openRouterSelector).not.toContainText('Venice Vision');
  await openRouterSelector.selectOption(JSON.stringify({ provider: 'openrouter', model: 'anthropic/claude-opus-5' }));

  const result = await page.evaluate(async () => ({
    chatModel: (await import('/js/api.js')).getOpenRouterModel(),
    mealRoute: (await import('/js/nutrition-ai-settings.js')).getNutritionAIRoute(),
  }));
  expect(result.chatModel).toBe('x-ai/grok-4.6');
  expect(result.mealRoute).toEqual({ provider: 'openrouter', model: 'anthropic/claude-opus-5' });
});

test('the meal editor switches visual models directly and returns from AI Settings without losing the draft', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const api = await import('/js/api.js');
    const keys = await import('/js/crypto-key-cache.js');
    keys.updateKeyCache('labcharts-openrouter-key', 'test-openrouter-key');
    localStorage.setItem('labcharts-openrouter-model', 'x-ai/grok-4.6');
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify([
      { id: 'x-ai/grok-4.6', name: 'Grok 4.6' },
      { id: 'google/gemini-3.7-flash', name: 'Gemini 3.7 Flash' },
    ]));
    localStorage.setItem('labcharts-openrouter-vision-models', JSON.stringify([
      'x-ai/grok-4.6', 'google/gemini-3.7-flash',
    ]));
    api.setAIProvider('openrouter');
    (await import('/js/nutrition-ai-settings.js')).setNutritionAIRoute(null);
    await (await import('/js/nutrition.js')).openNutritionEditor();
  });

  const mealSelector = page.locator('[data-nutrition-model-route]');
  await expect(mealSelector).toHaveValue('');
  await expect(mealSelector.locator('option').first()).toContainText('Follow main · Grok 4.6');
  await expect(page.locator('#nutrition-meal-model-control')).toContainText('Photo model');
  await expect(page.locator('#nutrition-meal-model-control')).toContainText('Ready');
  await expect(mealSelector.locator('option:checked')).toContainText('Grok 4.6');
  await page.evaluate(() => {
    const models = [
      { id: 'x-ai/grok-4.6', name: 'Grok 4.6' },
      { id: 'google/gemini-3.7-flash', name: 'Gemini 3.7 Flash' },
      { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5' },
      { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5' },
    ];
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify(models));
    localStorage.setItem('labcharts-openrouter-vision-models', JSON.stringify(models.map(model => model.id)));
    localStorage.setItem('labcharts-openrouter-pricing', JSON.stringify({
      'google/gemini-3.7-flash': { input: 0.5, output: 2 },
      'x-ai/grok-4.6': { input: 2, output: 7 },
      'anthropic/claude-sonnet-5': { input: 3, output: 15 },
      'anthropic/claude-opus-5': { input: 5, output: 25 },
    }));
    window.dispatchEvent(new CustomEvent('labcharts-ai-settings-local-changed'));
  });
  await expect(mealSelector).toContainText('Claude Sonnet 5');
  await expect(mealSelector).toContainText('Claude Opus 5');
  await expect(mealSelector.locator('option:checked')).toContainText('Grok 4.6');
  await page.locator('#nutrition-meal-name').fill('Draft rice bowl');
  await page.locator('[data-nutrition-action="open-ai-settings"]').click();
  await expect(page.locator('#settings-modal-overlay')).toBeVisible();
  await expect(page.locator('#modal-overlay')).toBeVisible();
  await page.locator('#openrouter-model-select').selectOption('anthropic/claude-opus-5');
  await expect(page.locator('[data-settings-action="set-nutrition-ai-route"] option').first()).toContainText('Follow main — Claude Opus 5');
  await page.locator('#settings-modal .modal-close').click();

  await expect(page.locator('#settings-modal-overlay')).not.toBeVisible();
  await expect(page.locator('#modal-overlay')).toBeVisible();
  await expect(page.locator('#nutrition-meal-name')).toHaveValue('Draft rice bowl');
  await expect(page.locator('[data-nutrition-model-route] option').first()).toContainText('Follow main · Claude Opus 5');
  await expect(mealSelector.locator('option:checked')).toContainText('Claude Opus 5');
  await page.locator('[data-nutrition-model-route]').selectOption(JSON.stringify({ provider: 'openrouter', model: 'x-ai/grok-4.6' }));
  await expect(page.locator('[data-nutrition-model-route] option:checked')).toContainText('Grok 4.6');
  const result = await page.evaluate(async () => ({
    mainModel: (await import('/js/api.js')).getOpenRouterModel(),
    mealRoute: (await import('/js/nutrition-ai-settings.js')).getNutritionAIRoute(),
  }));
  expect(result).toEqual({
    mainModel: 'anthropic/claude-opus-5',
    mealRoute: { provider: 'openrouter', model: 'x-ai/grok-4.6' },
  });
});

test('nutrition review, Debug comparison, targets, and drink logging fit a narrow mobile modal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const api = await import('/js/api.js');
    const keys = await import('/js/crypto-key-cache.js');
    keys.updateKeyCache('labcharts-openrouter-key', 'test-openrouter-key');
    localStorage.setItem('labcharts-debug', 'true');
    localStorage.setItem('labcharts-openrouter-model', 'openai/gpt-5.6-sol');
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify([
      { id: 'openai/gpt-5.6-sol', name: 'Vision A' },
      { id: 'anthropic/claude-opus-5', name: 'Vision B' },
    ]));
    localStorage.setItem('labcharts-openrouter-vision-models', JSON.stringify(['openai/gpt-5.6-sol', 'anthropic/claude-opus-5']));
    api.setAIProvider('openrouter');
    await (await import('/js/nutrition.js')).openNutritionEditor();
  });

  await page.locator('#nutrition-meal-name').fill('Fried Edam cheese');
  await page.locator('#nutrition-meal-type').selectOption('dinner');
  await page.locator('[data-nutrition-action="add-component"]').click();
  await page.locator('[data-nutrition-component-name="0"]').fill('Breaded fried Edam cheese');
  await page.locator('[data-nutrition-component-grams="0"]').fill('180');
  await page.locator('[data-nutrition-component-grams="0"]').blur();
  await page.locator('#nutrition-carbohydrateG').fill('90');
  await page.locator('#nutrition-fatG').fill('40');
  await expect(page.locator('#nutrition-fuel-preview')).toBeVisible();
  await page.locator('[data-nutrition-action="toggle-comparison"]').first().click();

  const mobileLayout = await page.evaluate(() => {
    const modal = document.querySelector('#detail-modal');
    const modalRect = modal.getBoundingClientRect();
    const selectors = [
      '#nutrition-meal-type', '.nutrition-component-row', '#nutrition-model-comparison',
      '.nutrition-comparison-model', '.nutrition-comparison-reference-grid', '.nutrition-fuel-preview',
    ];
    const offenders = selectors.flatMap(selector => [...document.querySelectorAll(selector)])
      .filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.left < modalRect.left - 1 || rect.right > modalRect.right + 1;
      })
      .map(element => element.className || element.id || element.tagName);
    const touchTargets = [
      document.querySelector('#detail-modal > .modal-close'),
      document.querySelector('.nutrition-mode-navigation button'),
      document.querySelector('#nutrition-run-comparison'),
      document.querySelector('.nutrition-comparison-model'),
    ].filter(Boolean).map(element => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    const controlFontSizes = [
      document.querySelector('[data-nutrition-reference="mealName"]'),
      document.querySelector('[data-nutrition-reference="energyKcal"]'),
      document.querySelector('#nutrition-meal-type'),
    ].filter(Boolean).map(element => Number.parseFloat(getComputedStyle(element).fontSize));
    return {
      modalOverflow: modal.scrollWidth - modal.clientWidth,
      modalInsideViewport: modalRect.left >= -1 && modalRect.right <= innerWidth + 1
        && modalRect.top >= -1 && modalRect.bottom <= innerHeight + 1,
      offenders,
      touchTargets,
      controlFontSizes,
    };
  });
  expect(mobileLayout.modalOverflow).toBeLessThanOrEqual(1);
  expect(mobileLayout.modalInsideViewport).toBe(true);
  expect(mobileLayout.offenders).toEqual([]);
  expect(mobileLayout.touchTargets.every(target => target.width >= 44 && target.height >= 44)).toBe(true);
  expect(mobileLayout.controlFontSizes.every(size => size >= 16)).toBe(true);
  const firstModel = page.locator('[data-nutrition-comparison-model]').first();
  await firstModel.uncheck();
  await expect(page.locator('[data-nutrition-comparison-model]:checked')).toHaveCount(1);
  await firstModel.check();
  await expect(page.locator('[data-nutrition-comparison-model]:checked')).toHaveCount(2);
  await page.getByRole('button', { name: 'Log meal' }).click();
  await expect(page.locator('.nutrition-component-confidence')).toContainText('Review identity');

  const mobileSurfaces = [
    {
      open: 'openNutritionTargets',
      selectors: ['#nutrition-target-settings', '.nutrition-target-form', '.nutrition-widget-metric-group'],
      controls: ['#nutrition-target-energy', '#nutrition-target-protein-basis'],
      targets: ['.nutrition-widget-metric-option', '[data-nutrition-action="save-targets"]'],
    },
    {
      open: 'openFluidLog',
      selectors: ['.nutrition-fluid-log', '.nutrition-fluid-kind-grid', '.nutrition-fluid-presets', '.nutrition-fluid-preview'],
      controls: ['#nutrition-fluid-amount', '#nutrition-fluid-at', '#nutrition-fluid-label'],
      targets: ['.nutrition-fluid-kind', '.nutrition-fluid-preset', '[data-nutrition-action="save-fluid"]'],
    },
  ];
  for (const surface of mobileSurfaces) {
    await page.evaluate(async open => (await import('/js/nutrition.js'))[open](), surface.open);
    const audit = await page.evaluate(({ selectors, controls, targets }) => {
      const modal = document.querySelector('#detail-modal');
      const modalRect = modal.getBoundingClientRect();
      const offenders = selectors.flatMap(selector => [...document.querySelectorAll(selector)])
        .filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.left < modalRect.left - 1 || rect.right > modalRect.right + 1;
        });
      const fontSizes = controls.flatMap(selector => [...document.querySelectorAll(selector)])
        .map(element => Number.parseFloat(getComputedStyle(element).fontSize));
      const touchTargets = targets.flatMap(selector => [...document.querySelectorAll(selector)])
        .map(element => element.getBoundingClientRect());
      return {
        modalOverflow: modal.scrollWidth - modal.clientWidth,
        modalInsideViewport: modalRect.left >= -1 && modalRect.right <= innerWidth + 1
          && modalRect.top >= -1 && modalRect.bottom <= innerHeight + 1,
        offenderCount: offenders.length,
        fontSizes,
        targetSizes: touchTargets.map(rect => ({ width: rect.width, height: rect.height })),
      };
    }, surface);
    expect(audit.modalOverflow).toBeLessThanOrEqual(1);
    expect(audit.modalInsideViewport).toBe(true);
    expect(audit.offenderCount).toBe(0);
    expect(audit.fontSizes.every(size => size >= 16)).toBe(true);
    expect(audit.targetSizes.every(target => target.width >= 44 && target.height >= 44)).toBe(true);
  }
});

test('mobile photo analysis moves focus to the editable review', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://openrouter.ai/api/v1/chat/completions', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            mealName: 'Mobile rice bowl',
            components: [{
              name: 'Rice and chicken', quantityG: 320, confidence: 0.75,
              nutrients: { energyKcal: 560, proteinG: 35, carbohydrateG: 68, fatG: 14, fiberG: 5, fluidMl: null, plainWaterMl: null },
            }],
            nutrients: { energyKcal: 560, proteinG: 35, carbohydrateG: 68, fatG: 14, fiberG: 5, fluidMl: null, plainWaterMl: null },
            confidence: 0.75,
            assumptions: [], warnings: [], label: null,
          }),
        },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    }),
  }));
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const api = await import('/js/api.js');
    const keys = await import('/js/crypto-key-cache.js');
    keys.updateKeyCache('labcharts-openrouter-key', 'test-openrouter-key');
    localStorage.setItem('labcharts-openrouter-model', 'openai/gpt-5.6-sol');
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify([{ id: 'openai/gpt-5.6-sol', name: 'Vision A' }]));
    localStorage.setItem('labcharts-openrouter-vision-models', JSON.stringify(['openai/gpt-5.6-sol']));
    api.setAIProvider('openrouter');
    await (await import('/js/nutrition.js')).openNutritionEditor();
  });

  await page.locator('#nutrition-photo-input').setInputFiles({ name: 'mobile-meal.png', mimeType: 'image/png', buffer: TINY_PNG });
  await page.locator('#nutrition-analyze-btn').click();
  await page.locator('#cloud-ai-consent-checkbox').check();
  await page.locator('[data-cloud-ai-consent-action="approve"]').click();

  await expect(page.locator('#nutrition-meal-name')).toHaveValue('Mobile rice bowl');
  await expect(page.locator('.nutrition-review-heading')).toBeFocused();
  const handoff = await page.evaluate(() => {
    const modal = document.querySelector('#detail-modal');
    const heading = document.querySelector('.nutrition-review-heading');
    const modalRect = modal.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    return { scrollTop: modal.scrollTop, headingVisible: headingRect.top >= modalRect.top && headingRect.top < modalRect.bottom };
  });
  expect(handoff.scrollTop).toBeGreaterThan(0);
  expect(handoff.headingVisible).toBe(true);
});

test('a recent meal opens into its saved photo, nutrients, and uncertainty details', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const store = await import('/js/nutrition-store.js');
    await store.saveActiveProfileMeal({
      name: 'Lentil bowl',
      eatenAt: new Date().toISOString(),
      nutrients: { energyKcal: 610, proteinG: 31, ironMg: 8.2 },
      components: [{ name: 'Lentils', quantityG: 210, confidence: 0.8 }],
      assumptions: ['One tablespoon olive oil'],
      warnings: ['Dressing quantity is estimated'],
      confidence: 0.73,
      source: { kind: 'ai-photo-estimate', provider: 'openrouter', model: 'anthropic/claude-opus-5' },
      reviewed: true,
    });
    await (await import('/js/nutrition.js')).openNutritionEditor();
  });

  await page.getByRole('button', { name: 'Browse meals' }).click();
  await page.locator('[data-nutrition-action="detail"]').click();
  await expect(page.locator('#detail-modal')).toContainText('Lentil bowl');
  await expect(page.locator('#detail-modal')).toContainText('610 kcal');
  await expect(page.locator('#detail-modal')).toContainText('31 g');
  await expect(page.locator('#detail-modal')).toContainText('Dressing quantity is estimated');
  await expect(page.locator('[data-nutrition-action="back"]')).toBeVisible();
});

test('the logger links to a bounded chronological meal timeline on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async () => {
    const store = await import('/js/nutrition-store.js');
    const base = new Date();
    for (let index = 0; index < 50; index += 1) {
      const eatenAt = new Date(base);
      eatenAt.setDate(eatenAt.getDate() - Math.floor(index / 2));
      eatenAt.setHours(index % 2 ? 12 : 18, 0, 0, 0);
      const localDate = `${eatenAt.getFullYear()}-${String(eatenAt.getMonth() + 1).padStart(2, '0')}-${String(eatenAt.getDate()).padStart(2, '0')}`;
      await store.saveActiveProfileMeal({
        name: `Recent meal ${index + 1}`,
        eatenAt: eatenAt.toISOString(),
        localDate,
        localTimeMinutes: index % 2 ? 720 : 1080,
        mealType: 'snack',
        nutrients: { energyKcal: 200 + index },
        components: [{ name: `Ingredient ${index + 1}`, quantityG: 100 }],
        reviewed: true,
      });
    }
    await (await import('/js/nutrition.js')).openNutritionEditor();
  });

  const recent = page.locator('.nutrition-recent');
  const manualTab = page.getByRole('tab', { name: 'Manual' });
  expect(await manualTab.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await manualTab.click();
  await expect(page.locator('#detail-modal')).toHaveClass(/nutrition-manual-mode/);
  await expect(page.locator('.nutrition-photo-picker')).toBeHidden();
  await expect(page.locator('.nutrition-review-panel')).toBeVisible();
  await expect(recent).toContainText('Browse every saved meal');
  await expect(recent.locator('.nutrition-meal-row')).toHaveCount(0);
  await recent.getByRole('button', { name: 'Browse meals' }).click();
  const modal = page.locator('#detail-modal');
  const timeline = page.locator('.nutrition-meal-timeline');
  await expect(page.getByRole('tab', { name: 'Meals' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.nutrition-history-meals-head')).toContainText('50 entries');
  await expect(page.locator('.nutrition-history-meals-head')).toContainText('Showing newest 12 of 50');
  await expect(timeline.locator('.nutrition-meal-row')).toHaveCount(12);
  await expect(timeline.locator('.nutrition-meal-row').first()).toContainText('Recent meal 1');
  expect(await timeline.locator('.nutrition-meal-delete').first().evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  const showMore = page.getByRole('button', { name: /Show more meals/ });
  await expect(showMore).toContainText('38 remaining');
  expect(await showMore.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await modal.evaluate(element => { element.scrollTop = 240; });
  await showMore.evaluate(element => element.click());
  await expect(timeline.locator('.nutrition-meal-row')).toHaveCount(24);
  await expect(page.getByRole('button', { name: /Show more meals/ })).toContainText('26 remaining');
  await expect.poll(() => modal.evaluate(element => element.scrollTop)).toBeGreaterThanOrEqual(230);
});
