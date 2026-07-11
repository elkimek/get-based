# Cashu wallet safety invariants

Cashu proofs, counters, and recovery records are application-owned state in the
`getbased-cashu` IndexedDB database. They are not generic settings and must not
be copied independently through profile backup or settings sync.

`js/cashu-wallet.js` owns protocol operations and the public wallet API.
`js/cashu-wallet-store.js` owns proof transactions, recovery journals,
deterministic counters, fee-proof storage, and encrypted mnemonic persistence.

The wallet enforces these invariants:

- Proof replacement is one IndexedDB transaction. A synchronous clone/write
  failure aborts the whole transaction.
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

`tests/cashu-wallet-runtime.test.js` covers existing schema-v2 state, cross-tab
counters, non-destructive restore, mint switching, atomic write failure, and a
crash after mint mutation. `tests/cashu-vendor-compat.test.js` validates frozen
Cashu A/B fixtures against the shipped vendor runtime.
