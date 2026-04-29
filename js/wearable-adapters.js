// wearable-adapters.js — Canonical wearable-metric registry + vendor adapters
//
// Contract: the rest of the app reads **canonical** metric ids (hrv_rmssd,
// rhr, sleep_score, readiness_score, …). Adapters describe how each vendor's
// cloud API or file export maps onto those canonical ids. L1 IndexedDB rows
// are stamped with `source`, L2 `wearableSummary` indexes `sources` by id,
// AI context reads canonical — no vendor name reaches the renderer, the
// AI prompt, or the sync schema.
//
// Add a wearable by appending to ADAPTERS. If it surfaces a new canonical
// metric nobody else exposes, add it to CANONICAL_METRICS — the strip will
// pick it up automatically.
//
// Shape — adapter:
//   id              stable lowercase slug; persisted in L1 rows, L2 sources
//   displayName     human label ("Oura", "WHOOP", "Apple Health")
//   authType        'pat' | 'oauth' | 'file-import'
//   authDocsUrl     optional — where the user creates the credential
//   apiHost         optional — for 'pat'/'oauth' adapters; routed via /api/proxy allowlist
//   metrics         { canonicalId: { endpoint, field, transform? } }
//   accountInfo     optional — endpoint + field to verify credential + show identity
//
// Shape — canonical metric:
//   id              slug used across L1/L2/AI
//   label           top-row label on card ("HRV")
//   sub             optional sub-label ("RMSSD", "score")
//   unit            'ms' | 'bpm' | '%' | '°C' | 'mg/dL' | ''
//   worseWhen       'up' | 'down' | 'either'  — semantic colour for delta badges

export const CANONICAL_METRICS = {
  // Sleep-window: rMSSD computed during the main sleep period (gold-standard
  // recovery signal — what Oura/WHOOP/Fitbit "daily HRV" actually is). The
  // 🌙 sub-glyph signals the window without adding a noisy English word.
  hrv_rmssd:        { id: 'hrv_rmssd',        label: 'HRV',         sub: '🌙',        unit: 'ms', worseWhen: 'down'   },
  hrv_sdnn:         { id: 'hrv_sdnn',         label: 'HRV',         sub: 'SDNN',      unit: 'ms', worseWhen: 'down'   }, // Apple Health (deep HRV)
  // Waking-window: HRV measured during the day. Tracks acute stress / load
  // reactivity, distinct from overnight recovery. Most vendors expose this
  // separately (Oura daily_stress, WHOOP recovery, Apple awake-window samples).
  hrv_day:          { id: 'hrv_day',          label: 'HRV',         sub: '☀️',        unit: 'ms', worseWhen: 'down'   },
  // "Resting HR" already implies overnight to most users — no sub-label noise.
  rhr:              { id: 'rhr',              label: 'Resting HR',  sub: '',          unit: 'bpm', worseWhen: 'up'     },
  // Daytime average HR (NOT resting). Captures activity / stress load. Polar
  // and Withings naturally expose this; Oura/WHOOP/Fitbit derive it from
  // intraday or activity streams.
  hr_day:           { id: 'hr_day',           label: 'Heart rate',  sub: '☀️',        unit: 'bpm', worseWhen: 'either' },
  sleep_score:      { id: 'sleep_score',      label: 'Sleep',       sub: 'score', unit: '',      worseWhen: 'down'   },
  readiness_score:  { id: 'readiness_score',  label: 'Readiness',   sub: 'score', unit: '',      worseWhen: 'down'   },
  activity_score:   { id: 'activity_score',   label: 'Activity',    sub: 'score', unit: '',      worseWhen: 'down'   },
  steps:            { id: 'steps',             label: 'Steps',       sub: '',      unit: '',      worseWhen: 'down'   },
  strain:           { id: 'strain',           label: 'Strain',      sub: 'day',   unit: '',      worseWhen: 'either' }, // WHOOP 0-21 Borg scale
  stress_high_min:  { id: 'stress_high_min',  label: 'Stress',      sub: 'high',  unit: 'min',   worseWhen: 'up'     },
  resilience_level: { id: 'resilience_level', label: 'Resilience',  sub: 'level', unit: '/5',    worseWhen: 'down'   },
  cardio_age:       { id: 'cardio_age',       label: 'Cardio age',  sub: '',      unit: 'yrs',   worseWhen: 'up'     },
  // Biometric-rooted canonicals (Withings scale/BP cuff, etc.) — these overlap
  // with manual biometrics entries; Phase 3 will decide on a merge policy.
  weight:           { id: 'weight',           label: 'Weight',      sub: '',      unit: 'kg',    worseWhen: 'either' },
  bp_systolic:      { id: 'bp_systolic',      label: 'BP',          sub: 'syst',  unit: 'mmHg',  worseWhen: 'up',    ariaLabel: 'Blood pressure systolic' },
  bp_diastolic:     { id: 'bp_diastolic',     label: 'BP',          sub: 'dia',   unit: 'mmHg',  worseWhen: 'up',    ariaLabel: 'Blood pressure diastolic' },
  // Canonical extras — adapters opt in by mapping to them
  spo2_avg:         { id: 'spo2_avg',         label: 'SpO₂',        sub: '',      unit: '%',     worseWhen: 'down'   },
  body_temp_delta:  { id: 'body_temp_delta',  label: 'Body temp',   sub: 'Δ',     unit: '°C',    worseWhen: 'either' },
  glucose_avg:      { id: 'glucose_avg',      label: 'Glucose',     sub: 'avg',   unit: 'mg/dL', worseWhen: 'either' },
  // Withings Body Scan / BPM extras (#5 follow-up). All of these are the raw
  // measurements; AI context collapses the body-comp cluster into a single
  // roll-up line to keep the token budget honest. Only populates for users
  // with a device that produces the underlying measType, so the strip
  // auto-hides them for everyone else.
  pwv:                { id: 'pwv',                label: 'PWV',          sub: '',      unit: 'm/s',   worseWhen: 'up'     }, // pulse wave velocity — vascular stiffness
  vascular_age:       { id: 'vascular_age',       label: 'Vascular age', sub: '',      unit: 'yrs',   worseWhen: 'up'     }, // Withings' PWV-derived age estimate (distinct from Oura's cardio_age which uses HRV/rhr)
  cardio_fitness:     { id: 'cardio_fitness',     label: 'Cardio fit',   sub: 'score', unit: '',      worseWhen: 'down'   }, // Withings VO2 estimate (0-100ish)
  body_fat_pct:       { id: 'body_fat_pct',       label: 'Body fat',     sub: '',      unit: '%',     worseWhen: 'up'     },
  fat_mass_kg:        { id: 'fat_mass_kg',        label: 'Fat mass',     sub: '',      unit: 'kg',    worseWhen: 'up'     }, // measType 8 — absolute kg of fat tissue
  muscle_mass_kg:     { id: 'muscle_mass_kg',     label: 'Muscle',       sub: '',      unit: 'kg',    worseWhen: 'down'   },
  lean_mass_kg:       { id: 'lean_mass_kg',       label: 'Lean mass',    sub: '',      unit: 'kg',    worseWhen: 'down',  ariaLabel: 'Lean (fat-free) mass' },
  bone_mass_kg:       { id: 'bone_mass_kg',       label: 'Bone',         sub: '',      unit: 'kg',    worseWhen: 'down'   },
  water_mass_kg:      { id: 'water_mass_kg',      label: 'Water',        sub: '',      unit: 'kg',    worseWhen: 'either' }, // hydration — too high or too low both bad
  visceral_fat:       { id: 'visceral_fat',       label: 'Visceral fat', sub: '',      unit: '',      worseWhen: 'up'     }, // Withings 1-30 score
  nerve_health_score: { id: 'nerve_health_score', label: 'Nerve health', sub: 'score', unit: '',      worseWhen: 'down'   },
  body_temp:          { id: 'body_temp',          label: 'Body temp',    sub: '',      unit: '°C',    worseWhen: 'either' }, // measType 71 — absolute reading (Body Scan IR sensor)
  skin_temp:          { id: 'skin_temp',          label: 'Skin temp',    sub: '',      unit: '°C',    worseWhen: 'either' }, // measType 73 — wrist sensor (ScanWatch)
  // Sleep architecture — Withings getsleepsummary returns these as seconds;
  // the fetcher converts to minutes for display sanity.
  sleep_total_min:      { id: 'sleep_total_min',      label: 'Sleep total', sub: '',      unit: 'min', worseWhen: 'down'   },
  sleep_deep_min:       { id: 'sleep_deep_min',       label: 'Deep sleep',  sub: '',      unit: 'min', worseWhen: 'down'   },
  sleep_light_min:      { id: 'sleep_light_min',      label: 'Light sleep', sub: '',      unit: 'min', worseWhen: 'either' }, // too much light = poor architecture; too little also bad
  sleep_rem_min:        { id: 'sleep_rem_min',        label: 'REM sleep',   sub: '',      unit: 'min', worseWhen: 'down'   },
  sleep_awake_min:      { id: 'sleep_awake_min',      label: 'Awake',       sub: 'in bed', unit: 'min', worseWhen: 'up'    },
  sleep_hr_avg:         { id: 'sleep_hr_avg',         label: 'Sleep HR',    sub: 'avg',   unit: 'bpm', worseWhen: 'up'     }, // distinct from rhr (= hr_min) — average overnight
  sleep_breathing_rate: { id: 'sleep_breathing_rate', label: 'Breathing',   sub: 'sleep', unit: 'rpm', worseWhen: 'up'     },
  sleep_snoring_min:    { id: 'sleep_snoring_min',    label: 'Snoring',     sub: '',      unit: 'min', worseWhen: 'up'     },
  sleep_breath_disturb: { id: 'sleep_breath_disturb', label: 'Apnea',       sub: 'level', unit: '',    worseWhen: 'up'     }, // breathing-disturbances intensity 0-100 (Withings' apnea-class signal)
};

// Default display order for the dashboard strip. A canonical metric not listed
// here still renders (appended in registry order) — the list just pins priority.
// Also used as METRICS_FOR_SUMMARY in wearables-summary.js, so any metric that
// should be included in the L2 summary (and thus the dashboard strip) must
// appear here. Biometrics (weight, bp_systolic, bp_diastolic) are included so
// manual entries and Withings-scale/BP-cuff sync flow through the same pipeline.
export const DEFAULT_METRIC_ORDER = [
  'hrv_rmssd', 'rhr', 'sleep_score', 'readiness_score',
  'activity_score', 'steps',
  'weight', 'bp_systolic', 'bp_diastolic',
  'stress_high_min', 'resilience_level', 'cardio_age',
  // Withings full-coverage cluster — strip auto-hides anything the user's
  // device doesn't measure, so a weight-only scale user sees no change. Owners
  // of a Body Scan + ScanWatch + BPM see the cards their hardware produces.
  // Vascular stack first (headline of cardiovascular health), body comp
  // next, then temperature, then sleep architecture. Nerve health last
  // because it's the most niche reading.
  'pwv', 'vascular_age', 'cardio_fitness',
  'body_fat_pct', 'fat_mass_kg', 'muscle_mass_kg', 'lean_mass_kg', 'bone_mass_kg', 'water_mass_kg', 'visceral_fat',
  'body_temp', 'skin_temp',
  'sleep_total_min', 'sleep_deep_min', 'sleep_light_min', 'sleep_rem_min', 'sleep_awake_min',
  'sleep_hr_avg', 'sleep_breathing_rate', 'sleep_snoring_min', 'sleep_breath_disturb',
  'nerve_health_score',
  // Daytime companions are summarised so the AI / detail modal can read them,
  // but intentionally placed AFTER the overnight cards — the strip stays calm.
  'hrv_day', 'hr_day',
];

export const ADAPTERS = [
  {
    id: 'oura',
    displayName: 'Oura',
    authType: 'oauth2',
    // Oura's developer portal doesn't offer PKCE — this is the server-side
    // flow with the client_secret held server-side (Vercel env var, read only
    // by /api/proxy). Browser never sees the secret. See wearables-oura-auth.js.
    oauth: {
      clientId: '8bb386cb-1b6e-4ab8-b852-ff47662667f6',
      // Must match the URIs registered in the Oura developer portal, verbatim.
      redirectUris: [
        'https://app.getbased.health/',
        'https://getbased.health/app',
        'https://beta.getbased.health/',
        'https://beta.getbased.health/app',
        'http://localhost:8000/app',
      ],
      scopes: ['personal', 'daily', 'heartrate', 'session', 'spo2', 'stress', 'heart_health'],
    },
    apiHost: 'api.ouraring.com',
    metrics: {
      hrv_rmssd:        { endpoint: 'v2/usercollection/sleep',                   field: 'average_hrv' },
      rhr:              { endpoint: 'v2/usercollection/sleep',                   field: 'average_heart_rate' },
      hr_day:           { endpoint: 'v2/usercollection/heartrate',               field: 'mean(awake-tagged samples)' },
      sleep_score:      { endpoint: 'v2/usercollection/daily_sleep',             field: 'score' },
      readiness_score:  { endpoint: 'v2/usercollection/daily_readiness',         field: 'score' },
      activity_score:   { endpoint: 'v2/usercollection/daily_activity',          field: 'score' },           // 0 when user has Rest Mode on — see steps as fallback
      steps:            { endpoint: 'v2/usercollection/daily_activity',          field: 'steps' },
      stress_high_min:  { endpoint: 'v2/usercollection/daily_stress',            field: 'stress_high' },     // seconds → minutes in fetcher
      resilience_level: { endpoint: 'v2/usercollection/daily_resilience',        field: 'level' },           // enum → 1-5 in fetcher
      cardio_age:       { endpoint: 'v2/usercollection/daily_cardiovascular_age', field: 'vascular_age' },
      spo2_avg:         { endpoint: 'v2/usercollection/daily_spo2',              field: 'spo2_percentage' },
      body_temp_delta:  { endpoint: 'v2/usercollection/daily_readiness',         field: 'temperature_deviation' },
    },
    accountInfo: { endpoint: 'v2/usercollection/personal_info', identityField: 'email' },
  },
  // ─── Phase 3 beta adapters ─────────────────────────────────────────
  // Flagged `beta: true` so the settings card carries a BETA badge and the
  // strip shows real data as soon as any beta tester connects. The UX is
  // identical to Oura — the flag only affects display copy.

  {
    id: 'ultrahuman',
    displayName: 'Ultrahuman',
    authType: 'oauth2',
    authDocsUrl: 'https://vision.ultrahuman.com/developer-docs?type=oauth',
    beta: true,
    // Hidden from the Settings → Wearables list at v1.30.0 launch — partner
    // credentials are still pending. Maintainer escape hatch:
    // localStorage.setItem('labcharts-show-beta-wearables', 'true').
    // Already-connected installs stay visible (visibleAdapters keeps them).
    betaHidden: true,
    oauth: {
      // Ultrahuman OAuth2 confidential client (has client_secret). Paste the
      // Client ID from the partner credentials email reply here; the matching
      // secret lives in ULTRAHUMAN_CLIENT_SECRET (Vercel env + local .env.local).
      clientId: 'REPLACE_WITH_ULTRAHUMAN_CLIENT_ID',
      redirectUris: [
        'https://app.getbased.health/',
        'https://getbased.health/app',
        'https://beta.getbased.health/',
        'https://beta.getbased.health/app',
        'http://localhost:8000/app',
      ],
      scopes: ['profile', 'ring_data', 'cgm_data'],
      pkce: false,
    },
    apiHost: 'partner.ultrahuman.com',
    metrics: {
      hrv_rmssd:       { endpoint: 'api/partners/v1/user_data/metrics', field: 'hrv.sleep' },
      rhr:             { endpoint: 'api/partners/v1/user_data/metrics', field: 'resting_heart_rate.sleep' },
      hrv_day:         { endpoint: 'api/partners/v1/user_data/metrics', field: 'hrv.avg' },
      hr_day:          { endpoint: 'api/partners/v1/user_data/metrics', field: 'resting_heart_rate.avg' },
      sleep_score:     { endpoint: 'api/partners/v1/user_data/metrics', field: 'sleep_index' },
      readiness_score: { endpoint: 'api/partners/v1/user_data/metrics', field: 'recovery_index' },
      steps:           { endpoint: 'api/partners/v1/user_data/metrics', field: 'steps' },
      body_temp_delta: { endpoint: 'api/partners/v1/user_data/metrics', field: 'temperature' },
      glucose_avg:     { endpoint: 'api/partners/v1/user_data/metrics', field: 'glucose_avg' }, // cgm_data scope only
    },
    accountInfo: { endpoint: 'api/partners/v1/user_data/user_info', identityField: 'email' },
  },

  {
    id: 'whoop',
    displayName: 'WHOOP',
    authType: 'oauth2',
    authDocsUrl: 'https://developer.whoop.com/docs/developing/oauth',
    beta: true,
    // Hidden from the Settings → Wearables list at v1.30.0 launch — WHOOP
    // dev portal needs a paid consumer membership we haven't validated.
    // Maintainer escape hatch: localStorage labcharts-show-beta-wearables=true.
    betaHidden: true,
    oauth: {
      // PKCE flow — no client secret needed in browser. WHOOP dev portal
      // requires an active paid consumer membership (sign up via the free
      // trial at join.whoop.com first, then request dev access at
      // developer.whoop.com). Until that lands, the REPLACE_WITH_ prefix
      // gates the UI to "waiting on partner credentials" so users don't
      // hit invalid_client at WHOOP's authorize endpoint.
      clientId: 'REPLACE_WITH_WHOOP_CLIENT_ID',
      redirectUris: [
        'https://app.getbased.health/',
        'https://getbased.health/app',
        'https://beta.getbased.health/',
        'https://beta.getbased.health/app',
        'http://localhost:8000/app',
      ],
      scopes: ['read:recovery', 'read:sleep', 'read:workout', 'read:cycles', 'read:profile', 'offline'],
      pkce: true,
    },
    apiHost: 'api.prod.whoop.com',
    metrics: {
      hrv_rmssd:       { endpoint: 'developer/v1/recovery', field: 'score.hrv_rmssd_milli' },
      rhr:             { endpoint: 'developer/v1/recovery', field: 'score.resting_heart_rate' },
      hr_day:          { endpoint: 'developer/v1/cycle',                    field: 'score.average_heart_rate' },
      sleep_score:     { endpoint: 'developer/v1/activity/sleep',           field: 'score.sleep_performance_percentage' },
      readiness_score: { endpoint: 'developer/v1/recovery',                 field: 'score.recovery_score' },
      strain:          { endpoint: 'developer/v1/cycle',                    field: 'score.strain' },
    },
    accountInfo: { endpoint: 'developer/v1/user/profile/basic', identityField: 'email' },
  },

  {
    id: 'fitbit',
    displayName: 'Fitbit',
    authType: 'oauth2',
    authDocsUrl: 'https://dev.fitbit.com/build/reference/web-api/',
    beta: true,
    oauth: {
      // Fitbit Web API Client ID (public value — PKCE flow, no client_secret).
      // Registered at dev.fitbit.com as OAuth 2.0 Application Type = Client
      // (public PKCE). Redirect URIs below must match what's registered there,
      // character-for-character.
      clientId: '23VBN8',
      redirectUris: [
        'https://app.getbased.health/',
        'https://getbased.health/app',
        'https://beta.getbased.health/',
        'https://beta.getbased.health/app',
        'http://localhost:8000/app',
      ],
      scopes: ['profile', 'activity', 'heartrate', 'sleep', 'oxygen_saturation', 'respiratory_rate', 'temperature', 'weight'],
      pkce: true,
    },
    apiHost: 'api.fitbit.com',
    metrics: {
      hrv_rmssd:       { endpoint: '1/user/-/hrv/date/',                         field: 'hrv[0].value.deepRmssd' },
      hrv_day:         { endpoint: '1/user/-/hrv/date/',                         field: 'hrv[0].value.dailyRmssd' },
      rhr:             { endpoint: '1/user/-/activities/heart/date/',            field: 'activities-heart[0].value.restingHeartRate' },
      steps:           { endpoint: '1/user/-/activities/steps/date/',            field: 'activities-steps[0].value' },
      sleep_score:     { endpoint: '1.2/user/-/sleep/date/',                     field: 'sleep[0].efficiency' }, // efficiency as a 0-100 proxy — Fitbit doesn't expose Sleep Score via API
      spo2_avg:        { endpoint: '1/user/-/spo2/date/',                        field: 'value.avg' },
      body_temp_delta: { endpoint: '1/user/-/temp/skin/date/',                   field: 'tempSkin[0].value.nightlyRelative' },
      weight:          { endpoint: '1/user/-/body/log/weight/date/',             field: 'weight[-1].weight' },
    },
    accountInfo: { endpoint: '1/user/-/profile.json', identityField: 'email' },
  },

  {
    id: 'withings',
    displayName: 'Withings',
    authType: 'oauth2',
    authDocsUrl: 'https://developer.withings.com/oauth2/',
    beta: true,
    oauth: {
      // Withings developer portal Client ID. Public value — ships in the
      // bundle. The matching client_secret lives only in WITHINGS_CLIENT_SECRET
      // (Vercel env + local .env.local).
      clientId: 'a91db99c24c9b52cea01993ad2bd67bb1515921b09d0a3c04d40a7dc1d1b748a',
      redirectUris: [
        'https://app.getbased.health/',
        'https://getbased.health/app',
        'https://beta.getbased.health/',
        'https://beta.getbased.health/app',
        'http://localhost:8000/app',
      ],
      scopes: ['user.info', 'user.metrics', 'user.activity', 'user.sleepevents'],
      pkce: false, // Server-side flow like Oura — secret held by /api/proxy
    },
    apiHost: 'wbsapi.withings.net',
    metrics: {
      // /measure endpoint — measType-keyed body / cardio readings.
      weight:               { endpoint: 'measure',  measType: 1   },
      lean_mass_kg:         { endpoint: 'measure',  measType: 5   }, // fat-free mass
      body_fat_pct:         { endpoint: 'measure',  measType: 6   },
      fat_mass_kg:          { endpoint: 'measure',  measType: 8   },
      bp_diastolic:         { endpoint: 'measure',  measType: 9   },
      bp_systolic:          { endpoint: 'measure',  measType: 10  },
      hr_day:               { endpoint: 'measure',  measType: 11  }, // scale pulse — daytime spot reading
      spo2_avg:             { endpoint: 'measure',  measType: 54  }, // ScanWatch overnight measurement
      body_temp:            { endpoint: 'measure',  measType: 71  }, // Body Scan IR sensor (°C absolute)
      skin_temp:            { endpoint: 'measure',  measType: 73  }, // ScanWatch wrist sensor (°C absolute)
      muscle_mass_kg:       { endpoint: 'measure',  measType: 76  },
      water_mass_kg:        { endpoint: 'measure',  measType: 77  }, // hydration
      bone_mass_kg:         { endpoint: 'measure',  measType: 88  },
      pwv:                  { endpoint: 'measure',  measType: 91  }, // pulse wave velocity (m/s)
      vascular_age:         { endpoint: 'measure',  measType: 130 }, // Withings PWV-derived age
      visceral_fat:         { endpoint: 'measure',  measType: 167 },
      nerve_health_score:   { endpoint: 'measure',  measType: 168 },
      cardio_fitness:       { endpoint: 'measure',  measType: 169 }, // VO2 estimate
      // /v2/sleep getsleepsummary — nightly aggregates.
      rhr:                  { endpoint: 'v2/sleep', field: 'hr_min' }, // sleep min HR is the true overnight RHR
      sleep_score:          { endpoint: 'v2/sleep', field: 'sleep_score' },
      sleep_total_min:      { endpoint: 'v2/sleep', field: 'asleepduration', transform: 'sec→min' },
      sleep_deep_min:       { endpoint: 'v2/sleep', field: 'deepsleepduration', transform: 'sec→min' },
      sleep_light_min:      { endpoint: 'v2/sleep', field: 'lightsleepduration', transform: 'sec→min' },
      sleep_rem_min:        { endpoint: 'v2/sleep', field: 'remsleepduration', transform: 'sec→min' },
      sleep_awake_min:      { endpoint: 'v2/sleep', field: 'wakeupduration', transform: 'sec→min' },
      sleep_hr_avg:         { endpoint: 'v2/sleep', field: 'hr_average' },
      sleep_breathing_rate: { endpoint: 'v2/sleep', field: 'rr_average' },
      sleep_snoring_min:    { endpoint: 'v2/sleep', field: 'snoring', transform: 'sec→min' },
      sleep_breath_disturb: { endpoint: 'v2/sleep', field: 'breathing_disturbances_intensity' },
    },
    accountInfo: { endpoint: 'v2/user', identityField: 'email' },
  },

  {
    id: 'polar',
    displayName: 'Polar',
    authType: 'oauth2',
    authDocsUrl: 'https://www.polar.com/accesslink-api/',
    beta: true,
    oauth: {
      // Polar AccessLink Client ID (public). The matching client_secret lives
      // only in POLAR_CLIENT_SECRET (Vercel env + local .env.local). Polar is
      // a confidential OAuth2 client — no PKCE option offered.
      clientId: 'd4402bda-aaf6-4b54-be8c-00b789938a1f',
      redirectUris: [
        'https://app.getbased.health/',
        'https://getbased.health/app',
        'https://beta.getbased.health/',
        'https://beta.getbased.health/app',
        'http://localhost:8000/app',
      ],
      scopes: ['accesslink.read_all'],
      pkce: false,
    },
    // Polar's AccessLink has two hosts: flow.polar.com for the authorize page,
    // polarremote.com for the token endpoint, www.polaraccesslink.com for all
    // reads. apiHost is the read host — our allowlist covers all three.
    apiHost: 'www.polaraccesslink.com',
    metrics: {
      // AccessLink's data model is transactional — you POST to open, GET to
      // read listed URLs, PUT to commit. Endpoints here are the "list" steps;
      // wearables-polar.js walks per-item URLs. Fields map post-parse.
      rhr:         { endpoint: 'v3/users/{uid}/sleep',                 field: 'heart-rate-samples.min' }, // sleep-window minimum is the true overnight RHR
      hr_day:      { endpoint: 'v3/users/{uid}/activity-transactions', field: 'heart-rate.average' },     // daytime activity-window average — NOT resting
      hrv_day:     { endpoint: 'v3/users/{uid}/exercise-transactions', field: 'heart-rate-variability-avg' }, // workout-gated; daytime measurement, not overnight rMSSD
      steps:       { endpoint: 'v3/users/{uid}/activity-transactions', field: 'active-steps' },
      sleep_score: { endpoint: 'v3/users/{uid}/sleep',                 field: 'sleep-score' },
    },
    accountInfo: { endpoint: 'v3/users/{uid}', identityField: 'polar-user-id' },
  },

  {
    // Manual entry — user-authored weight/BP/pulse records treated as a
    // first-class source. No OAuth, no file import, no live sync. The
    // dashboard strip and per-metric source picker render these alongside
    // wearable-synced data via the generic summary pipeline.
    //
    // Implementation lives in js/wearables-manual.js. The adapter only
    // declares which canonical metrics manual entry covers and its
    // display-layer metadata.
    id: 'manual',
    displayName: 'Manual',
    authType: 'manual',
    apiHost: null,
    beta: false,
    metrics: {
      weight:       { manual: true },
      bp_systolic:  { manual: true },
      bp_diastolic: { manual: true },
      rhr:          { manual: true },
    },
  },
  {
    // Apple Health sits last — file-import-only, no OAuth, no live sync.
    // Different operational shape from the rest, so visually grouping it at
    // the bottom makes the list easier to scan.
    id: 'apple_health',
    displayName: 'Apple Health',
    authType: 'file-import',
    authDocsUrl: 'https://support.apple.com/guide/iphone/share-your-health-data-iph27f6325b2/ios',
    beta: true,
    apiHost: null, // file-import has no host
    metrics: {
      // Apple Health XML `type` attribute → canonical metric mapping. Populated
      // by the parser at import time, not fetched per-request.
      // hrv_day is derived in the parser by splitting SDNN samples into a
      // night (22:00–06:00 local) and day (06:00–22:00) window.
      // hr_day uses the raw HeartRate stream filtered to the day window —
      // RestingHeartRate is sleep-derived (Apple writes one per day at wake)
      // so it stays in the rhr slot via min-aggregation.
      hrv_sdnn:        { hkType: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN' },
      hrv_day:         { hkType: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', window: 'day' },
      rhr:             { hkType: 'HKQuantityTypeIdentifierRestingHeartRate' },
      hr_day:          { hkType: 'HKQuantityTypeIdentifierHeartRate', window: 'day' },
      steps:           { hkType: 'HKQuantityTypeIdentifierStepCount' },
      spo2_avg:        { hkType: 'HKQuantityTypeIdentifierOxygenSaturation' },
      body_temp_delta: { hkType: 'HKQuantityTypeIdentifierBodyTemperature' },
    },
  },
];

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

export function adapterById(id) {
  return ADAPTERS.find(a => a.id === id) || null;
}

// ─────────────────────────────────────────────────────────
// OAuth client_id runtime overrides (self-host support)
// ─────────────────────────────────────────────────────────
//
// The clientId baked into each adapter above is the maintainer's OAuth app
// (registered for *.getbased.health). Self-hosters who run their own Oura /
// Withings / Polar / etc. apps need their own client_id to match their own
// client_secret — otherwise the provider returns invalid_client.
//
// The browser asks /api/proxy for a `wearable_runtime_config` map at startup;
// dev-server.js + api/proxy.js read OURA_CLIENT_ID / WITHINGS_CLIENT_ID / …
// from env and surface them here. Missing entries fall back to the hardcoded
// maintainer values, so hosted users see no change.

const _oauthOverrides = Object.create(null);

export function applyOAuthOverrides(overrides) {
  if (!overrides || typeof overrides !== 'object') return;
  for (const [id, clientId] of Object.entries(overrides)) {
    if (typeof clientId === 'string' && clientId.trim()) {
      _oauthOverrides[id] = clientId.trim();
    }
  }
}

export function getOAuthClientId(adapterOrId) {
  const adapter = typeof adapterOrId === 'string' ? adapterById(adapterOrId) : adapterOrId;
  if (!adapter) return null;
  return _oauthOverrides[adapter.id] || adapter.oauth?.clientId || null;
}

// Test/debug surface — never relied on by production code paths.
export function _resetOAuthOverrides() {
  for (const k of Object.keys(_oauthOverrides)) delete _oauthOverrides[k];
}

// Filter the registry for the Settings → Wearables list. Hides any adapter
// flagged `betaHidden` unless either: (a) the maintainer escape hatch is set,
// or (b) the adapter is already in `connectedIds` (so existing connections
// stay manageable across version bumps). Always returns a new array.
export function visibleAdapters(connectedIds = []) {
  const escape = (() => {
    try { return localStorage.getItem('labcharts-show-beta-wearables') === 'true'; }
    catch { return false; }
  })();
  if (escape) return ADAPTERS.slice();
  const connected = new Set(connectedIds);
  return ADAPTERS.filter(a => !a.betaHidden || connected.has(a.id));
}

export function adapterSupportsMetric(adapterId, metricId) {
  const a = adapterById(adapterId);
  return !!a?.metrics?.[metricId];
}

// Return the list of canonical metrics any given adapter can deliver.
export function adapterMetricIds(adapterId) {
  const a = adapterById(adapterId);
  if (!a) return [];
  return Object.keys(a.metrics || {});
}

// Union of canonical metrics across a set of connected source ids (preserving
// DEFAULT_METRIC_ORDER, then appending any extras in registry order).
export function metricsForSources(sourceIds) {
  const set = new Set();
  for (const sid of sourceIds) for (const m of adapterMetricIds(sid)) set.add(m);
  const ordered = [];
  for (const id of DEFAULT_METRIC_ORDER) if (set.has(id)) ordered.push(id);
  for (const id of set) if (!ordered.includes(id)) ordered.push(id);
  return ordered;
}

export function canonicalMetric(id) {
  return CANONICAL_METRICS[id] || null;
}

// ─────────────────────────────────────────────────────────
// Vendor-agnostic date helpers — used to live in wearables-oura.js but
// every wearable module was importing them across vendor lines, so the
// vendor adapter file was the wrong home.
// Returns local-zone YYYY-MM-DD. Local zone is correct for all vendor
// `day` fields we've seen (Oura, Withings, Fitbit, Polar all attribute
// to user-local), and avoids the UTC-cuts-today-in-half bug that an
// earlier UTC implementation hit for non-UTC users.
export function isoDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function daysAgoIso(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
}
