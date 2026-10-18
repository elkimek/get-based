import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const NATIVE_CHART_OTF = '/usr/share/fonts/opentype/urw-base35/NimbusSans-Regular.otf';
export const NATIVE_CHART_OTF_SHA256 = '7c25be4d78155523080ab85b10277150657ff7dabbcad7037bdd536c9b6d0d08';
// Keep the host rules and every other family. Firefox can otherwise select the
// same-name Type1 face, whose missing OpenType kerning changes native Chart paint.
export const NATIVE_CHART_FONTCONFIG = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <include>/etc/fonts/fonts.conf</include>
  <selectfont><rejectfont><pattern>
    <patelt name="family"><string>Nimbus Sans</string></patelt>
    <patelt name="fontformat"><string>Type 1</string></patelt>
  </pattern></rejectfont></selectfont>
</fontconfig>\n`;
const format = '%{family}\t%{style}\t%{fontformat}\t%{postscriptname}\t%{index}\t%{file}\n';

/** Qualify the whole regular candidate inventory, not just fc-match's first face. */
export function qualifyNativeChartFontInventory(inventory: string, digest: string): void {
  const rows = inventory.trim().split('\n').map(line => line.split('\t'));
  assert(rows.length > 0 && rows.every(row => row.length === 6), 'Complete native font inventory');
  assert(rows.every(row => row[0] === 'Nimbus Sans' && row[2] !== 'Type 1'), 'Only Nimbus Sans with no Type1 candidates');
  assert(rows.every(row => ['Regular', 'Italic', 'Bold', 'Bold Italic'].includes(row[1]!)), 'Known native Nimbus face styles');
  const regular = rows.filter(row => row[1] === 'Regular');
  assert.deepEqual(regular, [['Nimbus Sans', 'Regular', 'CFF', 'NimbusSans-Regular', '0', NATIVE_CHART_OTF]], 'Exactly one qualified regular native OTF face, PostScript name and index');
  assert.equal(digest, NATIVE_CHART_OTF_SHA256, 'Exact native OTF bytes');
}

export async function configureNativeChartFont({runnerTemp, githubEnv}: {runnerTemp: string; githubEnv: string}): Promise<string> {
  assert.equal(process.platform, 'linux', 'Native fontconfig qualification is Linux-only');
  assert(path.isAbsolute(runnerTemp) && path.isAbsolute(githubEnv), 'Explicit runner-owned absolute paths');
  assert(!/[\r\n]/.test(runnerTemp), 'A fontconfig environment value occupies one line');
  const directory = await fs.mkdtemp(path.join(runnerTemp, 'getbased-native-font-'));
  const file = path.join(directory, 'fonts.conf');
  await fs.writeFile(file, NATIVE_CHART_FONTCONFIG, {flag: 'wx'});
  const env = {...process.env, FONTCONFIG_FILE: file};
  const before = execFileSync('fc-list', ['Nimbus Sans', '-f', format], {encoding: 'utf8'});
  const after = execFileSync('fc-list', ['Nimbus Sans', '-f', format], {encoding: 'utf8', env});
  const bytes = await fs.readFile(NATIVE_CHART_OTF);
  qualifyNativeChartFontInventory(after, createHash('sha256').update(bytes).digest('hex'));
  console.error(JSON.stringify({nativeChartFontInventoryBefore: before, nativeChartFontInventoryAfter: after, sha256: NATIVE_CHART_OTF_SHA256}));
  // Only subsequent job processes opt into this owned configuration. No host
  // fontconfig files, font payloads or application font choices are modified.
  await fs.appendFile(githubEnv, `FONTCONFIG_FILE=${file}\n`);
  return file;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const runnerTemp = process.env['RUNNER_TEMP'], githubEnv = process.env['GITHUB_ENV'];
  assert(runnerTemp && githubEnv, 'Native Chart font qualification requires runner environment paths');
  console.log(await configureNativeChartFont({runnerTemp, githubEnv}));
}
