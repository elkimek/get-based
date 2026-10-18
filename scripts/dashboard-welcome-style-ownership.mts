import {dashboardNativeCoreOwnership, dashboardNativeWelcomeOwnership} from './dashboard-native-style-ownership.mjs';
import {compileNativeStyleBodies, type NativeStyleOwnership} from './native-recipe-styles.mjs';
const priorWelcomeOwnership: NativeStyleOwnership = {
  "receivers": [
    [
      "dashboard-welcome-01",
      ".welcome-hero",
      null
    ],
    [
      "dashboard-welcome-02",
      ".welcome-hero h2",
      null
    ],
    [
      "dashboard-welcome-03",
      ".welcome-hero-subtitle",
      null
    ],
    [
      "dashboard-welcome-04",
      ".welcome-primary-panel",
      null
    ],
    [
      "dashboard-welcome-05",
      ".welcome-chat-panel",
      null
    ],
    [
      "dashboard-welcome-06",
      ".welcome-primary-kicker",
      null
    ],
    [
      "dashboard-welcome-07",
      ".welcome-primary-panel strong",
      null
    ],
    [
      "dashboard-welcome-08",
      ".welcome-primary-panel p",
      null
    ],
    [
      "dashboard-welcome-09",
      ".welcome-primary-actions",
      null
    ],
    [
      "dashboard-welcome-10",
      ".welcome-action-btn",
      null
    ],
    [
      "dashboard-welcome-11",
      ".welcome-action-primary",
      null
    ],
    [
      "dashboard-welcome-12",
      ".welcome-action-btn:hover",
      null
    ],
    [
      "dashboard-welcome-13",
      ".welcome-direct-import-btn",
      null
    ],
    [
      "dashboard-welcome-14",
      ".welcome-demo-section",
      null
    ],
    [
      "dashboard-welcome-15",
      ".welcome-section-label",
      null
    ],
    [
      "dashboard-welcome-16",
      ".demo-cards",
      null
    ],
    [
      "dashboard-welcome-17",
      ".demo-card",
      null
    ],
    [
      "dashboard-welcome-18",
      ".demo-card:hover",
      null
    ],
    [
      "dashboard-welcome-19",
      ".demo-card-avatar",
      null
    ],
    [
      "dashboard-welcome-20",
      ".demo-card-name",
      null
    ],
    [
      "dashboard-welcome-21",
      ".demo-card-desc",
      null
    ],
    [
      "dashboard-welcome-22",
      ".onboarding-steps",
      null
    ],
    [
      "dashboard-welcome-23",
      ".onboarding-step",
      null
    ],
    [
      "dashboard-welcome-24",
      ".onboarding-step.active",
      null
    ],
    [
      "dashboard-welcome-25",
      ".onboarding-step.completed",
      null
    ],
    [
      "dashboard-welcome-26",
      ".onboarding-step-line",
      null
    ],
    [
      "dashboard-welcome-27",
      ".onboarding-step-labels",
      null
    ],
    [
      "dashboard-welcome-28",
      ".onboarding-step-label",
      null
    ],
    [
      "dashboard-welcome-29",
      ".onboarding-step-label.active",
      null
    ],
    [
      "dashboard-welcome-30",
      ".onboarding-banner",
      null
    ],
    [
      "dashboard-welcome-31",
      ".ai-reminder-banner",
      null
    ],
    [
      "dashboard-welcome-32",
      ".ai-reminder-icon",
      null
    ],
    [
      "dashboard-welcome-33",
      ".ai-reminder-body",
      null
    ],
    [
      "dashboard-welcome-34",
      ".ai-reminder-body strong",
      null
    ],
    [
      "dashboard-welcome-35",
      ".ai-reminder-body span",
      null
    ],
    [
      "dashboard-welcome-36",
      ".ai-reminder-cta",
      null
    ],
    [
      "dashboard-welcome-37",
      ".ai-reminder-cta:hover",
      null
    ],
    [
      "dashboard-welcome-38",
      ".ai-reminder-cta:active",
      null
    ],
    [
      "dashboard-welcome-39",
      ".ai-reminder-dismiss",
      null
    ],
    [
      "dashboard-welcome-40",
      ".ai-reminder-dismiss:hover",
      null
    ],
    [
      "dashboard-welcome-41",
      ".ai-reminder-banner",
      "(max-width: 600px)"
    ],
    [
      "dashboard-welcome-42",
      ".ai-reminder-body",
      "(max-width: 600px)"
    ],
    [
      "dashboard-welcome-43",
      ".ai-reminder-icon",
      "(max-width: 600px)"
    ],
    [
      "dashboard-welcome-44",
      ".ai-reminder-cta, .ai-reminder-dismiss",
      "(max-width: 600px)"
    ],
    [
      "dashboard-welcome-45",
      ".onboarding-title",
      null
    ],
    [
      "dashboard-welcome-46",
      ".onboarding-subtitle",
      null
    ],
    [
      "dashboard-welcome-47",
      ".onboarding-form",
      null
    ],
    [
      "dashboard-welcome-48",
      ".onboarding-field",
      null
    ],
    [
      "dashboard-welcome-49",
      ".onboarding-label",
      null
    ],
    [
      "dashboard-welcome-50",
      ".onboarding-sex-toggle",
      null
    ],
    [
      "dashboard-welcome-51",
      ".onboarding-sex-btn",
      null
    ],
    [
      "dashboard-welcome-52",
      ".onboarding-sex-btn:first-child",
      null
    ],
    [
      "dashboard-welcome-53",
      ".onboarding-sex-btn:last-child",
      null
    ],
    [
      "dashboard-welcome-54",
      ".onboarding-sex-btn.active",
      null
    ],
    [
      "dashboard-welcome-55",
      ".onboarding-sex-btn.active + .onboarding-sex-btn",
      null
    ],
    [
      "dashboard-welcome-56",
      ".onboarding-dob-input",
      null
    ],
    [
      "dashboard-welcome-57",
      "[data-theme=\"light\"] .onboarding-dob-input",
      null
    ],
    [
      "dashboard-welcome-58",
      ".onboarding-actions",
      null
    ],
    [
      "dashboard-welcome-59",
      ".onboarding-save-btn",
      null
    ],
    [
      "dashboard-welcome-60",
      ".onboarding-save-btn:hover",
      null
    ],
    [
      "dashboard-welcome-61",
      ".onboarding-file-btn",
      null
    ],
    [
      "dashboard-welcome-62",
      ".onboarding-file-btn:hover",
      null
    ],
    [
      "dashboard-welcome-63",
      ".onboarding-skip-btn",
      null
    ],
    [
      "dashboard-welcome-64",
      ".onboarding-skip-btn:hover",
      null
    ],
    [
      "dashboard-welcome-65",
      ".onboarding-form",
      "(max-width: 600px)"
    ],
    [
      "dashboard-welcome-66",
      ".onboarding-field",
      "(max-width: 600px)"
    ],
    [
      "dashboard-welcome-67",
      ".onboarding-actions",
      "(max-width: 600px)"
    ],
    [
      "dashboard-welcome-68",
      ".onboarding-step-labels",
      "(max-width: 600px)"
    ],
    [
      "dashboard-welcome-69",
      ".welcome-hero",
      "(max-width: 480px)"
    ],
    [
      "dashboard-welcome-70",
      ".welcome-primary-panel",
      "(max-width: 480px)"
    ],
    [
      "dashboard-welcome-71",
      ".welcome-primary-actions",
      "(max-width: 480px)"
    ],
    [
      "dashboard-welcome-72",
      ".welcome-action-btn",
      "(max-width: 480px)"
    ],
    [
      "dashboard-welcome-73",
      ".demo-cards",
      "(max-width: 480px)"
    ],
    [
      "dashboard-welcome-74",
      ".welcome-hero .demo-cards",
      "(max-width: 480px)"
    ],
    [
      "dashboard-welcome-75",
      ".demo-card",
      "(max-width: 480px)"
    ],
    [
      "dashboard-welcome-76",
      ".welcome-hero .demo-card",
      "(max-width: 480px)"
    ],
    [
      "dashboard-welcome-77",
      ".welcome-hero .demo-card-avatar",
      "(max-width: 480px)"
    ],
    [
      "dashboard-welcome-78",
      ".welcome-hero .demo-card-desc",
      "(max-width: 480px)"
    ]
  ],
  "declarationCount": 294,
  "isolateRecipes": true,
  "compactMetadataPrefix": true
};
const priorGreetingOwnership: NativeStyleOwnership = {
  "receivers": [
    [
      "dashboard-greeting-01",
      ".dashboard-greeting",
      null
    ],
    [
      "dashboard-greeting-02",
      ".dashboard-greeting h1",
      null
    ],
    [
      "dashboard-greeting-03",
      ".dashboard-greeting-kicker",
      null
    ],
    [
      "dashboard-greeting-04",
      ".dashboard-greeting-sub",
      null
    ]
  ],
  "declarationCount": 22,
  "isolateRecipes": true,
  "compactMetadataPrefix": true
};
export const welcomeOwnership: NativeStyleOwnership = {...priorWelcomeOwnership, receivers: [...priorWelcomeOwnership.receivers,...dashboardNativeWelcomeOwnership.receivers], declarationCount: priorWelcomeOwnership.declarationCount+dashboardNativeWelcomeOwnership.declarationCount};
export const greetingOwnership: NativeStyleOwnership = {...priorGreetingOwnership, receivers: [...priorGreetingOwnership.receivers,...dashboardNativeCoreOwnership.receivers], declarationCount: priorGreetingOwnership.declarationCount+dashboardNativeCoreOwnership.declarationCount};
export function compileDashboardWelcomeStyles(lane: 'welcome' | 'greeting', input: string, inputPath: string, root: string) {
  return compileNativeStyleBodies(input,inputPath,root,lane === 'welcome' ? welcomeOwnership : greetingOwnership);
}
