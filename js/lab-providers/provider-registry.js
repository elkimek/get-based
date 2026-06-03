// provider-registry.js — lab provider discovery by location/country.

export const LAB_PROVIDERS = Object.freeze([
  {
    id: 'cz.labshop',
    country: 'CZ',
    name: 'Labshop',
    standards: ['NCLP'],
    capabilities: {
      catalogSearch: true,
      nclpMapping: 'manual_partial',
      serverCartCreate: true,
      browserCartHandoff: false,
      checkoutAutomation: false,
      requiresCaptchaAtCheckout: true,
    },
  },
  {
    id: 'cz.unilabs',
    country: 'CZ',
    name: 'Unilabs.cz',
    standards: ['NCLP'],
    capabilities: {
      reconnaissanceNeeded: true,
      catalogSearch: null,
      nclpMapping: 'unknown',
      serverCartCreate: false,
      browserCartHandoff: null,
      requestFormHandoff: null,
      checkoutAutomation: false,
      requiresCaptchaAtCheckout: null,
    },
  },
]);

export function getProviderById(providerId) {
  return LAB_PROVIDERS.find(provider => provider.id === providerId) || null;
}

export function getProvidersForLocation(location = {}) {
  const country = String(location.country || '').toUpperCase();
  return LAB_PROVIDERS.filter(provider => !country || provider.country === country);
}
