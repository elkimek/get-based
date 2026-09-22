import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { clearNutritionMeals, deleteNutritionDB, getNutritionMeal, listNutritionMeals, openNutritionDB,
  putNutritionMeal, restoreNutritionArchive, requestPersistentNutritionStorage,
  setLocalNutritionComparison, getLocalNutritionComparison, setLocalNutritionSummary,
  getLocalNutritionSummary, buildNutritionArchive } from '../js/nutrition-store.js';
let profile;
const meal = (id='valid') => ({id,name:'Lunch',eatenAt:'2026-09-22T12:00:00.000Z'});
const image = () => ({thumbnailUrl:'data:image/png;base64,YQ==',mediaType:'image/png'});
beforeEach(() => { profile=`nutrition-boundary-${crypto.randomUUID()}`; state.currentProfile='other'; });
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await deleteNutritionDB(profile); });
it.each([
  ['version', {version:2,meals:[]}], ['collection',{version:1,meals:{}}],
  ['null record',{version:1,meals:[null]}], ['array record',{version:1,meals:[[]]}],
  ['long name',{version:1,meals:[{...meal(),name:'x'.repeat(121)}]}],
  ['missing name',{version:1,meals:[{...meal(),name:null}]}],
  ['unsafe id',{version:1,meals:[{...meal(),id:'../meal'}]}],
  ['date',{version:1,meals:[{...meal(),eatenAt:'yesterday'}]}],
  ['photo collection',{version:1,meals:[{...meal(),images:{}}]}],
  ['photo count',{version:1,meals:[{...meal(),images:Array.from({length:5},image)}]}],
  ['ingredient count',{version:1,meals:[{...meal(),components:Array(101).fill({name:'x'})}]}],
])('rejects invalid archive %s without modifying existing meals', async (_label,archive) => {
  await putNutritionMeal(profile,meal('existing'));
  await expect(restoreNutritionArchive(profile,archive)).rejects.toThrow();
  expect((await listNutritionMeals(profile)).map(m=>m.id)).toEqual(['existing']);
});
it.each([
  ['remote thumbnail',{thumbnailUrl:'https://example.com/image.png'}],
  ['SVG',{thumbnailUrl:'data:image/svg+xml;base64,YQ=='}],
  ['empty image',{thumbnailUrl:'data:image/png;base64,'}],
  ['malformed base64',{thumbnailUrl:'data:image/png;base64,Y'}],
  ['media mismatch',{mediaType:'image/jpeg'}],
  ['long filename',{fileName:'x'.repeat(161)}],
  ['negative width',{width:-1}], ['infinite height',{height:Infinity}],
  ['large original width',{originalWidth:50001}], ['invalid original height',{originalHeight:'invalid'}],
])('validates %s before writing any archive row', async (_label,invalid) => {
  const archive={version:1,meals:[meal('first'),{...meal('bad'),images:[{...image(),...invalid}]}]};
  await expect(restoreNutritionArchive(profile,archive)).rejects.toThrow();
  await expect(listNutritionMeals(profile)).resolves.toEqual([]);
});
it('empty or missing archives do not delete existing data', async () => {
  await putNutritionMeal(profile,meal());
  await expect(restoreNutritionArchive(profile,null)).resolves.toBe(0);
  await expect(restoreNutritionArchive(profile,{version:1,meals:[]})).resolves.toBe(0);
  await expect(getNutritionMeal(profile,'valid')).resolves.toMatchObject(meal());
});
it('clear removes meals but preserves encrypted summary and comparison metadata', async () => {
  await putNutritionMeal(profile,meal()); await setLocalNutritionSummary(profile,{totalMeals:1});
  await setLocalNutritionComparison(profile,{winner:'model'}); await clearNutritionMeals(profile);
  await expect(listNutritionMeals(profile)).resolves.toEqual([]);
  await expect(getLocalNutritionSummary(profile)).resolves.toEqual({totalMeals:1});
  await expect(getLocalNutritionComparison(profile)).resolves.toEqual({winner:'model'});
});
it('clearing a comparison does not remove meals', async () => {
  await putNutritionMeal(profile,meal()); await setLocalNutritionComparison(profile,{winner:'model'});
  await expect(setLocalNutritionComparison(profile,null)).resolves.toBeNull();
  await expect(getLocalNutritionComparison(profile)).resolves.toBeNull();
  await expect(getNutritionMeal(profile,'valid')).resolves.toMatchObject(meal());
});
it('range and limit select the newest matching meals', async () => {
  for(const day of [20,21,22]) await putNutritionMeal(profile,{...meal(`day-${day}`),eatenAt:`2026-09-${day}T12:00:00.000Z`});
  expect((await listNutritionMeals(profile,{since:'2026-09-21',limit:1})).map(m=>m.id)).toEqual(['day-22']);
  expect((await listNutritionMeals(profile,{since:'2026-09-21'})).map(m=>m.id)).toEqual(['day-22','day-21']);
});
it('a transaction abort does not report a successful clear or delete existing meals', async () => {
  await putNutritionMeal(profile,meal()); const db=await openNutritionDB(profile);
  const transaction=db.transaction.bind(db);
  vi.spyOn(db,'transaction').mockImplementation((...args) => { const tx=transaction(...args); if(args[1]==='readwrite') queueMicrotask(()=>tx.abort()); return tx; });
  await expect(clearNutritionMeals(profile)).rejects.toThrow();
  await expect(getNutritionMeal(profile,'valid')).resolves.toMatchObject(meal());
});
it('a transaction abort does not report a successful meal write', async () => {
  await putNutritionMeal(profile,meal()); const db=await openNutritionDB(profile); const transaction=db.transaction.bind(db);
  vi.spyOn(db,'transaction').mockImplementation((...args) => { const tx=transaction(...args); if(args[1]==='readwrite') queueMicrotask(()=>tx.abort()); return tx; });
  await expect(putNutritionMeal(profile,{...meal(),name:'replacement'})).rejects.toThrow();
  await expect(getNutritionMeal(profile,'valid')).resolves.toMatchObject({name:'Lunch'});
});
it('archive export refuses corrupted rows rather than silently omitting them', async () => {
  const db=await openNutritionDB(profile); await new Promise((resolve,reject)=>{ const tx=db.transaction('meals','readwrite'); tx.objectStore('meals').put(meal()); tx.oncomplete=resolve; tx.onerror=reject; });
  await expect(buildNutritionArchive(profile)).rejects.toThrow(/payload/);
});
it.each([true,false])('returns browser persistence decision %s', async decision => {
  const persist=vi.fn().mockResolvedValue(decision); vi.stubGlobal('navigator',{storage:{persist}});
  await expect(requestPersistentNutritionStorage()).resolves.toBe(decision); expect(persist).toHaveBeenCalledOnce();
});
it('storage permission rejection remains non-fatal', async () => {
  vi.stubGlobal('navigator',{storage:{persist:vi.fn().mockRejectedValue(new Error('denied'))}});
  await expect(requestPersistentNutritionStorage()).resolves.toBe(false);
});
it('missing persistence API remains non-fatal', async () => {
  vi.stubGlobal('navigator',{}); await expect(requestPersistentNutritionStorage()).resolves.toBe(false);
});
