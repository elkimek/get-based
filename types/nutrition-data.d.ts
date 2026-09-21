/** Canonical persisted meal metadata; images contain bounded thumbnails only. */
export interface MealImage {
  thumbnailUrl: string;
  mediaType?: string;
  fileName?: string;
  width?: number;
  height?: number;
  originalWidth?: number;
  originalHeight?: number;
  qualityWarnings?: string[];
}
export interface MealComponent {
  name: string;
  quantityG?: number | null;
  nutrients?: Record<string, number | null>;
  nutrientsPer100g?: Record<string, number | null>;
  [key: string]: unknown;
}
export interface NutritionMeal {
  id: string;
  eatenAt: string;
  createdAt?: string;
  updatedAt?: string;
  name?: string;
  reviewed?: boolean;
  mealType?: string;
  note?: string;
  nutrients?: Record<string, number | null>;
  components?: MealComponent[];
  images?: MealImage[];
  confidence?: number | null;
  responseCheckIn?: { satiety2h?: number; energy2h?: number; recordedAt?: string };
  [key: string]: unknown;
}
