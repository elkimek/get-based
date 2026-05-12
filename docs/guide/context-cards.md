# Context Cards

Context cards are the nine lifestyle panels on your dashboard, grouped under the heading **"What your GP won't ask you."** They capture the health context that shapes your lab results — information a typical appointment rarely has time to explore.

## What They Are

Each card represents a different area of your life that influences your biomarkers. The dashboard shows a summary of every card at a glance, along with a count of how many you have filled in (e.g., **5/9 filled**).

The nine cards, in order:

1. **Health Goals** — what you are working toward
2. **Medical History** — your diagnoses, ongoing conditions, and family history (first-degree relatives + grandparents)
3. **Diet** — eating patterns, meal timing, and restrictions
4. **Exercise** — frequency, types, intensity, and daily movement
5. **Sleep & Rest** — duration, quality, sleep environment, and practices
6. **Light & Circadian** — morning light, UV exposure, evening screen habits, and grounding
7. **Stress** — stress level, sources, and management strategies
8. **Love Life & Relationships** — relationship quality and sexual health
9. **Environment** — water quality, EMF exposure, air quality, and toxin sources

## AI Health Dots and Tips

Each card displays a small colored dot in its corner:

- **Green** — this area looks supportive of your health
- **Yellow** — there may be something worth paying attention to here
- **Red** — this area may be contributing to out-of-range results
- **Gray** — not enough information to assess

Below the dot, you will see a brief AI-generated tip (up to 12 words) tailored to your data. These dots and tips are cached and only refreshed when your data or card content changes.

::: tip
Fill in as many cards as you can. The AI uses all of this context when interpreting your lab results in chat and in the Focus Card.
:::

## Opening a Card Editor

Click any card to open its editor modal. Each editor uses pill-button selectors and tag pills for multi-select options — no dropdowns to dig through. Changes save when you click **Save**.

## Medical History — Family History Subsection

The Medical History card has two sub-sections that work together:

- **Your conditions** — diagnoses you live with. Each entry has a name, optional severity (major / mild / minor), and optional "since" year.
- **Family history** — what runs in the family. Each entry has a relative (mother, father, sibling, child, or any of the four grandparents), a condition, an optional age of onset, and an optional note (e.g. "survived, on statin since"). The relative list intentionally stops at grandparents — signal-to-noise drops fast beyond first-degree-plus-grandparents.

The AI weights the two differently: your conditions explain why your current biomarkers may be expected to deviate from population reference ranges; family history reframes risk interpretation (e.g. a father's heart attack at 52 makes a borderline LDL more actionable). Both feed the same `[section:diagnoses]` block in AI context.

The condition picker is shared by both subsections — type any name and accept an autocomplete suggestion, or type a free-text one if your condition isn't in the list. Common diagnoses across metabolic, cardiovascular, neuro, autoimmune, cancer, and mental-health categories are covered.

## Circadian & Mitochondrial Health Options

Several cards include options inspired by circadian biology and mitochondrial health frameworks:

**Sleep & Rest** includes:
- Room temperature setting
- Sleep environment options: blackout curtains, low-EMF setup, grounding sheet, Magnetico sleep pad
- Sleep practices: mouth taping, cold shower before bed, magnesium

**Light & Circadian** includes:
- Morning sunlight exposure (AM light)
- UV exposure habits
- Evening discipline (no artificial light, blue-light glasses, etc.)
- Cold exposure and grounding/earthing
- Screen time and technology environment
- Meal timing relative to light cycles

Your location (set in Settings) is used to auto-detect your latitude band, which appears in the Light & Circadian card context sent to the AI.

**Environment** includes:
- Water quality: spring water, deuterium-depleted water (DDW), reverse osmosis
- EMF sources and mitigation strategies
- Home lighting type
- Air quality and toxin exposure
- Building materials

### EMF Assessment

The Environment card includes a dedicated **Baubiologie EMF Assessment** sub-module for tracking electromagnetic field measurements room by room. Open the Environment card editor and click **Open EMF Assessment** to access it.

Features:
- **Room-by-room measurements** — bedroom, office, living room, or custom rooms. Each room can be marked as a sleeping or daytime area, which changes the severity thresholds
- **SBM-2015 severity grading** — measurements are rated against Building Biology (Baubiologie) standards across 5 types: AC electric fields (V/m), AC magnetic fields (nT), RF/microwave radiation (µW/m²), dirty electricity (GS), and DC magnetic deviation (µT). Severity ranges from No Concern (green) to Extreme Concern (red), with separate thresholds for sleeping and daytime areas
- **Meter presets** — autocomplete suggestions for common EMF meters (e.g., Gigahertz NFA1000, Safe and Sound Pro II)
- **Sources and mitigations** — tag common EMF sources (WiFi router, smart meter, cell tower) and mitigation steps (demand switch, shielding paint, WiFi off at night) per room
- **Room photos** — attach up to 6 photos per room to document meter readings or setup
- **PDF import** — import professional consultant reports via AI-powered PDF extraction
- **AI interpretation** — generate a streaming AI analysis of a single assessment, or compare two assessments (before vs after remediation) with color-coded delta arrows
- **Printable template** — download a blank assessment form for on-site use

EMF data is included in the AI chat context and JSON export/import.

**Diet & Digestion** includes:
- Eating patterns, meal timing, and dietary restrictions
- 10 digestion fields: bowel frequency, stool consistency, bloating, gas, acid reflux, burping, nausea, appetite, abdominal pain, and food sensitivities

## Additional Notes

Below the card grid is a free-form **Additional Notes** textarea. Use this to add anything that does not fit neatly into a structured card — recent travel, a new medication, unusual stress, anything relevant. This text is auto-saved and included in every AI conversation.

## How Context Reaches the AI

When you chat with the AI or view the Focus Card, all nine cards plus the Additional Notes textarea are included in the context sent to the AI. The AI uses this to give you interpretations that go beyond the numbers — it can flag when your sleep schedule, diet, or environment might explain a result, or suggest that a pattern in your labs aligns with something you mentioned in a card.

## Change History

getbased automatically timestamps every change you make to a context card. When you switch from Mediterranean to carnivore diet, or change your stress level from high to moderate, the previous value and the date of the change are recorded.

This timeline is included in the AI context so the AI can reason about temporal correlations — for example, connecting a dietary change on March 1 to a shift in your LDL two weeks later. You do not need to do anything to enable this; it works automatically whenever you save a card.

Change history is included in [JSON export and import](/guide/json-export-import).

::: warning
Context cards never leave your device except as part of AI API calls (to your chosen provider). See [AI Providers](/guide/ai-providers) and [Encryption](/guide/encryption) for details on how your data is handled.
:::
