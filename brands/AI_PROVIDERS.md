# AI provider identification marks

Audited 2026-09-04. These small assets identify user-selected third-party API
services in getbased settings. They are not getbased branding and do not imply
partnership, sponsorship, certification, or endorsement. Names and marks remain
their owners' property.

The icons are fetched on demand when AI settings opens and then stored by the
normal same-origin runtime cache; they are intentionally not part of the
first-install app shell.

| Provider | Packaged asset | Source and handling |
|---|---|---|
| PPQ / PayPerQ | `ai-provider-ppq.svg` | The unchanged 64 px `flame2.png` rendition served by PPQ's own website is embedded in an SVG container. Image SHA-256: `d1c6cab3f71ed07d4ebf086efbaa2e517dadfd5009a564b15780c4be5cda9de5`. PPQ explicitly documents use of its API from third-party applications. |
| Routstr | `ai-provider-routstr.svg` | Exact `https://routstr.com/icon.svg`, including its upstream light/dark styling. SHA-256: `56fb66f3083ac0de62d933121df1506708292739465e3119421400284f544f4f`. Routstr documents an open, OpenAI-compatible protocol for third-party clients. |
| OpenRouter | `ai-provider-openrouter.svg` | Exact 2026 Grape glyph from OpenRouter's official brand-assets page. SHA-256: `5b49593d44e6aa41011be377e182cd89e57473f1948e0dfb128f99a92adfc68d`. Do not stretch, recolor, or remix it. |
| Venice | `ai-provider-venice.svg` | Exact `venice-keys-on-off-white.svg` from Venice's official Keys SVG archive. SHA-256: `0218ef39e62887d49ae81dab563cec35ef61f3a1a0342d526fa8ff5ae5003eef`. Preserve its artwork, proportions, colors, and clear space. |

Primary sources reviewed:

- PPQ API documentation: https://ppq.ai/api-docs
- PPQ terms: https://ppq.ai/terms
- Routstr documentation: https://docs.routstr.com
- Routstr protocol repository: https://github.com/Routstr/protocol
- OpenRouter brand assets: https://openrouter.ai/brand
- OpenRouter terms: https://openrouter.ai/terms
- Venice brand kit: https://cdn.venice.ai/brand
- Venice API documentation: https://docs.venice.ai/api-reference/api-spec
- Venice terms: https://cdn.venice.ai/legal/tos
