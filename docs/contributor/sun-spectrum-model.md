# Sun spectrum model — contributor reference

The Light & Sun lens reconstructs solar spectral irradiance and convolves it through published action spectra to derive per-channel doses. This page documents the model, the action spectra, and the calibration choices for anyone touching `js/sun-spectrum.js` or `js/sun-uvdata.js`.

## Pipeline

```
Atmosphere (UV index, ozone, cloud cover, temperature, altitude)
        │  via js/sun-uvdata.js — multi-source ladder:
        │     selfhost (CAMS-mirrored) → CAMS direct → NOAA NWS → Open-Meteo
        │     → offline zenith-angle fallback → manual entry
        ▼
Solar zenith angle (NOAA solar position algorithm, ±1° accuracy)
        │  js/sun-uvdata.js → solarZenithAngle(date, lat, lon)
        ▼
Bird-Riordan-style clear-sky reconstruction
        │  js/sun-spectrum.js → reconstructSpectrum()
        │  280-2500 nm at 5 nm resolution (89 bands)
        │  Extraterrestrial × Rayleigh × Ozone (Bass-Paur) × Aerosol × Cloud
        ▼
Per-channel convolution with action spectra
        │  js/sun-spectrum.js → computeChannelDoses()
        │  8 channels × 89 bands × 5nm bandwidth
        ▼
Dose accumulator (channel-au, internal unit)
        │  Mapped to qualitative tier (none/low/moderate/good/strong)
        │  via channelTier() vs CHANNEL_DISPLAY[k].dailyTarget
        ▼
UI (channel pills, channel cards, AI context)
```

## Wavelength grid

```javascript
WAVELENGTHS = [280, 285, 290, ..., 2495, 2500]  // 89 bands at 5nm
```

5 nm matches CAMS UV index forecast resolution and is fine enough for the action-spectrum convolutions. Coarser grids would lose the sharp UVB peak; finer grids would oversample without improving accuracy.

## Action spectra (per channel)

Each channel has a closed-form action spectrum function returning a 0–1 weighting per nm. Defined in `js/sun-spectrum.js`:

| Channel | Function | Reference | Peak | Bandwidth |
|---|---|---|---|---|
| `vitamin_d` | `vitaminDAt(nm)` | CIE 174:2006 (MacLaughlin 1982) | 297 nm | ~252–330 nm |
| `pomc` | `erythemalAt(nm)` | CIE 174:2006 / McKinlay-Diffey 1987 | 297 nm | ~250–400 nm |
| `no_cv` | `noReleaseAt(nm)` | Liu 2014 / Oplander 2009 | 345 nm | 300–410 nm Gaussian |
| `violet_eye` | `opn5At(nm)` | Buhr 2019 — dual-peak | 380, 471 nm | 320–540 nm |
| `circadian` | `melanopicAt(nm)` | CIE S 026:2018 | 490 nm | 380–720 nm Gaussian |
| `nir_solar` | `nirSolarAt(nm)` | Wunsch optical tissue window | 900 nm | 600–1400 nm |
| `pbm_red` | `pbmRedAt(nm)` | Karu 1999 / Hamblin 2018 | 660 nm | 600–700 nm |
| `pbm_nir` | `pbmNirAt(nm)` | Karu 1999 / Hamblin 2018 | 850 nm | 700–1100 nm |

The CCO action spectrum (`ccoAt`) in the file is an unused helper that sums Karu's four absorption bands; PBM channels use the simpler narrowband Gaussians for cleaner therapy-device dose math.

The citation registry is duplicated in `data/sun-action-spectra.json` for AI context grounding.

## Bird-Riordan reconstruction

Implemented as `reconstructSpectrum()` with these terms per wavelength:

```javascript
E(λ) = E0(λ) × T_Rayleigh × T_O3 × T_aerosol × cloudT
```

Where:
- **E0(λ)** — extraterrestrial spectral irradiance, hardcoded fit to ASTM E490 reference at sample points 280, 300, 320, 340, 360, 380, 400, 420, 450, 500, 550, 600, 650, 700, 800, 900, 1000, 1200, 1500, 2000, 2500 nm with linear interpolation between
- **T_Rayleigh** — `exp(-tauR × airMass / 1000)` with `tauR = (115.6406 / (nm/1000)^4 - 1.335 / (nm/1000)^2) × altScale` and `altScale = exp(-altitudeM / 8000)`
- **T_O3** — `exp(-ozoneAbsorption(nm) × airMass × ozoneDU/1000)` with Bass-Paur cross-section approximation peaking in the Hartley band (~250 nm)
- **T_aerosol** — `exp(-tauA × airMass)` with `tauA = 0.27 × (nm/500)^-1.14`
- **cloudT** — `1 - 0.75 × cloudCover` (linear cloud transmission)
- **airMass** — `1 / max(cos(zenithDeg × π/180), 0.001)`

Honest accuracy: ±25% relative for our use case (correlation against biomarkers). Not a radiometer. The full Bird-Riordan model has aerosol single-scattering, multiple scattering, and direct/diffuse separation that we deliberately drop for code simplicity. If the lens grows toward research-grade radiometry, re-implement against SMARTS-2.

## Channel dose calculation

```javascript
computeChannelDoses({ spectrum, durationMin, bodyExposureFraction, eyeExposure }) → {
  vitamin_d: number,
  pomc: number,
  no_cv: number,
  violet_eye: number,
  circadian: number,
  nir_solar: number,
  pbm_red: number,
  pbm_nir: number,
}
```

Per channel:

```javascript
dose = Σ_λ E(λ) × W(λ) × dλ × duration × gain
```

Where `gain` is:
- **Skin channels** (vitamin_d, pomc, no_cv, nir_solar, pbm_*) → `bodyExposureFraction` (0–1)
- **Eye channels** (circadian, violet_eye) → `eyeMultiplier(eyeExposure)`:
  - `direct + clear` → 1.0
  - `clear-glasses` → 0.85 (blocks UV, passes visible)
  - `glass-window` → 0.4 (passes most visible, blocks NIR + UV)
  - `polarized` → 0.5
  - `photochromic` → 0.3
  - `blue-blocker` → 0.4
  - `amber/red` → 0.2
  - `sunglasses` → 0.05
  - `closed-eyes`, `indoor` → 0

Eye-channel doses go to zero when `eyeExposure` is null (no eye exposure logged). Skin channels are unaffected by eye-mode.

## Safety counters

Two safety counters are computed alongside the channel doses:

### Erythemal SED

```javascript
erythemalSED({ spectrum, durationMin, bodyExposureFraction }) → number
```

Standard Erythemal Dose, defined as 100 J/m² of CIE-erythemal-weighted irradiance. Converted to a Fitzpatrick-fraction via:

```javascript
fractionOfMED({ sed, fitzpatrick }) → ratio
```

With per-Fitzpatrick MED values from Diffey 1991 / GrassrootsHealth (in SED units): `{ I: 2, II: 2.5, III: 3, IV: 4.5, V: 6, VI: 10 }`.

Burn-risk is `cumulativeMEDToday()` (sum across all sessions today).

### Retinal UV

```javascript
retinalUVdose({ spectrum, eyeExposure }) → J/m²
```

Only counts when `eyeExposure.mode === 'direct'`. Sums irradiance for λ ≤ 400 nm × duration. Used as a pure safety counter — never recommended to maximize. Sun-gazing protocols are deliberately not supported.

## Daily targets

`CHANNEL_DISPLAY[k].dailyTarget` defines the literature-rough target for "a meaningful healthy daily dose":

| Channel | Daily target (channel-au) |
|---|---|
| vitamin_d | 300 |
| pomc | 800 |
| no_cv | 100 |
| violet_eye | 6000 |
| circadian | 20000 |
| nir_solar | 100000 |
| pbm_red | 8000 |
| pbm_nir | 10000 |

These map to the qualitative tier function:

```javascript
ratio = dose / dailyTarget
ratio < 0.20 → 'low'
ratio < 0.55 → 'moderate'
ratio < 1.00 → 'good'
ratio ≥ 1.00 → 'strong'
```

Targets are deliberately rough. They're not normative — they're a translation layer so the UI doesn't show channel-au integers. The AI sees raw dose; users see tiers.

## Adding a new channel

1. Add an entry to `CHANNEL_DISPLAY` in `js/sun.js` with `icon`, `label`, `dailyTarget`, and `what` (user-facing tooltip)
2. Add an action-spectrum function to `js/sun-spectrum.js`
3. Append to the `CHANNELS` array in the same file with `{ id, key, fn, label }`
4. Add a row to `data/sun-action-spectra.json`'s `channels` block with the citation
5. Add to the dashboard pill / page card render order in `js/views.js` (`order` arrays)
6. Update `js/sun-correlations.js` if the channel should be biomarker-correlated
7. Update `tests/test-sun-spectrum.js` — assert the channel is in `SUN_CHANNELS` and has non-zero dose at noon

## Self-host UV data path

`js/sun-uvdata.js` resolves the active UV data provider via `providerOrder(cfg)`:

| `cfg.mode` | Order |
|---|---|
| `auto` (default) | selfhost (if URL set) → Open-Meteo → offline zenith |
| `selfhost` | selfhost → Open-Meteo |
| `cams` | CAMS proxy → Open-Meteo |
| `noaa` | NOAA NWS → Open-Meteo |
| `open-meteo` | Open-Meteo only |
| `manual` | none (always returns null, manual entry required) |

CAMS direct is a placeholder for the v1.7.x CAMS-via-proxy implementation. NOAA NWS doesn't allow browser CORS so it's reserved for self-hosters proxying through their own server.

The companion repo `getbased-uvdata` (TBD) ships a docker-compose template with CAMS sync + Open-Meteo fallback bundled. Self-hosters point Settings → Privacy → Sun Data Source → Self-hosted server at their endpoint.

## Validation

`tests/test-sun-spectrum.js` covers 35 assertions:
- Spectrum shape (wavelength array, 5nm grid, 280–2500 nm bounds, non-negative irradiance)
- Sun-below-horizon → all-zero spectrum
- Atmospheric attenuation (zenith / ozone / cloud / altitude) — directional checks
- Channel dose calculation (all channels, body fraction scaling, eye-mode gating, sunglasses → near-zero circadian)
- Safety counters (SED scales linearly with duration, Fitzpatrick I burns faster than VI, retinal-UV only in `direct` mode)
- Edge cases (night spectrum, zero-duration session)

Quarterly validation against published clear-sky measurement campaigns (NREL SRRL, NOAA SURFRAD) is the next-tier rigour — `docs/contributor/light-tools-validation.md` is the planned home for that report.
