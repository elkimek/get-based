// Serializable authored-detail acceptance data, isolated from real user profiles.
export function seedNutritionMealDetail(defaults: Record<string, unknown> = {}) {
  if (!['http:', 'https:'].includes(location.protocol)) return;
  localStorage.setItem('labcharts-ai-paused','true');localStorage.setItem('labcharts-default-lastViewV1','insight');
  if(localStorage.getItem('nutrition-detail-seeded'))return;localStorage.setItem('nutrition-detail-seeded','1');
  const now=new Date();now.setHours(12,0,0,0);const stamp=now.toISOString();
  const localDate=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const thumbnailUrl='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGPIbqwEIgYIBQAm4gWVtoQhMAAAAABJRU5ErkJggg==';
  const base={eatenAt:stamp,localDate,localTimeMinutes:720,createdAt:stamp,updatedAt:stamp,reviewed:true};
  localStorage.setItem('labcharts-default-imported',JSON.stringify({...defaults,entries:[],notes:[],contextNotes:'Keep detail notes',contextSourceSettings:{'meals-nutrition':false},nutritionMeals:[
    {...base,id:'detail-owned',name:'Reviewed detail lunch',mealType:'lunch',note:'Keep this meal note',nutrients:{energyKcal:620,proteinG:0,carbohydrateG:72,fatG:28,ironMg:2.5},
      components:[{name:'Reviewed rice',quantityG:150},{name:'Unspecified amount'}],images:[{thumbnailUrl},{thumbnailUrl}],assumptions:['Reviewed serving'],warnings:['Check remaining label'],
      source:{kind:'ai-label-scan',model:'fixture-model',modelDisplay:'Fixture vision',provider:'ollama',usage:{inputTokens:100,outputTokens:50},review:{editedPortions:1,editedNutrients:['proteinG']},label:{servingSizeText:'150 g',consumedAmount:1,consumedUnit:'serving'}}},
    {...base,id:'detail-water',name:'Earlier water',mealType:'drink',nutrients:{fluidMl:250,plainWaterMl:250},source:{kind:'manual-water'},images:[]},
  ]}));
}
