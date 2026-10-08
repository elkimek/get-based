import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';

test.beforeEach(async ({ context }) => { await installDiscussionFixture(context); });

test('authored onboarding AI states are readable, responsive, keyboard accessible and motion safe', async ({ page }, info) => {
  test.setTimeout(120000); await page.goto('/app');
  await page.evaluate(async () => {
    localStorage.setItem('labcharts-ai-paused', 'true');
    await (await import('/js/light-sun-loader.js')).loadLightSunUI();
    const host = document.createElement('div'); host.id = 'owned-onboarding-ai';
    host.style.cssText = 'position:fixed;top:20px;left:16px;right:16px;bottom:70px;overflow:auto;z-index:20000;background:var(--bg-card);padding:12px'; document.body.append(host);
  });
  const host = page.locator('#owned-onboarding-ai');
  for (const width of [320, 1100]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['dark', 'light', 'glass', 'synth-sunrise', 'neuromancer', 'cyberterm']) {
      await page.evaluate(async value => (await import('/js/theme.js')).setTheme(value), theme);
      for (const status of ['idle', 'analyzing', 'error', 'ok'] as const) {
        await host.evaluate(async (element, status) => {
          const [{ projectOnboardingAI }, { renderHTML }] = await Promise.all([import('/js/light-onboarding-ai-presentation.js'), import('/js/components/LightOnboardingAI.svelte.html.js')]);
          const view = projectOnboardingAI({ completed: true, provider: true, status, prefix: '⚠',
            analysis: { status: 'ok', dot: 'yellow', tip: 'Keep morning daylight consistent', detail: 'Balance daytime light and a dim evening.', actions: ['Open curtains', 'Walk outside', 'Dim lamps'], errorMessage: 'Connection unavailable; try again.' } });
          element.innerHTML = renderHTML({ view: view! });
        }, status);
        expect(await host.evaluate(element => element.scrollWidth - element.clientWidth), `${width}/${theme}/${status} overflow`).toBeLessThanOrEqual(1);
        const violations = await host.evaluate(async element => (await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
        expect(violations, `${width}/${theme}/${status}`).toEqual([]);
        const button = host.getByRole('button');
        if (status !== 'analyzing') {
          await button.focus(); await expect(button).toBeFocused(); await expect(button).toHaveCSS('outline-width', '2px');
          if (await page.evaluate(() => matchMedia('(pointer:coarse)').matches)) {
            const box = await button.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
          }
        }
      }
    }
    await host.screenshot({ path: info.outputPath(`onboarding-ai-${width}.png`) });
  }
  await host.evaluate(async element => {
    const [{ projectOnboardingAI }, { renderHTML }] = await Promise.all([import('/js/light-onboarding-ai-presentation.js'), import('/js/components/LightOnboardingAI.svelte.html.js')]);
    element.innerHTML = renderHTML({ view: projectOnboardingAI({ completed: true, provider: true, status: 'error', prefix: '·', analysis: { errorMessage: 'x'.repeat(500) } })! });
  });
  await page.setViewportSize({ width: 320, height: 1000 });
  expect(await host.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await host.evaluate(async element => {
    const [{ projectOnboardingAI }, { renderHTML }] = await Promise.all([import('/js/light-onboarding-ai-presentation.js'), import('/js/components/LightOnboardingAI.svelte.html.js')]);
    element.innerHTML = renderHTML({ view: projectOnboardingAI({ completed: true, provider: true, status: 'analyzing', prefix: '·', analysis: null })! });
  });
  await expect(host.locator('.sun-session-ai-dot-shimmer')).toHaveCSS('animation-name', 'shimmer');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(host.locator('.sun-session-ai-dot-shimmer')).toHaveCSS('animation-name', 'none');
  await expect(host.locator('.sun-session-ai-dot-shimmer')).toHaveCSS('transition-duration', '0s');
  await expect(host.locator('.sun-session-ai-dot-shimmer')).toHaveCSS('transform', 'none');
});

test('authored setup AI refresh delegates run actual loading, failure, retry and canonical result persistence', async ({ page }) => {
  await page.goto('/app');
  await page.evaluate(async () => {
    localStorage.setItem('labcharts-ai-paused', 'true');
    await (await import('/js/light-sun-loader.js')).loadLightSunUI();
    const [{ state }, profile, data, setup, runtime] = await Promise.all([import('/js/state.js'), import('/js/profile.js'), import('/js/data.js'), import('/js/sun-defaults.js'), import('/js/ai-verdict-engine-runtime.js')]);
    const host = document.createElement('div'); host.id = 'onboarding-ai-flow';
    host.style.cssText = 'position:fixed;top:20px;left:16px;right:16px;bottom:70px;overflow:auto;z-index:20000;background:var(--bg-card);padding:12px'; document.body.append(host);
    state.importedData = profile.createDefaultProfileData(); state.importedData.sunDefaults = { fitzpatrick: 'II', completedAt: 1 };
    if (!await data.saveImportedData()) throw new Error('Could not seed setup AI');
    localStorage.setItem('labcharts-ollama', JSON.stringify({ url: 'http://127.0.0.1:11434', model: 'setup-fixture', mode: 'ollama' }));
    localStorage.setItem('labcharts-ollama-model', 'setup-fixture'); localStorage.setItem('labcharts-ai-paused', 'false');
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    const requests: object[] = []; const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      if (!String(input instanceof Request ? input.url : input).includes('/v1/chat/completions')) return originalFetch(input, options);
      requests.push(JSON.parse(String(options?.body || '{}')));
      if (requests.length === 1) { await gate; return Response.json({ choices: [{ message: { content: 'Synthetic malformed verdict' } }] }); }
      return Response.json({ choices: [{ message: { content: JSON.stringify({ dot: 'green', tip: 'Keep daylight <literal>', detail: 'Context & timing', actions: ['Open curtains', '<img src=x onerror="danger()">', 'Dim lamps'] }) } }] });
    };
    Object.assign(window, { releaseOnboardingAI: release, onboardingAIRequests: requests });
    runtime.configureAIVerdictRuntimeDeps({ refreshSunSurfaces: () => { host.innerHTML = setup.renderSetupCard(); } });
    host.innerHTML = setup.renderSetupCard();
  });
  const host = page.locator('#onboarding-ai-flow');
  await host.getByRole('button', { name: 'Generate context', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(host.locator('[data-light-onboarding-ai]')).toHaveAttribute('data-ai-state', 'analyzing');
  await page.evaluate(() => (window as unknown as { releaseOnboardingAI(): void }).releaseOnboardingAI());
  await expect(host.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await host.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(host.locator('[data-light-onboarding-ai]')).toHaveAttribute('data-ai-state', 'ok');
  await expect(host.locator('.sun-detail-ai-tip')).toContainText('Keep daylight <literal>');
  expect(await host.locator('.light-setup-ai-actions li').allTextContents()).toEqual(['Open curtains', '<img src=x onerror="danger()">', 'Dim lamps']);
  await expect(host.locator('[data-light-onboarding-ai] img, [data-light-onboarding-ai] script')).toHaveCount(0);
  const saved = await page.evaluate(async () => {
    const [{ state }, crypto, profile] = await Promise.all([import('/js/state.js'), import('/js/crypto.js'), import('/js/profile.js')]);
    return JSON.parse((await crypto.encryptedGetItem(profile.profileStorageKey(state.currentProfile, 'imported')))!);
  });
  expect(saved.sunDefaults.aiAnalysis).toMatchObject({ status: 'ok', dot: 'green', tip: 'Keep daylight <literal>', actions: ['Open curtains', '<img src=x onerror="danger()">', 'Dim lamps'] });
  expect(await page.evaluate(() => (window as unknown as { onboardingAIRequests: object[] }).onboardingAIRequests.length)).toBe(2);
});
