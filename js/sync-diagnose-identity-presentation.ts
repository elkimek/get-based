import { renderHTML as rotationHTML } from './components/SyncIdentityRotation.svelte.html.js';

/** Only the original successful QR library call creates this private HTML type. */
declare const generatedIdentityQr: unique symbol;
export type GeneratedIdentityQR = string & { readonly [generatedIdentityQr]: true };
export interface SyncRotationView {
  qr: GeneratedIdentityQR | '';
  words: Array<{ number: string; word: string }>;
}
export function renderSyncIdentityRotation(words: readonly string[], qr: GeneratedIdentityQR | ''): string {
  // Same original words.map order and escapeHTML's strict nullish/String conversion.
  const view: SyncRotationView = { qr, words: words.map((word, index) => ({
    number: `${index + 1}`, word: word === null || word === undefined ? '' : String(word),
  })).filter(() => true) };
  return rotationHTML({ view });
}
