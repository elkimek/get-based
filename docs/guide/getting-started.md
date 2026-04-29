# Getting Started

getbased is a personal health intelligence platform organized around five lenses on your biology — Labs, Genome, Body, Light, Insight. Every lens informs every other: your DNA shapes how labs are interpreted, your wearable physiology shapes which biomarkers matter most, and the AI synthesizes across all of them with full context. The app starts empty — your data is loaded by you, stored locally in your browser, and never uploaded anywhere by default.

## Open the App

The easiest way to get started is the hosted version at **[getbased.health](https://getbased.health)**. No installation required.

### Tor

getbased is available as a Tor hidden service. Open the app in [Tor Browser](https://www.torproject.org/download/) and click the ".onion available" badge in the address bar, or go directly to the [.onion address](./tor-access.md). Sync, AI chat, and all features work over Tor.

### Self-host

If you prefer to run it yourself, clone the repository and start a local server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser. A local server is required because the app loads ES module scripts — opening `index.html` directly as a file will not work.

## Install as a PWA

getbased is installable as a Progressive Web App on desktop and mobile. Look for the install prompt in your browser's address bar, or use your browser menu:

- **Chrome / Edge**: address bar → install icon, or menu → "Install getbased"
- **Safari (iOS)**: Share → Add to Home Screen
- **Firefox**: menu → Install

Once installed, the full app shell works offline. AI features (PDF import, chat) still need a network connection to reach your AI provider.

## Chat Onboarding

When you open the app for the first time, the chat panel guides you through setup in a conversational flow:

1. **Profile** — name, sex, date of birth, height, weight, location
2. **AI provider** — connect OpenRouter (one-click OAuth), Routstr (Bitcoin), PPQ, Venice, or Local AI. You can skip this step and set it up later
3. **Extras** — menstrual cycle setup (female profiles), supplements & medications, lifestyle context cards

Each step is optional and skippable. The onboarding adapts based on your profile — female users get cycle tracking options (regular periods, perimenopause, postmenopause, pregnant, breastfeeding).

## Guided Tour

After you import your first lab data, a 7-step spotlight tour walks you through the key areas of the interface — the import button, category navigation, lifestyle context cards, settings, and the AI chat panel. Use the **Next** button to advance, or press **Escape** to dismiss.

You can replay the tour at any time from **Settings → Display → Take a Tour**.

## First Steps

### 1. Configure an AI Provider

PDF import, the AI chat panel, and several dashboard features require an AI provider. You can set this up during chat onboarding, or open **Settings** (gear icon in the header) and go to the **AI Provider** tab.

See the [AI Providers](./ai-providers.md) page for a full comparison and setup instructions for each option.

::: tip No provider needed for most features
Charts, manual entry, JSON import/export, data tables, trend alerts, and correlations all work without any AI provider configured.
:::

### 2. Set Your Profile

Set your profile during chat onboarding, or edit via the **Client List** (click your profile name in the header). Your biological sex and date of birth affect:

- Reference ranges for sex-specific markers (hormones, hematology)
- PhenoAge (biological age) calculation, which requires your DOB
- Menstrual cycle tracking (available for female profiles)

You can also track **biometrics** — height, weight, blood pressure, and resting pulse. Open the **Edit Client** form and expand the **Biometrics** section. Height is stored on your profile; weight, BP, and pulse are time-series (add entries with dates). BMI is auto-calculated from height and latest weight. Click the unit label (cm/in, kg/lbs) to switch units.

### 3. Import Your First Lab Report

Click the **import button** (document icon, bottom-right) or drag and drop any lab PDF onto the page. The AI reads the report, maps results to known biomarkers, and shows you a preview before saving anything.

If you don't have a PDF handy, try one of the **demo profiles** first. On the welcome screen, click **Sarah** (iron & hormones story) or **Alex** (metabolic health journey) to load a fully populated profile with 4 blood draws, fatty acid panels, supplements, context cards, EMF assessments, and notes. You can also load demo profiles later from the **Client List** (click your profile in the header) using the **+ Demo Sarah** or **+ Demo Alex** buttons.

Alternatively, use **Manual Entry** to type in values directly.

::: warning AI provider required for PDF import
You must have an AI provider configured before dropping a PDF. If the drop zone shows a prompt to set up a provider, visit Settings first.
:::

Once data is imported, charts and analysis appear automatically across all 17 biomarker categories.
