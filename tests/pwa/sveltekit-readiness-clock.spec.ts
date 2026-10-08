import path from 'node:path';
import {expect, test} from '@playwright/test';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {readyLightArtifact} from '../helpers/light-artifact-navigation.js';

test('static readiness measures navigation independently of the shared browser test clock', async ({page, context}) => {
  await installDiscussionFixture(context);
  await page.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));
  // Playwright's context clock survives navigation and is shared by new pages.
  // Its hour of synthetic age must never become an app loading measurement.
  await page.clock.fastForward(3_600_000);
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  try {
    const readyMs = await readyLightArtifact(page, server.origin);
    const browserClockMs = await page.evaluate(() => performance.now());
    expect(browserClockMs).toBeGreaterThanOrEqual(3_600_000);
    expect(readyMs).toBeGreaterThan(0);
    expect(readyMs).toBeLessThan(3_600_000);
    await test.info().attach('readiness-clock.json', {body: JSON.stringify({readyMs, browserClockMs}), contentType: 'application/json'});
  } finally {await server.close();}
});
