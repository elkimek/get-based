// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHTML } from '../js/components/LightPagePresentation.svelte.html.js';
import { projectLightSessionActions, projectLightUVSafety, type LightPagePresentationProps } from '../js/light-page-presentation.js';
function host(props: LightPagePresentationProps) { const element = document.createElement('div'); element.innerHTML = renderHTML(props); return element; }
describe('authored Light page presentation', () => {
  for (const sunActive of [false, true]) for (const deviceActive of [false, true]) for (const hasDevices of [false, true]) {
    it(`offers only available session starts: sun=${sunActive}, device=${deviceActive}, devices=${hasDevices}`, () => {
      const view = projectLightSessionActions({ sunActive, deviceActive, hasDevices, totalSessions: 0 });
      const rendered = host({ kind: 'actions', view });
      const actions = [...rendered.querySelectorAll('button')].map(button => button.dataset.lightPageAction);
      expect(actions).toEqual([...(sunActive ? [] : ['quick-log-sun']), ...(deviceActive ? [] : [hasDevices ? 'quick-log-device' : 'open-add-device']), 'open-detailed-session']);
      expect([...rendered.querySelectorAll('button')].every(button => button.type === 'button')).toBe(true);
      expect(rendered.querySelector('.light-summary-tally')?.textContent).toBe('No sessions yet');
      expect(host({ kind: 'actions', view: projectLightSessionActions({ sunActive, deviceActive, hasDevices, totalSessions: 1 }) }).querySelector('.light-summary-tally')).toBeNull();
    });
  }
  for (const [dose, title, tone] of [[0, 'Modeled UV dose today: low', 'info'], [0.3, 'Moderate modeled UV dose today', 'info'], [0.7, 'Approaching base MED reference', 'warn'], [1, 'Base MED reference reached', 'over']] as const) {
    it(`retains UV safety thresholds and uncertainty at ${dose}`, () => {
      const view = projectLightUVSafety(dose, 0.7);
      expect(view.title).toBe(title); expect(view.tone).toBe(tone);
      expect(view.percent).toBe(Math.round(dose * 100));
      const rendered = host({ kind: 'safety', view });
      expect(rendered.querySelector('section')?.getAttribute('aria-label')).toBe('UV safety today');
      expect(rendered.querySelector('.light-med-carryover') !== null).toBe(dose > 0);
      expect(rendered.querySelector('.light-med-title')?.textContent).toContain(title);
      if (dose === 1) expect(rendered.querySelector('.light-med-sub')?.textContent).toContain('Stop UV exposure');
    });
  }
  it('renders literal prompt and location values without accepting markup', () => {
    const literal = '<img src=x onerror=alert(1)> & "';
    const rendered = host({ kind: 'prompt', view: { status: literal, label: literal, hint: literal, action: literal, extraClass: literal } });
    expect(rendered.querySelector('strong')?.textContent).toBe(literal);
    expect(rendered.querySelector('button')?.textContent).toBe(literal);
    expect(rendered.querySelector('button')?.dataset.lightPageAction).toBe(literal);
    expect(rendered.querySelector('img,script,[onclick]')).toBeNull();
    const location = host({ kind: 'location', country: true, latitude: literal });
    expect(location.textContent).toContain(literal);
    expect(location.querySelector('img,script')).toBeNull();
    expect(location.querySelector('button')?.dataset.lightPageAction).toBe('request-precise-location');
    expect(location.querySelector('a[href="#"]')).toBeNull();
  });
  it('keeps methods collapsed, literal skin metadata and the separately owned source controls', () => {
    const rendered = host({ kind: 'methods', skinBasis: 'Fitzpatrick <literal> & retained', dataSource:{officialHost:true,options:[{mode:'auto',label:'Automatic',description:'Native source',checked:true},{mode:'selfhost',label:'Own relay',description:'Private source',checked:false},{mode:'offline',label:'Offline',description:'Local source',checked:false}],showSelfhost:false,url:'',bearer:'',rounding:true} });
    expect([...rendered.querySelectorAll('details')].every(details => !details.open)).toBe(true);
    expect(rendered.querySelector('.light-explainer-body')?.textContent).toContain('Fitzpatrick <literal> & retained');
    expect(rendered.querySelectorAll('.light-data-source-body [data-sun-source-action="set-meteo-mode"]')).toHaveLength(3);
    expect([...rendered.querySelectorAll<HTMLInputElement>('.light-data-source-body input[type="radio"]')].map(input=>[input.value,input.checked])).toEqual([['auto',true],['selfhost',false],['offline',false]]);
    expect(rendered.querySelectorAll('a[target="_blank"]')).toHaveLength(6);
    expect([...rendered.querySelectorAll('a')].every(anchor => anchor.rel === 'noopener')).toBe(true);
    expect(rendered.querySelector('.light-explainer-body')?.textContent).toContain('never stay longer just to raise an estimate');
    expect(host({ kind: 'methods', skinBasis: '', dataSource:null }).querySelector('.light-data-source-details')).toBeNull();
  });
  it('announces loading and preserves child renderers and session target wrappers', () => {
    const loading = host({ kind: 'loading', id: 'light-devices-slot-1', label: 'Loading devices...' });
    expect(loading.querySelector('[role="status"]')?.id).toBe('light-devices-slot-1');
    const live = host({ kind: 'live', sun: true, sunView:{kind:'row',view:{kind:'sun',id:'sun',name:'Sunlight',date:'Native date',time:'',duration:'1 min',ariaLabel:'Sun details',vitaminD:'',mode:null,warning:null}},deviceView:{kind:'active',view:{kind:'device',id:'device',date:'Native device date',elapsed:'1 min',ariaLabel:'Active device session',body:'Native exposure',eyes:'',directEye:false,suffix:'',paused:false,rotated:false,forgotHours:null,readouts:[],chips:null}} });
    expect(live.querySelector('[aria-label="Active sun session"] [data-sun-session-id]')?.getAttribute('data-sun-session-id')).toBe('sun');
    expect(live.querySelector('[aria-label="Active device session"] [data-light-active-presentation]')?.getAttribute('data-id')).toBe('device');
  });
  it('escapes dashboard pill metadata and preserves explicit channel routing', () => {
    const literal = '<img src=x onerror=alert(1)> & "';
    const rendered = host({ kind: 'pills', pills: [{
      key: literal, name: literal, icon: literal, title: literal, label: literal,
      active: true, days: literal, chart: { bars: [{ x: 0, empty: true, sunHeight: 0, deviceHeight: 0 }] },
    }] });
    const button = rendered.querySelector('button')!;
    expect(button.dataset.lightPageAction).toBe('open-channel');
    expect(button.dataset.channel).toBe(literal);
    expect(button.getAttribute('aria-label')).toBe(literal);
    expect(button.title).toBe(literal);
    expect(button.querySelector('.light-pill-label')?.textContent).toBe(literal);
    expect(button.querySelector('.light-pill-icon')?.textContent).toBe(literal);
    expect(button.querySelector('.light-pill-daycount')?.textContent).toBe(literal);
    expect(button.querySelector('img,script,[onerror]')).toBeNull();
    expect(button.querySelectorAll('svg[aria-hidden="true"] rect')).toHaveLength(1);
  });

});
