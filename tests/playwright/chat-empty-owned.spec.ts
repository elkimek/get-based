import type { Locator, Page } from '@playwright/test';
import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture, installDiscussionProvider } from '../helpers/chat-discussion-fixture.js';
import type { ChatEmptyKind } from '../../js/chat-empty-presentation.js';

async function waitForChatTransitions(root: Locator): Promise<void> {
  // Hidden panels can have unrelated transitions. Wait only for this view and
  // its ancestors, including inherited theme colors.
  await expect.poll(() => root.evaluate(element => {
    const animations = new Set(element.getAnimations({ subtree: true }));
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      for (const animation of parent.getAnimations()) animations.add(animation);
    }
    return [...animations].filter(animation =>
      animation instanceof CSSTransition && animation.playState === 'running'
    ).length;
  }), { message: 'Chat theme transitions should settle' }).toBe(0);
}

async function applyTheme(page: Page, root: Locator, theme: string): Promise<void> {
  const applied = await page.evaluate(async theme => {
    const themeModule = await import('/js/theme.js');
    const result = await themeModule.setTheme(theme);
    document.getElementById('chat-messages')!.scrollTop = 0;
    return { result, theme: themeModule.getTheme() };
  }, theme);
  expect(applied).toEqual({ result: true, theme });
  await waitForChatTransitions(root);
}

async function renderState(page: Page, kind: ChatEmptyKind): Promise<void> {
  await page.evaluate(async kind => {
    const { state } = await import('/js/state.js');
    const profile = await import('/js/profile.js');
    const id = state.currentProfile;
    if (!state.profiles) throw new Error('Profile fixture unavailable');
    state.profiles = state.profiles.map(item => item.id === id ? { ...item, name: 'Ada <literal>' } : item);
    state.profileSex = 'male';
    state.chatHistory = [];

    const data = profile.createDefaultProfileData();
    const values: Record<string, unknown> = {};
    if (kind === 'partial' || kind === 'general') {
      values.healthGoals = ['better energy'];
      values.sleepRest = { quality: 'fragmented' };
    }
    if (kind === 'complete') {
      Object.assign(values, {
        healthGoals: ['better energy'], diagnoses: { conditions: [{ name: 'hypothyroid' }] },
        diet: { style: 'omnivore' }, exercise: { frequency: '3x/week' },
        sleepRest: { quality: 'fragmented' }, lightCircadian: { morningLight: 'daily' },
        stress: { level: 'medium' }, loveLife: { status: 'partnered' }, environment: { air: ['city'] },
      });
    }
    if (kind === 'nudge' || kind === 'general') {
      values.entries = [{ date: '2026-06-01', markers: { 'biochemistry.glucose': 5.2 } }];
    }
    if (kind === 'general') values.diet = { style: 'omnivore' };
    (state as unknown as { importedData: unknown }).importedData = { ...data, ...values };
    (await import('/js/data.js')).invalidateActiveDataCache();

    localStorage.setItem('labcharts-ai-paused', kind === 'paused' ? 'true' : 'false');
    localStorage.setItem('labcharts-ai-provider', 'ollama');
    localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1');
    for (const key of [`labcharts-onboard-context-cards-skipped-${id}`, `labcharts-onboard-context-cards-done-${id}`]) {
      localStorage.removeItem(key);
    }
    for (const key of [`chat-onboard-force-step-${id}`, `chat-onboard-force-context-cards-${id}`, `chat-onboard-provider-requested-${id}`]) {
      sessionStorage.removeItem(key);
    }
    if (kind === 'handoff') localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1');
    const before = JSON.stringify(state.importedData);
    (await import('/js/chat-render.js')).renderChatMessages();
    Object.assign(window, { emptyRenderSnapshot: before });
  }, kind);
}

test('authored empty Chat states preserve profile data and keep controls accessible in all themes and narrow layouts', async ({ page, context }, info) => {
  test.setTimeout(120000);
  await installDiscussionFixture(context);
  await installDiscussionProvider(context);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(async () => { await (await import('/js/chat-loader.js')).openChatPanel(); });
  await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });

  const states: ChatEmptyKind[] = ['paused', 'initial', 'partial', 'complete', 'handoff', 'nudge', 'general'];
  const expected = {
    paused: 'AI features are currently paused.', initial: 'Add optional context.',
    partial: "You've filled 2 of 9 context areas.", complete: 'your context cards are complete.',
    handoff: 'Context cards are skipped for now', nudge: 'I can see your lab results',
    general: 'What are my most concerning results?',
  };
  for (const kind of states) {
    await renderState(page, kind);
    const root = page.locator('[data-chat-empty-view]');
    await expect(root).toBeAttached();
    await expect(root.locator(':scope > .chat-msg, :scope > .chat-empty')).toBeVisible();
    await expect(root).toContainText(expected[kind]);

    for (const width of [320, 1100]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['dark', 'light', 'glass', 'synth-sunrise', 'neuromancer', 'cyberterm']) {
        await applyTheme(page, root, theme);
        const bounds = await page.locator('#chat-messages').evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }));
        expect(bounds.scroll - bounds.client, `${kind}/${width}/${theme} overflow`).toBeLessThanOrEqual(1);
        const violations = await root.evaluate(async element => (
          await (window as unknown as { axe: typeof import('axe-core') }).axe.run(element, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
          })
        ).violations.map(item => ({
          id: item.id, targets: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
        })));
        expect(violations, `${kind}/${width}/${theme} accessibility`).toEqual([]);
        for (const button of await root.locator('button:not([data-chat-empty-context-slot] button)').all()) {
          const box = await button.boundingBox();
          if (box) {
            expect(box.height, `${kind} ${await button.textContent()} height`).toBeGreaterThanOrEqual(44);
            expect(box.width).toBeGreaterThanOrEqual(44);
          }
        }
      }
      if (kind === 'partial' || kind === 'general') {
        await applyTheme(page, root, 'dark');
        await page.screenshot({ path: info.outputPath(`chat-empty-${kind}-${width}.png`) });
      }
    }
    expect(await page.evaluate(async () =>
      JSON.stringify((await import('/js/state.js')).state.importedData) ===
      (window as unknown as { emptyRenderSnapshot: string }).emptyRenderSnapshot
    )).toBe(true);
  }
  await page.locator('[data-chat-empty-action="use-prompt"]').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-chat-transcript-view]')).toContainText('What are my most concerning results?');
  expect(errors).toEqual([]);
});
