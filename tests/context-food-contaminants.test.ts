// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import { scanDietForContaminants } from '../js/food-contaminants.js';
import { foodContaminantSections, foodContaminantFlaggedCount } from '../js/context-food-contaminants-model.js';
import { renderDietContaminantsBadge } from '../js/context-food-contaminants-badge.js';
import { configureContextCardLifestyleRuntimeDeps, discussDietContaminantsRuntime } from '../js/context-card-lifestyle-runtime.js';
import { setNutritionContextEnabled } from '../js/lab-context-settings.js';
let previous: ReturnType<typeof configureContextCardLifestyleRuntimeDeps>;
const close = vi.fn(), open = vi.fn(), prompt = vi.fn();
beforeEach(() => {
  vi.useFakeTimers(); close.mockReset(); open.mockReset().mockResolvedValue(true); prompt.mockReset(); localStorage.clear();
  state.currentProfile = 'food-origin'; state.importedData = createDefaultProfileData(); state.currentThreadId = 'food-thread'; state.chatHistory = []; state.nutritionSummary = null;
  previous = configureContextCardLifestyleRuntimeDeps({ closeModal: close, openChatPanel: open, useChatPrompt: prompt });
});
afterEach(() => { configureContextCardLifestyleRuntimeDeps(previous); vi.useRealTimers(); vi.restoreAllMocks(); });
it('groups the unchanged domain signals in their established order without mutating inputs', () => {
  const warnings = scanDietForContaminants({ breakfast: 'strawberries and yogurt', lunch: 'canned tuna with avocado' }), before = structuredClone(warnings);
  const sections = foodContaminantSections(warnings);
  expect(sections.map(section => section.type)).toEqual(['pesticide', 'plastic', 'clean']);
  expect(sections.flatMap(section => section.items).map(item => item.warning).sort()).toEqual(warnings.map(item => item.warning).sort());
  expect(sections.map(section => section.caution)).toEqual([true, true, false]); expect(warnings).toEqual(before);
  expect(foodContaminantFlaggedCount(warnings)).toBe(warnings.filter(item => item.type !== 'clean').length);
});
it('keeps literal source text and omits unsafe or malformed hrefs', () => {
  const section = foodContaminantSections(['javascript:alert(1)', 'data:text/html,bad', '/relative', 'https://example.org/study?q=a&b=c'].map(url => ({ type: 'plastic', warning: '<literal> & text', source: '<source>', match: 'test', url })))[0]!;
  expect(section.items.map(item => item.href)).toEqual([null, null, null, 'https://example.org/study?q=a&b=c']); expect(section.items.every(item => item.warning === '<literal> & text' && item.source === '<source>')).toBe(true);
  expect(foodContaminantSections([])).toEqual([]);
});
it('renders one authored native-button badge and preserves clean-only and detailed-meal precedence', () => {
  state.importedData.diet = { breakfast: 'spinach with pineapple', lunch: 'canned beans' };
  const html = renderDietContaminantsBadge(); document.body.innerHTML = html;
  expect(document.querySelector('button[data-food-contaminant-badge]')?.textContent).toContain('2 food contaminant signals detected'); expect(document.querySelector('[onclick]')).toBeNull();
  state.nutritionSummary = { totalMeals: 1 }; expect(renderDietContaminantsBadge()).toBe('');
  setNutritionContextEnabled(false); expect(renderDietContaminantsBadge()).toBe(html);
  state.nutritionSummary = null; state.importedData.diet = { breakfast: 'pineapple and avocado' }; expect(renderDietContaminantsBadge()).toBe('');
});
it('waits for the accepted chat opening and delay before using the original prompt port once', async () => {
  let release!: (value: boolean) => void; open.mockReturnValueOnce(new Promise<boolean>(resolve => { release = resolve; }));
  const handoff = discussDietContaminantsRuntime(); expect(close).toHaveBeenCalledOnce(); expect(open).toHaveBeenCalledOnce(); expect(prompt).not.toHaveBeenCalled();
  const replacement = vi.fn(); configureContextCardLifestyleRuntimeDeps({ useChatPrompt: replacement });
  await vi.advanceTimersByTimeAsync(500); expect(prompt).not.toHaveBeenCalled(); release(true); await vi.advanceTimersByTimeAsync(299); expect(prompt).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(1);
  expect(await handoff).toBe(true); expect(prompt).toHaveBeenCalledExactlyOnceWith('What food contaminants should I be concerned about based on my diet?'); expect(replacement).not.toHaveBeenCalled();
});
for (const retirement of ['profile', 'data', 'thread', 'history', 'caller'] as const) it(`rejects a ${retirement} change during the delayed prompt handoff`, async () => {
  let current = true; const handoff = discussDietContaminantsRuntime(() => current); await vi.advanceTimersByTimeAsync(0);
  if (retirement === 'profile') state.currentProfile = 'other';
  else if (retirement === 'data') state.importedData = createDefaultProfileData();
  else if (retirement === 'thread') state.currentThreadId = 'other-thread';
  else if (retirement === 'history') state.chatHistory = [];
  else current = false;
  await vi.advanceTimersByTimeAsync(300); expect(await handoff).toBe(false); expect(prompt).not.toHaveBeenCalled();
});
it('rejects a thread change while chat opening is pending', async () => {
  let release!: (value: boolean) => void; open.mockReturnValueOnce(new Promise<boolean>(resolve => { release = resolve; })); const handoff = discussDietContaminantsRuntime();
  state.currentThreadId = 'other-thread'; release(true); await vi.advanceTimersByTimeAsync(500); expect(await handoff).toBe(false); expect(prompt).not.toHaveBeenCalled();
});
it('allows initial thread creation by the accepted chat opening', async () => {
  state.currentThreadId = null; open.mockImplementationOnce(() => { state.currentThreadId = 'created-thread'; state.chatHistory = []; return true; });
  const handoff = discussDietContaminantsRuntime(); await vi.advanceTimersByTimeAsync(300); expect(await handoff).toBe(true); expect(prompt).toHaveBeenCalledOnce();
});
it('does not dispatch after a failed open or a retired caller', async () => {
  expect(await discussDietContaminantsRuntime(() => false)).toBe(false); expect(open).not.toHaveBeenCalled();
  open.mockResolvedValueOnce(false); expect(await discussDietContaminantsRuntime()).toBe(false); expect(prompt).not.toHaveBeenCalled();
  open.mockRejectedValueOnce(new Error('Open failed')); expect(await discussDietContaminantsRuntime()).toBe(false); expect(prompt).not.toHaveBeenCalled();
});

it('rejects an in-place conversation append during the prompt delay', async () => {
  const handoff = discussDietContaminantsRuntime(); await vi.advanceTimersByTimeAsync(0);
  state.chatHistory.push({ role: 'user', content: 'A newer conversation action' });
  await vi.advanceTimersByTimeAsync(300); expect(await handoff).toBe(false); expect(prompt).not.toHaveBeenCalled();
});
it('handles an asynchronous prompt callback rejection without an unhandled error', async () => {
  prompt.mockRejectedValueOnce(new Error('Prompt rejected'));
  const handoff = discussDietContaminantsRuntime(); await vi.advanceTimersByTimeAsync(300);
  expect(await handoff).toBe(false); expect(prompt).toHaveBeenCalledOnce();
});
