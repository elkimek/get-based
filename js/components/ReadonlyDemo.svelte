<script lang="ts">
  import type {DemoProfile, DemoSeries} from '../readonly-demo-model.js';
  import {sparkline} from '../readonly-demo-model.js';
  let {profiles}: {profiles: DemoProfile[]} = $props();
  const lenses = [
    {id: 'Labs', icon: '◒', detail: 'Biomarkers over time'},
    {id: 'Genome', icon: '⌘', detail: 'Genetic context'},
    {id: 'Body', icon: '◷', detail: 'Everyday measurements'},
    {id: 'Light', icon: '☀', detail: 'Sun and environment'},
    {id: 'Insight', icon: '✧', detail: 'The bigger picture'},
  ];
  let profileIndex = $state(0), lens = $state('Labs'), seriesId = $state('biochemistry.glucose');
  const profile = $derived(profiles[profileIndex]!);
  const series = $derived(lens === 'Body' ? profile.body : profile.labs);
  const selected = $derived(series.find(item => item.id === seriesId) ?? series[0]!);
  const latest = (item: DemoSeries) => item.points.at(-1)!;
  const number = (value: number) => new Intl.NumberFormat('en', {maximumFractionDigits: 2}).format(value);
  function chooseLens(value: string) {lens = value; seriesId = value === 'Body' ? 'weight' : 'biochemistry.glucose';}
</script>

<a class="skip" href="#demo-content">Skip to content</a>
<div class="demo-layout">
  <aside class="sidebar">
    <a class="wordmark" href="https://getbased.health" aria-label="getbased home">getbased</a>
    <span class="demo-label">PUBLIC DEMO</span>
    <nav aria-label="Health lenses">
      {#each lenses as item}
        <button class:active={lens === item.id} aria-pressed={lens === item.id} onclick={() => chooseLens(item.id)}>
          <span class="lens-icon" aria-hidden="true">{item.icon}</span><span><strong>{item.id}</strong><small>{item.detail}</small></span>
        </button>
      {/each}
    </nav>
    <div class="sidebar-bottom"><p>Your health data.<br />Your own installation.</p><a class="primary" href="https://docs.getbased.health/guides/self-hosting">Set up getbased <span aria-hidden="true">↗</span></a></div>
  </aside>
  <div class="workspace">
    <header class="demo-bar"><span><span class="sample-dot" aria-hidden="true"></span> Fictional data · read-only demo</span><a href="https://app.getbased.health/app/migration.html">Recover existing data <span aria-hidden="true">↗</span></a></header>
    <main id="demo-content" tabindex="-1">
      <div class="page-heading"><div><p class="eyebrow">FIVE LENSES. ONE PICTURE.</p><h1>{lens}</h1><p class="intro">Explore how getbased brings your health history together.</p></div><div class="profile-picker" role="group" aria-label="Sample profile">{#each profiles as item, index}<button aria-pressed={index === profileIndex} onclick={() => {profileIndex = index;}}>{item.label}</button>{/each}</div></div>
      <section class="sample-summary" aria-label="Sample profile summary"><div><span class="avatar" aria-hidden="true">{profile.id === 'female' ? 'F' : 'M'}</span><div><h2>{profile.label}</h2><p>{profile.description}</p></div></div><dl><div><dt>Lab dates</dt><dd>{profile.drawCount}</dd></div><div><dt>Biomarkers</dt><dd>{profile.markerCount}</dd></div><div><dt>Sample SNPs</dt><dd>{profile.snps.length}</dd></div></dl></section>
      {#if lens === 'Labs' || lens === 'Body'}
        <p class="section-label">{lens === 'Labs' ? 'A few markers from the sample history' : 'Recorded measurements'}</p>
        <div class="metric-grid">{#each series as item}<button class="metric" class:selected={selected.id === item.id} aria-pressed={selected.id === item.id} onclick={() => {seriesId = item.id;}}><span>{item.label}</span><strong>{number(latest(item).value)} <small>{item.unit}</small></strong><span class="metric-date">{latest(item).date}</span></button>{/each}</div>
        <section class="panel chart-panel" aria-label={selected.label + ' history'}><div class="panel-heading"><div><p class="eyebrow">RECORDED HISTORY</p><h2>{selected.label}</h2></div><span class="muted">{selected.points.length} readings · {selected.unit}</span></div>
          <svg class="chart" viewBox="0 0 600 152" role="img" aria-label={selected.label + ' sample trend; exact readings are in the table below'}><line x1="16" y1="26" x2="584" y2="26" /><line x1="16" y1="76" x2="584" y2="76" /><line x1="16" y1="126" x2="584" y2="126" /><polyline points={sparkline(selected.points)} /></svg>
          <div class="chart-dates"><span>{selected.points[0]!.date}</span><span>{latest(selected).date}</span></div><p class="chart-note">The chart fits the recorded values. It does not show a reference range or a treatment target.</p>
          <div class="table-scroll"><table><caption class="sr-only">Exact {selected.label} sample readings</caption><thead><tr><th scope="col">Date</th><th scope="col">Reading ({selected.unit})</th></tr></thead><tbody>{#each [...selected.points].reverse() as point}<tr><td>{point.date}</td><td>{number(point.value)}</td></tr>{/each}</tbody></table></div>
        </section>
      {:else if lens === 'Genome'}
        <section class="panel"><div class="panel-heading"><div><p class="eyebrow">GENETIC CONTEXT</p><h2>A small SNP sample</h2></div></div><p class="muted">These fictional genotypes illustrate the data view. A genotype alone does not establish a diagnosis or explain a lab result.</p><div class="table-scroll"><table><thead><tr><th scope="col">Gene</th><th scope="col">SNP</th><th scope="col">Genotype</th><th scope="col">Variant label</th></tr></thead><tbody>{#each profile.snps as snp}<tr><td><strong>{snp.gene}</strong></td><td>{snp.rsid}</td><td><span class="genotype">{snp.genotype}</span></td><td>{snp.variant}</td></tr>{/each}</tbody></table></div></section>
      {:else if lens === 'Light'}
        <section class="panel"><div class="panel-heading"><div><p class="eyebrow">SUN HISTORY</p><h2>Time outdoors, in context</h2></div><span class="muted">{profile.sessions.length} sample sessions</span></div><p class="muted">The full application tracks sun sessions, devices and your light environment. These are fictional recorded sessions, not exposure recommendations.</p><div class="table-scroll"><table><thead><tr><th scope="col">Date</th><th scope="col">Duration</th><th scope="col">Recorded UV index</th></tr></thead><tbody>{#each profile.sessions as session}<tr><td>{session.date}</td><td>{session.minutes} min</td><td>{session.uvIndex ?? '—'}</td></tr>{/each}</tbody></table></div></section>
      {:else}
        <section class="panel insight-intro"><p class="eyebrow">CONTEXT ACROSS LENSES</p><h2>A history worth keeping together</h2><p>Lab values, measurements, genetics and dated notes can be reviewed side by side in your own installation. AI chat and provider connections are available there; this public demo makes no AI requests.</p></section>
        <section class="panel"><div class="panel-heading"><h2>Notes from the fictional profile</h2><span class="muted">Sample records</span></div><ol class="timeline">{#each profile.notes as note}<li><time datetime={note.date}>{note.date}</time><p>{note.text}</p></li>{/each}</ol><p class="chart-note">These notes belong to the fictional fixture and are not guidance for your own care.</p></section>
      {/if}
      <div class="demo-footer"><p>This demo cannot import or save personal data. To use your own records, install getbased on a computer or server you control.</p><a href="https://docs.getbased.health/guides/self-hosting">Read the installation guide <span aria-hidden="true">→</span></a></div>
    </main>
    <footer><a href="https://getbased.health">About getbased</a><a href="https://getbased.health/privacy.html">Privacy</a><a href="https://getbased.health/terms.html">Terms</a><a href="https://github.com/elkimek/get-based">Source code</a></footer>
  </div>
</div>
