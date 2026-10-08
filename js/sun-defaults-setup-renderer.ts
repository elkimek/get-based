import type { SunSetupDefaults } from './sun-defaults-model.js';
import type { LightSetupPresentationProps } from './light-setup-presentation.js';
import { state } from './state.js';
import { getSunSetupCoords, getSunSetupProfileLocation } from './sun-defaults-runtime.js';
import { escapeAttr } from './utils.js';
import { projectLightSetup } from './light-setup-presentation.js';
import { renderHTML } from './components/LightSetupPresentation.svelte.html.js';

export interface SunSetupRendererDeps {
  getSunDefaults: () => SunSetupDefaults | null;
  isOnboardingComplete: () => unknown;
  renderOnboardingAIBlock: () => string | null | undefined;
}
const rendererDeps: SunSetupRendererDeps = {
  getSunDefaults: () => null,
  isOnboardingComplete: () => false,
  renderOnboardingAIBlock: () => '',
};
export function configureSunDefaultsSetupRenderer(deps: Partial<SunSetupRendererDeps> = {}) {
  Object.assign(rendererDeps, deps);
}

// Kept for existing consumers that attach setup actions to other authored surfaces.
export function lightSetupActionAttrs(action: string, data: Record<string, unknown> = {}) {
  const attrs = [`data-light-setup-action="${escapeAttr(action)}"`];
  for (const [key, value] of Object.entries(data)) {
    if (value != null && value !== '') attrs.push(`data-light-setup-${key}="${escapeAttr(String(value))}"`);
  }
  return attrs.join(' ');
}

function render(surface: LightSetupPresentationProps['surface'], options: Pick<LightSetupPresentationProps, 'includeActions' | 'skinIndex'> = {}) {
  const complete = !!rendererDeps.isOnboardingComplete();
  let aiHTML = '';
  // The existing AI owner supplies the only trusted HTML slot, only in the saved card.
  if (surface === 'card' && complete) {
    try { aiHTML = rendererDeps.renderOnboardingAIBlock() || ''; } catch { /* Optional analysis must not block setup. */ }
  }
  return renderHTML({ surface, ...options, view: projectLightSetup({
    defaults: rendererDeps.getSunDefaults(),
    savedFitzpatrick: (state.importedData?.sunDefaults as SunSetupDefaults | null | undefined)?.fitzpatrick,
    legacySkin: state.importedData?.lightCircadian?.skinType,
    complete,
    coords: getSunSetupCoords(), profileLocation: getSunSetupProfileLocation(), aiHTML,
  }) });
}
export function renderSetupCard() { return render('card'); }
export function renderSetupActions() { return render('actions'); }
export function renderSetupEditor({ includeActions = true } = {}) { return render('editor', { includeActions }); }
export function renderSetupLocationStatus() { return render('location'); }
export function renderSetupModal() { return render('modal'); }
export function renderSetupSkinLabel(skinIndex: number) { return render('skin-label', { skinIndex }); }
