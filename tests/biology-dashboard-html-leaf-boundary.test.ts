// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import {requireActualRetry, type ActualRetryGraph} from './helpers/actual-retry-graph.js';
import { renderHTML as overview } from '../js/components/BiologyOverviewPresentation.svelte.html.js';
import { renderHTML as summary } from '../js/components/BiologySummaryPresentation.svelte.html.js';
import { renderHTML as scoreHTML } from '../js/components/BiologyDashboardScore.svelte.html.js';
import { renderHTML as coherenceHTML } from '../js/components/BiologyDashboardCoherence.svelte.html.js';
import { renderHTML as widgetHTML } from '../js/components/BiologySummaryWidget.svelte.html.js';
import {
  projectBiologyDashboardScore,
  projectBiologyDashboardCoherence,
  type BiologyOverviewProps,
} from '../js/biology-overview-presentation.js';
import {
  projectBiologySummaryWidget,
  type BiologySummaryProps,
  type BiologyCompatibilityScore,
} from '../js/biology-summary-presentation.js';
import type { BiologyRenderScore } from '../js/biology-score-render.js';

type OverviewInput = Extract<BiologyOverviewProps, { kind: 'dashboard-score' | 'dashboard-coherence' }>;
type WidgetInput = Extract<BiologySummaryProps, { kind: 'widget' }>;
type Input = OverviewInput | WidgetInput;
interface OverviewSample {
  kind: BiologyOverviewProps['kind'];
  name: string;
  score: BiologyRenderScore | null;
}
interface SummarySample {
  kind: BiologySummaryProps['kind'];
  name: string;
  records: (BiologyCompatibilityScore & { nonFiniteScore?: boolean })[];
}
const sha = (source: string) => createHash('sha256').update(source).digest('hex');
// Independent accepted source bytes captured before changing controller imports.
// Includes the complete authored child graph of BOTH original dispatchers and
// the original native fixtures. No candidate output becomes an oracle.
const pins: Record<string, string> = {
  "js/components/BiologyOverviewPresentation.svelte": "acb13c995ee42662b635eab415d1f7e31724758e442a48de860212e04af2bc60",
  "js/components/BiologySummaryPresentation.svelte": "b868e363325404d3e283e2c5912c668ee6901caf5bb3f561cd71dba42b09ba35",
  "js/components/BiologyDashboardScore.svelte": "f67177a696fb59c8042ce018caee039e7a8b7ad9ac681cee97bc599f1c5271c8",
  "js/components/BiologyDashboardCoherence.svelte": "20ff4361397530f1c91f26261bc6e4f924d195482842bf1f82d40b2f3f456775",
  "js/components/BiologySummaryWidget.svelte": "401e2404f0ce83e18cbfa89c9beeb652e62a11ac0c98845e7f425a445380a40f",
  "tests/fixtures/biology-overview-original.json": "10882c96bb46abf18e2dc26f0c3c27466b2661557cedf291aa1ce8ce5c33f24a",
  "tests/fixtures/biology-summary-original.json": "39fe6f20e87aefa87af946469e9288248232a7a72e99a4de0c5ed15e75a3d439",
  "js/components/BiologyCompatibilityLens.svelte": "7025d78bbb521d029d64e557faff9b955d2b196c01f34829e0d65decc4ea3644",
  "js/components/BiologyScoreDetail.svelte": "1c43b5651f52546636a3edcaafb22e6d1a1fade0cde4a7c34bc4f82762ac91c4",
  "js/components/LensDashboardToggle.svelte": "aed4ee183941f6aba99cc344d03b2be33fd8e8093a941d9dc383338fa759b936",
  "js/components/LensWidgetTools.svelte": "a66b5f9e7c25352bb8873d202dd3898ac4731a14c46229415dd33f1f4dddeab7",
  "js/components/BiologyMethodology.svelte": "2e911f0d9de02150ffbc52dd16acb6ccc05aad7145b4f3a66207a176ad6f8425",
  "js/components/BiologyReadingFacts.svelte": "0ab61e6296834c5e1eed30368a554ce1bd7227290dde7d0ab752687405f67131",
  "js/components/BiologyReadingTable.svelte": "0371d42434842794c3fab08fd45c7600edf9d40b4c6b15f606855e06970347b0",
  "js/components/BiologyMarkerResults.svelte": "2fd418060e402bc38179f47411e3675fae352bdcece565793a9f85c168c3fd83",
  "js/components/BiologyInterpretationNotes.svelte": "a3049001ee873254b4e8945f72453c6bb464f66ed12293f9e8205b3f67704022",
  "js/components/BiologyAIAnswer.svelte": "1714f7f168bf2f7e59a9cd7f1c2ea03fe23fa6d13e4eff438ce501cf80c38dcf",
  "js/components/BiologyAISkeleton.svelte": "c655a1e2ec8e33fd7699eae2189d5fbebeb624f783fccb9c925ba67d8162edc5",
  "js/components/BiologyAIDot.svelte": "1d2c0fae3e6dbf63ecb474887fa243f19f6062ce446020f2545cf903a7ad2284",
  "js/components/BiologyAISummary.svelte": "d5d7368e110ef6b6b3704a1336443ffb18335e9094742ca735f908a147049bf4",
  "js/components/BiologyScoreMetric.svelte": "b8a2ca6214822f376bf2ecbbe3dbe0a7f15eaf94b4116a99377fbd75d1caa5ef",
  "js/components/BiologyCoveragePlanner.svelte": "dd6be9bd626d24433ccb82833fb200c98a4632e3bcab4d554a69639439b36f11",
  "js/components/BiologyCoverageBundle.svelte": "72d9f2ea343a5c0eb45f03fc0c6a456dc20ecec5d6ae6c409b8eb30e572c8dc0",
  "js/components/BiologyPlanningCard.svelte": "8725dd15995eff24c38e43ebf50d5cc410769f9a50f03a9c327f830c997f1790",
  "js/components/BiologyNextChecks.svelte": "4a14b23d4bad255b1a69293683b211dd5205681567cd1355c7eea25425ddc456",
  "js/components/BiologyCoherenceOverview.svelte": "7c25139080e3f5a18e90775ff013a1917d06b57c127fe9b524c0d8ada962d3e6",
  "js/components/BiologyContributors.svelte": "3aa24f546b458c525f1da20b210f4a8d3231289ef98f666a96bdb4f972f3d342",
  "js/components/BiologySummaryHero.svelte": "120b8656fde76ed284abad792c2edea666afc3dcfa0da3cd154aa676b79a73e5",
  "js/components/BiologyContextBanner.svelte": "15c0cf9d8bbbd5ad2e9d7a8aafa0b15831519f95cf5aa2e88876c6247e030492",
  "js/components/BiologySummaryCard.svelte": "7ba745db5c6824aa9afdf45abf590a011653ad9a9b9b33455e49cb9f13f082e7",
  "js/components/BiologySummaryInputs.svelte": "b9bbe58ead4f3f6abe0420886eab134913ae776825ce5e52b2daa359f0d01e46",
  "js/components/BiologySummaryStatus.svelte": "2f49f112e9f9c336ac99f60ba9f2acf4eef69b386cf17e89dc26a69ffee3d6d1"
};
const builderURL = pathToFileURL(path.resolve('scripts/build-svelte.mjs')).href;
const registrations: unknown = JSON.parse(execFileSync(process.execPath, [
  '--max-old-space-size=512', '--input-type=module', '--eval',
  `import {HTML_COMPONENTS} from ${JSON.stringify(builderURL)};process.stdout.write(JSON.stringify([...HTML_COMPONENTS]));`,
], { cwd: process.cwd(), encoding: 'utf8', timeout: 10_000, maxBuffer: 16_384 }));
const components = ['BiologyDashboardScore', 'BiologyDashboardCoherence', 'BiologySummaryWidget'] as const;

function qualifyReference() {
  expect(JSON.parse(fs.readFileSync('node_modules/svelte/package.json', 'utf8')).version).toBe('5.57.1');
  for (const [file, pin] of Object.entries(pins)) {
    expect(sha(fs.readFileSync(file, 'utf8')), file).toBe(pin);
  }
  expect(Array.isArray(registrations)).toBe(true);
  if (!Array.isArray(registrations)) throw new Error('Expected actual HTML_COMPONENTS array');
  for (const name of components) {
    expect(registrations.filter(value => value === name), name).toEqual([name]);
  }
}

function reference(input: Input): string {
  return input.kind === 'widget' ? summary(input) : overview(input);
}

function direct(input: Input): string {
  switch (input.kind) {
    case 'dashboard-score': return scoreHTML({ view: input.view });
    case 'dashboard-coherence': return coherenceHTML({ view: input.view });
    case 'widget': return widgetHTML({ view: input.view });
  }
}
const arm: Record<Input['kind'], number> = { 'dashboard-score': 1, 'dashboard-coherence': -1, widget: 0 };

/** Expected-only mapping for the closed, hash-pinned single-if dispatchers.
 * Svelte 5.57.1 adds one selected-arm pair inside render().body's root pair.
 * Direct children lose ONLY that exact outer pair. Actual bytes are untouched;
 * every inner anchor, attribute, action, style, space and child remains exact. */
function expectedDirect(rawReference: string, kind: Input['kind']): string {
  const prefix = `<!--[--><!--[${arm[kind]}-->`, suffix = '<!--]--><!--]-->';
  if (!rawReference.startsWith(prefix) || !rawReference.endsWith(suffix)) {
    throw new Error('Unqualified Biology dispatcher framing');
  }
  return '<!--[-->' + rawReference.slice(prefix.length, -suffix.length) + '<!--]-->';
}

const overviewFixture = JSON.parse(fs.readFileSync('tests/fixtures/biology-overview-original.json', 'utf8')) as {
  samples: OverviewSample[];
};
const summaryFixture = JSON.parse(fs.readFileSync('tests/fixtures/biology-summary-original.json', 'utf8')) as {
  samples: SummarySample[];
};
const witnesses: Array<{ name: string; input: Input }> = [];
for (const sample of overviewFixture.samples) {
  if (sample.kind === 'coherence' || !sample.score) continue;
  witnesses.push({
    name: sample.kind + '/' + sample.name,
    input: sample.kind === 'dashboard-score'
      ? { kind: sample.kind, view: projectBiologyDashboardScore(sample.score) }
      : { kind: sample.kind, view: projectBiologyDashboardCoherence(sample.score) },
  });
}
for (const sample of summaryFixture.samples) {
  if (sample.kind !== 'widget') continue;
  const scores = sample.records.map(record => record.nonFiniteScore ? { ...record.score, score: NaN } : record.score);
  witnesses.push({
    name: 'widget/' + sample.name,
    input: { kind: 'widget', view: projectBiologySummaryWidget(scores) },
  });
}
const hostile = '<svg data-foreign onload="attack()">Literal & private</svg>';
const hostileHeadline = {
  id: hostile, title: hostile, value: hostile, status: hostile, meta: hostile,
  detail: hostile, width: '0', color: 'var(--text-muted)',
};
witnesses.push({
  name: 'dashboard-score/hostile',
  input: { kind: 'dashboard-score', view: hostileHeadline },
});
witnesses.push({
  name: 'dashboard-coherence/hostile-linked-neutral',
  input: {
    kind: 'dashboard-coherence',
    view: {
      headline: hostileHeadline,
      domains: [
        { id: hostile, label: hostile, title: hostile, width: 0, value: 0, color: 'var(--text-muted)', tone: 'good' },
        { id: '', label: hostile, title: hostile, width: 100, value: 100, color: 'var(--green)', tone: 'poor' },
      ],
    },
  },
});
witnesses.push({
  name: 'widget/hostile-all-fields',
  input: {
    kind: 'widget',
    view: {
      hero: { lead: hostile, count: hostile, labels: [hostile], lens: false },
      cards: [{
        id: hostile, title: hostile, kicker: hostile, summary: hostile, tone: 'good', value: hostile, pin: 0,
        statuses: [{ kind: 'tone', label: hostile, value: hostile, tone: 'good' }],
        seen: [{ id: hostile, label: hostile, title: hostile }],
        missing: [{ id: null, label: hostile, title: hostile }], extraMissing: 2,
      }],
    },
  },
});

it('qualifies both complete untouched authored dispatcher graphs, original fixtures, SDK and exact new registrations', qualifyReference);
for (const { name, input } of witnesses) {
  it(`${name}: whole direct HTML equals the exact original selected child bytes`, () => {
    qualifyReference();
    const before = structuredClone(input), rawReference = reference(input), actual = direct(input);
    expect(actual).toBe(expectedDirect(rawReference, input.kind));
    expect(input).toEqual(before);
    const host = document.createElement('div');
    host.innerHTML = actual;
    expect(host.querySelector('svg,img,script,[onload],[onerror],[data-foreign]')).toBeNull();
    const receipts = process.env['GETBASED_BIOLOGY_DASHBOARD_LEAF_RECEIPTS'];
    if (receipts) {
      fs.mkdirSync(receipts, { recursive: true });
      fs.writeFileSync(path.join(receipts, name.replaceAll('/', '-') + '.json'), JSON.stringify({
        input: before, rawReference, actual, expected: expectedDirect(rawReference, input.kind),
      }, null, 2) + '\n');
    }
  });
}

it('finite expected-only framing rejects wrong arms, missing root anchors and extra bytes for every selected arm', () => {
  for (const kind of ['dashboard-score', 'dashboard-coherence', 'widget'] as const) {
    const input = witnesses.find(row => row.input.kind === kind)!.input, raw = reference(input);
    for (const changed of [raw.replace(`<!--[${arm[kind]}-->`, '<!--[77-->'), raw.slice(8), raw + '<!--extra-->']) {
      expect(() => expectedDirect(changed, kind)).toThrow('Unqualified Biology dispatcher framing');
    }
  }
});

it('complete direct comparison rejects changed class, action, attribute, text, style and child comment', () => {
  const input = witnesses.find(row => row.name === 'dashboard-coherence/hostile-linked-neutral')!.input;
  const actual = direct(input), expected = expectedDirect(reference(input), input.kind);
  const pairs = [
    ['gb:biology-overview:', 'changed:biology:'],
    ['data-biology-score-action="jump-to-domain"', 'data-biology-score-action="wrong"'],
    ['type="button"', 'type="submit"'],
    ['Literal &amp; private', 'Changed &amp; private'],
    ['var(--text-muted)', 'var(--red)'],
    ['<!--]-->', '<!--changed-->'],
  ] as const;
  expect(actual).toBe(expected);
  for (const [before, after] of pairs) {
    expect(actual).toContain(before);
    const corrupt = actual.replace(before, after);
    expect(corrupt).not.toBe(actual);
    expect(() => expect(corrupt).toBe(expected)).toThrow();
  }
});

it('the real controller changes only three renderer imports and their exact selected-arm calls', () => {
  const source = fs.readFileSync('js/biology-score-dashboard.ts', 'utf8');
  for (const name of components) expect(source).toContain(`from './components/${name}.svelte.html.js'`);
  expect(source).not.toContain('BiologyOverviewPresentation.svelte.html.js');
  expect(source).not.toContain('BiologySummaryPresentation.svelte.html.js');
  const restored = source
    .replace("import { renderHTML as renderDashboardScore } from './components/BiologyDashboardScore.svelte.html.js';\nimport { renderHTML as renderDashboardCoherence } from './components/BiologyDashboardCoherence.svelte.html.js';", "import { renderHTML as renderOverview } from './components/BiologyOverviewPresentation.svelte.html.js';")
    .replace("from './components/BiologySummaryWidget.svelte.html.js'", "from './components/BiologySummaryPresentation.svelte.html.js'")
    .replace('renderDashboardScore({ view })', "renderOverview({ kind: 'dashboard-score', view })")
    .replace('renderDashboardCoherence({ view })', "renderOverview({ kind: 'dashboard-coherence', view })")
    .replace('renderSummary({ view: projectBiologySummaryWidget(scores) })', "renderSummary({ kind: 'widget', view: projectBiologySummaryWidget(scores) })");
  expect(sha(restored)).toBe('a691cc89b53dc2c74dd292d6dca6442dfb1c8994a2cb6a544e5f9f7c667f3303');
});

interface GraphModule { id: string; renderedLength?: number }
interface GraphChunk {
  file: string;
  facadeModuleId?: string | null;
  imports: string[];
  modules: GraphModule[];
}
interface GraphReceipt extends ActualRetryGraph { chunks: GraphChunk[] }

function requireOptimizedGraph(graph: GraphReceipt, kind: 'native' | 'kit') {
  const byName = new Map(graph.chunks.map(chunk => [chunk.file, chunk]));
  expect(byName.size).toBe(graph.chunks.length);
  const main = graph.chunks.filter(chunk => chunk.facadeModuleId?.endsWith('/js/main.js'));
  expect(main).toHaveLength(1);
  const seen = new Set<string>();
  function visit(file: string) {
    if (seen.has(file)) return;
    const chunk = byName.get(file);
    if (!chunk) throw new Error('Missing actual startup chunk ' + file);
    seen.add(file);
    for (const name of chunk.imports) {
      if (byName.has(name)) visit(name);
      else expect(name).toMatch(/^(?:\.\.\/|\/)vendor\/(?:ehbp-browser|tinfoil-browser)\.js$/);
    }
  }
  visit(main[0]!.file);
  const retained = (chunks: GraphChunk[]) => chunks.flatMap(chunk => chunk.modules
    .filter(module => module.renderedLength === undefined || module.renderedLength > 0)
    .map(module => module.id));
  const initial = retained([...seen].map(file => byName.get(file)!)), all = retained(graph.chunks);
  expect(initial.length).toBeGreaterThan(100);
  for (const name of [
    'BiologyOverviewPresentation', 'BiologySummaryPresentation', 'BiologyCompatibilityLens',
    'BiologyCoherenceOverview', 'BiologyScoreDetail', 'BiologyMethodology', 'BiologyCoveragePlanner', 'BiologyNextChecks',
  ]) {
    expect(initial.some(id => id.includes('getbased:svelte:html:') && id.endsWith('/' + name + '.svelte.compiled.js')),
      `${kind}: cold-only HTML ${name}`).toBe(false);
  }
  for (const name of ['biology-card', 'biology-ai', 'biology-reading', 'biology-planning']) {
    expect(initial.some(id => id.endsWith('/' + name + '-classes.js')), `${kind}: page-only catalog ${name}`).toBe(false);
  }
  for (const name of components) {
    expect(initial.some(id => id.includes('getbased:svelte:html:') && id.endsWith('/' + name + '.svelte.compiled.js')),
      `${kind}: selected leaf stays behind the composition boundary ${name}`).toBe(false);
    expect(all.some(id => id.includes('getbased:svelte:html:') && id.endsWith('/' + name + '.svelte.compiled.js')),
      `${kind}: genuine selected leaf remains in the complete lazy graph ${name}`).toBe(true);
  }
  for (const name of [
    'BiologyScoresPage', 'BiologyScoreGroup', 'BiologyScoreDetail', 'BiologyCoherenceOverview',
    'BiologyNextChecks', 'BiologyCoveragePlanner', 'BiologyContextPresentation', 'LensPageHeader', 'LabDateRange',
  ]) {
    expect(all.some(id => id.includes('getbased:svelte:html:') && id.endsWith('/' + name + '.svelte.compiled.js')),
      `${kind}: complete genuine lazy Biology page ${name}`).toBe(true);
  }
  for (const name of ['BiologyOverviewPresentation', 'BiologySummaryPresentation', 'BiologyCompatibilityLens']) {
    expect(all.some(id => id.includes('getbased:svelte:html:') && id.endsWith('/' + name + '.svelte.compiled.js')),
      `${kind}: unreachable legacy umbrella ${name}`).toBe(false);
  }
  requireActualRetry(graph, kind, 'biology-page-view.js');
}

// Artifact checks run only when explicitly supplied real build receipts. Unit
// source checks and direct-owner parity never claim to prove bundle placement.
const graphPaths = process.env['GETBASED_BIOLOGY_DASHBOARD_GRAPH_RECEIPTS'];
if (graphPaths) {
  for (const kind of ['native', 'kit'] as const) {
    it(`${kind}: actual startup excludes full-page HTML while genuine selected leaves, full lazy page and independent retries remain`, () => {
      const paths: Record<'native' | 'kit', string> = JSON.parse(graphPaths);
      expect(typeof paths[kind]).toBe('string');
      requireOptimizedGraph(JSON.parse(fs.readFileSync(paths[kind], 'utf8')), kind);
    });
  }
}
