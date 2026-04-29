#!/usr/bin/env bash
set -euo pipefail

# ── Pinned versions (bump these, then re-run) ─────────────────────────────
CHARTJS_VERSION="4.4.7"
# pdf.js 4.x is ESM-only — UMD `pdf.min.js` no longer exists. We pin to the
# `legacy/` ESM build (broader browser-target transforms) and load it via a
# dynamic `import()` that exposes the module as `window.pdfjsLib` for the
# existing call sites. ≥4.2.67 closes CVE-2024-4367 (FontMatrix injection).
PDFJS_VERSION="4.10.38"
MAMMOTH_VERSION="1.8.0"
JSZIP_VERSION="3.10.1"
# @huggingface/transformers is intentionally NOT vendored — its npm-dist
# bundles have bare module specifiers (onnxruntime-web/webgpu etc.) that
# browsers can't resolve without a bundler, and ORT picks one of four
# WASM variants at runtime based on browser feature detection. The
# browser-local lens loads both from jsdelivr. To truly vendor, run a
# bundler pass that produces a single resolved ESM. Tracked as phase 2c
# in memory/project_browser_local_lens.md.
# Google Fonts: no version pin — re-run to fetch latest files
# ───────────────────────────────────────────────────────────────────────────

VENDOR_DIR="vendor"
FONTS_DIR="$VENDOR_DIR/fonts"

mkdir -p "$FONTS_DIR"

echo "=== Downloading Chart.js $CHARTJS_VERSION ==="
curl -fsSL "https://cdn.jsdelivr.net/npm/chart.js@${CHARTJS_VERSION}/dist/chart.umd.min.js" \
  -o "$VENDOR_DIR/chart.min.js"

echo "=== Downloading pdf.js $PDFJS_VERSION (legacy ESM) ==="
curl -fsSL "https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/legacy/build/pdf.min.mjs" \
  -o "$VENDOR_DIR/pdf.min.mjs"

curl -fsSL "https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/legacy/build/pdf.worker.min.mjs" \
  -o "$VENDOR_DIR/pdf.worker.min.mjs"

# Drop the old UMD artifacts so a stale cache doesn't shadow the new ESM build
rm -f "$VENDOR_DIR/pdf.min.js" "$VENDOR_DIR/pdf.worker.min.js"

echo "=== Downloading mammoth $MAMMOTH_VERSION ==="
curl -fsSL "https://cdn.jsdelivr.net/npm/mammoth@${MAMMOTH_VERSION}/mammoth.browser.min.js" \
  -o "$VENDOR_DIR/mammoth.browser.min.js"

echo "=== Downloading JSZip $JSZIP_VERSION ==="
curl -fsSL "https://cdn.jsdelivr.net/npm/jszip@${JSZIP_VERSION}/dist/jszip.min.js" \
  -o "$VENDOR_DIR/jszip.min.js"


echo "=== Downloading Google Fonts ==="
FONTS_CSS=$(curl -fsSL \
  -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120" \
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap")

# Parse CSS, download woff2 files, generate local fonts.css
python3 -c "
import re, subprocess, os

css = '''$FONTS_CSS'''

# Extract all @font-face blocks
blocks = re.findall(r'@font-face\s*\{[^}]+\}', css)
out_rules = []
seen = set()

for block in blocks:
    family_m = re.search(r\"font-family:\s*'([^']+)'\", block)
    weight_m = re.search(r'font-weight:\s*(\d+)', block)
    url_m = re.search(r'url\((https://[^)]+\.woff2)\)', block)
    range_m = re.search(r'unicode-range:\s*([^;]+)', block)
    if not (family_m and weight_m and url_m):
        continue
    family = family_m.group(1)
    weight = weight_m.group(1)
    url = url_m.group(1)
    unicode_range = range_m.group(1).strip() if range_m else None

    slug = family.lower().replace(' ', '-')
    # Include subset index for families with multiple unicode-range blocks per weight
    key = (slug, weight, unicode_range)
    if key in seen:
        continue
    seen.add(key)

    # Count how many files for this family+weight combo
    count = sum(1 for k in seen if k[0] == slug and k[1] == weight)
    suffix = f'-{count}' if count > 1 else ''
    filename = f'{slug}-{weight}{suffix}.woff2'

    subprocess.run(['curl', '-fsSL', url, '-o', f'$FONTS_DIR/{filename}'], check=True)

    rule = f\"\"\"@font-face {{
  font-family: '{family}';
  font-style: normal;
  font-weight: {weight};
  font-display: swap;
  src: url('./{filename}') format('woff2');\"\"\"
    if unicode_range:
        rule += f'\n  unicode-range: {unicode_range};'
    rule += '\n}'
    out_rules.append(rule)

with open('$FONTS_DIR/fonts.css', 'w') as f:
    f.write('\n\n'.join(out_rules) + '\n')

print(f'  Downloaded {len(seen)} font files')
"

echo ""
echo "=== Vendor bundle complete ==="
du -sh "$VENDOR_DIR"
echo ""
echo "Files:"
find "$VENDOR_DIR" -type f | sort | while read f; do
  echo "  $f ($(du -h "$f" | cut -f1))"
done
echo ""
echo "Next: bump version.js to bust SW cache before deploying."
