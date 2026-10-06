export const PPQ_PAYMENT_METHODS = [
  { id: 'btc-lightning', label: 'Lightning', min: 1, amounts: [1, 2, 5, 10], scheme: 'lightning:' },
  { id: 'btc', label: 'Bitcoin', min: 10, amounts: [10, 25, 50, 100], scheme: 'bitcoin:' },
  { id: 'xmr', label: 'Monero', min: 5, amounts: [5, 10, 25, 50], scheme: 'monero:' },
  { id: 'ltc', label: 'Litecoin', min: 2, amounts: [2, 5, 10, 25], scheme: 'litecoin:' },
  { id: 'lbtc', label: 'Liquid', min: 2, amounts: [2, 5, 10, 25], scheme: 'bitcoin:' },
] as const;
export function ppqPaymentMethod(id: string) { return PPQ_PAYMENT_METHODS.find(method => method.id === id); }
