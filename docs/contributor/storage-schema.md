# Storage Schema

getbased stores all data in the browser. There is no backend database. Two storage mechanisms are used: `localStorage` for all app data and preferences, and IndexedDB for auto-backup snapshots.

## localStorage key reference

Keys are namespaced by profile ID where data is per-profile. `{profileId}` defaults to `"default"` for the first profile.

### Global keys (not profile-specific)

| Key | Type | Purpose |
|---|---|---|
| `labcharts-profiles` | JSON array | Profile index: `[{ id, name, createdAt }]` |
| `labcharts-ai-provider` | string | Active AI provider: `'openrouter'` \| `'routstr'` \| `'ppq'` \| `'venice'` \| `'ollama'` |
| `labcharts-openrouter-key` | string | OpenRouter API key |
| `labcharts-routstr-key` | string | Routstr node session key |
| `labcharts-routstr-node` | string | Selected Routstr node URL (from Nostr discovery) |
| `labcharts-cashu-wallet-mint` | string | Cashu wallet mint URL (mirror of IDB meta for sync) |
| `labcharts-cashu-wallet-mnemonic` | string | BIP-39 wallet seed phrase (encrypted via `encryptedSetItem`) |
| `labcharts-ppq-key` | string | PPQ API key |
| `labcharts-venice-key` | string | Venice AI API key |
| `labcharts-ollama` | JSON | Local AI config: `{ url, model, mode, apiKey }`. Key kept as `ollama` for backwards compat |
| `labcharts-ollama-pii-model` | string | Local AI model used for PII obfuscation (can differ from main chat model) |
| `labcharts-openrouter-model` | string | Selected OpenRouter model ID (e.g., `anthropic/claude-sonnet-4-6`) |
| `labcharts-routstr-model` | string | Selected Routstr model ID |
| `labcharts-ppq-model` | string | Selected PPQ model ID |
| `labcharts-venice-model` | string | Selected Venice model ID |
| `labcharts-openrouter-models` | JSON | Cached model list from OpenRouter |
| `labcharts-openrouter-pricing` | JSON | Cached per-token pricing from OpenRouter |
| `labcharts-routstr-models` | JSON | Cached model list from Routstr |
| `labcharts-ppq-models` | JSON | Cached model list from PPQ |
| `labcharts-venice-models` | JSON | Cached model list from Venice |
| `labcharts-marker-desc` | JSON | Cached custom marker descriptions from AI |
| `labcharts-time-format` | string | `'24h'` \| `'12h'` — time display preference |
| `labcharts-debug` | string | Debug mode flag — enables console output and diff viewer |
| `labcharts-pii-choice` | sessionStorage | One-time PII warning flag (sessionStorage, not localStorage) |

### Per-profile keys

| Key | Type | Purpose |
|---|---|---|
| `labcharts-{profileId}-imported` | JSON (may be encrypted) | Main data store — see importedData structure below |
| `labcharts-{profileId}-units` | string | `'EU'` \| `'US'` unit preference |
| `labcharts-{profileId}-rangeMode` | string | `'optimal'` \| `'reference'` chart range mode |
| `labcharts-{profileId}-noteOverlay` | string | `'off'` \| `'on'` — note dots on charts |
| `labcharts-{profileId}-suppOverlay` | string | `'off'` \| `'on'` — supplement bars on charts |
| `labcharts-{profileId}-phaseOverlay` | string | `'off'` \| `'on'` — cycle phase bands on charts |
| `labcharts-{profileId}-chatPersonality` | string | `'default'` \| `'house'` \| `'custom'` |
| `labcharts-{profileId}-chatPersonalityCustom` | JSON | Custom personality: `{ name, icon, promptText, evidenceBased }` |
| `labcharts-{profileId}-chatRailOpen` | string | `'true'` \| `'false'` — chat thread rail visibility |
| `labcharts-{profileId}-chat` | JSON (encrypted) | Legacy chat history (migrated to threads on first load) |
| `labcharts-{profileId}-chat-threads` | JSON | Thread index: `[{ id, name, createdAt, personalityName, personalityIcon }]` |
| `labcharts-{profileId}-chat-t_{id}` | JSON (encrypted) | Per-thread messages: `[{ role, content, timestamp }]` |
| `labcharts-{profileId}-contextHealth` | JSON | Cached AI health dots: `{ dots, summaries, fingerprints }` |
| `labcharts-{profileId}-focusCard` | JSON | Cached AI focus card: `{ fingerprint, text }` |
| `labcharts-{profileId}-tour` | string | `'completed'` — app tour completion flag |
| `labcharts-{profileId}-cycleTour` | string | `'completed'` — cycle tour completion flag |
| `labcharts-{profileId}-onboarded` | string | `'profile-set'` \| `'dismissed'` — onboarding state |
| `labcharts-{profileId}-sex` | string | `'male'` \| `'female'` — profile sex |
| `labcharts-{profileId}-dob` | string | `'YYYY-MM-DD'` — date of birth |
| `labcharts-{profileId}-country` | string | ISO country code |
| `labcharts-{profileId}-zip` | string | ZIP/postal code |
| `labcharts-encryption-enabled` | string | `'true'` — encryption at rest enabled |
| `labcharts-{profileId}-enc-salt` | string | Base64 PBKDF2 salt for this profile's encryption |

## importedData structure

Stored as JSON at `labcharts-{profileId}-imported`. This is everything a user can export/import.

```js
{
  // Lab results — array of dated snapshots
  entries: [
    {
      date: "2025-03-15",            // ISO date string
      markers: {
        "biochemistry.glucose": 5.2, // category.markerKey → numeric value
        "hormones.testosterone": 18.4,
        // ... all measured markers for this date
      }
    }
    // ... more entries
  ],

  // Standalone notes (independent of lab dates)
  notes: [
    { date: "2025-03-10", text: "Started vitamin D protocol" }
  ],

  // Supplement timeline
  supplements: [
    {
      name: "Vitamin D3",
      dose: "5000 IU",
      startDate: "2025-01-01",
      endDate: null,     // null = ongoing
      color: "#f59e0b",
      notes: ""
    }
  ],

  // Context cards — all nullable (null = not filled by user)
  diagnoses: {                          // Medical Conditions card
    conditions: [
      { name: "Hashimoto's", severity: "major", since: "2020" }
    ],
    note: ""
  },

  diet: {                               // Diet card
    type: "omnivore",
    restrictions: ["gluten-free", "seed-oil-free"],
    pattern: "intermittent_fasting",
    breakfast: "eggs and avocado",
    breakfastTime: "09:00",             // 24h format
    lunch: "salad with protein",
    lunchTime: "13:00",
    dinner: "meat and vegetables",
    dinnerTime: "18:00",
    snacks: "",
    snacksTime: "",
    note: ""
  },

  exercise: {                           // Exercise card
    frequency: "4-5x_week",
    types: ["strength", "walking"],
    intensity: "moderate",
    dailyMovement: "active",
    note: ""
  },

  sleepRest: {                          // Sleep & Rest card
    duration: "7-8h",
    quality: "good",
    schedule: "consistent",
    roomTemp: "cool",                   // circadian-informed
    issues: ["occasional_waking"],
    environment: ["blackout_curtains", "emf_off"],
    practices: ["mouth_taping", "magnesium"],
    note: ""
  },

  lightCircadian: {                     // Light & Circadian card
    amLight: "sunrise_sunlight",        // circadian-informed
    daytime: "outdoor_work",
    uvExposure: "daily",
    evening: ["blue_light_glasses", "dim_lights"],
    screenTime: "low",
    techEnv: ["wifi_off_night"],
    cold: "cold_shower",
    grounding: "daily_earthing",
    mealTiming: ["time_restricted"],
    note: ""
  },

  stress: {                             // Stress card
    level: "moderate",
    sources: ["work", "finances"],
    management: ["meditation", "exercise"],
    note: ""
  },

  loveLife: {                           // Love Life & Relationships card
    status: "partnered",
    relationship: "good",
    satisfaction: "satisfied",
    libido: "normal",
    frequency: "weekly",
    orgasm: "yes",
    concerns: [],
    note: ""
  },

  environment: {                        // Environment card
    setting: "suburban",
    climate: "temperate",
    water: "reverse_osmosis",          // circadian-informed
    waterConcerns: [],
    emf: ["wifi", "smart_meter"],
    emfMitigation: ["router_timer"],
    homeLight: "led_warm",
    air: ["hepa_filter"],
    toxins: [],
    building: "modern",
    note: ""
  },

  // Full-width card — freetext string
  interpretiveLens: "Longevity medicine, quantum biology, functional endocrinology",

  // Health goals — priority-ordered array
  healthGoals: [
    { text: "Optimize testosterone naturally", severity: "major" },
    { text: "Improve sleep quality",           severity: "mild"  },
    { text: "Reduce inflammation markers",     severity: "minor" }
  ],

  // Free-form AI context notes — freetext string
  contextNotes: "Currently experimenting with carnivore diet.",

  // Menstrual cycle — null for male profiles
  menstrualCycle: {
    cycleLength: 28,           // days (auto-calculated if enough periods)
    periodLength: 5,           // days
    regularity: "regular",     // 'regular' | 'irregular' | 'very_irregular'
    flow: "moderate",
    contraceptive: "none",
    conditions: "none",
    periods: [
      {
        startDate: "2025-02-01",
        endDate:   "2025-02-06",
        flow: "moderate",
        symptoms: ["cramps", "fatigue"],
        notes: ""
      }
    ]
  },

  // Per-marker reference range overrides
  refOverrides: {
    "biochemistry.glucose": {
      refMin: 3.9,
      refMax: 5.6,
      optimalMin: 4.0,
      optimalMax: 5.0,
      labRefMin: 3.9,   // stashed lab-stated range from PDF import (for two-step revert)
      labRefMax: 5.6,    // preserved when user manually edits — revert goes lab → schema default
      refSource: "import" // "import" | "manual" — tracks who set the current refMin/refMax
    }
    // ... user-customized ranges from detail modal editing or import-time range adoption
  },

  // Display overrides for category labels (from rename)
  categoryLabels: {
    "mylab": "My Laboratory"  // categoryKey → display name
  },

  // Display overrides for category icons (from emoji picker)
  categoryIcons: {
    "mylab": "🧪"             // categoryKey → emoji
  },

  // Custom markers from PDF import — keyed by "category.markerKey"
  customMarkers: {
    "mylab.cortisol": {
      name: "Cortisol (AM)",
      unit: "nmol/L",
      refMin: 170,
      refMax: 720,
      categoryLabel: "My Lab"
    }
  },

  // Timestamped snapshots of context field changes — appended by recordChange()
  changeHistory: [
    { field: "diet", date: "2026-03-01", snapshot: { type: "carnivore", ... } },
    { field: "stress", date: "2026-02-15", snapshot: { level: "moderate", ... } }
  ]
}
```

### `genetics` — DNA raw data (null if not imported)

```js
genetics: {
  source: "AncestryDNA",       // provider name
  importDate: "2026-03-14",    // ISO date
  coverage: { found: 35, total: 41 },  // matched vs total curated SNPs
  apoe: "ε3/ε4",              // resolved haplotype (null if incomplete)
  snps: {
    "rs1801133": { genotype: "GA", gene: "MTHFR", variant: "C677T" },
    "rs1800562": { genotype: "GG", gene: "HFE", variant: "C282Y" },
    // ... only matched SNPs stored, not the full 600k+ raw file
  }
}
```

Re-import replaces entirely (no merge). Raw file is never stored — only matched SNPs.

## IndexedDB — auto-backup

Database: `labcharts-backups`
Object store: `snapshots`
Key path: `id` (auto-increment)

Each snapshot record:

```js
{
  id: 42,                          // auto-increment
  createdAt: "2025-03-15T14:22:00.000Z",
  profileId: "default",
  data: {
    importedData: { ... },         // full importedData object
    unitSystem: "EU",
    rangeMode: "optimal",
    suppOverlayMode: "off",
    noteOverlay: "off",
    chatPersonality: "default",
    chatPersonalityCustom: null,
    // ... all per-profile preferences
    threadIndex: [...],            // chat thread index
    threads: {                     // per-thread messages (encrypted strings)
      "t_abc123": "...",
    }
  }
}
```

Maximum 5 snapshots are kept per profile. The oldest is pruned automatically on each new backup.

## Encryption

When encryption is enabled (`labcharts-encryption-enabled = 'true'`), sensitive localStorage keys are stored as AES-256-GCM ciphertext (base64-encoded) instead of plaintext JSON.

Encrypted key patterns (`SENSITIVE_PATTERNS` in `crypto.js`):

- `*-imported` — all importedData
- `*-chat` — legacy chat history
- `*-chat-t_*` — per-thread messages

Keys that are not sensitive (preferences, model selections, pricing caches, profile index) are always stored in plaintext.

The encryption key is derived via PBKDF2 from a user passphrase + per-profile salt (`labcharts-{profileId}-enc-salt`).
