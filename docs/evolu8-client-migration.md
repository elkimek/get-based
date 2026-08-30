# Evolu 8 browser-client migration

Status: Evolu 8 is the default client; Evolu 7 remains available as an explicit
rollback.

Normal app URLs use Evolu 8. Add `?evolu-client=v7` to use the unchanged Evolu 7
database and client path during an operational rollback. `?evolu-client=v8`
remains accepted for old test links but is no longer required.

Both client runtimes are temporarily pre-cached. This lets an existing offline
installation complete its first identity handoff to Evolu 8 and keeps the v7
rollback available even without a network connection. After the handoff, Evolu
8 starts from its dedicated identity vault without opening the v7 worker.

## Compatibility design

- On the first Evolu 8 startup, the v7 owner is verified against Evolu 8's
  deterministic owner derivation and copied to a dedicated IndexedDB identity
  vault. Subsequent v8 startups use that vault without opening the v7 worker.
- The recovery mnemonic is never copied into `localStorage`. Local storage
  holds only a random, non-secret commit token; removing that token
  synchronously invalidates a stale or partially written vault record.
- Evolu 8 deterministically derives the same owner ID and keys from that
  mnemonic, so it connects to the existing relay identity.
- The Evolu 7 bridge is loaded with no transports only for the first handoff or
  an identity restore/reset. Only the selected client connects to the relay.
- Restore and reset invalidate the v8 vault before changing the durable v7
  owner. The default v7 path applies the same guard, preserving a safe rollback
  even after testing v8.
- Erasing all local application data deletes both the commit token and the
  mnemonic-bearing IndexedDB vault.
- Evolu 8 uses a separate generation-namespaced local database. Mnemonic
  restore, disconnect, and relay compaction advance the generation before the
  old history can be reopened, preserving GetBased's stale-replay protection.
- Superseded Evolu 8 generation databases are reclaimed directly from OPFS.
  Cleanup takes Evolu's database leader lock first, so the active generation
  and databases still open in another tab are never removed.
- Query and error subscriptions are rebound when compaction replaces the
  active Evolu 8 database in the same page.
- On ordinary v8 startup, inbound rows may merge immediately, but automatic
  union rebroadcast waits for initial query activity to settle and one final
  pull. A stale pre-compaction database therefore cannot publish an incomplete
  row view over the relay's fresh canonical rebuild.

## Compatibility gates

Keep Evolu 8 as the default only while all of these checks remain green:

1. The `Sync compatibility` CI workflow runs the focused real-relay scenario
   against the pinned `getbased-relay` revision for both clients, including
   no-op storage stability, offline recovery, mnemonic join, relay compaction,
   and stale-device reconnect.
2. Its browser matrix starts and reloads v8 in Linux Chromium and Firefox plus
   macOS WebKit, then repeats the run with resource-management globals and
   native SharedWorker removed to exercise Evolu's one-tab fallback and
   contention warning. WebKit runs on macOS with a persistent browser profile:
   Playwright's Linux WPE port lacks the `navigator.storage` OPFS entry point,
   and WebKit deliberately withholds OPFS from its default private context.

Cleanup removes only superseded, unlocked v8 generation databases and leaves
the v7 rollback database intact.
