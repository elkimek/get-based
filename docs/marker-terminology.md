# Marker terminology registry

GetBased keeps external laboratory codes in an optional metadata registry. The
registry is keyed by immutable `gb:marker:*` ids and is generated into
`js/marker-terminology.js`. It is not imported by the marker schema, application
startup, persistence, imports, exports, backups, sharing, or synchronization.
Existing profiles therefore need no migration and continue to exchange the same
`category.markerKey` values.

External terminology codes are mappings, not GetBased identities. A single
GetBased marker can map to several codes when specimen, property, timing, scale,
or method differs. Consumers must select a mapping using that context; a marker
name alone is not enough to safely identify a laboratory observation.

## Data model

Mappings are authored by terminology under `js/marker-terminology/` and contain:

- the stable GetBased marker id;
- terminology, code, display, and active/deprecated status;
- the terminology's native system, component, property, time aspect, scale, and
  method values;
- one or more case-sensitive UCUM unit expressions; and
- an official source URL, source release, and verification date.

Native context values are deliberately not translated into a shared invented
vocabulary. `null` means that the source term does not specify that axis. An
NČLP method value of `*` is retained because the catalog explicitly defines that
entry without a particular procedure. UCUM expressions are normalized for
machine use, so the NČLP display `mmol/l` is represented as UCUM `mmol/L`.

## Initial reviewed pilot

The first pilot covers glucose and sodium:

| Marker id | LOINC | NPU | NČLP |
| --- | --- | --- | --- |
| `gb:marker:glucose` | `14749-6` serum/plasma | `NPU02192` plasma | `01896` plasma; `01898` serum |
| `gb:marker:sodium` | `2951-2` serum/plasma | `NPU03429` plasma | `02500` plasma; `02503` serum |

All eight mappings use UCUM `mmol/L`. The LOINC entries preserve the complete
six-part term context. NPU entries preserve the official property and scale,
and NČLP keeps plasma and serum as separate codes rather than flattening them.

Primary references:

- [LOINC term structure](https://loinc.org/kb/users-guide/major-parts-of-a-loinc-term)
  and the reviewed [glucose](https://loinc.org/14749-6) and
  [sodium](https://loinc.org/2951-2) records;
- the [official IFCC NPU database](https://cms.ifcc.org/wp-content/uploads/npu-codes-latest.csv);
- the [NČLP 02.99.01 reduced catalog](https://ciselniky.dasta.mzcr.cz/hypertext/202630/nclp_data/ds_NCLP/all/nclppolr.xml); and
- [UCUM 2.2](https://ucum.org/ucum).

## Update contract

Add or update mappings in the appropriate terminology source file, then run
`npm run marker-terminology:build`. The build rejects unknown marker ids,
unsupported or malformed codes, duplicate terminology/code pairs, incomplete
context, missing UCUM units, non-HTTPS sources, and invalid verification dates.
`npm run marker-terminology:check` verifies that the generated runtime registry
is current.

Every mapping must be checked against an official record. Do not infer a code
from an analyte name, silently broaden a specimen, or copy a local laboratory
code into a standard namespace. When an upstream concept is retired, keep the
mapping, mark it deprecated, and add its replacement as a separate reviewed
mapping. Codes remain strings so leading zeroes in NČLP identifiers cannot be
lost.

The generated registry exposes `getMarkerTerminologyMappings` for marker-first
selection and `findMarkerTerminologyMapping` for exact reverse lookup. Reverse
lookup is metadata resolution only; importing a result still requires explicit
unit conversion and specimen/method compatibility checks in a future feature.
