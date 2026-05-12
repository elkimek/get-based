# Manual Entry

If you have lab results but no PDF — for example, values written on paper, a result emailed as plain text, or numbers from a health device — you can enter them directly into getbased using the manual entry form.

## No AI Provider Needed

Manual entry does not use AI. You don't need an API key or any provider configured to use it.

## How to Use Manual Entry

1. In the sidebar, click **Manual Entry** (or find it in the navigation menu on mobile)
2. Select the **date** of the lab draw
3. Browse or search for markers by name or category
4. Enter the value for each marker you have results for
5. Click **Save**

The results are saved immediately and appear in your charts alongside any PDF-imported data.

::: tip You don't need to fill in everything
Only enter the markers you have results for. Leave the rest blank. getbased uses `null` for missing values and draws chart lines across gaps automatically.
:::

## Finding Markers

The marker list is organized by the same 17 categories used throughout the app (biochemistry, hormones, lipids, body composition, bone density, etc.). You can scroll through a category or use the search box to find a marker by name.

If a marker you're looking for doesn't appear in the list, you can create it. Click the **+** button next to "Categories" in the sidebar to [create a custom marker](./custom-markers.md#creating-custom-markers-manually) — define the name, unit, category, and reference range, then add values to it.

## Adding a Value from the Marker Detail Modal

Open any marker (from sidebar, dashboard, Table view, or Heatmap), and you'll see a **+ Add Value Manually** button right under the values grid. It opens an inline form with three fields:

- **Date** — defaults to today on first use, then remembers the date from your last save for the rest of the browser session (so you don't re-pick it for every marker on a paper lab report)
- **Value** — placeholder shows the midpoint of the marker's reference range as a hint
- **Note (optional)** — context for this specific reading (e.g. "fasted 14h", "retook because cuff felt loose", "different lab")

**Keyboard:** press **Enter** to save, **Esc** to cancel.

### Save & Add Another

Below Save you'll see **Save & Add Another**. It saves the current value, keeps the date pre-filled, and resets the value field — handy for entering a whole paper lab report top-to-bottom without re-picking the date for each marker.

### Range sanity check

If you enter a value far outside the marker's reference range (more than 10× the upper bound, or less than 1/10 of the lower bound), getbased will ask you to confirm before saving. This catches the classic decimal/unit slip — e.g. typing **100** for glucose in mg/dL when the app is in SI mode and expects ~5 mmol/L.

### Duplicate-date confirm

If a value for this marker already exists on the date you chose, getbased shows the existing value and asks before overwriting. Both the existing value and the unit are shown in your current display units.

## Adding a Value from Table View

In the [Compare Dates Table view](./compare-dates.md), clicking an **empty cell** opens the manual-entry form with that column's date pre-filled. You don't have to re-pick the date for every marker on the same lab report.

## Editing Existing Values

Click any value in the **detail modal** to edit it inline. Changed values show an **"edited ×"** badge — click the × to revert to the original imported value. Manually added values (no original to revert to) show a **"manual"** badge. You can also delete any value using the delete button.

If you enter the same number that's already there, getbased treats it as a no-op — your value won't be re-stamped as "manual" just because you focused the field and tabbed away.

## Per-Value Notes

Each value card in the detail modal has a small **"+ note"** affordance on hover. Click it to attach a note tied to that specific reading: fasting status, time of day, which arm/cuff for BP, retake context, anything that qualifies the number. Notes show as an italic line beneath the value; a small **×** lets you remove one.

These per-value notes feed the AI when you ask about your labs — the model sees notes grouped by marker (e.g. *"Glucose on 2024-03-14: post-workout, blood draw 30 min after gym"*), which often changes how a reading should be interpreted.

::: tip Units
Enter values in whatever unit system you're currently using (US or SI). getbased automatically converts to its internal format when saving.
:::

## Use Cases

- Results from a doctor's visit where only a printout was provided
- Home test kits (cholesterol monitors, blood glucose meters, etc.)
- Entering a single marker you noticed was missing after a PDF import
- Historical values you've tracked in a spreadsheet
- Recording context that explains a specific reading (e.g. why one Glucose value was high)
