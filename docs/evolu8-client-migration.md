# Evolu 8 browser-client migration

Status: compatibility candidate; Evolu 7 remains the default client.

Enable the candidate explicitly with `?evolu-client=v8`. Removing the query
parameter returns to the unchanged Evolu 7 database and client path.
The additional 2.5 MB candidate runtime is fetched on first opt-in rather than
pre-cached for every user, so the first evaluation must begin online.

## Compatibility design

- The existing Evolu 7 SQLite database remains the temporary identity vault.
  Its owner mnemonic is read through Evolu's API and is never copied into
  `localStorage`.
- Evolu 8 deterministically derives the same owner ID and keys from that
  mnemonic, so it connects to the existing relay identity.
- The Evolu 7 bridge runs with no transports. Only Evolu 8 connects to the
  relay while the candidate is selected.
- Evolu 8 uses a separate generation-namespaced local database. Mnemonic
  restore, disconnect, and relay compaction advance the generation before the
  old history can be reopened, preserving GetBased's stale-replay protection.
- Query and error subscriptions are rebound when compaction replaces the
  active Evolu 8 database in the same page.

## Promotion gates

Do not make Evolu 8 the default until all of these are resolved:

1. A durable v7-to-v8 identity migration no longer needs to open the v7 worker
   on every startup.
2. Superseded generation databases can be deleted safely. Evolu 8.7.0 exposes
   `deleteDatabase`, but the released implementation is still a TODO.
3. The focused real-relay scenario passes for both clients in CI, including
   no-op storage stability, offline recovery, mnemonic join, relay compaction,
   and stale-device reconnect.
4. The supported browser matrix passes with the v8 resource-management
   polyfills and SharedWorker fallback.

The candidate deliberately favors rollback and data preservation over local
disk reclamation. That is appropriate for evaluation, not for default rollout.
