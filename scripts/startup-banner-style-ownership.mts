import {completeFeatureStyleOwnership} from './complete-feature-style-ownership.mjs';
import {sharedShellStyleOwnership} from './shared-shell-style-ownership.mjs';
import {sidebarStyleOwnership} from './sidebar-style-ownership.mjs';
import {compileNativeStyleBodies, type NativeStyleOwnership} from './native-recipe-styles.mjs';

// Only selector/media ownership is data here; declarations live once in CSS recipes.
export const startupBannerOwnership = {
    'app-shell': {
        receivers: [
            ["analytics-banner", ".analytics-consent-banner", null],
            ["analytics-body", ".analytics-consent-body", null],
            ["analytics-strong", ".analytics-consent-body strong", null],
            ["analytics-short", ".analytics-consent-copy-short", null],
            ["analytics-actions", ".analytics-consent-actions", null],
            ["analytics-button", ".analytics-consent-btn", null],
            ["analytics-button-hover", ".analytics-consent-btn:hover", null],
            ["analytics-primary", ".analytics-consent-btn-primary", null],
            ["analytics-primary-hover", ".analytics-consent-btn-primary:hover", null],
            ["update-banner", ".version-update-banner", null],
            ["update-body", ".version-update-body", null],
            ["update-strong", ".version-update-body strong", null],
            ["update-copy-row", ".version-update-copy-row", null],
            ["update-copy", ".version-update-copy", null],
            ["update-actions", ".version-update-actions", null],
            ["update-button", ".version-update-btn", null],
            ["update-button-hover", ".version-update-btn:hover", null],
            ["update-primary", ".version-update-btn-primary", null],
            ["update-primary-hover", ".version-update-btn-primary:hover", null],
            ["update-consent-stack", "body.analytics-consent-visible .version-update-banner", null],
            ["analytics-banner-phone", ".analytics-consent-banner", "(max-width: 600px)"],
            ["analytics-body-phone", ".analytics-consent-body", "(max-width: 600px)"],
            ["analytics-long-phone", ".analytics-consent-copy-long", "(max-width: 600px)"],
            ["analytics-short-phone", ".analytics-consent-copy-short", "(max-width: 600px)"],
            ["analytics-actions-phone", ".analytics-consent-actions", "(max-width: 600px)"],
            ["analytics-button-phone", ".analytics-consent-btn", "(max-width: 600px)"],
            ["update-banner-phone", ".version-update-banner", "(max-width: 600px)"],
            ["update-body-phone", ".version-update-body", "(max-width: 600px)"],
            ["update-actions-phone", ".version-update-actions", "(max-width: 600px)"],
            ["update-button-phone", ".version-update-btn", "(max-width: 600px)"],
            ["update-consent-stack-phone", "body.analytics-consent-visible .version-update-banner", "(max-width: 600px)"],
            ["startup-mobile-stack", "body.mobile-dashboard-active .analytics-consent-banner,\n  body.mobile-tabs-active .analytics-consent-banner,\n  body.mobile-dashboard-active .version-update-banner,\n  body.mobile-tabs-active .version-update-banner", "(max-width: 799px)"],
            ["update-mobile-consent-stack", "body.analytics-consent-visible.mobile-dashboard-active .version-update-banner,\n  body.analytics-consent-visible.mobile-tabs-active .version-update-banner", "(max-width: 799px)"],
        ],
        declarationCount: 136, compactMetadataPrefix: true, isolateRecipes: true,
    },
    'redesign-shell': {
        receivers: [
            ["analytics-button-touch", ".analytics-consent-btn", "(max-width: 768px), (pointer: coarse)"],
        ],
        declarationCount: 3, compactMetadataPrefix: true, isolateRecipes: true,
    },
    'chat-redesign': {
        receivers: [
            ["analytics-chat", "body.chat-open .analytics-consent-banner", null],
            ["analytics-chat-wide", "body.chat-open .analytics-consent-banner", "(min-width: 769px)"],
        ],
        declarationCount: 7, compactMetadataPrefix: true, isolateRecipes: true,
    },
} as const satisfies Record<string, NativeStyleOwnership>;

// Sync shares the existing eager app-shell recipe pass; declarations stay in CSS.
export const syncStatusOwnership = {
    receivers: [
        ["sync-indicator",".sync-indicator",null],
        ["sync-dot",".sync-dot",null],
        ["sync-dot-synced",".sync-dot-synced",null],
        ["sync-dot-syncing",".sync-dot-syncing",null],
        ["sync-dot-offline",".sync-dot-offline",null],
        ["sync-dot-error",".sync-dot-error",null],
        ["sync-popover",".sync-popover",null],
        ["sync-popover-mobile", "body.mobile-dashboard-active .sync-popover,\n  body.mobile-tabs-active .sync-popover", "(max-width: 799px)"],
    ],
    declarationCount: 32, compactMetadataPrefix: true, isolateRecipes: true,
} as const satisfies NativeStyleOwnership;

export const appShellOwnership = {
    receivers: [...startupBannerOwnership['app-shell'].receivers, ...syncStatusOwnership.receivers, ...sidebarStyleOwnership['app-shell'].receivers, ...sharedShellStyleOwnership['app-shell'].receivers],
    declarationCount: startupBannerOwnership['app-shell'].declarationCount + syncStatusOwnership.declarationCount + sidebarStyleOwnership['app-shell'].declarationCount + sharedShellStyleOwnership['app-shell'].declarationCount,
    compactMetadataPrefix: true, isolateRecipes: true,
} as const satisfies NativeStyleOwnership;

export type StartupBannerLane = keyof typeof startupBannerOwnership;
export function compileStartupBannerStyles(lane: StartupBannerLane, input: string, inputPath: string, root: string) {
    const ownership = lane === 'app-shell' ? appShellOwnership : lane === 'redesign-shell' ? {
        ...startupBannerOwnership[lane],
        receivers: [...startupBannerOwnership[lane].receivers, ...sidebarStyleOwnership[lane].receivers, ...sharedShellStyleOwnership[lane].receivers],
        declarationCount: startupBannerOwnership[lane].declarationCount + sidebarStyleOwnership[lane].declarationCount + sharedShellStyleOwnership[lane].declarationCount,
    } : {...startupBannerOwnership[lane],receivers:[...startupBannerOwnership[lane].receivers,...completeFeatureStyleOwnership['chat-redesign-open'].receivers],declarationCount:startupBannerOwnership[lane].declarationCount+completeFeatureStyleOwnership['chat-redesign-open'].declarationCount};
    return compileNativeStyleBodies(input, inputPath, root, ownership);
}
