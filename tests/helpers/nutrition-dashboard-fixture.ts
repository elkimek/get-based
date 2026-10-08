// Serializable browser fixture: two food days and two distinct beverage categories.
export function seedNutritionDashboard() {
  if (!['http:', 'https:'].includes(location.protocol)) return;
  localStorage.setItem('labcharts-ai-paused', 'true');
  localStorage.setItem('labcharts-default-lastViewV1', 'insight');
  if (localStorage.getItem('nutrition-dashboard-seeded')) return;
  localStorage.setItem('nutrition-dashboard-seeded', '1');
  // Fuel Mix is optional on Dashboard; enable it explicitly for both-route acceptance.
  localStorage.setItem('labcharts-default-dashboardWidgetsV13', JSON.stringify({ order: ['nutrition','nutrition-fuel-mix'], hidden: [] }));
  const nutritionMeals = [1, 2].flatMap(offset => {
    const date = new Date(); date.setDate(date.getDate() - offset); date.setHours(12, 0, 0, 0);
    const stamp = date.toISOString(), localDate = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const base = { eatenAt: stamp, localDate, localTimeMinutes: 720, reviewed: true, createdAt: stamp, updatedAt: stamp, images: [] };
    return [{ ...base, id: `dashboard-food-${offset}`, name: `Dashboard lunch ${offset}`, mealType: 'lunch', nutrients: { energyKcal: 640, proteinG: 38, carbohydrateG: 72, fatG: 18, fiberG: 8 }, source: { kind: 'manual' } },
      { ...base, id: `dashboard-drink-${offset}`, name: offset === 1 ? 'Water' : 'Tea', mealType: 'drink', nutrients: offset === 1 ? { fluidMl: 350, plainWaterMl: 350 } : { fluidMl: 275.5 }, source: { kind: offset === 1 ? 'manual-water' : 'manual-beverage' } }];
  });
  localStorage.setItem('labcharts-default-imported', JSON.stringify({ entries: [], notes: [], contextNotes: 'Keep dashboard notes', nutritionMeals,
    wearableSummary: { metrics: { weight: { latest: 80, primarySource: 'fitbit' } } },
    nutritionTargets: { configured: true, proteinBasis: 'active', widgetNutrients: ['proteinG','fiberG','fluidMl','ironMg'] } }));
}
