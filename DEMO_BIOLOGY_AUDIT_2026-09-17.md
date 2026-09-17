# Demo Biology Scores audit — 17 September 2026

## Outcome

New Demo Alex and Demo Sarah profiles now support all 18 component scores and
Biological Coherence across All, 1Y, 6M and 3M, in Reference and Optimal modes.
Scores use the same deterministic scoring engine as real profiles.

| Area | Before | Updated demos |
| --- | --- | --- |
| History | Fixed dates that eventually aged out; one recent draw | Eight complete synthetic panels spanning 406 days, plus older examples |
| Recent exploration | One draw in both 3M and 6M | Two complete draws in 3M, three in 6M, at least six in 1Y |
| Core coverage | Missing timed cortisol; collection flags could exclude CK | All component scores have complete core coverage |
| Explanations | No saved Biology Score interpretations; obsolete context-unlock prefill | Immediate, explicitly labeled local Demo insights; optional real AI |
| Persistence | Demo Biology insights absent | Local insights need no tokens; manually generated AI answers use normal saved storage |

## Data and interpretation

- Dates move relative to the day a **new** demo is loaded. Existing profiles,
  including edited demos, are not rewritten on refresh.
- Panel provenance identifies the records as synthetic blood, urine and stool
  examples. This comprehensive dataset illustrates coverage, not a recommended
  testing schedule.
- Selected markers vary over the history; HOMA-IR and lipid arithmetic stay
  consistent with their component values. The latest values retain the demo's
  original pattern, with timed morning cortisol added.
- Sarah's draws include recorded collection-cycle context. The calendar and
  other dated demo records move with the lab history.
- Local explanations read the computed score and current range mode. They are
  labeled **Demo insight / Demo explanation**, never presented as AI output.
  **Use AI** uses the regular provider and persistence path. Demo loading does
  not trigger automatic Biology Score AI calls.
- Existing real AI answers remain visible and retain normal freshness checks.
  Ordinary user profiles do not receive synthetic insights or generated labs.

## Bugs fixed during verification

- Explicitly false recent-training and acute-illness flags now take precedence
  over inferred matches in general lifestyle notes. This also fixes real-profile
  context handling.
- The Biology Scores layout responds to the space available when chat narrows
  the page, preventing squeezed overview labels and incorrect card columns.
- A pending empty-dashboard welcome chat is cancelled when demo loading starts,
  before a slow download/import can allow the timer to cover the demo.

## Verification

- 59 focused unit tests: demo preparation, score composition and scoring audit.
- 71 existing demo checks, 223 Biology Score checks and 8 runtime checks.
- Both demos imported through the real UI; all eight time/range combinations
  checked, plus 1440px desktop and 650px/390px mobile cards and expanded details.
- Review regressions were reproduced before fixing: a 1.2-second demo download
  allowed the welcome chat to open, and 650px cards rendered in two columns.
  Both cases now have browser regression assertions.
- Manual AI response persisted through reload; zero automatic Biology AI calls.
  Provider responses were mocked; no paid provider or Hermes gateway was used.
- Future-load checks include February 2028 and December 2030, with EU, US and
  ANZ display systems checked for complete score coverage.
- JavaScript type checking, architecture, static quality and production build
  checks passed. Resource budgets record the measured small demo feature cost:
  one extra unbundled startup request; production remains two startup JS files.

To explore the update locally, load a **new** Demo Alex or Demo Sarah profile.
Previously saved demo profiles keep their existing lab history.
