import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { readProfileForLoad } from '../js/profile-load-safety.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as crypto from '../js/crypto.js';
import * as store from '../js/nutrition-store.js';
import { createNutritionMealDetailSession } from '../js/nutrition-meal-detail-session.js';
const profile='nutrition-owned-detail', key=profileStorageKey(profile,'imported');
const previous={profile:state.currentProfile,data:state.importedData,summary:state.nutritionSummary};
let meal: NonNullable<Awaited<ReturnType<typeof store.getActiveProfileMeal>>>;
const stored=async()=>JSON.parse((await crypto.encryptedGetItem(key))!);
beforeEach(async()=>{
 state.currentProfile=profile;state.importedData=createDefaultProfileData();await crypto.encryptedRemoveItem(key);expect(await saveImportedData()).toBe(true);
 meal=await store.saveActiveProfileMeal({name:'Owned meal',note:'Unchanged note',eatenAt:new Date().toISOString(),nutrients:{energyKcal:500,proteinG:20,carbohydrateG:50,fatG:20},source:{kind:'manual'},reviewed:true});
});
afterEach(async()=>{vi.restoreAllMocks();vi.useRealTimers();await store.deleteNutritionDB(profile);await crypto.encryptedRemoveItem(key);state.currentProfile=previous.profile;state.importedData=previous.data;state.nutritionSummary=previous.summary;});
it('commits and clears check-ins in canonical and encrypted meal storage without changing other meal data or AI context',async()=>{
 const session=createNutritionMealDetailSession(meal,()=>true),saved=await session.save({satiety2h:3,energy2h:2});expect(saved?.responseCheckIn).toMatchObject({satiety2h:3,energy2h:2});
 expect((await stored()).nutritionMeals[0].responseCheckIn).toMatchObject({satiety2h:3,energy2h:2});expect((await store.getNutritionMeal(profile,meal.id))?.responseCheckIn).toMatchObject({satiety2h:3,energy2h:2});
 expect(state.nutritionSummary?.contextByDays?.d30).not.toContain('satiety');
 const cleared=await createNutritionMealDetailSession(saved!,()=>true).save(null);expect(cleared).not.toHaveProperty('responseCheckIn');expect(cleared?.note).toBe('Unchanged note');expect((await stored()).nutritionMeals[0]).not.toHaveProperty('responseCheckIn');
});
it('retains storage and permits retry after a failed canonical write',async()=>{
 const session=createNutritionMealDetailSession(meal,()=>true),before=await stored();const write=vi.spyOn(crypto,'encryptedSetItem').mockRejectedValueOnce(new Error('Write failed'));
 expect(await session.save({satiety2h:3,energy2h:null})).toBeNull();expect(session.failureMessage()).toContain('cross-device copy');expect(await stored()).toEqual(before);
 write.mockRestore();expect(await session.save({satiety2h:3,energy2h:null})).toHaveProperty('responseCheckIn.satiety2h',3);
});
it('rejects retired ownership and profile switches during an outstanding meal read',async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});vi.spyOn(store,'getActiveProfileMeal').mockImplementationOnce(async()=>{await gate;return meal;});
 const session=createNutritionMealDetailSession(meal,()=>true),pending=session.save({satiety2h:2,energy2h:1});
 expect(await session.save({satiety2h:1,energy2h:1})).toBeNull();session.retire();state.currentProfile='other-detail';state.importedData=createDefaultProfileData();release();expect(await pending).toBeNull();
 expect((await stored()).nutritionMeals[0]).not.toHaveProperty('responseCheckIn');expect(state.importedData.nutritionMeals||[]).toEqual([]);
});
it('finishes an accepted write on the captured profile after its owner retires',async()=>{
 const original=crypto.encryptedSetItem;let release!:()=>void,entered=false;const gate=new Promise<void>(resolve=>{release=resolve;});
 vi.spyOn(crypto,'encryptedSetItem').mockImplementation(async(...args)=>{entered=true;await gate;return original(...args);});
 const session=createNutritionMealDetailSession(meal,()=>true),pending=session.save({satiety2h:3,energy2h:2});await vi.waitFor(()=>expect(entered).toBe(true));
 session.retire();state.currentProfile='other-accepted-detail';state.importedData=createDefaultProfileData();state.importedData.contextNotes='Other profile';release();expect(await pending).not.toBeNull();
 expect((await stored()).nutritionMeals[0].responseCheckIn).toMatchObject({satiety2h:3,energy2h:2});expect(state.importedData.contextNotes).toBe('Other profile');expect(state.importedData.nutritionMeals||[]).toEqual([]);expect(await session.save(null)).toBeNull();
});
it('requires a fresh view after a peer meal update and respects route retirement after a read',async()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(Date.now()+5000);await store.saveActiveProfileMeal({...meal,note:'Peer note'});
 const session=createNutritionMealDetailSession(meal,()=>true);expect(await session.save({satiety2h:3,energy2h:2})).toBeNull();expect(session.failureMessage()).toContain('changed elsewhere');expect((await stored()).nutritionMeals[0].note).toBe('Peer note');
 let current=true,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});vi.spyOn(store,'getActiveProfileMeal').mockImplementationOnce(async()=>{await gate;return meal;});
 const routed=createNutritionMealDetailSession(meal,()=>current),pending=routed.save(null);current=false;release();expect(await pending).toBeNull();
});
it('blocks check-in writes when the captured profile has a failed read',async()=>{
 await expect(readProfileForLoad(profile,()=>Promise.reject(new Error('Read failed')),()=>{})).rejects.toThrow('Read failed');
 try{const session=createNutritionMealDetailSession(meal,()=>true);expect(await session.save({satiety2h:2,energy2h:null})).toBeNull();expect(session.failureMessage()).toContain('could not be read safely');}
 finally{await readProfileForLoad(profile,()=>undefined,()=>{});}
});
