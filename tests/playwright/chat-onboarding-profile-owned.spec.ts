import type { Page } from '@playwright/test';
import { expect, test } from './coverage-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';

const root = '[data-chat-profile-setup-view]';
async function setup(page: Page) {
  await page.goto('/app');
  await page.evaluate(async () => {
    await (await import('/js/chat-loader.js')).openChatPanel();
    const { state } = await import('/js/state.js');
    state.chatHistory = []; state.profileSex = null; state.profileDob = null;
    await (await import('/js/profile.js')).renameProfile(state.currentProfile, 'Default');
    localStorage.setItem('labcharts-location-cache', JSON.stringify({ 'germany|': 52 }));
    (await import('/js/chat-onboarding.js')).goToOnboardingStep(1);
  });
  await expect(page.locator(root)).toBeVisible();
}
async function basics(page: Page) {
  await page.locator('#chat-onboard-name').fill('Ada <literal>');
  await page.getByRole('button', { name: 'Female', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Female', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#chat-onboard-next')).toBeEnabled();
}
test.beforeEach(async ({ context, page }) => {
  await installDiscussionFixture(context); await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('profile fields persist with unit conversion, same-day weight replacement and connected continuation', async ({ page }) => {
  await setup(page);
  await expect(page.locator('#chat-onboard-next')).toBeDisabled();
  await basics(page);
  await page.getByText('Optional body and location context', { exact: true }).click();
  await page.locator('#chat-onboard-dob').fill('1990-01-02');
  await page.locator('#chat-onboard-height').fill('180');
  await page.locator('#chat-onboard-height-unit').selectOption('in');
  await expect(page.locator('#chat-onboard-height')).toHaveValue('70.9');
  await expect(page.locator('#chat-onboard-height')).toHaveAttribute('placeholder', 'inches');
  await page.locator('#chat-onboard-height-unit').selectOption('cm');
  await expect(page.locator('#chat-onboard-height')).toHaveValue('180.1');
  await page.locator('#chat-onboard-height').fill('70');
  await page.locator('#chat-onboard-height-unit').selectOption('in');
  await page.locator('#chat-onboard-height').fill('70');
  await page.locator('#chat-onboard-weight').fill('150');
  await page.locator('#chat-onboard-weight-unit').selectOption('lbs');
  await page.locator('#chat-onboard-country').fill('Germany');
  await expect(page.locator('#chat-onboard-lat')).toContainText('52°N');
  await expect(page.locator('#chat-onboard-next')).toBeEnabled();
  await page.locator('#chat-onboard-next').click();
  await expect(page.locator(root)).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Onboarding step 2 of 3: Add-ons' })).toBeVisible();
  const first = await page.evaluate(async () => {
    const { state } = await import('/js/state.js'); const profile = (await import('/js/profile.js')).getProfiles().find(item => item.id === state.currentProfile)!;
    return { profile, weight: state.importedData.biometrics!.weight };
  });
  expect(first.profile).toMatchObject({ name: 'Ada <literal>', sex: 'female', dob: '1990-01-02', height: 177.8, heightUnit: 'in', location: { country: 'Germany', zip: '' } });
  expect(first.weight).toEqual([expect.objectContaining({ value: 150, unit: 'lbs', source: 'manual' })]);
  await page.evaluate(async () => { (await import('/js/chat-onboarding.js')).goToOnboardingStep(1); });
  await expect(page.locator('#chat-onboard-name')).toHaveValue('Ada <literal>');
  await page.getByText('Optional body and location context', { exact: true }).click();
  await expect(page.locator('#chat-onboard-height')).toHaveValue('70.0');
  await expect(page.locator('#chat-onboard-lat')).toContainText('52°N');
  await page.locator('#chat-onboard-weight').fill('68');
  await page.locator('#chat-onboard-next').click();
  await expect(page.locator(root)).toHaveCount(0);
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.biometrics!.weight)).toEqual([expect.objectContaining({ value: 68, unit: 'kg' })]);
});

test('failed profile writes retain the editable form, report failure and allow retry', async ({ page }) => {
  await setup(page); await basics(page);
  await page.getByText('Optional body and location context', { exact: true }).click();
  await page.locator('#chat-onboard-height').fill('180');
  await page.evaluate(async () => { (await import('/js/chat-onboarding.js')).configureChatOnboarding({ setProfileHeight: async () => false }); });
  await page.locator('#chat-onboard-next').click();
  await expect(page.getByRole('alert')).toContainText('Your entries are still here');
  await expect(page.locator('#chat-onboard-height')).toHaveValue('180');
  await expect(page.locator('#chat-onboard-next')).toBeEnabled();
  await page.evaluate(async () => { const profile = await import('/js/profile.js'); (await import('/js/chat-onboarding.js')).configureChatOnboarding({ setProfileHeight: profile.setProfileHeight }); });
  await page.locator('#chat-onboard-next').click();
  await expect(page.locator(root)).toHaveCount(0);
  expect(await page.evaluate(async () => { const { state } = await import('/js/state.js'); return (await import('/js/profile.js')).getProfileHeight(state.currentProfile); })).toEqual({ height: 180, unit: 'cm' });
});

test('repainting preserves draft values, optional expansion, field focus and selection', async ({ page }) => {
  await setup(page); await basics(page);
  await page.getByText('Optional body and location context', { exact: true }).click();
  await page.locator('#chat-onboard-height').fill('184');
  await page.locator('#chat-onboard-name').focus();
  await page.locator('#chat-onboard-name').evaluate(element => { (element as HTMLInputElement).setSelectionRange(1, 3); });
  await page.evaluate(async () => { (await import('/js/chat-render.js')).renderChatMessages(); });
  await expect(page.locator('#chat-onboard-name')).toBeFocused();
  await expect(page.locator('#chat-onboard-name')).toHaveValue('Ada <literal>');
  await expect(page.locator('#chat-onboard-height')).toHaveValue('184');
  await expect(page.locator('.chat-onboard-more')).toHaveAttribute('open', '');
  expect(await page.locator('#chat-onboard-name').evaluate(element => (element as HTMLInputElement).selectionStart)).toBe(1);
});

for (const boundary of ['profile', 'thread', 'history', 'data', 'root', 'reinserted-root', 'transcript'] as const) {
  test(`a delayed save cannot affect a replacement ${boundary} view`, async ({ page }) => {
    await setup(page); await basics(page);
    await page.getByText('Optional body and location context', { exact: true }).click();
    await page.locator('#chat-onboard-height').fill('180');
    await page.locator('#chat-onboard-weight').fill('88');
    await page.evaluate(async () => {
      (await import('/js/chat-onboarding.js')).configureChatOnboarding({ setProfileHeight: () => new Promise<boolean>(resolve => { Object.assign(window, { finishProfileHeight: resolve }); }) });
    });
    await page.locator('#chat-onboard-next').click();
    await expect(page.locator('.chat-onboard-form')).toHaveAttribute('aria-busy', 'true');
    const result = await page.evaluate(async boundary => {
      const { state } = await import('/js/state.js'); const original = state.importedData;
      const old = document.getElementById('chat-onboard-next') as HTMLButtonElement;
      const container = document.getElementById('chat-messages')!;
      if (boundary === 'profile') state.currentProfile = 'replacement-profile';
      if (boundary === 'thread') state.currentThreadId = 'replacement-thread';
      if (boundary === 'history') state.chatHistory = [...state.chatHistory];
      if (boundary === 'data') state.importedData = (await import('/js/profile.js')).createDefaultProfileData();
      if (boundary === 'root') document.querySelector('[data-chat-profile-setup-view]')!.remove();
      if (boundary === 'reinserted-root') {
        const root = document.querySelector('[data-chat-profile-setup-view]')!;
        root.remove(); container.appendChild(root);
        // Synchronous controls must not revive this owner before MutationObserver delivery.
        old.disabled = false; old.click();
      }
      if (boundary === 'transcript') { state.chatHistory = [{ role: 'user', content: 'Replacement conversation' }]; sessionStorage.removeItem(`chat-onboard-force-step-${state.currentProfile}`); }
      (await import('/js/chat-render.js')).renderChatMessages();
      if (boundary !== 'transcript') (document.getElementById('chat-onboard-name') as HTMLInputElement).value = 'Replacement name';
      container.appendChild(old); old.disabled = false; old.click();
      (window as unknown as { finishProfileHeight(value: boolean): void }).finishProfileHeight(true);
      await new Promise(resolve => setTimeout(resolve, 50));
      return { weight: original.biometrics?.weight || [], replacementWeight: state.importedData.biometrics?.weight || [], step: sessionStorage.getItem(`chat-onboard-force-step-${state.currentProfile}`), text: container.textContent, busy: container.querySelector('.chat-onboard-form')?.getAttribute('aria-busy') };
    }, boundary);
    expect(result.weight).toEqual([]); expect(result.replacementWeight).toEqual([]);
    expect(result.step).not.toBe('extras');
    if (boundary === 'transcript') expect(result.text).toContain('Replacement conversation');
    else { expect(result.busy).toBe('false'); await expect(page.locator('[data-chat-profile-setup-view] #chat-onboard-name')).toHaveValue('Replacement name'); }
  });
}

test('profile form fits every supported theme and narrow layout, with keyboard and accessible controls', async ({ page }) => {
  await setup(page); await basics(page);
  await page.getByText('Optional body and location context', { exact: true }).click();
  await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['dark', 'light', 'glass', 'synth-sunrise', 'neuromancer', 'cyberterm']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      const result = await page.locator(root).evaluate(async (element, width) => {
        const bubble = element.querySelector('.chat-msg')!.getBoundingClientRect();
        const controls = [...element.querySelectorAll('input, select, button, summary')].filter(control => (control as HTMLElement).offsetParent !== null);
        const overflowing = controls.filter(control => { const r = control.getBoundingClientRect(); return r.left < bubble.left - 1 || r.right > bubble.right + 1; }).map(control => control.id || control.tagName);
        const short = width <= 768 ? controls.filter(control => control.getBoundingClientRect().height < 44).map(control => control.id || control.tagName) : [];
        const axe = await (window as unknown as { axe: { run(element: Element, options: unknown): Promise<{ violations: { id: string }[] }> } }).axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
        return { overflowing, short, violations: axe.violations.map(item => item.id) };
      }, width);
      expect(result, `${theme}/${width}`).toEqual({ overflowing: [], short: [], violations: [] });
    }
  }
  await page.locator('#chat-onboard-name').focus(); await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Male', exact: true })).toBeFocused();
  await page.keyboard.press('Space'); await expect(page.getByRole('button', { name: 'Male', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('fullscreen profile setup fills the available transcript width and retains its form draft', async ({ page }) => {
  await setup(page); await basics(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.getByText('Optional body and location context', { exact: true }).click();
  await page.locator('#chat-onboard-height').fill('184');
  await page.getByRole('button', { name: 'Enter fullscreen chat', exact: true }).click();
  await expect(page.locator('#chat-panel')).toHaveClass(/chat-panel-fullscreen/);
  const dimensions = await page.locator('[data-chat-onboarding-message]').evaluate(element => {
    const container = document.getElementById('chat-messages')!;
    const style = getComputedStyle(container);
    return { bubble: element.getBoundingClientRect().width, available: container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) };
  });
  expect(Math.abs(dimensions.bubble - dimensions.available)).toBeLessThanOrEqual(1);
  await expect(page.locator('#chat-onboard-height')).toHaveValue('184');
  await expect(page.locator('.chat-onboard-more')).toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Exit fullscreen chat', exact: true }).click();
  await expect(page.locator('#chat-panel')).not.toHaveClass(/chat-panel-fullscreen/);
  await expect(page.locator('#chat-onboard-height')).toHaveValue('184');
});
