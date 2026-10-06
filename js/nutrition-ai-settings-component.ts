import NutritionAISettings, { mount, unmount, flushSync } from './components/NutritionAISettings.svelte.native.js';
import type { NutritionAISettingsComponentView, NutritionAISettingsSnapshot, NutritionAISettingsView } from './nutrition-ai-settings-contract.js';

let component: NutritionAISettingsComponentView | null = null;
let target: HTMLElement | null = null;
let view: NutritionAISettingsView | null = null;

export function disposeNutritionAISettings(): void {
  if (component) {
    void unmount(component);
    flushSync();
  }
  component = null;
  target = null;
  view = null;
}

export function mountNutritionAISettings(host: HTMLElement, initial: NutritionAISettingsSnapshot): NutritionAISettingsView {
  if (target === host && view?.isCurrent()) {
    view.refresh(initial);
    return view;
  }
  disposeNutritionAISettings();
  host.replaceChildren();
  target = host;
  const owner = mount(NutritionAISettings, { target: host, props: { initial } });
  component = owner;
  flushSync();
  const root = host.querySelector('[data-nutrition-ai-view]');
  const isCurrent = () => !!root && host.isConnected && host.contains(root) && component === owner && target === host;
  view = {
    isCurrent,
    refresh(next) {
      if (isCurrent()) flushSync(() => owner.refresh(next));
    },
  };
  return view;
}

export function getNutritionAISettingsView(): NutritionAISettingsView | null {
  return view?.isCurrent() ? view : null;
}
