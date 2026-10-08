import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { startLightAIProfileOwnership, finishLightAIProfileOwnership, lightAIProfileRequestCount } from '../helpers/light-ai-ownership-fixture.js';

test('actual profile switches isolate same-ID onboarding responses and persisted results', async ({ page, context }) => {
  await installDiscussionFixture(context); await page.goto('/app');
  await page.evaluate(startLightAIProfileOwnership);
  await expect.poll(() => page.evaluate(lightAIProfileRequestCount)).toBe(1);
  const outcome = await page.evaluate(finishLightAIProfileOwnership);
  expect(outcome.initial).toBe('idle'); expect(outcome.retired).toBeNull(); expect(outcome.aUnchanged).toBe(true);
  expect(outcome.current).toMatchObject({ status: 'ok', tip: 'Current B response' });
  expect(outcome.profile).toBe(outcome.bId);
  expect(outcome.b.sunDefaults.aiAnalysis).toMatchObject({ status: 'ok', tip: 'Current B response' });
  expect(outcome.b).toEqual({ ...outcome.beforeB, sunDefaults: outcome.b.sunDefaults });
  expect(outcome.live).toEqual(outcome.b);
});
