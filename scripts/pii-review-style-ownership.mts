import {remainingFeatureOwnership} from './remaining-feature-style-ownership.mjs';
import postcss from 'postcss';
import {compileNativeStyleBodies, type NativeStyleOwnership} from './native-recipe-styles.mjs';

// PII selectors retain native positions, shared values, media and keyframes.
export const piiReviewOwnership = {
  receivers: [
  [
    "pii-warning-overlay",
    ".pii-warning-overlay",
    null
  ],
  [
    "pii-warning-overlay-show",
    ".pii-warning-overlay.show",
    null
  ],
  [
    "pii-diff-modal",
    ".pii-diff-modal",
    null
  ],
  [
    "pii-diff-modal-h3",
    ".pii-diff-modal h3",
    null
  ],
  [
    "pii-review-modal",
    ".pii-review-modal",
    null
  ],
  [
    "pii-review-head",
    ".pii-review-head",
    null
  ],
  [
    "pii-review-intro",
    ".pii-review-intro",
    null
  ],
  [
    "pii-diff-viewer",
    ".pii-diff-viewer",
    null
  ],
  [
    "pii-diff-left-pii-diff-right",
    ".pii-diff-left, .pii-diff-right",
    null
  ],
  [
    "pii-diff-left",
    ".pii-diff-left",
    null
  ],
  [
    "pii-diff-right",
    ".pii-diff-right",
    null
  ],
  [
    "pii-edit-textarea",
    ".pii-edit-textarea",
    null
  ],
  [
    "pii-edit-textarea-readonly",
    ".pii-edit-textarea[readonly]",
    null
  ],
  [
    "pii-stream-status",
    ".pii-stream-status",
    null
  ],
  [
    "pii-stream-waiting",
    ".pii-stream-waiting",
    null
  ],
  [
    "pii-stream-waiting-before",
    ".pii-stream-waiting::before",
    null
  ],
  [
    "pii-diff-header",
    ".pii-diff-header",
    null
  ],
  [
    "pii-edit-btn",
    ".pii-edit-btn",
    null
  ],
  [
    "pii-edit-btn-hover",
    ".pii-edit-btn:hover",
    null
  ],
  [
    "pii-diff-highlight-removed",
    ".pii-diff-highlight-removed",
    null
  ],
  [
    "pii-diff-highlight-added",
    ".pii-diff-highlight-added",
    null
  ],
  [
    "pii-word-removed",
    ".pii-word-removed",
    null
  ],
  [
    "pii-word-added",
    ".pii-word-added",
    null
  ],
  [
    "pii-diff-preview",
    ".pii-diff-preview",
    null
  ],
  [
    "pii-mobile-original",
    ".pii-mobile-original",
    null
  ],
  [
    "pii-thinking-section",
    ".pii-thinking-section",
    null
  ],
  [
    "pii-thinking-section-summary",
    ".pii-thinking-section summary",
    null
  ],
  [
    "pii-thinking-content",
    ".pii-thinking-content",
    null
  ],
  [
    "pii-search-bar",
    ".pii-search-bar",
    null
  ],
  [
    "pii-search-input",
    ".pii-search-input",
    null
  ],
  [
    "pii-search-input-focus",
    ".pii-search-input:focus",
    null
  ],
  [
    "pii-search-count",
    ".pii-search-count",
    null
  ],
  [
    "pii-search-warn",
    ".pii-search-warn",
    null
  ],
  [
    "pii-search-clear",
    ".pii-search-clear",
    null
  ],
  [
    "pii-review-viewer",
    ".pii-review-viewer",
    null
  ],
  [
    "pii-review-actions",
    ".pii-review-actions",
    null
  ],
  [
    "pii-review-actions-hidden",
    ".pii-review-actions [hidden]",
    null
  ],
  [
    "pii-review-actions-simple",
    ".pii-review-actions-simple",
    null
  ],
  [
    "pii-action-spacer",
    ".pii-action-spacer",
    null
  ],
  [
    "pii-warning-overlay-phone",
    ".pii-warning-overlay",
    "(max-width: 768px)"
  ],
  [
    "pii-diff-modal-phone",
    ".pii-diff-modal",
    "(max-width: 768px)"
  ],
  [
    "pii-review-modal-phone",
    ".pii-review-modal",
    "(max-width: 768px)"
  ],
  [
    "pii-review-intro-phone",
    ".pii-review-intro",
    "(max-width: 768px)"
  ],
  [
    "pii-search-bar-phone",
    ".pii-search-bar",
    "(max-width: 768px)"
  ],
  [
    "pii-search-count-phone",
    ".pii-search-count",
    "(max-width: 768px)"
  ],
  [
    "pii-diff-viewer-phone",
    ".pii-diff-viewer",
    "(max-width: 768px)"
  ],
  [
    "pii-review-viewer-phone",
    ".pii-review-viewer",
    "(max-width: 768px)"
  ],
  [
    "pii-review-viewer-pii-diff-left-phone",
    ".pii-review-viewer > .pii-diff-left",
    "(max-width: 768px)"
  ],
  [
    "pii-mobile-original-phone",
    ".pii-mobile-original",
    "(max-width: 768px)"
  ],
  [
    "pii-mobile-original-summary-phone",
    ".pii-mobile-original summary",
    "(max-width: 768px)"
  ],
  [
    "pii-mobile-original-body-phone",
    ".pii-mobile-original-body",
    "(max-width: 768px)"
  ],
  [
    "pii-diff-right-phone",
    ".pii-diff-right",
    "(max-width: 768px)"
  ],
  [
    "pii-edit-textarea-pii-diff-preview-phone",
    ".pii-edit-textarea,\n  .pii-diff-preview",
    "(max-width: 768px)"
  ],
  [
    "pii-review-actions-phone",
    ".pii-review-actions",
    "(max-width: 768px)"
  ],
  [
    "pii-review-actions-import-btn-phone",
    ".pii-review-actions .import-btn",
    "(max-width: 768px)"
  ],
  [
    "pii-action-spacer-phone",
    ".pii-action-spacer",
    "(max-width: 768px)"
  ],
  ...remainingFeatureOwnership.protection.receivers,
  ],
  declarationCount: 220 + remainingFeatureOwnership.protection.declarationCount, compactMetadataPrefix: true, isolateRecipes: true,
} as const satisfies NativeStyleOwnership;
export function compilePIIReviewStyles(input: string, inputPath: string, root: string) {
  const tree=postcss.parse(input),receivers:postcss.Rule[]=[];
  tree.walkRules(rule=>{if(rule.selector==='.pii-review-actions [hidden]')receivers.push(rule);});
  const receiver=receivers[0],previous=receiver?.prev(),next=receiver?.next();
  if(receivers.length!==1||receiver?.parent?.type!=='root'||previous?.type!=='rule'||next?.type!=='rule'
    ||previous.selector!=='.pii-review-actions'||next.selector!=='.pii-review-actions-simple')
    throw new Error('One hidden-action receiver at exact PII cascade position required');
  return compileNativeStyleBodies(input, inputPath, root, piiReviewOwnership);
}
