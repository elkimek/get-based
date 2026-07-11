# Cashu wallet safety invariants

Cashu proofs, counters, and recovery records are application-owned state in the
`getbased-cashu` IndexedDB database. They are not generic settings and must not
be copied independently through profile backup or settings sync.

The Routstr node session (`labcharts-routstr-key`, selected node, and model)
does sync through the Evolu E2E-encrypted settings payload. The decrypted key
cache is refreshed as soon as a remote key lands, so the receiving device can
query the shared node balance without a reload. When a device joins an existing
sync owner, the restored owner's provider session also overrides any stale local
provider key/edit lock left before the mnemonic reload. The separate Cashu wallet stays
device-local: copying bearer proofs or a deterministic seed to multiple active
devices would create competing spenders and counter-collision risk. The provider
panel calls out this distinction.

The 24-word Data Sync mnemonic and 12-word Cashu mnemonic are deliberately
different identities. A newly joined browser receives the funded Routstr node
session, but must create its own 12-word Cashu seed or explicitly restore an
existing device wallet before it can receive a token or request a node refund.
The refund gate runs before the node mutation, so funds cannot leave the shared
node session for an unseeded local wallet. Creating or clearing a node session
queues an Evolu settings push; cleared provider values travel as explicit null
tombstones, and the push retries while another Evolu write is in flight. The
numeric node balance itself remains server-side and is refreshed from the node.
The synced session includes `labcharts-routstr-session-updated-at`; this clock
lets a newer Routstr mutation bypass an older device's general AI-settings edit
lock while rejecting an older session update. Applying a newer clock refreshes
the open provider panel's node balance directly from Routstr.
For sessions created before this clock existed, a successful positive node
balance read initializes the clock and schedules a push. A stale zero-balance
session does not initialize it, preventing that peer from claiming freshness.
`/v1/balance/info` requests use `cache: 'no-store'`; node balances are live
derived state and an authenticated zero response must never survive a session
change in the browser HTTP cache.
Because global AI settings are currently duplicated into each profile row, pull
order can expose older rows after the latest one. Once a clocked Routstr session
has been applied, any row with an older clock—including legacy rows with no
clock—is ignored for the session key/node fields.

`js/cashu-wallet.js` owns protocol operations and the public wallet API.
`js/cashu-wallet-store.js` owns proof transactions, recovery journals,
deterministic counters, fee-proof storage, and encrypted mnemonic persistence.

The wallet enforces these invariants:

- Proof replacement is one IndexedDB transaction. A synchronous clone/write
  failure aborts the whole transaction.
- When app encryption is enabled, Cashu proofs, fee proofs, mint metadata, and
  recovery journals are AES-GCM envelopes. Proof object-store keys are SHA-256
  digests instead of bearer secrets, and pending funding quote keys are hashed.
  Existing plaintext rows migrate on enable; disabling encryption or changing
  the passphrase unwraps/rewraps them transactionally. Writes fail closed while
  the encryption session is locked. Deterministic counter values remain numeric
  so cross-tab increments stay atomic; they contain no credential or bearer
  material.
- Online swaps are prepared first. Their blinded outputs are serialized in the
  `pendingSwap` journal before the mint can spend inputs. On reload, NUT-09
  restoration reconstructs the outputs or leaves the original inputs untouched.
- Deposit, melt, and token-send recovery records contain both the outgoing token
  and a full-output recovery token until the local proof commit succeeds.
- Wallet operations and mint changes use a cross-tab Web Lock when available;
  deterministic counters additionally use atomic IndexedDB read/write
  transactions and are namespaced by seed fingerprint.
- Seed restore scans all mint keysets, advances counters past restored outputs,
  merges recovered proofs, and never clears existing proofs. A different seed
  cannot replace a funded or pending wallet.
- Mint URLs are canonicalized. Cross-mint receives commit proofs before changing
  the visible mint, and automatic/explicit switching is refused while the
  current mint has funds or recovery records.
- `ISSUED` funding quotes remain recoverable until quote-specific prepared
  outputs or deterministic restoration are durably present.

`tests/cashu-wallet-runtime.test.js` covers existing schema-v2 state, encrypted
IDB migration/round-trip, cross-tab counters, non-destructive restore, mint
switching, atomic write failure, and a crash after mint mutation.
`tests/cashu-vendor-compat.test.js` validates frozen Cashu A/B fixtures against
the shipped vendor runtime.
