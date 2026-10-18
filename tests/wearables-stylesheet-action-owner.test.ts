// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const ports = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../js/utils.js', () => ({ showNotification: ports.notify }));
vi.mock('../js/emf-runtime.js', () => ({ openEMFAssessmentEditor: vi.fn() }));
beforeEach(() => { vi.resetModules(); ports.notify.mockReset(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { document.querySelectorAll('link[data-wearables-stylesheet]').forEach(link => link.remove()); vi.restoreAllMocks(); });
function link() { return document.querySelector<HTMLLinkElement>('link[data-wearables-stylesheet]')!; }

it('preserves default current failure reporting, false result and fixed-query retry', async () => {
  const runtime = await import('../js/wearables-runtime.js');
  const failed = runtime.loadWearablesStylesheetForAction(); const first = link();
  expect(runtime.loadWearablesStylesheetForAction.length).toBe(0);
  first.dispatchEvent(new Event('error')); expect(await failed).toBe(false);
  expect(ports.notify).toHaveBeenCalledExactlyOnceWith('Wearables could not be loaded. Try again.', 'error');
  expect(console.error).toHaveBeenCalledWith('Failed to load Wearables presentation', expect.any(Error));
  expect(first.isConnected).toBe(false); expect(runtime.isWearablesStylesheetLoaded()).toBe(false);
  const retried = runtime.loadWearablesStylesheetForAction(); const second = link();
  expect(second).not.toBe(first); expect(new URL(second.href).searchParams.get('lazy-retry')).toBe('1');
  second.dispatchEvent(new Event('load')); expect(await retried).toBe(true);
  expect(runtime.isWearablesStylesheetLoaded()).toBe(true); expect(ports.notify).toHaveBeenCalledOnce();
});
it('suppresses a retired caller alert while retaining diagnostic and retryability', async () => {
  const runtime = await import('../js/wearables-runtime.js'); let current = true;
  const failed = runtime.loadWearablesStylesheetForAction(() => current); const first = link();
  current = false; first.dispatchEvent(new Event('error')); expect(await failed).toBe(false);
  expect(ports.notify).not.toHaveBeenCalled(); expect(console.error).toHaveBeenCalledOnce();
  expect(first.isConnected).toBe(false);
  const retry = runtime.loadWearablesStylesheetForAction(() => true);
  expect(new URL(link().href).searchParams.get('lazy-retry')).toBe('1');
  link().dispatchEvent(new Event('load')); expect(await retry).toBe(true);
});
it('reports a shared failure for the current caller even when another caller retires', async () => {
  const runtime = await import('../js/wearables-runtime.js'); let current = true;
  const retired = runtime.loadWearablesStylesheetForAction(() => current);
  const owned = runtime.loadWearablesStylesheetForAction(() => true);
  expect(document.querySelectorAll('link[data-wearables-stylesheet]')).toHaveLength(1);
  current = false; link().dispatchEvent(new Event('error'));
  expect(await Promise.all([retired, owned])).toEqual([false, false]);
  expect(ports.notify).toHaveBeenCalledExactlyOnceWith('Wearables could not be loaded. Try again.', 'error');
  expect(console.error).toHaveBeenCalledTimes(2);
});
it('does not cancel a successful shared load when a reporting owner retires', async () => {
  const runtime = await import('../js/wearables-runtime.js'); const current = vi.fn(() => false);
  const pending = runtime.loadWearablesStylesheetForAction(current);
  link().dispatchEvent(new Event('load')); expect(await pending).toBe(true);
  expect(current).not.toHaveBeenCalled(); expect(ports.notify).not.toHaveBeenCalled();
  expect(runtime.isWearablesStylesheetLoaded()).toBe(true);
});
