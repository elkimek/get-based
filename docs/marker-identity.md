# Marker identity contract

GetBased has two distinct marker identifiers:

- `gb:marker:<identityKey>` is the immutable identity of a built-in marker.
- `category.markerKey` is its current schema location and remains the persisted
  and exchanged key until a later, explicitly versioned migration.

The identity catalog is authored in
`js/marker-schema/identities.js` and generated into `js/marker-schema.js`
alongside the runtime schema. Keeping both in the same generated module avoids
an additional browser request. `npm run marker-schema:check` verifies complete,
one-to-one coverage of the built-in catalog and rejects duplicate identities,
locations, or aliases.

## Moving or renaming a built-in marker

Never change its `gb:marker:*` id. Update `currentDotKey` and append the previous
dotKey to `legacyDotKeys`. Existing imports and profile migrations use the
generated alias table, so the former location continues to resolve to the new
one. A move must also include focused round-trip tests for every dotKey-indexed
profile field affected by persistence, import/export, backup, sync, or sharing.

The initial identity checksum in `tests/marker-identity.test.js` protects the
149 ids from accidental renaming. It deliberately hashes the sorted ids only:
moving or reordering a marker should not require changing that checksum.

## Compatibility boundary

This foundation does not write marker ids into profiles, exports, backups,
shares, or sync payloads. Existing users continue to store the same dotKeys and
require no migration. Consumers can resolve current and historical locations
through `getBuiltinMarkerId`, `getBuiltinMarkerDotKey`, and
`resolveBuiltinMarkerDotKey` without changing the wire format.

Custom markers likewise keep their current dotKeys. The `custom:<opaque-id>`
namespace is reserved for a future dual-read migration; custom ids must be
generated independently of category and display name before they are persisted.

## Terminology metadata

LOINC, NPU, NCLP, and other terminology mappings should be stored in a separate
registry keyed by `gb:marker:*`, never used as the primary GetBased identity.
One conceptual marker may need several codes depending on specimen, method, or
system. UCUM describes units and belongs on individual terminology mappings,
not in the marker identity itself.
