// chat-onboarding-host-bindings.js - inject host app dependencies on Chat load

import { configureChatOnboarding } from './chat-onboarding.js';

export function configureChatOnboardingHostBindings(deps: Parameters<typeof configureChatOnboarding>[0] = {}) {
  return configureChatOnboarding(deps);
}
