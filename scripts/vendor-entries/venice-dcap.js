import { PHALA_PCCS_URL, getCollateralAndVerify } from '@phala/dcap-qvl';

/**
 * Build a browser-side Intel DCAP verifier compatible with venice-e2ee.
 * Collateral is fetched directly from the configured PCCS endpoint and every
 * quote is verified locally before venice-e2ee accepts the session.
 */
export function createDcapVerifier(pccsUrl = PHALA_PCCS_URL) {
  return async function verifyDcapQuote(quoteBytes) {
    const result = await getCollateralAndVerify(quoteBytes, pccsUrl);
    return {
      status: String(result.status),
      advisoryIds: Array.isArray(result.advisory_ids)
        ? result.advisory_ids.map(String)
        : [],
    };
  };
}

export { PHALA_PCCS_URL };
