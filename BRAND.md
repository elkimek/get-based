# getbased Brand Manual

## Name

- **Written form**: `getbased` — always lowercase, no space, no camelCase
- **Domain**: getbased.health
- **App URL**: app.getbased.health
- **Never**: "Get Based", "GetBased", "get based", "get-based"

## Logo

Text-only wordmark. No icon/symbol — the name is the logo.

```
Font:     Outfit, sans-serif
Weight:   800 (extra-bold)
Tracking: -0.5px
Style:    Gradient text fill (not a flat color)
```

The gradient makes the wordmark distinctive without needing a separate icon.

## Colors

### Brand Gradient

The primary brand element. Used on: logo, CTAs, active states, progress bars.

```
Dark:   linear-gradient(135deg, #4f8cff 0%, #6366f1 100%)
Light:  linear-gradient(135deg, #3b7cf5 0%, #5b5bf6 100%)
```

### Accent

```
Dark:   #4f8cff (blue)
Light:  #3b7cf5 (blue)
```

### Full Palette

| Token             | Dark        | Light       | Usage                        |
|--------------------|-------------|-------------|------------------------------|
| `--accent`         | `#4f8cff`   | `#3b7cf5`   | Links, highlights, borders   |
| `--bg-primary`     | `#1a1d27`   | `#ffffff`   | App background               |
| `--bg-secondary`   | `#22253a`   | `#f4f5f7`   | Cards, surfaces              |
| `--text-primary`   | `#e6e8f0`   | `#1a1d27`   | Body text                    |
| `--text-secondary` | `#8b8fa3`   | `#5a5e6e`   | Labels, muted text           |
| `--success`        | `#4ade80`   | `#16a34a`   | Normal/healthy status        |
| `--warning`        | `#fb923c`   | `#ea580c`   | Alerts, caution              |
| `--danger`         | `#f87171`   | `#dc2626`   | High/low status, errors      |

### Special Colors

- **Bitcoin/Donate**: `#f7931a` (Bitcoin orange) — donate button default color, white text on hover fill
- **Discord**: uses Discord's brand SVG with `currentColor`

## Typography

```
Display / Logo:  Outfit (weight 500–800)
Body:            Inter (weight 400–700)
Monospace:       JetBrains Mono (weight 500–700)
```

All loaded from Google Fonts. No system font fallbacks in the brand — fallbacks are only CSS safety nets.

## Voice & Tone

- **Direct**: No marketing fluff. Say what the thing does.
- **Lowercase energy**: The brand name being lowercase sets the tone — approachable, not corporate.
- **Technical but accessible**: Users are health-conscious people tracking their own data, not necessarily doctors.
- **Tagline**: "Your lab results deserve better than a PDF"

## Header Buttons

Icon buttons use Lucide/Feather-style inline SVGs: 16×16, `stroke="currentColor"`, `stroke-width="2"`, `fill="none"`, `stroke-linecap/linejoin="round"`. Text buttons use 13px Inter weight 500.

Order: Settings (gear icon) → Feedback (bug icon) → Discord (brand SVG) → ₿ Donate (text, orange)

Documentation, Guided Tour, and What's New are accessible from Settings > Display tab — not in the header.

## Do / Don't

- **Do** use the gradient wordmark on dark and light backgrounds
- **Do** keep button icons minimal (single-stroke line icons)
- **Don't** use emoji as UI icons (inconsistent cross-platform rendering)
- **Don't** capitalize the brand name in any context
- **Don't** use the accent color as a solid background for the logo (use gradient)
