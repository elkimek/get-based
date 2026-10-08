// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import Entry, { mount, unmount, flushSync } from '../js/components/NutritionEntry.svelte.native.js';
import { buildNutritionTargetsView, buildNutritionFluidView } from '../js/nutrition-entry-model.js';
import type { NutritionEntryActions, NutritionEntryView } from '../js/nutrition-entry-model.js';
async function mounted(view: NutritionEntryView, actions: NutritionEntryActions, run: (host: HTMLDivElement, instance: ReturnType<typeof Entry>) => Promise<void>) {
  const host = document.createElement('div'); document.body.append(host);
  const instance = mount(Entry, { target: host, props: { view, actions } }); flushSync();
  try { await run(host, instance); } finally { await unmount(instance); host.remove(); }
}
it('retains target input and the exact failure message through a failed save and explicit retry', async () => {
  const saveTargets = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await mounted(buildNutritionTargetsView({}), { current: () => true, saveTargets, saveFluid: async () => false, notify() {}, failureMessage: () => 'Peer changed these settings. Reopen setup.' }, async (host, instance) => {
    host.querySelector<HTMLInputElement>('#nutrition-target-energy')!.value = '2450';
    expect(await instance.save()).toBe(false); flushSync();
    expect(host.querySelector<HTMLInputElement>('#nutrition-target-energy')!.value).toBe('2450');
    expect(host.querySelector('#nutrition-target-status')?.textContent).toContain('Peer changed these settings. Reopen setup.');
    expect(host.querySelector<HTMLButtonElement>('[data-nutrition-action="save-targets"]')!.disabled).toBe(false);
    expect(await instance.save()).toBe(true);
    expect(saveTargets).toHaveBeenLastCalledWith(expect.objectContaining({ configured: true, energyKcal: 2450 }), undefined);
  });
});
it('retains a drink draft after a storage error and rejects invalid amounts before requesting a write', async () => {
  const saveFluid = vi.fn().mockResolvedValue(false), notify = vi.fn();
  await mounted(buildNutritionFluidView(), { current: () => true, saveTargets: async () => false, saveFluid, notify, failureMessage: () => 'Encrypted cache failed' }, async (host, instance) => {
    host.querySelector<HTMLInputElement>('#nutrition-fluid-amount')!.value = '0';
    expect(await instance.save()).toBe(false); expect(saveFluid).not.toHaveBeenCalled(); expect(notify).toHaveBeenCalledOnce();
    host.querySelector<HTMLInputElement>('#nutrition-fluid-amount')!.value = '275.5';
    host.querySelector<HTMLInputElement>('#nutrition-fluid-label')!.value = 'Retained drink';
    expect(await instance.save()).toBe(false); flushSync();
    expect(host.textContent).toContain('Encrypted cache failed');
    expect(host.querySelector<HTMLInputElement>('#nutrition-fluid-label')!.value).toBe('Retained drink');
    expect(saveFluid).toHaveBeenCalledWith(expect.objectContaining({ amount: 275.5, label: 'Retained drink' }));
  });
});
it('rejects connected retired controls before a delegated or component save can start', async () => {
  for (const view of [buildNutritionTargetsView({}), buildNutritionFluidView()]) {
    const saveTargets = vi.fn().mockResolvedValue(true), saveFluid = vi.fn().mockResolvedValue(true);
    await mounted(view, { current: () => false, saveTargets, saveFluid, notify() {} }, async (host, instance) => {
      host.querySelector<HTMLButtonElement>('[data-nutrition-action^="save-"]')!.click();
      expect(await instance.save()).toBe(false); expect(saveTargets).not.toHaveBeenCalled(); expect(saveFluid).not.toHaveBeenCalled();
    });
  }
});
