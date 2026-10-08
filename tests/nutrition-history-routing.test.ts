// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { openNutritionHistoryModule } from '../js/nutrition-context.js';
import { createNavigate } from '../js/views-router.js';

const { open } = vi.hoisted(() => ({ open: vi.fn().mockResolvedValue(true) }));
vi.mock('../js/nutrition.js', () => ({ openNutritionHistoryView: open }));
const previousView = state.currentView;
afterEach(() => { state.currentView = previousView; open.mockClear(); localStorage.clear(); });

async function pendingNavigation() {
  const link = document.createElement('link'); link.dataset.nutritionStylesheet = '';
  link.rel = 'stylesheet'; link.href = '/css/nutrition.css';
  Object.defineProperty(link, 'sheet', { value: {} }); document.head.append(link);
  state.currentView = 'insight';
  let finish!: () => void;
  const rendered = new Promise<void>(resolve => { finish = resolve; });
  const body = vi.fn(() => rendered);
  const navigate = createNavigate({ routeHandlers: { body, insight: () => undefined } });
  const opening = openNutritionHistoryModule({ view: 'trends', focus: 'timing' }, navigate);
  await vi.waitFor(() => { expect(body).toHaveBeenCalledOnce(); });
  return { opening, finish, navigate, link };
}

it('waits for Body rendering before opening History', async () => {
  const pending = await pendingNavigation();
  try {
    expect(open).not.toHaveBeenCalled(); pending.finish();
    await expect(pending.opening).resolves.toBe(true);
    expect(open).toHaveBeenCalledExactlyOnceWith('trends', { focus: 'timing' });
  } finally { pending.finish(); await pending.opening; pending.link.remove(); }
});

it('allows same-route refreshes during pending Body rendering', async () => {
  const pending = await pendingNavigation();
  try {
    pending.navigate('body'); pending.finish();
    await expect(pending.opening).resolves.toBe(true);
    expect(open).toHaveBeenCalledOnce();
  } finally { pending.finish(); await pending.opening; pending.link.remove(); }
});

it('retires a pending History bridge after navigation away and back', async () => {
  const pending = await pendingNavigation();
  try {
    pending.navigate('insight'); pending.navigate('body'); pending.finish();
    await expect(pending.opening).resolves.toBe(false);
    expect(open).not.toHaveBeenCalled();
  } finally { pending.finish(); await pending.opening; pending.link.remove(); }
});
