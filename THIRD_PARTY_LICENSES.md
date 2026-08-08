# Third-Party Licenses

getbased is licensed under [AGPL-3.0-or-later](LICENSE). The vendored and runtime-loaded third-party libraries listed below retain their original licenses; their inclusion does not relicense them.

## Vendored libraries (`vendor/`)

| File / Directory | Upstream | Version | License | License text |
|---|---|---|---|---|
| `chart.min.js` | [Chart.js](https://github.com/chartjs/Chart.js) | 4.4.7 | MIT | https://github.com/chartjs/Chart.js/blob/master/LICENSE.md |
| `pdf.min.mjs`, `pdf.worker.min.mjs` | [pdf.js](https://github.com/mozilla/pdf.js) (Mozilla) | 4.10.38 | Apache-2.0 | https://github.com/mozilla/pdf.js/blob/master/LICENSE |
| `mammoth.browser.min.js` | [mammoth.js](https://github.com/mwilliamson/mammoth.js) | 1.8.0 | BSD-2-Clause | https://github.com/mwilliamson/mammoth.js/blob/master/LICENSE |
| `jszip.min.js` | [JSZip](https://github.com/Stuk/jszip) (uses [pako](https://github.com/nodeca/pako) MIT) | 3.10.1 | MIT (dual-licensed MIT or GPLv3 — we elect MIT) | https://github.com/Stuk/jszip/blob/main/LICENSE.markdown |
| `cashu-ts.js` | [cashu-ts](https://github.com/cashubtc/cashu-ts) | 4.7.2 | MIT | https://github.com/cashubtc/cashu-ts/blob/main/LICENSE |
| `qrcode-generator.js` | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (Kazuhiko Arase) | 1.4.4 | MIT | https://opensource.org/licenses/mit-license.php |
| `bip39-minimal.js` | Custom (BIP-39 wordlist is public domain) | — | AGPL-3.0-or-later (this project) | [LICENSE](LICENSE) |
| `chartjs-adapter-native.js` | Custom (in-house Chart.js date adapter) | — | AGPL-3.0-or-later (this project) | [LICENSE](LICENSE) |
| `venice-e2ee.js`, `venice-nvidia.js` | [venice-e2ee](https://github.com/elkimek/venice-e2ee) (the main bundle includes `@noble/secp256k1` and `@noble/hashes`) | 0.5.3 | GPL-3.0-only; bundled noble libraries MIT | https://github.com/elkimek/venice-e2ee/blob/v0.5.3/LICENSE |
| `ppq-private-tee.js` | Custom (in-house PPQ adapter for Tinfoil's SecureClient) | — | AGPL-3.0-or-later (this project) | [LICENSE](LICENSE) |
| `tinfoil-browser.js` | [Tinfoil JS](https://github.com/tinfoilsh/tinfoil-js) browser SecureClient bundle for PPQ and Routstr Private TEE modes | 1.1.12 | AGPL-3.0-or-later | https://github.com/tinfoilsh/tinfoil-js/blob/main/LICENSE |
| `ehbp-browser.js` | [EHBP](https://github.com/tinfoilsh/encrypted-http-body-protocol) encrypted HTTP transport used by Tinfoil | 0.3.2 | MIT | https://github.com/tinfoilsh/encrypted-http-body-protocol/blob/main/LICENSE |
| `evolu/evolu-bundle.js`, `evolu/Db.worker.js` | [Evolu](https://github.com/evoluhq/evolu) (`@evolu/common`) | 7.4.1 | MIT | https://github.com/evoluhq/evolu/blob/main/LICENSE |
| `evolu/sqlite3.wasm`, `evolu/sqlite3-*` | [SQLite](https://www.sqlite.org/copyright.html) | 3.50.4 | Public Domain | https://www.sqlite.org/copyright.html |
| `fonts/inter-*.woff2` | [Inter](https://github.com/rsms/inter) (Rasmus Andersson) | — | SIL OFL 1.1 | [vendor/fonts/OFL.txt](vendor/fonts/OFL.txt) |
| `fonts/outfit-*.woff2` | [Outfit](https://github.com/Outfit/Outfit-Fonts) (Rodrigo Fuenzalida, Smich Smich) | — | SIL OFL 1.1 | [vendor/fonts/OFL.txt](vendor/fonts/OFL.txt) |
| `fonts/jetbrains-mono-*.woff2` | [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) (JetBrains s.r.o.) | — | SIL OFL 1.1 | [vendor/fonts/OFL.txt](vendor/fonts/OFL.txt) |
| `fonts/vt323-*.woff2` | [VT323](https://github.com/phoikoi/VT323) (Peter Hull) | — | SIL OFL 1.1 | [vendor/fonts/OFL.txt](vendor/fonts/OFL.txt) |

## Runtime-loaded (not vendored)

The browser-local Knowledge Base and Voice features load these from jsdelivr or
Hugging Face at runtime; they are not bundled with this repository.

| Module / model | Pinned version / repository | License |
|---|---|---|
| [`@huggingface/transformers`](https://github.com/huggingface/transformers.js) | 4.1.0 | Apache-2.0 |
| `onnxruntime-web` (transitive) | via Transformers.js / Kokoro.js | MIT |
| [`kokoro-js`](https://github.com/hexgrad/kokoro) | 1.2.1 | Apache-2.0 |
| [Whisper Large v3 Turbo ONNX](https://huggingface.co/onnx-community/whisper-large-v3-turbo) and [Small ONNX](https://huggingface.co/onnx-community/whisper-small) | `onnx-community` model repositories | Apache-2.0 |
| [Kokoro 82M v1.0 ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) | `onnx-community/Kokoro-82M-v1.0-ONNX` | Apache-2.0 |

## Notes

- **Apache-2.0 (pdf.js)** — Mozilla's `@licstart` notice is preserved inline in `vendor/pdf.min.mjs` and `vendor/pdf.worker.min.mjs`.
- **JSZip** — published under a dual MIT-or-GPLv3 license; this project elects MIT for compatibility with AGPL-3.0-or-later as the umbrella license.
- **SIL OFL 1.1** — Inter, Outfit, and JetBrains Mono are distributed under the Open Font License. The Reserved Font Names ("Inter", "Outfit", "JetBrains Mono") are preserved; this project does not modify the font files. See [vendor/fonts/OFL.txt](vendor/fonts/OFL.txt).
- **SQLite** — released into the public domain by its authors.
- **Vendored upstream files** retain their original copyright notices where present in the minified or bundled source.

To refresh vendored versions, run `./update-vendor.sh`, update
`vendor/components.json`, and re-verify upstream license text for any version
bumps. Then run `npm run supply-chain:check` and `npm run sbom`.
