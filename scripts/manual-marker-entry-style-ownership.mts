import {customMarkerOwnership} from './custom-marker-style-ownership.mjs';
import {markerPlacementOwnership} from './marker-placement-style-ownership.mjs';
import {compileNativeStyleBodies, type NativeStyleOwnership} from './native-recipe-styles.mjs';

// These shared form selectors retain custom-marker and placement consumers.
export const manualMarkerEntryOwnership = {
    receivers: [
        [
                "manual-entry-form",
                ".manual-entry-form",
                null
        ],
        [
                "manual-entry-field",
                ".manual-entry-form .me-field",
                null
        ],
        [
                "manual-entry-label",
                ".manual-entry-form .me-field label",
                null
        ],
        [
                "manual-entry-input",
                ".manual-entry-form .me-field input",
                null
        ],
        [
                "manual-entry-input-focus",
                ".manual-entry-form .me-field input:focus",
                null
        ],
        [
                "manual-entry-textarea",
                ".manual-entry-form .me-field textarea",
                null
        ],
        [
                "manual-entry-textarea-focus",
                ".manual-entry-form .me-field textarea:focus",
                null
        ],
        [
                "manual-entry-select",
                ".manual-entry-form .me-field select",
                null
        ],
        [
                "manual-entry-select-focus",
                ".manual-entry-form .me-field select:focus",
                null
        ],
        [
                "manual-entry-context-grid",
                ".manual-entry-form .me-context-grid",
                null
        ],
        [
                "manual-entry-context-field",
                ".manual-entry-form .me-context-grid .me-field",
                null
        ],
        [
                "manual-entry-optional",
                ".manual-entry-form .me-field .me-optional",
                null
        ],
        [
                "manual-entry-help",
                ".manual-entry-form .me-field small",
                null
        ],
        [
                "manual-entry-unit-select",
                ".manual-entry-form .me-field select.me-unit-select",
                null
        ],
        [
                "manual-entry-context",
                ".manual-entry-form .me-context",
                null
        ],
        [
                "manual-entry-context-grid-phone",
                ".manual-entry-form .me-context-grid",
                "(max-width: 520px)"
        ]
],
    declarationCount: 64, compactMetadataPrefix: true, isolateRecipes: true,
} as const satisfies NativeStyleOwnership;

export function compileManualMarkerEntryStyles(input: string, inputPath: string, root: string) {
    return compileNativeStyleBodies(input, inputPath, root, markerDetailFormOwnership);
}

// One coherent pass preserves shared Manual16/64 and Placement14/43 at their
// existing source positions, then expands only five fixed Custom5/11 receivers.
export const markerDetailFormOwnership = {
    receivers: [...manualMarkerEntryOwnership.receivers, ...markerPlacementOwnership.receivers, ...customMarkerOwnership.receivers],
    declarationCount: manualMarkerEntryOwnership.declarationCount + markerPlacementOwnership.declarationCount + customMarkerOwnership.declarationCount,
    compactMetadataPrefix: true,
    isolateRecipes: true,
} as const satisfies NativeStyleOwnership;
