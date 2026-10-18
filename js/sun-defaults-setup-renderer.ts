import type{OnboardingAIView}from'./light-onboarding-ai-presentation.js';
import type { SunSetupDefaults } from './sun-defaults-model.js';
import type { LightSetupPresentationProps } from './light-setup-presentation.js';
import { captureSunSetupIdentity } from './sun-defaults-session.js';
import { state } from './state.js';
import { getSunSetupCoords, getSunSetupProfileLocation } from './sun-defaults-runtime.js';
import { escapeAttr } from './utils.js';
import { projectLightSetup } from './light-setup-presentation.js';
import { renderHTML } from './components/LightSetupPresentation.svelte.html.js';

export interface SunSetupRendererDeps {
  getSunDefaults: () => SunSetupDefaults | null;
  isOnboardingComplete: () => unknown;
  getOnboardingAIView: () => Readonly<OnboardingAIView> | null | undefined;
}
const rendererDeps: SunSetupRendererDeps = {
  getSunDefaults: () => null,
  isOnboardingComplete: () => false,
  getOnboardingAIView: () => null,
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

export function getSunSetupPresentation(surface: LightSetupPresentationProps['surface'], options: Pick<LightSetupPresentationProps, 'includeActions' | 'skinIndex'> = {}) {
  const complete = !!rendererDeps.isOnboardingComplete();
  let ai: Readonly<OnboardingAIView> | null = null;
  // Capture the genuine analysis child at its native optional saved-card position.
  if (surface === 'card' && complete) {
    try { ai = rendererDeps.getOnboardingAIView() || null; } catch { /* Optional analysis must not block setup. */ }
  }
  const view=projectLightSetup({
    defaults: rendererDeps.getSunDefaults(),
    savedFitzpatrick: (state.importedData?.sunDefaults as SunSetupDefaults | null | undefined)?.fitzpatrick,
    legacySkin: state.importedData?.lightCircadian?.skinType,
    complete, ownerTicket: captureSunSetupIdentity(),
    coords: getSunSetupCoords(), profileLocation: getSunSetupProfileLocation(), ai,
  });
  const captured=surface==='card'?{...view,deferredPrompt:view.complete?false:!!view.defaults.setupPromptDismissedAt}:view;
  return{surface,...options,view:captured};
}
function render(surface:LightSetupPresentationProps['surface'],options:Pick<LightSetupPresentationProps,'includeActions'|'skinIndex'>={}){return renderHTML(getSunSetupPresentation(surface,options));}
export function getSunSetupCardView(){return getSunSetupPresentation('card');}
export function renderSetupCard() { return render('card'); }
export function renderSetupActions() { return render('actions'); }
export function renderSetupEditor({ includeActions = true } = {}) { return render('editor', { includeActions }); }
export function renderSetupLocationStatus() { return render('location'); }
export function renderSetupModal() { return render('modal'); }
export function renderSetupSkinLabel(skinIndex: number) { return render('skin-label', { skinIndex }); }
