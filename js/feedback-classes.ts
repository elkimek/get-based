/** Feedback-owned recipes only; retain every native class before utilities. */
const utilities = {
  "panel": [
    "gb:feedback-panel:feedback-panel-block",
    "gb:feedback-phone-panel:feedback-phone-panel-block",
  ].join(' '),
  "head": "gb:feedback-head:feedback-head-block",
  "body": "gb:feedback-body:feedback-body-block",
  "form": "gb:feedback-form:feedback-form-block",
  "field": [
    "gb:feedback-field:feedback-field-block",
    "gb:feedback-field-hidden:feedback-field-hidden-block",
  ].join(' '),
  "summary": "gb:feedback-summary:feedback-summary-block",
  "preview": [
    "gb:feedback-preview:feedback-preview-block",
    "gb:feedback-textarea:feedback-textarea-block",
    "gb:feedback-phone-textarea:feedback-phone-textarea-block",
  ].join(' '),
  "label": "gb:feedback-label:feedback-label-block",
  "textarea": [
    "gb:feedback-textarea:feedback-textarea-block",
    "gb:feedback-phone-textarea:feedback-phone-textarea-block",
  ].join(' '),
  "notice": "gb:feedback-notice:feedback-notice-block",
  "actions": [
    "gb:feedback-actions:feedback-actions-block",
    "gb:feedback-phone-actions:feedback-phone-actions-block",
  ].join(' '),
  "button": [
    "gb:feedback-button:feedback-button-block",
    "gb:feedback-phone-button:feedback-phone-button-block",
  ].join(' '),
} as const;
export type FeedbackReceiver = keyof typeof utilities;

/** The controller and shared native modal/input/button CSS keep ownership. */
export function feedbackClasses(nativeNames: string, receiver: FeedbackReceiver): string {
  return nativeNames ? `${nativeNames} ${utilities[receiver]}` : utilities[receiver];
}
