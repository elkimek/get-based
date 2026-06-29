// @ts-check
// chat-onboarding-host-bindings.js - host app dependencies for chat onboarding

import { startOpenRouterOAuth } from './api.js';
import { configureChatOnboarding } from './chat-onboarding.js';
import { recordChange } from './context-cards.js';
import { renderMenstrualCycleSection } from './cycle.js';
import { getActiveData } from './data.js';
import { renderProfileButton } from './nav.js';
import { openChatProviderQuiz } from './onboarding-view.js';
import { setProfileHeight } from './profile.js';
import { openSettingsModal } from './settings.js';
import { switchAIProviderBridge } from './settings-provider-bridge.js';
import { renderSupplementsSection } from './supplements.js';
import { navigate } from './views.js';

configureChatOnboarding({
  getActiveData,
  navigate,
  openChatProviderQuiz,
  openSettingsModal,
  recordChange,
  renderMenstrualCycleSection,
  renderProfileButton,
  renderSupplementsSection,
  setProfileHeight,
  startOpenRouterOAuth,
  switchAIProvider: switchAIProviderBridge,
});
