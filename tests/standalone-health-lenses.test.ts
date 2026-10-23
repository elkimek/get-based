// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {createLensPageHandlers} from '../js/lens-pages.js';
import {getLensContentGrid} from '../js/lens-page-shell-core.js';
import {state} from '../js/state.js';
import {buildSidebar,filterSidebar} from '../js/nav.js';
import {configureNavRuntime} from '../js/nav-runtime.js';

const features=vi.hoisted(()=>({nutrition:vi.fn(()=>null),fuel:vi.fn(()=>null),supplements:vi.fn(()=>null),cycle:vi.fn(()=>null)}));
vi.mock('../js/health-data-loader.js',async original=>({...await original<typeof import('../js/health-data-loader.js')>(),
  projectNutritionWidget:features.nutrition,projectFuelWidget:features.fuel,projectSupplementsSection:features.supplements,projectMenstrualCycleSection:features.cycle}));
const before={profileSex:state.profileSex,currentView:state.currentView,importedData:state.importedData};
afterEach(()=>{Object.assign(state,before);document.body.replaceChildren();vi.clearAllMocks();});

it('gives each health feature its own page and keeps Body focused on biometrics and cycle',()=>{
  document.body.innerHTML='<main id="main-content"></main>';
  state.profileSex='female';
  const pages:Record<string,string[]>={};
  const handlers=createLensPageHandlers({projectDashboardWearableTilesWidget:()=>null,
    getLensContentGrid:(route:string,widgets:Parameters<typeof getLensContentGrid>[1])=>{
      pages[route]=widgets.map(widget=>widget.id);return {route,orderKey:route,widgets:[]};
    }});
  handlers.showBodyLens();expect(document.querySelector('h2')?.textContent).toBe('Biometrics');expect(pages.body).toEqual(['wearables','body-sources','cycle']);
  expect(features.nutrition).not.toHaveBeenCalled();expect(features.supplements).not.toHaveBeenCalled();
  handlers.showNutritionLens();expect(pages.nutrition).toEqual(['nutrition','nutrition-fuel-mix']);
  expect(document.querySelector('h2')?.textContent).toBe('Nutrition');
  expect(features.nutrition).toHaveBeenCalledOnce();expect(features.fuel).toHaveBeenCalledOnce();
  handlers.showSupplementsLens();expect(pages.supplements).toEqual(['supplements']);
  expect(document.querySelector('h2')?.textContent).toBe('Supplements & Medication');
  expect(features.supplements).toHaveBeenCalledOnce();
});

it('makes both lenses discoverable with no saved data and while searching markers',()=>{
  document.body.innerHTML='<aside id="sidebar-nav"></aside>';
  const navigate=vi.fn();const restore=configureNavRuntime({navigate});
  try {
    buildSidebar({dates:[],categories:{}});
    const lensHeading=[...document.querySelectorAll('.nav-section')].find(el=>el.textContent==='Lenses')!;
    const labels:string[]=[];
    for(let item=lensHeading.nextElementSibling;item&&!item.classList.contains('nav-section');item=item.nextElementSibling){
      labels.push(item.querySelector('.nav-item-label')?.textContent||'');
    }
    expect(labels).toEqual(['Labs','Biology Scores','Biometrics','Nutrition','Supplements & Meds','Light','Genome','Insight','Tips']);
    expect(document.querySelector('[data-nav-route="body"]')?.textContent).toContain('Biometrics');
    const search=document.getElementById('sidebar-search') as HTMLInputElement;
    search.value='not-a-marker';filterSidebar();
    for(const route of ['nutrition','supplements']){
      const control=document.querySelector<HTMLElement>(`[data-nav-route="${route}"]`)!;
      expect(control.style.display).toBe('');expect(control.tabIndex).toBe(0);
      control.click();expect(navigate).toHaveBeenLastCalledWith(route);
    }
  }finally{configureNavRuntime(restore);}
});
