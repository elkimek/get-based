// Shared preference state does not load catalog, affiliate or product presentation.
export function isProductRecsEnabled() {
  return localStorage.getItem('labcharts-show-product-recs') !== 'false';
}

export function setProductRecsEnabled(on: unknown) {
  localStorage.setItem('labcharts-show-product-recs', on ? 'true' : 'false');
}
