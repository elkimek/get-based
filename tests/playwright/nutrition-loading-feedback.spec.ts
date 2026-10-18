import { expect, test } from './coverage-fixture.js';
import { checkNutritionFeedback, installNutritionFeedbackFixture } from '../helpers/nutrition-loading-feedback-fixture.js';

test.beforeEach(async ({context}) => {await installNutritionFeedbackFixture(context);});
test('native Nutrition first-use feedback preserves labels, geometry, cancellation and every theme for keyboard activation', async ({page}, info) => {
  test.setTimeout(60000); await page.setViewportSize({width: 1100, height: 900});
  const origin = String(info.project.use.baseURL || ''); expect(origin).not.toBe('');
  await checkNutritionFeedback(page, origin, new Set(['/js/nutrition.js']), 'Enter');
});
test.describe('coarse touch', () => {
  test.use({hasTouch: true});
  test('native compact Nutrition first-use feedback retains the live touch target and all theme/reduced-motion states', async ({page}, info) => {
    test.setTimeout(60000); await page.setViewportSize({width: 360, height: 800});
    await checkNutritionFeedback(page, String(info.project.use.baseURL || ''), new Set(['/js/nutrition.js']), 'tap');
  });
});
