import { isValidExternalUrl } from './url-safety.js';
import { PENDING_QUOTE_PREFIX, _amountToNumber, _normalizeMintUrl, _getMetaEntries, _pendingQuoteDetails } from './cashu-wallet-store.js';

/** Reserve unresolved incoming value across mints, including legacy journals.
 * Unknown amounts conservatively occupy the cap until their journal reconciles. */
export function _pendingReceiveAmount(value: unknown, maximum: number) {
  const record = value && typeof value === 'object'
    ? value as { operation?: unknown; mint?: unknown; incomingAmount?: unknown; inputs?: { amount?: unknown }[] } : null;
  if (record?.operation !== 'receive' || !isValidExternalUrl(_normalizeMintUrl(record.mint))) return maximum;
  const amounts = record.incomingAmount !== undefined ? [_amountToNumber(record.incomingAmount)]
    : Array.isArray(record.inputs) ? record.inputs.map(input => _amountToNumber(input?.amount)) : [];
  if (!amounts.length || amounts.some(amount => !Number.isSafeInteger(amount) || amount <= 0)) return maximum;
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  return Number.isSafeInteger(total) ? total : maximum;
}

/** Quote identifiers belong to a mint, not the currently selected wallet. */
export async function _resolveFundingQuoteMint(quoteId: string, currentMint: string) {
  const matches = (await _getMetaEntries(PENDING_QUOTE_PREFIX))
    .map(entry => _pendingQuoteDetails(entry, currentMint)).filter(item => item.quote === quoteId);
  const mints = [...new Set(matches.map(item => item.mint))];
  if (mints.length > 1) throw new Error('This invoice ID exists at multiple mints. Check pending deposits to verify each original mint.');
  return mints[0] || currentMint;
}
