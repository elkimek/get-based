// Ordered encrypted meal row retrieval; opaque limits retain the original cursor.
interface MealReadOptions { since: unknown; limit: unknown }
type BatchIndex<Row> = IDBIndex & {
  getAllRecords?: (this: IDBIndex, options: {query: IDBKeyRange | null; count: number; direction: 'prev'}) => IDBRequest<{readonly value: Row}[]>;
};
const STORE_MEALS = 'meals';

export function readNutritionMealRows<Row>(db: IDBDatabase, {since, limit}: MealReadOptions): Promise<Row[]> {
  return new Promise<Row[]>((resolve, reject) => {
    const index = db.transaction(STORE_MEALS, 'readonly').objectStore(STORE_MEALS).index('by_eaten_at');
    const range = since && typeof IDBKeyRange !== 'undefined' ? IDBKeyRange.lowerBound(String(since)) : null;
    // Zero means unbounded to IndexedDB; keep all legacy coercions in the cursor.
    if (typeof limit === 'number' && Number.isSafeInteger(limit) && limit > 0 && limit <= 0xffffffff) {
      const getAllRecords = (index as BatchIndex<Row>).getAllRecords;
      if (typeof getAllRecords === 'function') {
        const request = getAllRecords.call(index, {query: range, count: limit, direction: 'prev'});
        request.onsuccess = () => {
          try { resolve(request.result.map(record => record.value)); }
          catch (error) { reject(error); }
        };
        request.onerror = () => reject(request.error);
        return;
      }
    }
    const request = index.openCursor(range, 'prev');
    const found: Row[] = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor && found.length < Math.max(1, Number(limit) || 500)) {
        found.push(cursor.value);
        cursor.continue();
      } else {
        resolve(found);
      }
    };
    request.onerror = () => reject(request.error);
  });
}
