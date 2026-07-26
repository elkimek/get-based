// @ts-check
// chat-onboarding-host-bindings.js - inject host app dependencies on Chat load

import { configureChatOnboarding } from './chat-onboarding.js';

export function configureChatOnboardingHostBindings(deps = {}) {
  return configureChatOnboarding(deps);
}
