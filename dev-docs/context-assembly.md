# Context Assembly

How user-provided data becomes AI prompts. This is the core intelligence layer — every AI feature is only as good as the context it receives.

## The Big Picture

```
                           ┌─────────────────────────────────────────┐
                           │           7 AI FEATURES                 │
                           │                                         │
                           │  Chat  Focus  Health  PDF   Persona     │
                           │  Panel Card   Dots    Import Generator  │
                           │  Per-Marker AI   Correlation AI         │
                           └────────────┬────────────────────────────┘
                                        │
                                        ▼
                              ┌──────────────────┐
                              │  callClaudeAPI() │  ← single entry point
                              │     api.js       │
                              └────────┬─────────┘
                                       │
              ┌──────────┬──────┴──────┬──────────┬──────────┐
              ▼          ▼             ▼          ▼          ▼
         OpenRouter   Routstr        PPQ       Venice     Local AI
         (OpenAI)     (OpenAI)    (OpenAI)    (OpenAI)   (OpenAI)
         via shared   via shared  via shared  via shared  via shared
         helper       helper      helper      helper      helper
```

Every AI call passes the same shape: `{ system, messages, maxTokens, onStream? }`. The caller assembles the prompt; the router just delivers it.

## Data Sources

Everything the AI can know about the user comes from these sources:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER DATA SOURCES                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  PROFILE                    CONTEXT CARDS (9)      LAB DATA         │
│  ├─ sex                     ├─ Health Goals         ├─ entries[]    │
│  ├─ DOB (→ age)             ├─ Medical History      ├─ dates[]      │
│  └─ location/latitude       ├─ Diet                 ├─ marker values│
│                             ├─ Exercise             ├─ ref ranges   │
│  PERSONA                    ├─ Sleep & Rest         ├─ optimal ranges│
│  ├─ personality ID          ├─ Light & Circadian    ├─ phase ranges │
│  ├─ promptText              ├─ Stress               ├─ custom markers│
│  └─ evidenceBased flag      ├─ Love Life            └─ flagged results│
│                             └─ Environment                          │
│  CHAT                                                               │
│  ├─ user message            OTHER                                   │
│  └─ last 10 history msgs    ├─ Interpretive Lens                   │
│                             ├─ Context Notes                        │
│  MARKER SCHEMA              ├─ Menstrual Cycle                      │
│  ├─ MARKER_SCHEMA           ├─ Supplements                          │
│  └─ customMarkers           ├─ User Notes                           │
│                             └─ Genetics (SNPs, if imported)         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## buildLabContext() — The Central Serializer

`buildLabContext()` in `lab-context.js` is the single function that converts all user data into a plain-text block. It is used by Chat and Health Dots. The Focus Card uses the lighter `buildFocusContext()` instead.

### Output Structure

Sections are ordered by priority — the AI sees "what are you trying to solve?" first, then "what do the numbers say?", then medical/lifestyle context. This exploits primacy bias in LLMs.

Each section is wrapped in `[section:name]...[/section:name]` tags for machine-parsable extraction (used by getbased-mcp, Hermes Agent, OpenClaw). Flagged results use `[critical]...[/critical]`. Lab sections include an `updated:date` attribute.

```
Lab data for current profile (sex: female, age: 34, unit system: SI, today: 2026-02-24,
  dates: Jan 15, Feb 20, Mar 10):

[section:healthGoals]                      ←── 1. GOALS (what to optimize)
## Health Goals (Things to Solve)
### Major Priority
- Optimize thyroid function
### Mild Priority
- Improve sleep quality
[/section:healthGoals]

[section:interpretiveLens]                 ←── 2. LENS (analytical framework)
## Interpretive Lens
Quantum biology, functional medicine paradigm
[/section:interpretiveLens]

[index]                                    ←── category index for selective parsing
Available sections: biochemistry, hormones, lipidPanel
[/index]

Note: status labels below use reference ranges.

[section:biochemistry updated:2026-03-10]  ←── 3. LAB VALUES (the data)
## Biochemistry
- Glucose: Jan 15: 5.2, Feb 20: 5.0, Mar 10: 4.9 mmol/L (ref: 3.9–5.6, status: normal)
- Creatinine: Jan 15: 72, Feb 20: 70 µmol/L (ref: 53–97, status: normal)
[/section:biochemistry]

[section:hormones updated:2026-02-20]
## Hormones
- Estradiol: Jan 15: 180 [follicular, ref 77–921], Feb 20: 95 [luteal, ref 65–380] pmol/L
  ↑ phase-aware: each value shows its cycle phase + phase-specific ref range
[/section:hormones]

[critical]                                 ←── 4. FLAGS (quick-scan summary)
## Flagged Results (Latest)
- Ferritin: 12 µg/L (LOW, range: 15–200)
[/critical]

[section:userNotes]                        ←── 5. NOTES (temporal context)
## User Notes
- Jan 10: Started new thyroid medication
- Feb 15: Feeling much better energy-wise
[/section:userNotes]

[section:diagnoses]                        ←── 6. MEDICAL CONTEXT
## Medical History / Diagnoses
- Hashimoto's (major, since 2020)
### Family history (heritable/environmental risk signal)
- father: Heart Attack (MI), onset age 52 — survived, on statin since
- mother: Type 2 Diabetes, onset age 45
- maternal grandmother: Breast Cancer, onset age 61
Notes: On levothyroxine 50mcg
[/section:diagnoses]

[section:supplements]                      ←── 7. SUPPLEMENTS
## Supplements & Medications
- Vitamin D3 (5000 IU) [supplement]: Jan 1 → ongoing
- Magnesium glycinate (400mg) [supplement]: Jan 15 → ongoing
[/section:supplements]

[section:menstrualCycle]                   ←── 8. CYCLE (female only)
## Menstrual Cycle
Profile: 28-day cycle (5-day period), regular, moderate flow.
Recent periods: Jan 3-Jan 7 (moderate) [Cramps, Fatigue], ...
Blood draw cycle context:
- Jan 15: Day 13 (follicular phase)
- Feb 20: Day 18 (luteal phase)
Next optimal blood draw window: Mar 3-5
[/section:menstrualCycle]

[section:diet]                             ←── 9-15. LIFESTYLE CARDS
## Diet & Digestion
Type: Mediterranean. Pattern: 3 meals.
Breakfast (07:00): eggs, avocado
Lunch (12:30): salad with chicken
Dinner (19:00): salmon, vegetables
[/section:diet]

## Exercise & Movement
Frequency: 4x/week. Types: weights, yoga. Intensity: moderate.

## Sleep & Rest
Duration: 7-8h. Quality: good. Room temp: 65°F.
Environment: blackout curtains, grounding sheet.

## Light & Circadian
Morning light: 15min. UV exposure: moderate. Latitude: 40-50°N.

## Stress
Level: moderate. Sources: work, finances.

## Love Life & Sexual Health
Status: partnered. Relationship quality: good. Libido: normal.

## Environment
Water: filtered. EMF: wifi router. Home lighting: mixed.

## Context Change Timeline                 ←── 17. CHANGE HISTORY
- Mar 1, 2026: Diet & Digestion — type: omnivore → carnivore
- Feb 15, 2026: Stress — level: high → moderate

## Additional Context Notes                ←── 18. FREETEXT NOTES
Started cold plunges in January
```

### Empty-Card Guards

Cards with no meaningful content are omitted entirely (not sent as empty sections). Each card checks for actual data:

- `diagnoses`: conditions array not empty OR note has text
- `diet`: type set OR any meal content OR note
- `exercise`: frequency set OR types array not empty OR note
- `sleepRest`: duration set OR quality set OR issues not empty OR note
- `stress`: level set OR sources not empty OR note
- `loveLife`: status set OR libido set OR concerns not empty OR note
- `environment`: setting set OR water set OR air not empty OR note

### Data Flow Diagram

```
importedData (localStorage)
         │
         ├─── .healthGoals ────────────────────────────────┐  ← FIRST
         ├─── .interpretiveLens ───────────────────────────┤
         │                                                 │
         └─── .entries ──┐                                 │
                         ▼                                 │
                  getActiveData()                          │
                    │                                      │
                    ├─── categories[].markers[]             │
                    │     ├─ values[] (per date)            │
                    │     ├─ refMin/refMax                  │
                    │     ├─ phaseRefRanges[] (female)      │
                    │     └─ phaseLabels[] (female)         │
                    │                                      │
                    └─── getAllFlaggedMarkers() ────────────┤
                                                           │
         ├─── .notes ──────────────────────────────────────┤
         ├─── .diagnoses ──────────────────────────────────┤
         ├─── .supplements ────────────────────────────────┤  ← MEDICAL
         ├─── .menstrualCycle ─── + helper functions ──────┤
         │     ├─ getCyclePhase()                          │
         │     ├─ getBloodDrawPhases()                     │
         │     ├─ getNextBestDrawDate()                    │
         │     ├─ detectPerimenopausePattern()             │
         │     └─ detectCycleIronAlerts()                  │
         ├─── .diet ───────────────────────────────────────┤
         ├─── .exercise ───────────────────────────────────┤
         ├─── .sleepRest ──────────────────────────────────┤  ← LIFESTYLE
         ├─── .lightCircadian ─── + getLatitudeFromLocation()
         ├─── .stress ─────────────────────────────────────┤
         ├─── .loveLife ───────────────────────────────────┤
         ├─── .environment ────────────────────────────────┤
         ├─── .changeHistory ──────────────────────────────┤
         └─── .contextNotes ───────────────────────────────┤  ← LAST
                                                           │
                                                           ▼
                                                  buildLabContext()
                                                       │
                                                       ▼
                                                  plain text block
```

## Prompt Composition Per Feature

### 1. Chat Panel (`sendChatMessage`)

The most complex composition — layers 4 components. Lab context is placed before personality so the AI processes data first, then adopts the persona:

```
┌──────────────────────────────────────────────────────┐
│                    SYSTEM PROMPT                      │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │ CHAT_SYSTEM_PROMPT (constants.js)              │  │
│  │ Priority-tiered structure:                     │  │
│  │                                                │  │
│  │ ## Core Rules                                  │  │
│  │  • NOT a doctor disclaimer                     │  │
│  │  • Reference specific values/dates             │  │
│  │  • Format with markdown                        │  │
│  │                                                │  │
│  │ ## Priority Context (apply when present)       │  │
│  │  • Health goals → prioritize by severity       │  │
│  │  • Interpretive lens → frame through experts   │  │
│  │  • Medical conditions → interpret accordingly  │  │
│  │  • Supplements → correlate start/stop dates    │  │
│  │  • Menstrual cycle → phase-aware hormones      │  │
│  │  • Notes → medication changes, symptoms        │  │
│  │                                                │  │
│  │ ## Lifestyle Context (apply when present)      │  │
│  │  • Diet, exercise, sleep, light, stress,       │  │
│  │    relationships, environment                  │  │
│  │  • Cross-cutting: cortisol/HPA axis note       │  │
│  │                                                │  │
│  │ ## Style                                       │  │
│  │  • Accessible, concise, redirect off-topic     │  │
│  └────────────────────────────────────────────────┘  │
│                       +                              │
│  ┌────────────────────────────────────────────────┐  │
│  │ "Current lab data:\n"                          │  │
│  │ buildLabContext()  ← entire serialized context │  │
│  └────────────────────────────────────────────────┘  │
│                       +                              │
│  ┌────────────────────────────────────────────────┐  │
│  │ PERSONALITY LAYER (after data)                 │  │
│  │  • Default: (nothing added)                    │  │
│  │  • Dr. House: personality.promptAddition       │  │
│  │  • Custom: "Persona: {promptText}"             │  │
│  │    + evidence-based disclaimer if opted in     │  │
│  └────────────────────────────────────────────────┘  │
│                       +                              │
├──────────────────────────────────────────────────────┤
│                    MESSAGES                           │
│                                                      │
│  Last 10 chat history entries (role + content)       │
│  + current user message                              │
│                                                      │
├──────────────────────────────────────────────────────┤
│  maxTokens: 4096  │  streaming: yes                  │
└──────────────────────────────────────────────────────┘
```

### 2. Focus Card (`loadFocusCard`)

Uses the lightweight `buildFocusContext()` (~200-400 tokens) instead of full `buildLabContext()` (~2000-8000 tokens). Health-goals-aware system prompt:

```
┌──────────────────────────────────────────────────────┐
│  SYSTEM (if health goals exist):                     │
│  "You are a blood work analyst. Respond with ONE     │
│   sentence, max 40 words. If the patient has health  │
│   goals listed, connect your finding to their most   │
│   relevant goal. Name the single most actionable     │
│   marker finding, its direction, and why it matters. │
│   No preamble, no disclaimer."                       │
│                                                      │
│  SYSTEM (no health goals):                           │
│  "...Name the single most important marker finding,  │
│   its direction (rising/falling/high/low), and       │
│   briefly why it matters clinically..."              │
├──────────────────────────────────────────────────────┤
│  USER: buildFocusContext()                           │
│    • Profile: sex, age, today                        │
│    • Major health goals (if any)                     │
│    • Flagged markers (latest values + ranges)        │
│    • Notable changes >20% from previous              │
│    ~200-400 tokens total                             │
├──────────────────────────────────────────────────────┤
│  maxTokens: 100  │  streaming: no                     │
├──────────────────────────────────────────────────────┤
│  CACHE: fingerprint = hash(entries + sex + DOB +      │
│         all 9 cards + lens + notes + cycle + supps)   │
└──────────────────────────────────────────────────────┘
```

### 3. Context Card Health Dots (`loadContextHealthDots`)

Requests structured JSON for only the stale (changed) cards. JSON.parse is wrapped in try-catch — on malformed AI responses, stale cards get gray dots while cached good data is preserved:

```
┌──────────────────────────────────────────────────────┐
│  SYSTEM: "Based on this person's lab data and        │
│  profile context, assess each profile area.           │
│  Return ONLY valid JSON with these keys..."           │
│                                                      │
│  { "diet": {"dot":"...","tip":"..."},                │
│    "stress": {"dot":"...","tip":"..."} }    ← only   │
│                                               stale  │
│  Dot: green/yellow/red/gray                  cards   │
│  Tip: max 12 words, reference specific markers       │
├──────────────────────────────────────────────────────┤
│  USER: buildLabContext()                              │
├──────────────────────────────────────────────────────┤
│  maxTokens: 500  │  streaming: no                     │
├──────────────────────────────────────────────────────┤
│  CACHE: per-card fingerprint via getCardFingerprint() │
│         only stale cards re-fetched                   │
└──────────────────────────────────────────────────────┘
```

### 4. PDF Import (`parseLabPDFWithAI`)

Completely different context — no user profile, just schema + raw PDF. Filename is included in the user message for multi-file disambiguation:

```
┌──────────────────────────────────────────────────────┐
│  SYSTEM: "You are a lab report data extraction       │
│  assistant..."                                        │
│                                                      │
│  + JSON.stringify(buildMarkerReference())             │
│    { "biochemistry.glucose": { name, unit, ref },    │
│      "hormones.testosterone": { ... },               │
│      ... all known + custom markers }                 │
│                                                      │
│  + extraction rules (date format, value parsing,     │
│    WBC differential, custom marker suggestions)       │
│    WBC rule at position 3 (most error-prone)         │
│                                                      │
│  + expected JSON output schema                        │
├──────────────────────────────────────────────────────┤
│  USER: "Extract all biomarker results from this      │
│  lab report (file: report.pdf):\n\n" + pdfText       │
├──────────────────────────────────────────────────────┤
│  maxTokens: 8192  │  streaming: no                   │
└──────────────────────────────────────────────────────┘
```

### 5. Persona Generator (`generateCustomPersonality`)

Standalone creative prompt — no lab data involved:

```
┌──────────────────────────────────────────────────────┐
│  SYSTEM: "You are a persona designer for getbased.  │
│  Create a thorough persona covering:"                 │
│    1. Identity & Background                           │
│    2. Communication Style                             │
│    3. Medical & Health Philosophy                     │
│    4. Analytical Approach                             │
│    5. Lifestyle & Optimization Lens                   │
│    6. Character & Personality                         │
│    7. Signature Recommendations                       │
│  "400-500 words. No disclaimers."                     │
├──────────────────────────────────────────────────────┤
│  USER: "Create a comprehensive persona for: {name}"  │
├──────────────────────────────────────────────────────┤
│  maxTokens: 2048  │  streaming: yes (into textarea)  │
└──────────────────────────────────────────────────────┘
```

### 6. Per-Marker AI (`askAIAboutMarker`)

Not a separate API call — builds a user message and injects it into the chat panel. Uses effective (phase-aware) reference ranges and includes trend direction when 2+ values exist:

```
askAIAboutMarker("hormones.estradiol")
         │
         ▼
  "Tell me about my Estradiol results.
   Values: Jan 15: 180 pmol/L (follicular phase, ref 77–921),
           Feb 20: 95 pmol/L (luteal phase, ref 65–380).
   Reference range: 77–921 pmol/L. Optimal range: 200–400.
   Current status: normal.
   Trend: down 47.2% from previous.
   Note: reference ranges shown are phase-specific.
   What does this mean and should I be concerned?"
         │
         ▼
  openChatPanel(prompt) → sendChatMessage() → full Chat composition
```

## Caching Strategy

Each AI feature has independent caching to avoid redundant API calls:

| Feature | Cache Key | Fingerprint Inputs | Invalidation |
|---|---|---|---|
| Focus Card | `labcharts-{profile}-focusCard` | entries + sex + DOB + 9 cards + lens + notes + cycle + supps | Any data change |
| Health Dots | `labcharts-{profile}-contextHealth` | Per-card: lab data + card data + sex + DOB | Only changed cards re-fetched |
| Chat | `labcharts-{profile}-chat-t_{id}` | N/A (conversation history) | Never invalidated, 50-thread cap |
| PDF Import | N/A | N/A | No caching |
| Persona | N/A | N/A | No caching (user saves manually) |

## Token Budget

| Feature | maxTokens | Typical Context Size |
|---|---|---|
| Chat | 4096 | ~2,000–8,000 tokens (scales with data) |
| Focus Card | 100 | ~200–400 tokens (lightweight context) |
| Health Dots | 500 | ~2,000–8,000 tokens (full context) |
| PDF Import | 8192 | ~1,000–3,000 tokens (marker schema) |
| Persona Generator | 2048 | ~400 tokens (fixed) |

## Key Design Decisions

1. **Two serializers**: `buildLabContext()` for full context (Chat, Health Dots) and `buildFocusContext()` for slim context (Focus Card, ~200-400 tokens). The focus card only needs flagged markers and notable changes for a 40-word response.

2. **Priority-ordered sections**: `buildLabContext()` outputs sections in priority order — goals and lens first, then lab values and flags, then medical context, then lifestyle cards. This exploits LLM primacy bias so the most important context gets the most attention.

3. **Data before persona**: In Chat, lab context is placed before the personality layer in the system prompt. This ensures the AI processes the medical data first, then adopts the persona style.

4. **Priority-tiered system prompt**: `CHAT_SYSTEM_PROMPT` uses a 4-tier structure (Core Rules → Priority Context → Lifestyle Context → Style) instead of a flat bullet list. Health goals and interpretive lens are at the top of Priority Context.

5. **Empty-card guards**: Cards with no meaningful content are completely omitted rather than sent as empty sections. Each card has a specific content check (not just truthiness).

6. **Phase-aware values**: For female profiles with active cycle data, estradiol, progesterone, LH, and FSH values include per-date phase labels and phase-specific reference ranges inline. Disabled for hormonal contraception and non-cycling statuses (postmenopause, pregnant, breastfeeding).

7. **Effective ranges**: `askAIAboutMarker()` uses effective (phase-aware) reference ranges, not the static schema ranges. Also includes trend direction with percentage change.

8. **Robust JSON parsing**: `loadContextHealthDots()` wraps the AI response JSON.parse in try-catch. On malformed responses, stale cards get gray dots while cached good data is preserved.

## Prompt Improvement Methodology

### Versioning

Context assembly changes follow the scheme `YYYY-MM` (e.g., `2026-02`). Each version is documented in the changelog below.

### Evaluation Criteria

When evaluating context assembly changes, assess these 5 dimensions:

1. **Completeness** — Does the AI receive all relevant user data? Are any fields missing from the context?
2. **Primacy positioning** — Are the most important sections (goals, lens, lab values) at the top where LLMs pay most attention?
3. **Signal-to-noise** — Are empty cards omitted? Is the context lean and relevant, or padded with empty sections?
4. **Specificity** — Do values include proper units, reference ranges, phase context, and trend direction?
5. **Token efficiency** — Is the context appropriately sized for each feature's needs? (Focus card: ~200-400 tokens, not ~8000)

### Testing Methodology

Changes are verified through 4 layers:

1. **Source inspection** — `test-audit.js` assertions read source code and verify structural properties (function existence, string patterns, section ordering)
2. **DOM verification** — Browser tests check that rendered output includes expected elements
3. **Manual console check** — `window.buildLabContext()` in browser console to inspect actual output
4. **Cross-feature check** — Verify that Chat, Focus Card, and Health Dots all receive appropriate context

### Changelog Format

Each entry documents:
- Version identifier (YYYY-MM)
- Changes made (grouped by category)
- Files modified
- Rationale for non-obvious decisions

## Context Assembly Changelog

### 2026-02 — Priority Reordering + Enriched Context

**Enriched header**
- Added age (computed from DOB), current date (ISO), and unit system label to `buildLabContext()` header
- Consolidated 3 inline date formatters into single `fmtDate` helper

**Section reordering** (primacy bias optimization)
- Health Goals → Interpretive Lens → Lab Values → Flagged Results → User Notes → Marker Notes → Per-Value Notes → Medical History → Supplements → Menstrual Cycle → Diet → Exercise → Sleep → Light → Stress → Love Life → Environment → Context Notes
- Rationale: AI sees "what to solve" first, then data, then medical context, then lifestyle

**Empty-card guards**
- All 7 lifestyle/medical cards check for actual content (not just object truthiness)
- Prevents sending `## Diet\n` with no content when user has an empty diet card object

**System prompt restructure** (`CHAT_SYSTEM_PROMPT`)
- Restructured from flat 20-bullet list to 4 priority tiers (Core Rules → Priority Context → Lifestyle Context → Style)
- Promoted health goals + interpretive lens to top of Priority Context
- Consolidated 4 separate cortisol/HPA mentions into one cross-cutting note
- Removed duplicate creatinine/urea from exercise section (already in diet)

**Chat prompt order**
- Moved personality layer after lab data (was before): `SYSTEM_PROMPT + lab data + personality + search`
- Rationale: AI should process data first, then adopt persona style

**Focus card optimization** (`buildFocusContext`)
- New lightweight serializer: ~200-400 tokens vs ~2000-8000 from `buildLabContext()`
- Includes: profile (sex, age, today), major health goals, flagged markers, notable changes >20%
- Health-goals-aware system prompt: connects findings to goals when present

**Per-marker AI improvements** (`askAIAboutMarker`)
- Uses effective (phase-aware) reference ranges instead of static schema ranges
- Adds trend direction with percentage change when 2+ values exist

**PDF import fixes** (`parseLabPDFWithAI`)
- Moved WBC differential rule from position 6 to position 3 (most error-prone extraction rule)
- Added filename to user message for multi-file disambiguation

**Robustness**
- JSON.parse try-catch guard in `loadContextHealthDots()` — malformed AI responses degrade gracefully (gray dots on stale cards, cached good data preserved)

**Files modified**: `js/chat.js`, `js/constants.js`, `js/views.js`, `js/context-cards.js`, `js/pdf-import.js`, `service-worker.js` (v50→v51), `test-audit.js`, `CLAUDE.md`

### 2026-02b — Staleness Signals + Absent Field Awareness + Gate Broadening

**Staleness signals** (`buildLabContext`)
- **Global**: When most recent lab results are >90 days old, inserts explicit `NOTE:` line with date and approximate months since last test
- **Per-category**: After each category's markers, if that category's latest data is >90 days old, appends `⚠ Last tested ~N months ago` line — catches stale categories even when other data is recent (e.g., old fatty acids alongside fresh CBC)
- System prompt instructs AI to recommend retesting stale categories and discuss what similar/changed results would suggest

**Focus card staleness** (`buildFocusContext`)
- Added `last labs <date>` to compact header so focus card can caveat stale data

**System prompt additions** (`CHAT_SYSTEM_PROMPT`)
- Core Rules: instruction to note when data age affects analysis relevance
- Lifestyle Context: two bullets teaching AI that missing fields = user didn't provide (not assumed default), and missing sections = user hasn't filled that area

**Auto-gating with `hasCardContent()`** (v53)
- Replaced 7 hand-written card gates with generic `hasCardContent(obj)` from `js/utils.js`
- Returns `true` if any field has content: strings non-empty, arrays non-empty, `note` field trimmed
- Cards using auto-gate: diagnoses, diet, exercise, sleep, stress, loveLife, environment
- Light & Circadian keeps custom `lc || autoLat` gate (external latitude injection)
- Eliminates bug class: new fields added to any card are automatically included in AI context without manual gate updates

**Previously broadened empty-card gates** (v52, now superseded by auto-gating)
- Diet: added `restrictions`, `pattern`, `snacks` to gate (user who only sets restrictions was silently dropped)
- Exercise: added `intensity`, `dailyMovement` to gate
- Sleep: added `schedule`, `roomTemp`, `environment`, `practices` to gate
- Love Life: added `relationship`, `satisfaction`, `frequency`, `orgasm` to gate
- Environment: added `climate`, `waterConcerns`, `emf`, `emfMitigation`, `homeLight`, `toxins`, `building` to gate

**Files modified**: `js/utils.js`, `js/chat.js`, `js/constants.js`, `js/views.js`, `js/changelog.js`, `service-worker.js` (v52→v53), `test-audit.js`, `test-changelog.js`, `CLAUDE.md`

### 2026-03 — Change History

**Context card change tracking** (`buildLabContext`)
- `importedData.changeHistory` populated by `recordChange()` in `context-cards.js` whenever a card save detects a field value change
- New `## Context Change Timeline` section (17) appended to `buildLabContext()` output, showing human-readable diffs between consecutive snapshots per field
- Enables temporal correlation: AI can connect a diet change on March 1 to a lab shift on March 15

**Files modified**: `js/state.js`, `js/profile.js`, `js/context-cards.js`, `js/cycle.js`, `js/chat.js`, `js/export.js`, `tests/test-change-history.js`, `CLAUDE.md`

### 2026-03b — Section Tags

**Machine-parsable section tags** (`buildLabContext`)
- Every section wrapped in `[section:name]...[/section:name]` tags for programmatic extraction (used by getbased-mcp, Hermes Agent, OpenClaw)
- Flagged results wrapped in `[critical]...[/critical]`
- Lab category sections include `updated:date` attribute with last data date
- New `[index]` block listing available lab category keys
- No change to content within sections — tags are additive

**Files modified**: `js/chat.js`, `tests/test-prelab.js`

## Source Files

| File | Key Functions |
|---|---|
| `js/utils.js` | `hasCardContent()` — generic empty-card gate for context assembly |
| `js/constants.js` | `CHAT_SYSTEM_PROMPT` — priority-tiered system prompt |
| `js/lab-context.js` | `buildLabContext()` — central serializer (full context) |
| `js/chat-send.js` | `sendChatMessage()` — chat prompt composition |
| `js/chat-marker-prompts.js` | `askAIAboutMarker()` — per-marker prompt (effective ranges + trend) |
| `js/chat-personalities.js` | `generateCustomPersonality()` — persona generator prompt |
| `js/views.js` | `buildFocusContext()` — lightweight focus card context (~200-400 tokens) |
| `js/views.js` | `loadFocusCard()` — focus card prompt (health-goals-aware) |
| `js/context-cards.js` | `recordChange(field)` — timestamps context field snapshots into `changeHistory` |
| `js/context-cards.js` | `loadContextHealthDots()` — health dots prompt (JSON.parse guarded) |
| `js/pdf-import.js` | `parseLabPDFWithAI()` — PDF import prompt (filename included) |
| `js/pdf-import.js` | `buildMarkerReference()` — marker schema serializer |
| `js/api.js` | `callClaudeAPI()` — provider router |
| `js/data.js` | `getActiveData()` — data pipeline (feeds buildLabContext) |
