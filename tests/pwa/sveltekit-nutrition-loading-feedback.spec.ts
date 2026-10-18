import path from 'node:path';
import { test } from '@playwright/test';
import { startKitServer } from './kit-server.js';
import { checkNutritionFeedback, installNutritionFeedbackFixture, nutritionEditorArtifactPaths } from '../helpers/nutrition-loading-feedback-fixture.js';
const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');

test('actual optimized Kit Nutrition feedback retains theme styling and cold ownership on first activation', async ({page, context}, info) => {
  test.setTimeout(60000); await installNutritionFeedbackFixture(context);
  const touch = !!info.project.use.hasTouch; if (!touch) await page.setViewportSize({width: 1100, height: 900});
  const server = await startKitServer(artifact);
  try {await checkNutritionFeedback(page, server.origin, await nutritionEditorArtifactPaths(artifact), touch ? 'tap' : 'Space');}
  finally {await server.close();}
});
