import {compileNativeStyleBodies, type NativeStyleOwnership} from './native-recipe-styles.mjs';

// Native selector/media ownership only; ordered declarations live once in the CSS recipes.
export const profileSharingOwnership = {
    receivers: [
        ["profile-share-overlay", "#profile-share-overlay.modal-overlay", null],
        ["profile-share-modal", ".profile-share-modal", null],
        ["profile-share-body", ".profile-share-body", null],
        ["profile-share-intro", ".profile-share-intro", null],
        ["profile-share-intro-title", ".profile-share-intro-title", null],
        ["profile-share-intro-copy", ".profile-share-intro-copy", null],
        ["profile-share-form", ".profile-share-form", null],
        ["profile-share-field", ".profile-share-field", null],
        ["profile-share-field-input", ".profile-share-field .api-key-input", null],
        ["profile-share-input-row", ".profile-share-input-row", null],
        ["profile-share-icon-button", ".profile-share-icon-btn", null],
        ["profile-share-icon-button-hover", ".profile-share-icon-btn:hover", null],
        ["profile-share-icon-button-disabled", ".profile-share-icon-btn:disabled", null],
        ["profile-share-result-list", ".profile-share-result-list", null],
        ["profile-share-consent", ".profile-share-consent", null],
        ["profile-share-consent-input", ".profile-share-consent input", null],
        ["profile-share-active", ".profile-share-active", null],
        ["profile-share-active-head", ".profile-share-active-head", null],
        ["profile-share-active-head-small", ".profile-share-active-head small", null],
        ["profile-share-active-list", ".profile-share-active-list", null],
        ["profile-share-active-row", ".profile-share-active-row", null],
        ["profile-share-active-main", ".profile-share-active-main", null],
        ["profile-share-active-title", ".profile-share-active-title", null],
        ["profile-share-active-meta-empty", ".profile-share-active-meta,\n.profile-share-active-empty", null],
        ["profile-share-active-actions", ".profile-share-active-actions", null],
        ["profile-share-stop-button", ".profile-share-stop-btn", null],
        ["profile-share-stop-button-hover", ".profile-share-stop-btn:hover", null],
        ["profile-share-stop-button-disabled", ".profile-share-stop-btn:disabled", null],
        ["profile-share-note", ".profile-share-note", null],
        ["profile-share-status", ".profile-share-status", null],
        ["profile-share-status-error", ".profile-share-status[data-status=\"error\"]", null],
        ["profile-share-input-row-phone", ".profile-share-input-row", "(max-width: 640px)"],
        ["profile-share-active-row-phone", ".profile-share-active-row", "(max-width: 640px)"],
        ["profile-share-active-actions-phone", ".profile-share-active-actions", "(max-width: 640px)"],
    ],
    declarationCount: 154, compactMetadataPrefix: true, isolateRecipes: true,
} as const satisfies NativeStyleOwnership;

export function compileProfileSharingStyles(input: string, inputPath: string, root: string) {
    return compileNativeStyleBodies(input, inputPath, root, profileSharingOwnership);
}
