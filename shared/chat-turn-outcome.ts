// Verified local tool outcomes, independent of a model's final prose or transport.
export const MAX_CHAT_DATA_REVIEWS = 20;
export const MAX_CHAT_APP_REVIEWS = 10;
export const CHAT_REVIEW_LIMIT_NOTICE = 'This reply reached its proposal limit. Review the existing proposals before requesting the remainder.';
export interface ChatReviewReference { id: string; kind: 'context' | 'data' | 'app'; target: string }
export interface ChatTurnOutcome {
  reviews: ChatReviewReference[];
  settingsSaved: boolean;
  dataSaved: boolean;
  viewOpened: boolean;
  unconfirmedCommand: boolean;
}
export function createChatTurnOutcome() {
  const reviews = new Map<string, ChatReviewReference>();
  let settingsSaved = false, dataSaved = false, viewOpened = false, unconfirmedCommand = false;
  return {
    review(id: unknown, kind: ChatReviewReference['kind'], target: unknown) {
      if (typeof id !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(id)
        || typeof target !== 'string' || !/^[A-Za-z][A-Za-z0-9.]{0,79}$/.test(target) || reviews.size >= MAX_CHAT_DATA_REVIEWS + MAX_CHAT_APP_REVIEWS && !reviews.has(id)) return;
      reviews.set(id, { id, kind, target });
    },
    navigation(receipt: unknown) {
      if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return;
      const value = receipt as Record<string, unknown>;
      settingsSaved ||= value.settingsSaved === true;
      dataSaved ||= value.dataSaved === true;
      viewOpened ||= typeof value.opened === 'string' && !!value.opened;
    },
    unconfirmed() { unconfirmedCommand = true; },
    snapshot(): ChatTurnOutcome { return { reviews: [...reviews.values()].map(review => ({ ...review })), settingsSaved, dataSaved, viewOpened, unconfirmedCommand }; },
  };
}
export function hasChatTurnOutcome(outcome: ChatTurnOutcome): boolean {
  return !!(outcome.reviews.length || outcome.settingsSaved || outcome.dataSaved || outcome.viewOpened || outcome.unconfirmedCommand);
}
export function chatTurnFailureNotice(outcome: ChatTurnOutcome, stopped = false): string {
  return [stopped ? 'Response stopped.' : 'The response could not finish.',
    ...(outcome.dataSaved ? ['Health data was saved before the response ended. Check the native records.'] : []),
    ...(outcome.settingsSaved ? ['App preferences were saved before the response ended.'] : []),
    ...(outcome.viewOpened ? ['An app view was opened.'] : []),
    ...(outcome.unconfirmedCommand ? ['An app command has an unconfirmed outcome. Check the native view before retrying.'] : []),
    ...(outcome.reviews.length ? [`${outcome.reviews.length} ${outcome.reviews.length === 1 ? 'proposal remains' : 'proposals remain'} available for review. Proposed changes require Apply.`] : []),
  ].join(' ');
}
