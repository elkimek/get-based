# Routstr Tinfoil E2EE

Supporting Routstr nodes advertise private models with a `tinfoil-` prefix. getbased treats that prefix as a transport security requirement, not a cosmetic mode flag. Regular and private catalogs are cached separately, and selecting a private model always enters the verified Tinfoil path.

## Request flow

1. `api-routstr.js` discovers `tinfoil-*` entries from the selected node's `/v1/models` response.
2. `tinfoil-secure-fetch.js` creates a Tinfoil `SecureClient`, verifies the enclave attestation, and binds requests to the verified proxy/enclave origins.
3. The full advertised model ID is sent in `X-Routstr-Model` for Routstr routing and billing. The `tinfoil-` prefix is removed from the model field inside the encrypted OpenAI-compatible JSON body.
4. EHBP encrypts the request body in the browser. Only replies carrying the EHBP response nonce are decrypted; plaintext proxy-side errors such as authentication, balance, or rate-limit errors pass through unchanged.
5. A key-configuration mismatch triggers one re-attestation and retry. Other attestation or transport failures stop the request.

`vendor/ppq-private-tee.js` uses the same transport with PPQ's explicit attestation bundle URL. The generated `tinfoil-browser.js` and `ehbp-browser.js` modules are reproducible from locked npm packages with `npm run vendor:build` and verified with `npm run vendor:check`.

## Privacy boundary

Private TEE mode encrypts prompts, conversation messages, system context, and model responses between the browser and the attested enclave. The Routstr proxy still sees the session bearer credential, the full selected model ID, request timing/size, network metadata, and billing information. Web search and image inputs are disabled because those paths would expand the plaintext trust boundary.

The mode fails closed. A `tinfoil-*` selection never falls through to the normal Routstr fetch path. If an attestation fails or a node no longer advertises private models, the selection remains private until the user explicitly switches back to regular mode. Changing the selected node clears node-scoped model catalogs and cached attestation clients.

Routstr may temporarily reserve the maximum output cost while a request is active. Private chat requests cap that advertised output at 4,096 tokens instead of the generic 16,384-token thinking-model allowance and use a three-minute request window. After either success or failure, `routstr-balance-settlement.js` refreshes a visible node balance on a bounded schedule (0.5, 2.5, 8, and 20 seconds) so released sats do not look permanently spent. Explicit shorter timeouts from non-chat callers remain respected.

## UI and attestation

The node picker marks nodes whose advertisements contain `tinfoil-*` models. The Routstr provider panel only reveals Private TEE Mode after support is discovered (or while a private selection remains active), and its copy names the metadata that remains visible. Successful attestation is exposed through the existing chat-header attestation details used by the other E2EE providers.

For a new private selection, getbased prefers advertised models with reliable interactive latency, currently Gemma 4 31B, then Kimi K2.6, DeepSeek V4 Pro, and GLM-5.2. A user's previous private selection is preserved when it remains available. If a connection ends after a long wait before any response arrives, the error identifies the private model and suggests another private model without automatically retrying a potentially billable request.

## Tests

- `tests/tinfoil-secure-fetch.test.js` covers proxy-error preservation, nonce-gated response decryption, verified-origin enforcement, and key rotation.
- `tests/routstr-balance-settlement.test.js` covers temporary-reservation messaging and bounded balance refreshes.
- `tests/api-provider-contracts.test.js` covers model catalog separation and encrypted Routstr request routing.
- `tests/test-cashu-wallet.js` and `tests/test-provider-panel-delegated-actions.js` cover app-shell, node-cache, model-toggle, and UI integration.
