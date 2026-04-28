# Custom Markers

getbased has a built-in schema of 300+ biomarkers across 17 categories. When you import a PDF that contains a result the app doesn't recognize — a specialty marker, a newer test, or one with an unusual name — it's automatically created as a **custom marker** rather than being discarded.

## Creating Custom Markers Manually

You can create a new biomarker without importing a PDF:

1. In the sidebar, click the **+** button next to "Categories"
2. Choose an existing **category** or create a new one
3. Enter the **marker name**, **unit**, and optionally a **reference range** and **optimal range**
4. Click **Create** — the app immediately opens the Add Value form so you can enter your first data point

This is useful when you have results from a lab the AI doesn't fully support, or you want to track something not in the standard schema (e.g., deuterium levels, specialist tests, home monitoring devices).

Custom markers you create manually are included in the AI's marker reference list, so if you later import a PDF containing that marker, the AI will map it automatically.

## How Custom Markers Are Created During Import

During PDF import, the AI identifies any results that don't match a known marker. For each unrecognized result, the AI suggests:

- A **category** to place it in (e.g., biochemistry, hormones)
- A **name** for the marker (in plain English)
- The **unit** it's measured in
- A **reference range** (minimum and maximum) based on the lab report or medical knowledge

These suggestions appear in the import preview with a **blue "New"** badge. You can review them before confirming.

## Where Custom Markers Appear

Once created, custom markers are treated the same as built-in markers throughout the app:

- They appear in **charts** with reference range bands and trend detection
- They show up in **data tables** alongside every other marker
- They're included in **AI chat context**, so the assistant knows about them when you ask questions
- They're exported in your **JSON backup** and restored on import
- They're included when you import future PDFs — the AI uses them to avoid creating duplicates

## Category Assignment

If a custom marker belongs to a category that doesn't exist yet in the built-in schema, a new category is created automatically with an auto-inferred icon (or a bookmark icon as fallback). It appears in the sidebar alongside the standard categories.

### Renaming Categories

Click the category name in the category view header to rename it. The new label is saved as a display override — the underlying key is unchanged, so existing data and exports are unaffected.

### Changing Category Icons

Click the icon next to any category name to open the **emoji picker**. The picker has categorized emoji tabs (Science, Health, Nature, Food, Objects), a search field, and a **Reset** button to revert to the default icon. You can also pick an icon when creating a new category via the "+" sidebar button.

## Specialty Lab Pipeline

For non-blood tests (OAT, DUTCH, HTMA, etc.), custom markers are created with a **group** field that determines their sidebar placement. The AI assigns test-type-prefixed categories (e.g., `oatNutritional`, `dutchHormones`) and groups them under collapsible sidebar headers.

This means an OAT import creates categories like "Nutritional Markers" and "Microbial Overgrowth" — all organized under an **OAT** header in the sidebar. See [Specialty Labs](./specialty-labs.md) for the full details.

## Editing Custom Markers

Custom marker definitions (name, unit, reference range) are set when first created and won't be overwritten by future imports of the same marker. Reference and optimal ranges can be edited by clicking the range values in the marker's detail modal. If a custom marker has no ranges set, a clickable "Reference: – – –" placeholder appears — click it to add ranges.

You can create open-ended ranges by clearing one side using the × button next to the input field. For example, setting only a lower bound of 59 creates a ">59" range.

## Deleting Custom Markers

To delete a custom marker and all its values, open the marker's detail modal and click **Delete this marker** at the bottom. If it's the last marker in its category, the entire category is removed. This cannot be undone.

::: tip Niche and specialty markers
Custom markers work well for less common tests like omega-3 index, micronutrients, organic acids, or functional medicine panels that aren't in the standard schema. Import the PDF and the AI handles the mapping automatically.
:::

::: tip Duplicate prevention
The AI is aware of all existing custom markers when processing new PDFs. It won't create a second definition for a marker that already exists, even if the name appears slightly differently across different lab reports.
:::
