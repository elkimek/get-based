# Light Environment

Indoor light is the dominant exposure most days. Eight to fourteen hours under LEDs, fluorescent, or mixed sources. The **Light environment** section on the ☀ Light & Sun page maps your indoor light reality so the AI can see the whole day, not just the outdoor half.

## Rooms

Add the rooms you spend real time in (kitchen, living room, office, bedroom). Each room captures:

- **Primary light source** — LED cool / LED warm / LED tunable / fluorescent / incandescent / halogen / candle / mixed / daylight only / unknown
- **Hours occupied per day** — how much of the day you spend in that room awake
- **After-sunset use** — flag for rooms where you spend evening time

Inline buttons let you measure straight from the survey:

- **📏** runs the Lux Meter pointed at the room's average lighting
- **⚡** runs the Flicker Detector against the dominant light source

Measured values save into `lightMeasurements` and the AI sees them with confidence weights.

## Screens

Add the screens you use regularly (phone, laptop, monitor, tablet, TV). Each screen captures:

- **Hours per day** — total awake-screen time
- **Evening hours** — after sunset (the biologically-expensive ones)
- **Blue-blocker enabled?** — flux, night-shift, dedicated app, glasses, hardware filter
- **Brightness** — high / medium / low

## Derived deficit signals

Two axes drop out automatically and feed the AI:

- **Daytime indoor hours** — total hours under artificial light during the solar day
- **LED + blue-evening exposure** — junk-light contamination weighted by source type and post-sunset use

These complement the episodic Sun Sessions log. A user who walks 15 min outside but sits under LEDs for 11 hours has a different photobiological day than one who is indoors for 2 hours under candles in the evening — and the AI sees both.

## What it shows up as

- **Indoor burden tier** on the Light & Sun page (negligible / mild / moderate / high / severe), computed from screens-after-sunset hours, blue-blocker absence, dim-room hours, and number of rooms without daylight access
- **AI chat context** — the always-tier prompt includes room count, screen count (with after-sunset / no-blue-blocker counts), light-audit count, indoor burden tier, and the d2 / d3 deficit axes. The AI can reason about your full day, not just outdoor exposure
- **Light Audit comparison** — capture before / after snapshots when you change something (LED swap, dimmer install, blackout curtains added) and see the per-room delta side-by-side

## Re-survey discipline

The survey is meant to reflect your usual week, not your perfect week. Re-open it once per quarter or after a move. The deficit signals smooth out over rolling windows; one week of vacation won't skew it.

## Eye-level audit (Tool 8)

The Light Environment survey fills out fastest via the **Eye-level audit** tool — a 10-min camera walkthrough that captures lux + CCT per room as you stop in each one. See [Light tools](light-tools.md#tool-8--eye-level-audit).

## Coming next

- **Smart-bulb integration** — read-only Hue / Lutron / Apple Home auto-detect of CCT and on-time per room
- **Per-room daylight ratio** — derived from window size + glass-transmission test results
