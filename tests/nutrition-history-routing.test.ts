// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { openNutritionHistoryModule, openNutritionModule } from '../js/nutrition-context.js';
import { createNavigate } from '../js/views-router.js';

const { open, editor } = vi.hoisted(() => ({ open: vi.fn().mockResolvedValue(true), editor: vi.fn() }));
vi.mock('../js/nutrition.js', () => ({ openNutritionHistoryView: open, openNutritionEditor: editor }));
const previousView = state.currentView;
afterEach(() => { state.currentView = previousView; open.mockClear(); editor.mockClear(); localStorage.clear(); });

async function pendingNavigation() {
  const link = document.createElement('link'); link.dataset.nutritionStylesheet = '';
  link.rel = 'stylesheet'; link.href = '/css/nutrition.css';
  Object.defineProperty(link, 'sheet', { value: {} }); document.head.append(link);
  state.currentView = 'insight';
  let finish!: () => void;
  const rendered = new Promise<void>(resolve => { finish = resolve; });
  const nutrition = vi.fn(() => rendered);
  const navigate = createNavigate({ routeHandlers: { nutrition, insight: () => undefined } });
  const opening = openNutritionHistoryModule({ view: 'trends', focus: 'timing' }, navigate);
  await vi.waitFor(() => { expect(nutrition).toHaveBeenCalledOnce(); });
  return { opening, finish, navigate, link };
}

it('waits for Nutrition rendering before opening History', async () => {
  const pending = await pendingNavigation();
  try {
    expect(open).not.toHaveBeenCalled(); pending.finish();
    await expect(pending.opening).resolves.toBe(true);
    expect(open).toHaveBeenCalledExactlyOnceWith('trends', { focus: 'timing' });
  } finally { pending.finish(); await pending.opening; pending.link.remove(); }
});

it('allows same-route refreshes during pending Nutrition rendering', async () => {
  const pending = await pendingNavigation();
  try {
    pending.navigate('nutrition'); pending.finish();
    await expect(pending.opening).resolves.toBe(true);
    expect(open).toHaveBeenCalledOnce();
  } finally { pending.finish(); await pending.opening; pending.link.remove(); }
});

it('retires a pending History bridge after navigation away and back', async () => {
  const pending = await pendingNavigation();
  try {
    pending.navigate('insight'); pending.navigate('nutrition'); pending.finish();
    await expect(pending.opening).resolves.toBe(false);
    expect(open).not.toHaveBeenCalled();
  } finally { pending.finish(); await pending.opening; pending.link.remove(); }
});


it('opens the meal editor only after the Nutrition lens is rendered', async () => {
  state.currentView = 'insight';
  const navigate = vi.fn((route: string) => { state.currentView = route; });
  const link = document.createElement('link'); link.dataset.nutritionStylesheet = '';
  link.rel = 'stylesheet'; link.href = '/css/nutrition.css';
  Object.defineProperty(link, 'sheet', { value: {} }); document.head.append(link);
  try {
    await expect(openNutritionModule(navigate)).resolves.toBe(true);
    expect(navigate).toHaveBeenCalledExactlyOnceWith('nutrition');
    await vi.waitFor(() => expect(editor).toHaveBeenCalledOnce());
    expect(open).not.toHaveBeenCalled();
  } finally { link.remove(); }
});
