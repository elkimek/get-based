// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
const ports=vi.hoisted(()=>({
  today:vi.fn(()=>null),
  conditions:vi.fn((options?:{variant?:unknown;slotId?:unknown})=>{void options;return {kind:'widget' as const,hasLocation:false,slot:{id:'conditions',variant:'full',view:null}};}),
  channels:vi.fn((count:number)=>({kind:'dashboard-channels' as const,lead:String(count),pills:[]})),
  actions:vi.fn(()=>({kind:'actions' as const,view:{actions:[],empty:true}})),
  live:vi.fn((options?:{includeEmptyState?:unknown})=>{void options;return null;}),
}));
vi.mock('../js/app-light-sun-modules.js',()=>({getLightTodayHeroView:ports.today,getLightConditionsWidgetView:ports.conditions,getDashboardLightChannelsWidgetView:ports.channels,getLightSessionLogActionsView:ports.actions,getLightLiveSessionView:ports.live}));
import {loadLightSunModules,getLoadedLightTodayHeroView,getLoadedLightConditionsWidgetView,getLoadedDashboardLightChannelsWidgetView,getLoadedLightSessionLogActionsView,getLoadedLightLiveSessionView} from '../js/light-sun-loader.js';
it('keeps all five typed ports null until the original lazy module load completes',async()=>{
  expect(getLoadedLightTodayHeroView()).toBeNull();expect(getLoadedLightConditionsWidgetView()).toBeNull();expect(getLoadedDashboardLightChannelsWidgetView(3)).toBeNull();expect(getLoadedLightSessionLogActionsView()).toBeNull();expect(getLoadedLightLiveSessionView()).toBeNull();
  expect(ports.conditions).not.toHaveBeenCalled();await loadLightSunModules();
  const conditions={variant:'full',slotId:'cond-now-dashboard-widget'};const live={includeEmptyState:true};
  expect(getLoadedLightTodayHeroView()).toBeNull();expect(getLoadedLightConditionsWidgetView(conditions)).toBe(ports.conditions.mock.results[0]?.value);
  expect(ports.conditions.mock.calls[0]?.[0]).toBe(conditions);
  expect(getLoadedDashboardLightChannelsWidgetView(3)).toEqual({kind:'dashboard-channels',lead:'3',pills:[]});expect(ports.channels).toHaveBeenCalledExactlyOnceWith(3);
  expect(getLoadedLightSessionLogActionsView()).toBe(ports.actions.mock.results[0]?.value);
  expect(getLoadedLightLiveSessionView(live)).toBeNull();expect(ports.live.mock.calls[0]?.[0]).toBe(live);
});
