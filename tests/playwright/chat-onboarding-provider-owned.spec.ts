import type { Page } from '@playwright/test';
import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';

async function setup(page: Page) {
  await page.goto('/app');
  await page.evaluate(async () => {
    await (await import('/js/chat-loader.js')).openChatPanel();
    const { state } = await import('/js/state.js');
    await (await import('/js/profile.js')).renameProfile(state.currentProfile, 'Ada <literal>');
    state.profileSex = 'female'; state.profileDob = '1990-01-01';
    state.chatHistory = []; state.importedData.entries = [];
    (await import('/js/api.js')).setAIProvider('custom');
    localStorage.removeItem('labcharts-custom-url'); localStorage.removeItem('labcharts-custom-key');
    (await import('/js/agent-chat-settings.js')).setChatBackend('direct');
    sessionStorage.setItem(`chat-onboard-force-step-${state.currentProfile}`, 'provider');
    (await import('/js/chat-render.js')).renderChatMessages();
  });
  await expect(page.locator('[data-chat-provider-setup-view]')).toBeVisible();
}
const quiz = '[data-chat-provider-view]';
const action = (name: string) => `[data-chat-onboarding-action="${name}"]`;

test.beforeEach(async ({ context, page }) => {
  await installDiscussionFixture(context);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('owned onboarding provider branches retain keyboard back, literal names, skip and progress navigation', async ({ page }) => {
  await setup(page);
  await expect(page.locator(quiz)).toContainText('Welcome, Ada <literal>!');
  await expect(page.locator(`${quiz} literal`)).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Onboarding step 2 of 4: AI setup' })).toBeVisible();
  for (const branch of ['card', 'cli', 'local', 'bitcoin']) {
    const button = page.locator(`${quiz} [data-chat-provider-branch="${branch}"]`);
    await button.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Back to provider options' })).toBeFocused();
    await expect(page.locator(`${quiz} [data-chat-provider-branch]`)).toHaveCount(0);
    if (branch === 'local') {
      for (const href of ['https://ollama.com', 'https://lmstudio.ai', 'https://jan.ai']) await expect(page.locator(`${quiz} a[href="${href}"]`)).toHaveAttribute('rel', 'noopener');
    }
    if (branch === 'bitcoin') await expect(page.locator(`${quiz} [data-chat-provider]`)).toHaveCount(2);
    await page.keyboard.press('Enter');
    await expect(page.locator(`${quiz} [data-chat-provider-branch="card"]`)).toBeVisible();
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-chat-provider-setup-view]'))).toBe(true);
  }
  await page.locator(`${quiz} ${action('skip-provider-setup')}`).click();
  await expect(page.locator('[data-chat-provider-setup-view]')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Onboarding step 3 of 4: Add-ons' })).toBeVisible();
  expect(await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return [localStorage.getItem(`labcharts-onboard-provider-skipped-${state.currentProfile}`), sessionStorage.getItem(`chat-onboard-provider-branch-${state.currentProfile}`)];
  })).toEqual(['1', null]);
  await page.getByRole('button', { name: 'Back to previous onboarding step' }).click();
  await expect(page.locator(quiz)).toBeVisible();
  await page.getByRole('button', { name: 'Back to previous onboarding step' }).click();
  await expect(page.locator('#chat-onboard-name')).toHaveValue('Ada <literal>');
  await expect(page.getByRole('group', { name: 'Onboarding step 1 of 4: Basics' })).toBeVisible();
});

test('owned provider controls retain OAuth, manual keys, local AI, Bitcoin and CLI service handoffs', async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => {
    const calls: string[] = []; Object.assign(window, { onboardingCalls: calls });
    const cli = document.createElement('button'); cli.dataset.settingsAction = 'show-cli-agent-provider';
    cli.addEventListener('click', () => calls.push('cli')); document.body.append(cli);
    (await import('/js/chat-onboarding.js')).configureChatOnboarding({
      closeChatPanel: () => { calls.push('close'); }, openSettingsModal: tab => { calls.push(`settings:${tab}`); },
      switchAIProvider: provider => { calls.push(`provider:${provider}`); }, startOpenRouterOAuth: () => { calls.push('oauth'); },
    });
  });
  for (const [branch, provider] of [['card', 'openrouter'], ['local', 'ollama'], ['bitcoin', 'routstr'], ['bitcoin', 'ppq'], ['cli', 'cli']]) {
    await page.evaluate(async branch => { (await import('/js/chat-onboarding.js')).goToOnboardingStep(2); (await import('/js/chat-onboarding.js')).setProviderQuizBranch(branch!); }, branch);
    await page.locator(`${quiz} [data-chat-provider="${provider}"]`).click();
    const expected = provider === 'cli' ? 'cli' : `provider:${provider}`;
    await expect.poll(() => page.evaluate(() => (window as unknown as { onboardingCalls: string[] }).onboardingCalls.at(-1))).toBe(expected);
  }
  await page.evaluate(async () => { const onboarding = await import('/js/chat-onboarding.js'); onboarding.goToOnboardingStep(2); onboarding.setProviderQuizBranch('card'); });
  await page.locator(`${quiz} ${action('start-openrouter-oauth')}`).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { onboardingCalls: string[] }).onboardingCalls.at(-1))).toBe('oauth');
  await page.evaluate(async () => { const onboarding = await import('/js/chat-onboarding.js'); onboarding.goToOnboardingStep(2); onboarding.backToProviderQuiz(); });
  await page.locator(`${quiz} ${action('open-ai-settings')}`).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { onboardingCalls: string[] }).onboardingCalls.at(-1))).toBe('settings:ai');
  expect(await page.evaluate(() => (window as unknown as { onboardingCalls: string[] }).onboardingCalls)).toEqual([
    'close', 'settings:ai', 'provider:openrouter', 'close', 'settings:ai', 'provider:ollama',
    'close', 'settings:ai', 'provider:routstr', 'close', 'settings:ai', 'provider:ppq',
    'close', 'settings:ai', 'cli', 'oauth', 'close', 'settings:ai',
  ]);
});

test('owned onboarding provider opens the real AI settings and preserves the connected continue step', async ({ page }) => {
  await setup(page);
  await page.locator(`${quiz} [data-chat-provider-branch="local"]`).click();
  await page.locator(`${quiz} [data-chat-provider="ollama"]`).click();
  await expect(page.locator('#settings-modal')).toBeVisible();
  const originalViewport = page.viewportSize()!;
  await page.setViewportSize({ width: originalViewport.width, height: 450 });
  const settingsGeometry = await page.locator('#settings-modal').evaluate(element => {
    const content = element.querySelector<HTMLElement>('.settings-content')!;
    const layout = element.querySelector<HTMLElement>('.settings-layout')!;
    return { scroll: getComputedStyle(content).overflowY, minHeight: getComputedStyle(content).minHeight,
      layoutMinHeight: getComputedStyle(layout).minHeight, bottom: element.getBoundingClientRect().bottom, viewport: window.innerHeight };
  });
  expect(settingsGeometry.scroll).toBe('auto'); expect(settingsGeometry.minHeight).toBe('0px');
  expect(settingsGeometry.layoutMinHeight).toBe('0px'); expect(settingsGeometry.bottom).toBeLessThanOrEqual(settingsGeometry.viewport + 1);
  await page.setViewportSize(originalViewport);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('labcharts-ai-provider'))).toBe('ollama');
  await page.evaluate(async () => {
    (await import('/js/settings.js')).closeSettingsModal();
    await (await import('/js/chat-loader.js')).openChatPanel();
    (await import('/js/chat-onboarding.js')).goToOnboardingStep(2);
  });
  await expect(page.locator('[data-chat-provider-setup-view]')).toContainText('AI connected');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Onboarding step 2 of 3: Add-ons' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to previous onboarding step' }).click();
  await expect(page.getByRole('group', { name: 'Onboarding step 1 of 3: Basics' })).toBeVisible();
});

for (const replacement of ['profile', 'thread', 'history', 'root', 'profile-event', 'displaced-control', 'branch-control']) {
  test(`owned provider ignores retired ${replacement} controls even when reattached`, async ({ page }) => {
    await setup(page);
    const result = await page.evaluate(async replacement => {
      const { state } = await import('/js/state.js');
      const profile = state.currentProfile;
      const old = document.querySelector<HTMLButtonElement>(`${'[data-chat-provider-view]'} [data-chat-provider-branch="card"]`)!;
      if (replacement === 'profile') state.currentProfile = 'replacement-profile';
      if (replacement === 'thread') state.currentThreadId = 'replacement-thread';
      if (replacement === 'history') state.chatHistory = [];
      if (replacement === 'branch-control') (await import('/js/chat-onboarding.js')).setProviderQuizBranch('local');
      if (replacement === 'root') { document.querySelector('[data-chat-provider-setup-view]')!.remove(); await Promise.resolve(); }
      if (replacement === 'profile-event') window.dispatchEvent(new Event('labcharts-profile-switched'));
      const host = document.createElement('div'); host.className = 'chat-provider-quiz'; host.append(old);
      if (replacement === 'branch-control') document.querySelector('[data-chat-provider-setup-view]')!.append(host);
      else document.body.append(host);
      old.click(); await Promise.resolve();
      return [sessionStorage.getItem(`chat-onboard-provider-branch-${profile}`), sessionStorage.getItem(`chat-onboard-provider-branch-${state.currentProfile}`)];
    }, replacement);
    expect(result).toEqual(replacement === 'branch-control' ? ['local', 'local'] : [null, null]);
  });
}

test('owned provider rejects a late extension decline and provider selection after the settings await', async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => {
    const { configureAppExtension } = await import('/js/app-extension-runtime.js');
    configureAppExtension({ id: 'onboarding-pending-test', onboarding: { handleAction: () => new Promise<boolean>(resolve => {
      Object.assign(window, { declineOnboarding: () => resolve(false), onboardingPending: true });
    }) } });
  });
  await page.locator(`${quiz} [data-chat-provider-branch="card"]`).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { onboardingPending: boolean }).onboardingPending)).toBe(true);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js'); state.currentThreadId = 'replacement-thread';
    (window as unknown as { declineOnboarding(): void }).declineOnboarding();
    (await import('/js/app-extension-runtime.js')).configureAppExtension(null);
  });
  await expect(page.locator(`${quiz} .or-oauth-btn`)).toHaveCount(0);
  expect(await page.evaluate(async () => sessionStorage.getItem(`chat-onboard-provider-branch-${(await import('/js/state.js')).state.currentProfile}`))).toBe(null);
  await setup(page);
  await page.evaluate(async () => {
    const calls: string[] = []; Object.assign(window, { onboardingCalls: calls });
    (await import('/js/chat-onboarding.js')).configureChatOnboarding({ closeChatPanel: () => {}, openSettingsModal: () => new Promise<void>(resolve => {
      calls.push('settings'); Object.assign(window, { finishOnboardingSettings: resolve });
    }), switchAIProvider: provider => { calls.push(provider); } });
  });
  await page.locator(`${quiz} [data-chat-provider-branch="local"]`).click();
  await page.locator(`${quiz} [data-chat-provider="ollama"]`).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { onboardingCalls: string[] }).onboardingCalls)).toEqual(['settings']);
  await page.evaluate(async () => { (await import('/js/state.js')).state.chatHistory = []; (window as unknown as { finishOnboardingSettings(): void }).finishOnboardingSettings(); });
  await page.waitForTimeout(350); // Past both the handoff delay and its resolved promise.
  expect(await page.evaluate(() => (window as unknown as { onboardingCalls: string[] }).onboardingCalls)).toEqual(['settings']);
});

test('owned provider preserves extension HTML, delegated branches, extension actions and compatibility styling', async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => {
    (await import('/js/app-extension-runtime.js')).configureAppExtension({ id: 'onboarding-slot-test', onboarding: {
      renderSlot: (slot, context) => {
        if (slot !== 'provider-quiz') return '';
        const attrs = context.actionAttrs as typeof import('../../js/chat-onboarding.js').chatOnboardingActionAttrs;
        return `<div class="chat-provider-quiz"><p>Managed ${context.branch || 'root'}</p><button class="chat-quiz-option" ${attrs('managed-subscribe')}>Choose managed plan</button><button class="chat-quiz-option" ${attrs('set-provider-branch', { 'provider-branch': 'managed' })}>Managed options</button><button ${attrs('back-to-provider-quiz')}>Back to choices</button></div>`;
      },
      handleAction: context => { if (context.action !== 'managed-subscribe') return false; document.body.dataset.managedOnboarding = 'selected'; return true; },
    } });
    (await import('/js/chat-render.js')).renderChatMessages();
  });
  const managed = page.getByRole('button', { name: 'Choose managed plan' });
  await expect(managed).toBeVisible();
  expect(await managed.evaluate(element => ({ padding: getComputedStyle(element).padding, display: getComputedStyle(element).display }))).toEqual({ padding: '12px 14px', display: 'flex' });
  await managed.click(); await expect(page.locator('body')).toHaveAttribute('data-managed-onboarding', 'selected');
  await page.getByRole('button', { name: 'Managed options' }).click(); await expect(page.locator('[data-chat-provider-setup-view]')).toContainText('Managed managed');
  await page.getByRole('button', { name: 'Back to choices' }).click(); await expect(page.locator('[data-chat-provider-setup-view]')).toContainText('Managed root');
  await page.evaluate(async () => { (await import('/js/app-extension-runtime.js')).configureAppExtension(null); (await import('/js/chat-render.js')).renderChatMessages(); });
  await expect(page.locator(quiz)).toContainText('Welcome, Ada <literal>!');
});

test('owned provider themes, layouts, keyboard focus and reduced motion remain accessible', async ({ page }) => {
  test.setTimeout(90000); await setup(page);
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['dark', 'light', 'glass', 'synth-sunrise', 'neuromancer', 'cyberterm']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      const first = page.locator(`${quiz} [data-chat-provider-branch="card"]`); await first.focus();
      await expect(first).toBeFocused();
      expect(await first.evaluate(element => getComputedStyle(element).outlineStyle), `${width}/${theme} focus`).toBe('solid');
      for (const branch of ['', 'card', 'local', 'bitcoin', 'cli']) {
        await page.evaluate(async branch => { (await import('/js/chat-onboarding.js')).setProviderQuizBranch(branch); }, branch);
        const dimensions = await page.locator('[data-chat-onboarding-message]').evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth }));
        expect(dimensions.scroll, `${width}/${theme}/${branch} overflow`).toBeLessThanOrEqual(dimensions.client + 1);
        const violations = await page.evaluate(async () => (await (window as unknown as { axe: { run(context: string, options: object): Promise<{ violations: { id: string; nodes: unknown[] }[] }> } }).axe.run('[data-chat-provider-setup-view]', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations);
        expect(violations, `${width}/${theme}/${branch} accessibility`).toEqual([]);
        if (branch === 'card') expect((await page.locator(`${quiz} .or-oauth-btn`).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await page.evaluate(async () => { (await import('/js/chat-onboarding.js')).backToProviderQuiz(); });
    }
  }
  expect(await page.locator(`${quiz} .chat-quiz-option`).first().evaluate(element => getComputedStyle(element).transitionProperty)).toBe('none');
});


test('owned fullscreen provider setup retains the available transcript width for root and narrow branches', async ({ page }) => {
  await setup(page); await page.setViewportSize({ width: 1600, height: 900 });
  await page.evaluate(async () => { (await import('/js/chat-panel.js')).toggleChatFullscreen(); });
  await expect(page.locator('#chat-panel')).toHaveClass(/chat-panel-fullscreen/);
  for (const branch of ['', 'cli']) {
    await page.evaluate(async branch => { (await import('/js/chat-onboarding.js')).setProviderQuizBranch(branch); }, branch);
    const dimensions = await page.locator('[data-chat-onboarding-message]').evaluate(element => {
      const container = document.getElementById('chat-messages')!; const style = getComputedStyle(container);
      return { bubble: element.getBoundingClientRect().width, available: container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) };
    });
    expect(Math.abs(dimensions.bubble - dimensions.available)).toBeLessThanOrEqual(1);
  }
});
