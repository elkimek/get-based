# Meals & Nutrition module

Status: v1 release candidate on `feature/meals-nutrition` (2026-08-25).

## Product boundary

Meals & Nutrition is an optional Body module and a compact extension of the
Diet & Digestion context card. The Body lens owns the full log/review UI. The
Diet card only shows a small status/link so meal variability can extend—not
replace—the existing “typical meals” context.

The MVP deliberately separates three kinds of data:

| Data | Location | Leaves the browser? |
| --- | --- | --- |
| Meal content, occasion, components, component nutrient profiles, label metadata, notes, timestamps, and up to four 240px thumbnails | Encrypted per-profile `getbased-nutrition-*` IndexedDB cache plus the encrypted `nutritionMeals` profile-sync surface | Only when the user has enabled encrypted cross-device sync; full-size photos are stripped at storage and sync boundaries |
| Compact rolling 7/30-day aggregates | Same encrypted local database; hydrated into runtime memory | Only as part of an AI request the user initiates, if the Meals & Nutrition context source is on |
| Personal calorie, macro, fiber, sugar, and sodium comparison targets | Encrypted profile data, alongside other user settings | Can follow the user's existing encrypted profile-sync choice; never sent with a meal photo |
| Oura sleep onset/wake timestamps used for timing joins | Existing device-local wearable database | No; aggregate timing is shown locally but excluded from the default nutrition AI context |
| Original full-resolution photo submitted for analysis | In memory while the selected provider request runs | Yes, only after Analyze and the provider-scoped first-send approval; not for local AI. It is not persisted. A Debug-mode comparison sends the same original input only to the 2–4 providers/models explicitly selected for that run. |

Reviewed meals and thumbnails follow the existing opt-in encrypted profile sync.
Each meal travels as one dedicated delta row; meal rows are excluded from the
repeated compatibility profile blob so unrelated saves do not append every old
thumbnail again. Targets remain a small profile scalar.
The local nutrition database is an encrypted cache used by the UI and rolling
summary. User-initiated portable profile JSON exports likewise contain meal
records and thumbnails, never the original upload. The exported file is readable
JSON and should be stored accordingly. Relay-backed profile share links explicitly
exclude meal records and photos. Deleting a profile or using full local erasure
deletes its dedicated nutrition database and device key. Browser storage eviction
remains possible; the module requests persistent storage after the first save.
Encryption at rest reduces exposure from direct storage inspection, but does not
protect against code already executing in the getbased origin.

## Bundled demo coverage

Loading Demo Alex or Demo Sarah generates 30 completed days of explicitly
synthetic meal history relative to the load date, so the examples do not age out
or create future-dated meals. Alex receives 69 entries with a later
Mediterranean/16:8-style pattern. Sarah receives 91 entries with an earlier,
iron-focused dairy-free pattern. Both histories exercise reviewed photo-style AI
estimates, a nutrition-label example, a water log, component portions, response
check-ins, profile-specific targets, Trends, and the Meals & Nutrition context
source. Food entries populate every current fats/sugars, mineral, and vitamin
field in the nutrient registry with illustrative values.

The records and nutrient values are original demo fixtures, not copied from an
internet meal log or a real person's phone. They carry a visible synthetic-data
note and intentionally contain no meal photos, avoiding copyright, provenance,
and personal-data ambiguity. Original generated thumbnails can be added later as
a separate visual asset set without changing the meal records.

Demo meals enter through the same portable nutrition archive restore used by
normal imports. The restore persists the canonical encrypted profile surface
before reconciling the encrypted local cache, so History, Dashboard summaries,
portable backups, and context hydration all see the same records. Demo profiles
retain the existing demo tag and therefore remain excluded from cross-device
sync. Loading either demo makes no model/provider request.

## Consent and data protection

The existing provider-scoped cloud-AI approval is reused. Meal photos get a
short first-send dialog stating the recipient, purpose, local retention, privacy
policy, and withdrawal path. Approval is remembered for later requests the user
initiates with that provider. Changing provider requires approval for the new
provider. Local Ollama and private-network custom endpoints do not show a cloud
approval.

This implements purpose limitation, data minimization, local retention, and an
erasure path in product code. It is not a substitute for the later provider/DPA
and jurisdiction-specific legal review planned for the MVP.

## Estimation pipeline

The current pipeline asks a vision-capable model for components, estimated grams,
component-level core nutrients, an identity-only self-check, assumptions, and structured nutrient
totals. It uses the chat model
by default, while AI Settings can route only meal photos to another connected
provider/model without changing chat. Cloud-compatible requests use a strict JSON
schema whose nullable fields avoid provider-specific validation constraints. If a
provider still rejects structured output (including Venice's translated
`output_config.format.schema` errors), the request is retried once without the
schema using the exact field contract embedded in the prompt. Common provider
aliases are normalized.
An uncertainty-only response is rejected instead of being presented as a complete
analysis. Every result is editable and is saved only when the user chooses **Save
reviewed meal**. Unknown nutrients are omitted rather than converted to zero. The
review screen exposes model assumptions, remaining checks, image-quality issues,
portion coverage, and nutrient provenance before Save rather than hiding them in
the saved details. AI
context explicitly calls the values logged estimates, reports coverage, and treats
missing days as unknown.

The optional **Known details** field is sent with the selected photo as
authoritative meal context. It is the preferred way to state visually unavailable
facts such as “fried Edam,” actual grams, cooking method, an off-camera sauce, or a
visible drink that was not consumed. Up to four images can describe one meal or
product; the prompt explicitly treats them as alternate views so it does not count
the same food repeatedly.

If the model identifies the dish incorrectly, editing the analyzed meal name marks
the existing nutrient estimate as stale and exposes one compact **Recalculate
estimate** action. The same photo is analyzed again with the user's dish identity as
authoritative context; portions, sides, drinks, and nutrient totals are recomputed
from scratch. The stale estimate cannot be saved as reviewed, and the correction is
recorded in the local meal source metadata. Meal-photo calls request temperature 0
to reduce avoidable run-to-run drift, with an automatic compatibility retry when a
provider or model does not support that parameter.

The meal prompt is explicitly weight-first: identify components, estimate the
consumed mass of each component from geometry and genuine scale cues, cross-check
the combined mass, and only then derive component nutrients. It forbids working
backward from calories or substituting a canonical serving, and keeps hidden oil
and sauce conservative and explicit. This follows the
Nutrition5k prompt ablation in which an actual-visible-portion prompt improved
calorie concordance over a minimal baseline; that study also found its second
self-critique pass equal or worse, so the app does not buy a second ungrounded AI
call and present it as validation.

The review UI shows four visible stages—photo preparation, provider wait, result
validation, and editable-review construction—with elapsed time and a moving
progress indicator. These stages communicate activity; they do not claim that a
provider exposes byte-level inference progress. A running request has an explicit
**Cancel analysis** action so a slow endpoint does not force a page refresh. Closing
the modal is a separate action: the live editor is parked in the document and the
request continues in the background, then **Log meal** restores the same workspace
and completed result.

The same capture surface now has two explicit modes. **Meal photo** estimates
foods and portions. **Nutrition label** reads absolute printed amounts, serving
size, servings per container, and per-serving/per-100 g/per-100 mL/per-package
basis, then scales them to the user-entered amount eaten. It ignores % Daily
Value as an absolute nutrient amount and records OCR uncertainty. Label scans are
expected to be more precise than visual food inference, but still require review
for glare, crops, unit conversion, and dual-column labels.

Nutrition-label mode uses the selected vision model rather than a product
database. The model transcribes the printed serving basis and nutrients, after
which the app scales those reviewed values to the amount eaten. New meal and
label analyses never select or merge a food-composition database entry. Older
saved meals keep their original provenance visible for historical accuracy.

Every saved record also requires a meal occasion (breakfast, brunch, lunch,
dinner, snack, drink, or other) and stores the original local clock time, local
date, IANA timezone, and UTC offset. The local summary exposes aggregated
first/last meal times and observed eating-window length—never individual meal
times or photos. Diet & Digestion shows a compact seven-day intake and timing
link, and Light & Circadian gets the wearable-relative timing link. These timing
aggregates remain out of the default nutrition AI context to keep it focused and
small.

When Oura supplies real `bedtime_start` and `bedtime_end` instants, those remain
in the wearable database and are matched locally to the nearest preceding and
following meal records. The aggregate can then report last-meal-to-sleep,
wake-to-first-meal, and sleep-spanning logged-meal gaps with matched-night counts.
No wake time is inferred from sleep duration. If no actual interval exists, the
wearable-relative fields simply do not appear. This is the intended basis for
fasting-window exploration: concrete timestamps and coverage counts, not a fixed
“dinner after 17:00” rule.

The same full-width widget is available in Body and as a first-class Dashboard
widget. It intentionally uses one understandable window: complete logged-day
averages from the last 7 days. Energy uses one dominant progress ring; up to four
user-selected nutrients use target/guide bars; and a seven-cell strip shows
exactly which days contain meals. The default bars are protein, fat, fiber, and
fluid, avoiding carbohydrate, sugar, or sodium overload unless the user chooses
them. The customization UI enforces the same four-nutrient limit as the widget,
so saved preferences cannot silently exceed what is displayed. Missing days are
called unknown rather than silently averaged as zero.

Targets are profile-scoped and editable. Protein can use the latest normalized
weight from a connected wearable/biometric source (including Fitbit), fall back
to a manual weight record, or use fixed grams. The general-adult preset uses the
EFSA 0.83 g/kg reference; optional active and high-training presets use 1.6 and
2.0 g/kg. The UI does not describe 1.5–2.0 g/kg as universally ideal. Sugar is a
user-defined guide because a food photo usually cannot distinguish total sugar
from WHO's free-sugar definition. The AI context contains seven-day core averages
plus only meaningful percentage changes against the non-overlapping preceding
23-day period. A trend is omitted unless the current period has at least three
complete nutrient-days and the comparison period has at least five.
Before the user saves this setup, the widget labels its built-in values as starter
guides rather than personal targets. Invalid or blank values stay in the editor
with a visible correction message instead of silently reverting to defaults.
Once targets are personal, Dashboard and History use the same green/amber/red
attainment vocabulary. Exact macro and energy targets grade distance from the
target, fiber and fluid grade progress toward a minimum, and sugar/sodium limits
remain favorable until their guide is crossed. Every colored bar also includes a
text status; starter guides remain visually neutral.

- [EFSA adult protein dietary reference value](https://www.efsa.europa.eu/en/press/news/120209)
- [ISSN protein and exercise position stand](https://pubmed.ncbi.nlm.nih.gov/28642676/)
- [WHO healthy diet guidance](https://www.who.int/news-room/fact-sheets/detail/healthy-diet)

## Fuel Mix Context and the Randle cycle

**Fuel Mix Context** is a standalone Body widget. It has its own Dashboard
picker, ordering, and visibility state, is hidden from the Dashboard by default,
and is not embedded in **Daily Nutrition**. Reviewed-meal detail uses the same
compact composition view. The widget is read-only: meal logging, nutrition-plan
customization, and contextual drink logging remain owned by **Daily Nutrition**
instead of being repeated in both widgets.

The feature is deliberately an intake-pattern estimate, not a claimed
measurement of Randle-cycle activation. The glucose–fatty acid cycle describes
reciprocal fuel selection and competition between glucose and fatty acids in
tissues. It is continuous and context-dependent rather than an on/off switch or
a sequence of discrete stages that meal logging can observe.

For each meal with both macros available, the app converts carbohydrate and fat
to estimated energy using 4 kcal/g and 9 kcal/g. The overlap formula is:

`2 × min(carbohydrate kcal, fat kcal) ÷ (carbohydrate kcal + fat kcal)`

This index remains an internal calculation for grouping optional personal
check-ins; it is not displayed as a score or sent in compact AI context. The UI
instead displays the directly derived carbohydrate/fat energy split as one
stacked composition bar with percentages. There is no duplicate ratio label, centered zone,
slider, target marker, progress ring, red/green threshold, or “balanced” label.
When available, the view also shows average carbohydrate-plus-fat energy per
macro-complete meal so the same split at a small and large absolute intake is
not presented as equivalent.
The seven-day split is calculated per meal and weighted by each meal's carb-plus-
fat energy. This preserves the distinction between mixed meals and separate
carb-only/fat-only meals that happen to produce similar weekly totals.

The default widget stays compact: composition bar, percentages, average amount,
meal coverage, and at most one short “Worth reviewing” signal. Measurement limits and
the saved-plan reference live under a collapsed **About this estimate** disclosure.

Consequently, the split has no universal target. Neither 50/50 nor a more
one-sided split is automatically labeled healthy or unhealthy. The copy still
flags that a large refined-carbohydrate and high-fat meal can matter because of
total energy, food quality, and delayed glucose effects—not because it lands at
the center of the bar. The split must not be described as insulin resistance,
metabolic inflexibility, weight-gain risk, or measured substrate oxidation.
Those interpretations require physiology that meal macros do not provide, such
as fasting/fed state, energy balance, activity, insulin and circulating
substrates, glycogen, and indirect calorimetry or a controlled metabolic
challenge. The compact AI context sends the split, not the internal score, and
repeats this limit.

The action layer does not invent an optimal band. A saved carbohydrate/fat plan
is labeled an adherence reference inside the disclosure, never a marker on the
composition bar. One short priority row can name the strongest available logged
lever—macro coverage, energy above the user's target, fiber below the user's
minimum, or plan alignment—without adding explanatory action cards.

Saved meal detail also offers an optional 2–3 hour check-in for later hunger and
subjective energy. After six macro-complete check-ins, the browser can compare
meals with meaningfully different carb/fat composition. The internal grouping
requires at least a 20-point index range. The UI labels the result a personal
association and names the major uncontrolled explanations; it never claims
causation or metabolic measurement.
The Dashboard does not show setup progress such as `0/6`; a response pattern is
shown only after the minimum evidence exists.
The check-in is encrypted and cross-synced with its meal but is deliberately
excluded from the compact AI nutrition summary. Editing a meal preserves its
check-in, while logging the meal again starts without the prior response.

This design makes the feature actionable in two bounded ways: adherence to a
plan the user intentionally selected, and repeated within-person observation.
It does not recommend minimizing or maximizing overlap, avoiding mixed meals,
or always pairing protein with carbohydrate or fat.

- [Original glucose–fatty acid cycle paper (Randle et al., 1963)](https://pubmed.ncbi.nlm.nih.gov/13990765/)
- [The Randle cycle revisited](https://pmc.ncbi.nlm.nih.gov/articles/PMC2739696/)
- [Metabolic flexibility in health and disease](https://pmc.ncbi.nlm.nih.gov/articles/PMC5513193/)
- [Food quotients and predicted respiratory quotients](https://pubmed.ncbi.nlm.nih.gov/3771290/)
- [Review questioning simple fat-oxidation predictions of weight gain](https://pubmed.ncbi.nlm.nih.gov/31353786/)
- [Food-combining randomized trial](https://pubmed.ncbi.nlm.nih.gov/10805507/)
- [Mixed meals and post-meal glucose response](https://pubmed.ncbi.nlm.nih.gov/26354383/)
- [ADA Standards of Care in Diabetes—2026: nutrition and meal planning](https://diabetesjournals.org/care/article/49/Supplement_1/S89/163932/5-Facilitating-Positive-Health-Behaviors-and-Well)
- [Combined fat and carbohydrate food-reward study](https://pubmed.ncbi.nlm.nih.gov/29909968/)
- [Randomized mixed-meal study in type 1 diabetes](https://pubmed.ncbi.nlm.nih.gov/29931719/)

## Meal timing interpretation

Clock time alone is not a clinical threshold. Controlled studies more often
compare meals relative to habitual bedtime or substantially shifted schedules.
The app therefore presents local timing descriptively and, when wearable sleep
intervals exist, relative to actual sleep and wake times. It does not label a
clock time unhealthy or diagnose insulin resistance from timing.

- [Randomized early vs late dinner crossover trial](https://pubmed.ncbi.nlm.nih.gov/35015083/)
- [Randomized delayed eating-schedule crossover trial](https://pubmed.ncbi.nlm.nih.gov/36858920/)
- [NHLBI chrononutrition workshop report](https://pmc.ncbi.nlm.nih.gov/articles/PMC12184280/)
- [FDA serving-size guidance](https://www.fda.gov/food/nutrition-facts-label/serving-size-nutrition-facts-label)

Meal-photo detailed nutrients use the selected model rather than a food database:

1. The vision model identifies foods, preparation, hidden-ingredient assumptions,
   and actual visible portions.
2. The same response estimates the complete current nutrient registry for the
   meal and each component. Every field is nullable; unknown is never converted
   to zero.
3. The browser validates and normalizes the structured result, records exactly
   which fields the model estimated, and exposes every returned value for review.

The registry is shared by the prompt schema, editor, saved detail, summaries,
context, Debug comparison, and demo fixtures. Adding a future nutrient to it
therefore exposes a new nullable slot throughout the feature instead of requiring
a new food-pack schema or matcher. This does not make photo micronutrients
measured facts: they remain model estimates derived from food identity, recipe,
preparation, and portion assumptions.

Editing grams rescales the selected per-100 g profile and sums only nutrient keys
available for every remaining component. Removing a component subtracts its
linked profile. When a model supplied only meal-level totals and no component
nutrient profile, a single quantified component safely inherits those same totals
as its profile. Multi-component meals without linked profiles remain stale and
block Save after a portion edit because the browser cannot safely invent a
nutrient split between foods. Per-100 g profiles retain extra internal precision,
explicit user nutrient edits are retained, and changing food identity still
requires visual reanalysis.

No new analysis selects, merges, or caches a food-composition database record.
Older saved meals can retain a read-only historical source label so the app does
not rewrite their provenance.

## Model policy and evaluation

The feature is provider-agnostic and uses the chat model unless the user chooses a
dedicated meal-photo route in AI Settings. It does not hard-code a premium model
or silently switch to a more expensive one. Before recommending models in the UI,
run the same versioned evaluation set and prompt against each candidate.

When Settings → Display → Debug Mode is enabled, the meal editor exposes a
separate **Meal benchmark** workspace. Its compact photo picker can use views
copied from Log meal or accept its own views, so Log meal does not need an
attachment first. Benchmark photos and model choices survive round trips back to
the current meal draft, while each surface keeps its own photo input. The
workspace prepares the selected photo set once, then runs 2–4 connected vision
models in parallel after any required provider consent. Each Run starts one clean, same-input batch for the selected models;
it never mixes incremental runs made under different conditions. Results use a two-column desktop grid and a single column on narrow
screens. If one request fails, its card exposes **Retry this model**; retrying
reuses the prepared photo and run context and does not rerun models that already
succeeded. Each running card also has **Cancel this model**; canceling one provider
does not interrupt the other selected models. Closing the workspace parks it in
the background, and reopening Log meal restores the in-flight or completed cards.
The user may enter a reference dish, ingredients, total grams,
energy, and macros. Manual reference mode activates as soon as any reference
value is entered, and completed result scores update as the values are edited—no
separate enable step is required. The optional known-values editor is collapsed
until needed to keep the default setup compact. A deterministic browser-local score ranks
nutrient/weight error and ingredient-name overlap against that reference.
The uncalibrated identity self-check is labeled separately and is never used as
correctness or ranking. Without reference data the view remains a side-by-side comparison
and names no winner. The reference answer is never included in a model prompt.
One result can be moved into the normal editable review with **Use this
estimate**. The last comparison, reference data, and extra model outputs are
stored in the encrypted per-profile nutrition database so an expensive run can
be reopened, but are not synced and never enter AI context. Photos are not kept
as part of the comparison snapshot.

Every successful AI photo or label request retains the provider-reported input
and output token counts. The editable review, saved meal detail, and each
successful comparison card show the model, calculated USD cost, total tokens,
and input/output split. Costs use the same browser-local provider pricing cache
and formatter as chat. A leading approximation mark means only fallback pricing
was available; if a provider omits usage, the UI says so instead of presenting a
zero-cost request. Normal meal-request usage is retained inside the encrypted
meal record and follows that record's sync choice. The last comparison's usage is retained only in its
encrypted, device-local snapshot with the other Debug results.

The model's `confidence` field is a verbalized self-assessment, not a measured
probability that the food or nutrition estimate is correct. The prompt uses a
fixed four-anchor identity rubric. The raw value remains available in the
encrypted record for future calibration, but the UI shows only
**Uncalibrated identity self-check** and exposes assumptions and warnings; it no
longer presents a model-written percentage as if it were accuracy. Published
vision-language calibration research finds material miscalibration across models
and tasks, so model selection never uses this field. The prominent
**Reference agreement** score is calculated locally from user-entered or
model-selected reference values (70% nutrition/amount and 30% bidirectional
ingredient match); it is an evaluation heuristic, not clinical accuracy.

- [Verbalized confidence calibration in vision-language models (EMNLP 2025)](https://aclanthology.org/2025.emnlp-main.74/)

Both the Meal photo analysis setting and Debug comparison show the current
product-curated cloud models whose connected provider positively reports
image-input support. They also admit the current Qwen 27B and 35B-A3B
open-weight evaluation tiers when that exact provider route reports image input;
these remain benchmark candidates rather than product recommendations. Local AI
and custom endpoints keep all positively confirmed vision families so user-run
benchmarking is not restricted by the cloud shortlist. Research evidence is
guidance, not an eligibility gate, so a current Sonnet, Opus, Gemini, Grok, or
eligible Qwen evaluation route can be selected before a food-specific paper
studies that exact release. Multiple
versions are collapsed to the newest route in each model family and the visible
list is ordered by the provider's token price, with evidence labels shown
separately. A studied predecessor can inform the guidance copy without forcing
Sonnet 4.6 or Opus 4.6 to appear beside a catalogued Sonnet 5 or Opus 5.
Fast/FastAPI Kimi K3 routes are treated as variants
of base Kimi K3 and lose the slot when the base route is available. GPT-6 Astra replaces GPT-5.6 Sol in cloud recommendations when listed by
the provider; Sol remains the fallback until then. GPT Nano and Mini variants
do not inherit flagship recommendations. Existing model selections remain available. GLM 5.2 remains available under other text models when a provider
offers it, but is no longer in the regular recommended set now that GLM 5.3 is
the curated generation. GLM is excluded from meal routes unless its exact
provider route explicitly reports image input. Local discovery adds only models that explicitly report
vision support; the selected Qwen3-VL model is also recognized directly because
it is a vision-first family and the initial local recommendation.

The normal Meal photo analysis setting follows the main AI provider and lists
that provider's connected vision-capable model families. A saved override from another
provider is ignored while the main provider differs. Debug comparison remains
cross-provider by design so connected providers can be evaluated side by side.
Provider-specific model IDs are normalized for family/version comparison; for
example, Venice's compact `openai-gpt-55` form ranks below a future catalogued
`openai-gpt-56-sol`, without showing the latter before Venice reports it. When
Venice reports Sol as vision-capable, it appears alongside Luna in both the main
Recommended group and the meal-photo model list, and an active Sol main model is
inherited by meal analysis.

Evidence and candidate guidance:

1. **Claude Sonnet 4.6** — best-studied default. A 2026 multi-dataset food
   image study found the best cost/performance balance; Opus' median percentage
   error was generally only 1–3 points lower at roughly five times the listed
   input-token cost.
2. **Gemini 3.8 Flash** — recommended value candidate where available. A July
   2026 Nutrition5k preprint found Gemini 3.0 Flash best for calorie estimation
   among ten tested models and Gemini 3.1 Flash Lite best for cost/performance,
   but that evidence does not validate the newer 3.8 route. Google reports that
   3.8 improves on 3.7 at the same introductory token price; the exact version
   nevertheless remains explicitly marked as needing an app-specific benchmark.
3. **Claude Opus 4.6** — studied accuracy tier for complex meals. The same study found a
   modest advantage on meal photos, but not a consistently meaningful numerical
   advantage across all conditions.
4. **GPT-5.6 Sol** — flagship vision challenger where the provider reports image
   support. Official OpenAI documentation identifies Sol as the flagship tier,
   Terra as balanced, and Luna as cost-sensitive; all three support image input.
   The same food study reports competitive
   ChatGPT-5 food-image results, and an earlier controlled study found GPT-4o and
   Claude 3.5 Sonnet similar. The exact 5.6 tiers available through each getbased
   provider still need direct food evaluation.
5. **Qwen3-VL 8B/32B Instruct and current Qwen 27B/35B-A3B vision routes** —
   local/open-weight candidates. Qwen3.8 currently provides the dense 27B tier;
   there is no official Qwen3.8 35B release, so the current 35B-A3B counterpart
   may carry an earlier generation number. The app trusts the connected
   provider's live image-input metadata and keeps 27B and 35B-A3B as separate
   comparison tiers, but they need food-specific validation before a badge or
   recommendation.

Sources:

- [2026 multi-dataset model/prompt comparison](https://www.mdpi.com/2072-6643/18/12/2017)
- [2026 ten-model Nutrition5k benchmark preprint](https://www.biorxiv.org/content/10.64898/2026.07.26.740845v1)
- [2025 controlled GPT-4o/Claude/Gemini study](https://pmc.ncbi.nlm.nih.gov/articles/PMC12513282/)
- [2025 FoodNExTDB food-recognition benchmark](https://arxiv.org/abs/2504.06925)
- [Official OpenAI model catalog](https://developers.openai.com/api/docs/models)
- [Official Qwen3-VL repository](https://github.com/QwenLM/Qwen3-VL)
- [Official Qwen3.8 27B model card](https://huggingface.co/Qwen/Qwen3.8-27B)

The evaluation set should include Nutrition5k, SNAPMe/ASA24-style portions, local
foods, mixed dishes, packaged foods, poor lighting, and large portions. Score food
identification F1, portion gram MAE/MedAPE, energy/macronutrient MAE, JSON success,
calibration, latency, and cost. Large portions and sodium need explicit failure
analysis: published studies report systematic underestimation for large portions
and particularly weak salt/sodium inference from images.

## Deliberate MVP limits

- No deficiency diagnosis, clinical adequacy score, or medical alerts. Targets
  are user-configured planning guides, not prescriptions.
- No automatic background upload or provider call.
- No original/full-size photo sync or central photo database. Reviewed meal data
  and 240px thumbnails use the existing encrypted cross-device profile sync.
- No promise that a photo can reveal hidden ingredients or accurate micronutrients.
- Legacy database-derived records retain visible historical provenance, but new
  photo and label flows do not perform barcode or food-database lookup.
- No model leaderboard in the UI until the repository has a reproducible,
  versioned food-specific evaluation harness.

## First-class follow-up status

Implemented in this iteration:

1. Editable component names and grams, deterministic linked-portion arithmetic,
   stale-total protection for unlinked portions, and explicit nutrient edits.
2. Complete nullable model-estimated nutrient fields, versioned source metadata,
   and nutrition-label transcription/scaling.
3. Up to four meal/package views with duplicate-view instructions.
4. Device-local Oura sleep-onset/wake joins and coverage-qualified logged meal
   gaps.
5. Saved-meal editing, **Log again**, review completeness, and source/identity/
   portion/label uncertainty separated in the UI.
6. One canonical nutrient registry across prompts, review, comparison, summaries,
   context, and demo data, with compact provenance that is safe for encrypted
   cross-device sync.

Remaining work:

1. Add named recipes and ingredient-level recipe editing beyond **Log again**.
2. Add an optional password-encrypted wrapper around portable JSON exports;
   originals remain excluded and only thumbnails enter ordinary profile sync.
3. Add duplicate-meal detection across repeated captures and an explicit
   completeness marker for days where the user confirms every intake was logged.
4. Build food- and label-specific evaluation sets across cuisines, languages,
   label formats, lighting, serving bases, and model/provider versions before
   showing recommendation badges.
