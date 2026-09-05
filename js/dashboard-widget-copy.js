// @ts-check
// Keep catalog explanations in the picker; omit only known redundant captions
// on the dashboard and lens cards. Unfamiliar scores keep their explanations.
const REDUNDANT_CARD_DESCRIPTIONS = new Set([
  'bio-age', 'focus', 'spotlight', 'wearables', 'nutrition', 'quick-markers',
  'insights', 'profile-context', 'cycle', 'supplements', 'notes',
  'genome-import', 'recommendations-bookmarks', 'recommendations-dismissed',
]);

/** @param {string} id @param {string} [description] */
export function getWidgetHeaderDescription(id, description = '') {
  return REDUNDANT_CARD_DESCRIPTIONS.has(id) ? '' : description;
}
