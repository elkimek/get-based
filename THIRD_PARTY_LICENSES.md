# Third-Party Licenses

getbased is licensed under [AGPL-3.0-or-later](LICENSE). The vendored and runtime-loaded third-party libraries listed below retain their original licenses; their inclusion does not relicense them.

## Vendored libraries (`vendor/`)

| File / Directory | Upstream | Version | License | License text |
|---|---|---|---|---|
| `chart.min.js` | [Chart.js](https://github.com/chartjs/Chart.js) | 4.4.7 | MIT | https://github.com/chartjs/Chart.js/blob/master/LICENSE.md |
| `pdf.min.mjs`, `pdf.worker.min.mjs` | [pdf.js](https://github.com/mozilla/pdf.js) (Mozilla) | 4.10.38 | Apache-2.0 | https://github.com/mozilla/pdf.js/blob/master/LICENSE |
| `mammoth.browser.min.js` | [mammoth.js](https://github.com/mwilliamson/mammoth.js) | 1.8.0 | BSD-2-Clause | https://github.com/mwilliamson/mammoth.js/blob/master/LICENSE |
| `jszip.min.js` | [JSZip](https://github.com/Stuk/jszip) (uses [pako](https://github.com/nodeca/pako) MIT) | 3.10.1 | MIT (dual-licensed MIT or GPLv3 — we elect MIT) | https://github.com/Stuk/jszip/blob/main/LICENSE.markdown |
| `cashu-ts.js` | [cashu-ts](https://github.com/cashubtc/cashu-ts) | bundled | MIT | https://github.com/cashubtc/cashu-ts/blob/main/LICENSE |
| `qrcode-generator.js` | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (Kazuhiko Arase) | bundled | MIT | https://opensource.org/licenses/mit-license.php |
| `bip39-minimal.js` | Custom (BIP-39 wordlist is public domain) | — | AGPL-3.0-or-later (this project) | [LICENSE](LICENSE) |
| `chartjs-adapter-native.js` | Custom (in-house Chart.js date adapter) | — | AGPL-3.0-or-later (this project) | [LICENSE](LICENSE) |
| `venice-e2ee.js` | Custom (uses [@noble/secp256k1](https://github.com/paulmillr/noble-secp256k1) MIT, [@noble/hashes](https://github.com/paulmillr/noble-hashes) MIT) | — | AGPL-3.0-or-later (this project); bundled noble libs MIT | https://github.com/paulmillr/noble-secp256k1/blob/main/LICENSE |
| `evolu/evolu-bundle.js`, `evolu/Db.worker.js` | [Evolu](https://github.com/evoluhq/evolu) | bundled | MIT | https://github.com/evoluhq/evolu/blob/main/LICENSE |
| `evolu/sqlite3.wasm`, `evolu/sqlite3-*.mjs` | [SQLite](https://www.sqlite.org/copyright.html) | bundled | Public Domain | https://www.sqlite.org/copyright.html |
| `fonts/inter-*.woff2` | [Inter](https://github.com/rsms/inter) (Rasmus Andersson) | — | SIL OFL 1.1 | [vendor/fonts/OFL.txt](vendor/fonts/OFL.txt) |
| `fonts/outfit-*.woff2` | [Outfit](https://github.com/Outfit/Outfit-Fonts) (Rodrigo Fuenzalida, Smich Smich) | — | SIL OFL 1.1 | [vendor/fonts/OFL.txt](vendor/fonts/OFL.txt) |
| `fonts/jetbrains-mono-*.woff2` | [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) (JetBrains s.r.o.) | — | SIL OFL 1.1 | [vendor/fonts/OFL.txt](vendor/fonts/OFL.txt) |

## Runtime-loaded (not vendored)

The browser-local Knowledge Base lens loads these from jsdelivr at runtime; they are not bundled with this repository.

| Module | License |
|---|---|
| [`@huggingface/transformers`](https://github.com/huggingface/transformers.js) | Apache-2.0 |
| `onnxruntime-web` (transitive) | MIT |

## Notes

- **Apache-2.0 (pdf.js)** — Mozilla's `@licstart` notice is preserved inline in `vendor/pdf.min.mjs` and `vendor/pdf.worker.min.mjs`.
- **JSZip** — published under a dual MIT-or-GPLv3 license; this project elects MIT for compatibility with AGPL-3.0-or-later as the umbrella license.
- **SIL OFL 1.1** — Inter, Outfit, and JetBrains Mono are distributed under the Open Font License. The Reserved Font Names ("Inter", "Outfit", "JetBrains Mono") are preserved; this project does not modify the font files. See [vendor/fonts/OFL.txt](vendor/fonts/OFL.txt).
- **SQLite** — released into the public domain by its authors.
- **Vendored upstream files** retain their original copyright notices where present in the minified or bundled source.

To refresh vendored versions, run `./update-vendor.sh` and re-verify upstream license text for any version bumps.
