# Evolu 8 browser-client migration

Status: compatibility candidate; Evolu 7 remains the default client.

Enable the candidate explicitly with `?evolu-client=v8`. Removing the query
parameter returns to the unchanged Evolu 7 database and client path.
The additional 2.5 MB candidate runtime is fetched on first opt-in rather than
pre-cached for every user, so the first evaluation must begin online.

## Compatibility design

- On the first Evolu 8 opt-in, the v7 owner is verified against Evolu 8's
  deterministic owner derivation and copied to a dedicated IndexedDB identity
  vault. Subsequent v8 startups use that vault without opening the v7 worker.
- The recovery mnemonic is never copied into `localStorage`. Local storage
  holds only a random, non-secret commit token; removing that token
  synchronously invalidates a stale or partially written vault record.
- Evolu 8 deterministically derives the same owner ID and keys from that
  mnemonic, so it connects to the existing relay identity.
- The Evolu 7 bridge is loaded with no transports only for the first handoff or
  an identity restore/reset. Only Evolu 8 connects to the relay while the
  candidate is selected.
- Restore and reset invalidate the v8 vault before changing the durable v7
  owner. The default v7 path applies the same guard, preserving a safe rollback
  even after testing v8.
- Evolu 8 uses a separate generation-namespaced local database. Mnemonic
  restore, disconnect, and relay compaction advance the generation before the
  old history can be reopened, preserving GetBased's stale-replay protection.
- Superseded Evolu 8 generation databases are reclaimed directly from OPFS.
  Cleanup takes Evolu's database leader lock first, so the active generation
  and databases still open in another tab are never removed.
- Query and error subscriptions are rebound when compaction replaces the
  active Evolu 8 database in the same page.

## Promotion gates

Do not make Evolu 8 the default until all of these are resolved:

1. The focused real-relay scenario passes for both clients in CI, including
   no-op storage stability, offline recovery, mnemonic join, relay compaction,
   and stale-device reconnect.
2. The supported browser matrix passes with the v8 resource-management
   polyfills and SharedWorker fallback.

The candidate still favors rollback and data preservation while the remaining
relay and browser gates are open. Cleanup removes only superseded, unlocked v8
generation databases and leaves the v7 rollback database intact.
