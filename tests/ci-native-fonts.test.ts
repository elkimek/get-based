import {expect, it} from 'vitest';
import {NATIVE_CHART_FONTCONFIG, NATIVE_CHART_OTF, NATIVE_CHART_OTF_SHA256, qualifyNativeChartFontInventory} from '../scripts/ci-native-fonts.mjs';

const regular = ['Nimbus Sans', 'Regular', 'CFF', 'NimbusSans-Regular', '0', NATIVE_CHART_OTF].join('\t');
const bold = ['Nimbus Sans', 'Bold', 'CFF', 'NimbusSans-Bold', '0', '/usr/share/fonts/opentype/urw-base35/NimbusSans-Bold.otf'].join('\t');
it('accepts the sole original regular face while retaining other native weights', () => {
  expect(() => qualifyNativeChartFontInventory(regular+'\n'+bold+'\n', NATIVE_CHART_OTF_SHA256)).not.toThrow();
});
it.each([
  ['empty', ''], ['missing regular', bold], ['duplicate regular', regular+'\n'+regular],
  ['Type1 regular', regular.replace('CFF', 'Type 1').replace(NATIVE_CHART_OTF, '/usr/share/fonts/X11/Type1/NimbusSans-Regular.pfb')],
  ['Type1 sibling', regular+'\n'+bold.replace('CFF', 'Type 1')],
  ['different family', regular.replace('Nimbus Sans\t', 'Other Sans\t')],
  ['unclassified regular sibling', regular+'\n'+regular.replace('\tRegular\t', '\tBook\t')],
  ['different format', regular.replace('\tCFF\t', '\tTrueType\t')],
  ['different PostScript face', regular.replace('NimbusSans-Regular', 'NimbusSans-Other')],
  ['different face index', regular.replace('\t0\t', '\t1\t')],
  ['different physical OTF', regular.replace(NATIVE_CHART_OTF, '/other/NimbusSans-Regular.otf')],
  ['missing field', regular.split('\t').slice(1).join('\t')],
] as const)('rejects %s before browser launch', (_name, inventory) => {
  expect(() => qualifyNativeChartFontInventory(inventory, NATIVE_CHART_OTF_SHA256)).toThrow();
});
it('rejects changed bytes even when the entire face inventory still matches', () => {
  expect(() => qualifyNativeChartFontInventory(regular, '0'.repeat(64))).toThrow('Exact native OTF bytes');
});
it('keeps the original host configuration and rejects only the conjunction of Nimbus Sans and Type1', () => {
  expect(NATIVE_CHART_FONTCONFIG.match(/<include>/g)).toHaveLength(1);
  expect(NATIVE_CHART_FONTCONFIG).toContain('<include>/etc/fonts/fonts.conf</include>');
  expect(NATIVE_CHART_FONTCONFIG.match(/<pattern>/g)).toHaveLength(1);
  expect(NATIVE_CHART_FONTCONFIG.match(/<patelt /g)).toHaveLength(2);
  expect(NATIVE_CHART_FONTCONFIG).toContain('<patelt name="family"><string>Nimbus Sans</string></patelt>');
  expect(NATIVE_CHART_FONTCONFIG).toContain('<patelt name="fontformat"><string>Type 1</string></patelt>');
  expect(NATIVE_CHART_FONTCONFIG).not.toMatch(/<dir>|<reset-dirs|<edit|<alias|<acceptfont/);
});
