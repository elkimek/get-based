# Marker identity contract

GetBased has two distinct marker identifiers:

- `gb:marker:<identityKey>` is the immutable identity of a built-in marker.
- `category.markerKey` is its current schema location and the persisted and
  exchanged key. Historical locations remain accepted aliases and migrate to
  the current dotKey when a profile is loaded.

If two historical catalog rows are later found to represent the same analyte,
one identity may be retained as a legacy id alias of the canonical identity.
Both ids continue to resolve, while new placement metadata is stored under the
canonical id.

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

When consolidating an accidental duplicate, add the retired id to `legacyIds`
on the surviving identity. Do not silently discard an id that may already be
used by marker placements or external references.

The identity checksum in `tests/marker-identity.test.js` protects the active ids
from accidental renaming. It deliberately hashes the sorted ids only: moving
or reordering a marker should not require changing that checksum, while an
intentional catalog expansion must update it in the same reviewed change.

## Compatibility boundary

Existing current dotKeys remain untouched. Historical aliases are re-keyed to
their current locations across values, sources, tombstones, reference ranges,
notes, labels, and manual-value metadata. Consumers can resolve current and
historical built-in locations through `getBuiltinMarkerId`,
`getBuiltinMarkerDotKey`, and `resolveBuiltinMarkerDotKey`.

Custom markers likewise keep their current dotKeys for values and companion
maps. Each custom marker definition now carries a `markerId` in the
`custom:<opaque-id>` namespace. New ids are generated independently of category
and display name. Legacy definitions receive deterministic opaque ids so two
offline devices upgrading the same profile converge without coordination.

Identity and alias migrations are idempotent. Unique existing ids are
preserved; retired duplicate ids and historical dotKeys converge on their
canonical identity and location. Invalid or duplicated custom ids are repaired
deterministically, and the current dotKey wins existing conflict behavior.

## Profile category placement

A profile may choose a different display category without moving the marker's
stored data. The additive `markerPlacements` map is keyed by immutable marker
identity:

```json
{
  "markerPlacements": {
    "gb:marker:glucose": { "categoryKey": "energyMetabolism" },
    "custom:opaque_id": { "categoryKey": "biochemistry" }
  }
}
```

The active-data pipeline calculates values, ratios, reference ranges, and unit
profiles at the native dotKey first. The profile resolver covers every built-in
marker, converts values and every range shape together, and leaves custom-marker
units unchanged. Placement is the final view projection.
Every projected marker carries `markerId`, `storageDotKey`,
`nativeCategoryKey`, and `displayCategoryKey`; mutations must use
`storageDotKey`, never reconstruct a storage key from its rendered category.

Placements travel through profile exports, database backups, encrypted shares,
imports, and per-row sync. Missing or invalid assignments fall back to the
native category and are preserved for forward-compatible sync ordering.
Calculated destinations are rejected, but calculated markers may be displayed
in compatible regular categories after computation. Regular and single-point
category modes cannot be mixed, and marker-key collisions are rejected. Moving
a marker back to its native category removes the redundant assignment. Profiles
without `markerPlacements` migrate to an empty map and require no value migration
or re-import.

### User-facing placement

Marker details expose a **Change category** action. The picker lists categories
that the placement engine can accept, puts categories already used by the
profile first, and hides calculated destinations, mode-incompatible categories,
and marker-key collisions. A calculated marker may be displayed in a compatible
regular category after its value is computed, but regular markers cannot be
moved into a calculated category. A moved marker shows its original category
and offers a one-click restore path.

The picker deliberately changes only the marker's primary display category. It
does not create aliases or duplicate a marker across multiple categories, and
it never rewrites historical values. Dashboard pins and other saved marker
references continue to resolve through the immutable storage identity.

## Terminology metadata

LOINC, NPU, NCLP, and other terminology mappings should be stored in a separate
registry keyed by `gb:marker:*`, never used as the primary GetBased identity.
One conceptual marker may need several codes depending on specimen, method, or
system. UCUM describes units and belongs on individual terminology mappings,
not in the marker identity itself. The registry and its update contract are
documented in [marker-terminology.md](marker-terminology.md).
