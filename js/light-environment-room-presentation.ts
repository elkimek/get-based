import type{EnvironmentAIView}from'./light-environment-ai-presentation.js';
import type { LightAuditBlockView } from './light-audit-presentation.js';
// Pure room presentation. Domain reads, callbacks and mutations belong to the adapter.
import type { EnvironmentRoomOperations, EnvironmentScreenReader, EnvironmentMeasurementOperations, EnvironmentSeverity } from '../types/light-env-view.js';
import type { EnvironmentScreenView, EnvironmentTodayView, ScreenOptionView } from './light-environment-screen-presentation.js';
import type { EnvironmentSummaryView } from './light-environment-summary-presentation.js';
import { PRIMARY_SOURCES, DAYLIGHT_LEVELS, SOURCE_ARCHETYPES, HOURS_BUCKETS, EVENING_BUCKETS, activeSourceArchetype, activeHoursBucket, activeEveningBucket } from './light-env-model.js';
import { roomUsesEveningAfterSunset } from './light-env-evening.js';
export const environmentText = (value: unknown) => value == null ? '' : String(value);
export const environmentActionValue = (value: unknown) => value == null || value === '' || value === false ? undefined : String(value);
export interface EnvironmentPickerView {
  readonly label: string; readonly action: string; readonly id: string | undefined;
  readonly choices: readonly { readonly key: string; readonly label: string; readonly selected: boolean }[];
  readonly help: string;
  readonly reveal: null | { readonly kind: 'source'; readonly open: boolean; readonly options: readonly ScreenOptionView[] } | { readonly kind: 'hours'; readonly value: string };
}
export interface EnvironmentQuickPicksView {
  readonly screen: boolean; readonly label: string; readonly roomId: string | undefined;
  readonly choices: readonly { readonly label: string; readonly name?: string; readonly device?: string }[];
}
export interface EnvironmentRoomView {
  readonly id: string; readonly actionId: string | undefined; readonly name: string; readonly nameInput: string;
  readonly expanded: boolean; readonly active: boolean; readonly severity: string; readonly status: string; readonly statusTitle: string;
  readonly disclosureLabel: string; readonly signals: readonly string[]; readonly today: EnvironmentTodayView;
  readonly body: null | {
    readonly pickers: readonly EnvironmentPickerView[];
    readonly tools: readonly { readonly key: string; readonly label: string; readonly title: string }[];
    readonly readings: readonly { readonly icon: string; readonly value: string; readonly time: string; readonly ai: Readonly<EnvironmentAIView> | null }[];
    readonly ai: Readonly<EnvironmentAIView> | null; readonly screenHeading: string; readonly screenEmpty: string;
    readonly screens: readonly EnvironmentScreenView[]; readonly quickPicks: EnvironmentQuickPicksView;
  };
}
export interface EnvironmentSectionView {
  readonly embedded: boolean; readonly load: Extract<EnvironmentSummaryView,{readonly kind:'load'}>;
  readonly rooms: readonly EnvironmentRoomView[]; readonly roomQuickPicks: EnvironmentQuickPicksView;
  readonly portable: readonly EnvironmentScreenView[]; readonly portableQuickPicks: EnvironmentQuickPicksView;
  readonly empty: boolean; readonly audits: LightAuditBlockView | null;
}
export function projectRoomPickers(room: EnvironmentRoomOperations): EnvironmentPickerView[] {
  const id=environmentActionValue(room.id),source=activeSourceArchetype(room.primarySource);
  const hours=(activeHoursBucket as (value:unknown)=>ReturnType<typeof activeHoursBucket>)(room.hoursOccupiedPerDay);
  const evening=(activeEveningBucket as (room:EnvironmentRoomOperations)=>ReturnType<typeof activeEveningBucket>)(room);
  return [
    {label:'Light source',action:'set-room-source-archetype',id,help:'',choices:SOURCE_ARCHETYPES.map(item=>({key:item.key,label:`${item.emoji} ${item.label}`,selected:source===item.key})),reveal:{kind:'source',open:!source,options:PRIMARY_SOURCES.map(item=>({value:item.key,label:item.label,selected:room.primarySource===item.key}))}},
    {label:'Daylight reaching this room',action:'set-room-daylight-level',id,help:'Think about the hours you are usually here, not the best moment of the day.',choices:DAYLIGHT_LEVELS.map(item=>({key:item.key,label:item.label,selected:room.daylightLevel===item.key})),reveal:null},
    {label:'Time you spend here',action:'set-room-hours-bucket',id,help:'',choices:HOURS_BUCKETS.map(item=>({key:item.key,label:item.label,selected:hours===item.key})),reveal:{kind:'hours',value:environmentText(room.hoursOccupiedPerDay)}},
    {label:'Time here after sunset',action:'set-room-evening-bucket',id,help:'',choices:EVENING_BUCKETS.map(item=>({key:item.key,label:item.label,selected:evening===item.key})),reveal:null},
  ];
}
const sourceLabels:Record<string,string>={'led-cool':'Cool LED','led-warm':'Warm LED','led-tunable':'Tunable LED',fluorescent:'Fluorescent',incandescent:'Incandescent',halogen:'Halogen',candle:'Candle',mixed:'Mixed','natural-only':'Natural only'};
export function projectRoomHeader(room:EnvironmentRoomOperations,severity:EnvironmentSeverity,expanded:boolean,active:boolean,today:EnvironmentTodayView):EnvironmentRoomView {
  const source=Object.hasOwn(sourceLabels,room.primarySource||'')?sourceLabels[room.primarySource||'']||'':'';
  const hours=room.hoursOccupiedPerDay?`${room.hoursOccupiedPerDay} hr/day`:'';
  const name=room.name||'Room',status=environmentText(severity.label);
  return {id:environmentText(room.id),actionId:environmentActionValue(room.id),name,nameInput:environmentText(room.name),expanded,active,severity:environmentText(severity.color),status,statusTitle:`${severity.label} — ${severity.reason}`,
    disclosureLabel:`${name} — ${severity.label}${hours?', '+hours:''}${source?', '+source:''}${expanded?', expanded':', collapsed'}`,
    signals:[hours,source,roomUsesEveningAfterSunset(room)?'evening':''].filter(Boolean),today,body:null};
}
export function projectRoomScreenContext(name:string) {
  if(/bedroom|sleep/.test(name.toLowerCase()))return {screenHeading:'Screens used in bed',screenEmpty:'If a phone or tablet is used near bedtime, add it here. Timing is useful context; brightness and viewing distance are not measured.',preferred:['phone','tablet','tv']};
  if(/office|study|desk|work/.test(name.toLowerCase()))return {screenHeading:'Screens at this desk',screenEmpty:"Long stretches in front of a laptop or monitor add up. Map them here so daytime exposure isn't overweighted vs evening.",preferred:['laptop','monitor','phone']};
  if(/living|family|den|lounge/.test(name.toLowerCase()))return {screenHeading:'Screens in this room',screenEmpty:'Add a TV or other screen used after sunset so the assessment can include its timing.',preferred:['tv','phone','tablet']};
  return {screenHeading:'Screens used here',screenEmpty:'Map any phone, tablet, laptop, monitor, or TV used in this room.',preferred:['phone','laptop','tv']};
}
const roomNames=['Bedroom','Living room','Kitchen','Office','Bathroom'];
const devices:Record<string,string>={phone:'📱 Phone',laptop:'💻 Laptop',monitor:'🖥 Monitor',tablet:'📲 Tablet',tv:'📺 TV'};
export function projectRoomQuickPicks(rooms:EnvironmentRoomOperations[]):EnvironmentQuickPicksView {
  const used=new Set(rooms.map(room=>(room.name||'').trim().toLowerCase()));
  return {screen:false,label:rooms.length?'Add':'Start with',roomId:undefined,choices:roomNames.filter(name=>!used.has(name.toLowerCase())).map(name=>({name,label:name}))};
}
export function projectScreenQuickPicks(screens:EnvironmentScreenReader[],roomId:unknown=null,preferred=['phone','laptop','monitor','tablet','tv']):EnvironmentQuickPicksView {
  const existing=new Set(screens.filter(screen=>(screen.roomId||null)===(roomId||null)).map(screen=>screen.device));
  return {screen:true,label:existing.size?'Add':'Start with',roomId:environmentActionValue(roomId),choices:preferred.filter(device=>!existing.has(device)).map(device=>({device,label:devices[device]||device}))};
}
export function roomMeasurementTools(name:string) {
  const tools=[{key:'lux',label:'📏 Brightness',title:'Eye-level photopic lux from a sensor, meter entry, or calibrated camera'},
    {key:'flicker',label:'⚡ Banding',title:'Screen for camera-visible rolling-shutter banding'},
    {key:'spectrum',label:'🔬 Light type',title:'Qualitative warm, cool, and mixed camera pattern'},
    {key:'cct',label:'🎨 Warm / cool',title:'Approximate warm/cool camera estimate—not a spectrometer'}];
  if(/bedroom|sleep/i.test(name))tools.push({key:'darkness',label:'🌙 Sleep light',title:'Qualitative camera darkness check or enter a meter reading'});
  return tools;
}
const toolIcons:Record<string,string>={lux:'📏',flicker:'⚡',cct:'🎨',darkness:'🌙',spectrum:'🔬','glass-transmission':'🪟',audit:'👁','brightness-proxy':'◐'};
export function environmentReadingIcon(tool:string){return Object.hasOwn(toolIcons,tool)?toolIcons[tool]||'·':'·';}
export function formatEnvironmentMeasureValue(m: EnvironmentMeasurementOperations) {
  if (m.tool === 'lux') {
    const value = Math.round(m.value).toLocaleString();
    if (m.extra?.source === 'camera-estimate') return `~${value} lux (camera estimate)`;
    if (['AmbientLightSensor', 'manual-entry', 'meter-entry'].includes(m.extra?.source as string)) return `${value} lux`;
    return `${value} lux (method unknown)`;
  }
  if (m.tool === 'flicker') return ['no banding detected', 'some banding', 'clear banding', 'strong banding'][Math.min(m.value || 0, 3)];
  if (m.tool === 'cct') return `~${Math.round(m.value / 100) * 100} K (camera)`;
  if (m.tool === 'darkness') {
    if (m.extra?.method === 'camera-relative') return `${m.extra?.levelLabel || 'Qualitative'} camera check`;
    const value = m.value < 1 ? Number(m.value).toFixed(2) : Math.round(m.value);
    if (m.extra?.method === 'meter-entry' || m.extra?.source === 'meter-entry') return `${value} lux (meter)`;
    return `${value} legacy value (method unknown)`;
  }
  if (m.tool === 'brightness-proxy') return `${m.extra?.levelLabel || 'Relative brightness'} (camera comparison)`;
  if (m.tool === 'spectrum') return String(m.value);
  if (m.tool === 'glass-transmission') return `~${Math.round((m.value || 0) * 100)}% camera-visible comparison`;
  if (m.tool === 'audit') {
    const n = Number.isFinite(m.value) ? m.value : (m?.extra?.rooms?.length || 0);
    return `${n} room snapshot${n === 1 ? '' : 's'}`;
  }
  return String(m.value);
}

export function formatEnvironmentMeasureTime(ts: number) {
  const days = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
