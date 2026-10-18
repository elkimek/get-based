import type { BrowserContext, Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { installDiscussionFixture } from './chat-discussion-fixture.js';
import { seedNutritionMealDetail } from './nutrition-meal-detail-fixture.js';

export async function installNutritionFeedbackFixture(context: BrowserContext) {
  await installDiscussionFixture(context, {paused: true}); await context.addInitScript(seedNutritionMealDetail, {nutritionTargets: {configured: false, widgetNutrients: ['proteinG', 'fluidMl']}});
}
export async function nutritionEditorArtifactPaths(artifact: string) {
  const directory = path.join(artifact, '_app/immutable/chunks'), owners = new Set<string>();
  for (const name of await fs.readdir(directory)) {
    if (!name.endsWith('.js.map')) continue;
    const sourceMap = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8')) as {sources?: string[]};
    if (sourceMap.sources?.some(source => /(?:^|\/)js\/nutrition\.(?:js|ts)(?:\?.*)?$/.test(source))) owners.add('/_app/immutable/chunks/' + name.slice(0, -4));
  }
  expect(owners.size, 'actual production source maps identify the full Nutrition controller chunks').toBeGreaterThan(0);
  return owners;
}
async function nextFeedbackPaint(page: Page) {
  // The shared reduced-motion rule retains a 0.01ms transition on pseudo-elements.
  // Inspect rendered indicator paint after frames, preserving immediate UI checks.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
// Finish deliberate viewport preparation before measuring application feedback.
// Keep repeated native focus/reveal outside the measured activation.
async function prepareFeedbackControl(page: Page, control: Locator) {
  await control.scrollIntoViewIfNeeded(); await control.hover();
  await control.evaluate(button => {if (!(button instanceof HTMLElement)) throw new Error('Expected a Nutrition button'); button.focus({preventScroll: true});});
  await expect(control).toBeFocused(); await nextFeedbackPaint(page);
}
async function visibleFeedbackBounds(page: Page, control: Locator) {
  const bounds = await control.boundingBox();
  if (!bounds) throw new Error('Visible Nutrition control has no bounds');
  const viewport = await page.evaluate(() => ({width: document.documentElement.clientWidth, height: innerHeight}));
  expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  return bounds;
}
async function tapPreparedControl(control: Locator) {
  const receipt = await control.evaluateHandle(button => {
    const touches: {trusted: boolean; pointerType: string}[] = [];
    const record = (event: Event) => {if (event instanceof PointerEvent) touches.push({trusted: event.isTrusted, pointerType: event.pointerType});};
    button.addEventListener('pointerdown', record);
    return {touches, dispose: () => button.removeEventListener('pointerdown', record)};
  });
  try {
    // The entire target is already in view. Keep native touch, stable/enabled
    // checks and hit testing without another automatic viewport adjustment.
    await control.tap({scroll: 'none'});
    expect(await receipt.evaluate(value => value.touches)).toEqual([{trusted: true, pointerType: 'touch'}]);
  } finally {await receipt.evaluate(value => value.dispose()); await receipt.dispose();}
}
async function feedbackPositionFrames(control: Locator, count: number) {
  return control.evaluate(async (button, frameCount) => {
    const sample = () => {
      const box = button.getBoundingClientRect();
      return {box: {x: box.x, y: box.y, width: box.width, height: box.height}, scrollX, scrollY,
        visualTop: visualViewport?.pageTop, visualOffset: visualViewport?.offsetTop, focused: document.activeElement === button};
    };
    const frames = [sample()];
    for (let frame = 0; frame < frameCount; frame++) {await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); frames.push(sample());}
    return frames;
  }, count);
}
async function cancelFeedback(page: Page, control: Locator, status: Locator) {
  const [before] = await feedbackPositionFrames(control, 0), label = (await control.textContent())!.trim();
  expect(before!.focused, 'Cancellation starts on the intended focused control').toBe(true);
  await page.keyboard.press('Escape');
  await expect(control).not.toHaveAttribute('aria-busy'); await expect(status).toHaveText(''); await expect(control).toHaveAccessibleName(label);
  // Observe cancellation before the next theme/focus/scroll preparation can mask
  // a viewport or geometry change. Every frame must match exactly.
  expect(await feedbackPositionFrames(control, 8)).toEqual(Array.from({length: 9}, () => before));
}
async function profileReceipt(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('labcharts-blobs', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);});
    try {
      const transaction = db.transaction('kv', 'readonly'), read = transaction.objectStore('kv').get('labcharts-default-imported');
      return await new Promise<unknown>((resolve, reject) => {transaction.oncomplete = () => typeof read.result === 'string' ? resolve(read.result) : reject(new Error('Missing committed synthetic profile receipt')); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);});
    } finally {db.close();}
  });
}
export async function checkNutritionFeedback(page: Page, origin: string, editorPaths: Set<string>, activation: 'Enter' | 'Space' | 'tap') {
  let release!: () => void; const held = new Promise<void>(done => {release = done;});
  const requests: string[] = [], errors: string[] = [], violations: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeBinding('nutritionFeedbackCsp', (_, directive: string) => {violations.push(directive);});
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {void (window as unknown as {nutritionFeedbackCsp(value: string): Promise<void>}).nutritionFeedbackCsp(event.violatedDirective);}));
  await page.route('**/*', async route => {
    if (!editorPaths.has(new URL(route.request().url()).pathname)) return route.continue();
    requests.push(route.request().url()); await held; return route.continue();
  });
  try {
    await page.goto(origin + '/app'); await expect(page.locator('html[data-app-ready]')).toBeAttached();
    const menu = page.getByRole('button', {name: 'Menu', exact: true}); if (await menu.isVisible()) await menu.click();
    await page.locator('.nav-item[data-category="body"]').click();
    const root = page.locator('[data-nutrition-dashboard-view="intake"]'), control = root.locator('[data-nutrition-action="open"]'), status = root.locator('[data-nutrition-loading-status]');
    await expect(root).toBeVisible(); await expect(status).toBeAttached(); const label = (await control.textContent())!.trim(), profile = await profileReceipt(page);
    await page.evaluate(async () => {const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/themes-extra.css'; const loaded = new Promise<void>((resolve, reject) => {link.onload = () => resolve(); link.onerror = () => reject(new Error('Extra themes unavailable'));}); document.head.append(link); await loaded;});
    await prepareFeedbackControl(page, control);
    expect(requests, 'hover/focus do not evaluate or preload the full editor').toEqual([]);
    for (const theme of ['dark', 'light', 'cyberterm', 'glass', 'neuromancer', 'synth-sunrise']) {
      await page.evaluate(value => {document.documentElement.dataset.theme = value;}, theme);
      for (const reducedMotion of ['no-preference', 'reduce'] as const) {
        await page.emulateMedia({reducedMotion}); await expect(control).toBeFocused(); await nextFeedbackPaint(page);
        const before = await visibleFeedbackBounds(page, control), [position] = await feedbackPositionFrames(control, 0);
        const paint = await control.evaluate(button => {const css = getComputedStyle(button); return {color: css.color, opacity: css.opacity, text: button.textContent};});
        if (activation === 'tap') await tapPreparedControl(control); else await control.press(activation);
        await expect(control).toHaveAttribute('aria-busy', 'true'); await expect(control).toHaveAccessibleName(label); await expect(control).toBeEnabled(); await expect(control).toBeFocused();
        await expect(status).toHaveText('Opening the meal editor…'); await expect(status).toHaveAttribute('role', 'status'); await expect(status).toHaveAttribute('aria-live', 'polite');
        expect(await control.boundingBox(), `${theme}/${reducedMotion}: retained geometry`).toEqual(before);
        expect(await feedbackPositionFrames(control, 0)).toEqual([position]);
        await nextFeedbackPaint(page);
        const indicator = await control.evaluate(button => {
          const css = getComputedStyle(button), after = getComputedStyle(button, '::after'), bounds = button.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(button); const text = range.getBoundingClientRect();
          const ringTop = bounds.bottom - Number.parseFloat(css.borderBottomWidth) - Number.parseFloat(after.bottom) - Number.parseFloat(after.height);
          return {color: css.color, opacity: css.opacity, text: button.textContent, content: after.content, width: after.width, height: after.height, boxSizing: after.boxSizing, border: after.borderTopWidth, borderStyle: after.borderTopStyle, rightColor: after.borderRightColor, borderColor: after.borderTopColor, animation: after.animationName, pointerEvents: after.pointerEvents, textBottom: text.bottom, ringTop};
        });
        expect({color: indicator.color, opacity: indicator.opacity, text: indicator.text}).toEqual(paint);
        expect(indicator).toMatchObject({content: '""', width: '6px', height: '6px', boxSizing: 'border-box', border: '1px', borderStyle: 'solid', rightColor: 'rgba(0, 0, 0, 0)', pointerEvents: 'none'});
        expect(indicator.borderColor).toBe(indicator.color); expect(indicator.textBottom, `${theme} ring stays below readable text`).toBeLessThan(indicator.ringTop);
        expect(indicator.animation).toBe(reducedMotion === 'reduce' ? 'none' : 'nutrition-analysis-spin');
        await cancelFeedback(page, control, status); await expect(control).toHaveAccessibleName(label);
      }
    }
    await page.emulateMedia({forcedColors: 'active', reducedMotion: 'reduce'}); await nextFeedbackPaint(page);
    const before = await visibleFeedbackBounds(page, control), [forcedPosition] = await feedbackPositionFrames(control, 0);
    await control.click({scroll: 'none'}); await expect(control).toHaveAttribute('aria-busy', 'true'); await expect(control).toHaveAccessibleName(label); expect(await control.boundingBox()).toEqual(before);
    expect(await feedbackPositionFrames(control, 0)).toEqual([forcedPosition]);
    await nextFeedbackPaint(page);
    const forced = await control.evaluate(button => {const css = getComputedStyle(button), after = getComputedStyle(button, '::after'); return {text: css.visibility, opacity: css.opacity, border: after.borderTopWidth, animation: after.animationName};});
    expect(forced).toEqual({text: 'visible', opacity: '1', border: '1px', animation: 'none'}); await cancelFeedback(page, control, status);
    // Cover the secondary and starter buttons without replacing the retained
    // controls or inferring their fit from the primary action's dimensions.
    await expect(root.locator('[data-nutrition-action="open-fluid-log"]')).toBeVisible();
    for (const candidate of await root.locator('button[data-nutrition-action]').all()) {
      // Match the real click's hover/focus state before comparing busy paint.
      await prepareFeedbackControl(page, candidate);
      const name = (await candidate.textContent())!.trim(), bounds = await visibleFeedbackBounds(page, candidate), [candidatePosition] = await feedbackPositionFrames(candidate, 0);
      const labelBefore = await candidate.evaluate(button => {const css = getComputedStyle(button); return {color: css.color, opacity: css.opacity, text: button.textContent};});
      if (activation === 'tap') await tapPreparedControl(candidate); else await candidate.click({scroll: 'none'});
      await expect(candidate).toHaveAttribute('aria-busy', 'true'); await expect(candidate).toHaveAccessibleName(name); await expect(candidate).toBeEnabled();
      expect(await candidate.boundingBox()).toEqual(bounds);
      expect(await feedbackPositionFrames(candidate, 0)).toEqual([candidatePosition]);
      await nextFeedbackPaint(page);
      const ring = await candidate.evaluate(button => {
        const css = getComputedStyle(button), after = getComputedStyle(button, '::after'), box = button.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(button);
        return {content: after.content, width: after.width, height: after.height, sizing: after.boxSizing, border: after.borderTopWidth, pointer: after.pointerEvents, textBottom: range.getBoundingClientRect().bottom,
          ringTop: box.bottom - Number.parseFloat(css.borderBottomWidth) - Number.parseFloat(after.bottom) - Number.parseFloat(after.height)};
      });
      expect(ring).toMatchObject({content: '""', width: '6px', height: '6px', sizing: 'border-box', border: '1px', pointer: 'none'});
      expect(ring.textBottom, `${name}: ring stays below actual label`).toBeLessThan(ring.ringTop);
      const labelDuring = await candidate.evaluate(button => {const css = getComputedStyle(button); return {color: css.color, opacity: css.opacity, text: button.textContent};}); expect(labelDuring).toEqual(labelBefore);
      await expect(status).not.toHaveText(''); await cancelFeedback(page, candidate, status);
    }
    expect(requests).toHaveLength(1); release(); await page.waitForLoadState('networkidle'); await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
    expect(await profileReceipt(page)).toEqual(profile); expect(errors).toEqual([]); expect(violations).toEqual([]);
  } finally {release();}
}
